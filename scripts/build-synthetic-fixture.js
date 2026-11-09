import { readFile, writeFile, rm, mkdir, rename } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve, dirname, basename } from "node:path";

const outputPath = resolve("packages/synthetic-fixture/synthetic-fixture-1.2.3-dev.1.aicxt");
const fixtureRoot = resolve("fixtures/synthetic-extension");

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

function zipStoredFiles(files) {
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const digest = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(digest, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const localRecord = Buffer.concat([local, nameBytes, content]);
    localRecords.push(localRecord);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(digest, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centralRecords.push(Buffer.concat([central, nameBytes]));
    offset += localRecord.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localRecords, centralDirectory, end]);
}

const manifest = JSON.parse(await readFile(resolve(fixtureRoot, "extension.json"), "utf8"));
const fixtureText = await readFile(resolve(fixtureRoot, "fixture.txt"));
const archive = zipStoredFiles([
  ["extension.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)],
  ["fixture.txt", fixtureText],
]);

if (process.argv.includes("--verify")) {
  const existing = await readFile(outputPath);
  if (!existing.equals(archive)) throw new Error(`Committed fixture archive is stale: ${outputPath}`);
  process.stdout.write(`Synthetic fixture archive verified: ${createHash("sha256").update(archive).digest("hex")}\n`);
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  const temporary = resolve(dirname(outputPath), `.${basename(outputPath)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, archive, { flag: "wx" });
    await rename(temporary, outputPath);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
  process.stdout.write(`Built synthetic fixture archive: ${createHash("sha256").update(archive).digest("hex")}\n`);
}
