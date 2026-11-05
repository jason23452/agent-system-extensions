#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveCacheRoot } from "./lib/cache.mjs";
import { packExtensionDirectory, packageSummary, readAndValidateArchive } from "./lib/archive.mjs";
import { installExtension, readInstallStatus, retryInstall } from "./lib/platform.mjs";
import { CliError, EXIT_CODES, packageError, usageError } from "./lib/errors.mjs";

export const HELP_TEXT = `Agent System Extensions CLI

Usage:
  agent-system-extensions install <extension-id> --platform <url> --scope <project|global> [--project <name>] [--version <semver>]
  agent-system-extensions update <extension-id> --platform <url> --scope <project|global> [--project <name>] [--version <semver>]
  agent-system-extensions install --file <package.aicxt> --platform <url> --scope <project|global> [--project <name>]
  agent-system-extensions status --operation <id>
  agent-system-extensions retry --operation <id>
  agent-system-extensions pack <extension-directory> --output <package.aicxt>
  agent-system-extensions validate <package.aicxt>

Options:
  --platform <url>      Agent System 平台基底 URL
  --scope <value>       明確指定 project 或 global 安裝範圍
  --project <name>      scope=project 時必填
  --version <semver>    指定 Extension 版本；預設解析該套 catalog latest
  --sha256 <hash>       固定 artifact SHA-256，並要求精確快取身分
  --file <path>         使用本地 .aicxt；遠端與本地都經過相同驗證
  --offline             只使用已驗證的精確版本快取
  --operation <id>      查詢或續跑已保存的安裝作業
  --catalog-url <url>   覆寫公開 catalog URL
  --cache-dir <path>    覆寫產品 artifact cache 位置（不使用 npm cache）
  --output <path>       pack 輸出路徑
  --json                以 JSON 輸出結果
  --help                顯示此說明

CLI errors use stable exit codes documented in packages/cli/README.md.
`;

export async function runCli(argv = process.argv.slice(2), dependencies = {}) {
  const command = argv[0];
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  const jsonOutput = argv.includes("--json");
  if (argv.includes("--help") || argv.includes("-h") || command === "help" || command === undefined) {
    stdout.write(HELP_TEXT);
    return EXIT_CODES.success;
  }

  try {
    const parsed = parseArguments(argv);
    if (parsed.command === "validate") {
      const path = requirePosition(parsed, 1, "請指定要驗證的 .aicxt 路徑。");
      const packageData = await readAndValidateArchive(path);
      const result = packageSummary(packageData);
      writeResult(stdout, result, parsed.options.json);
      return EXIT_CODES.success;
    }
    if (parsed.command === "pack") {
      const source = requirePosition(parsed, 1, "請指定 Extension 來源目錄。 ");
      const output = requireOption(parsed, "output", "請使用 --output 指定新的 .aicxt 輸出路徑。");
      if (!output.toLowerCase().endsWith(".aicxt")) throw usageError("pack 輸出副檔名必須是 .aicxt。", "PACKAGE_OUTPUT_EXTENSION_INVALID");
      const result = await packExtensionDirectory(source, output);
      writeResult(stdout, result, parsed.options.json);
      return EXIT_CODES.success;
    }
    if (parsed.command === "install" || parsed.command === "update") {
      const extensionId = parsed.positional[1];
      if (parsed.positional.length > 2) throw usageError("install/update 只接受一個 extension-id。", "ARGUMENT_UNEXPECTED");
      const cacheRoot = dependencies.cacheRoot ?? resolveCacheRoot(parsed.options["cache-dir"], dependencies.environment ?? process.env);
      const extend = parsed.options.extend === undefined ? parsed.command === "update" : parseBooleanOption(parsed.options.extend, "--extend");
      const result = await installExtension({
        ...(extensionId ? { extensionId } : {}),
        ...(parsed.options.file ? { file: parsed.options.file } : {}),
        ...(parsed.options.platform ? { platform: parsed.options.platform } : {}),
        ...(parsed.options.scope ? { scope: parsed.options.scope } : {}),
        ...(parsed.options.project ? { project: parsed.options.project } : {}),
        ...(parsed.options.version ? { version: parsed.options.version } : {}),
        ...(parsed.options["sha256"] ? { packageSha256: parsed.options["sha256"] } : {}),
        ...(parsed.options["catalog-url"] ? { catalogUrl: parsed.options["catalog-url"] } : {}),
        ...(parsed.options["host-version"] ? { hostVersion: parsed.options["host-version"] } : {}),
        ...(parsed.options.offline ? { offline: true } : {}),
        cacheRoot,
        extend,
      }, dependencies);
      writeOperationResult(stdout, result, parsed.options.json);
      return isOperationComplete(result.operation) ? EXIT_CODES.success : EXIT_CODES.operation;
    }
    if (parsed.command === "status" || parsed.command === "retry") {
      const operationId = requireOption(parsed, "operation", `請使用 --operation 指定 ${parsed.command} 作業。`);
      const cacheRoot = dependencies.cacheRoot ?? resolveCacheRoot(parsed.options["cache-dir"], dependencies.environment ?? process.env);
      const result = parsed.command === "status"
        ? await readInstallStatus(operationId, { ...dependencies, cacheRoot })
        : await retryInstall(operationId, { ...dependencies, cacheRoot });
      writeOperationResult(stdout, result, parsed.options.json);
      return isOperationComplete(result) ? EXIT_CODES.success : EXIT_CODES.operation;
    }
    throw usageError(`不支援的命令：${parsed.command}。請使用 --help 查看可用命令。`, "COMMAND_UNSUPPORTED");
  } catch (error) {
    const normalized = error instanceof CliError ? error : packageError("CLI 執行失敗，請檢查輸入檔案與本機目錄權限。", "CLI_LOCAL_FAILURE");
    if (jsonOutput) {
      stderr.write(`${JSON.stringify({ error: { code: normalized.code, message: normalized.message, ...(normalized.details ? { details: normalized.details } : {}) } })}\n`);
    } else {
      stderr.write(`[${normalized.code}] ${normalized.message}\n`);
    }
    return normalized.exitCode;
  }
}

function parseArguments(argv) {
  const command = argv[0];
  const positional = [command];
  const options = Object.create(null);
  const booleanOptions = new Set(["json", "offline"]);
  const valueOptions = new Set(["cache-dir", "catalog-url", "extend", "file", "host-version", "operation", "output", "platform", "project", "scope", "sha256", "version"]);
  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const name = value.slice(2);
    if (booleanOptions.has(name)) {
      if (options[name] !== undefined) throw usageError(`選項 --${name} 不可重複。`);
      options[name] = true;
      continue;
    }
    if (!valueOptions.has(name)) throw usageError(`不支援的選項：--${name}。`, "OPTION_UNSUPPORTED");
    if (options[name] !== undefined) throw usageError(`選項 --${name} 不可重複。`);
    const optionValue = argv[index + 1];
    if (optionValue === undefined || optionValue.startsWith("--")) throw usageError(`選項 --${name} 需要值。`);
    options[name] = optionValue;
    index += 1;
  }
  return { command, options, positional };
}

function requirePosition(parsed, index, message) {
  const value = parsed.positional[index];
  if (!value) throw usageError(message);
  return value;
}

function requireOption(parsed, name, message) {
  const value = parsed.options[name];
  if (typeof value !== "string" || !value) throw usageError(message);
  return value;
}

function writeResult(stream, result, json) {
  if (json) {
    stream.write(`${JSON.stringify(result)}\n`);
    return;
  }
  stream.write(`extensionId: ${result.extensionId}\nversion: ${result.version}\nsha256: ${result.packageSha256}\nsizeBytes: ${result.sizeBytes}\n`);
  if (result.path) stream.write(`artifact: ${result.path}\n`);
}

function writeOperationResult(stream, result, json) {
  if (json) {
    stream.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const operation = result.operation ?? result;
  if (result.extensionId) stream.write(`extensionId: ${result.extensionId}\nversion: ${result.version}\nsha256: ${result.packageSha256}\n`);
  stream.write(`operationId: ${operation.operationId}\nstatus: ${operation.status}\nphase: ${operation.phase}\nretryAction: ${operation.retryAction}\n`);
  for (const stage of operation.stages ?? []) {
    stream.write(`stage: ${stage.phase}${stage.target ? ` [${stage.target}]` : ""} = ${stage.status}\n`);
  }
  for (const target of ["main", "workflow-test"]) {
    const targetResult = operation.targets?.[target];
    if (targetResult) stream.write(`target ${target}: ${targetResult.status} (${targetResult.catalogEntries} catalog entries)\n`);
  }
}

function parseBooleanOption(value, name) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw usageError(`${name} 只接受 true 或 false。`);
}

function isOperationComplete(result) {
  const operation = result.operation ?? result;
  return operation.status === "succeeded" && operation.completed === true && operation.retryAction === "none";
}

if (process.argv[1] && isEntrypoint(process.argv[1], fileURLToPath(import.meta.url))) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

function isEntrypoint(entryPath, modulePath) {
  try {
    return realpathSync(entryPath) === realpathSync(modulePath);
  } catch {
    return false;
  }
}
