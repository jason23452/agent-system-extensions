import { inflateRawSync } from "node:zlib";

const ZIP_EOCD = 0x06054b50;
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function fail(message) {
  throw new Error(`Invalid .aicxt archive: ${message}`);
}

function readUtf8(bytes, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} is not valid UTF-8`);
  }
}

function validateEntryName(name) {
  if (name.length === 0 || name.includes("\\") || name.includes("\0") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) {
    fail("ZIP entry has an unsafe path");
  }
  const path = name.endsWith("/") ? name.slice(0, -1) : name;
  if (path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail("ZIP entry has an unsafe path");
  }
  return path;
}

function findEndOfCentralDirectory(archive) {
  const earliest = Math.max(0, archive.length - 22 - 0xffff);
  for (let offset = archive.length - 22; offset >= earliest; offset -= 1) {
    if (archive.readUInt32LE(offset) !== ZIP_EOCD) continue;
    const commentLength = archive.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === archive.length) return offset;
  }
  fail("end-of-central-directory record is missing or truncated");
}

function inflateEntry(archive, entry) {
  if (entry.localOffset + 30 > archive.length || archive.readUInt32LE(entry.localOffset) !== ZIP_LOCAL) {
    fail(`local file record is invalid for ${entry.name}`);
  }
  const localNameLength = archive.readUInt16LE(entry.localOffset + 26);
  const localExtraLength = archive.readUInt16LE(entry.localOffset + 28);
  if (archive.readUInt16LE(entry.localOffset + 6) !== entry.flags || archive.readUInt16LE(entry.localOffset + 8) !== entry.method) {
    fail(`local and central flags or compression differ for ${entry.name}`);
  }
  if (archive.readUInt32LE(entry.localOffset + 14) !== entry.crc
    || archive.readUInt32LE(entry.localOffset + 18) !== entry.compressedSize
    || archive.readUInt32LE(entry.localOffset + 22) !== entry.uncompressedSize) {
    fail(`local and central size or checksum differ for ${entry.name}`);
  }
  const localNameStart = entry.localOffset + 30;
  const localName = readUtf8(archive.subarray(localNameStart, localNameStart + localNameLength), "local file name");
  if (localName !== entry.rawName) fail(`local and central file names differ for ${entry.name}`);
  const dataStart = localNameStart + localNameLength + localExtraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > archive.length) fail(`compressed data is truncated for ${entry.name}`);
  const compressed = archive.subarray(dataStart, dataEnd);
  let content;
  try {
    if (entry.method === 0) content = Buffer.from(compressed);
    else if (entry.method === 8) content = inflateRawSync(compressed, { maxOutputLength: entry.uncompressedSize + 1 });
    else fail(`unsupported compression method ${entry.method} for ${entry.name}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid .aicxt archive:")) throw error;
    fail(`compressed data is invalid for ${entry.name}`);
  }
  if (content.length !== entry.uncompressedSize) fail(`uncompressed size differs for ${entry.name}`);
  if (crc32(content) !== entry.crc) fail(`CRC-32 mismatch for ${entry.name}`);
  return content;
}

export function readAicxtManifest(input) {
  const archive = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (archive.length < 22 || archive.length > MAX_ARCHIVE_BYTES) fail("archive size is invalid");
  const eocdOffset = findEndOfCentralDirectory(archive);
  const diskNumber = archive.readUInt16LE(eocdOffset + 4);
  const centralDiskNumber = archive.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = archive.readUInt16LE(eocdOffset + 8);
  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  const centralSize = archive.readUInt32LE(eocdOffset + 12);
  const centralOffset = archive.readUInt32LE(eocdOffset + 16);
  if (diskNumber !== 0 || centralDiskNumber !== 0 || entriesOnDisk !== entryCount) fail("multi-disk archives are not supported");
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) fail("ZIP64 archives are not supported");
  if (centralOffset + centralSize !== eocdOffset) fail("central directory bounds are invalid");

  const entries = new Map();
  let totalUncompressed = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocdOffset || archive.readUInt32LE(offset) !== ZIP_CENTRAL) fail("central directory entry is invalid");
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const crc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const diskStart = archive.readUInt16LE(offset + 34);
    const localOffset = archive.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nextOffset = nameStart + nameLength + extraLength + commentLength;
    if (nextOffset > eocdOffset) fail("central directory entry is truncated");
    if ((flags & 0x0001) !== 0) fail("encrypted ZIP entries are not supported");
    if ((flags & 0x0008) !== 0) fail("streamed ZIP entries are not supported");
    if (diskStart !== 0 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) fail("multi-disk or ZIP64 entries are not supported");
    const rawName = readUtf8(archive.subarray(nameStart, nameStart + nameLength), "ZIP entry name");
    const name = validateEntryName(rawName);
    if (entries.has(name)) fail(`duplicate ZIP entry ${name}`);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) fail("total uncompressed size exceeds the supported limit");
    entries.set(name, { name, rawName, flags, method, crc, compressedSize, uncompressedSize, localOffset });
    offset = nextOffset;
  }
  if (offset !== eocdOffset) fail("central directory has trailing data");

  const manifestEntry = entries.get("extension.json");
  if (!manifestEntry || manifestEntry.name.endsWith("/")) fail("root extension.json is missing");
  if (manifestEntry.uncompressedSize > MAX_MANIFEST_BYTES) fail("extension.json exceeds the supported size");

  for (const entry of entries.values()) {
    if (entry.name.endsWith("/")) {
      if (entry.uncompressedSize !== 0 || entry.compressedSize !== 0) fail(`directory entry has data: ${entry.name}`);
      continue;
    }
    inflateEntry(archive, entry);
  }

  let manifest;
  try {
    manifest = JSON.parse(readUtf8(inflateEntry(archive, manifestEntry), "extension.json").replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid .aicxt archive:")) throw error;
    fail("extension.json is not valid JSON");
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) fail("extension.json must contain an object");
  return manifest;
}
