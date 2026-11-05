import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { publishImmutableReleaseAsset } from "../src/lib/release-publisher.mjs";

const tag = "gitlab-v2.0.0";
const assetName = "gitlab-2.0.0.aicxt";

test("publishing creates a missing immutable tag once and verifies the downloaded asset hash", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-release-publish-"));
  try {
    const bytes = Buffer.from("fixed artifact bytes");
    const path = join(root, assetName);
    await writeFile(path, bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const apiCalls = [];
    const ghCalls = [];
    let releaseVisible = false;

    const result = await publishImmutableReleaseAsset({
      tag,
      assetPath: path,
      assetName,
      sha256,
      sizeBytes: bytes.byteLength,
      runGh: async (args) => { ghCalls.push(args); releaseVisible = true; return { status: 0 }; },
      fetchImpl: async (url) => {
        apiCalls.push(String(url));
        if (String(url).endsWith(`/releases/tags/${tag}`)) {
          if (!releaseVisible) return new Response("not found", { status: 404 });
          return jsonResponse({
            id: 44,
            tag_name: tag,
            assets: [{ name: assetName, size: bytes.byteLength, browser_download_url: "https://assets.example.invalid/gitlab-2.0.0.aicxt" }],
          });
        }
        return new Response(bytes, { headers: { "content-type": "application/octet-stream" } });
      },
    });

    assert.deepEqual(result, { assetName, releaseId: 44, state: "published", tag });
    assert.equal(ghCalls.length, 1);
    assert.equal(ghCalls[0][0], "release");
    assert.equal(ghCalls[0][1], "create");
    assert.equal(ghCalls[0][2], tag);
    assert.equal(ghCalls[0][3], path);
    assert.ok(ghCalls[0].includes("--latest=false"));
    assert.equal(apiCalls.length, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publishing retries a temporarily invisible release after create and verifies its exact asset", { timeout: 5_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-release-visible-later-"));
  try {
    const bytes = Buffer.from("fixed artifact bytes");
    const path = join(root, assetName);
    await writeFile(path, bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const ghCalls = [];
    const retryDelays = [];
    let releaseLookups = 0;
    let assetDownloads = 0;

    const result = await publishImmutableReleaseAsset({
      tag,
      assetPath: path,
      assetName,
      sha256,
      sizeBytes: bytes.byteLength,
      runGh: async (args) => { ghCalls.push(args); return { status: 0 }; },
      sleepImpl: async (milliseconds) => { retryDelays.push(milliseconds); },
      fetchImpl: async (url) => {
        if (String(url).endsWith(`/releases/tags/${tag}`)) {
          releaseLookups += 1;
          if (releaseLookups <= 2) return new Response("not found yet", { status: 404 });
          return jsonResponse({
            id: 47,
            tag_name: tag,
            assets: [{ name: assetName, size: bytes.byteLength, browser_download_url: "https://assets.example.invalid/visible-later" }],
          });
        }
        assetDownloads += 1;
        return new Response(bytes, { headers: { "content-type": "application/octet-stream" } });
      },
    });

    assert.deepEqual(result, { assetName, releaseId: 47, state: "published", tag });
    assert.equal(ghCalls.length, 1);
    assert.equal(ghCalls[0][1], "create");
    assert.equal(releaseLookups, 3);
    assert.equal(retryDelays.length, 1);
    assert.equal(assetDownloads, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release visibility polling is bounded and does not issue a second create", { timeout: 5_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-release-never-visible-"));
  try {
    const bytes = Buffer.from("fixed artifact bytes");
    const path = join(root, assetName);
    await writeFile(path, bytes);
    const ghCalls = [];
    const retryDelays = [];
    let releaseLookups = 0;

    await assert.rejects(publishImmutableReleaseAsset({
      tag,
      assetPath: path,
      assetName,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.byteLength,
      runGh: async (args) => { ghCalls.push(args); return { status: 0 }; },
      sleepImpl: async (milliseconds) => { retryDelays.push(milliseconds); },
      fetchImpl: async () => {
        releaseLookups += 1;
        return new Response("not found", { status: 404 });
      },
    }), (error) => error.code === "GITHUB_RELEASE_VERIFY_FAILED");

    assert.equal(ghCalls.length, 1);
    assert.equal(releaseLookups, 9);
    assert.equal(retryDelays.length, 7);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a matching existing release is idempotent and is never uploaded again", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-release-existing-"));
  try {
    const bytes = Buffer.from("fixed artifact bytes");
    const path = join(root, assetName);
    await writeFile(path, bytes);
    let ghCalls = 0;
    const result = await publishImmutableReleaseAsset({
      tag,
      assetPath: path,
      assetName,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.byteLength,
      runGh: async () => { ghCalls += 1; return { status: 0 }; },
      fetchImpl: async (url) => String(url).endsWith(`/releases/tags/${tag}`)
        ? jsonResponse({ id: 45, tag_name: tag, assets: [{ name: assetName, size: bytes.byteLength, browser_download_url: "https://assets.example.invalid/existing" }] })
        : new Response(bytes),
    });
    assert.equal(result.state, "already-published");
    assert.equal(ghCalls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a conflicting existing release asset is rejected without calling GitHub CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-release-conflict-"));
  try {
    const bytes = Buffer.from("fixed artifact bytes");
    const path = join(root, assetName);
    await writeFile(path, bytes);
    let ghCalls = 0;
    await assert.rejects(publishImmutableReleaseAsset({
      tag,
      assetPath: path,
      assetName,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.byteLength,
      runGh: async () => { ghCalls += 1; return { status: 0 }; },
      fetchImpl: async (url) => String(url).endsWith(`/releases/tags/${tag}`)
        ? jsonResponse({ id: 46, tag_name: tag, assets: [{ name: assetName, size: bytes.byteLength, browser_download_url: "https://assets.example.invalid/existing" }] })
        : new Response(Buffer.from("different bytes")),
    }), (error) => error.code === "GITHUB_RELEASE_ASSET_IMMUTABLE_CONFLICT");
    assert.equal(ghCalls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function jsonResponse(value) {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}
