import { createHash } from "node:crypto";

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
  ]);
}

function zip(entries) {
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;
  for (const [path, data] of entries) {
    const name = Buffer.from(path);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localRecords.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralRecords.push(central, name);
    offset += local.length + name.length + data.length;
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
