import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { packageError, sourceError } from "./errors.mjs";
import { sha256, validateAicxtArchive } from "./archive.mjs";

export function resolveCacheRoot(explicitPath, environment = process.env, platform = process.platform, home = homedir()) {
  if (explicitPath) return resolve(explicitPath);
  if (environment.AGENT_SYSTEM_EXTENSIONS_CACHE) return resolve(environment.AGENT_SYSTEM_EXTENSIONS_CACHE);
  if (platform === "win32") {
    const base = environment.LOCALAPPDATA || environment.APPDATA || join(home, "AppData", "Local");
    return join(base, "AgentSystem", "extensions");
  }
  const base = environment.XDG_CACHE_HOME || join(home, ".cache");
  return join(base, "agent-system", "extensions");
}

export function artifactCachePath(cacheRoot, extensionId, version, packageSha256) {
  return join(resolve(cacheRoot), "artifacts", extensionId, version, `${packageSha256}.aicxt`);
}

export async function cacheVerifiedArtifact(cacheRoot, packageData) {
  const destination = artifactCachePath(cacheRoot, packageData.manifest.extensionId, packageData.manifest.version, packageData.archiveSha256);
  const directory = join(resolve(cacheRoot), "artifacts", packageData.manifest.extensionId, packageData.manifest.version);
  await mkdir(directory, { recursive: true });
  try {
    const existing = await readFile(destination);
    if (sha256(existing) !== packageData.archiveSha256) {
      throw sourceError("快取中的固定身分內容與 SHA-256 不符，拒絕覆寫。", "CACHE_CONTENT_MISMATCH");
    }
    validateAicxtArchive(existing, { extensionId: packageData.manifest.extensionId, version: packageData.manifest.version });
    return destination;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const temporary = join(directory, `.${packageData.archiveSha256}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, packageData.archive, { flag: "wx" });
    await copyFile(temporary, destination, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = await readFile(destination);
    if (sha256(existing) !== packageData.archiveSha256) {
      throw sourceError("快取中的固定身分內容與 SHA-256 不符，拒絕覆寫。", "CACHE_CONTENT_MISMATCH");
    }
  } finally {
    await rm(temporary, { force: true });
  }
  return destination;
}

export async function readCachedArtifact(cacheRoot, identity) {
  const directory = join(resolve(cacheRoot), "artifacts", identity.extensionId, identity.version);
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error?.code === "ENOENT") throw sourceError("沒有符合指定版本的已驗證離線快取。", "CACHE_ARTIFACT_MISSING", {
      extensionId: identity.extensionId,
      version: identity.version,
    });
    throw error;
  }

  const hashes = names.filter((name) => /^[a-f0-9]{64}\.aicxt$/.test(name)).map((name) => name.slice(0, -6));
  const candidates = identity.packageSha256 ? hashes.filter((hash) => hash === identity.packageSha256) : hashes;
  if (candidates.length === 0) throw sourceError("沒有符合指定版本與 SHA-256 的已驗證離線快取。", "CACHE_ARTIFACT_MISSING", {
    extensionId: identity.extensionId,
    version: identity.version,
    ...(identity.packageSha256 ? { packageSha256: identity.packageSha256 } : {}),
  });
  if (candidates.length !== 1) throw sourceError("指定版本的快取有多個不同 SHA-256；請明確指定 --sha256。", "CACHE_ARTIFACT_AMBIGUOUS", {
    extensionId: identity.extensionId,
    version: identity.version,
  });

  const packageSha256 = candidates[0];
  const path = artifactCachePath(cacheRoot, identity.extensionId, identity.version, packageSha256);
  const archive = await readFile(path).catch(() => {
    throw sourceError("固定版本快取檔案無法讀取。", "CACHE_ARTIFACT_MISSING");
  });
  if (sha256(archive) !== packageSha256) throw sourceError("離線快取 SHA-256 不符，拒絕改用其他版本或內容。", "CACHE_CONTENT_MISMATCH");
  try {
    const packageData = validateAicxtArchive(archive, { extensionId: identity.extensionId, version: identity.version });
    return { ...packageData, cachePath: path };
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw packageError("離線快取套件無效。", "CACHE_PACKAGE_INVALID");
  }
}

export async function saveOperation(cacheRoot, operation) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(operation.operationId)) {
    throw sourceError("平台回傳無效的安裝作業識別。", "OPERATION_ID_INVALID");
  }
  const directory = join(resolve(cacheRoot), "operations");
  await mkdir(directory, { recursive: true });
  const destination = join(directory, `${operation.operationId}.json`);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(operation, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, destination).catch(async (error) => {
    await rm(temporary, { force: true });
    throw error;
  });
  return destination;
}

export async function readOperation(cacheRoot, operationId) {
  if (typeof operationId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(operationId)) {
    throw sourceError("安裝作業識別格式無效。", "OPERATION_ID_INVALID");
  }
  const path = join(resolve(cacheRoot), "operations", `${operationId}.json`);
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") throw sourceError("找不到此 CLI 保存的安裝作業；請確認 --operation 值與 cache。", "OPERATION_NOT_FOUND");
    throw sourceError("CLI 保存的安裝作業記錄無法讀取。", "OPERATION_RECORD_INVALID");
  }
  if (parsed?.operationId !== operationId || !parsed.identity || !parsed.platformUrl) {
    throw sourceError("CLI 保存的安裝作業記錄格式無效。", "OPERATION_RECORD_INVALID");
  }
  return parsed;
}
