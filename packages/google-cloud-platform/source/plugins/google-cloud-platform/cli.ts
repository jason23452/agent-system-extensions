const DEFAULT_BFF_BASE_URL = "http://agent-system-backend:8000";
const MAX_TOOL_OUTPUT_LENGTH = 60_000;

export function currentProject(input: unknown): string {
  const value = isRecord(input) ? input.project : undefined;
  const projectValue = typeof value === "string"
    ? value
    : isRecord(value) && typeof value.name === "string"
      ? value.name
      : undefined;
  const directory = isRecord(input) && typeof input.directory === "string" ? input.directory : undefined;
  const projectsPath = directory?.replace(/\\/g, "/").match(/(?:^|\/)projects\/([^/]+)(?:\/|$)/)?.[1];
  const directoryName = directory?.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1);
  const fallbackDirectory = directoryName && !new Set(["workspace", "workflow", "projects", "root"]).has(directoryName.toLowerCase())
    ? directoryName
    : undefined;
  const project = projectValue || process.env.AGENT_SYSTEM_PROJECT || projectsPath || fallbackDirectory;
  if (typeof project !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(project.trim())) {
    throw new Error("The current Agent System Project identity is required to run gcloud.");
  }
  return project.trim();
}

export async function callGcloudBackend(project: string, commandArgs: string[]): Promise<{ exitCode: number; output: string; truncated: boolean }> {
  const baseUrl = (process.env.AGENT_SYSTEM_BFF_BASE_URL || DEFAULT_BFF_BASE_URL).replace(/\/+$/, "");
  const endpoint = new URL("/bff/extensions/google-cloud-platform/backend/exec", baseUrl);
  endpoint.searchParams.set("project", project);
  endpoint.searchParams.set("scope", "project");
  const response = await fetch(endpoint, {
    body: JSON.stringify({ args: commandArgs }),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-agent-system-workspace": project,
    },
    method: "POST",
    signal: AbortSignal.timeout(125_000),
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
    const code = typeof error.code === "string" ? error.code : "GCP_CLI_BACKEND_REQUEST_FAILED";
    const message = typeof error.message === "string" ? error.message : "The Google Cloud CLI command could not be executed.";
    throw new Error(`${code}: ${message}`.slice(0, 1_500));
  }
  if (!isRecord(payload) || !Number.isInteger(payload.exitCode) || typeof payload.output !== "string") {
    throw new Error("GCP_CLI_BACKEND_RESPONSE_INVALID: The Google Cloud CLI backend returned an invalid response.");
  }
  return {
    exitCode: payload.exitCode as number,
    output: payload.output.slice(0, MAX_TOOL_OUTPUT_LENGTH),
    truncated: payload.truncated === true || payload.output.length > MAX_TOOL_OUTPUT_LENGTH,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
