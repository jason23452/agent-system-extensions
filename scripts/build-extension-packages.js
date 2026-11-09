import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const execFile = promisify(execFileCallback);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKAGES = join(ROOT, "packages");
const EXTENSION_IDS = ["azure-devops-platform", "google-cloud-platform", "gitlab", "open-design", "xmind"];
const RELEASE_VERSION = "2.0.0";
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export async function buildExtensionPackage(extensionId) {
  if (!EXTENSION_IDS.includes(extensionId)) throw new Error(`Unknown formal Extension package: ${extensionId}`);
  const packageRoot = join(PACKAGES, extensionId);
  const sourceRoot = join(packageRoot, "source");
  const files = await readTree(sourceRoot);
  if (!files.has("extension.json")) throw new Error(`${extensionId} source is missing root extension.json`);

  if (extensionId === "xmind") await addGeneratedXmindWorkflows(packageRoot, files);
  const manifest = JSON.parse(files.get("extension.json").toString("utf8"));
  if (manifest.extensionId !== extensionId) throw new Error(`${extensionId} source manifest declares another Extension identity`);
  manifest.version = RELEASE_VERSION;
  updateDeclaredIntegrity(files, manifest, "backend");
  updateDeclaredIntegrity(files, manifest, "frontend");
  updateDeclaredIntegrity(files, manifest, "configuration");
  for (const plugin of manifest.resources?.plugins ?? []) {
    if (typeof plugin.path !== "string" || !files.has(plugin.path)) throw new Error(`${extensionId} Plugin entry is missing: ${plugin.path}`);
    for (const path of plugin.files ?? []) if (!files.has(path)) throw new Error(`${extensionId} Plugin companion file is missing: ${path}`);
    plugin.integrity = sha256Integrity(files.get(plugin.path));
  }
  files.set("extension.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"));
  const archive = createZip([...files.entries()].sort(([left], [right]) => left.localeCompare(right)));
  return { archive, files, manifest };
}

export async function buildAllExtensionPackages({ verify = false } = {}) {
  const results = [];
  for (const extensionId of EXTENSION_IDS) {
    const { archive, manifest } = await buildExtensionPackage(extensionId);
    const packageRoot = join(PACKAGES, extensionId);
    const assetName = `${extensionId}-${RELEASE_VERSION}.aicxt`;
    const assetPath = join(packageRoot, assetName);
    const buildInfo = await createBuildInfo(extensionId, archive);
    const buildInfoBytes = Buffer.from(`${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");
    if (verify) {
      const trackedArchive = await readFile(assetPath);
      const trackedBuildInfo = await readFile(join(packageRoot, "build-info.json"));
      if (!trackedArchive.equals(archive)) throw new Error(`${extensionId} artifact is stale; run npm run extensions:build`);
      if (!trackedBuildInfo.equals(buildInfoBytes)) throw new Error(`${extensionId} build-info is stale; run npm run extensions:build`);
    } else {
      await atomicWrite(assetPath, archive);
      await atomicWrite(join(packageRoot, "build-info.json"), buildInfoBytes);
    }
    results.push({ ...buildInfo, manifestId: manifest.extensionId });
  }
  return results;
}

async function createBuildInfo(extensionId, archive) {
  const packageRoot = join(PACKAGES, extensionId);
  const source = JSON.parse(await readFile(join(packageRoot, "source.json"), "utf8"));
  const assetName = `${extensionId}-${RELEASE_VERSION}.aicxt`;
  return {
    extensionId,
    version: RELEASE_VERSION,
    channel: "stable",
    tag: `${extensionId}-${RELEASE_VERSION}`,
    sourceRevision: source.sourceRevision,
    sourceTree: source.sourceTree,
    sourcePath: source.sourcePath,
    artifact: {
      name: assetName,
      size: archive.length,
      sha256: createHash("sha256").update(archive).digest("hex"),
    },
  };
}

async function addGeneratedXmindWorkflows(packageRoot, files) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "agent-system-xmind-package-build-"));
  try {
    const script = join(packageRoot, "builder-tools", "build-xmind-workflows.mjs");
    await execFile(process.execPath, [script, temporaryRoot], {
      cwd: ROOT,
      maxBuffer: 2 * 1024 * 1024,
      timeout: 120_000,
      windowsHide: true,
    });
    for (const [path, content] of await readTree(temporaryRoot)) files.set(path, content);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function readTree(root) {
  const files = new Map();
  const visit = async (directory) => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(root, absolutePath).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) throw new Error(`Source tree must not contain symbolic links: ${relativePath}`);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile()) files.set(relativePath, await readFile(absolutePath));
      else throw new Error(`Source tree contains an unsupported entry: ${relativePath}`);
    }
  };
  await visit(root);
  return files;
}

function updateDeclaredIntegrity(files, manifest, section) {
  const declaration = manifest[section];
  if (!declaration) return;
  if (typeof declaration.entry !== "string" || !files.has(declaration.entry)) throw new Error(`${section}.entry is missing from package source`);
  const integrity = declaration.integrity && typeof declaration.integrity === "object" ? declaration.integrity : {};
  const paths = new Set([...Object.keys(integrity), declaration.entry]);
  declaration.integrity = Object.fromEntries([...paths].sort().map((path) => {
    const content = files.get(path);
    if (!content) throw new Error(`${section} integrity asset is missing: ${path}`);
    return [path, sha256Integrity(content)];
  }));
}

function sha256Integrity(content) {
  return `sha256-${createHash("sha256").update(content).digest("hex")}`;
}

function crc32(content) {
  let value = 0xffffffff;
  for (const byte of content) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function createZip(entries) {
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;
  for (const [path, content] of entries) {
    validateArchivePath(path);
    const name = Buffer.from(path, "utf8");
    const compressed = deflateRawSync(content, { level: 9 });
    const method = compressed.length < content.length ? 8 : 0;
    const data = method === 8 ? compressed : content;
    const checksum = crc32(content);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    localRecords.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralRecords.push(central);
    offset += local.length + data.length;
  }
  if (entries.length > 0xffff) throw new Error("A .aicxt package cannot contain more than 65535 files.");
  const localData = Buffer.concat(localRecords);
  const centralData = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(localData.length, 16);
  return Buffer.concat([localData, centralData, end]);
}

function validateArchivePath(path) {
  if (!path || path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path)
    || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsafe .aicxt package path: ${path}`);
  }
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  try {
    await writeFile(temporary, content, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

async function main() {
  const args = process.argv.slice(2);
  const verify = args.includes("--verify");
  const extensionIds = args.filter((argument) => argument !== "--verify");
  if (extensionIds.length > 1 || extensionIds.some((id) => !EXTENSION_IDS.includes(id))) {
    throw new Error(`Usage: node scripts/build-extension-packages.js [${EXTENSION_IDS.join("|")}] [--verify]`);
  }
  if (extensionIds.length === 1) {
    const id = extensionIds[0];
    const { archive } = await buildExtensionPackage(id);
    const packageRoot = join(PACKAGES, id);
    const assetPath = join(packageRoot, `${id}-${RELEASE_VERSION}.aicxt`);
    const buildInfoBytes = Buffer.from(`${JSON.stringify(await createBuildInfo(id, archive), null, 2)}\n`, "utf8");
    if (verify) {
      const tracked = await readFile(assetPath);
      const trackedBuildInfo = await readFile(join(packageRoot, "build-info.json"));
      if (!tracked.equals(archive) || !trackedBuildInfo.equals(buildInfoBytes)) throw new Error(`${id} build is stale; run npm run extensions:build`);
      process.stdout.write(`${id} ${RELEASE_VERSION} archive verified: ${createHash("sha256").update(tracked).digest("hex")}\n`);
    } else {
      await atomicWrite(assetPath, archive);
      await atomicWrite(join(packageRoot, "build-info.json"), buildInfoBytes);
      process.stdout.write(`${id} ${RELEASE_VERSION} package built.\n`);
    }
    return;
  }
  const results = await buildAllExtensionPackages({ verify });
  process.stdout.write(`${verify ? "Verified" : "Built"} ${results.length} Extension packages.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
