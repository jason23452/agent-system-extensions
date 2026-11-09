import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

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

export function fixtureArchive(manifest) {
  const name = Buffer.from("extension.json");
  const content = Buffer.from(`${JSON.stringify(manifest)}\n`);
  const crc = crc32(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  const localRecord = Buffer.concat([local, name, content]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  const centralRecord = Buffer.concat([central, name]);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralRecord.length, 12);
  end.writeUInt32LE(localRecord.length, 16);

  return Buffer.concat([localRecord, centralRecord, end]);
}

export function manifestFor({ extensionId = "synthetic-fixture", version = "1.2.3", metadata = {} } = {}) {
  return {
    schemaVersion: "agent-system.extension-package.v1",
    extensionId,
    displayName: "Synthetic Fixture",
    version,
    description: "Synthetic release used by the distribution contract tests.",
    metadata: { distributionTestFixture: true, capabilities: ["fixture.echo"], ...metadata },
  };
}

export function releaseFor({ version = "1.2.3", prerelease = version.includes("-"), manifest = manifestFor({ version }), extensionId = "synthetic-fixture" } = {}) {
  const tag = `${extensionId}-${version}`;
  const assetName = `${tag}.aicxt`;
  const assetBytes = fixtureArchive({ ...manifest, extensionId });
  const digest = createHash("sha256").update(assetBytes).digest("hex");
  return {
    assetBytes,
    release: {
      id: 123,
      tag_name: tag,
      prerelease,
      draft: false,
      assets: [{
        name: assetName,
        size: assetBytes.length,
        digest: `sha256:${digest}`,
        state: "uploaded",
        browser_download_url: `https://github.com/jason23452/agent-system-extensions/releases/download/${tag}/${assetName}`,
      }],
    },
  };
}
