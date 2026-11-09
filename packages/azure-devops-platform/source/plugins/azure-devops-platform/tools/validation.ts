import { lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, win32, posix } from "node:path";
import type {
  AzureDevOpsPullPlan,
  AzureDevOpsPullResolution,
  AzureDevOpsPushPlan,
  AzureDevOpsPushResolution,
  AzureDevOpsRepositoryMetadata,
  CloneDestination,
  CloneIdentity,
  CloneSelection,
} from "./types.ts";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const REPOSITORY_REFERENCE_PATTERN = /^azure-devops:\/\/([^/]+)\/([^/]+)\/([0-9a-f-]{36})$/i;
export const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
export const CANONICAL_REMOTE_INVALID_MESSAGE = "Azure DevOps remote URL is not canonical.";
export const PUSH_PARAMETER_NAMES = new Set(["project", "repositoryPath", "remoteName", "branch", "setUpstream"]);
export const PULL_PARAMETER_NAMES = new Set(["project", "repositoryPath", "remoteName", "branch"]);
export const PUSH_OVERWRITE_PARAMETER_NAMES = new Set(["delete", "force", "forcePush", "forceWithLease", "mirror", "overwrite", "overwriteHistory"]);
export const PUSH_PLAN_PARAMETER_NAMES = new Set(["organization", "project", "repositoryPath", "remoteName", "branch", "setUpstream"]);
export const PULL_PLAN_PARAMETER_NAMES = new Set(["organization", "project", "repositoryPath", "remoteName", "branch"]);
export const DESTINATION_MAX_LENGTH = 1_024;
export const GIT_REF_MAX_LENGTH = 512;
export const CLONE_STAGING_DIRECTORY_PREFIX = ".azure-devops-clone-staging-";
export const SECRET_ENVIRONMENT_NAME_PATTERN = /(?:authorization|credential|pass(?:word|wd)?|(?:^|[^a-z0-9])pat(?:$|[^a-z0-9])|private[_-]?key|secret|token)/i;
export const MAX_REDACTION_SECRET_COUNT = 64;

export function validateRepositoryMetadata(value: AzureDevOpsRepositoryMetadata): AzureDevOpsRepositoryMetadata {
  if (!isRecord(value) || !UUID_PATTERN.test(value.id) || !value.name || !isRecord(value.project)
    || !UUID_PATTERN.test(value.project.id) || !value.project.name || typeof value.remoteUrl !== "string"
    || typeof value.repositoryReference !== "string") {
    throw pluginError("AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", "Azure DevOps repository metadata is invalid.");
  }
  const reference = REPOSITORY_REFERENCE_PATTERN.exec(value.repositoryReference);
  if (!reference
    || reference[2]!.toLowerCase() !== value.project.name.toLowerCase()
    || reference[3]!.toLowerCase() !== value.id.toLowerCase()) {
    throw pluginError("AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", "Azure DevOps repository reference is invalid.");
  }

  const remoteUrl = validateAzureDevOpsRemoteUrl(value.remoteUrl, reference[1]!, value.project.name, value.name);

  return {
    id: value.id,
    name: value.name,
    project: { id: value.project.id, name: value.project.name },
    remoteUrl,
    repositoryReference: value.repositoryReference,
  };
}

export function validateAzureDevOpsRemoteUrl(value: string, organization?: string, project?: string, repositoryName?: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || /[\r\n\0]/.test(value)) {
    throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
  }
  if ((organization === undefined) !== (project === undefined)) {
    throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
  }

  const host = parsed.hostname.toLowerCase();
  const isDevAzure = host === "dev.azure.com";
  const visualStudioOrganization = host.endsWith(".visualstudio.com") ? host.slice(0, -".visualstudio.com".length) : "";
  const isVisualStudio = Boolean(visualStudioOrganization)
    && (organization === undefined || visualStudioOrganization === organization.toLowerCase());
  let username: string;
  try {
    username = decodeURIComponent(parsed.username);
  } catch {
    throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
  }
  const authority = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/.exec(value)?.[1] ?? "";
  const hasUserInfo = authority.includes("@");
  const userInfo = hasUserInfo ? authority.slice(0, authority.lastIndexOf("@")) : "";
  if (parsed.protocol !== "https:"
    || parsed.password
    || parsed.port
    || hasExplicitPort(value)
    || parsed.search
    || parsed.hash
    || (!isDevAzure && !isVisualStudio)) {
    throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
  }

  const segments = canonicalAzureDevOpsPathSegments(parsed);
  let remoteOrganization: string | undefined;
  let remoteProject: string | undefined;
  let remoteRepository: string | undefined;
  if (isDevAzure && segments.length === 4 && segments[2]!.toLowerCase() === "_git") {
    remoteOrganization = segments[0];
    remoteProject = segments[1];
    remoteRepository = segments[3];
  } else if (isVisualStudio && segments.length === 3 && segments[1]!.toLowerCase() === "_git") {
    remoteOrganization = visualStudioOrganization;
    remoteProject = segments[0];
    remoteRepository = segments[2];
  } else if (isVisualStudio && segments.length === 4 && segments[0]!.toLowerCase() === "defaultcollection" && segments[2]!.toLowerCase() === "_git") {
    remoteOrganization = visualStudioOrganization;
    remoteProject = segments[1];
    remoteRepository = segments[3];
  }
  const effectiveOrganization = organization ?? remoteOrganization;
  const effectiveProject = project ?? remoteProject;
  if (!remoteOrganization
    || !effectiveOrganization
    || remoteOrganization.toLowerCase() !== effectiveOrganization.toLowerCase()
    || !remoteProject
    || !effectiveProject
    || remoteProject.toLowerCase() !== effectiveProject.toLowerCase()
    || !remoteRepository
    || (repositoryName !== undefined && remoteRepository.toLowerCase() !== repositoryName.toLowerCase())) {
    throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
  }
  if (hasUserInfo && (!username || userInfo.includes(":") || username.toLowerCase() !== effectiveOrganization.toLowerCase())) {
    throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
  }
  return `https://dev.azure.com/${encodeURIComponent(effectiveOrganization)}/${encodeURIComponent(effectiveProject)}/_git/${encodeURIComponent(repositoryName ?? remoteRepository)}`;
}

function canonicalAzureDevOpsPathSegments(parsed: URL): string[] {
  const rawSegments = parsed.pathname.split("/");
  if (rawSegments[0] === "") rawSegments.shift();
  if (rawSegments.length === 0 || rawSegments.some((segment) => !segment)) {
    throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
  }
  return rawSegments.map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
    }
  });
}

function hasExplicitPort(value: string): boolean {
  const authority = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/.exec(value)?.[1] ?? "";
  const host = authority.slice(authority.lastIndexOf("@") + 1);
  return host.includes(":");
}

export function validatePushPlan(value: unknown): AzureDevOpsPushPlan {
  if (!isRecord(value) || typeof value.remoteName !== "string" || typeof value.repositoryPath !== "string" || !isRecord(value.sources) || !isRecord(value.resolvedValues)) {
    throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps push operation plan is invalid.");
  }
  if (Object.keys(value).some((key) => SECRET_ENVIRONMENT_NAME_PATTERN.test(key) || key === "remoteUrl")) {
    throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps push operation plan contains a forbidden field.");
  }
  if (Object.keys(value.resolvedValues).some((key) => !PUSH_PLAN_PARAMETER_NAMES.has(key) || SECRET_ENVIRONMENT_NAME_PATTERN.test(key) || key === "remoteUrl")) {
    throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps push operation plan contains an unsupported resolved field.");
  }

  const remoteName = readRemoteName(value.remoteName);
  const repositoryPath = readAzureDevOpsRepositoryPath(value.repositoryPath);
  const branch = value.branch === undefined ? undefined : readBranch(value.branch);
  const setUpstream = value.setUpstream === undefined
    ? undefined
    : typeof value.setUpstream === "boolean"
      ? value.setUpstream
      : undefined;
  if (value.setUpstream !== undefined && setUpstream === undefined) {
    throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps push operation plan has an invalid upstream value.");
  }
  const sources: AzureDevOpsPushPlan["sources"] = {};
  for (const [key, source] of Object.entries(value.sources)) {
    if (!PUSH_PLAN_PARAMETER_NAMES.has(key) || (source !== "fixed" && source !== "agent" && source !== "derived")) {
      throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps push operation plan has an invalid parameter source.");
    }
    sources[key] = source;
  }
  const resolvedValues = { ...value.resolvedValues };
  if (resolvedValues.remoteName !== remoteName || resolvedValues.repositoryPath !== repositoryPath || !sameKeySet(resolvedValues, sources)) {
    throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps operation plan remote does not match its resolved values.");
  }

  for (const [key, resolved] of Object.entries(resolvedValues)) {
    if (key === "remoteName") readRemoteName(resolved);
    if (key === "branch") readBranch(resolved);
    if (key === "setUpstream" && typeof resolved !== "boolean") {
      throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps push operation plan has an invalid upstream value.");
    }
    if ((key === "organization" || key === "project") && (typeof resolved !== "string" || !resolved.trim())) {
      throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps push operation plan has an invalid context value.");
    }
  }

  for (const field of ["organization", "project", "remoteName", "branch", "setUpstream"] as const) {
    const topLevel = value[field];
    if (topLevel !== undefined && (!Object.prototype.hasOwnProperty.call(resolvedValues, field) || !samePlanValue(topLevel, resolvedValues[field]))) {
      throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps push operation plan has inconsistent resolved values.");
    }
  }

  return {
    ...(branch === undefined ? {} : { branch }),
    ...(typeof value.organization === "string" ? { organization: value.organization } : {}),
    ...(typeof value.project === "string" ? { project: value.project } : {}),
    repositoryPath,
    remoteName,
    resolvedValues,
    setUpstream,
    sources,
  };
}

export function validatePullPlan(value: unknown): AzureDevOpsPullPlan {
  if (!isRecord(value) || typeof value.remoteName !== "string" || typeof value.repositoryPath !== "string"
    || !isRecord(value.sources) || !isRecord(value.resolvedValues)) {
    throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps pull operation plan is invalid.");
  }
  if (Object.keys(value).some((key) => SECRET_ENVIRONMENT_NAME_PATTERN.test(key) || key === "remoteUrl")) {
    throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps pull operation plan contains a forbidden field.");
  }
  if (Object.keys(value.resolvedValues).some((key) => !PULL_PLAN_PARAMETER_NAMES.has(key)
    || SECRET_ENVIRONMENT_NAME_PATTERN.test(key) || key === "remoteUrl")) {
    throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps pull operation plan contains an unsupported resolved field.");
  }

  const remoteName = readRemoteName(value.remoteName);
  const repositoryPath = readAzureDevOpsRepositoryPath(value.repositoryPath);
  const branch = readPullBranch(value.branch);
  const sources: AzureDevOpsPullPlan["sources"] = {};
  for (const [key, source] of Object.entries(value.sources)) {
    if (!PULL_PLAN_PARAMETER_NAMES.has(key) || (source !== "fixed" && source !== "agent" && source !== "derived")) {
      throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps pull operation plan has an invalid parameter source.");
    }
    sources[key] = source;
  }
  const resolvedValues = { ...value.resolvedValues };
  if (resolvedValues.remoteName !== remoteName || resolvedValues.repositoryPath !== repositoryPath
    || !sameKeySet(resolvedValues, sources)) {
    throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps pull operation plan does not match its resolved values.");
  }

  for (const [key, resolved] of Object.entries(resolvedValues)) {
    if (key === "remoteName") readRemoteName(resolved);
    if (key === "repositoryPath") readAzureDevOpsRepositoryPath(resolved);
    if (key === "branch") readBranch(resolved);
    if ((key === "organization" || key === "project") && (typeof resolved !== "string" || !resolved.trim())) {
      throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps pull operation plan has an invalid context value.");
    }
  }

  for (const field of ["organization", "project", "branch"] as const) {
    const topLevel = value[field];
    if (topLevel !== undefined && (!Object.prototype.hasOwnProperty.call(resolvedValues, field)
      || !samePlanValue(topLevel, resolvedValues[field]))) {
      throw pluginError("AZURE_DEVOPS_OPERATION_PLAN_INVALID", "Azure DevOps pull operation plan has inconsistent resolved values.");
    }
  }

  return {
    ...(branch === undefined ? {} : { branch }),
    ...(typeof value.organization === "string" ? { organization: value.organization } : {}),
    ...(typeof value.project === "string" ? { project: value.project } : {}),
    repositoryPath,
    remoteName,
    resolvedValues,
    sources,
  };
}

export function readAzureDevOpsRepositoryPath(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > DESTINATION_MAX_LENGTH || value.includes("\\") || isAbsoluteClonePath(value)) {
    throw pluginError("AZURE_DEVOPS_PUSH_REPOSITORY_PATH_INVALID", "repositoryPath must be repository/<name> inside the current project.");
  }
  const segments = value.split("/");
  if (segments.length !== 2 || segments[0] !== "repository" || !segments[1] || segments[1] === "." || segments[1] === "..") {
    throw pluginError("AZURE_DEVOPS_PUSH_REPOSITORY_PATH_INVALID", "repositoryPath must be a direct child of the current project's repository/ directory.");
  }
  try {
    validateGitPathSegment(segments[1]);
  } catch {
    throw pluginError("AZURE_DEVOPS_PUSH_REPOSITORY_PATH_INVALID", "repositoryPath contains an invalid repository name.");
  }
  return value;
}

function sameKeySet(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]);
}

export function samePlanValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sanitizePushCredentialInput(input: Record<string, unknown>, plan: AzureDevOpsPushPlan): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of PUSH_PARAMETER_NAMES) {
    if (plan.sources[key] === "agent" && input[key] !== undefined) result[key] = input[key];
  }
  return result;
}

export function sanitizePushDerivedValues(value: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return value.branch === undefined ? {} : { branch: readBranch(value.branch) };
}

export function readRemoteName(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(value.trim())) {
    throw pluginError("AZURE_DEVOPS_REMOTE_NAME_INVALID", "The Git remote name is invalid.");
  }
  return value.trim();
}

export function readBranch(value: unknown): string {
  const branch = typeof value === "string" ? value.trim() : "";
  if (!branch) throw pluginError("AZURE_DEVOPS_BRANCH_REQUIRED", "A Git branch is required for push.");
  if (!BRANCH_PATTERN.test(branch) || branch.includes("..") || branch.includes("//") || branch.includes("@{") || branch.startsWith("refs/") || branch.endsWith("/") || branch.endsWith(".") || branch.endsWith(".lock")) {
    throw pluginError("AZURE_DEVOPS_BRANCH_INVALID", "The Git branch name is invalid.");
  }
  return branch;
}

export function readPullBranch(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const branch = typeof value === "string" ? value.trim() : "";
  if (!branch) throw pluginError("AZURE_DEVOPS_BRANCH_INVALID", "The Git pull branch is invalid.");
  if (!BRANCH_PATTERN.test(branch) || branch.includes("..") || branch.includes("//") || branch.includes("@{")
    || branch.startsWith("refs/") || branch.endsWith("/") || branch.endsWith(".") || branch.endsWith(".lock")) {
    throw pluginError("AZURE_DEVOPS_BRANCH_INVALID", "The Git pull branch is invalid.");
  }
  return branch;
}

export function assertPushInput(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw pluginError("AZURE_DEVOPS_PUSH_PARAMETERS_INVALID", "Azure DevOps push parameters must be an object.");
  for (const key of Object.keys(value)) {
    if (PUSH_OVERWRITE_PARAMETER_NAMES.has(key)) {
      throw pluginError("AZURE_DEVOPS_PUSH_OVERWRITE_FORBIDDEN", "Azure DevOps push does not support history overwrite or remote deletion.");
    }
    if (!PUSH_PARAMETER_NAMES.has(key)) {
      throw pluginError("AZURE_DEVOPS_PUSH_PARAMETER_UNKNOWN", "The Azure DevOps push parameter is not supported.");
    }
  }
  if (value.repositoryPath !== undefined) readAzureDevOpsRepositoryPath(value.repositoryPath);
}

export function assertPullInput(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw pluginError("AZURE_DEVOPS_PULL_PARAMETERS_INVALID", "Azure DevOps pull parameters must be an object.");
  for (const key of Object.keys(value)) {
    if (!PULL_PARAMETER_NAMES.has(key)) {
      throw pluginError("AZURE_DEVOPS_PULL_PARAMETER_UNKNOWN", "The Azure DevOps pull parameter is not supported.");
    }
  }
  if (value.repositoryPath !== undefined) readAzureDevOpsRepositoryPath(value.repositoryPath);
  if (value.remoteName !== undefined) readRemoteName(value.remoteName);
  if (value.branch !== undefined) readPullBranch(value.branch);
}

export function validatePushResolution(value: AzureDevOpsPushResolution, selectedPlan: AzureDevOpsPushPlan, observedRemoteUrl: string): AzureDevOpsPushResolution {
  if (!isRecord(value) || typeof value.organization !== "string" || typeof value.project !== "string") {
    throw pluginError("AZURE_DEVOPS_CONTEXT_INVALID", "Azure DevOps push context is invalid.");
  }
  const remoteName = readRemoteName(value.remoteName);
  if (remoteName !== selectedPlan.remoteName) throw pluginError("AZURE_DEVOPS_REMOTE_CONTEXT_MISMATCH", "The selected Git remote does not match the effective policy.");
  const branch = readBranch(value.branch);
  if (typeof value.remoteUrl !== "string") throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_INVALID", "Azure DevOps remote metadata is incomplete.");
  const remoteUrl = validateAzureDevOpsRemoteUrl(value.remoteUrl, value.organization, value.project);
  const normalizedObservedRemoteUrl = validateAzureDevOpsRemoteUrl(observedRemoteUrl, value.organization, value.project);
  if (remoteUrl !== normalizedObservedRemoteUrl) throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_MISMATCH", "The current Git remote is not the verified Azure DevOps remote.");
  if (typeof value.credential !== "string" || !value.credential.trim()) {
    throw pluginError("AZURE_DEVOPS_CREDENTIAL_BROKER_UNAVAILABLE", "A temporary Azure DevOps credential was not provided.");
  }
  if (typeof value.setUpstream !== "boolean") throw pluginError("AZURE_DEVOPS_POLICY_INVALID", "Azure DevOps upstream policy is invalid.");
  for (const field of ["organization", "project", "remoteName", "branch", "setUpstream"] as const) {
    if (Object.prototype.hasOwnProperty.call(selectedPlan.resolvedValues, field)
      && !samePlanValue(selectedPlan.resolvedValues[field], value[field])) {
      throw pluginError("AZURE_DEVOPS_POLICY_INVALID", "The effective Azure DevOps push plan changed during credential resolution.");
    }
  }
  return { ...value, branch, credential: value.credential.trim(), remoteName, remoteUrl };
}

export function validatePullResolution(
  value: AzureDevOpsPullResolution,
  selectedPlan: AzureDevOpsPullPlan,
  observedRemoteUrl: string,
): AzureDevOpsPullResolution {
  if (!isRecord(value) || typeof value.organization !== "string" || typeof value.project !== "string") {
    throw pluginError("AZURE_DEVOPS_CONTEXT_INVALID", "Azure DevOps pull context is invalid.");
  }
  const remoteName = readRemoteName(value.remoteName);
  if (remoteName !== selectedPlan.remoteName) {
    throw pluginError("AZURE_DEVOPS_REMOTE_CONTEXT_MISMATCH", "The selected Git remote does not match the effective policy.");
  }
  const branch = readPullBranch(value.branch);
  if (typeof value.remoteUrl !== "string") throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_INVALID", "Azure DevOps remote metadata is incomplete.");
  const remoteUrl = validateAzureDevOpsRemoteUrl(value.remoteUrl, value.organization, value.project);
  const normalizedObservedRemoteUrl = validateAzureDevOpsRemoteUrl(observedRemoteUrl, value.organization, value.project);
  if (remoteUrl !== normalizedObservedRemoteUrl) {
    throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_MISMATCH", "The current Git remote is not the verified Azure DevOps remote.");
  }
  if (typeof value.credential !== "string" || !value.credential.trim()) {
    throw pluginError("AZURE_DEVOPS_CREDENTIAL_BROKER_UNAVAILABLE", "A temporary Azure DevOps credential was not provided.");
  }
  for (const field of ["organization", "project", "remoteName", "branch"] as const) {
    if (Object.prototype.hasOwnProperty.call(selectedPlan.resolvedValues, field)
      && !samePlanValue(selectedPlan.resolvedValues[field], value[field])) {
      throw pluginError("AZURE_DEVOPS_POLICY_INVALID", "The effective Azure DevOps pull plan changed during credential resolution.");
    }
  }
  return { ...value, ...(branch ? { branch } : {}), credential: value.credential.trim(), remoteName, remoteUrl };
}

export function sanitizePullError(error: unknown, fallbackCode: string, secret?: string): Error & { code: string } {
  const value = error as { code?: unknown };
  const code = typeof value.code === "string" && /^[A-Z][A-Z0-9_]{1,100}$/.test(value.code) && value.code.startsWith("AZURE_DEVOPS_")
    ? value.code
    : fallbackCode;
  const message = redactGitOutput(error instanceof Error ? error.message : String(error), secret ? [secret] : []);
  return pluginError(code, message.slice(0, 8_000) || "Azure DevOps pull failed.");
}

export function assertCredentialFreeRemoteUrl(value: string): void {
  try {
    const parsed = new URL(value);
    if (!parsed.protocol || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || /[\r\n\0]/.test(value)) {
      throw new Error("unsafe remote");
    }
  } catch {
    throw pluginError("AZURE_DEVOPS_CANONICAL_REMOTE_INVALID", "Azure DevOps remote URL is invalid or contains credentials.");
  }
}

export function readCloneSelection(input: Record<string, unknown>): CloneSelection {
  const branch = readGitRef(input.branch, "branch");
  const ref = readGitRef(input.ref, "ref");
  if (branch !== undefined && ref !== undefined) {
    throw pluginError("AZURE_DEVOPS_CLONE_SELECTION_CONFLICT", "Clone branch and ref are mutually exclusive.");
  }

  const rawDepth = input.depth;
  if (rawDepth === undefined) return omitUndefined({ branch, ref }) as CloneSelection;
  if (typeof rawDepth !== "number" || !Number.isInteger(rawDepth) || rawDepth < 1 || rawDepth > 100_000) {
    throw pluginError("AZURE_DEVOPS_CLONE_DEPTH_INVALID", "Clone depth must be an integer between 1 and 100000.");
  }
  return { ...omitUndefined({ branch, ref }), depth: rawDepth } as CloneSelection;
}

export function readGitRef(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw pluginError("AZURE_DEVOPS_CLONE_REF_INVALID", `Clone ${field} is invalid.`);
  const result = value.trim();
  if (!result || result.length > GIT_REF_MAX_LENGTH || result.includes("\0") || /[\r\n\t]/.test(result) || result.startsWith("-")) {
    throw pluginError("AZURE_DEVOPS_CLONE_REF_INVALID", `Clone ${field} is invalid.`);
  }
  return result;
}

export function normalizeCloneRef(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^refs\/(?:heads|tags)\/(.+)$/.exec(value);
  return match?.[1] ?? value;
}

export async function validateCloneDestination(rootPath: string, value: unknown, options: { allowGitRepository?: boolean } = {}): Promise<CloneDestination> {
  if (typeof value !== "string" || !value.trim() || value.includes("\0") || value.length > DESTINATION_MAX_LENGTH) {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_INVALID", "Clone destination must be a non-empty relative Git path.");
  }
  const raw = value.trim();
  if (isAbsoluteClonePath(raw)) {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_BOUNDARY", "Clone destination must remain inside the project's repository directory.");
  }

  const normalized = raw.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_BOUNDARY", "Clone destination cannot traverse a parent path.");
  }
  if (segments.some((segment) => !segment || segment === ".")) {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_INVALID", "Clone destination contains an invalid Git path segment.");
  }
  for (const segment of segments) validateGitPathSegment(segment);
  if (segments.length !== 1) {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_BOUNDARY", "Clone destination must be a direct child of the project's repository directory.");
  }

  const absolutePath = resolve(rootPath, ...segments);
  const relativePath = relative(rootPath, absolutePath);
  if (!relativePath || isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${relativePath.includes("\\") ? "\\" : "/"}`)) {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_BOUNDARY", "Clone destination must remain inside the project's repository directory.");
  }

  let current = rootPath;
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]!);
    let stats;
    try {
      stats = await lstat(current);
    } catch (error) {
      if (isMissingPath(error)) return { absolutePath, exists: false, relativePath: normalized, rootPath };
      throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_CONFLICT", "Clone destination could not be inspected.");
    }
    if (stats.isSymbolicLink()) {
      throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_BOUNDARY", "Clone destination cannot cross a symbolic link.");
    }
    const resolvedCurrent = await realpath(current).catch(() => undefined);
    if (!resolvedCurrent || !isPathInside(rootPath, resolvedCurrent)) {
      throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_BOUNDARY", "Clone destination escapes the project's repository directory.");
    }
    if (!stats.isDirectory()) {
      throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_CONFLICT", "Clone destination is not a directory.");
    }
    if (index !== segments.length - 1) continue;
    if (!options.allowGitRepository && await hasGitMarker(current)) {
      throw pluginError("AZURE_DEVOPS_CLONE_REPOSITORY_CONFLICT", "Clone destination is already a Git repository.");
    }
    const entries = await readdir(current).catch(() => undefined);
    if (!entries) throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_CONFLICT", "Clone destination could not be inspected.");
    if (!options.allowGitRepository && entries.length > 0) {
      throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_CONFLICT", "Clone destination must be empty.");
    }
    return {
      absolutePath,
      exists: true,
      identity: { birthtimeMs: stats.birthtimeMs, dev: stats.dev, ino: stats.ino },
      relativePath: normalized,
      rootPath,
    };
  }

  throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_INVALID", "Clone destination is invalid.");
}

export async function hasGitMarker(path: string): Promise<boolean> {
  try {
    await lstat(join(path, ".git"));
    return true;
  } catch (error) {
    if (isMissingPath(error)) return false;
    return true;
  }
}

export function validateGitPathSegment(value: string): void {
  if (value.length > 255 || /[\u0000-\u001f\u007f<>:"|?*]/.test(value) || /[ .]$/.test(value)) {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_INVALID", "Clone destination contains an invalid Git path segment.");
  }
  if (value.toLowerCase() === ".git") {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_INVALID", "Clone destination cannot target Git metadata.");
  }
  const stem = value.split(".", 1)[0]!.toUpperCase();
  if (["CON", "PRN", "AUX", "NUL", ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`), ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`)].includes(stem)) {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_INVALID", "Clone destination contains a reserved Windows path name.");
  }
}

export function isAbsoluteClonePath(value: string): boolean {
  return isAbsolute(value) || posix.isAbsolute(value) || win32.isAbsolute(value) || /^[A-Za-z]:/.test(value) || /^\\\\/.test(value);
}

export function isPathInside(rootPath: string, value: string): boolean {
  const candidate = relative(rootPath, value);
  return candidate === "" || (!isAbsolute(candidate) && candidate !== ".." && !candidate.startsWith(`..${candidate.includes("\\") ? "\\" : "/"}`));
}

export function readCredential(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 500) {
    throw pluginError("AZURE_DEVOPS_CREDENTIAL_BROKER_INVALID", "The credential broker returned no usable Git credential.");
  }
  return value;
}

export function mapCredentialError(error: unknown): Error & { code: string } {
  if (isPluginError(error) && error.code === "AZURE_DEVOPS_CREDENTIAL_BROKER_INVALID") return error;
  return pluginError("AZURE_DEVOPS_CREDENTIAL_BROKER_UNAVAILABLE", "The Azure DevOps credential broker is unavailable.");
}

export function mapRepositoryError(error: unknown): Error & { code: string } {
  if (isPluginError(error)) return pluginError(error.code, redact(error.message).slice(0, 8_000));
  return pluginError("AZURE_DEVOPS_REPOSITORY_LOOKUP_FAILED", "Azure DevOps repository metadata could not be loaded.");
}

export function mapGitError(error: unknown, secrets: readonly string[]): Error & { code: string } {
  const code = isPluginError(error) && /^AZURE_DEVOPS_/.test(error.code) ? error.code : "AZURE_DEVOPS_GIT_FAILED";
  const message = isPluginError(error) && code !== "AZURE_DEVOPS_GIT_FAILED"
    ? error.message
    : `Git clone failed: ${redactGitOutput(error instanceof Error ? error.message : "Git command failed", secrets).slice(0, 8_000)}`;
  return pluginError(code, redactGitOutput(message, secrets).slice(0, 8_000));
}

export function mapGitPushError(error: unknown, operation: string): Error & { code: string } {
  const value = error as { code?: unknown; message?: unknown };
  const detail = redactGitOutput(error instanceof Error ? error.message : String(error));
  if (value.code === "AZURE_DEVOPS_BRANCH_NOT_FOUND") return pluginError("AZURE_DEVOPS_BRANCH_NOT_FOUND", detail.slice(0, 8_000));
  return pluginError("AZURE_DEVOPS_GIT_PUSH_FAILED", `${operation} failed: ${detail.slice(0, 8_000)}`);
}

export function sanitizePushError(error: unknown, fallbackCode: string, secret?: string): Error & { code: string } {
  const value = error as { code?: unknown };
  const code = typeof value.code === "string" && /^[A-Z][A-Z0-9_]{1,100}$/.test(value.code) && value.code.startsWith("AZURE_DEVOPS_")
    ? value.code
    : fallbackCode;
  const message = redactGitOutput(error instanceof Error ? error.message : String(error), secret ? [secret] : []);
  return pluginError(code, message.slice(0, 8_000) || "Azure DevOps push failed.");
}

export function redactGitOutput(value: string, explicitSecrets: readonly string[] = []): string {
  return redact(value, gitRedactionSecrets(explicitSecrets));
}

function gitRedactionSecrets(explicitSecrets: readonly string[] = []): string[] {
  const secrets = new Set<string>();
  for (const secret of explicitSecrets) if (secret) secrets.add(secret);
  for (const [key, value] of Object.entries(process.env)) {
    if (value && SECRET_ENVIRONMENT_NAME_PATTERN.test(key)) secrets.add(value);
  }
  return [...secrets].slice(0, MAX_REDACTION_SECRET_COUNT);
}

export function redact(value: string, secretOrSecrets: string | readonly string[] = []): string {
  const secrets = typeof secretOrSecrets === "string" ? [secretOrSecrets] : secretOrSecrets;
  let result = value;
  for (const secret of secrets) {
    if (secret) result = result.split(secret).join("[REDACTED]");
  }
  return result
    .replace(/(https?:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi, "$1[REDACTED]@")
    .replace(/(?:authorization\s*:\s*bearer|bearer)\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\b(Basic)\s+[^\s,;]+/gi, "$1 [REDACTED]")
    .replace(/(?:authorization|token|pat|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\b(?:pat|token|secret|password)[-_][A-Za-z0-9+/=._-]+/gi, "$1-[REDACTED]");
}

export function pluginError(code: string, message: string, details?: unknown): Error & { code: string; details?: unknown } {
  const error = new Error(message) as Error & { code: string; details?: unknown };
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

export function isPluginError(value: unknown): value is Error & { code: string } {
  return value instanceof Error && typeof (value as Error & { code?: unknown }).code === "string";
}

export function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function omitUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

export function isMissingRemote(error: unknown): boolean {
  const value = error as { gitCode?: string | number; message?: string };
  return value.gitCode === 2 || value.gitCode === "2" || /No such remote|does not appear to be a git repository/i.test(value.message || "");
}

export function isMissingBranch(error: unknown): boolean {
  const value = error as { gitCode?: string | number; message?: string };
  return value.gitCode === 1 || value.gitCode === "1" || /Needed a single revision|unknown revision|does not match any/i.test(value.message || "");
}
