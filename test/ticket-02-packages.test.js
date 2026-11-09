import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { readAicxtManifest } from "../packages/cli/src/zip.js";

const EXTENSION_IDS = ["azure-devops-platform", "google-cloud-platform", "gitlab", "open-design", "xmind"];
const packageRoot = resolve("packages");

async function packagePath(extensionId, ...parts) {
  return join(packageRoot, extensionId, ...parts);
}

test("Ticket 02 publishes only the five formal Extension packages with source provenance", async () => {
  const directories = await readdir(packageRoot, { withFileTypes: true });
  const formal = directories.filter((entry) => entry.isDirectory() && EXTENSION_IDS.includes(entry.name)).map((entry) => entry.name).sort();
  assert.deepEqual(formal, [...EXTENSION_IDS].sort());
  assert.equal(directories.some((entry) => entry.name === "local-native-resources"), false);

  for (const extensionId of EXTENSION_IDS) {
    const source = JSON.parse(await readFile(await packagePath(extensionId, "source.json"), "utf8"));
    assert.equal(source.extensionId, extensionId);
    assert.equal(source.repository, "agent-system");
    assert.equal(source.snapshotCommit, "b3040627401c9fe6a6955051022f0e602d602398");
    assert.match(source.sourceTree, /^[a-f0-9]{40}$/);
    assert.ok(source.sourcePath);
    assert.ok(source.sourceRevision);
    assert.notEqual(source.sourceRevision, "6328628617abeb17d12886487387c7cd35023965");
    assert.notEqual(source.sourceRevision, "historical-2.0.0");
  }
});

test("each deterministic build matches its tracked 2.0.0 archive and manifest", async () => {
  const { buildExtensionPackage } = await import("../scripts/build-extension-packages.js");
  for (const extensionId of EXTENSION_IDS) {
    const { archive, manifest } = await buildExtensionPackage(extensionId);
    const tracked = await readFile(await packagePath(extensionId, `${extensionId}-2.0.0.aicxt`));
    assert.deepEqual(archive, tracked, `${extensionId} archive must be reproducible`);
    assert.equal(manifest.extensionId, extensionId);
    assert.equal(manifest.version, "2.0.0");
    const unpacked = readAicxtManifest(archive);
    assert.equal(unpacked.extensionId, extensionId);
    assert.equal(unpacked.version, "2.0.0");
  }
});

test("package entry, resource and declared asset integrity hashes match packaged bytes", async () => {
  const { buildExtensionPackage } = await import("../scripts/build-extension-packages.js");
  for (const extensionId of EXTENSION_IDS) {
    const { files, manifest } = await buildExtensionPackage(extensionId);
    for (const section of ["backend", "frontend", "configuration"]) {
      for (const [path, expected] of Object.entries(manifest[section]?.integrity ?? {})) {
        assert.equal(`sha256-${createHash("sha256").update(files.get(path)).digest("hex")}`, expected, `${extensionId}:${path}`);
      }
    }
    for (const plugin of manifest.resources?.plugins ?? []) {
      assert.equal(`sha256-${createHash("sha256").update(files.get(plugin.path)).digest("hex")}`, plugin.integrity, `${extensionId}:${plugin.path}`);
      for (const path of plugin.files) assert.ok(files.has(path), `${extensionId}:${path} companion file is packaged`);
    }
  }
});
