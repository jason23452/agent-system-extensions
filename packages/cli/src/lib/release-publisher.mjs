import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { basename } from "node:path";
import { sha256 } from "./archive.mjs";
import { packageError } from "./errors.mjs";

const API_ROOT = "https://api.github.com/repos";
const REPOSITORY = "jason23452/agent-system-extensions";
const RELEASE_VERIFICATION_TIMEOUT_MS = 30_000;
const RELEASE_VISIBILITY_RETRY_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000, 8_000, 8_000];

export async function publishImmutableReleaseAsset(options) {
  const assetPath = options.assetPath;
  const assetName = options.assetName ?? basename(assetPath);
  const assetBytes = await readFile(assetPath).catch(() => {
    throw packageError("找不到已驗證的固定 release artifact。", "RELEASE_ARTIFACT_MISSING");
  });
  const actualSha256 = sha256(assetBytes);
  if (actualSha256 !== options.sha256 || assetBytes.byteLength !== options.sizeBytes) {
    throw packageError("待發布 artifact 與 provenance hash／size 不符；拒絕建 Release。", "RELEASE_ARTIFACT_IDENTITY_MISMATCH", {
      expectedSha256: options.sha256,
      actualSha256,
      expectedSizeBytes: options.sizeBytes,
      actualSizeBytes: assetBytes.byteLength,
    });
  }
  if (basename(assetPath) !== assetName) {
    throw packageError("上傳檔名必須與固定 release asset 名稱相同。", "RELEASE_ASSET_NAME_MISMATCH", {
      expectedName: assetName,
      actualName: basename(assetPath),
    });
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const releaseUrl = `${API_ROOT}/${REPOSITORY}/releases/tags/${encodeURIComponent(options.tag)}`;
  const existing = await getRelease(fetchImpl, releaseUrl);
  if (existing) {
    await assertPublishedAssetIdentity(fetchImpl, existing, assetName, options.sha256, options.sizeBytes);
    return { assetName, releaseId: existing.id, state: "already-published", tag: options.tag };
  }

  const runGh = options.runGh;
  if (typeof runGh !== "function") throw packageError("發布需要已安裝並授權的 GitHub CLI。", "GITHUB_CLI_REQUIRED");
  const result = await runGh([
    "release", "create", options.tag, assetPath,
    "--repo", REPOSITORY,
    "--title", options.title ?? options.tag,
    "--notes", options.notes ?? `Immutable release asset ${assetName}`,
    "--latest=false",
  ]);
  if (!result || result.status !== 0) {
    throw packageError("GitHub Release 建立失敗；請保留 artifact 並檢查 gh 輸出。", "GITHUB_RELEASE_CREATE_FAILED", {
      exitCode: Number.isInteger(result?.status) ? result.status : null,
    });
  }

  const created = await waitForCreatedRelease(fetchImpl, releaseUrl, options);
  if (!created) throw packageError("GitHub CLI 回報成功，但公開 Release 尚不可見。", "GITHUB_RELEASE_VERIFY_FAILED");
  await assertPublishedAssetIdentity(fetchImpl, created, assetName, options.sha256, options.sizeBytes);
  return { assetName, releaseId: created.id, state: "published", tag: options.tag };
}

async function waitForCreatedRelease(fetchImpl, url, options) {
  const deadline = performance.now() + RELEASE_VERIFICATION_TIMEOUT_MS;
  const sleepImpl = options.sleepImpl ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 0; attempt <= RELEASE_VISIBILITY_RETRY_DELAYS_MS.length; attempt += 1) {
    const remainingMs = deadline - performance.now();
    if (remainingMs <= 0) break;

    const release = await getRelease(fetchImpl, url, remainingMs);
    if (release) return release;

    const retryDelayMs = RELEASE_VISIBILITY_RETRY_DELAYS_MS[attempt];
    if (retryDelayMs === undefined) break;
    const timeLeftMs = deadline - performance.now();
    if (timeLeftMs <= 0) break;
    await sleepImpl(Math.min(retryDelayMs, timeLeftMs));
  }

  return undefined;
}

async function getRelease(fetchImpl, url, timeoutMs = 30_000) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
      signal: AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs))),
    });
  } catch {
    throw packageError("無法查詢公開 GitHub Release；不執行寫入。", "GITHUB_RELEASE_LOOKUP_FAILED");
  }
  if (response.status === 404) return undefined;
  if (!response.ok) throw packageError("GitHub Release 查詢失敗；不執行寫入。", "GITHUB_RELEASE_LOOKUP_FAILED", { status: response.status });
  try {
    const value = await response.json();
    if (!Number.isSafeInteger(value.id) || !Array.isArray(value.assets)) throw new Error("Invalid release response");
    return value;
  } catch {
    throw packageError("GitHub Release API 回應格式無效；不執行寫入。", "GITHUB_RELEASE_LOOKUP_FAILED");
  }
}

async function assertPublishedAssetIdentity(fetchImpl, release, assetName, expectedSha256, expectedSizeBytes) {
  const matching = release.assets.filter((asset) => asset.name === assetName);
  if (matching.length !== 1) {
    throw packageError("此 tag 已有 Release，但缺少唯一固定 asset；拒絕追加或覆寫。", "GITHUB_RELEASE_ASSET_CONFLICT", {
      tag: release.tag_name,
      assetName,
    });
  }
  const asset = matching[0];
  if (asset.size !== expectedSizeBytes || typeof asset.browser_download_url !== "string") {
    throw packageError("既有 GitHub asset size 與固定 artifact 不同。", "GITHUB_RELEASE_ASSET_CONFLICT", { assetName });
  }
  let response;
  try {
    response = await fetchImpl(asset.browser_download_url, {
      headers: { accept: "application/octet-stream" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw packageError("無法重取既有 Release asset 以驗證 SHA-256。", "GITHUB_RELEASE_ASSET_VERIFY_FAILED", { assetName });
  }
  if (!response.ok) throw packageError("無法重取既有 Release asset 以驗證 SHA-256。", "GITHUB_RELEASE_ASSET_VERIFY_FAILED", { assetName, status: response.status });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength !== expectedSizeBytes || sha256(bytes) !== expectedSha256) {
    throw packageError("同版 GitHub Release asset 已存在但 hash 不同；不可覆寫正式版本。", "GITHUB_RELEASE_ASSET_IMMUTABLE_CONFLICT", {
      assetName,
      expectedSha256,
      actualSha256: sha256(bytes),
    });
  }
}
