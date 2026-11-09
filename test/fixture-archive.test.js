import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { catalogEntryFromRelease } from "../packages/cli/src/catalog.js";
import { readAicxtManifest } from "../packages/cli/src/zip.js";
import { fixtureArchive, manifestFor, releaseFor } from "../test-support/fixtures.js";

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

const unsafeEntryNames = ["C:/outside.txt", "C:relative.txt", "../outside.txt"];

test("archive validation rejects Windows drive-absolute, drive-relative and traversal paths", () => {
  const accepted = unsafeEntryNames.filter((name) => {
    try {
      readAicxtManifest(fixtureArchive(manifestFor(), [{ name, content: "outside" }]));
      return true;
    } catch (error) {
      assert.match(error.message, /unsafe path/i);
      return false;
    }
  });
  assert.deepEqual(accepted, []);
});

test("release publisher seam rejects Windows drive-absolute, drive-relative and traversal paths", () => {
  const accepted = unsafeEntryNames.filter((name) => {
    const { release, assetBytes } = releaseFor({ additionalEntries: [{ name, content: "outside" }] });
    try {
      catalogEntryFromRelease({ release, assetBytes });
      return true;
    } catch (error) {
      assert.match(error.message, /unsafe path/i);
      return false;
    }
  });
  assert.deepEqual(accepted, []);
});

test("archive and release validation allow normal nested relative paths", () => {
  const additionalEntries = [{ name: "assets/metadata.txt", content: "safe relative file" }];
  const archive = fixtureArchive(manifestFor(), additionalEntries);
  assert.equal(readAicxtManifest(archive).extensionId, "synthetic-fixture");

  const { release, assetBytes } = releaseFor({ additionalEntries });
  assert.equal(catalogEntryFromRelease({ release, assetBytes }).tag, "synthetic-fixture-1.2.3");
});
