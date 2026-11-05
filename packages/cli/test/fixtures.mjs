import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";

export function createAicxt(options = {}) {
  const entry = Buffer.from("export default { install() {} };\n");
  const includeBackend = options.withoutBackend !== true;
  const manifest = {
    schemaVersion: "agent-system.extension-package.v1",
    extensionId: options.extensionId ?? "fixture-extension",
    displayName: options.displayName ?? "Fixture Extension",
    version: options.version ?? "1.2.3",
    ...(includeBackend ? { backend: {
      entry: "backend/entry.js",
      integrity: { "backend/entry.js": options.entryIntegrity ?? integrity(entry, options.integrityEncoding) },
    } } : {}),
    resources: {},
  };
  return zip([
    ["extension.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)],
    ...(includeBackend ? [["backend/entry.js", entry]] : []),
    ...(options.extraFileBytes ? [["assets/payload.bin", Buffer.alloc(options.extraFileBytes, 0x5a)]] : []),
    ...(options.extraFiles ?? []),
  ], { compressExtraFiles: options.compressExtraFiles === true });
}

function zip(entries, { compressExtraFiles = false } = {}) {
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;
  for (const [path, data] of entries) {
    const name = Buffer.from(path);
    const content = Buffer.from(data);
    const method = compressExtraFiles && path.startsWith("padding/") ? 8 : 0;
    const compressed = method === 8 ? deflateRawSync(content) : content;
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localRecords.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralRecords.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(centralRecords);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localRecords, directory, eocd]);
}

function integrity(value, encoding = "hex") {
  return `sha256-${createHash("sha256").update(value).digest(encoding)}`;
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return (value ^ 0xffffffff) >>> 0;
}
