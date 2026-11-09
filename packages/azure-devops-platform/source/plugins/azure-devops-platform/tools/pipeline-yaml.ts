import { pluginError } from "./validation.ts";

const COMMIT_ID_PATTERN = /^[0-9a-f]{40}$/i;
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;

export type AzureDevOpsPipelineYamlPublishResult = {
  branch: string;
  commitId: string;
  path: string;
  result: "created" | "no-op";
};

export function readAzureDevOpsPipelineYamlPublishResponse(
  value: Record<string, unknown>,
): AzureDevOpsPipelineYamlPublishResult {
  const path = readPipelineYamlPath(value.path);
  if ((value.result !== "created" && value.result !== "no-op")
    || typeof value.branch !== "string"
    || !isValidBranch(value.branch)
    || typeof value.commitId !== "string"
    || !COMMIT_ID_PATTERN.test(value.commitId)) {
    throw pluginError("AZURE_DEVOPS_PIPELINE_YAML_RESPONSE_INVALID", "Azure DevOps backend returned an invalid Pipeline YAML publish result.");
  }

  return {
    branch: value.branch,
    commitId: value.commitId,
    path,
    result: value.result,
  };
}

function readPipelineYamlPath(value: unknown): string {
  if (typeof value !== "string"
    || value.length > 1_024
    || value !== value.trim()
    || value.startsWith("/")
    || value.startsWith("\\")
    || /^[A-Za-z]:/.test(value)
    || /[\u0000-\u001f\u007f\\]/.test(value)) {
    throw pluginError("AZURE_DEVOPS_PIPELINE_YAML_RESPONSE_INVALID", "Azure DevOps backend returned an invalid Pipeline YAML path.");
  }
  const segments = value.split("/");
  if (!segments.length || segments.some((segment) => !segment || segment === "." || segment === "..") || !/\.ya?ml$/i.test(value)) {
    throw pluginError("AZURE_DEVOPS_PIPELINE_YAML_RESPONSE_INVALID", "Azure DevOps backend returned an invalid Pipeline YAML path.");
  }
  return value;
}

function isValidBranch(value: string): boolean {
  return BRANCH_PATTERN.test(value)
    && !value.includes("..")
    && !value.includes("//")
    && !value.includes("@{")
    && !value.endsWith("/")
    && !value.endsWith(".")
    && !value.endsWith(".lock");
}
