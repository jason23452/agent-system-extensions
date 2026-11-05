#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateExtensionCatalog } from "../packages/cli/src/lib/contracts.mjs";
import { readAndValidateArchive, sha256 } from "../packages/cli/src/lib/archive.mjs";
import {
  findPinnedCliRelease,
  findPinnedExtensionRelease,
  prepareCliRelease,
  prepareExtensionRelease,
} from "../packages/cli/src/lib/release-catalog.mjs";
import { publishImmutableReleaseAsset } from "../packages/cli/src/lib/release-publisher.mjs";
import { packageError, usageError } from "../packages/cli/src/lib/errors.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const args = parseArgs(process.argv.slice(2));
  let result;
  if (args.command === "prepare-extension") result = await prepareExtension(args);
  else if (args.command === "publish-extension") result = await publishExtension(args);
  else if (args.command === "prepare-cli") result = await prepareCli(args);
  else if (args.command === "publish-cli") result = await publishCli(args);
  else throw usageError("請指定 prepare-extension、publish-extension、prepare-cli 或 publish-cli。", "RELEASE_COMMAND_REQUIRED");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "RELEASE_FAILED";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[${code}] ${message}\n`);
  process.exitCode = error && typeof error === "object" && Number.isInteger(error.exitCode) ? error.exitCode : 6;
}

async function prepareExtension(args) {
  const extensionId = requireOption(args, "extension");
  const version = requireOption(args, "version");
  const extensionRoot = join(repositoryRoot, "extensions", extensionId);
  const manifest = JSON.parse(await readFile(join(extensionRoot, "manifest.json"), "utf8"));
  if (manifest.extensionId !== extensionId || manifest.version !== version) {
    throw packageError("Extension manifest identity 與 prepare 輸入不一致。", "RELEASE_IDENTITY_MISMATCH");
  }
  const sourceRevision = args.options["source-revision"] ?? gitRevision();
  const artifactPath = join(extensionRoot, "dist", `${extensionId}-${version}.aicxt`);
  const pinned = await findPinnedExtensionRelease({ repositoryRoot, extensionId, version, sourceRevision });
  if (pinned) {
    return {
      artifactPath: pinned.artifactPath,
      artifactSha256: pinned.packageData.archiveSha256,
      artifactSizeBytes: pinned.packageData.sizeBytes,
      catalogPath: pinned.catalogPath,
      nextAction: "獨立 review 通過後，依 releases/<extension>/<version>.json 的同一 artifact 執行 publish-extension。",
      provenancePath: pinned.provenancePath,
      sourceRevision,
      tag: `${extensionId}-v${version}`,
    };
  }
  const customArtifactPath = args.options.artifact ? resolve(repositoryRoot, args.options.artifact) : undefined;
  const stagingDirectory = join(extensionRoot, "dist", ".release-staging");
  const stagingPath = customArtifactPath ? undefined : join(stagingDirectory, `${randomUUID()}.aicxt`);
  try {
    if (!customArtifactPath) {
      const packageJson = JSON.parse(await readFile(join(extensionRoot, "package.json"), "utf8"));
      if (!packageJson.scripts?.build) throw packageError("Extension package 未定義 build script。", "RELEASE_BUILD_FAILED");
      await mkdir(stagingDirectory, { recursive: true });
      runNpm(["run", "build", `--workspace=${packageJson.name}`, "--", "--output", stagingPath]);
    }
    const candidatePath = customArtifactPath ?? stagingPath;
    const result = await prepareExtensionRelease({
      repositoryRoot,
      extensionId,
      version,
      artifactPath: candidatePath,
      ...(!customArtifactPath ? { finalArtifactPath: artifactPath } : {}),
      sourceRevision,
    });
    return {
      artifactPath: customArtifactPath ?? artifactPath,
      artifactSha256: result.packageData.archiveSha256,
      artifactSizeBytes: result.packageData.sizeBytes,
      catalogPath: result.catalogPath,
      nextAction: "獨立 review 通過後，依 releases/<extension>/<version>.json 的同一 artifact 執行 publish-extension。",
      provenancePath: result.provenancePath,
      sourceRevision,
      tag: result.tag,
    };
  } finally {
    if (stagingPath) await rm(stagingPath, { force: true });
  }
}

async function publishExtension(args) {
  requireReviewEvidence(args);
  const extensionId = requireOption(args, "extension");
  const version = requireOption(args, "version");
  const provenancePath = join(repositoryRoot, "releases", extensionId, `${version}.json`);
  const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
  const catalog = validateExtensionCatalog(JSON.parse(await readFile(join(repositoryRoot, "catalog.json"), "utf8")));
  const release = catalog.extensions.find((entry) => entry.extensionId === extensionId)?.releases.find((item) => item.version === version);
  if (!release || release.artifact.sha256 !== provenance.artifact?.sha256
    || release.artifact.sizeBytes !== provenance.artifact?.sizeBytes
    || release.artifact.url !== provenance.artifact?.url) {
    throw packageError("catalog、provenance 與固定 Extension release 不一致。", "RELEASE_IDENTITY_MISMATCH");
  }
  const artifactPath = args.options.artifact
    ? resolve(repositoryRoot, args.options.artifact)
    : join(repositoryRoot, "extensions", extensionId, "dist", provenance.artifact.assetName);
  const packageData = await readAndValidateArchive(artifactPath, { extensionId, version });
  if (packageData.archiveSha256 !== provenance.artifact.sha256 || packageData.sizeBytes !== provenance.artifact.sizeBytes) {
    throw packageError("Extension artifact 與已審查 provenance hash／size 不符。", "RELEASE_ARTIFACT_IDENTITY_MISMATCH");
  }
  return publishImmutableReleaseAsset({
    tag: `${extensionId}-v${version}`,
    title: `${extensionId} ${version}`,
    notes: `Immutable ${extensionId} Extension artifact ${version}.`,
    assetPath: artifactPath,
    assetName: provenance.artifact.assetName,
    sha256: provenance.artifact.sha256,
    sizeBytes: provenance.artifact.sizeBytes,
    runGh,
  });
}

async function prepareCli(args) {
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, "packages", "cli", "package.json"), "utf8"));
  const version = args.options.version ?? packageJson.version;
  if (version !== packageJson.version) throw packageError("--version 必須與 packages/cli/package.json 分離維護的 CLI 版本一致。", "RELEASE_VERSION_MISMATCH");
  const sourceRevision = args.options["source-revision"] ?? gitRevision();
  const artifactPath = join(repositoryRoot, "packages", "cli", "dist", "release", `agent-system-extensions-cli-${version}.tgz`);
  const pinned = await findPinnedCliRelease({ repositoryRoot, version, sourceRevision });
  if (pinned) {
    return {
      artifactPath: pinned.artifactPath,
      artifactSha256: pinned.provenance.artifact.sha256,
      artifactSizeBytes: pinned.provenance.artifact.sizeBytes,
      nextAction: "CLI npm tarball 獨立於 .aicxt；獨立 review 通過後才執行 publish-cli。",
      provenancePath: pinned.provenancePath,
      sourceRevision,
      tag: `cli-v${version}`,
    };
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "agent-system-cli-release-"));
  let stagingPath;
  try {
    runNpm(["run", "build", "--workspace=@agent-system/extension-contracts"]);
    runNpm(["run", "build", "--workspace=@agent-system/extensions-cli"]);
    const packed = runNpm(["pack", "--ignore-scripts", "--workspace=@agent-system/extensions-cli", `--pack-destination=${temporaryDirectory}`, "--json"]);
    let packRecords;
    try {
      packRecords = JSON.parse(packed.stdout);
    } catch {
      throw packageError("npm pack 未回傳可解析的 tarball manifest。", "CLI_PACK_FAILED");
    }
    const expectedName = `agent-system-extensions-cli-${version}.tgz`;
    const record = Array.isArray(packRecords) ? packRecords[0] : undefined;
    if (!record || record.filename !== expectedName) throw packageError("npm pack 輸出檔名與獨立 CLI release 命名不一致。", "CLI_PACK_FAILED");
    const packedPath = join(temporaryDirectory, record.filename);
    await mkdir(dirname(artifactPath), { recursive: true });
    stagingPath = join(dirname(artifactPath), `.agent-system-cli-${randomUUID()}.tgz`);
    await writeFile(stagingPath, await readFile(packedPath), { flag: "wx" });
    const result = await prepareCliRelease({ repositoryRoot, version, artifactPath: stagingPath, finalArtifactPath: artifactPath, sourceRevision });
    return {
      artifactPath,
      artifactSha256: result.packageSha256,
      artifactSizeBytes: result.sizeBytes,
      nextAction: "CLI npm tarball 獨立於 .aicxt；獨立 review 通過後才執行 publish-cli。",
      provenancePath: result.provenancePath,
      sourceRevision,
      tag: result.tag,
    };
  } finally {
    if (stagingPath) await rm(stagingPath, { force: true });
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function publishCli(args) {
  requireReviewEvidence(args);
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, "packages", "cli", "package.json"), "utf8"));
  const version = args.options.version ?? packageJson.version;
  const provenancePath = join(repositoryRoot, "releases", "cli", `${version}.json`);
  const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
  if (provenance.schemaVersion !== "agent-system.cli-release-provenance.v1" || provenance.version !== version) {
    throw packageError("CLI release provenance 格式或版本不符。", "RELEASE_IDENTITY_MISMATCH");
  }
  const artifactPath = args.options.artifact
    ? resolve(repositoryRoot, args.options.artifact)
    : join(repositoryRoot, "packages", "cli", "dist", "release", provenance.artifact.assetName);
  const bytes = await readFile(artifactPath).catch(() => {
    throw packageError("找不到已審查的 CLI npm tarball。", "RELEASE_ARTIFACT_MISSING");
  });
  if (sha256(bytes) !== provenance.artifact.sha256 || bytes.byteLength !== provenance.artifact.sizeBytes) {
    throw packageError("CLI tarball 與已審查 provenance hash／size 不符。", "RELEASE_ARTIFACT_IDENTITY_MISMATCH");
  }
  return publishImmutableReleaseAsset({
    tag: `cli-v${version}`,
    title: `Agent System Extensions CLI ${version}`,
    notes: `Immutable npm tarball for the shared Agent System Extensions CLI ${version}.`,
    assetPath: artifactPath,
    assetName: provenance.artifact.assetName,
    sha256: provenance.artifact.sha256,
    sizeBytes: provenance.artifact.sizeBytes,
    runGh,
  });
}

function runGh(args) {
  const result = spawnSync("gh", args, { cwd: repositoryRoot, encoding: "utf8", timeout: 120_000, windowsHide: true });
  if (result.error) return { status: null };
  return { status: result.status };
}

function runNpm(args) {
  const result = spawnSync("npm", args, { cwd: repositoryRoot, encoding: "utf8", timeout: 120_000, windowsHide: true, shell: process.platform === "win32" });
  if (result.error || result.status !== 0) {
    throw packageError("npm release command 執行失敗；保留工作目錄及輸出以供診斷。", "RELEASE_BUILD_FAILED", {
      exitCode: Number.isInteger(result.status) ? result.status : null,
    });
  }
  return result;
}

function gitRevision() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8", timeout: 10_000, windowsHide: true });
  if (result.status !== 0 || !/^[a-f0-9]{40,64}$/i.test(result.stdout.trim())) {
    throw packageError("無法取得 release source revision；需明確提供完整 --source-revision。", "RELEASE_SOURCE_REVISION_INVALID");
  }
  return result.stdout.trim().toLowerCase();
}

function requireReviewEvidence(args) {
  const evidence = args.options["review-evidence"];
  if (typeof evidence !== "string" || evidence.length < 6 || /[\r\n]/.test(evidence)) {
    throw usageError("公開發布必須明確提供獨立 review 通過的 --review-evidence 參考；未經 review 不可發布。", "RELEASE_REVIEW_REQUIRED");
  }
}

function requireOption(args, name) {
  const value = args.options[name];
  if (typeof value !== "string" || !value) throw usageError(`缺少必要選項 --${name}。`);
  return value;
}

function parseArgs(argv) {
  const command = argv[0];
  const options = Object.create(null);
  const positional = [];
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    if (options[name] !== undefined) throw usageError(`選項 --${name} 不可重複。`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw usageError(`選項 --${name} 需要值。`);
    options[name] = value;
    index += 1;
  }
  if (positional.length > 0) throw usageError("release command 不接受位置參數，請使用具名選項。", "RELEASE_ARGUMENT_INVALID");
  return { command, options };
}
