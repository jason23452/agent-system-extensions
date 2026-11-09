import { pluginError } from "./validation.ts";

export type AzureDevOpsWorkItemSummary = {
  id: number;
  rev: number;
  type: string;
  title: string;
  url: string;
};

export function readAzureDevOpsWorkItemCreateResponse(value: Record<string, unknown>): AzureDevOpsWorkItemSummary {
  return readAzureDevOpsWorkItemResponse(value);
}

export function readAzureDevOpsWorkItemUpdateResponse(value: Record<string, unknown>): AzureDevOpsWorkItemSummary {
  return readAzureDevOpsWorkItemResponse(value);
}

function readAzureDevOpsWorkItemResponse(value: Record<string, unknown>): AzureDevOpsWorkItemSummary {
  if (!Number.isSafeInteger(value.id)
    || (value.id as number) < 1
    || (value.id as number) > 2_147_483_647
    || !Number.isSafeInteger(value.rev)
    || (value.rev as number) < 1
    || (value.rev as number) > 2_147_483_647
    || typeof value.type !== "string"
    || !value.type.trim()
    || value.type.length > 128
    || typeof value.title !== "string"
    || !value.title.trim()
    || value.title.length > 255
    || !isAzureDevOpsWorkItemUrl(value.url)) {
    throw pluginError("AZURE_DEVOPS_WORK_ITEM_RESPONSE_INVALID", "Azure DevOps backend returned an invalid Work Item result.");
  }

  return {
    id: value.id as number,
    rev: value.rev as number,
    type: value.type,
    title: value.title,
    url: value.url,
  };
}

function isAzureDevOpsWorkItemUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "dev.azure.com"
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && /^\/[^/]+\/_apis\/wit\/workItems\/\d+$/i.test(url.pathname);
  } catch {
    return false;
  }
}
