import type {
  ConfigureAzureDevOpsRemoteDependencies,
  PushAzureDevOpsWorktreeDependencies,
} from "./types.ts";
import { assertPushRemoteConfiguration } from "./git.ts";
import {
  assertPushInput,
  omitUndefined,
  pluginError,
  readAzureDevOpsRepositoryPath,
  readBranch,
  readRemoteName,
  sanitizePushError,
  validateAzureDevOpsRemoteUrl,
  validateRepositoryMetadata,
  validatePushPlan,
  validatePushResolution,
} from "./validation.ts";

export async function configureAzureDevOpsRemote(
  input: Record<string, unknown>,
  dependencies: ConfigureAzureDevOpsRemoteDependencies,
): Promise<Record<string, unknown>> {
  const remoteName = readRemoteName(input.remoteName ?? "origin");
  const repositoryPath = input.repositoryPath === undefined ? undefined : readAzureDevOpsRepositoryPath(input.repositoryPath);
  const worktree = readWorktree(dependencies.worktree);
  const repository = validateRepositoryMetadata(await dependencies.resolveRepository(input));
  const existingUrl = await dependencies.git.getRemoteUrl(worktree, remoteName);

  if (existingUrl === repository.remoteUrl) {
    return {
      changed: false,
      remoteName,
      remoteUrl: repository.remoteUrl,
      ...(repositoryPath ? { repositoryPath } : {}),
      repository,
    };
  }

  if (existingUrl !== undefined && input.updateExisting !== true) {
    throw pluginError("AZURE_DEVOPS_REMOTE_CONFLICT", `Git remote ${remoteName} already exists.`);
  }

  if (existingUrl === undefined) {
    await dependencies.git.addRemote(worktree, remoteName, repository.remoteUrl);
  } else {
    await dependencies.git.setRemoteUrl(worktree, remoteName, repository.remoteUrl);
  }

  return {
    changed: true,
    remoteName,
    remoteUrl: repository.remoteUrl,
    ...(repositoryPath ? { repositoryPath } : {}),
    repository,
  };
}

export async function pushAzureDevOpsWorktree(
  input: Record<string, unknown>,
  dependencies: PushAzureDevOpsWorktreeDependencies,
): Promise<Record<string, unknown>> {
  assertPushInput(input);
  const worktree = readWorktree(dependencies.worktree);
  let derivedValues: Record<string, unknown> = {};
  if (input.branch === undefined && dependencies.git.getCurrentBranch) {
    try {
      const currentBranch = await dependencies.git.getCurrentBranch(worktree);
      if (currentBranch) derivedValues.branch = readBranch(currentBranch);
    } catch {
      derivedValues = {};
    }
  }

  let plan;
  try {
    plan = validatePushPlan(await dependencies.resolvePushPlan(omitUndefined({ ...input }), derivedValues));
  } catch (error) {
    throw sanitizePushError(error, "AZURE_DEVOPS_OPERATION_PLAN_INVALID");
  }

  const remoteName = plan.remoteName;
  const repositoryPath = plan.repositoryPath;
  if (input.repositoryPath !== undefined && readAzureDevOpsRepositoryPath(input.repositoryPath) !== repositoryPath) {
    throw pluginError("AZURE_DEVOPS_POLICY_INVALID", "The selected repositoryPath no longer matches the effective policy.");
  }
  const organization = typeof plan.organization === "string" ? plan.organization : plan.resolvedValues.organization;
  const project = typeof plan.project === "string" ? plan.project : plan.resolvedValues.project;
  if (typeof organization !== "string" || typeof project !== "string") {
    throw pluginError("AZURE_DEVOPS_CONTEXT_INVALID", "Azure DevOps push context is invalid.");
  }
  const normalizeRemoteUrl = (value: string): string => validateAzureDevOpsRemoteUrl(value, organization, project);
  const remoteUrl = await assertPushRemoteConfiguration(dependencies.git, worktree, remoteName, undefined, normalizeRemoteUrl);

  let resolution;
  try {
    resolution = await dependencies.resolvePush(sanitizePushCredentialInput(input, plan), remoteUrl, derivedValues, plan);
  } catch (error) {
    throw sanitizePushError(error, "AZURE_DEVOPS_CREDENTIAL_BROKER_UNAVAILABLE");
  }

  const validated = validatePushResolution(resolution, plan, remoteUrl);
  let credential = validated.credential;
  try {
    await assertPushRemoteConfiguration(dependencies.git, worktree, validated.remoteName, validated.remoteUrl, normalizeRemoteUrl);
    await dependencies.git.push(
      worktree,
      validated.remoteName,
      validated.branch,
      validated.setUpstream,
      credential,
      validated.remoteUrl,
      organization,
      project,
    );
  } catch (error) {
    throw sanitizePushError(error, "AZURE_DEVOPS_GIT_PUSH_FAILED", credential);
  } finally {
    credential = "";
  }

  return {
    branch: validated.branch,
    pushResult: "pushed",
    repositoryPath,
    remoteName: validated.remoteName,
    ...(validated.setUpstream ? { upstream: { branch: validated.branch, remoteName: validated.remoteName } } : {}),
  };
}

function sanitizePushCredentialInput(input: Record<string, unknown>, plan: { sources: Record<string, "fixed" | "agent" | "derived"> }): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of ["project", "repositoryPath", "remoteName", "branch", "setUpstream"]) {
    if (plan.sources[key] === "agent" && input[key] !== undefined) result[key] = input[key];
  }
  return result;
}

function readWorktree(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw pluginError("AZURE_DEVOPS_WORKTREE_REQUIRED", "The current OpenCode worktree is required.");
  }
  return value.trim();
}
