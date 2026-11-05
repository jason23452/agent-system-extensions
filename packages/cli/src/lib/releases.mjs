import { validateExtensionCatalog, checkExtensionHostCompatibility } from "./contracts.mjs";
import { validateAicxtArchive } from "./archive.mjs";
import { cacheVerifiedArtifact, readCachedArtifact } from "./cache.mjs";
import { sourceError, usageError } from "./errors.mjs";

export const DEFAULT_CATALOG_URL = "https://raw.githubusercontent.com/jason23452/agent-system-extensions/main/catalog.json";
const EXTENSION_ID = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_CATALOG_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

export async function resolveReleaseArtifact(options) {
  validateIdentityOptions(options);
  const cacheRoot = options.cacheRoot;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (options.offline) {
    if (!options.version) throw usageError("離線安裝必須明確指定 --version；不會猜測 latest。", "OFFLINE_VERSION_REQUIRED");
    const packageData = await readCachedArtifact(cacheRoot, {
      extensionId: options.extensionId,
      version: options.version,
      ...(options.packageSha256 ? { packageSha256: options.packageSha256 } : {}),
    });
    return { packageData, source: "verified-cache" };
  }

  const catalogUrl = options.catalogUrl ?? DEFAULT_CATALOG_URL;
  validatePublicCatalogUrl(catalogUrl);
  const catalog = await readCatalog(catalogUrl, fetchImpl);
  const entry = catalog.extensions.find((extension) => extension.extensionId === options.extensionId);
  if (!entry) throw sourceError(`公開 catalog 沒有 Extension：${options.extensionId}`, "EXTENSION_NOT_FOUND", { extensionId: options.extensionId });
  const version = options.version ?? entry.latestVersion;
  const release = entry.releases.find((candidate) => candidate.version === version);
  if (!release) throw sourceError(`Extension ${options.extensionId} 沒有版本 ${version}。`, "EXTENSION_VERSION_NOT_FOUND", {
    extensionId: options.extensionId,
    version,
  });
  if (options.packageSha256 && release.artifact.sha256 !== options.packageSha256) {
    throw sourceError("Catalog 版本的 SHA-256 與明確指定值不同；拒絕改用其他版本。", "RELEASE_HASH_MISMATCH", {
      extensionId: release.extensionId,
      version: release.version,
      expectedPackageSha256: options.packageSha256,
      catalogPackageSha256: release.artifact.sha256,
    });
  }
  if (options.hostVersion) {
    const compatibility = checkExtensionHostCompatibility(release.hostRequirements, options.hostVersion, options.hostCapabilities ?? []);
    if (!compatibility.compatible) throw sourceError("目標平台不符合 Extension host requirements。", "HOST_INCOMPATIBLE", {
      reasons: compatibility.reasons,
    });
  }

  try {
    const cached = await readCachedArtifact(cacheRoot, {
      extensionId: release.extensionId,
      version: release.version,
      packageSha256: release.artifact.sha256,
    });
    if (cached.sizeBytes !== release.artifact.sizeBytes) {
      throw sourceError("已驗證快取大小與 catalog 固定版本不符。", "ARTIFACT_SIZE_MISMATCH", {
        extensionId: release.extensionId,
        version: release.version,
      });
    }
    return { packageData: cached, release, source: "verified-cache" };
  } catch (error) {
    if (error?.code !== "CACHE_ARTIFACT_MISSING") throw error;
  }

  const response = await request(fetchImpl, release.artifact.url, "artifact");
  const mediaType = response.headers?.get?.("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType === "text/html" || mediaType === "application/xhtml+xml") {
    throw sourceError("artifact 下載回傳 HTML，不是 Extension 套件。", "ARTIFACT_NOT_PACKAGE");
  }
  let archive;
  try {
    archive = Buffer.from(await response.arrayBuffer());
  } catch {
    throw sourceError("無法讀取 Extension artifact 回應內容。", "ARTIFACT_DOWNLOAD_INVALID");
  }
  if (archive.byteLength !== release.artifact.sizeBytes) {
    throw sourceError("Extension artifact 大小與 catalog 不符。", "ARTIFACT_SIZE_MISMATCH", {
      expectedSizeBytes: release.artifact.sizeBytes,
      actualSizeBytes: archive.byteLength,
    });
  }
  const { createHash } = await import("node:crypto");
  const actualHash = createHash("sha256").update(archive).digest("hex");
  if (actualHash !== release.artifact.sha256) {
    throw sourceError("Extension artifact SHA-256 與 catalog 不符；不會嘗試其他版本。", "ARTIFACT_HASH_MISMATCH", {
      extensionId: release.extensionId,
      version: release.version,
      expectedSha256: release.artifact.sha256,
      actualSha256: actualHash,
    });
  }
  const packageData = validateAicxtArchive(archive, { extensionId: release.extensionId, version: release.version });
  const cachePath = await cacheVerifiedArtifact(cacheRoot, packageData);
  return { packageData: { ...packageData, cachePath }, release, source: "github" };
}

async function readCatalog(url, fetchImpl) {
  const response = await request(fetchImpl, url, "catalog");
  const mediaType = response.headers?.get?.("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType === "text/html" || mediaType === "application/xhtml+xml") {
    throw sourceError("Catalog URL 回傳 HTML，不是 JSON catalog。", "CATALOG_INVALID");
  }
  let text;
  try {
    text = await response.text();
  } catch {
    throw sourceError("無法讀取公開 Extension catalog。", "CATALOG_INVALID");
  }
  if (Buffer.byteLength(text, "utf8") > MAX_CATALOG_BYTES) throw sourceError("Extension catalog 超過 4 MiB。", "CATALOG_INVALID");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw sourceError("Extension catalog 不是有效 JSON。", "CATALOG_INVALID");
  }
  try {
    return validateExtensionCatalog(value);
  } catch (error) {
    throw sourceError("Extension catalog 不符合已支援的 release contract。", error?.code ?? "CATALOG_CONTRACT_INVALID");
  }
}

async function request(fetchImpl, url, label) {
  if (typeof fetchImpl !== "function") throw sourceError("目前 Node.js 環境沒有 fetch API。", "HTTP_CLIENT_UNAVAILABLE");
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: label === "catalog" ? "application/json" : "application/octet-stream" },
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw sourceError(`${label === "catalog" ? "Catalog" : "Extension artifact"} 下載失敗。`, label === "catalog" ? "CATALOG_UNAVAILABLE" : "ARTIFACT_UNAVAILABLE");
  }
  if (!response || !response.ok) {
    throw sourceError(`${label === "catalog" ? "Catalog" : "Extension artifact"} HTTP 下載失敗。`, label === "catalog" ? "CATALOG_UNAVAILABLE" : "ARTIFACT_UNAVAILABLE", {
      status: Number.isInteger(response?.status) ? response.status : undefined,
    });
  }
  if (response.redirected && response.url) {
    let target;
    try {
      target = new URL(response.url);
    } catch {
      throw sourceError("下載重新導向目標格式無效。", "DOWNLOAD_REDIRECT_INVALID");
    }
    if (target.protocol !== "https:" || target.username || target.password) {
      throw sourceError("下載重新導向目標不是安全 HTTPS。", "DOWNLOAD_REDIRECT_INVALID");
    }
  }
  return response;
}

function validateIdentityOptions(options) {
  if (!options || typeof options.extensionId !== "string" || !EXTENSION_ID.test(options.extensionId)) {
    throw usageError("extension-id 格式無效。", "EXTENSION_ID_INVALID");
  }
  if (options.version !== undefined && (typeof options.version !== "string" || !VERSION.test(options.version))) {
    throw usageError("--version 必須是合法 semver。", "EXTENSION_VERSION_INVALID");
  }
  if (options.packageSha256 !== undefined && (typeof options.packageSha256 !== "string" || !SHA256.test(options.packageSha256))) {
    throw usageError("--sha256 必須是 64 位小寫 SHA-256。", "PACKAGE_HASH_INVALID");
  }
}

function validatePublicCatalogUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw usageError("--catalog-url 必須是絕對 HTTP(S) URL。", "CATALOG_URL_INVALID");
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname.replace(/^\[|\]$/g, ""));
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) || url.username || url.password || url.hash) {
    throw usageError("Catalog 預設只允許 HTTPS；測試 HTTP 僅限 loopback。", "CATALOG_URL_INVALID");
  }
}
