import { inflateRawSync } from "node:zlib";
import { readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

type TopicNode = {
  title: string;
  notes: string[];
  children: TopicNode[];
};

type Sheet = {
  title: string;
  root: TopicNode;
};

type ZipEntry = {
  compressedSize: number;
  localOffset: number;
  method: number;
  name: string;
  uncompressedSize: number;
};

const MAX_XMIND_BYTES = 25 * 1024 * 1024;
const MAX_ENTRY_BYTES = 50 * 1024 * 1024;

export default {
  description: "將 Project 中的 XMind .xmind binary 轉成同名 Markdown artifact。",
  input: {
    type: "object",
    properties: {
      filePath: { type: "string", minLength: 1, description: "Project 中 .xmind 檔案的相對路徑。" },
      outputPath: { type: "string", minLength: 1, description: "可選的 Markdown 輸出相對路徑，預設為同名 .md。" },
      overwrite: { type: "boolean", default: false, description: "是否覆寫既有 Markdown，預設為 false。" },
    },
    required: ["filePath"],
    additionalProperties: false,
  },
  async execute(args: { filePath: string; outputPath?: string; overwrite?: boolean }, context: { directory: string; worktree?: string }) {
    const root = resolve(context.worktree || context.directory);
    const overwrite = args.overwrite ?? false;
    const inputPath = resolveProjectPath(root, args.filePath);
    if (!args.filePath.toLowerCase().endsWith(".xmind")) {
      throw new Error("filePath 必須是 .xmind 檔案。");
    }

    const inputInfo = await stat(inputPath);
    if (!inputInfo.isFile()) throw new Error(`找不到 XMind 檔案：${args.filePath}`);
    if (inputInfo.size > MAX_XMIND_BYTES) throw new Error("XMind 檔案不可超過 25MB。");

    const archive = await readFile(inputPath);
    const markdown = convertXmind(archive, args.filePath);
    const outputRelative = args.outputPath ?? args.filePath.replace(/\.xmind$/i, ".md");
    if (!outputRelative.toLowerCase().endsWith(".md")) throw new Error("outputPath 必須是 .md 檔案。");
    const outputPath = resolveProjectPath(root, outputRelative);

    if (!overwrite && await pathExists(outputPath)) {
      return {
        content: `${outputRelative} 已存在。若使用者明確要求覆寫，請再次呼叫並設定 overwrite=true。`,
        metadata: { title: "Markdown 已存在，未覆寫" },
      };
    }

    await writeFile(outputPath, markdown, "utf8");
    const normalizedOutput = relative(root, outputPath).replaceAll("\\", "/");
    return {
      content: `已建立 ${normalizedOutput}。原始 ${args.filePath} 保持不變。`,
      metadata: {
        title: "XMind 已轉換為 Markdown",
        input: args.filePath,
        output: normalizedOutput,
        sheetCount: countSheets(markdown),
      },
    };
  },
};

function resolveProjectPath(root: string, candidate: string): string {
  const target = resolve(root, candidate);
  const child = relative(root, target);
  if (child === "" || isAbsolute(child) || child === ".." || child.startsWith(`..\\`) || child.startsWith("../")) {
    throw new Error("檔案路徑必須位於目前 Project 內。");
  }
  return target;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function convertXmind(archive: Buffer, sourceName: string): string {
  const jsonEntry = readZipEntry(archive, "content.json");
  if (jsonEntry) {
    try {
      return renderMarkdown(parseJsonSheets(JSON.parse(jsonEntry.toString("utf8"))), sourceName);
    } catch (error) {
      throw new Error(`content.json 無法解析：${errorMessage(error)}`);
    }
  }

  const xmlEntry = readZipEntry(archive, "content.xml");
  if (xmlEntry) {
    return renderMarkdown(parseXmlSheets(xmlEntry.toString("utf8")), sourceName);
  }

  throw new Error("XMind package 缺少 content.json 或 content.xml。");
}

function readZipEntry(archive: Buffer, wantedName: string): Buffer | undefined {
  const end = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(end + 10);
  const centralSize = archive.readUInt32LE(end + 12);
  const centralOffset = archive.readUInt32LE(end + 16);
  if (centralOffset + centralSize > end) throw new Error("XMind ZIP central directory bounds are invalid。");

  let offset = centralOffset;
  const wanted = wantedName.toLowerCase();
  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error("XMind ZIP central directory is invalid。");
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8").replaceAll("\\", "/");
    const entry: ZipEntry = { compressedSize, localOffset, method, name, uncompressedSize };
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.toLowerCase() !== wanted) continue;
    return inflateZipEntry(archive, entry);
  }
  return undefined;
}

function inflateZipEntry(archive: Buffer, entry: ZipEntry): Buffer {
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`XMind entry 過大：${entry.name}`);
  if (archive.readUInt32LE(entry.localOffset) !== 0x04034b50) throw new Error(`XMind ZIP local entry invalid：${entry.name}`);
  const nameLength = archive.readUInt16LE(entry.localOffset + 26);
  const extraLength = archive.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > archive.length) throw new Error(`XMind ZIP entry out of bounds：${entry.name}`);
  const compressed = archive.subarray(start, end);
  if (entry.method === 0) return Buffer.from(compressed);
  if (entry.method === 8) return inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES });
  throw new Error(`XMind ZIP compression method unsupported：${entry.method}`);
}

function findEndOfCentralDirectory(archive: Buffer): number {
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65_557); offset -= 1) {
    if (archive.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = archive.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === archive.length) return offset;
  }
  throw new Error("不是有效的 XMind ZIP package。");
}

function parseJsonSheets(value: unknown): Sheet[] {
  const candidates = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.sheets)
      ? value.sheets
      : [value];
  const sheets: Sheet[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!isRecord(candidate)) continue;
    const rawRoot = candidate.rootTopic ?? candidate.root_topic ?? candidate.root ?? candidate.topic;
    const root = toTopic(rawRoot);
    if (!root) continue;
    sheets.push({
      title: textValue(candidate.title) ?? textValue(candidate.name) ?? `Sheet ${index + 1}`,
      root,
    });
  }
  if (sheets.length > 0) return sheets;
  const root = toTopic(value);
  return root ? [{ title: root.title, root }] : [];
}

function toTopic(value: unknown, seen = new Set<object>()): TopicNode | undefined {
  if (!isRecord(value) || seen.has(value)) return undefined;
  seen.add(value);
  const title = textValue(value.title) ?? textValue(value.topicTitle) ?? textValue(value.name) ?? "Untitled topic";
  const notes = toTextList(value.notes ?? value.note);
  const children: TopicNode[] = [];
  const containers = [value.children, value.subtopics, value.topics, value.childTopics];
  for (const container of containers) {
    const values = isRecord(container)
      ? [container.attached, container.detached, container.items].flatMap((item) => Array.isArray(item) ? item : item ? [item] : [])
      : Array.isArray(container) ? container : container ? [container] : [];
    for (const child of values) {
      const topic = toTopic(child, seen);
      if (topic) children.push(topic);
    }
  }
  return { title: cleanText(title), notes, children };
}

function parseXmlSheets(xml: string): Sheet[] {
  const sheetMatches = [...xml.matchAll(/<sheet\b[^>]*>([\s\S]*?)<\/sheet>/gi)];
  const bodies = sheetMatches.length > 0 ? sheetMatches.map((match) => match[1] ?? "") : [xml];
  return bodies.flatMap((body, index) => {
    const root = parseXmlTopic(body);
    return root ? [{ title: cleanText(xmlTagText(body, "title") ?? `Sheet ${index + 1}`), root }] : [];
  });
}

function parseXmlTopic(xml: string): TopicNode | undefined {
  const tokenPattern = /<topic\b[^>]*>|<\/topic>|<title\b[^>]*>([\s\S]*?)<\/title>|<notes\b[^>]*>([\s\S]*?)<\/notes>/gi;
  const stack: TopicNode[] = [];
  let root: TopicNode | undefined;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(xml)) !== null) {
    const token = match[0].toLowerCase();
    if (token.startsWith("<topic") && !token.startsWith("</")) {
      const topic: TopicNode = { title: "Untitled topic", notes: [], children: [] };
      if (stack.length > 0) stack[stack.length - 1]!.children.push(topic);
      else root = topic;
      stack.push(topic);
      continue;
    }
    if (token === "</topic>") {
      stack.pop();
      continue;
    }
    const current = stack[stack.length - 1];
    if (!current) continue;
    if (match[1] !== undefined) current.title = cleanText(decodeXml(stripTags(match[1])));
    if (match[2] !== undefined) current.notes.push(cleanText(decodeXml(stripTags(match[2]))));
  }
  return root;
}

function renderMarkdown(sheets: Sheet[], sourceName: string): string {
  if (sheets.length === 0) throw new Error(`${sourceName} 中找不到可轉換的 topic。`);
  const lines = ["<!-- Generated by xmind. Original XMind file is preserved. -->", ""];
  for (const sheet of sheets) {
    lines.push(`# ${cleanText(sheet.title)}`, "");
    appendTopic(lines, sheet.root, 0);
    lines.push("");
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function appendTopic(lines: string[], topic: TopicNode, depth: number): void {
  const indent = "  ".repeat(depth);
  lines.push(`${indent}- ${topic.title}`);
  for (const note of topic.notes) lines.push(`${indent}  > ${note}`);
  for (const child of topic.children) appendTopic(lines, child, depth + 1);
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textValue).filter((item): item is string => Boolean(item)).join(" ") || undefined;
  if (!isRecord(value)) return undefined;
  for (const key of ["text", "content", "plain", "value", "title"]) {
    const result = textValue(value[key]);
    if (result) return result;
  }
  return undefined;
}

function toTextList(value: unknown): string[] {
  const text = textValue(value);
  return text ? [cleanText(text)] : [];
}

function xmlTagText(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  return match?.[1] ? decodeXml(stripTags(match[1])) : undefined;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function cleanText(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim() || "Untitled topic";
}

function countSheets(markdown: string): number {
  return markdown.split(/\r?\n/).filter((line) => line.startsWith("# ")).length;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
