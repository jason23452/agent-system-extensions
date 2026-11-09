import { isRecord, pluginError } from "./validation.ts";

const WORK_ITEM_TEXT_FIELDS = {
  description: 100_000,
  areaPath: 2_048,
  iterationPath: 2_048,
  tags: 4_000,
  reproSteps: 100_000,
  systemInfo: 100_000,
  severity: 128,
  acceptanceCriteria: 100_000,
  activity: 128,
} as const;

const WORK_ITEM_NUMBER_FIELDS = [
  "priority",
  "originalEstimate",
  "remainingWork",
  "completedWork",
  "storyPoints",
  "effort",
  "size",
] as const;

export type AzureDevOpsWorkItemIdentity = {
  displayName?: string;
  uniqueName?: string;
};

export type AzureDevOpsWorkItemDetails = {
  id: number;
  rev: number;
  type: string;
  title: string;
  state: string;
  url: string;
  assignedTo?: AzureDevOpsWorkItemIdentity;
  description?: string;
  areaPath?: string;
  iterationPath?: string;
  priority?: number;
  tags?: string;
  reproSteps?: string;
  systemInfo?: string;
  severity?: string;
  acceptanceCriteria?: string;
  originalEstimate?: number;
  remainingWork?: number;
  completedWork?: number;
  activity?: string;
  storyPoints?: number;
  effort?: number;
  size?: number;
  businessValue?: number;
};

export type AzureDevOpsWorkItemRevisionDetails = AzureDevOpsWorkItemDetails & {
  changedDate?: string;
  changedBy?: AzureDevOpsWorkItemIdentity;
};

export function readAzureDevOpsWorkItemDetailsResponse(value: Record<string, unknown>): AzureDevOpsWorkItemDetails {
  if (!isRecord(value)
    || !isPositiveWorkItemInteger(value.id)
    || !isPositiveWorkItemInteger(value.rev)
    || !readRequiredText(value.type, 128)
    || !readRequiredText(value.title, 255)
    || !readRequiredText(value.state, 128)
    || !isCanonicalWorkItemUrl(value.url, value.id)) {
    throw invalidWorkItemResponse();
  }

  const result: AzureDevOpsWorkItemDetails = {
    id: value.id,
    rev: value.rev,
    type: value.type,
    title: value.title,
    state: value.state,
    url: value.url,
  };

  for (const field of Object.keys(WORK_ITEM_TEXT_FIELDS) as Array<keyof typeof WORK_ITEM_TEXT_FIELDS>) {
    const fieldValue = readOptionalText(value[field], WORK_ITEM_TEXT_FIELDS[field]);
    if (fieldValue !== undefined) result[field] = fieldValue;
  }

  for (const field of WORK_ITEM_NUMBER_FIELDS) {
    const fieldValue = readOptionalNumber(value[field], field);
    if (fieldValue !== undefined) result[field] = fieldValue;
  }

  if (value.businessValue !== undefined && value.businessValue !== null) {
    if (!Number.isSafeInteger(value.businessValue) || (value.businessValue as number) < 0 || (value.businessValue as number) > 100_000) {
      throw invalidWorkItemResponse();
    }
    result.businessValue = value.businessValue as number;
  }

  const assignedTo = readOptionalIdentity(value.assignedTo);
  if (assignedTo) result.assignedTo = assignedTo;

  return result;
}

export function readAzureDevOpsWorkItemRevisionDetailsResponse(value: Record<string, unknown>): AzureDevOpsWorkItemRevisionDetails {
  const result: AzureDevOpsWorkItemRevisionDetails = readAzureDevOpsWorkItemDetailsResponse(value);
  const changedBy = readOptionalIdentity(value.changedBy);
  if (changedBy) result.changedBy = changedBy;
  if (value.changedDate !== undefined && value.changedDate !== null) {
    if (typeof value.changedDate !== "string" || value.changedDate.length > 64 || !Number.isFinite(Date.parse(value.changedDate))) {
      throw invalidWorkItemResponse();
    }
    result.changedDate = value.changedDate;
  }

  return result;
}

function readRequiredText(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= maxLength
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function readOptionalText(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length > maxLength || /[\u0000\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw invalidWorkItemResponse();
  }
  return value;
}

function readOptionalNumber(value: unknown, field: (typeof WORK_ITEM_NUMBER_FIELDS)[number]): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0
    || (field === "priority" && (!Number.isSafeInteger(value) || value < 1 || value > 100_000))) {
    throw invalidWorkItemResponse();
  }
  return value;
}

function readOptionalIdentity(value: unknown): AzureDevOpsWorkItemIdentity | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw invalidWorkItemResponse();
  const identity: AzureDevOpsWorkItemIdentity = {};
  for (const [field, maxLength] of [["displayName", 256], ["uniqueName", 512]] as const) {
    const fieldValue = value[field];
    if (fieldValue === undefined || fieldValue === null || fieldValue === "") continue;
    if (typeof fieldValue !== "string" || fieldValue.length > maxLength || /[\u0000-\u001f\u007f]/.test(fieldValue)) {
      throw invalidWorkItemResponse();
    }
    identity[field] = fieldValue;
  }
  return Object.keys(identity).length > 0 ? identity : undefined;
}

function isPositiveWorkItemInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 2_147_483_647;
}

function isCanonicalWorkItemUrl(value: unknown, id: number): value is string {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "dev.azure.com"
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && new RegExp(`^/[^/]+/_apis/wit/workItems/${id}$`, "i").test(url.pathname);
  } catch {
    return false;
  }
}

function invalidWorkItemResponse(): Error & { code: string } {
  return pluginError("AZURE_DEVOPS_WORK_ITEM_RESPONSE_INVALID", "Azure DevOps backend returned an invalid Work Item result.");
}
