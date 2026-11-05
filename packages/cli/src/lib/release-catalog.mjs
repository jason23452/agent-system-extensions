import { readFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { readAndValidateArchive, sha256 } from "./archive.mjs";
import { validateExtensionCatalog, validateExtensionRelease } from "./contracts.mjs";
import { packageError } from "./errors.mjs";

const CATALOG_SCHEMA = "agent-system.extension-catalog.v1";
const RELEASE_TAG = "agent-system.extension-release.v1";
const PROVENANCE_SCHEMA = "agent-system.extension-release-provenance.v1";
const REPOSITORY = "jason23452/agent-system-extensions";

export async function prepareExtensionRelease(options) {
  const root = resolve(options.repositoryRoot);
  const extensionId = options.extensionId;
  const version = options.version;
  if (typeof extensionId !== "string" || !/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(extensionId)) {
    throw packageError("發布 extension-id 格式無效。", "RELEASE_ID_INVALID");
  }
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw packageError("發布版本必須是 semver。", "RELEASE_VERSION_INVALID");
  }
  if (typeof options.sourceRevision !== "string" || !/^[a-f0-9]{40,64}$/.test(options.sourceRevision)) {
    throw packageError("發布來源必須提供完整 Git revision。", "RELEASE_SOURCE_REVISION_INVALID");
  }

  const packageData = await readAndValidateArchive(options.artifactPath, { extensionId, version });
  const artifactName = `${extensionId}-${version}.aicxt`;
  const tag = `${extensionId}-v${version}`;
  const releaseUrl = `https://github.com/${REPOSITORY}/releases/download/${tag}/${artifactName}`;
  const manifest = packageData.manifest;
  const release = validateExtensionRelease({
    artifact: { sha256: packageData.archiveSha256, sizeBytes: packageData.sizeBytes, url: releaseUrl },
    contractVersion: "1.0.0",
    extensionId,
    hostRequirements: manifest.hostRequirements ?? { minHostVersion: "0.0.0" },
    ...(manifest.metadata === undefined ? {} : { metadata: manifest.metadata }),
    schemaVersion: RELEASE_TAG,
    version,
  });
  const catalogPath = options.catalogPath ?? join(root, "catalog.json");
  const catalog = await readCatalog(catalogPath);
  const nextCatalog = addImmutableRelease(catalog, release);
  const provenancePath = join(root, "releases", extensionId, `${version}.json`);
  const provenance = {
    artifact: { assetName: artifactName, sha256: packageData.archiveSha256, sizeBytes: packageData.sizeBytes, url: releaseUrl },
    extensionId,
    schemaVersion: PROVENANCE_SCHEMA,
    sourceRevision: options.sourceRevision,
    version,
  };
  await assertSameProvenanceIfExists(provenancePath, provenance);

  await atomicWrite(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  await atomicWrite(catalogPath, `${JSON.stringify(nextCatalog, null, 2)}\n`);
  return { artifactName, catalogPath, packageData, provenance, provenancePath, release, tag };
}

export async function prepareCliRelease(options) {
  const root = resolve(options.repositoryRoot);
  const version = options.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw packageError("CLI 發布版本必須是 semver。", "RELEASE_VERSION_INVALID");
  }
  if (typeof options.sourceRevision !== "string" || !/^[a-f0-9]{40,64}$/.test(options.sourceRevision)) {
    throw packageError("CLI 發布來源必須提供完整 Git revision。", "RELEASE_SOURCE_REVISION_INVALID");
  }
  const artifactBytes = await readFile(options.artifactPath).catch(() => {
    throw packageError("CLI npm tarball 不存在。", "RELEASE_ARTIFACT_MISSING");
  });
  const assetName = `agent-system-extensions-cli-${version}.tgz`;
  const tag = `cli-v${version}`;
  const url = `https://github.com/${REPOSITORY}/releases/download/${tag}/${assetName}`;
  const provenance = {
    artifact: { assetName, sha256: sha256(artifactBytes), sizeBytes: artifactBytes.byteLength, url },
    packageName: "@agent-system/extensions-cli",
    schemaVersion: "agent-system.cli-release-provenance.v1",
    sourceRevision: options.sourceRevision,
    version,
  };
  const provenancePath = join(root, "releases", "cli", `${version}.json`);
  await assertSameProvenanceIfExists(provenancePath, provenance);
  await atomicWrite(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  return { assetName, packageSha256: provenance.artifact.sha256, provenance, provenancePath, sizeBytes: artifactBytes.byteLength, tag };
}

export function createEmptyCatalog() {
  return { contractVersion: "1.0.0", extensions: [], schemaVersion: CATALOG_SCHEMA };
}

function addImmutableRelease(catalog, release) {
  const extensions = catalog.extensions.map((extension) => ({
    extensionId: extension.extensionId,
    latestVersion: extension.latestVersion,
    releases: [...extension.releases],
  }));
  const existing = extensions.find((extension) => extension.extensionId === release.extensionId);
  if (!existing) {
    extensions.push({ extensionId: release.extensionId, latestVersion: release.version, releases: [release] });
    extensions.sort((first, second) => first.extensionId.localeCompare(second.extensionId));
    return validateExtensionCatalog({ contractVersion: "1.0.0", extensions, schemaVersion: CATALOG_SCHEMA });
  }

  const sameVersion = existing.releases.find((candidate) => candidate.version === release.version);
  if (sameVersion) {
    if (JSON.stringify(sameVersion) !== JSON.stringify(release)) {
      throw packageError("同一 extensionId/version 已存在不同 release identity；不可覆寫正式版本。", "RELEASE_IMMUTABLE_CONFLICT", {
        extensionId: release.extensionId,
        version: release.version,
        existingSha256: sameVersion.artifact.sha256,
        requestedSha256: release.artifact.sha256,
      });
    }
    return validateExtensionCatalog({ contractVersion: "1.0.0", extensions, schemaVersion: CATALOG_SCHEMA });
  }

  const comparison = compareVersions(release.version, existing.latestVersion);
  if (comparison <= 0) {
    throw packageError("新增 release 不得降低或重複目前 Extension latest precedence。", "RELEASE_LATEST_REGRESSION", {
      extensionId: release.extensionId,
      latestVersion: existing.latestVersion,
      requestedVersion: release.version,
    });
  }
  existing.releases.push(release);
  existing.releases.sort((first, second) => compareVersions(first.version, second.version));
  existing.latestVersion = release.version;
  return validateExtensionCatalog({ contractVersion: "1.0.0", extensions, schemaVersion: CATALOG_SCHEMA });
}

async function readCatalog(path) {
  try {
    const catalog = JSON.parse(await readFile(path, "utf8"));
    return validateExtensionCatalog(catalog);
  } catch (error) {
    if (error?.code === "ENOENT") return createEmptyCatalog();
    if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
      throw packageError("既有 catalog 無效，拒絕覆寫。", "CATALOG_INVALID", { validationCode: error.code });
    }
    throw packageError("既有 catalog 無法解析，拒絕覆寫。", "CATALOG_INVALID");
  }
}

async function assertSameProvenanceIfExists(path, expected) {
  try {
    const existing = JSON.parse(await readFile(path, "utf8"));
    if (JSON.stringify(existing) !== JSON.stringify(expected)) {
      throw packageError("同一 Extension version 的 provenance 已存在且不可覆寫。", "RELEASE_PROVENANCE_CONFLICT", {
        extensionId: expected.extensionId,
        version: expected.version,
      });
    }
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { flag: "wx" });
  await rename(temporary, path).catch(async (error) => {
    await rm(temporary, { force: true });
    throw error;
  });
}

function compareVersions(first, second) {
  const firstMatch = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([^+]+))?(?:\+.*)?$/.exec(first);
  const secondMatch = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([^+]+))?(?:\+.*)?$/.exec(second);
  if (!firstMatch || !secondMatch) throw packageError("catalog 版本不是合法 semver。", "CATALOG_INVALID");
  for (let index = 1; index <= 3; index += 1) {
    const a = BigInt(firstMatch[index]);
    const b = BigInt(secondMatch[index]);
    if (a !== b) return a < b ? -1 : 1;
  }
  const firstPre = firstMatch[4]?.split(".");
  const secondPre = secondMatch[4]?.split(".");
  if (!firstPre || !secondPre) return firstPre ? -1 : secondPre ? 1 : 0;
  for (let index = 0; index < Math.min(firstPre.length, secondPre.length); index += 1) {
    const a = firstPre[index];
    const b = secondPre[index];
    if (a === b) continue;
    const aNumber = /^\d+$/.test(a);
    const bNumber = /^\d+$/.test(b);
    if (aNumber && bNumber) return BigInt(a) < BigInt(b) ? -1 : 1;
    if (aNumber !== bNumber) return aNumber ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return Math.sign(firstPre.length - secondPre.length);
}
