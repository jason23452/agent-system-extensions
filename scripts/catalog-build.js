import {
  assertReleaseMatchesCatalogEntry,
  catalogEntryFromRelease,
  isSyntheticFixtureEntry,
  mergeCatalogs,
  parseExtensionTag,
  validateCatalog,
} from "../packages/cli/src/catalog.js";

export async function buildOfficialCatalog(existingCatalog, releases, { fetchAsset }) {
  validateCatalog(existingCatalog);
  if (existingCatalog.extensions.some((entry) => entry.id.startsWith("synthetic-") || entry.metadata.package.distributionTestFixture === true)) {
    throw new Error("Synthetic fixture entries are forbidden in the official catalog");
  }
  if (!Array.isArray(releases)) throw new Error("GitHub releases must be an array");
  const existingByIdentity = new Map(existingCatalog.extensions.map((entry) => [`${entry.id}\0${entry.version}`, entry]));
  const newEntries = [];

  for (const release of releases) {
    const tag = release?.tag_name;
    if (typeof tag !== "string") throw new Error("GitHub release is missing tag_name");
    if (tag.startsWith("cli/")) continue;
    const parsed = parseExtensionTag(tag);
    if (!parsed) throw new Error(`Unrecognized release tag in extension distribution repository: ${tag}`);
    if (parsed.id.startsWith("synthetic-")) {
      if (existingByIdentity.has(`${parsed.id}\0${parsed.version}`)) throw new Error(`Synthetic fixture release must never be stored in the official catalog: ${tag}`);
      continue;
    }

    const existing = existingByIdentity.get(`${parsed.id}\0${parsed.version}`);
    if (existing) {
      assertReleaseMatchesCatalogEntry(release, existing);
      continue;
    }
    if (release.draft === true) continue;
    if (typeof fetchAsset !== "function") throw new Error("fetchAsset is required to validate a newly published release");
    const packageAssets = Array.isArray(release.assets) ? release.assets.filter((asset) => typeof asset?.name === "string" && asset.name.toLowerCase().endsWith(".aicxt")) : [];
    if (packageAssets.length !== 1) throw new Error(`New Extension release must have exactly one .aicxt asset: ${tag}`);
    const bytes = await fetchAsset(packageAssets[0].browser_download_url);
    const entry = catalogEntryFromRelease({ release, assetBytes: bytes });
    if (entry.metadata.package.distributionTestFixture === true || isSyntheticFixtureEntry(entry)) {
      throw new Error(`Synthetic fixture release must never be stored in the official catalog: ${tag}`);
    }
    newEntries.push(entry);
  }

  return mergeCatalogs(existingCatalog, { schemaVersion: 1, extensions: newEntries });
}

export async function buildSyntheticCatalog(release, { fetchAsset }) {
  if (typeof fetchAsset !== "function") throw new Error("fetchAsset is required to verify the public synthetic release");
  const packageAssets = Array.isArray(release?.assets) ? release.assets.filter((asset) => typeof asset?.name === "string" && asset.name.toLowerCase().endsWith(".aicxt")) : [];
  if (packageAssets.length !== 1) throw new Error("Synthetic release must contain exactly one .aicxt asset");
  const bytes = await fetchAsset(packageAssets[0].browser_download_url);
  const entry = catalogEntryFromRelease({ release, assetBytes: bytes });
  if (!isSyntheticFixtureEntry(entry)) throw new Error("Synthetic catalog output requires a synthetic- fixture manifest marker");
  return { schemaVersion: 1, extensions: [entry] };
}
