import { UUID_PATTERN, isRecord, pluginError, validateAzureDevOpsRemoteUrl } from "./validation.ts";

export type AzureDevOpsRepositorySummary = {
  id: string;
  name: string;
  remoteUrl: string;
};

export function readAzureDevOpsRepositoryListResponse(value: Record<string, unknown>): {
  count: number;
  repositories: AzureDevOpsRepositorySummary[];
} {
  if (!Array.isArray(value.repositories)
    || !Number.isSafeInteger(value.count)
    || value.count !== value.repositories.length) {
    throw pluginError("AZURE_DEVOPS_REPOSITORY_LIST_RESPONSE_INVALID", "Azure DevOps backend returned an invalid repository list.");
  }

  const repositories = value.repositories.map((item): AzureDevOpsRepositorySummary => {
    if (!isRecord(item)
      || typeof item.id !== "string"
      || !UUID_PATTERN.test(item.id)
      || typeof item.name !== "string"
      || !item.name.trim()
      || item.name.length > 128
      || /[\u0000-\u001f\u007f]/.test(item.name)
      || typeof item.remoteUrl !== "string") {
      throw pluginError("AZURE_DEVOPS_REPOSITORY_LIST_RESPONSE_INVALID", "Azure DevOps backend returned invalid repository metadata.");
    }

    let remoteUrl: string;
    try {
      remoteUrl = validateAzureDevOpsRemoteUrl(item.remoteUrl, undefined, undefined, item.name.trim());
    } catch {
      throw pluginError("AZURE_DEVOPS_REPOSITORY_LIST_RESPONSE_INVALID", "Azure DevOps backend returned an unsafe repository URL.");
    }
    if (remoteUrl !== item.remoteUrl) {
      throw pluginError("AZURE_DEVOPS_REPOSITORY_LIST_RESPONSE_INVALID", "Azure DevOps backend returned a non-canonical repository URL.");
    }

    return { id: item.id, name: item.name.trim(), remoteUrl };
  });

  return { count: repositories.length, repositories };
}
