import { UUID_PATTERN, pluginError } from "./validation.ts";

export type AzureDevOpsPullRequestSummary = {
  id: number;
  isDraft: boolean;
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

export function readAzureDevOpsPullRequestCreateResponse(value: Record<string, unknown>): AzureDevOpsPullRequestSummary {
  const repository = isRecord(value.repository) ? value.repository : undefined;
  const id = value.id;
  const status = readBoundedText(value.status, 32);
  const title = readBoundedText(value.title, 255);
  const sourceRefName = readBoundedText(value.sourceRefName, 255);
  const targetRefName = readBoundedText(value.targetRefName, 255);
  const project = repository ? readBoundedText(repository.project, 128) : undefined;
  if (!Number.isSafeInteger(id) || (id as number) < 1 || (id as number) > 2_147_483_647
    || !status || !title || !sourceRefName || !targetRefName
    || typeof value.isDraft !== "boolean"
    || !repository
    || typeof repository.id !== "string" || !UUID_PATTERN.test(repository.id)
    || !readBoundedText(repository.name, 128)
    || !project) {
    throw pluginError("AZURE_DEVOPS_PULL_REQUEST_RESPONSE_INVALID", "Azure DevOps backend returned an invalid pull request result.");
  }

  return {
    id: id as number,
    isDraft: value.isDraft,
    repository: {
      id: repository.id,
      name: repository.name as string,
      project,
    },
    sourceRefName,
    status,
    targetRefName,
    title,
  };
}

function readBoundedText(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
