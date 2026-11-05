import { randomUUID } from "node:crypto";
import { cacheVerifiedArtifact, readOperation, saveOperation } from "./cache.mjs";
import { packageSummary, readAndValidateArchive, sha256 } from "./archive.mjs";
import { resolveReleaseArtifact } from "./releases.mjs";
import { packageError, platformError, usageError } from "./errors.mjs";

const INSTALL_OPERATION_SCHEMA = "agent-system.extension-install-operation-retry.v1";
const INSTALL_OPERATION_STATUS_SCHEMA = "agent-system.extension-install-operation.v1";
const REQUEST_TIMEOUT_MS = 60_000;

export async function installExtension(options, dependencies = {}) {
  const target = resolveInstallTarget(options);
  const cacheRoot = options.cacheRoot;
  const platformUrl = normalizePlatformUrl(options.platform);
  const source = await resolvePackageSource(options, dependencies);
  const packageData = source.packageData;
  const packageSha256 = packageData.archiveSha256;
  const identity = {
    extensionId: packageData.manifest.extensionId,
    packageSha256,
    scope: target.scope,
    ...(target.project ? { project: target.project } : {}),
    version: packageData.manifest.version,
  };
  const operationId = (dependencies.randomUUID ?? randomUUID)();
  const operationRecord = {
    identity,
    operationId,
    platformUrl,
    schemaVersion: INSTALL_OPERATION_SCHEMA,
  };
  await saveOperation(cacheRoot, operationRecord);

  const form = new FormData();
  form.set("file", new Blob([packageData.archive], { type: "application/octet-stream" }), `${identity.extensionId}.aicxt`);
  form.set("scope", target.scope);
  if (target.project) form.set("project", target.project);
  form.set("extend", options.extend ? "true" : "false");
  form.set("expectedExtensionId", identity.extensionId);
  form.set("expectedVersion", identity.version);
  form.set("expectedPackageSha256", identity.packageSha256);
  form.set("operationId", operationId);

  const response = await request(dependencies.fetchImpl ?? globalThis.fetch, `${platformUrl}/bff/extensions/install`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }, operationId);
  if (response.status === 413) throw platformResponseError(response.status, {}, operationId);
  const body = await readJsonResponse(response, operationId);
  if (!response.ok) throw platformResponseError(response.status, body, operationId);
  const status = validateOperationStatus(body.operation, operationId, identity);
  await saveOperation(cacheRoot, { ...operationRecord, lastStatus: status });
  return { ...packageSummary(packageData), operation: status, source: source.source };
}

export async function readInstallStatus(operationId, dependencies = {}) {
  const cacheRoot = dependencies.cacheRoot;
  const record = await readOperation(cacheRoot, operationId);
  const status = await sendRetryRequest(record, "query-status", dependencies);
  await saveOperation(cacheRoot, { ...record, lastStatus: status });
  return status;
}

export async function retryInstall(operationId, dependencies = {}) {
  const cacheRoot = dependencies.cacheRoot;
  const record = await readOperation(cacheRoot, operationId);
  const queried = await sendRetryRequest(record, "query-status", dependencies);
  if (isComplete(queried)) {
    await saveOperation(cacheRoot, { ...record, lastStatus: queried });
    return queried;
  }
  if (queried.status === "unknown" || queried.retryAction === "query-first") {
    await saveOperation(cacheRoot, { ...record, lastStatus: queried });
    return queried;
  }
  if (queried.retryAction !== "resume") {
    await saveOperation(cacheRoot, { ...record, lastStatus: queried });
    return queried;
  }
  const resumed = await sendRetryRequest(record, "resume", dependencies);
  await saveOperation(cacheRoot, { ...record, lastStatus: resumed });
  return resumed;
}

async function resolvePackageSource(options, dependencies) {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  if (options.file) {
    if (options.offline) throw usageError("--file 與 --offline 不可同時使用。");
    const packageData = await readAndValidateArchive(options.file, {
      ...(options.extensionId ? { extensionId: options.extensionId } : {}),
      ...(options.version ? { version: options.version } : {}),
    });
    if (options.packageSha256 && packageData.archiveSha256 !== options.packageSha256) {
      throw packageError("本地套件 SHA-256 與 --sha256 不符。", "ARTIFACT_HASH_MISMATCH", {
        expectedSha256: options.packageSha256,
        actualSha256: packageData.archiveSha256,
      });
    }
    const cachePath = await cacheVerifiedArtifact(options.cacheRoot, packageData);
    return { packageData: { ...packageData, cachePath }, source: "local" };
  }
  if (!options.extensionId) throw usageError("遠端安裝必須指定 extension-id。", "EXTENSION_ID_REQUIRED");
  const result = await resolveReleaseArtifact({
    cacheRoot: options.cacheRoot,
    extensionId: options.extensionId,
    ...(options.version ? { version: options.version } : {}),
    ...(options.packageSha256 ? { packageSha256: options.packageSha256 } : {}),
    ...(options.catalogUrl ? { catalogUrl: options.catalogUrl } : {}),
    ...(options.hostVersion ? { hostVersion: options.hostVersion } : {}),
    ...(options.offline ? { offline: true } : {}),
    fetchImpl,
  });
  return { packageData: result.packageData, source: result.source };
}

async function sendRetryRequest(record, action, dependencies) {
  const platformUrl = normalizePlatformUrl(record.platformUrl);
  const response = await request(dependencies.fetchImpl ?? globalThis.fetch, `${platformUrl}/bff/extensions/install/retry`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ action, identity: record.identity, operationId: record.operationId, schemaVersion: INSTALL_OPERATION_SCHEMA }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }, record.operationId);
  const body = await readJsonResponse(response, record.operationId);
  if (!response.ok) throw platformResponseError(response.status, body, record.operationId);
  return validateOperationStatus(body, record.operationId, record.identity);
}

async function request(fetchImpl, url, init, operationId) {
  if (typeof fetchImpl !== "function") throw platformError("Node.js fetch API 不可用。", "HTTP_CLIENT_UNAVAILABLE", { operationId });
  try {
    return await fetchImpl(url, init);
  } catch {
    throw platformError("平台連線失敗；安裝作業識別已保存，可使用 status 查詢結果。", "PLATFORM_UNAVAILABLE", { operationId });
  }
}

async function readJsonResponse(response, operationId) {
  try {
    const type = response.headers?.get?.("content-type")?.toLowerCase() ?? "";
    if (!type.includes("application/json")) throw new Error("Unexpected response type");
    return await response.json();
  } catch {
    throw platformError("平台回應不是有效 JSON；請使用 status 查詢安裝作業。", "PLATFORM_RESPONSE_INVALID", { operationId });
  }
}

function platformResponseError(status, body, operationId) {
  const upstreamCode = typeof body?.error?.code === "string" && /^[A-Z0-9_]{1,100}$/.test(body.error.code)
    ? body.error.code
    : undefined;
  if (status === 413) return platformError("部署 ingress 拒絕 Extension multipart 上傳（超過請求限制）。", "PLATFORM_UPLOAD_TOO_LARGE", { operationId });
  return platformError(`平台拒絕 Extension 安裝（HTTP ${status}${upstreamCode ? `，${upstreamCode}` : ""}）。`, "PLATFORM_INSTALL_REJECTED", {
    operationId,
    status,
    ...(upstreamCode ? { platformCode: upstreamCode } : {}),
  });
}

function validateOperationStatus(value, operationId, expectedIdentity) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.schemaVersion !== INSTALL_OPERATION_STATUS_SCHEMA
    || value.operationId !== operationId
    || typeof value.completed !== "boolean"
    || typeof value.phase !== "string"
    || !["failed", "partial", "running", "succeeded", "unknown"].includes(value.status)
    || !["none", "query-first", "resume"].includes(value.retryAction)
    || !sameIdentity(value.identity, expectedIdentity)
    || !Array.isArray(value.stages)
    || !value.targets || typeof value.targets !== "object"
    || !["main", "workflow-test"].every((target) => value.targets[target] && typeof value.targets[target].status === "string")) {
    throw platformError("平台安裝作業狀態不符合 Ticket 02 contract。", "PLATFORM_OPERATION_INVALID", { operationId });
  }
  if (value.status === "succeeded" && (value.completed !== true || value.retryAction !== "none")) {
    throw platformError("平台成功狀態與完成旗標互相矛盾。", "PLATFORM_OPERATION_INVALID", { operationId });
  }
  return value;
}

function sameIdentity(actual, expected) {
  if (!actual || typeof actual !== "object") return false;
  return actual.extensionId === expected.extensionId
    && actual.version === expected.version
    && actual.packageSha256 === expected.packageSha256
    && actual.scope === expected.scope
    && (actual.project ?? undefined) === (expected.project ?? undefined);
}

function resolveInstallTarget(options) {
  if (options.scope !== "project" && options.scope !== "global") {
    throw usageError("安裝必須明確指定 --scope project 或 --scope global。", "INSTALL_SCOPE_REQUIRED");
  }
  if (options.scope === "project") {
    if (typeof options.project !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(options.project)) {
      throw usageError("scope=project 必須提供合法 --project。", "INSTALL_PROJECT_REQUIRED");
    }
    return { scope: "project", project: options.project };
  }
  if (options.project !== undefined) throw usageError("scope=global 不可同時指定 --project。", "INSTALL_PROJECT_INVALID");
  return { scope: "global" };
}

function normalizePlatformUrl(value) {
  if (typeof value !== "string") throw usageError("安裝必須明確指定 --platform。", "PLATFORM_URL_REQUIRED");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw usageError("--platform 必須是絕對 HTTP(S) URL。", "PLATFORM_URL_INVALID");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw usageError("--platform 只接受不含帳密、query 或 fragment 的 HTTP(S) 基底 URL。", "PLATFORM_URL_INVALID");
  }
  return url.href.replace(/\/+$/, "");
}

function isComplete(status) {
  return status.status === "succeeded" && status.completed === true && status.retryAction === "none";
}
