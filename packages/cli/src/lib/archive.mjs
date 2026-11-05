import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { packageError } from "./errors.mjs";

export const MAX_EXTENSION_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 500;
const EXTENSION_ID = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const CRC_TABLE = makeCrcTable();

export async function readAndValidateArchive(path, expected = {}) {
  let archive;
  try {
    archive = await readFile(path);
  } catch (error) {
    throw packageError(`無法讀取 Extension 套件：${basename(path)}`, "PACKAGE_FILE_UNREADABLE", { cause: safeErrorCode(error) });
  }
  return validateAicxtArchive(archive, expected);
}

export function validateAicxtArchive(input, expected = {}) {
  const archive = Buffer.from(input);
  if (archive.byteLength === 0) throw packageError("Extension 套件不可為空。", "PACKAGE_EMPTY");
  if (archive.byteLength > MAX_EXTENSION_ARCHIVE_BYTES) {
    throw packageError("Extension 套件超過 25 MiB 上限。", "PACKAGE_TOO_LARGE", { maxBytes: MAX_EXTENSION_ARCHIVE_BYTES });
  }

  const files = readZipEntries(archive);
  const manifestBytes = files.get("extension.json");
  if (!manifestBytes) throw packageError("套件缺少根目錄 extension.json。", "PACKAGE_MANIFEST_MISSING");

  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw packageError("extension.json 不是有效 JSON。", "PACKAGE_MANIFEST_INVALID");
  }
  validateManifest(manifest, files);
  if (expected.extensionId !== undefined && manifest.extensionId !== expected.extensionId) {
    throw packageError("套件 extensionId 與指定版本不一致。", "PACKAGE_IDENTITY_MISMATCH", {
      expectedExtensionId: expected.extensionId,
      actualExtensionId: manifest.extensionId,
    });
  }
  if (expected.version !== undefined && manifest.version !== expected.version) {
    throw packageError("套件版本與指定版本不一致。", "PACKAGE_IDENTITY_MISMATCH", {
      expectedVersion: expected.version,
      actualVersion: manifest.version,
    });
  }

  return {
    archive,
    archiveSha256: sha256(archive),
    files,
    manifest,
    sizeBytes: archive.byteLength,
  };
}

export async function packExtensionDirectory(sourceDirectory, outputPath) {
  const root = resolve(sourceDirectory);
  const files = await collectSourceFiles(root);
  const archive = createZip([...files.entries()]);
  const packageData = validateAicxtArchive(archive);
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, archive, { flag: "wx" }).catch(async (error) => {
    if (error?.code !== "EEXIST") throw error;
    throw packageError("輸出檔案已存在；請選擇新路徑，不覆寫已建立的套件。", "PACKAGE_OUTPUT_EXISTS");
  });
  return { path: target, ...packageSummary(packageData) };
}

export function packageSummary(packageData) {
  return {
    extensionId: packageData.manifest.extensionId,
    packageSha256: packageData.archiveSha256,
    sizeBytes: packageData.sizeBytes,
    version: packageData.manifest.version,
  };
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function readZipEntries(archive) {
  const endOffset = findEndOfCentralDirectory(archive);
  const disk = archive.readUInt16LE(endOffset + 4);
  const directoryDisk = archive.readUInt16LE(endOffset + 6);
  const diskEntryCount = archive.readUInt16LE(endOffset + 8);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  const directorySize = archive.readUInt32LE(endOffset + 12);
  const directoryOffset = archive.readUInt32LE(endOffset + 16);
  const commentLength = archive.readUInt16LE(endOffset + 20);
  if (disk !== 0 || directoryDisk !== 0 || diskEntryCount !== entryCount
    || entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff
    || endOffset + 22 + commentLength !== archive.byteLength
    || directoryOffset + directorySize > endOffset) {
    throw packageError("ZIP central directory is invalid or unsupported.", "PACKAGE_ARCHIVE_INVALID");
  }
  if (entryCount > MAX_ARCHIVE_ENTRIES) {
    throw packageError("Extension ZIP archive exceeds the 500-entry limit.", "PACKAGE_ARCHIVE_TOO_MANY_ENTRIES", {
      maxEntries: MAX_ARCHIVE_ENTRIES,
    });
  }

  const files = new Map();
  let totalUncompressedBytes = 0;
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    requireZipRange(archive, cursor, 46, directoryOffset + directorySize);
    if (archive.readUInt32LE(cursor) !== 0x02014b50) throw packageError("ZIP central directory entry is invalid.", "PACKAGE_ARCHIVE_INVALID");
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const crc = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const entryCommentLength = archive.readUInt16LE(cursor + 32);
    const startDisk = archive.readUInt16LE(cursor + 34);
    const externalAttributes = archive.readUInt32LE(cursor + 38);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const recordLength = 46 + nameLength + extraLength + entryCommentLength;
    requireZipRange(archive, cursor, recordLength, directoryOffset + directorySize);
    if (flags & 1 || ![0, 8].includes(method) || startDisk !== 0
      || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff
      || uncompressedSize > MAX_ENTRY_BYTES) {
      throw packageError("ZIP entry uses an unsupported or unsafe feature.", "PACKAGE_ARCHIVE_INVALID");
    }

    let name;
    try {
      name = new TextDecoder("utf-8", { fatal: true }).decode(archive.subarray(cursor + 46, cursor + 46 + nameLength));
    } catch {
      throw packageError("ZIP entry path is not valid UTF-8.", "PACKAGE_ARCHIVE_INVALID");
    }
    const directoryEntry = name.endsWith("/");
    const safeName = validateArchivePath(name, directoryEntry);
    const unixMode = externalAttributes >>> 16;
    if (((unixMode & 0o170000) === 0o120000) || (unixMode & 0o170000) === 0o060000) {
      throw packageError("ZIP links and device files are not accepted in Extension packages.", "PACKAGE_ARCHIVE_INVALID");
    }
    if (!directoryEntry && files.has(safeName)) throw packageError("ZIP archive contains a duplicate path.", "PACKAGE_ARCHIVE_INVALID");

    const dataStart = localEntryDataOffset(archive, localOffset, safeName, method, flags, directoryOffset);
    requireZipRange(archive, dataStart, compressedSize, directoryOffset);
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);
    let content;
    try {
      content = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES });
    } catch {
      throw packageError("ZIP entry could not be decompressed safely.", "PACKAGE_ARCHIVE_INVALID");
    }
    if (content.byteLength !== uncompressedSize || crc32(content) !== crc) {
      throw packageError("ZIP entry size or CRC does not match its directory record.", "PACKAGE_ARCHIVE_INVALID");
    }
    totalUncompressedBytes += content.byteLength;
    if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw packageError("Uncompressed Extension package exceeds the 50 MiB safety limit.", "PACKAGE_ARCHIVE_UNCOMPRESSED_TOO_LARGE", {
        maxBytes: MAX_TOTAL_UNCOMPRESSED_BYTES,
      });
    }
    if (!directoryEntry) files.set(safeName, content);
    cursor += recordLength;
  }
  if (cursor !== directoryOffset + directorySize) throw packageError("ZIP central directory length is inconsistent.", "PACKAGE_ARCHIVE_INVALID");
  return files;
}

async function collectSourceFiles(root) {
  const output = new Map();
  async function visit(directory) {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((first, second) => first.name.localeCompare(second.name));
    for (const entry of entries) {
      if ([".git", "node_modules", ".DS_Store"].includes(entry.name)) continue;
      const absolutePath = join(directory, entry.name);
      const path = relative(root, absolutePath).split(sep).join("/");
      const info = await lstat(absolutePath);
      if (info.isSymbolicLink()) throw packageError(`不允許套件目錄中的 symbolic link：${path}`, "PACKAGE_SOURCE_UNSAFE");
      if (info.isDirectory()) await visit(absolutePath);
      else if (info.isFile()) output.set(validateArchivePath(path, false), await readFile(absolutePath));
      else throw packageError(`不支援的套件來源檔案：${path}`, "PACKAGE_SOURCE_UNSAFE");
    }
  }
  await visit(root);
  return output;
}

function validateManifest(manifest, files) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
    || manifest.schemaVersion !== "agent-system.extension-package.v1"
    || typeof manifest.extensionId !== "string" || !EXTENSION_ID.test(manifest.extensionId)
    || typeof manifest.displayName !== "string" || !manifest.displayName.trim()
    || typeof manifest.version !== "string" || !SEMVER.test(manifest.version)) {
    throw packageError("Extension manifest identity or schema is invalid.", "PACKAGE_MANIFEST_INVALID");
  }

  for (const sectionName of ["backend", "frontend", "configuration"]) {
    const section = manifest[sectionName];
    if (section === undefined) continue;
    if (!section || typeof section !== "object" || typeof section.entry !== "string") {
      throw packageError(`Manifest ${sectionName} entry is invalid.`, "PACKAGE_MANIFEST_INVALID");
    }
    validateDeclaredFile(section.entry, files);
    if (!section.integrity || typeof section.integrity !== "object" || Array.isArray(section.integrity)) {
      throw packageError(`Manifest ${sectionName} integrity is missing.`, "PACKAGE_INTEGRITY_INVALID");
    }
    for (const [path, value] of Object.entries(section.integrity)) verifyIntegrity(path, value, files);
    if (!Object.hasOwn(section.integrity, section.entry)) throw packageError(`Manifest ${sectionName} entry has no integrity declaration.`, "PACKAGE_INTEGRITY_INVALID");
  }
  verifyResourceDeclarations(manifest.resources, files);
}

function verifyResourceDeclarations(value, files) {
  if (Array.isArray(value)) {
    for (const item of value) verifyResourceDeclarations(item, files);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (typeof value.path === "string") {
    validateDeclaredFile(value.path, files);
    if (value.integrity !== undefined) verifyIntegrity(value.path, value.integrity, files);
    if (value.files !== undefined) {
      if (!Array.isArray(value.files) || value.files.some((path) => typeof path !== "string")) {
        throw packageError("Manifest resource file list is invalid.", "PACKAGE_MANIFEST_INVALID");
      }
      for (const path of value.files) validateDeclaredFile(path, files);
    }
  }
  for (const child of Object.values(value)) verifyResourceDeclarations(child, files);
}

function verifyIntegrity(path, expected, files) {
  validateDeclaredFile(path, files);
  if (typeof expected !== "string" || !/^sha256-(?:[a-f0-9]{64}|[A-Za-z0-9+/]{43}={0,2})$/i.test(expected)) {
    throw packageError(`Manifest integrity for ${path} is invalid.`, "PACKAGE_INTEGRITY_INVALID");
  }
  const digest = createHash("sha256").update(files.get(path)).digest();
  const actualHex = `sha256-${digest.toString("hex")}`;
  const actualBase64 = `sha256-${digest.toString("base64")}`;
  if (actualHex !== expected.toLowerCase() && actualBase64 !== expected) {
    throw packageError(`Manifest integrity mismatch for ${path}.`, "PACKAGE_INTEGRITY_MISMATCH", { path });
  }
}

function validateDeclaredFile(path, files) {
  const normalized = validateArchivePath(path, false);
  if (!files.has(normalized)) throw packageError(`Manifest references a missing package file: ${normalized}`, "PACKAGE_FILE_MISSING", { path: normalized });
}

function validateArchivePath(path, directory) {
  if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\") || path.includes("\0") || /^[A-Za-z]:/.test(path)) {
    throw packageError("Package contains an unsafe archive path.", "PACKAGE_ARCHIVE_INVALID");
  }
  const normalized = directory ? path.slice(0, -1) : path;
  const parts = normalized.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw packageError("Package contains a path traversal entry.", "PACKAGE_ARCHIVE_INVALID");
  }
  return normalized;
}

function findEndOfCentralDirectory(archive) {
  const earliest = Math.max(0, archive.byteLength - 22 - 0xffff);
  for (let offset = archive.byteLength - 22; offset >= earliest; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw packageError("ZIP end record is missing.", "PACKAGE_ARCHIVE_INVALID");
}

function localEntryDataOffset(archive, offset, expectedName, expectedMethod, expectedFlags, directoryOffset) {
  requireZipRange(archive, offset, 30, directoryOffset);
  if (archive.readUInt32LE(offset) !== 0x04034b50) throw packageError("ZIP local entry header is invalid.", "PACKAGE_ARCHIVE_INVALID");
  const flags = archive.readUInt16LE(offset + 6);
  const method = archive.readUInt16LE(offset + 8);
  const nameLength = archive.readUInt16LE(offset + 26);
  const extraLength = archive.readUInt16LE(offset + 28);
  requireZipRange(archive, offset + 30, nameLength + extraLength, directoryOffset);
  const name = new TextDecoder("utf-8", { fatal: true }).decode(archive.subarray(offset + 30, offset + 30 + nameLength));
  if (name !== expectedName || flags !== expectedFlags || method !== expectedMethod) {
    throw packageError("ZIP local and central entry headers disagree.", "PACKAGE_ARCHIVE_INVALID");
  }
  return offset + 30 + nameLength + extraLength;
}

function requireZipRange(archive, offset, length, limit) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > limit || offset + length > archive.byteLength) {
    throw packageError("ZIP entry is outside the archive bounds.", "PACKAGE_ARCHIVE_INVALID");
  }
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [rawPath, rawContent] of entries) {
    const path = validateArchivePath(rawPath, false);
    const name = Buffer.from(path, "utf8");
    const content = Buffer.from(rawContent);
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 * 0x1_0000) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + content.length;
  }
  const directory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
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

function safeErrorCode(error) {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "UNKNOWN";
}
