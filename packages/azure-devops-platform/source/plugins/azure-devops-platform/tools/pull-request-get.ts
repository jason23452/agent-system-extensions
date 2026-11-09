import { isRecord, pluginError } from "./validation.ts";

const MAX_PULL_REQUEST_ID = 2_147_483_647;
const MAX_COMMIT_PAGE_SIZE = 100;
const MAX_CONTINUATION_TOKEN_LENGTH = 2_000;
const MAX_COMMIT_MESSAGE_LENGTH = 2_000;
const PULL_REQUEST_STATUSES = new Set(["active", "abandoned", "completed", "notSet"]);
const GIT_OBJECT_ID_PATTERN = /^[0-9a-f]{40}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AzureDevOpsPullRequestCommitSummary = {
  authorDate?: string;
  authorName?: string;
  commitId: string;
  message: string;
  messageTruncated: boolean;
};

export type AzureDevOpsPullRequestDetails = {
  commitTop: number;
  commits: AzureDevOpsPullRequestCommitSummary[];
  id: number;
  lastMergeCommitId?: string;
  nextContinuationToken?: string;
  repository: { id: string; name: string; project: string };
  sourceCommitId?: string;
  sourceRefName: string;
  status: "active" | "abandoned" | "completed" | "notSet";
  targetCommitId?: string;
  targetRefName: string;
  title: string;
};

export function readAzureDevOpsPullRequestDetailsResponse(value: Record<string, unknown>): AzureDevOpsPullRequestDetails {
  if (!Number.isSafeInteger(value.id) || (value.id as number) < 1 || (value.id as number) > MAX_PULL_REQUEST_ID
    || typeof value.status !== "string" || !PULL_REQUEST_STATUSES.has(value.status)
    || typeof value.commitTop !== "number" || !Number.isInteger(value.commitTop) || value.commitTop < 1 || value.commitTop > MAX_COMMIT_PAGE_SIZE
    || !isRecord(value.repository)
    || !Array.isArray(value.commits) || value.commits.length > value.commitTop || value.commits.length > MAX_COMMIT_PAGE_SIZE) {
    throw invalidPullRequestResponse();
  }

  const repository = {
    id: readUUID(value.repository.id),
    name: readBoundedText(value.repository.name, 128),
    project: readBoundedText(value.repository.project, 128),
  };
  const commits = value.commits.map(readCommitSummary);
  const nextContinuationToken = readOptionalContinuationToken(value.nextContinuationToken);

  return {
    id: value.id as number,
    status: value.status as AzureDevOpsPullRequestDetails["status"],
    title: readBoundedText(value.title, 255),
    sourceRefName: readBranchRef(value.sourceRefName),
    targetRefName: readBranchRef(value.targetRefName),
    repository,
    ...(value.sourceCommitId === undefined ? {} : { sourceCommitId: readCommitId(value.sourceCommitId) }),
    ...(value.targetCommitId === undefined ? {} : { targetCommitId: readCommitId(value.targetCommitId) }),
    ...(value.lastMergeCommitId === undefined ? {} : { lastMergeCommitId: readCommitId(value.lastMergeCommitId) }),
    commitTop: value.commitTop,
    commits,
    ...(nextContinuationToken ? { nextContinuationToken } : {}),
  };
}

function readCommitSummary(value: unknown): AzureDevOpsPullRequestCommitSummary {
  if (!isRecord(value) || typeof value.message !== "string" || value.message.length > MAX_COMMIT_MESSAGE_LENGTH
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.message)
    || typeof value.messageTruncated !== "boolean") {
    throw invalidPullRequestResponse();
  }
  const authorName = value.authorName === undefined ? undefined : readBoundedText(value.authorName, 128);
  const authorDate = value.authorDate === undefined ? undefined : readTimestamp(value.authorDate);
  return {
    commitId: readCommitId(value.commitId),
    message: value.message,
    messageTruncated: value.messageTruncated,
    ...(authorName ? { authorName } : {}),
    ...(authorDate ? { authorDate } : {}),
  };
}

function readBranchRef(value: unknown): string {
  const result = readBoundedText(value, 255);
  if (!result.startsWith("refs/heads/")) throw invalidPullRequestResponse();
  return result;
}

function readBoundedText(value: unknown, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw invalidPullRequestResponse();
  }
  return value;
}

function readUUID(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw invalidPullRequestResponse();
  return value;
}

function readCommitId(value: unknown): string {
  if (typeof value !== "string" || !GIT_OBJECT_ID_PATTERN.test(value)) throw invalidPullRequestResponse();
  return value;
}

function readTimestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 64 || /[\u0000-\u001f\u007f]/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw invalidPullRequestResponse();
  }
  return value;
}

function readOptionalContinuationToken(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !value || value.length > MAX_CONTINUATION_TOKEN_LENGTH
    || /[\u0000-\u001f\u007f]/.test(value)) throw invalidPullRequestResponse();
  return value;
}

function invalidPullRequestResponse(): Error & { code: string } {
  return pluginError("AZURE_DEVOPS_PULL_REQUEST_RESPONSE_INVALID", "Azure DevOps backend returned an invalid pull request details result.");
}
