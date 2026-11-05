import { readFile, mkdir, link, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { readAndValidateArchive, sha256 } from "./archive.mjs";
import { validateExtensionCatalog, validateExtensionRelease } from "./contracts.mjs";
import { packageError } from "./errors.mjs";

const CATALOG_SCHEMA = "agent-system.extension-catalog.v1";
const RELEASE_TAG = "agent-system.extension-release.v1";
const PROVENANCE_SCHEMA = "agent-system.extension-release-provenance.v1";
const REPOSITORY = "jason23452/agent-system-extensions";

export async function findPinnedExtensionRelease(options) {
  const root = resolve(options.repositoryRoot);
  const { extensionId, version, sourceRevision } = options;
  const catalogPath = options.catalogPath ?? join(root, "catalog.json");
  const provenancePath = join(root, "releases", extensionId, `${version}.json`);
  const catalog = await readCatalog(catalogPath);
  const catalogRelease = catalog.extensions.find((item) => item.extensionId === extensionId)
    ?.releases.find((item) => item.version === version);
  const provenance = await readOptionalJson(provenancePath, "RELEASE_PROVENANCE_INVALID");

  if (!catalogRelease && !provenance) return undefined;
  if (!catalogRelease || !provenance) {
    throw packageError("固定 Extension release 缺少 catalog 或 provenance；拒絕重新產生覆寫。", "RELEASE_PIN_INCOMPLETE", {
      extensionId,
      version,
    });
  }
  if (provenance.schemaVersion !== PROVENANCE_SCHEMA
    || provenance.extensionId !== extensionId
    || provenance.version !== version
    || provenance.sourceRevision !== sourceRevision
    || provenance.artifact?.assetName !== `${extensionId}-${version}.aicxt`
    || provenance.artifact?.sha256 !== catalogRelease.artifact.sha256
    || provenance.artifact?.sizeBytes !== catalogRelease.artifact.sizeBytes
    || provenance.artifact?.url !== catalogRelease.artifact.url) {
    throw packageError("同一 Extension version 已固定不同來源或 release identity；拒絕建置或覆寫。", "RELEASE_PROVENANCE_CONFLICT", {
      extensionId,
      version,
    });
  }

  const artifactPath = join(root, "extensions", extensionId, "dist", provenance.artifact.assetName);
  const packageData = await readAndValidateArchive(artifactPath, { extensionId, version });
  if (packageData.archiveSha256 !== provenance.artifact.sha256 || packageData.sizeBytes !== provenance.artifact.sizeBytes) {
    throw packageError("固定 Extension artifact bytes 與 provenance 不符；拒絕重新產生覆寫。", "RELEASE_ARTIFACT_IDENTITY_MISMATCH", {
      extensionId,
      version,
    });
  }
  return { artifactPath, catalogPath, catalogRelease, packageData, provenance, provenancePath };
}

export async function findPinnedCliRelease(options) {
  const root = resolve(options.repositoryRoot);
  const { version, sourceRevision } = options;
  const provenancePath = join(root, "releases", "cli", `${version}.json`);
  const provenance = await readOptionalJson(provenancePath, "RELEASE_PROVENANCE_INVALID");
  if (!provenance) return undefined;
  if (provenance.schemaVersion !== "agent-system.cli-release-provenance.v1"
    || provenance.packageName !== "@agent-system/extensions-cli"
    || provenance.version !== version
    || provenance.sourceRevision !== sourceRevision
    || provenance.artifact?.assetName !== `agent-system-extensions-cli-${version}.tgz`) {
    throw packageError("同一 CLI version 已固定不同來源或 release identity；拒絕建置或覆寫。", "RELEASE_PROVENANCE_CONFLICT", { version });
  }
  const artifactPath = join(root, "packages", "cli", "dist", "release", provenance.artifact.assetName);
  const artifactBytes = await readFile(artifactPath).catch(() => {
    throw packageError("CLI 固定 tarball 不存在；拒絕重新產生覆寫 provenance。", "RELEASE_ARTIFACT_MISSING", { version });
  });
  if (sha256(artifactBytes) !== provenance.artifact.sha256 || artifactBytes.byteLength !== provenance.artifact.sizeBytes) {
    throw packageError("固定 CLI tarball bytes 與 provenance 不符；拒絕重新產生覆寫。", "RELEASE_ARTIFACT_IDENTITY_MISMATCH", { version });
  }
  return { artifactBytes, artifactPath, provenance, provenancePath };
}

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

  const pinned = options.finalArtifactPath
    ? await findPinnedExtensionRelease({ ...options, repositoryRoot: root, extensionId, version })
    : undefined;
  if (pinned) return { ...pinned, artifactName: `${extensionId}-${version}.aicxt`, release: pinned.catalogRelease, tag: `${extensionId}-v${version}` };

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

  if (options.finalArtifactPath) {
    await promoteArtifact(packageData.archive, options.finalArtifactPath, packageData.archiveSha256, "Extension");
  }
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
  const pinned = await findPinnedCliRelease({ ...options, repositoryRoot: root, version });
  if (pinned) {
    return {
      ...pinned,
      assetName: pinned.provenance.artifact.assetName,
      packageSha256: pinned.provenance.artifact.sha256,
      sizeBytes: pinned.provenance.artifact.sizeBytes,
      tag: `cli-v${version}`,
    };
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
  if (options.finalArtifactPath) await promoteArtifact(artifactBytes, options.finalArtifactPath, provenance.artifact.sha256, "CLI");
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

async function readOptionalJson(path, code) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw packageError("既有 release provenance 無法解析，拒絕重新產生覆寫。", code);
  }
}

async function promoteArtifact(bytes, destination, expectedSha256, label) {
  const target = resolve(destination);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try {
    try {
      await link(temporary, target);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await readFile(target);
      if (sha256(existing) !== expectedSha256) {
        throw packageError(`${label} 固定版本 artifact 已存在且 hash 不同；拒絕覆寫。`, "RELEASE_IMMUTABLE_CONFLICT", {
          artifactPath: target,
          existingSha256: sha256(existing),
          requestedSha256: expectedSha256,
        });
      }
    }
  } finally {
    await rm(temporary, { force: true });
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
