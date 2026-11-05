import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const resourceFiles = [
  "backend/entry.js",
  "frontend/entry.js",
  "config/extension.json",
  "plugins/gitlab.ts",
  "plugins/gitlab/gitlab.ts",
  "plugins/gitlab/selector.js",
];
const CRC_TABLE = makeCrcTable();

export async function createExtensionArchive() {
  const packageFiles = new Map();
  for (const path of resourceFiles) {
    const absolutePath = resolve(root, path);
    if (!isInside(root, absolutePath)) throw new Error(`Extension source path escapes its workspace: ${path}`);
    packageFiles.set(path, await readFile(absolutePath));
  }

  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  manifest.backend.integrity = { [manifest.backend.entry]: integrity(packageFiles.get(manifest.backend.entry)) };
  manifest.frontend.integrity = { [manifest.frontend.entry]: integrity(packageFiles.get(manifest.frontend.entry)) };
  manifest.configuration.integrity = { [manifest.configuration.entry]: integrity(packageFiles.get(manifest.configuration.entry)) };
  for (const resource of manifest.resources.plugins) {
    resource.integrity = integrity(packageFiles.get(resource.path));
  }
  packageFiles.set("extension.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"));
  return {
    archive: createZip([...packageFiles.entries()]),
    manifest,
    files: packageFiles,
  };
}

export async function buildExtensionPackage(output = join(root, "dist", "gitlab-2.0.0.aicxt")) {
  const { archive, manifest } = await createExtensionArchive();
  const target = resolve(output);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, archive);
  return {
    path: target,
    extensionId: manifest.extensionId,
    version: manifest.version,
    sha256: createHash("sha256").update(archive).digest("hex"),
    sizeBytes: archive.byteLength,
  };
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, date } = dosDateTime(new Date());

  for (const [rawPath, content] of entries) {
    const path = rawPath.replaceAll("\\", "/");
    if (!path || path.startsWith("/") || path.split("/").some((segment) => segment === ".." || segment === "")) {
      throw new Error(`Invalid package path: ${rawPath}`);
    }
    const name = Buffer.from(path, "utf8");
    const bytes = Buffer.from(content);
    const crc = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, bytes);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + bytes.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(content) {
  let crc = 0xffffffff;
  for (const byte of content) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}

function integrity(content) {
  return `sha256-${createHash("sha256").update(content).digest("hex")}`;
}

function dosDateTime(value) {
  const year = Math.max(1980, value.getFullYear());
  return {
    time: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
  };
}

function isInside(parent, child) {
  const path = relative(resolve(parent), resolve(child));
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  const result = await buildExtensionPackage(output);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
