import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { cacheVerifiedArtifact, resolveCacheRoot } from "../src/lib/cache.mjs";
import { createAicxt } from "./fixtures.mjs";
import { resolveReleaseArtifact } from "../src/lib/releases.mjs";
import { validateAicxtArchive } from "../src/lib/archive.mjs";

const catalogUrl = "https://raw.githubusercontent.com/jason23452/agent-system-extensions/main/catalog.json";
const artifactUrl = "https://github.com/jason23452/agent-system-extensions/releases/download/fixture-v2.0.0/fixture-extension-2.0.0.aicxt";

test("release resolution selects the requested extension's catalog latest, not a repository latest", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-release-"));
  try {
    const archive = createAicxt();
    const archiveHash = createHash("sha256").update(archive).digest("hex");
    const catalog = makeCatalog({
      extensionId: "fixture-extension",
      latestVersion: "1.2.3",
      releases: [release("fixture-extension", "1.2.3", artifactUrl, archive, archiveHash)],
    });
    const seen = [];
    const result = await resolveReleaseArtifact({
      cacheRoot: root,
      extensionId: "fixture-extension",
      catalogUrl,
      fetchImpl: async (url) => {
        seen.push(String(url));
        return String(url) === catalogUrl ? jsonResponse(catalog) : binaryResponse(archive);
      },
    });

    assert.equal(result.packageData.manifest.version, "1.2.3");
    assert.deepEqual(seen, [catalogUrl, artifactUrl]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a fixed offline version is read only from its verified extension cache", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-cache-"));
  try {
    const archive = createAicxt();
    const packageData = validateFixture(archive);
    const savedPath = await cacheVerifiedArtifact(root, packageData);
    let networkCalls = 0;
    const result = await resolveReleaseArtifact({
      cacheRoot: root,
      extensionId: "fixture-extension",
      version: "1.2.3",
      offline: true,
      fetchImpl: async () => { networkCalls += 1; throw new Error("network must not be used offline"); },
    });

    assert.equal(result.packageData.archiveSha256, packageData.archiveSha256);
    assert.equal(result.packageData.cachePath, savedPath);
    assert.equal(networkCalls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an artifact hash mismatch fails without resolving a replacement version", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-integrity-"));
  try {
    const archive = createAicxt();
    const archiveHash = createHash("sha256").update(archive).digest("hex");
    assert.notEqual(archiveHash, "0".repeat(64));
    const catalog = makeCatalog({
      extensionId: "fixture-extension",
      latestVersion: "1.2.3",
      releases: [release("fixture-extension", "1.2.3", artifactUrl, archive, "0".repeat(64))],
    });
    const seen = [];

    await assert.rejects(resolveReleaseArtifact({
      cacheRoot: root,
      extensionId: "fixture-extension",
      catalogUrl,
      fetchImpl: async (url) => {
        seen.push(String(url));
        return String(url) === catalogUrl ? jsonResponse(catalog) : binaryResponse(archive);
      },
    }), (error) => error.code === "ARTIFACT_HASH_MISMATCH");
    assert.deepEqual(seen, [catalogUrl, artifactUrl]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("default product cache is independent from cwd and npm's cache", () => {
  const first = resolveCacheRoot(undefined, { APPDATA: "C:/Users/Alice/AppData/Roaming", npm_config_cache: "C:/npm/one" }, "win32", "C:/Users/Alice");
  const second = resolveCacheRoot(undefined, { APPDATA: "C:/Users/Alice/AppData/Roaming", npm_config_cache: "D:/npm/two" }, "win32", "C:/Users/Alice");
  assert.equal(first, second);
  assert.match(first, /AgentSystem[\\/]extensions$/);
});

function makeCatalog(extension) {
  return {
    contractVersion: "1.0.0",
    extensions: [{ extensionId: extension.extensionId, latestVersion: extension.latestVersion, releases: extension.releases }],
    schemaVersion: "agent-system.extension-catalog.v1",
  };
}

function release(extensionId, version, url, archive, packageSha256) {
  return {
    artifact: { sha256: packageSha256, sizeBytes: archive.byteLength, url },
    contractVersion: "1.0.0",
    extensionId,
    hostRequirements: { minHostVersion: "0.0.0" },
    schemaVersion: "agent-system.extension-release.v1",
    version,
  };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}

function binaryResponse(value) {
  return new Response(value, { headers: { "content-type": "application/octet-stream" } });
}

function validateFixture(archive) {
  return validateAicxtArchive(archive);
}
