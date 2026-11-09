import test from "node:test";
import assert from "node:assert/strict";
import { catalogEntryFromRelease, mergeCatalogs, validateCatalog } from "../packages/cli/src/catalog.js";
import { manifestFor, releaseFor } from "../test-support/fixtures.js";

test("an empty versioned catalog is valid", () => {
  assert.equal(validateCatalog({ schemaVersion: 1, extensions: [] }), true);
});

test("a catalog entry records exact release identity, channel, asset hash and manifest metadata", () => {
  const release = releaseFor({ version: "1.2.3" });
  const entry = catalogEntryFromRelease({ release: release.release, assetBytes: release.assetBytes });

  assert.deepEqual(entry, {
    id: "synthetic-fixture",
    version: "1.2.3",
    channel: "stable",
    tag: "synthetic-fixture-1.2.3",
    asset: {
      name: "synthetic-fixture-1.2.3.aicxt",
      url: "https://github.com/jason23452/agent-system-extensions/releases/download/synthetic-fixture-1.2.3/synthetic-fixture-1.2.3.aicxt",
      sha256: "a1f0b76d5f4a3b2be13a4ee67b1e954424c2a33ab59d4a6882da9737760ae115",
      size: release.assetBytes.length,
    },
    compatibility: { agentSystem: "*" },
    metadata: {
      displayName: "Synthetic Fixture",
      description: "Synthetic release used by the distribution contract tests.",
      package: { distributionTestFixture: true, capabilities: ["fixture.echo"] },
    },
  });
  assert.equal(validateCatalog({ schemaVersion: 1, extensions: [entry] }), true);
});

test("a SemVer prerelease requires a GitHub prerelease and maps to the dev channel", () => {
  const { release, assetBytes } = releaseFor({ version: "1.2.3-dev.1", prerelease: true });
  const entry = catalogEntryFromRelease({ release, assetBytes });

  assert.equal(entry.channel, "dev");
  assert.equal(entry.version, "1.2.3-dev.1");
  assert.equal(validateCatalog({ schemaVersion: 1, extensions: [entry] }), true);
});

test("build metadata stays stable and prerelease comparison follows SemVer precedence", async () => {
  const { channelForVersion, compareSemVer } = await import("../packages/cli/src/catalog.js");
  assert.equal(channelForVersion("1.2.3+build-tag"), "stable");
  assert.equal(channelForVersion("1.2.3-dev-build.1"), "dev");
  assert.equal(compareSemVer("1.2.3-dev.2", "1.2.3-dev.10"), -1);
  assert.equal(compareSemVer("1.2.3-dev.10", "1.2.3"), -1);
});

test("release validation rejects tag, manifest, channel, asset and hash inconsistencies", () => {
  const stable = releaseFor({ version: "1.2.3" });
  assert.throws(() => catalogEntryFromRelease({
    release: { ...stable.release, tag_name: "synthetic-fixture-1.2.4" },
    assetBytes: stable.assetBytes,
  }), /tag|version|asset/i);
  assert.throws(() => catalogEntryFromRelease({
    release: stable.release,
    assetBytes: releaseFor({ version: "1.2.4" }).assetBytes,
  }), /size|tag|version/i);
  assert.throws(() => catalogEntryFromRelease({
    release: { ...stable.release, prerelease: true },
    assetBytes: stable.assetBytes,
  }), /channel|prerelease/i);
  assert.throws(() => catalogEntryFromRelease({
    release: { ...stable.release, assets: [] },
    assetBytes: stable.assetBytes,
  }), /asset/i);
  assert.throws(() => catalogEntryFromRelease({
    release: { ...stable.release, assets: [{ ...stable.release.assets[0], size: stable.assetBytes.length + 1 }] },
    assetBytes: stable.assetBytes,
  }), /size/i);
  assert.throws(() => catalogEntryFromRelease({
    release: { ...stable.release, assets: [{ ...stable.release.assets[0], digest: `sha256:${"0".repeat(64)}` }] },
    assetBytes: stable.assetBytes,
  }), /digest|SHA-256/i);
  assert.throws(() => catalogEntryFromRelease({
    release: stable.release,
    assetBytes: Buffer.concat([stable.assetBytes, Buffer.from("tampered")]),
  }), /size|hash/i);
});

test("release validation rejects empty agentSystem compatibility in the manifest", () => {
  const emptyManifestRelease = releaseFor({
    manifest: { ...manifestFor(), compatibility: { agentSystem: "" } },
  });
  assert.throws(() => catalogEntryFromRelease({
    release: emptyManifestRelease.release,
    assetBytes: emptyManifestRelease.assetBytes,
  }), /compatibility\.agentSystem/i);
});

test("catalog validation rejects empty agentSystem compatibility", () => {
  const validRelease = releaseFor();
  const validEntry = catalogEntryFromRelease({ release: validRelease.release, assetBytes: validRelease.assetBytes });
  assert.throws(() => validateCatalog({
    schemaVersion: 1,
    extensions: [{ ...validEntry, compatibility: { ...validEntry.compatibility, agentSystem: "" } }],
  }), /compatibility\.agentSystem/i);
});

test("missing, wildcard and SemVer-range agentSystem compatibility remain valid", () => {
  const cases = [
    { manifest: manifestFor(), expected: "*" },
    { manifest: { ...manifestFor(), compatibility: { agentSystem: "*" } }, expected: "*" },
    { manifest: { ...manifestFor(), compatibility: { agentSystem: ">=1.2.0 <2.0.0" } }, expected: ">=1.2.0 <2.0.0" },
  ];

  for (const { manifest, expected } of cases) {
    const { release, assetBytes } = releaseFor({ manifest });
    const entry = catalogEntryFromRelease({ release, assetBytes });
    assert.equal(entry.compatibility.agentSystem, expected);
    assert.equal(validateCatalog({ schemaVersion: 1, extensions: [entry] }), true);
  }
});

test("catalog validation rejects malformed versions, incorrect channels, unsafe asset URLs and duplicate releases", () => {
  const stable = releaseFor({ version: "1.2.3" });
  const entry = catalogEntryFromRelease({ release: stable.release, assetBytes: stable.assetBytes });

  assert.throws(() => validateCatalog({ schemaVersion: 2, extensions: [] }), /schemaVersion/i);
  assert.throws(() => validateCatalog({ schemaVersion: 1, extensions: [{ ...entry, version: "01.2.3" }] }), /version|tag/i);
  assert.throws(() => validateCatalog({ schemaVersion: 1, extensions: [{ ...entry, channel: "dev" }] }), /channel/i);
  assert.throws(() => validateCatalog({ schemaVersion: 1, extensions: [{ ...entry, asset: { ...entry.asset, url: "https://example.test/package.aicxt" } }] }), /asset|url/i);
  assert.throws(() => validateCatalog({ schemaVersion: 1, extensions: [entry, entry] }), /duplicate/i);
});

test("catalog merges are monotonic, idempotent and reject mutation of a published version", () => {
  const stable = releaseFor({ version: "1.2.3" });
  const prerelease = releaseFor({ version: "1.3.0-dev.1", prerelease: true });
  const first = catalogEntryFromRelease({ release: stable.release, assetBytes: stable.assetBytes });
  const second = catalogEntryFromRelease({ release: prerelease.release, assetBytes: prerelease.assetBytes });
  const empty = { schemaVersion: 1, extensions: [] };

  const combined = mergeCatalogs(empty, { schemaVersion: 1, extensions: [first] }, { schemaVersion: 1, extensions: [second] });
  assert.deepEqual(combined.extensions.map(({ version }) => version), ["1.2.3", "1.3.0-dev.1"]);
  assert.deepEqual(mergeCatalogs(combined, { schemaVersion: 1, extensions: [first] }), combined);
  assert.throws(() => mergeCatalogs(combined, { schemaVersion: 1, extensions: [{ ...first, asset: { ...first.asset, sha256: "a".repeat(64) } }] }), /immutable|conflict/i);
});

test("synthetic fixture releases are identifiable without changing the catalog schema", () => {
  const { release, assetBytes } = releaseFor({ version: "1.2.3-dev.1", prerelease: true });
  const entry = catalogEntryFromRelease({ release, assetBytes });

  assert.equal(entry.metadata.package.distributionTestFixture, true);
  assert.equal(validateCatalog({ schemaVersion: 1, extensions: [entry] }), true);
});
