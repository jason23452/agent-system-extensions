import type {
  AzureDevOpsPullResolution,
  PullAzureDevOpsWorktreeDependencies,
} from "./types.ts";
import { assertPullRemoteConfiguration } from "./git.ts";
import {
  assertPullInput,
  omitUndefined,
  pluginError,
  readAzureDevOpsRepositoryPath,
  sanitizePullError,
  validateAzureDevOpsRemoteUrl,
  validatePullPlan,
  validatePullResolution,
} from "./validation.ts";

export async function pullAzureDevOpsWorktree(
  input: Record<string, unknown>,
  dependencies: PullAzureDevOpsWorktreeDependencies,
): Promise<Record<string, unknown>> {
  assertPullInput(input);
  const worktree = readWorktree(dependencies.worktree);
  const plan = validatePullPlan(await dependencies.resolvePullPlan(omitUndefined({ ...input })));
  const repositoryPath = readAzureDevOpsRepositoryPath(plan.repositoryPath);
  if (input.repositoryPath !== undefined && readAzureDevOpsRepositoryPath(input.repositoryPath) !== repositoryPath) {
    throw pluginError("AZURE_DEVOPS_POLICY_INVALID", "The selected repositoryPath no longer matches the effective policy.");
  }

  const organization = typeof plan.organization === "string" ? plan.organization : plan.resolvedValues.organization;
  const project = typeof plan.project === "string" ? plan.project : plan.resolvedValues.project;
  if (typeof organization !== "string" || typeof project !== "string") {
    throw pluginError("AZURE_DEVOPS_CONTEXT_INVALID", "Azure DevOps pull context is invalid.");
  }
  const remoteName = plan.remoteName;
  const expectedRemoteUrl = (value: string) => validateAzureDevOpsRemoteUrl(value, organization, project);
  const observedRemoteUrl = await assertPullRemoteConfiguration(
    dependencies.git,
    worktree,
    remoteName,
    undefined,
    expectedRemoteUrl,
  );

  let resolution: AzureDevOpsPullResolution;
  try {
    resolution = validatePullResolution(
      await dependencies.resolvePull(omitUndefined({ ...input }), observedRemoteUrl, plan),
      plan,
      observedRemoteUrl,
    );
  } catch (error) {
    throw sanitizePullError(error, "AZURE_DEVOPS_CREDENTIAL_BROKER_UNAVAILABLE");
  }

  let credential = resolution.credential;
  try {
    await assertPullRemoteConfiguration(
      dependencies.git,
      worktree,
      resolution.remoteName,
      resolution.remoteUrl,
      expectedRemoteUrl,
    );
    await dependencies.git.pull(
      worktree,
      resolution.remoteName,
      resolution.branch,
      credential,
      resolution.remoteUrl,
      organization,
      project,
    );
  } catch (error) {
    throw sanitizePullError(error, "AZURE_DEVOPS_GIT_PULL_FAILED", credential);
  } finally {
    credential = "";
  }

  return {
    pullResult: "pulled",
    repositoryPath,
    remoteName: resolution.remoteName,
    ...(resolution.branch ? { branch: resolution.branch } : {}),
  };
}

function readWorktree(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw pluginError("AZURE_DEVOPS_WORKTREE_REQUIRED", "The current OpenCode worktree is required.");
  }
  return value.trim();
}
