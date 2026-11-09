import test from "node:test";
import assert from "node:assert/strict";
import { buildOfficialCatalog } from "../scripts/catalog-build.js";
import { catalogEntryFromRelease } from "../packages/cli/src/catalog.js";
import { manifestFor, releaseFor } from "../test-support/fixtures.js";

function ordinaryRelease(extensionId, version) {
  return releaseFor({
    extensionId,
    version,
    manifest: manifestFor({ extensionId, version, metadata: { distributionTestFixture: false, capabilities: ["sample.read"] } }),
  });
}

test("official catalog retains history and excludes synthetic fixture releases", async () => {
  const oldRelease = ordinaryRelease("sample-extension", "1.0.0");
  const nextRelease = ordinaryRelease("sample-extension", "1.1.0");
  const synthetic = releaseFor({ version: "1.2.3-dev.1", prerelease: true });
  const oldEntry = catalogEntryFromRelease({ release: oldRelease.release, assetBytes: oldRelease.assetBytes });
  const existing = { schemaVersion: 1, extensions: [oldEntry] };
  const bytesByUrl = new Map([
    [nextRelease.release.assets[0].browser_download_url, nextRelease.assetBytes],
    [synthetic.release.assets[0].browser_download_url, synthetic.assetBytes],
  ]);

  const catalog = await buildOfficialCatalog(existing, [oldRelease.release, nextRelease.release, synthetic.release], {
    fetchAsset: async (url) => bytesByUrl.get(url),
  });

  assert.deepEqual(catalog.extensions.map(({ id, version }) => `${id}@${version}`), ["sample-extension@1.0.0", "sample-extension@1.1.0"]);
});

test("official catalog refuses an existing synthetic fixture entry", async () => {
  const synthetic = releaseFor({ version: "1.2.3-dev.1", prerelease: true });
  const entry = catalogEntryFromRelease({ release: synthetic.release, assetBytes: synthetic.assetBytes });

  await assert.rejects(buildOfficialCatalog({ schemaVersion: 1, extensions: [entry] }, [], { fetchAsset: async () => Buffer.alloc(0) }), /synthetic fixture/i);
});

test("catalog refresh rejects release metadata mutation instead of overwriting a published version", async () => {
  const original = ordinaryRelease("sample-extension", "1.0.0");
  const entry = catalogEntryFromRelease({ release: original.release, assetBytes: original.assetBytes });
  const changed = { ...original.release, prerelease: true };

  await assert.rejects(buildOfficialCatalog({ schemaVersion: 1, extensions: [entry] }, [changed], { fetchAsset: async () => original.assetBytes }), /metadata changed|channel metadata/i);
});
