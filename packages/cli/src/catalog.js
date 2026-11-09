import { createHash } from "node:crypto";
import { readAicxtManifest } from "./zip.js";

export const CATALOG_SCHEMA_VERSION = 1;
export const EXTENSION_PACKAGE_SCHEMA = "agent-system.extension-package.v1";
export const RELEASE_REPOSITORY = Object.freeze({ owner: "jason23452", repository: "agent-system-extensions" });

const extensionIdPattern = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

function fail(message) {
  throw new Error(`Invalid Extension Catalog: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, keys, label) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${label} contains unsupported property ${key}`);
}

export function isSemVer(version) {
  if (typeof version !== "string") return false;
  const match = semverPattern.exec(version);
  if (!match) return false;
  const prerelease = match[4];
  if (prerelease && prerelease.split(".").some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) return false;
  return true;
}

export function channelForVersion(version) {
  const match = typeof version === "string" ? semverPattern.exec(version) : null;
  if (!match || !isSemVer(version)) fail(`version ${String(version)} is not SemVer`);
  return match[4] ? "dev" : "stable";
}

export function parseExtensionTag(tag) {
  if (typeof tag !== "string") return null;
  const match = /^([a-z0-9][a-z0-9_.-]{0,63})-((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/.exec(tag);
  if (!match || !isSemVer(match[2])) return null;
  return { id: match[1], version: match[2] };
}

export function compareSemVer(left, right) {
  if (!isSemVer(left) || !isSemVer(right)) fail("cannot compare invalid SemVer values");
  const parse = (value) => {
    const match = semverPattern.exec(value);
    return { core: [match[1], match[2], match[3]].map(BigInt), prerelease: match[4]?.split(".") };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] < b.core[index]) return -1;
    if (a.core[index] > b.core[index]) return 1;
  }
  if (!a.prerelease && !b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    if (a.prerelease[index] === undefined) return -1;
    if (b.prerelease[index] === undefined) return 1;
    const aNumeric = /^\d+$/.test(a.prerelease[index]);
    const bNumeric = /^\d+$/.test(b.prerelease[index]);
    if (aNumeric && bNumeric) {
      const aNumber = BigInt(a.prerelease[index]);
      const bNumber = BigInt(b.prerelease[index]);
      if (aNumber < bNumber) return -1;
      if (aNumber > bNumber) return 1;
    } else if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1;
    } else if (a.prerelease[index] !== b.prerelease[index]) {
      return a.prerelease[index] < b.prerelease[index] ? -1 : 1;
    }
  }
  return 0;
}

function expectedAssetUrl(tag, assetName, { owner, repository }) {
  return `https://github.com/${owner}/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
}

function validateAssetUrl(url, tag, name, repository) {
  if (typeof url !== "string") fail("asset.url must be a string");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail("asset.url must be a valid HTTPS URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) fail("asset.url must be a public HTTPS URL without credentials or query parameters");
  if (url !== expectedAssetUrl(tag, name, repository)) fail("asset.url must point to the exact GitHub release asset for its tag");
}

function validateEntry(entry, index, repository) {
  const label = `extensions[${index}]`;
  if (!isRecord(entry)) fail(`${label} must be an object`);
  hasOnlyKeys(entry, ["id", "version", "channel", "tag", "asset", "compatibility", "metadata"], label);
  if (!extensionIdPattern.test(entry.id ?? "")) fail(`${label}.id is invalid`);
  if (!isSemVer(entry.version)) fail(`${label}.version is not valid SemVer`);
  const expectedChannel = channelForVersion(entry.version);
  if (entry.channel !== expectedChannel) fail(`${label}.channel does not match its SemVer prerelease status`);
  const expectedTag = `${entry.id}-${entry.version}`;
  if (entry.tag !== expectedTag) fail(`${label}.tag does not match id and version`);

  if (!isRecord(entry.asset)) fail(`${label}.asset must be an object`);
  hasOnlyKeys(entry.asset, ["name", "url", "sha256", "size"], `${label}.asset`);
  const expectedName = `${expectedTag}.aicxt`;
  if (entry.asset.name !== expectedName) fail(`${label}.asset.name must be ${expectedName}`);
  validateAssetUrl(entry.asset.url, expectedTag, expectedName, repository);
  if (typeof entry.asset.sha256 !== "string" || !sha256Pattern.test(entry.asset.sha256)) fail(`${label}.asset.sha256 must be a lowercase SHA-256 digest`);
  if (!Number.isSafeInteger(entry.asset.size) || entry.asset.size <= 0) fail(`${label}.asset.size must be a positive safe integer`);

  if (!isRecord(entry.compatibility)) fail(`${label}.compatibility must be an object`);
  if (entry.compatibility.agentSystem !== undefined && typeof entry.compatibility.agentSystem !== "string") fail(`${label}.compatibility.agentSystem must be a string when present`);
  if (!isRecord(entry.metadata)) fail(`${label}.metadata must be an object`);
  hasOnlyKeys(entry.metadata, ["displayName", "description", "package"], `${label}.metadata`);
  if (typeof entry.metadata.displayName !== "string" || entry.metadata.displayName.trim().length === 0 || entry.metadata.displayName.length > 200) fail(`${label}.metadata.displayName is invalid`);
  if (typeof entry.metadata.description !== "string" || entry.metadata.description.length > 2000) fail(`${label}.metadata.description is invalid`);
  if (!isRecord(entry.metadata.package)) fail(`${label}.metadata.package must be an object`);
}

export function validateCatalog(catalog, { owner = RELEASE_REPOSITORY.owner, repository = RELEASE_REPOSITORY.repository } = {}) {
  if (!isRecord(catalog)) fail("document must be an object");
  hasOnlyKeys(catalog, ["schemaVersion", "extensions"], "catalog");
  if (catalog.schemaVersion !== CATALOG_SCHEMA_VERSION) fail(`schemaVersion must be ${CATALOG_SCHEMA_VERSION}`);
  if (!Array.isArray(catalog.extensions)) fail("extensions must be an array");
  const identities = new Set();
  catalog.extensions.forEach((entry, index) => {
    validateEntry(entry, index, { owner, repository });
    const identity = `${entry.id}\0${entry.version}`;
    if (identities.has(identity)) fail(`duplicate release ${entry.id}@${entry.version}`);
    identities.add(identity);
  });
  return true;
}

function validateManifest(manifest) {
  if (!isRecord(manifest)) throw new Error(".aicxt extension.json must contain an object");
  if (manifest.schemaVersion !== EXTENSION_PACKAGE_SCHEMA) throw new Error(".aicxt extension.json has an unsupported schemaVersion");
  if (typeof manifest.extensionId !== "string" || !extensionIdPattern.test(manifest.extensionId)) throw new Error(".aicxt extension.json has an invalid extensionId");
  if (typeof manifest.displayName !== "string" || manifest.displayName.trim().length === 0 || manifest.displayName.length > 200) throw new Error(".aicxt extension.json has an invalid displayName");
  if (manifest.description !== undefined && (typeof manifest.description !== "string" || manifest.description.length > 2000)) throw new Error(".aicxt extension.json has an invalid description");
  if (!isSemVer(manifest.version)) throw new Error(".aicxt extension.json has an invalid SemVer version");
  if (manifest.compatibility !== undefined && !isRecord(manifest.compatibility)) throw new Error(".aicxt extension.json compatibility must be an object");
  if (manifest.metadata !== undefined && !isRecord(manifest.metadata)) throw new Error(".aicxt extension.json metadata must be an object");
  if (manifest.compatibility?.agentSystem !== undefined && typeof manifest.compatibility.agentSystem !== "string") throw new Error(".aicxt extension.json compatibility.agentSystem must be a string");
  return manifest;
}

export function catalogEntryFromRelease({ release, assetBytes, owner = RELEASE_REPOSITORY.owner, repository = RELEASE_REPOSITORY.repository }) {
  if (!isRecord(release)) throw new Error("GitHub release metadata must be an object");
  const parsedTag = parseExtensionTag(release.tag_name);
  if (!parsedTag) throw new Error("GitHub release tag must use <extensionId>-<SemVer>");
  if (release.draft !== false) throw new Error("GitHub release must be published, not draft");
  if (typeof release.prerelease !== "boolean") throw new Error("GitHub release prerelease metadata must be boolean");
  const channel = channelForVersion(parsedTag.version);
  if (release.prerelease !== (channel === "dev")) throw new Error("GitHub release prerelease marker does not match the SemVer channel");
  if (!Array.isArray(release.assets)) throw new Error("GitHub release assets must be an array");
  const expectedName = `${release.tag_name}.aicxt`;
  const packageAssets = release.assets.filter((asset) => typeof asset?.name === "string" && asset.name.toLowerCase().endsWith(".aicxt"));
  if (packageAssets.length !== 1 || packageAssets[0].name !== expectedName) throw new Error(`GitHub release must contain exactly one ${expectedName} asset`);
  const asset = packageAssets[0];
  if (asset.state !== undefined && asset.state !== "uploaded") throw new Error("GitHub release asset is not fully uploaded");
  if (!Number.isSafeInteger(asset.size) || asset.size <= 0) throw new Error("GitHub release asset size must be a positive integer");
  if (!Buffer.isBuffer(assetBytes)) assetBytes = Buffer.from(assetBytes ?? []);
  if (assetBytes.length !== asset.size) throw new Error("GitHub release asset size does not match the downloaded asset bytes");
  validateAssetUrl(asset.browser_download_url, release.tag_name, expectedName, { owner, repository });

  const manifest = validateManifest(readAicxtManifest(assetBytes));
  if (manifest.extensionId !== parsedTag.id) throw new Error("GitHub tag extension ID does not match .aicxt manifest extensionId");
  if (manifest.version !== parsedTag.version) throw new Error("GitHub tag version does not match .aicxt manifest version");
  const sha256 = createHash("sha256").update(assetBytes).digest("hex");
  if (asset.digest !== undefined && asset.digest !== null) {
    if (typeof asset.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(asset.digest) || asset.digest.slice("sha256:".length) !== sha256) {
      throw new Error("GitHub release asset digest does not match the downloaded asset SHA-256");
    }
  }
  const entry = {
    id: parsedTag.id,
    version: parsedTag.version,
    channel,
    tag: release.tag_name,
    asset: {
      name: expectedName,
      url: asset.browser_download_url,
      sha256,
      size: assetBytes.length,
    },
    compatibility: { agentSystem: "*", ...(manifest.compatibility ?? {}) },
    metadata: {
      displayName: manifest.displayName.trim(),
      description: manifest.description?.trim() ?? "",
      package: manifest.metadata ?? {},
    },
  };
  validateEntry(entry, 0, { owner, repository });
  return entry;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function mergeCatalogs(...catalogs) {
  const entries = new Map();
  for (const catalog of catalogs) {
    validateCatalog(catalog);
    for (const entry of catalog.extensions) {
      const identity = `${entry.id}\0${entry.version}`;
      const existing = entries.get(identity);
      if (existing && stableStringify(existing) !== stableStringify(entry)) {
        throw new Error(`Published release ${entry.id}@${entry.version} is immutable and conflicts with catalog metadata`);
      }
      entries.set(identity, existing ?? entry);
    }
  }
  const extensions = [...entries.values()].sort((left, right) => left.id.localeCompare(right.id) || compareSemVer(left.version, right.version) || left.version.localeCompare(right.version));
  const merged = { schemaVersion: CATALOG_SCHEMA_VERSION, extensions };
  validateCatalog(merged);
  return merged;
}

export function isSyntheticFixtureEntry(entry) {
  return entry?.id?.startsWith("synthetic-") === true && entry.metadata?.package?.distributionTestFixture === true;
}

export function assertReleaseMatchesCatalogEntry(release, entry, { owner = RELEASE_REPOSITORY.owner, repository = RELEASE_REPOSITORY.repository } = {}) {
  const parsedTag = parseExtensionTag(release?.tag_name);
  if (!parsedTag || parsedTag.id !== entry.id || parsedTag.version !== entry.version || entry.tag !== release.tag_name) {
    throw new Error(`Published release metadata does not match catalog identity ${entry.id}@${entry.version}`);
  }
  if (release.draft !== false || release.prerelease !== (entry.channel === "dev")) {
    throw new Error(`Published release channel metadata changed for ${entry.tag}`);
  }
  const assets = Array.isArray(release.assets) ? release.assets.filter((asset) => typeof asset?.name === "string" && asset.name.toLowerCase().endsWith(".aicxt")) : [];
  if (assets.length !== 1) throw new Error(`Published release must contain exactly one .aicxt asset: ${entry.tag}`);
  const [asset] = assets;
  if (asset.name !== entry.asset.name || asset.size !== entry.asset.size) throw new Error(`Published asset metadata changed for ${entry.tag}`);
  validateAssetUrl(asset.browser_download_url, entry.tag, entry.asset.name, { owner, repository });
  if (asset.browser_download_url !== entry.asset.url) throw new Error(`Published asset location changed for ${entry.tag}`);
  if (asset.digest !== undefined && asset.digest !== null && asset.digest !== `sha256:${entry.asset.sha256}`) {
    throw new Error(`Published asset digest changed for ${entry.tag}`);
  }
  return true;
}
