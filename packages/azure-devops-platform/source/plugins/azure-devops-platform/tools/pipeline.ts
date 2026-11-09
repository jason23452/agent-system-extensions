import { isRecord, pluginError } from "./validation.ts";

const PIPELINE_FOLDER_MAX_LENGTH = 512;
const PIPELINE_NAME_MAX_LENGTH = 128;
const YAML_PATH_MAX_LENGTH = 1_024;
const CONTINUATION_TOKEN_MAX_LENGTH = 2_000;

export type AzureDevOpsPipelineSummary = {
  folder: string;
  id: number;
  name: string;
};

export type AzureDevOpsPipelineListResponse = {
  continuationToken?: string;
  count: number;
  pipelines: AzureDevOpsPipelineSummary[];
};

export type AzureDevOpsPipelineCreateResponse = {
  alreadyExists: boolean;
  created: boolean;
  pipeline: AzureDevOpsPipelineSummary & {
    repositoryID: string;
    repositoryName: string;
    yamlPath: string;
  };
};

export function readAzureDevOpsPipelineListResponse(value: Record<string, unknown>): AzureDevOpsPipelineListResponse {
  if (!Number.isSafeInteger(value.count) || (value.count as number) < 0 || !Array.isArray(value.pipelines)) {
    throw pluginError("AZURE_DEVOPS_PIPELINE_RESPONSE_INVALID", "Azure DevOps backend returned an invalid Pipeline list.");
  }
  if (value.pipelines.length > 100 || value.count !== value.pipelines.length) {
    throw pluginError("AZURE_DEVOPS_PIPELINE_RESPONSE_INVALID", "Azure DevOps backend returned an inconsistent Pipeline page.");
  }
  const pipelines = value.pipelines.map((pipeline) => readPipelineSummary(pipeline));
  const continuationToken = readOptionalContinuationToken(value.continuationToken);
  return {
    count: pipelines.length,
    pipelines,
    ...(continuationToken ? { continuationToken } : {}),
  };
}

export function readAzureDevOpsPipelineCreateResponse(value: Record<string, unknown>): AzureDevOpsPipelineCreateResponse {
  if (typeof value.created !== "boolean" || typeof value.alreadyExists !== "boolean"
    || value.created === value.alreadyExists || !isRecord(value.pipeline)) {
    throw pluginError("AZURE_DEVOPS_PIPELINE_RESPONSE_INVALID", "Azure DevOps backend returned an invalid Pipeline creation result.");
  }
  const summary = readPipelineSummary(value.pipeline);
  const repositoryID = readUUID(value.pipeline.repositoryID);
  const repositoryName = readBoundedString(value.pipeline.repositoryName, 128);
  const yamlPath = readBoundedString(value.pipeline.yamlPath, YAML_PATH_MAX_LENGTH);
  if (yamlPath.startsWith("/") || yamlPath.includes("\\") || /[\u0000-\u001f\u007f]/.test(yamlPath)
    || yamlPath.split("/").some((segment) => !segment || segment === "." || segment === "..")
    || !/\.ya?ml$/i.test(yamlPath)) {
    throw pluginError("AZURE_DEVOPS_PIPELINE_RESPONSE_INVALID", "Azure DevOps backend returned an invalid Pipeline YAML path.");
  }
  return {
    alreadyExists: value.alreadyExists,
    created: value.created,
    pipeline: { ...summary, repositoryID, repositoryName, yamlPath },
  };
}

function readPipelineSummary(value: unknown): AzureDevOpsPipelineSummary {
  if (!isRecord(value) || !Number.isSafeInteger(value.id) || (value.id as number) < 1) {
    throw pluginError("AZURE_DEVOPS_PIPELINE_RESPONSE_INVALID", "Azure DevOps backend returned an invalid Pipeline identity.");
  }
  const name = readBoundedString(value.name, PIPELINE_NAME_MAX_LENGTH);
  const folder = readBoundedString(value.folder, PIPELINE_FOLDER_MAX_LENGTH);
  if (/[\u0000-\u001f\u007f]/.test(name) || /[\u0000-\u001f\u007f]/.test(folder)) {
    throw pluginError("AZURE_DEVOPS_PIPELINE_RESPONSE_INVALID", "Azure DevOps backend returned invalid Pipeline text fields.");
  }
  return { folder, id: value.id as number, name };
}

function readBoundedString(value: unknown, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw pluginError("AZURE_DEVOPS_PIPELINE_RESPONSE_INVALID", "Azure DevOps backend returned an invalid Pipeline field.");
  }
  return value;
}

function readUUID(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw pluginError("AZURE_DEVOPS_PIPELINE_RESPONSE_INVALID", "Azure DevOps backend returned an invalid Pipeline repository identity.");
  }
  return value;
}

function readOptionalContinuationToken(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !value || value.length > CONTINUATION_TOKEN_MAX_LENGTH
    || /[\u0000-\u001f\u007f]/.test(value)) {
    throw pluginError("AZURE_DEVOPS_PIPELINE_RESPONSE_INVALID", "Azure DevOps backend returned an invalid Pipeline continuation token.");
  }
  return value;
}

const PIPELINE_ID_MAX = 2_147_483_647;
const FINAL_YAML_MAX_LENGTH = 100_000;
const PIPELINE_STATES = new Set(["unknown", "inProgress", "canceling", "completed"]);
const PIPELINE_RESULTS = new Set(["unknown", "succeeded", "failed", "canceled"]);

export function readAzureDevOpsPipelinePreviewResponse(value: Record<string, unknown>): {
  finalYaml: string;
  pipelineId: number;
  previewOnly: true;
  truncated: boolean;
} {
  if (!isPipelineID(value.pipelineId)
    || value.previewOnly !== true
    || typeof value.finalYaml !== "string"
    || value.finalYaml.length > FINAL_YAML_MAX_LENGTH
    || typeof value.truncated !== "boolean") {
    throw pluginError("AZURE_DEVOPS_PIPELINE_PREVIEW_RESPONSE_INVALID", "Azure DevOps backend returned an invalid Pipeline preview.");
  }
  return {
    pipelineId: value.pipelineId,
    previewOnly: true,
    finalYaml: value.finalYaml,
    truncated: value.truncated,
  };
}

export function readAzureDevOpsPipelineRunResponse(value: Record<string, unknown>): AzureDevOpsPipelineRunSummary {
  return readPipelineRunSummary(value, "AZURE_DEVOPS_PIPELINE_RUN_RESPONSE_INVALID");
}

export function readAzureDevOpsPipelineRunStatusResponse(value: Record<string, unknown>): AzureDevOpsPipelineRunSummary {
  return readPipelineRunSummary(value, "AZURE_DEVOPS_PIPELINE_RUN_STATUS_RESPONSE_INVALID");
}

export type AzureDevOpsPipelineRunSummary = {
  createdDate?: string;
  finishedDate?: string;
  id: number;
  name?: string;
  pipelineId: number;
  pipelineName: string;
  result: "canceled" | "failed" | "succeeded" | "unknown";
  state: "canceling" | "completed" | "inProgress" | "unknown";
};

function readPipelineRunSummary(value: Record<string, unknown>, code: string): AzureDevOpsPipelineRunSummary {
  if (!isPipelineID(value.id)
    || !isPipelineID(value.pipelineId)
    || typeof value.pipelineName !== "string"
    || !value.pipelineName.trim()
    || value.pipelineName.length > 256
    || /[\u0000-\u001f\u007f]/.test(value.pipelineName)
    || typeof value.state !== "string"
    || !PIPELINE_STATES.has(value.state)
    || typeof value.result !== "string"
    || !PIPELINE_RESULTS.has(value.result)
    || (value.name !== undefined && (typeof value.name !== "string" || value.name.length > 256 || /[\u0000-\u001f\u007f]/.test(value.name)))) {
    throw pluginError(code, "Azure DevOps backend returned an invalid Pipeline run summary.");
  }
  return {
    id: value.id,
    pipelineId: value.pipelineId,
    pipelineName: value.pipelineName,
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    state: value.state as AzureDevOpsPipelineRunSummary["state"],
    result: value.result as AzureDevOpsPipelineRunSummary["result"],
    ...(isTimestamp(value.createdDate) ? { createdDate: value.createdDate } : {}),
    ...(isTimestamp(value.finishedDate) ? { finishedDate: value.finishedDate } : {}),
  };
}

function isPipelineID(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= PIPELINE_ID_MAX;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
}
