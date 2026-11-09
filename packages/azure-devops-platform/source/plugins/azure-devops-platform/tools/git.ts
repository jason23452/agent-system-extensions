import { execFile as execFileCallback, spawn } from "node:child_process";
import { promisify } from "node:util";
import type {
  AzureDevOpsGitCloneInput,
  AzureDevOpsGitCloneOperations,
  AzureDevOpsGitOperations,
  AzureDevOpsGitProcess,
  AzureDevOpsGitRunner,
} from "./types.ts";
import {
  assertCredentialFreeRemoteUrl,
  isMissingBranch,
  isMissingRemote,
  mapGitPushError,
  normalizeCloneRef,
  readPullBranch,
  readBranch,
  readRemoteName,
  redactGitOutput,
  pluginError,
  validateAzureDevOpsRemoteUrl,
} from "./validation.ts";
import { AZURE_DEVOPS_GIT_CREDENTIAL_CACHE_TTL_MS } from "./credential-cache.ts";

const execFile = promisify(execFileCallback);
const COMMAND_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_LENGTH = 8_000;
export const AZURE_DEVOPS_GIT_USER_NAME = "opencode";
export const AZURE_DEVOPS_GIT_USER_EMAIL = "opencode@double-cash.com";
const GIT_CREDENTIAL_HELPER = "!f() { if [ \"$1\" = get ]; then printf 'username=azure-devops\\npassword=%s\\n' \"$AZURE_DEVOPS_GIT_PASSWORD\"; fi; }; f";
const GIT_NULL_DEVICE = process.platform === "win32" ? "NUL" : "/dev/null";
const GIT_ASKPASS_SCRIPT = "process.stdout.write(/username/i.test(process.argv[1] || '') ? 'opencode' : (process.env.AZURE_DEVOPS_GIT_PASSWORD || ''))";
const GIT_PROCESS_ENVIRONMENT_KEYS = new Set([
  "comspec",
  "commonprogramfiles",
  "commonprogramfiles(x86)",
  "home",
  "homedrive",
  "homepath",
  "language",
  "lc_all",
  "lc_ctype",
  "lc_messages",
  "lang",
  "localappdata",
  "os",
  "path",
  "pathext",
  "programfiles",
  "programfiles(x86)",
  "systemdrive",
  "systemroot",
  "temp",
  "tmp",
  "userprofile",
  "windir",
  "xdg_cache_home",
]);
const GIT_EXPLICIT_OVERRIDE_KEYS = new Set([
  "azure_devops_git_password",
  "git_askpass",
  "git_config_global",
  "git_config_nosystem",
  "git_terminal_prompt",
]);

const defaultAzureDevOpsGitRunner: AzureDevOpsGitRunner = (file, args, options) => execFile(file, args, options) as unknown as Promise<{ stderr?: unknown; stdout?: unknown }>;

export function createAzureDevOpsGitOperations(
  gitProcess: AzureDevOpsGitProcess = createAzureDevOpsGitProcess(),
): AzureDevOpsGitOperations & AzureDevOpsGitCloneOperations {
  const getPushRemoteUrls = async (worktree: string, remoteName: string): Promise<readonly string[] | undefined> => {
    try {
      const result = await gitProcess.execute(worktree, ["remote", "get-url", "--push", "--all", remoteName], { operation: "Read Git push remote" });
      const urls = result.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
      return urls.length > 0 ? urls : undefined;
    } catch (error) {
      if (isMissingRemote(error)) return undefined;
      throw error;
    }
  };
  const getRemoteUrl = async (worktree: string, remoteName: string): Promise<string | undefined> => {
    try {
      const result = await gitProcess.execute(worktree, ["remote", "get-url", remoteName], { operation: "Read Git remote" });
      return result.stdout.trim() || undefined;
    } catch (error) {
      if (isMissingRemote(error)) return undefined;
      throw error;
    }
  };
  const getFetchRemoteUrls = async (worktree: string, remoteName: string): Promise<readonly string[] | undefined> => {
    try {
      const result = await gitProcess.execute(worktree, ["remote", "get-url", "--all", remoteName], { operation: "Read Git fetch remote" });
      const urls = result.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
      return urls.length > 0 ? urls : undefined;
    } catch (error) {
      if (isMissingRemote(error)) return undefined;
      throw error;
    }
  };

  return {
    async addRemote(worktree, remoteName, remoteUrl) {
      await gitProcess.execute(worktree, ["remote", "add", remoteName, remoteUrl], { operation: "Add Git remote" });
    },
    async getCurrentBranch(worktree) {
      try {
        const result = await gitProcess.execute(worktree, ["symbolic-ref", "--quiet", "--short", "HEAD"], { operation: "Read current Git branch" });
        return result.stdout.trim() || undefined;
      } catch (error) {
        if (isMissingBranch(error)) return undefined;
        throw error;
      }
    },
    getFetchRemoteUrls,
    getPushRemoteUrls,
    getRemoteUrl,
    async pull(worktree, remoteName, branch, credential, expectedRemoteUrl, organization, project) {
      const safeRemoteName = readRemoteName(remoteName);
      const safeBranch = readPullBranch(branch);
      if (!credential.trim()) throw pluginError("AZURE_DEVOPS_CREDENTIAL_BROKER_UNAVAILABLE", "A temporary Azure DevOps credential was not provided.");
      if (typeof expectedRemoteUrl !== "string" || !expectedRemoteUrl.trim()) {
        throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_INVALID", "The verified Azure DevOps remote is required before Git pull.");
      }
      const normalizeRemoteUrl = organization && project
        ? (value: string) => validateAzureDevOpsRemoteUrl(value, organization, project)
        : undefined;
      await assertPullRemoteConfiguration({ getFetchRemoteUrls }, worktree, safeRemoteName, expectedRemoteUrl, normalizeRemoteUrl);
      try {
        await gitProcess.execute(
          worktree,
          ["pull", safeRemoteName, ...(safeBranch ? [safeBranch] : [])],
          { credential, operation: "Azure DevOps Git pull" },
        );
      } catch (error) {
        throw mapGitPullError(error);
      }
    },
    async push(worktree, remoteName, branch, setUpstream, credential, expectedRemoteUrl, organization, project) {
      const safeRemoteName = readRemoteName(remoteName);
      const safeBranch = readBranch(branch);
      if (!credential.trim()) throw pluginError("AZURE_DEVOPS_CREDENTIAL_BROKER_UNAVAILABLE", "A temporary Azure DevOps credential was not provided.");
      if (typeof expectedRemoteUrl !== "string" || !expectedRemoteUrl.trim()) {
        throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_INVALID", "The verified Azure DevOps remote is required before Git push.");
      }
      const normalizeRemoteUrl = organization && project
        ? (value: string) => validateAzureDevOpsRemoteUrl(value, organization, project)
        : undefined;

      try {
        await gitProcess.execute(worktree, ["rev-parse", "--verify", "--quiet", `refs/heads/${safeBranch}`], { operation: "Verify Git branch" });
      } catch (error) {
        if (isMissingBranch(error)) throw pluginError("AZURE_DEVOPS_BRANCH_NOT_FOUND", `The local branch ${safeBranch} was not found.`);
        throw mapGitPushError(error, "Verify Git branch");
      }

      await assertPushRemoteConfiguration({ getRemoteUrl, getPushRemoteUrls }, worktree, safeRemoteName, expectedRemoteUrl, normalizeRemoteUrl);
      try {
        await gitProcess.execute(
          worktree,
          ["push", ...(setUpstream ? ["--set-upstream"] : []), safeRemoteName, safeBranch],
          { credential, operation: "Azure DevOps Git push" },
        );
      } catch (error) {
        throw mapGitPushError(error, "Azure DevOps Git push");
      }
    },
    async setRemoteUrl(worktree, remoteName, remoteUrl) {
      await gitProcess.execute(worktree, ["remote", "set-url", remoteName, remoteUrl], { operation: "Update Git remote" });
    },
    async clone(input: AzureDevOpsGitCloneInput) {
      const args = withTemporaryGitCredentialHelper(["clone", "--origin", "origin"]);
      const selection = input.branch ?? normalizeCloneRef(input.ref);
      if (selection) args.push("--branch", selection);
      if (input.depth !== undefined) args.push("--depth", String(input.depth));
      args.push(input.remoteUrl, input.destination);
      await runGit(input.worktree, args, "Clone Git repository", {
        environment: {
          AZURE_DEVOPS_GIT_PASSWORD: input.credential,
          GIT_ASKPASS: gitAskpassCommand(),
          GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE,
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_TERMINAL_PROMPT: "0",
        },
        secrets: [input.credential, process.env.EXTENSION_SECRET_KEY ?? ""],
      });
    },
  };
}

export async function configureAzureDevOpsGitIdentity(
  worktree: string,
  gitProcess: AzureDevOpsGitProcess = createAzureDevOpsGitProcess(),
): Promise<{ email: string; name: string }> {
  await gitProcess.execute(worktree, ["config", "--local", "--replace-all", "user.name", AZURE_DEVOPS_GIT_USER_NAME], {
    operation: "Configure local Git user name",
  });
  await gitProcess.execute(worktree, ["config", "--local", "--replace-all", "user.email", AZURE_DEVOPS_GIT_USER_EMAIL], {
    operation: "Configure local Git user email",
  });
  return { email: AZURE_DEVOPS_GIT_USER_EMAIL, name: AZURE_DEVOPS_GIT_USER_NAME };
}

export async function configureAzureDevOpsGitCredentialHelper(
  worktree: string,
  organization: string,
  project: string,
  credential: string,
  gitProcess: AzureDevOpsGitProcess = createAzureDevOpsGitProcess(),
): Promise<{ configured: true; remoteCount: number }> {
  if (!credential.trim() || credential.length > 500 || /[\r\n\0]/.test(credential)) {
    throw pluginError("AZURE_DEVOPS_CREDENTIAL_BROKER_INVALID", "The credential broker returned no usable Git credential.");
  }
  if (!gitProcess.executeWithInput) {
    throw pluginError("AZURE_DEVOPS_GIT_CREDENTIAL_CACHE_UNAVAILABLE", "Git credential caching is unavailable in this runtime.");
  }

  const remoteResult = await gitProcess.execute(worktree, ["remote"], { operation: "Read Azure DevOps Git remotes" });
  const remoteNames = remoteResult.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const credentialInputs = new Map<string, string>();
  for (const remoteName of remoteNames) {
    const safeRemoteName = readRemoteName(remoteName);
    const result = await gitProcess.execute(worktree, ["remote", "get-url", "--all", safeRemoteName], {
      operation: "Read Azure DevOps Git remote URL",
    });
    for (const remoteUrl of result.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
      try {
        validateAzureDevOpsRemoteUrl(remoteUrl, organization, project);
        const parsed = new URL(remoteUrl);
        const path = parsed.pathname.replace(/^\/+/, "");
        if (!path) continue;
        const key = `${parsed.protocol}//${parsed.host.toLowerCase()}/${path}`;
        credentialInputs.set(key, [
          `protocol=${parsed.protocol.slice(0, -1)}`,
          `host=${parsed.host.toLowerCase()}`,
          `path=${path}`,
          "username=azure-devops",
          `password=${credential}`,
          "",
          "",
        ].join("\n"));
      } catch {
        // Only seed credentials for remotes verified against the active ADO context.
      }
    }
  }
  if (credentialInputs.size === 0) {
    throw pluginError("AZURE_DEVOPS_CREDENTIAL_REMOTE_NOT_FOUND", "A Git remote matching the configured Azure DevOps organization and project is required to cache its credential.");
  }

  const helper = `cache --timeout=${Math.ceil(AZURE_DEVOPS_GIT_CREDENTIAL_CACHE_TTL_MS / 1_000)}`;
  await gitProcess.execute(worktree, ["config", "--local", "--replace-all", "credential.helper", ""], {
    operation: "Reset local Git credential helpers",
  });
  await gitProcess.execute(worktree, ["config", "--local", "--add", "credential.helper", helper], {
    operation: "Configure local Git credential helper",
  });
  await gitProcess.execute(worktree, ["config", "--local", "--replace-all", "credential.useHttpPath", "true"], {
    operation: "Scope Git credentials to the remote path",
  });

  for (const input of credentialInputs.values()) {
    await gitProcess.executeWithInput(worktree, ["credential", "approve"], input, {
      operation: "Cache temporary Azure DevOps Git credential",
      secrets: [credential, process.env.EXTENSION_SECRET_KEY ?? ""],
    });
  }

  return { configured: true, remoteCount: credentialInputs.size };
}

export function createAzureDevOpsGitProcess(
  runner: AzureDevOpsGitRunner = defaultAzureDevOpsGitRunner,
): AzureDevOpsGitProcess {
  return {
    async execute(worktree, args, options = {}) {
      const credential = options.credential;
      const commandArgs = credential
        ? withTemporaryGitCredentialHelper(args)
        : [...args];
      const environment = createGitEnvironment({
        GIT_ASKPASS: gitAskpassCommand(),
        GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE,
        GIT_CONFIG_NOSYSTEM: "1",
        ...(credential ? { AZURE_DEVOPS_GIT_PASSWORD: credential } : {}),
      });

      try {
        const result = await runner("git", commandArgs, {
          cwd: readWorktree(worktree),
          env: environment,
          maxBuffer: MAX_OUTPUT_LENGTH * 2,
          timeout: COMMAND_TIMEOUT_MS,
          windowsHide: true,
        });
        return {
          stderr: redactGitOutput(String(result.stderr || ""), credential ? [credential] : []),
          stdout: redactGitOutput(String(result.stdout || ""), credential ? [credential] : []),
        };
      } catch (error) {
        const failure = error as { code?: string | number; stderr?: string; stdout?: string; signal?: string; message?: string };
        const detail = redactGitOutput(String(failure.stderr || failure.stdout || failure.message || "Git command failed"), credential ? [credential] : []);
        const mapped = pluginError("AZURE_DEVOPS_GIT_FAILED", `${options.operation || "Git command"} failed: ${detail.slice(0, MAX_OUTPUT_LENGTH)}`);
        (mapped as Error & { gitCode?: string | number; signal?: string }).gitCode = failure.code || failure.signal;
        throw mapped;
      }
    },
    async executeWithInput(worktree, args, input, options = {}) {
      await executeGitWithInput(worktree, args, input, options);
    },
  };
}

function executeGitWithInput(
  worktree: string,
  args: string[],
  input: string,
  options: { operation?: string; secrets?: readonly string[] },
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const secrets = [...(options.secrets ?? []), process.env.EXTENSION_SECRET_KEY ?? ""].filter(Boolean);
    const child = spawn("git", args, {
      cwd: readWorktree(worktree),
      env: createGitEnvironment({
        GIT_ASKPASS: gitAskpassCommand(),
        GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE,
        GIT_CONFIG_NOSYSTEM: "1",
      }),
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: true,
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, COMMAND_TIMEOUT_MS);
    timeout.unref?.();

    const fail = (detail: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const redacted = redactGitOutput(detail, secrets).slice(0, MAX_OUTPUT_LENGTH);
      reject(pluginError(
        "AZURE_DEVOPS_GIT_FAILED",
        `${options.operation || "Git command"} failed: ${redacted || "Git command failed."}`,
      ));
    };

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-MAX_OUTPUT_LENGTH * 2);
    });
    child.once("error", (error) => fail(error instanceof Error ? error.message : "Git command failed."));
    child.once("close", (code, signal) => {
      if (settled) return;
      if (code === 0 && !timedOut) {
        settled = true;
        clearTimeout(timeout);
        resolve();
        return;
      }
      fail(timedOut
        ? `${options.operation || "Git command"} timed out.`
        : stderr || `Git exited with ${String(code ?? signal ?? "unknown status")}.`);
    });
    child.stdin.once("error", (error) => {
      if ((error as NodeJS.ErrnoException).code !== "EPIPE") {
        fail(error instanceof Error ? error.message : "Git input failed.");
      }
    });
    child.stdin.end(input);
  });
}

export async function runGit(worktree: string, args: string[], operation: string, options: {
  environment?: NodeJS.ProcessEnv;
  runner?: AzureDevOpsGitRunner;
  secrets?: readonly string[];
} = {}): Promise<string> {
  const cwd = readWorktree(worktree);
  const environment = createGitEnvironment(options.environment);
  try {
    const result = await (options.runner ?? defaultAzureDevOpsGitRunner)("git", args, {
      cwd,
      env: environment,
      maxBuffer: MAX_OUTPUT_LENGTH * 2,
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
    });
    return redactGitOutput(String(result.stdout || "").trim(), options.secrets);
  } catch (error) {
    const failure = error as { code?: string | number; stderr?: string; stdout?: string; signal?: string; message?: string };
    const detail = redactGitOutput(String(failure.stderr || failure.stdout || failure.message || "Git command failed"), options.secrets);
    const mapped = pluginError("AZURE_DEVOPS_GIT_FAILED", `${operation} failed: ${detail.slice(0, MAX_OUTPUT_LENGTH)}`);
    (mapped as Error & { gitCode?: string | number; signal?: string }).gitCode = failure.code || failure.signal;
    throw mapped;
  }
}

export async function assertPushRemoteConfiguration(
  git: Pick<AzureDevOpsGitOperations, "getPushRemoteUrls" | "getRemoteUrl">,
  worktree: string,
  remoteName: string,
  expectedRemoteUrl?: string,
  normalizeRemoteUrl?: (value: string) => string,
): Promise<string> {
  const validateRemoteUrl = normalizeRemoteUrl ?? ((value: string) => {
    assertCredentialFreeRemoteUrl(value);
    return value;
  });
  const expected = expectedRemoteUrl === undefined ? undefined : validateRemoteUrl(expectedRemoteUrl);

  let rawRemoteUrl: string | undefined;
  try {
    rawRemoteUrl = await git.getRemoteUrl(worktree, remoteName);
  } catch (error) {
    throw mapGitPushError(error, "Read Git remote");
  }
  if (!rawRemoteUrl) throw pluginError("AZURE_DEVOPS_REMOTE_NOT_FOUND", `Git remote ${remoteName} was not found.`);
  const remoteUrl = validateRemoteUrl(rawRemoteUrl);
  if (expected !== undefined && remoteUrl !== expected) {
    throw pluginError("AZURE_DEVOPS_PUSH_REMOTE_MISMATCH", "The Git fetch and push remotes must match the verified Azure DevOps repository.");
  }

  let pushRemoteUrls: readonly string[] | undefined;
  try {
    pushRemoteUrls = await git.getPushRemoteUrls(worktree, remoteName);
  } catch (error) {
    throw mapGitPushError(error, "Read Git push remote");
  }
  if (!pushRemoteUrls) throw pluginError("AZURE_DEVOPS_PUSH_REMOTE_NOT_FOUND", `Git push remote ${remoteName} was not found.`);
  if (pushRemoteUrls.length !== 1) {
    throw pluginError("AZURE_DEVOPS_PUSH_REMOTE_MISMATCH", "The Git fetch and push remotes must match the verified Azure DevOps repository.");
  }
  const pushRemoteUrl = validateRemoteUrl(pushRemoteUrls[0]!);
  if (pushRemoteUrl !== remoteUrl || (expected !== undefined && pushRemoteUrl !== expected)) {
    throw pluginError("AZURE_DEVOPS_PUSH_REMOTE_MISMATCH", "The Git fetch and push remotes must match the verified Azure DevOps repository.");
  }
  return remoteUrl;
}

export async function assertPullRemoteConfiguration(
  git: Pick<AzureDevOpsGitOperations, "getFetchRemoteUrls">,
  worktree: string,
  remoteName: string,
  expectedRemoteUrl?: string,
  normalizeRemoteUrl?: (value: string) => string,
): Promise<string> {
  const safeRemoteName = readRemoteName(remoteName);
  const validateRemoteUrl = normalizeRemoteUrl ?? ((value: string) => {
    assertCredentialFreeRemoteUrl(value);
    return value;
  });
  const expected = expectedRemoteUrl === undefined ? undefined : validateRemoteUrl(expectedRemoteUrl);
  let remoteUrls: readonly string[] | undefined;
  try {
    remoteUrls = await git.getFetchRemoteUrls(worktree, safeRemoteName);
  } catch (error) {
    throw mapGitPullError(error);
  }
  if (!remoteUrls || remoteUrls.length === 0) {
    throw pluginError("AZURE_DEVOPS_REMOTE_NOT_FOUND", `Git remote ${safeRemoteName} was not found.`);
  }
  if (remoteUrls.length !== 1) {
    throw pluginError("AZURE_DEVOPS_PULL_REMOTE_MISMATCH", "The Git pull remote must resolve to one verified Azure DevOps URL.");
  }
  let remoteUrl: string;
  try {
    remoteUrl = validateRemoteUrl(remoteUrls[0]!);
  } catch {
    throw pluginError("AZURE_DEVOPS_PULL_REMOTE_MISMATCH", "The Git pull remote is not the verified Azure DevOps repository.");
  }
  if (expected !== undefined && remoteUrl !== expected) {
    throw pluginError("AZURE_DEVOPS_PULL_REMOTE_MISMATCH", "The Git pull remote is not the verified Azure DevOps repository.");
  }
  return remoteUrl;
}

export function gitAskpassCommand(): string {
  const quote = (value: string) => `"${value.replace(/[\\"$`]/g, (character) => `\\${character}`)}"`;
  return `${quote(process.execPath)} -e ${quote(GIT_ASKPASS_SCRIPT)}`;
}

export function withTemporaryGitCredentialHelper(args: string[]): string[] {
  return ["-c", "credential.helper=", "-c", `credential.helper=${GIT_CREDENTIAL_HELPER}`, ...args];
}

function mapGitPullError(error: unknown): Error & { code: string } {
  const value = error as { code?: unknown; message?: unknown };
  const detail = redactGitOutput(error instanceof Error ? error.message : String(error));
  const code = typeof value.code === "string" && value.code.startsWith("AZURE_DEVOPS_")
    ? value.code
    : "AZURE_DEVOPS_GIT_PULL_FAILED";
  return pluginError(code, code === "AZURE_DEVOPS_GIT_PULL_FAILED"
    ? `Azure DevOps Git pull failed: ${detail.slice(0, MAX_OUTPUT_LENGTH)}`
    : detail.slice(0, MAX_OUTPUT_LENGTH));
}

function createGitEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && GIT_PROCESS_ENVIRONMENT_KEYS.has(key.toLowerCase())) environment[key] = value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && GIT_EXPLICIT_OVERRIDE_KEYS.has(key.toLowerCase())) environment[key] = value;
  }
  environment.GIT_CONFIG_GLOBAL = GIT_NULL_DEVICE;
  environment.GIT_CONFIG_NOSYSTEM = "1";
  environment.GIT_TERMINAL_PROMPT = "0";
  return environment;
}

function readWorktree(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw pluginError("AZURE_DEVOPS_WORKTREE_REQUIRED", "The current OpenCode worktree is required.");
  }
  return value.trim();
}
