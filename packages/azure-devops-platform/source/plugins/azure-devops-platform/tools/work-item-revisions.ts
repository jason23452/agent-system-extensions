import { readAzureDevOpsWorkItemRevisionDetailsResponse } from "./work-item-details.ts";
import type { AzureDevOpsWorkItemRevisionDetails } from "./work-item-details.ts";
import { isRecord, pluginError } from "./validation.ts";

const MAX_WORK_ITEM_ID = 2_147_483_647;
const MAX_REVISION_SKIP = 2_147_483_647;
const MAX_REVISION_TOP = 20;
const TEXT_FIELDS = new Set([
  "description",
  "areaPath",
  "iterationPath",
  "assignedTo",
  "tags",
  "reproSteps",
  "systemInfo",
  "severity",
  "acceptanceCriteria",
  "activity",
  "changedDate",
  "changedBy",
]);

export type AzureDevOpsWorkItemRevision = AzureDevOpsWorkItemRevisionDetails & {
  truncatedFields: string[];
};

export type AzureDevOpsWorkItemRevisions = {
  workItemId: number;
  top: number;
  skip: number;
  count: number;
  hasMore: boolean;
  nextSkip?: number;
  revisions: AzureDevOpsWorkItemRevision[];
};

export function readAzureDevOpsWorkItemRevisionsResponse(value: Record<string, unknown>): AzureDevOpsWorkItemRevisions {
  if (!isRecord(value)
    || !isPositiveInteger(value.workItemId)
    || !Number.isInteger(value.top)
    || (value.top as number) < 1
    || (value.top as number) > MAX_REVISION_TOP
    || !Number.isInteger(value.skip)
    || (value.skip as number) < 0
    || (value.skip as number) > MAX_REVISION_SKIP
    || !Array.isArray(value.revisions)
    || value.revisions.length > (value.top as number)
    || value.count !== value.revisions.length
    || typeof value.hasMore !== "boolean") {
    throw invalidWorkItemRevisionsResponse();
  }

  const workItemId = value.workItemId;
  const revisions: AzureDevOpsWorkItemRevision[] = [];
  let previousRevision = 0;
  for (const rawRevision of value.revisions) {
    if (!isRecord(rawRevision) || !Array.isArray(rawRevision.truncatedFields)) {
      throw invalidWorkItemRevisionsResponse();
    }
    const snapshot = readAzureDevOpsWorkItemRevisionDetailsResponse(rawRevision);
    if (snapshot.id !== workItemId || snapshot.rev <= previousRevision) {
      throw invalidWorkItemRevisionsResponse();
    }
    const truncatedFields = readTruncatedFields(rawRevision.truncatedFields);
    revisions.push({ ...snapshot, truncatedFields });
    previousRevision = snapshot.rev;
  }

  const result: AzureDevOpsWorkItemRevisions = {
    workItemId,
    top: value.top as number,
    skip: value.skip as number,
    count: revisions.length,
    hasMore: value.hasMore,
    revisions,
  };
  if (value.nextSkip !== undefined) {
    if (!Number.isSafeInteger(value.nextSkip)
      || (value.nextSkip as number) < 0
      || (value.nextSkip as number) > MAX_REVISION_SKIP
      || value.hasMore !== true
      || value.nextSkip !== result.skip + result.count) {
      throw invalidWorkItemRevisionsResponse();
    }
    result.nextSkip = value.nextSkip as number;
  }
  if (value.hasMore && revisions.length !== result.top) throw invalidWorkItemRevisionsResponse();
  return result;
}

function readTruncatedFields(value: unknown[]): string[] {
  if (value.length > TEXT_FIELDS.size) throw invalidWorkItemRevisionsResponse();
  const fields: string[] = [];
  for (const field of value) {
    if (typeof field !== "string" || !TEXT_FIELDS.has(field) || fields.includes(field)) {
      throw invalidWorkItemRevisionsResponse();
    }
    fields.push(field);
  }
  return fields;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= MAX_WORK_ITEM_ID;
}

function invalidWorkItemRevisionsResponse(): Error & { code: string } {
  return pluginError("AZURE_DEVOPS_WORK_ITEM_REVISIONS_RESPONSE_INVALID", "Azure DevOps backend returned an invalid Work Item revisions result.");
}
