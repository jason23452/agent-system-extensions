import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readAicxtManifest } from "../packages/cli/src/zip.js";

const fixturePath = new URL("../packages/synthetic-fixture/synthetic-fixture-1.2.3-dev.1.aicxt", import.meta.url);

test("tracked synthetic .aicxt contains the expected release manifest", async () => {
  const manifest = readAicxtManifest(await readFile(fixturePath));
  assert.equal(manifest.schemaVersion, "agent-system.extension-package.v1");
  assert.equal(manifest.extensionId, "synthetic-fixture");
  assert.equal(manifest.version, "1.2.3-dev.1");
  assert.equal(manifest.metadata.distributionTestFixture, true);
});

test("archive validation rejects a damaged package entry checksum", async () => {
  const archive = Buffer.from(await readFile(fixturePath));
  const payload = Buffer.from("Synthetic distribution fixture only");
  const offset = archive.indexOf(payload);
  assert.notEqual(offset, -1);
  archive[offset] ^= 0xff;
  assert.throws(() => readAicxtManifest(archive), /CRC-32 mismatch/i);
});
