import test from "node:test";
import assert from "node:assert/strict";
import { GitHubApiError } from "../scripts/github.js";
import { updateOfficialCatalog } from "../scripts/update-catalog.js";
import { catalogEntryFromRelease } from "../packages/cli/src/catalog.js";
import { manifestFor, releaseFor } from "../test-support/fixtures.js";

function ordinaryRelease(extensionId) {
  return releaseFor({
    extensionId,
    version: "1.0.0",
    manifest: manifestFor({ extensionId, version: "1.0.0", metadata: { distributionTestFixture: false } }),
  });
}

function contentsFor(catalog, sha) {
  return { type: "file", encoding: "base64", sha, content: Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`).toString("base64") };
}

test("optimistic catalog retry rereads concurrent writes and retains every release", async () => {
  const currentRelease = ordinaryRelease("alpha-extension");
  const concurrentRelease = ordinaryRelease("beta-extension");
  const concurrentEntry = catalogEntryFromRelease({ release: concurrentRelease.release, assetBytes: concurrentRelease.assetBytes });
  let remote = contentsFor({ schemaVersion: 1, extensions: [] }, "sha-0");
  let puts = 0;
  const assets = new Map([[currentRelease.release.assets[0].browser_download_url, currentRelease.assetBytes]]);
  const client = {
    getContents: async () => remote,
    listReleases: async () => [currentRelease.release],
    fetchPublicAsset: async (url) => assets.get(url),
    putContents: async (_path, payload) => {
      puts += 1;
      if (puts === 1) {
        remote = contentsFor({ schemaVersion: 1, extensions: [concurrentEntry] }, "sha-concurrent");
        throw new GitHubApiError(409, "/contents/catalog.json");
      }
      remote = { type: "file", encoding: "base64", sha: "sha-merged", content: payload.content };
      return remote;
    },
  };

  const result = await updateOfficialCatalog({ client });

  assert.equal(result.changed, true);
  assert.equal(result.attempts, 2);
  assert.equal(puts, 2);
  assert.deepEqual(result.catalog.extensions.map(({ id }) => id), ["alpha-extension", "beta-extension"]);
  assert.deepEqual(JSON.parse(Buffer.from(remote.content, "base64").toString("utf8")).extensions.map(({ id }) => id), ["alpha-extension", "beta-extension"]);
});
