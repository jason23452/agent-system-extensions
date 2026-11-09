import { UUID_PATTERN, isRecord, pluginError } from "./validation.ts";

const PULL_REQUEST_STATUSES = new Set(["active", "abandoned", "completed"]);

export type AzureDevOpsPullRequestListSummary = {
  id: number;
  sourceCommitId?: string;
  targetCommitId?: string;
  lastMergeCommitId?: string;
  repository: {
    id: string;
    name: string;
    project: string;
  };
  sourceRefName: string;
  status: string;
  targetRefName: string;
  title: string;
};

export function readAzureDevOpsPullRequestListResponse(value: Record<string, unknown>): {
  count: number;
  pullRequests: AzureDevOpsPullRequestListSummary[];
  skip: number;
  status: "active" | "abandoned" | "completed" | "all";
  top: number;
} {
  if (!Array.isArray(value.pullRequests)
    || !Number.isSafeInteger(value.count)
    || value.count !== value.pullRequests.length
    || !Number.isSafeInteger(value.top) || (value.top as number) < 1 || (value.top as number) > 100
    || !Number.isSafeInteger(value.skip) || (value.skip as number) < 0 || (value.skip as number) > 2_147_483_647
    || !isPullRequestListStatus(value.status)
    || value.pullRequests.length > (value.top as number)) {
    throw invalidPullRequestListResponse();
  }

  const pullRequests = value.pullRequests.map((item): AzureDevOpsPullRequestListSummary => {
    if (!isRecord(item)
      || !Number.isSafeInteger(item.id) || (item.id as number) < 1 || (item.id as number) > 2_147_483_647
      || typeof item.status !== "string" || !PULL_REQUEST_STATUSES.has(item.status)
      || !readBoundedText(item.title, 255)
      || !isBranchRef(item.sourceRefName)
      || !isBranchRef(item.targetRefName)
      || !isOptionalCommitId(item.sourceCommitId)
      || !isOptionalCommitId(item.targetCommitId)
      || !isOptionalCommitId(item.lastMergeCommitId)
      || !isRecord(item.repository)
      || typeof item.repository.id !== "string" || !UUID_PATTERN.test(item.repository.id)
      || !readBoundedText(item.repository.name, 128)
      || !readBoundedText(item.repository.project, 128)) {
      throw invalidPullRequestListResponse();
    }

    return {
      id: item.id as number,
      ...(typeof item.sourceCommitId === "string" ? { sourceCommitId: item.sourceCommitId } : {}),
      ...(typeof item.targetCommitId === "string" ? { targetCommitId: item.targetCommitId } : {}),
      ...(typeof item.lastMergeCommitId === "string" ? { lastMergeCommitId: item.lastMergeCommitId } : {}),
      repository: {
        id: item.repository.id,
        name: item.repository.name as string,
        project: item.repository.project as string,
      },
      sourceRefName: item.sourceRefName,
      status: item.status as string,
      targetRefName: item.targetRefName,
      title: item.title as string,
    };
  });

  return {
    count: pullRequests.length,
    pullRequests,
    skip: value.skip as number,
    status: value.status,
    top: value.top as number,
  };
}

function isPullRequestListStatus(value: unknown): value is "active" | "abandoned" | "completed" | "all" {
  return value === "active" || value === "abandoned" || value === "completed" || value === "all";
}

function isBranchRef(value: unknown): value is string {
  return readBoundedText(value, 255) !== undefined && (value as string).startsWith("refs/heads/");
}

function isOptionalCommitId(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && /^[0-9a-f]{40}$/i.test(value));
}

function readBoundedText(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : undefined;
}

function invalidPullRequestListResponse() {
  return pluginError("AZURE_DEVOPS_PULL_REQUEST_LIST_RESPONSE_INVALID", "Azure DevOps backend returned an invalid pull request list.");
}
