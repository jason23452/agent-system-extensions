import { pluginError } from "./validation.ts";

export type AzureDevOpsWikiSummary = {
  id: string;
  mappedPath?: string;
  name: string;
  remoteUrl?: string;
  type?: string;
};

export function readAzureDevOpsWikiListResponse(value: Record<string, unknown>): {
  count: number;
  truncated: boolean;
  wikis: AzureDevOpsWikiSummary[];
} {
  if (!Array.isArray(value.wikis)) {
    throw pluginError("AZURE_DEVOPS_WIKI_RESPONSE_INVALID", "Azure DevOps backend returned no Wiki list.");
  }
  const wikis = value.wikis.flatMap((item): AzureDevOpsWikiSummary[] => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return [];
    return [{
      id: item.id,
      name: item.name,
      ...(typeof item.type === "string" ? { type: item.type } : {}),
      ...(typeof item.mappedPath === "string" ? { mappedPath: item.mappedPath } : {}),
      ...(typeof item.remoteUrl === "string" ? { remoteUrl: item.remoteUrl } : {}),
    }];
  });
  return {
    count: typeof value.count === "number" && Number.isInteger(value.count) ? value.count : wikis.length,
    truncated: value.truncated === true,
    wikis,
  };
}

export function readAzureDevOpsWikiWriteResponse(value: Record<string, unknown>): Record<string, unknown> {
  if (typeof value.created !== "boolean"
    || typeof value.path !== "string"
    || typeof value.wikiIdentifier !== "string"
    || (value.wikiName !== undefined && typeof value.wikiName !== "string")
    || !isRecord(value.page)
    || (value.createdAncestors !== undefined
      && (!Array.isArray(value.createdAncestors)
        || value.createdAncestors.length > 31
        || value.createdAncestors.some((path) => typeof path !== "string")))) {
    throw pluginError("AZURE_DEVOPS_WIKI_RESPONSE_INVALID", "Azure DevOps backend returned an invalid Wiki page result.");
  }
  return {
    created: value.created,
    ...(Array.isArray(value.createdAncestors) ? { createdAncestors: value.createdAncestors } : {}),
    wikiIdentifier: value.wikiIdentifier,
    ...(typeof value.wikiName === "string" ? { wikiName: value.wikiName } : {}),
    path: value.path,
    page: value.page,
    ...(typeof value.etag === "string" ? { etag: value.etag } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
