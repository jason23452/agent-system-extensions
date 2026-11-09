import type {
  AzureDevOpsPullPlan,
  AzureDevOpsPullResolution,
  AzureDevOpsPushPlan,
  AzureDevOpsPushResolution,
  AzureDevOpsRepositoryMetadata,
} from "../tools/types.ts";
import {
  isRecord,
  pluginError,
  redactGitOutput,
  readCredential,
  readBranch,
  readPullBranch,
  readRemoteName,
  validateAzureDevOpsRemoteUrl,
  validatePullPlan,
  validatePushPlan,
  validateRepositoryMetadata,
} from "../tools/validation.ts";

const DEFAULT_BFF_BASE_URL = "http://agent-system-backend:8000";

export async function callRepositoryBackend(project: string, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const baseURL = (process.env.AGENT_SYSTEM_BFF_BASE_URL || DEFAULT_BFF_BASE_URL).replace(/\/+$/, "");
  const endpoint = new URL(`/bff/extensions/azure-devops-platform/backend/${path}`, baseURL);
  endpoint.searchParams.set("project", project);
  endpoint.searchParams.set("scope", "project");
  const extensionSecret = process.env.EXTENSION_SECRET_KEY?.trim();
  const response = await fetch(endpoint, {
    body: JSON.stringify(body),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-agent-system-workspace": project,
      ...(extensionSecret ? { "x-extension-secret-key": extensionSecret } : {}),
    },
    method: "POST",
    signal: AbortSignal.timeout(20_000),
  });
  const parsedPayload: unknown = await response.json().catch(() => undefined);
  const payload = isRecord(parsedPayload) ? parsedPayload : undefined;
  if (!response.ok) {
    const error = isRecord(payload?.error) ? payload.error : {};
    const details = isRecord(error.details) ? error.details : {};
    const requestID = typeof error.requestID === "string" ? error.requestID : undefined;
    const upstreamStatus = typeof details.upstreamStatus === "number" ? details.upstreamStatus : undefined;
    const upstreamCode = typeof details.upstreamCode === "string" ? details.upstreamCode : undefined;
    const upstreamMessage = typeof details.upstreamMessage === "string" ? details.upstreamMessage : undefined;
    const upstreamInnerMessage = typeof details.upstreamInnerMessage === "string" ? details.upstreamInnerMessage : undefined;
    const message = [
      `Azure DevOps backend request failed (HTTP ${response.status}${requestID ? `, request ${requestID}` : ""})`,
      typeof error.code === "string" ? `backend code ${error.code}` : undefined,
      typeof error.message === "string" ? error.message : undefined,
      upstreamStatus === undefined ? undefined : `Azure DevOps HTTP ${upstreamStatus}`,
      upstreamCode ? `Azure DevOps code ${upstreamCode}` : undefined,
      upstreamMessage ? `Azure DevOps message: ${upstreamMessage}` : undefined,
      upstreamInnerMessage ? `Azure DevOps inner error: ${upstreamInnerMessage}` : undefined,
    ].filter(Boolean).join("; ");
    throw pluginError(
      typeof error.code === "string" ? error.code : "AZURE_DEVOPS_BACKEND_REQUEST_FAILED",
      redactGitOutput(message).slice(0, 2_000),
      {
        httpStatus: response.status,
        ...(requestID ? { requestID } : {}),
        ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
        ...(upstreamCode ? { upstreamCode } : {}),
        ...(upstreamMessage ? { upstreamMessage } : {}),
        ...(upstreamInnerMessage ? { upstreamInnerMessage } : {}),
      },
    );
  }
  if (!payload) throw pluginError("AZURE_DEVOPS_BACKEND_RESPONSE_INVALID", "Azure DevOps backend returned an invalid response.");
  return payload;
}

export function readRepositoryResponse(value: Record<string, unknown>): AzureDevOpsRepositoryMetadata {
  if (!isRecord(value.repository)) throw pluginError("AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", "Azure DevOps backend returned no repository metadata.");
  return validateRepositoryMetadata(value.repository as unknown as AzureDevOpsRepositoryMetadata);
}

export function readRepositoryOperationPlan(value: Record<string, unknown>, expectedTool: string): Record<string, unknown> {
  const plan = value.operationPlan;
  if (!isRecord(plan) || plan.tool !== expectedTool || !isRecord(plan.parameters)) {
    throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_REQUIRED", "Azure DevOps backend did not return a verified repository operation plan.");
  }
  if (Object.keys(plan.parameters).some((key) => /(?:authorization|credential|pass(?:word|wd)?|(?:^|[^a-z0-9])pat(?:$|[^a-z0-9])|private[_-]?key|secret|token)/i.test(key))) {
    throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps repository operation plan contains a forbidden credential field.");
  }
  return { ...plan.parameters };
}

export function readPushResponse(value: Record<string, unknown>, observedRemoteUrl: string): AzureDevOpsPushResolution {
  if (!isRecord(value) || typeof value.token !== "string" || !value.token.trim()) {
    throw pluginError("AZURE_DEVOPS_CREDENTIAL_BROKER_INVALID", "Azure DevOps credential broker returned no temporary credential.");
  }
  if (typeof value.organization !== "string" || typeof value.project !== "string" || typeof value.remoteUrl !== "string") {
    throw pluginError("AZURE_DEVOPS_CONTEXT_INVALID", "Azure DevOps push context is incomplete.");
  }

  const remoteName = readRemoteName(value.remoteName ?? "origin");
  const branch = readBranch(value.branch);
  const remoteUrl = validateAzureDevOpsRemoteUrl(value.remoteUrl, value.organization, value.project);
  const normalizedObservedRemoteUrl = validateAzureDevOpsRemoteUrl(observedRemoteUrl, value.organization, value.project);
  if (remoteUrl !== normalizedObservedRemoteUrl) throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_MISMATCH", "The current Git remote is not the verified Azure DevOps remote.");

  return {
    branch,
    credential: value.token.trim(),
    organization: value.organization,
    project: value.project,
    remoteName,
    remoteUrl,
    setUpstream: value.setUpstream === true,
  };
}

export function readPushPlanResponse(value: Record<string, unknown>): AzureDevOpsPushPlan {
  const plan = value.operationPlan;
  if (!isRecord(plan) || plan.tool !== "azure_devops_push" || !isRecord(plan.parameters) || !isRecord(plan.sources)) {
    throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps backend returned no verified push operation plan.");
  }
  if (Object.keys(plan.parameters).some((key) => !new Set(["organization", "project", "repositoryPath", "remoteName", "branch", "setUpstream"]).has(key) || /(?:authorization|credential|pass(?:word|wd)?|(?:^|[^a-z0-9])pat(?:$|[^a-z0-9])|private[_-]?key|secret|token)/i.test(key) || key === "remoteUrl")) {
    throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps push operation plan contains an unsupported field.");
  }
  return validatePushPlan({
    ...plan.parameters,
    resolvedValues: { ...plan.parameters },
    sources: plan.sources,
  });
}

export function readPullResponse(value: Record<string, unknown>, observedRemoteUrl: string): AzureDevOpsPullResolution {
  if (!isRecord(value) || typeof value.token !== "string" || !value.token.trim()) {
    throw pluginError("AZURE_DEVOPS_CREDENTIAL_BROKER_INVALID", "Azure DevOps credential broker returned no temporary credential.");
  }
  if (typeof value.organization !== "string" || typeof value.project !== "string" || typeof value.remoteUrl !== "string") {
    throw pluginError("AZURE_DEVOPS_CONTEXT_INVALID", "Azure DevOps pull context is incomplete.");
  }

  const remoteName = readRemoteName(value.remoteName ?? "origin");
  const branch = readPullBranch(value.branch);
  const remoteUrl = validateAzureDevOpsRemoteUrl(value.remoteUrl, value.organization, value.project);
  const normalizedObservedRemoteUrl = validateAzureDevOpsRemoteUrl(observedRemoteUrl, value.organization, value.project);
  if (remoteUrl !== normalizedObservedRemoteUrl) {
    throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_MISMATCH", "The current Git remote is not the verified Azure DevOps remote.");
  }
  return {
    ...(branch ? { branch } : {}),
    credential: readCredential(value.token),
    organization: value.organization,
    project: value.project,
    remoteName,
    remoteUrl,
  };
}

export function readPullPlanResponse(value: Record<string, unknown>): AzureDevOpsPullPlan {
  const plan = value.operationPlan;
  if (!isRecord(plan) || plan.tool !== "azure_devops_git_pull" || !isRecord(plan.parameters) || !isRecord(plan.sources)) {
    throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps backend returned no verified pull operation plan.");
  }
  if (Object.keys(plan.parameters).some((key) => !new Set(["organization", "project", "repositoryPath", "remoteName", "branch"]).has(key)
    || /(?:authorization|credential|pass(?:word|wd)?|(?:^|[^a-z0-9])pat(?:$|[^a-z0-9])|private[_-]?key|secret|token)/i.test(key)
    || key === "remoteUrl")) {
    throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps pull operation plan contains an unsupported field.");
  }
  return validatePullPlan({
    ...plan.parameters,
    resolvedValues: { ...plan.parameters },
    sources: plan.sources,
  });
}

export function readGitCredential(value: Record<string, unknown>): string {
  return readCredential(value.credential);
}

export function readGitCredentialResponse(value: Record<string, unknown>): {
  credential: string;
  organization: string;
  project: string;
} {
  const credential = readGitCredential(value);
  const organization = typeof value.organization === "string" ? value.organization.trim() : "";
  const project = typeof value.project === "string" ? value.project.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(organization)
    || !project
    || project.length > 128
    || /[\r\n\0]/.test(project)) {
    throw pluginError("AZURE_DEVOPS_CONTEXT_INVALID", "Azure DevOps credential broker returned an invalid organization or project.");
  }
  return { credential, organization, project };
}
