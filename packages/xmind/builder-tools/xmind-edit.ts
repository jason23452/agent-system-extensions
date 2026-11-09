import { deflateRawSync, inflateRawSync } from "node:zlib";
import { readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

type TopicNode = {
  id: string;
  title: string;
  note?: string;
  hyperlink?: string;
  taskStatus?: "todo" | "doing" | "done";
  children: TopicNode[];
};

type Document = { id: string; title: string; roots: TopicNode[]; warnings: string[] };
type ArchiveEntry = { name: string; content: Buffer };
type Operation = { op?: string; nodeId?: string; parentId?: string; index?: number; title?: string; note?: string; hyperlink?: string; taskStatus?: string };

const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_OPERATIONS = 100;

export default {
  description: "Read and safely edit XMind .xmind files. Edit output defaults to .edited.xmind and .edited.md.",
  input: {
    type: "object",
    properties: {
      mode: { type: "string", enum: ["read", "edit"], default: "read", description: "read or edit" },
      filePath: { type: "string", minLength: 1, description: "Project-relative .xmind path" },
      operations: { type: "string", description: "JSON array of edit operations" },
      outputPath: { type: "string", minLength: 1, description: "Optional .xmind output path" },
      markdownOutputPath: { type: "string", minLength: 1, description: "Optional Markdown output path" },
      overwrite: { type: "boolean", default: false, description: "Explicitly allow overwriting outputs or the source" },
    },
    required: ["filePath"],
    additionalProperties: false,
  },
  async execute(args: { mode?: "read" | "edit"; filePath: string; operations?: string; outputPath?: string; markdownOutputPath?: string; overwrite?: boolean }, context: { directory: string; worktree?: string }) {
    const root = resolve(context.worktree || context.directory);
    const mode = args.mode ?? "read";
    const overwrite = args.overwrite ?? false;
    if (!args.filePath.toLowerCase().endsWith(".xmind")) throw new Error("filePath must end with .xmind.");
    const inputPath = projectPath(root, args.filePath);
    const inputInfo = await stat(inputPath);
    if (!inputInfo.isFile()) throw new Error(`XMind file was not found: ${args.filePath}`);
    if (inputInfo.size > MAX_ARCHIVE_BYTES) throw new Error("XMind archive exceeds 25MB.");

    const archive = await readFile(inputPath);
    const document = parseDocument(archive, args.filePath);
    if (mode === "read") return { content: JSON.stringify({ ...document, nodeCount: countNodes(document.roots) }) };
    if (mode !== "edit") throw new Error("mode must be read or edit.");

    const operations = parseOperations(args.operations);
    applyOperations(document.roots, operations);
    const outputRelative = args.outputPath ?? (overwrite ? args.filePath : args.filePath.replace(/\.xmind$/i, ".edited.xmind"));
    const markdownRelative = args.markdownOutputPath ?? outputRelative.replace(/\.xmind$/i, ".md");
    if (!outputRelative.toLowerCase().endsWith(".xmind")) throw new Error("outputPath must end with .xmind.");
    if (!markdownRelative.toLowerCase().endsWith(".md")) throw new Error("markdownOutputPath must end with .md.");
    if (!overwrite && outputRelative === args.filePath) throw new Error("Set overwrite=true to replace the source XMind file.");
    const outputPath = projectPath(root, outputRelative);
    const markdownPath = projectPath(root, markdownRelative);
    if (!overwrite && (await exists(outputPath) || await exists(markdownPath))) throw new Error("An output file already exists; set overwrite=true to replace it.");

    await writeFile(outputPath, createArchive(archive, document));
    await writeFile(markdownPath, toMarkdown(document), "utf8");
    const output = relative(root, outputPath).replaceAll("\\", "/");
    const markdown = relative(root, markdownPath).replaceAll("\\", "/");
    return {
      content: JSON.stringify({ output, markdown, operations: operations.length, nodeCount: countNodes(document.roots), warnings: document.warnings }),
      metadata: { title: "XMind updated", input: args.filePath, output, markdown, operations: operations.length },
    };
  },
};

function parseDocument(archive: Buffer, source: string): Document {
  const entries = readArchive(archive);
  const json = entries.find((entry) => entry.name.toLowerCase() === "content.json");
  const xml = entries.find((entry) => entry.name.toLowerCase() === "content.xml");
  let roots: TopicNode[];
  if (json) {
    try { roots = parseJson(JSON.parse(json.content.toString("utf8"))); } catch (error) { throw new Error(`content.json is invalid: ${message(error)}`); }
  } else if (xml) {
    roots = parseXml(xml.content.toString("utf8"));
  } else {
    throw new Error("XMind archive has no content.json or content.xml.");
  }
  if (roots.length === 0) throw new Error(`${source} has no editable topics.`);
  return { id: slug(source.replace(/\.xmind$/i, "")), title: roots[0]!.title, roots, warnings: [] };
}

function parseJson(value: unknown): TopicNode[] {
  const sheets = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.sheets) ? value.sheets : [value];
  const roots: TopicNode[] = [];
  sheets.forEach((sheet, index) => {
    if (!isRecord(sheet)) return;
    const root = topic(sheet.rootTopic ?? sheet.root_topic ?? sheet.root ?? sheet.topic, `sheet-${index + 1}-root`);
    if (root) roots.push(root);
  });
  if (roots.length > 0) return roots;
  const root = topic(value, "root");
  return root ? [root] : [];
}

function topic(value: unknown, fallback: string, seen = new Set<object>()): TopicNode | undefined {
  if (!isRecord(value) || seen.has(value)) return undefined;
  seen.add(value);
  const id = text(value.id) ?? text(value.topicId) ?? fallback;
  const children: TopicNode[] = [];
  for (const container of [value.children, value.subtopics, value.topics, value.childTopics]) {
    const values = isRecord(container)
      ? [container.attached, container.detached, container.items].flatMap((item) => Array.isArray(item) ? item : item ? [item] : [])
      : Array.isArray(container) ? container : container ? [container] : [];
    values.forEach((child, index) => {
      const parsed = topic(child, `${id}-${index + 1}`, seen);
      if (parsed) children.push(parsed);
    });
  }
  const status = normalizeStatus(text(value.taskStatus) ?? text(value.marker) ?? text(value.markers));
  const note = text(value.notes ?? value.note);
  const hyperlink = text(value.hyperlink) ?? text(value.href) ?? text(value.url);
  return {
    id,
    title: clean(text(value.title) ?? text(value.topicTitle) ?? text(value.name) ?? "Untitled topic"),
    ...(note ? { note: clean(note) } : {}),
    ...(hyperlink ? { hyperlink } : {}),
    ...(status ? { taskStatus: status } : {}),
    children,
  };
}

function parseXml(xml: string): TopicNode[] {
  const bodies = [...xml.matchAll(/<sheet\b[^>]*>([\s\S]*?)<\/sheet>/gi)].map((match) => match[1] ?? "");
  const sources = bodies.length > 0 ? bodies : [xml];
  return sources.flatMap((body, index) => {
    const token = /<topic\b([^>]*)>|<\/topic>|<title\b[^>]*>([\s\S]*?)<\/title>|<notes\b[^>]*>([\s\S]*?)<\/notes>/gi;
    const stack: TopicNode[] = [];
    let root: TopicNode | undefined;
    let match: RegExpExecArray | null;
    while ((match = token.exec(body)) !== null) {
      const lower = match[0].toLowerCase();
      if (lower.startsWith("<topic") && !lower.startsWith("</")) {
        const node: TopicNode = { id: xmlAttribute(match[1] ?? "", "id") ?? `sheet-${index + 1}-${stack.length + 1}`, title: "Untitled topic", children: [] };
        if (stack.length > 0) stack[stack.length - 1]!.children.push(node); else root = node;
        stack.push(node);
      } else if (lower === "</topic>") {
        stack.pop();
      } else if (stack.length > 0 && match[2] !== undefined) {
        stack[stack.length - 1]!.title = clean(unescapeXml(stripTags(match[2])));
      } else if (stack.length > 0 && match[3] !== undefined) {
        stack[stack.length - 1]!.note = clean(unescapeXml(stripTags(match[3])));
      }
    }
    return root ? [root] : [];
  });
}

function parseOperations(value: string | undefined): Operation[] {
  if (!value?.trim()) throw new Error("edit mode requires an operations JSON array.");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch (error) { throw new Error(`operations is invalid JSON: ${message(error)}`); }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_OPERATIONS || !parsed.every(isRecord)) throw new Error(`operations must contain 1-${MAX_OPERATIONS} objects.`);
  return parsed as Operation[];
}

function applyOperations(roots: TopicNode[], operations: Operation[]): void {
  for (const operation of operations) {
    if (operation.op === "add") {
      const parent = find(roots, operation.parentId);
      if (!parent || !operation.title?.trim()) throw new Error("add requires a valid parentId and title.");
      const id = operation.nodeId?.trim() || `${parent.id}-${parent.children.length + 1}`;
      if (find(roots, id)) throw new Error(`nodeId already exists: ${id}`);
      parent.children.push({ id, title: limit(operation.title, 500), ...(operation.note ? { note: limit(operation.note, 5000) } : {}), ...(operation.hyperlink ? { hyperlink: limit(operation.hyperlink, 2000) } : {}), ...(normalizeStatus(operation.taskStatus) ? { taskStatus: normalizeStatus(operation.taskStatus) } : {}), children: [] });
      continue;
    }
    const node = find(roots, operation.nodeId);
    if (!node) throw new Error(`nodeId was not found: ${operation.nodeId ?? ""}`);
    if (operation.op === "set-title") node.title = limit(operation.title ?? "", 500);
    else if (operation.op === "set-note") operation.note?.trim() ? node.note = limit(operation.note, 5000) : delete node.note;
    else if (operation.op === "set-link") operation.hyperlink?.trim() ? node.hyperlink = limit(operation.hyperlink, 2000) : delete node.hyperlink;
    else if (operation.op === "set-status") normalizeStatus(operation.taskStatus) ? node.taskStatus = normalizeStatus(operation.taskStatus) : delete node.taskStatus;
    else if (operation.op === "remove") {
      if (!remove(roots, node.id)) throw new Error("The last root topic cannot be removed.");
    } else if (operation.op === "move") {
      const parent = find(roots, operation.parentId);
      if (!parent || parent.id === node.id || contains(node, parent.id) || !remove(roots, node.id)) throw new Error("move has an invalid parentId.");
      parent.children.splice(Math.max(0, Math.min(operation.index ?? parent.children.length, parent.children.length)), 0, node);
    } else throw new Error(`Unsupported operation: ${operation.op ?? ""}`);
  }
}

function createArchive(original: Buffer, document: Document): Buffer {
  const preserved = readArchive(original).filter((entry) => !["content.json", "content.xml", "manifest.json", "metadata.json"].includes(entry.name.toLowerCase()));
  const sheets = document.roots.map((root, index) => ({
    id: `sheet-${index + 1}`,
    class: "sheet",
    title: root.title,
    rootTopic: { ...xmindTopic(root), structureClass: "org.xmind.ui.map.unbalanced" },
  }));
  const entries: ArchiveEntry[] = [
    { name: "content.json", content: Buffer.from(JSON.stringify(sheets, null, 2) + "\n") },
    { name: "metadata.json", content: Buffer.from(JSON.stringify({ activeSheetId: sheets[0]?.id ?? "sheet-1", creator: { name: "Agent System", version: "1.0.0" }, dataStructureVersion: "2", layoutEngineVersion: "3" }, null, 2) + "\n") },
    ...preserved,
  ];
  const fileEntries = Object.fromEntries(entries.map((entry) => [entry.name, {}]));
  entries.push({ name: "manifest.json", content: Buffer.from(JSON.stringify({ "file-entries": fileEntries }, null, 2) + "\n") });
  return zip(entries);
}

function xmindTopic(node: TopicNode): Record<string, unknown> {
  return { id: node.id, class: "topic", title: node.title, ...(node.note ? { notes: { plain: { content: node.note } } } : {}), ...(node.hyperlink ? { href: node.hyperlink } : {}), ...(node.taskStatus ? { markers: [{ markerId: `task-${node.taskStatus}` }] } : {}), ...(node.children.length ? { children: { attached: node.children.map(xmindTopic) } } : {}) };
}

function toMarkdown(document: Document): string {
  const lines = ["<!-- Generated by xmind. Original XMind file is preserved. -->", ""];
  for (const root of document.roots) {
    lines.push(`# ${root.title}`, "");
    appendMarkdown(lines, root.children, 0);
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function appendMarkdown(lines: string[], nodes: TopicNode[], depth: number): void {
  for (const node of nodes) {
    lines.push(`${"  ".repeat(depth)}- ${node.title}${node.taskStatus ? ` [${node.taskStatus}]` : ""}`);
    if (node.note) lines.push(`${"  ".repeat(depth + 1)}> ${node.note}`);
    if (node.hyperlink) lines.push(`${"  ".repeat(depth + 1)}> Link: ${node.hyperlink}`);
    appendMarkdown(lines, node.children, depth + 1);
  }
}

function readArchive(archive: Buffer): ArchiveEntry[] {
  if (!archive.length || archive.length > MAX_ARCHIVE_BYTES) throw new Error("XMind archive size is invalid.");
  const end = findEnd(archive);
  const count = archive.readUInt16LE(end + 10);
  const centralSize = archive.readUInt32LE(end + 12);
  const centralOffset = archive.readUInt32LE(end + 16);
  if (count > 500 || centralOffset + centralSize > end) throw new Error("XMind ZIP central directory is invalid.");
  const entries: ArchiveEntry[] = [];
  let offset = centralOffset;
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error("XMind ZIP central directory is invalid.");
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8").replaceAll("\\", "/");
    if (!safePath(name)) throw new Error(`Unsafe XMind ZIP entry: ${name}`);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(start, start + compressedSize);
    const content = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed, { maxOutputLength: MAX_UNCOMPRESSED_BYTES }) : undefined;
    if (!content || content.length !== uncompressedSize) throw new Error(`Invalid XMind ZIP entry: ${name}`);
    total += content.length;
    if (total > MAX_UNCOMPRESSED_BYTES) throw new Error("XMind archive expands beyond the safe limit.");
    entries.push({ name, content });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function zip(files: ArchiveEntry[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  const modified = dosDateTime(new Date());
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const compressed = deflateRawSync(file.content, { level: 9 });
    const method = compressed.length < file.content.length ? 8 : 0;
    const data = method === 8 ? compressed : file.content;
    const crc = crc32(file.content);
    const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6); header.writeUInt16LE(method, 8); header.writeUInt16LE(modified.time, 10); header.writeUInt16LE(modified.date, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(file.content.length, 22); header.writeUInt16LE(name.length, 26); name.copy(header, 30);
    local.push(header, data);
    const record = Buffer.alloc(46 + name.length);
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x0800, 8); record.writeUInt16LE(method, 10); record.writeUInt16LE(modified.time, 12); record.writeUInt16LE(modified.date, 14); record.writeUInt32LE(crc, 16); record.writeUInt32LE(data.length, 20); record.writeUInt32LE(file.content.length, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42); name.copy(record, 46);
    central.push(record); offset += header.length + data.length;
  }
  const localData = Buffer.concat(local); const centralData = Buffer.concat(central); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralData.length, 12); end.writeUInt32LE(localData.length, 16);
  return Buffer.concat([localData, centralData, end]);
}

function dosDateTime(value: Date): { date: number; time: number } {
  const year = Math.max(1980, Math.min(2107, value.getFullYear()));
  return {
    date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
    time: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2),
  };
}

function findEnd(archive: Buffer): number {
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65557); offset -= 1) if (archive.readUInt32LE(offset) === 0x06054b50 && offset + 22 + archive.readUInt16LE(offset + 20) === archive.length) return offset;
  throw new Error("Invalid XMind ZIP archive.");
}

function find(roots: TopicNode[], id: string | undefined): TopicNode | undefined {
  if (!id) return undefined;
  for (const node of roots) { if (node.id === id) return node; const child = find(node.children, id); if (child) return child; }
  return undefined;
}

function remove(roots: TopicNode[], id: string): boolean {
  const index = roots.findIndex((node) => node.id === id);
  if (index >= 0) { if (roots.length === 1) return false; roots.splice(index, 1); return true; }
  for (const node of roots) { const child = node.children.findIndex((item) => item.id === id); if (child >= 0) { node.children.splice(child, 1); return true; } if (remove(node.children, id)) return true; }
  return false;
}

function contains(root: TopicNode, id: string): boolean { return root.children.some((child) => child.id === id || contains(child, id)); }
function countNodes(nodes: TopicNode[]): number { return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0); }
function exists(path: string): Promise<boolean> { return stat(path).then(() => true).catch(() => false); }
function projectPath(root: string, candidate: string): string { const target = resolve(root, candidate); const child = relative(root, target); if (!child || isAbsolute(child) || child === ".." || child.startsWith("../") || child.startsWith("..\\")) throw new Error("Path must remain inside the current project."); return target; }
function safePath(value: string): boolean { if (!value || value.includes("\0") || value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:/.test(value)) return false; return !value.split(/[\\/]/).some((part) => !part || part === "." || part === ".." || part.toLowerCase() === "node_modules"); }
function text(value: unknown): string | undefined { if (typeof value === "string" && value.trim()) return value.trim(); if (Array.isArray(value)) return value.map(text).filter((item): item is string => Boolean(item)).join(" ") || undefined; if (!isRecord(value)) return undefined; for (const key of ["plain", "text", "content", "value", "title"]) { const result = text(value[key]); if (result) return result; } return undefined; }
function clean(value: string): string { return value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim() || "Untitled topic"; }
function limit(value: string, max: number): string { const result = clean(value); if (result.length > max) throw new Error(`Text exceeds ${max} characters.`); return result; }
function normalizeStatus(value: string | undefined): TopicNode["taskStatus"] { const normalized = value?.toLowerCase(); if (!normalized) return undefined; if (normalized.includes("done") || normalized.includes("complete")) return "done"; if (normalized.includes("doing") || normalized.includes("progress") || normalized.includes("half")) return "doing"; if (normalized.includes("todo") || normalized.includes("start")) return "todo"; return undefined; }
function xmlAttribute(value: string, name: string): string | undefined { return new RegExp(`${name}=["']([^"']+)["']`, "i").exec(value)?.[1]; }
function stripTags(value: string): string { return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function unescapeXml(value: string): string { return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }
function slug(value: string): string { return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "xmind"; }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function crc32(value: Buffer): number { let result = 0xffffffff; for (const byte of value) { result ^= byte; for (let bit = 0; bit < 8; bit += 1) result = (result >>> 1) ^ ((result & 1) ? 0xedb88320 : 0); } return (result ^ 0xffffffff) >>> 0; }
