import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const ORGANIZATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/;
const REPOSITORY_REFERENCE_PATTERN = /^azure-devops:\/\/([^/]+)\/([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const PULL_REQUEST_LIST_STATUSES = new Set(["active", "abandoned", "completed", "all"]);
const PULL_REQUEST_RESULT_STATUSES = new Set(["active", "abandoned", "completed"]);
const PIPELINE_CREATE_REPOSITORY_SELECTOR_ERRORS = {
  missing: { statusCode: 400, code: "AZURE_DEVOPS_REPOSITORY_REFERENCE_REQUIRED", message: "Provide exactly one verified Repository reference, ID, or name." },
  ambiguous: { statusCode: 400, code: "ADO_PIPELINE_REPOSITORY_IDENTITY_AMBIGUOUS", message: "Provide exactly one verified Repository reference, ID, or name." },
  repositoryNameRequired: { code: "AZURE_DEVOPS_REPOSITORY_REFERENCE_REQUIRED", label: "A repository name is required." },
  invalidRepositoryName: { statusCode: 400, code: "AZURE_DEVOPS_REPOSITORY_REFERENCE_INVALID", message: "The Azure DevOps repository name is invalid." },
  organizationMismatchStatusCode: 409,
  projectMismatchStatusCode: 409,
  validateRepositoryName: true,
  readReferenceWithContextValue: true,
};
const PIPELINE_YAML_REPOSITORY_SELECTOR_ERRORS = {
  missing: { statusCode: 400, code: "ADO_PIPELINE_YAML_REPOSITORY_IDENTITY_INVALID", message: "Provide exactly one verified repository reference, repository ID, or repository name." },
  ambiguous: { statusCode: 400, code: "ADO_PIPELINE_YAML_REPOSITORY_IDENTITY_INVALID", message: "Provide exactly one verified repository reference, repository ID, or repository name." },
  repositoryNameRequired: { code: "ADO_PIPELINE_YAML_REPOSITORY_IDENTITY_INVALID", label: "A repository name is required." },
  organizationMismatchStatusCode: 400,
  projectMismatchStatusCode: 400,
  validateRepositoryName: false,
  readReferenceWithContextValue: false,
};
const PIPELINE_REPOSITORY_SELECTOR_REFERENCE_INVALID = {
  statusCode: 400,
  code: "AZURE_DEVOPS_REPOSITORY_REFERENCE_INVALID",
  message: "The Azure DevOps repository reference is invalid.",
};
const PIPELINE_REPOSITORY_SELECTOR_ID_INVALID = {
  statusCode: 400,
  code: "AZURE_DEVOPS_REPOSITORY_REFERENCE_INVALID",
  message: "The Azure DevOps repository ID is invalid.",
};
const PIPELINE_REPOSITORY_SELECTOR_ORGANIZATION_MISMATCH = {
  code: "AZURE_DEVOPS_ORGANIZATION_MISMATCH",
  message: "The repository reference belongs to another Azure DevOps organization.",
};
const PIPELINE_REPOSITORY_SELECTOR_PROJECT_MISMATCH = {
  code: "AZURE_DEVOPS_PROJECT_MISMATCH",
  message: "The repository reference belongs to another Azure DevOps project.",
};
const CANONICAL_REMOTE_INVALID_MESSAGE = "Azure DevOps remote URL is not canonical.";
const TOKEN_MAX_LENGTH = 500;
const WIKI_CONTENT_MAX_LENGTH = 100_000;
const PIPELINE_YAML_CONTENT_MAX_LENGTH = 100_000;
const GIT_OBJECT_ID_PATTERN = /^[0-9a-f]{40}$/i;
const PULL_REQUEST_COMMIT_TOP_DEFAULT = 50;
const PULL_REQUEST_COMMIT_TOP_MAX = 100;
const PULL_REQUEST_COMMIT_MESSAGE_MAX_LENGTH = 2_000;
const PIPELINE_FINAL_YAML_MAX_LENGTH = 100_000;
const CREDENTIAL_STORE_VERSION = 2;
const LEGACY_CREDENTIAL_STORE_VERSION = 1;
const DEFAULT_CREDENTIAL_STORE_PATH = "/var/lib/agent-system/extension-secrets/azure-devops-platform.json";
const WORK_ITEM_CONFIRMATION_FIELDS = {
  type: { referenceName: "System.WorkItemType", maxLength: 128 },
  title: { referenceName: "System.Title", maxLength: 255 },
};
const WORK_ITEM_FIELDS = [
  { parameter: "description", referenceName: "System.Description", validation: "markdown", markdown: true, code: "ADO_WORK_ITEM_DESCRIPTION_INVALID", label: "description" },
  { parameter: "areaPath", referenceName: "System.AreaPath", validation: "string", code: "ADO_WORK_ITEM_AREA_PATH_INVALID", label: "Area Path", maxLength: 2_048 },
  { parameter: "iterationPath", referenceName: "System.IterationPath", validation: "string", code: "ADO_WORK_ITEM_ITERATION_PATH_INVALID", label: "Iteration Path", maxLength: 2_048 },
  { parameter: "assignedTo", referenceName: "System.AssignedTo", validation: "string", code: "ADO_WORK_ITEM_ASSIGNED_TO_INVALID", label: "Assigned To", maxLength: 512 },
  { parameter: "priority", referenceName: "Microsoft.VSTS.Common.Priority", validation: "priority" },
  { parameter: "tags", referenceName: "System.Tags", validation: "string", code: "ADO_WORK_ITEM_TAGS_INVALID", label: "Tags", maxLength: 4_000 },
  { parameter: "state", referenceName: "System.State", validation: "string", code: "ADO_WORK_ITEM_STATE_INVALID", label: "State", maxLength: 128 },
  { parameter: "reproSteps", referenceName: "Microsoft.VSTS.TCM.ReproSteps", validation: "markdown", markdown: true, code: "ADO_WORK_ITEM_REPRO_STEPS_INVALID", label: "Repro Steps" },
  { parameter: "systemInfo", referenceName: "Microsoft.VSTS.TCM.SystemInfo", validation: "markdown", markdown: true, code: "ADO_WORK_ITEM_SYSTEM_INFO_INVALID", label: "System Info" },
  { parameter: "severity", referenceName: "Microsoft.VSTS.Common.Severity", validation: "severity" },
  { parameter: "acceptanceCriteria", referenceName: "Microsoft.VSTS.Common.AcceptanceCriteria", validation: "markdown", markdown: true, code: "ADO_WORK_ITEM_ACCEPTANCE_CRITERIA_INVALID", label: "Acceptance Criteria" },
  { parameter: "originalEstimate", referenceName: "Microsoft.VSTS.Scheduling.OriginalEstimate", validation: "number" },
  { parameter: "remainingWork", referenceName: "Microsoft.VSTS.Scheduling.RemainingWork", validation: "number" },
  { parameter: "completedWork", referenceName: "Microsoft.VSTS.Scheduling.CompletedWork", validation: "number" },
  { parameter: "activity", referenceName: "Microsoft.VSTS.Common.Activity", validation: "activity" },
  { parameter: "storyPoints", referenceName: "Microsoft.VSTS.Scheduling.StoryPoints", validation: "number" },
  { parameter: "effort", referenceName: "Microsoft.VSTS.Scheduling.Effort", validation: "number" },
  { parameter: "size", referenceName: "Microsoft.VSTS.Scheduling.Size", validation: "number" },
  { parameter: "businessValue", referenceName: "Microsoft.VSTS.Common.BusinessValue", validation: "integer" },
];
const WORK_ITEM_READ_FIELD_REFERENCES = [
  "System.Id",
  "System.Rev",
  "System.WorkItemType",
  "System.Title",
  ...WORK_ITEM_FIELDS.map((field) => field.referenceName),
];
const WORK_ITEM_TEXT_TRUNCATION_MARKER = "… [truncated]";
const WORK_ITEM_REVISION_TOP_DEFAULT = 10;
const WORK_ITEM_REVISION_TOP_MAX = 20;
const WORK_ITEM_REVISION_SKIP_MAX = 2_147_483_647;
let credentialWriteQueue = Promise.resolve();

export async function activate() {
  return {
    async handle({ request }) {
      const handlers = {
        "verify-token": verifyToken,
        "store-credential": storeCredentialForProject,
        "create-repository": createRepository,
        "list-repositories": listRepositories,
        "lookup-repository": lookupRepository,
        "push-plan": getGitPushPlan,
        "push-credential": getGitPushCredential,
        "pull-plan": getGitPullPlan,
        "pull-credential": getGitPullCredential,
        "clone-repository": cloneRepository,
        "get-git-credential": getGitCredential,
        "list-pipelines": listPipelines,
        "create-pipeline": createPipeline,
        "list-wikis": listWikis,
        "list-project-wikis": listProjectWikis,
        "create-project-wiki": createProjectWiki,
        "write-wiki-page": writeWikiPage,
        "create-work-item": createWorkItem,
        "get-work-item": getWorkItem,
        "list-work-item-revisions": listWorkItemRevisions,
        "update-work-item": updateWorkItem,
        "create-pull-request": createPullRequest,
        "get-pull-request": getPullRequest,
        "list-pull-requests": listPullRequests,
        "publish-pipeline-yaml": publishPipelineYaml,
        "preview-pipeline": previewPipeline,
        "run-pipeline": runPipeline,
        "get-pipeline-run": getPipelineRun,
        "list-teams": listTeams,
        "create-team": createTeam,
        "update-team": updateTeam,
        "delete-team": deleteTeam,
        "list-team-members": listTeamMembers,
        "add-team-member": addTeamMember,
        "remove-team-member": removeTeamMember,
        "list-classification-nodes": listClassificationNodes,
        "get-team-settings": getTeamSettings,
        "update-team-settings": updateTeamSettings,
        "update-team-field-values": updateTeamFieldValues,
        "list-team-iterations": listTeamIterations,
        "add-team-iteration": addTeamIteration,
        "remove-team-iteration": removeTeamIteration,
        "list-boards": listBoards,
        "get-board-columns": getBoardColumns,
        "update-board-columns": updateBoardColumns,
        "list-dashboards": listDashboards,
        "create-dashboard": createDashboard,
        "update-dashboard": updateDashboard,
        "delete-dashboard": deleteDashboard,
        "create-dashboard-widget": createDashboardWidget,
        "update-dashboard-widget": updateDashboardWidget,
        "delete-dashboard-widget": deleteDashboardWidget,
      };
      const handler = handlers[request.path];
      if (!handler) throw extensionError(404, "ADO_PATH_NOT_FOUND", "Azure DevOps management path was not found.");
      if (request.method !== "POST") throw extensionError(405, "ADO_METHOD_NOT_ALLOWED", "Azure DevOps management requests require POST.");
       return handler(request.body, request);
    },
  };
}

async function verifyToken(body) {
  const { authorization, organization, token } = readCredentials(body);
  const connectionResponse = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/connectionData?connectOptions=none&lastChangeId=-1&lastChangeId64=-1&api-version=7.1-preview.1`,
    authorization,
  );
  const authenticatedUser = connectionResponse.ok ? connectionResponse.body?.authenticatedUser : undefined;
  if (!authenticatedUser || isAnonymousIdentity(authenticatedUser)) {
    return { body: { valid: false, reason: "invalid-token", verifiedAt: new Date().toISOString() } };
  }

  const organizationResponse = await listProjects(organization, authorization);
  if (organizationResponse.status === 401 || organizationResponse.status === 403) {
    return {
      body: {
        valid: true,
        organization,
        organizationAccessible: false,
        projects: [],
        projectsFound: 0,
        reason: "organization-access-denied",
        verifiedAt: new Date().toISOString(),
      },
    };
  }
  if (organizationResponse.status === 404) {
    return {
      body: {
        valid: true,
        organization,
        organizationAccessible: false,
        projects: [],
        projectsFound: 0,
        reason: "organization-not-found",
        verifiedAt: new Date().toISOString(),
      },
    };
  }
  if (!organizationResponse.ok) throw extensionError(502, "ADO_ORGANIZATION_REQUEST_FAILED", "Azure DevOps organization verification failed.");

  const profile = await requestJson(
    "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1-preview.3",
    authorization,
  ).catch(() => undefined);
  const safeProfile = profile?.ok ? publicProfile(profile.body) : undefined;
  const projects = organizationResponse.projects;
  return {
    body: {
      valid: true,
      organization,
      organizationAccessible: true,
      projects,
      ...(safeProfile ? { profile: safeProfile } : {}),
      projectsFound: projects.length,
      verifiedAt: new Date().toISOString(),
    },
  };
}

async function storeCredentialForProject(body) {
  const { organization, token } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  await storeCredential(organization, project, token);
  return { body: { organization, project, stored: true } };
}

async function createRepository(body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_create_repository");
  const { authorization, organization, project: adoProject } = await repositoryCredentials(parameters);
  const name = readContextValue(parameters.repositoryName, "ADO_REPOSITORY_NAME_INVALID", "A repository name is required.", 128);
  const project = await resolveAzureDevOpsProject(organization, adoProject, authorization);
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/git/repositories?api-version=7.1`,
    authorization,
    { body: { name, project: { id: project.id } }, method: "POST" },
  );
  if (response.status === 409) throw extensionError(409, "AZURE_DEVOPS_REPOSITORY_CONFLICT", "The Azure DevOps repository already exists.");
  ensureOk(response, "ADO_REPOSITORY_CREATE_FAILED", "The Azure DevOps repository could not be created.");
  return { body: { repository: publicRepository(response.body, organization, adoProject) } };
}

async function listRepositories(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_list_repositories");
  const { authorization, organization, project } = await repositoryCredentials(parameters);
  let selectedProject;
  try {
    selectedProject = await resolveAzureDevOpsProject(organization, project, authorization);
  } catch (error) {
    const details = isRecord(error?.details) ? error.details : {};
    const upstreamStatus = Number.isInteger(details.upstreamStatus)
      && details.upstreamStatus >= 400
      && details.upstreamStatus <= 599
      ? details.upstreamStatus
      : error?.code === "ADO_PROJECT_NOT_FOUND"
        ? 404
        : 502;
    throw extensionError(
      upstreamStatus,
      "ADO_REPOSITORY_LIST_FAILED",
      `The Azure DevOps project could not be verified before listing repositories (HTTP ${upstreamStatus}).`,
      { upstreamStatus },
    );
  }
  let response;
  try {
    response = await requestJson(
      `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.1`,
      authorization,
    );
  } catch {
    throw extensionError(502, "ADO_REPOSITORY_LIST_FAILED", "Azure DevOps repositories could not be loaded.", { upstreamStatus: 502 });
  }
  if (!response.ok) {
    const status = Number.isInteger(response.status) && response.status >= 400 && response.status <= 599 ? response.status : 502;
    throw extensionError(status, "ADO_REPOSITORY_LIST_FAILED", `Azure DevOps repositories could not be loaded (HTTP ${status}).`, { upstreamStatus: status });
  }
  if (!Array.isArray(response.body?.value)) {
    throw extensionError(502, "AZURE_DEVOPS_REPOSITORY_LIST_RESPONSE_INVALID", "Azure DevOps returned an invalid repository list.");
  }

  const repositories = response.body.value.map((item) => {
    assertRepositoryListName(item);
    const repository = publicRepository(item, organization, project);
    if (repository.project.id.toLowerCase() !== selectedProject.id.toLowerCase()) {
      throw extensionError(502, "AZURE_DEVOPS_PROJECT_MISMATCH", "Azure DevOps returned repository metadata from another project.");
    }
    return { id: repository.id, name: repository.name, remoteUrl: repository.remoteUrl };
  });
  return { body: { count: repositories.length, repositories } };
}

async function listPipelines(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_list_pipelines");
  const { authorization, organization, project, token } = await repositoryCredentials(parameters);
  await resolvePipelineProject(organization, project, authorization);
  const continuationToken = readOptionalPipelineContinuationToken(parameters.continuationToken, token);
  const page = await readPipelinePage(organization, project, authorization, continuationToken, token);
  if (continuationToken && page.continuationToken === continuationToken) {
    throw extensionError(502, "ADO_PIPELINE_CONTINUATION_INVALID", "Azure DevOps returned a repeated Pipeline continuation token.");
  }
  return {
    body: {
      count: page.pipelines.length,
      pipelines: page.pipelines,
      ...(page.continuationToken ? { continuationToken: page.continuationToken } : {}),
    },
  };
}

async function createPipeline(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_create_pipeline");
  const { authorization, organization, project, token } = await repositoryCredentials(parameters);
  const repositoryIdentity = readPipelineRepositorySelector(parameters, organization, project, PIPELINE_CREATE_REPOSITORY_SELECTOR_ERRORS);
  const selectedProject = await resolvePipelineProject(organization, project, authorization);
  const repository = await resolvePipelineRepository(repositoryIdentity, organization, project, selectedProject, authorization);
  const name = readPipelineName(parameters.name);
  const yamlPath = readRepositoryYamlPath(parameters.yamlPath);
  const folder = readOptionalPipelineFolder(parameters.folder);
  await assertPipelineYamlExists(organization, project, repository, yamlPath, authorization);

  const definition = { folder, name, repositoryID: repository.id, yamlPath };
  const existing = await findExistingPipeline(organization, project, authorization, definition, token);
  if (existing.sameDefinition) return publicCreatedPipeline(existing.sameDefinition, repository, yamlPath, false, true);
  if (existing.definitionUnverifiable) {
    throw extensionError(409, "ADO_PIPELINE_DEFINITION_UNVERIFIABLE", "A Pipeline with this name exists, but Azure DevOps did not return enough definition metadata to verify it. No Pipeline was created.", {
      pipelineID: existing.nameMatch.id,
    });
  }
  if (existing.nameMatch) {
    throw extensionError(409, "ADO_PIPELINE_NAME_CONFLICT", "A Pipeline with this name already exists with a different definition.", {
      pipelineID: existing.nameMatch.id,
    });
  }

  const endpoint = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/pipelines?api-version=7.1`;
  const body = {
    name,
    folder,
    configuration: {
      type: "yaml",
      path: yamlPath,
      repository: { id: repository.id, name: repository.name, type: "azureReposGit" },
    },
  };
  let response;
  try {
    response = await requestPipelineJson(endpoint, authorization, { body, method: "POST" });
  } catch {
    return recoverUnknownPipelineCreate(organization, project, authorization, definition, repository, yamlPath, token);
  }

  if (response.status === 409) {
    const recovered = await recoverPipelineCreateConflict(organization, project, authorization, definition, repository, yamlPath, token);
    if (recovered) return recovered;
    throw extensionError(409, "ADO_PIPELINE_NAME_CONFLICT", "A Pipeline with this name already exists with a different definition.");
  }
  if (response.status >= 500) {
    return recoverUnknownPipelineCreate(organization, project, authorization, definition, repository, yamlPath, token);
  }
  ensurePipelineOk(response, "create");
  if (response.status !== 200 && response.status !== 201) {
    throw extensionError(502, "ADO_PIPELINE_CREATE_RESPONSE_INVALID", "Azure DevOps returned an invalid Pipeline creation response.", {
      upstreamStatus: response.status,
    });
  }

  const created = readPipelineSummary(response.body, "ADO_PIPELINE_CREATE_RESPONSE_INVALID");
  if (created.name.toLowerCase() !== name.toLowerCase()
    || !samePipelineFolder(created.folder, folder)
    || !pipelineCreateResponseMatchesDefinition(response.body, repository, definition)) {
    throw extensionError(502, "ADO_PIPELINE_CREATE_OUTCOME_UNKNOWN", "Azure DevOps accepted Pipeline creation but returned a different definition. Check the project before retrying.", {
      upstreamStatus: response.status,
    });
  }
  return publicCreatedPipeline(created, repository, yamlPath, true, false);
}

async function readPipelinePage(organization, project, authorization, continuationToken, credential) {
  const query = new URLSearchParams({ "$top": "100", "api-version": "7.1" });
  if (continuationToken) query.set("continuationToken", continuationToken);
  const endpoint = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/pipelines?${query}`;
  const response = await requestPipelineJson(endpoint, authorization);
  ensurePipelineOk(response, "list");
  const values = Array.isArray(response.body)
    ? response.body
    : isRecord(response.body) && Array.isArray(response.body.value)
      ? response.body.value
      : undefined;
  if (!values || (isRecord(response.body) && response.body.count !== undefined
    && (!Number.isSafeInteger(response.body.count) || response.body.count < values.length))) {
    throw extensionError(502, "ADO_PIPELINE_LIST_RESPONSE_INVALID", "Azure DevOps returned an invalid Pipeline list.");
  }
  const pipelines = values.map((item) => readPipelineSummary(item, "ADO_PIPELINE_LIST_RESPONSE_INVALID"));
  const nextToken = readOptionalPipelineContinuationToken(response.continuationToken, credential, 502);
  return { pipelines, continuationToken: nextToken };
}

async function findExistingPipeline(organization, project, authorization, definition, credential) {
  const matches = [];
  const visitedTokens = new Set();
  let continuationToken;
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const page = await readPipelinePage(organization, project, authorization, continuationToken, credential);
    matches.push(...page.pipelines.filter((pipeline) => pipeline.name.toLowerCase() === definition.name.toLowerCase()));
    continuationToken = page.continuationToken;
    if (!continuationToken) break;
    if (visitedTokens.has(continuationToken)) {
      throw extensionError(502, "ADO_PIPELINE_CONTINUATION_INVALID", "Azure DevOps returned a repeated Pipeline continuation token.");
    }
    visitedTokens.add(continuationToken);
    if (pageNumber === 99) {
      throw extensionError(502, "ADO_PIPELINE_LOOKUP_LIMIT_EXCEEDED", "Pipeline duplicate checking exceeded its bounded page limit; no Pipeline was created.");
    }
  }

  let identicalMatch;
  let conflictingMatch;
  let unverifiableMatch;
  for (const pipeline of matches) {
    const detail = await readPipelineDetails(organization, project, authorization, pipeline.id);
    if (!detail.verifiable) {
      unverifiableMatch ??= detail.summary;
      continue;
    }
    if (samePipelineDefinition(detail, definition)) identicalMatch ??= detail.summary;
    else conflictingMatch ??= detail.summary;
  }
  if (conflictingMatch) return { nameMatch: conflictingMatch };
  if (unverifiableMatch) return { definitionUnverifiable: true, nameMatch: unverifiableMatch };
  return identicalMatch ? { nameMatch: identicalMatch, sameDefinition: identicalMatch } : {};
}

async function readPipelineDetails(organization, project, authorization, pipelineID) {
  const endpoint = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/pipelines/${encodeURIComponent(pipelineID)}?api-version=7.1`;
  const response = await requestPipelineJson(endpoint, authorization);
  if (response.status === 404) {
    throw extensionError(409, "ADO_PIPELINE_DEFINITION_CHANGED", "A listed Pipeline changed during duplicate checking; no Pipeline was created.", {
      upstreamStatus: 404,
    });
  }
  ensurePipelineOk(response, "read");
  const summary = readPipelineSummary(response.body, "ADO_PIPELINE_RESPONSE_INVALID");
  if (summary.id !== pipelineID) {
    throw extensionError(502, "ADO_PIPELINE_RESPONSE_INVALID", "Azure DevOps returned a different Pipeline identity.");
  }
  const configuration = isRecord(response.body.configuration) ? response.body.configuration : undefined;
  if (configuration?.type === "yaml"
    && (configuration.path === undefined || configuration.repository === undefined)) {
    return { configurationType: "yaml", folder: summary.folder, name: summary.name, summary, verifiable: false };
  }
  return { ...readPipelineDefinition(response.body, "ADO_PIPELINE_RESPONSE_INVALID"), summary, verifiable: true };
}

async function recoverPipelineCreateConflict(organization, project, authorization, definition, repository, yamlPath, credential) {
  try {
    const existing = await findExistingPipeline(organization, project, authorization, definition, credential);
    if (existing.sameDefinition) return publicCreatedPipeline(existing.sameDefinition, repository, yamlPath, false, true);
  } catch {
    return undefined;
  }
  return undefined;
}

async function recoverUnknownPipelineCreate(organization, project, authorization, definition, repository, yamlPath, credential) {
  try {
    const existing = await findExistingPipeline(organization, project, authorization, definition, credential);
    if (existing.sameDefinition) return publicCreatedPipeline(existing.sameDefinition, repository, yamlPath, false, true);
  } catch {
    // The POST may have succeeded, so an unconfirmed result must never be retried automatically.
  }
  throw extensionError(502, "ADO_PIPELINE_CREATE_OUTCOME_UNKNOWN", "Azure DevOps Pipeline creation could not be confirmed. Check the project before retrying.", {
    upstreamStatus: 502,
  });
}

async function resolvePipelineProject(organization, projectName, authorization) {
  const endpoint = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects/${encodeURIComponent(projectName)}?api-version=7.1`;
  const response = await requestPipelineJson(endpoint, authorization);
  if (response.status === 404) {
    throw extensionError(404, "ADO_PIPELINE_PROJECT_NOT_FOUND", "The configured Azure DevOps project was not found.", { upstreamStatus: 404 });
  }
  ensurePipelineOk(response, "project");
  if (!isRecord(response.body) || typeof response.body.name !== "string"
    || response.body.name.toLowerCase() !== projectName.toLowerCase()) {
    throw extensionError(502, "ADO_PIPELINE_PROJECT_RESPONSE_INVALID", "Azure DevOps returned a different or invalid Project identity.");
  }
  return {
    id: readPipelineUUID(response.body.id, "ADO_PIPELINE_PROJECT_RESPONSE_INVALID", "Azure DevOps returned an invalid Project ID."),
    name: response.body.name,
  };
}

async function resolvePipelineRepository(identity, organization, project, selectedProject, authorization) {
  const endpoint = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(identity.value)}?api-version=7.1`;
  const response = await requestPipelineJson(endpoint, authorization);
  if (response.status === 404) {
    throw extensionError(404, "AZURE_DEVOPS_REPOSITORY_NOT_FOUND", "The Azure DevOps repository was not found in the configured project.", { upstreamStatus: 404 });
  }
  ensurePipelineOk(response, "repository");
  const value = response.body;
  if (!isRecord(value) || typeof value.name !== "string" || !isRecord(value.project)) {
    throw extensionError(502, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", "Azure DevOps returned invalid repository metadata.");
  }
  const id = readPipelineUUID(value.id, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", "Azure DevOps returned an invalid repository ID.");
  const name = readPipelineName(value.name, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", 502);
  const projectID = readPipelineUUID(value.project.id, "AZURE_DEVOPS_PROJECT_MISMATCH", "Azure DevOps returned an invalid repository Project ID.");
  if (projectID.toLowerCase() !== selectedProject.id.toLowerCase()
    || typeof value.project.name !== "string"
    || value.project.name.toLowerCase() !== selectedProject.name.toLowerCase()) {
    throw extensionError(409, "AZURE_DEVOPS_PROJECT_MISMATCH", "The selected repository does not belong to the configured Azure DevOps project.");
  }
  if (identity.kind === "id" && id.toLowerCase() !== identity.value.toLowerCase()) {
    throw extensionError(502, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", "Azure DevOps returned a different repository identity.");
  }
  if (identity.kind === "name" && name.toLowerCase() !== identity.value.toLowerCase()) {
    throw extensionError(409, "AZURE_DEVOPS_REPOSITORY_IDENTITY_MISMATCH", "Azure DevOps resolved a different repository than the selected identity.");
  }
  const defaultBranch = typeof value.defaultBranch === "string" ? value.defaultBranch.trim() : "";
  if (!defaultBranch.startsWith("refs/heads/") || defaultBranch.length <= "refs/heads/".length
    || /[\u0000-\u001f\u007f]/.test(defaultBranch)) {
    throw extensionError(409, "AZURE_DEVOPS_REPOSITORY_DEFAULT_BRANCH_MISSING", "The selected repository has no verified default branch.");
  }
  return { defaultBranch, id, name };
}

function readPipelineRepositorySelector(parameters, organization, project, errors) {
  const supplied = ["repositoryReference", "repositoryID", "repositoryName"]
    .filter((field) => parameters[field] !== undefined);
  if (supplied.length !== 1) {
    const selectorCountError = supplied.length === 0 ? errors.missing : errors.ambiguous;
    throw extensionError(selectorCountError.statusCode, selectorCountError.code, selectorCountError.message);
  }
  const field = supplied[0];
  if (field === "repositoryID") {
    const error = PIPELINE_REPOSITORY_SELECTOR_ID_INVALID;
    return { kind: "id", value: readUUID(parameters.repositoryID, error.code, error.message) };
  }
  if (field === "repositoryName") {
    const value = readContextValue(parameters.repositoryName, errors.repositoryNameRequired.code, errors.repositoryNameRequired.label, 128);
    if (errors.validateRepositoryName && (value === "." || value === ".." || /[\\/\u0000-\u001f\u007f]/.test(value))) {
      throw extensionError(errors.invalidRepositoryName.statusCode, errors.invalidRepositoryName.code, errors.invalidRepositoryName.message);
    }
    return { kind: "name", value };
  }

  const referenceError = PIPELINE_REPOSITORY_SELECTOR_REFERENCE_INVALID;
  const reference = errors.readReferenceWithContextValue
    ? readContextValue(parameters.repositoryReference, referenceError.code, referenceError.message, 300)
    : typeof parameters.repositoryReference === "string" ? parameters.repositoryReference.trim() : "";
  const match = REPOSITORY_REFERENCE_PATTERN.exec(reference);
  if (!match) throw extensionError(referenceError.statusCode, referenceError.code, referenceError.message);
  let referenceOrganization;
  let referenceProject;
  try {
    referenceOrganization = decodeURIComponent(match[1]);
    referenceProject = decodeURIComponent(match[2]);
  } catch {
    throw extensionError(referenceError.statusCode, referenceError.code, referenceError.message);
  }
  if (referenceOrganization.toLowerCase() !== organization.toLowerCase()) {
    throw extensionError(errors.organizationMismatchStatusCode, PIPELINE_REPOSITORY_SELECTOR_ORGANIZATION_MISMATCH.code, PIPELINE_REPOSITORY_SELECTOR_ORGANIZATION_MISMATCH.message);
  }
  if (referenceProject.toLowerCase() !== project.toLowerCase()) {
    throw extensionError(errors.projectMismatchStatusCode, PIPELINE_REPOSITORY_SELECTOR_PROJECT_MISMATCH.code, PIPELINE_REPOSITORY_SELECTOR_PROJECT_MISMATCH.message);
  }
  const repositoryIDError = PIPELINE_REPOSITORY_SELECTOR_ID_INVALID;
  return { kind: "id", value: readUUID(match[3], repositoryIDError.code, repositoryIDError.message) };
}

async function assertPipelineYamlExists(organization, project, repository, yamlPath, authorization) {
  const branch = repository.defaultBranch.slice("refs/heads/".length);
  const query = new URLSearchParams({
    "api-version": "7.1",
    includeContent: "false",
    path: yamlPath,
    "versionDescriptor.version": branch,
    "versionDescriptor.versionType": "branch",
  });
  const endpoint = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repository.id)}/items?${query}`;
  const response = await requestPipelineJson(endpoint, authorization);
  if (response.status === 404) {
    throw extensionError(404, "ADO_PIPELINE_YAML_NOT_FOUND", "The YAML file does not exist on the selected Repository default branch.", { upstreamStatus: 404 });
  }
  ensurePipelineOk(response, "yaml");
  const gitObjectType = isRecord(response.body) && typeof response.body.gitObjectType === "string"
    ? response.body.gitObjectType.toLowerCase()
    : undefined;
  const isFile = isRecord(response.body)
    && (response.body.isFolder === false || (response.body.isFolder === undefined && gitObjectType === "blob"));
  if (!isRecord(response.body) || typeof response.body.path !== "string" || !isFile
    || (gitObjectType !== undefined && gitObjectType !== "blob")
    || readExistingPipelineYamlPath(response.body.path) !== yamlPath) {
    throw extensionError(502, "ADO_PIPELINE_YAML_RESPONSE_INVALID", "Azure DevOps returned an invalid YAML item for the selected default branch.");
  }
}

async function requestPipelineJson(url, authorization, options = {}) {
  try {
    return await requestJson(url, authorization, options);
  } catch {
    throw extensionError(502, "ADO_PIPELINE_NETWORK_REQUEST_FAILED", "Azure DevOps Pipeline REST request failed.", { upstreamStatus: 502 });
  }
}

function ensurePipelineOk(response, operation) {
  if (response?.ok) return;
  const status = Number.isInteger(response?.status) && response.status >= 400 && response.status <= 599 ? response.status : 502;
  const permissionDenied = status === 401 || status === 403;
  const code = permissionDenied ? "ADO_PIPELINE_PERMISSION_DENIED" : `ADO_PIPELINE_${operation.toUpperCase()}_FAILED`;
  const message = permissionDenied
    ? `Azure DevOps denied the Pipeline ${operation} request (HTTP ${status}); verify Build and Code read permissions.`
    : `Azure DevOps Pipeline ${operation} request failed (HTTP ${status}).`;
  throw extensionError(status, code, message, { upstreamStatus: status });
}

function readPipelineSummary(value, code = "ADO_PIPELINE_RESPONSE_INVALID") {
  if (!isRecord(value) || !Number.isSafeInteger(value.id) || value.id < 1) {
    throw extensionError(502, code, "Azure DevOps returned an invalid Pipeline identity.");
  }
  const name = readPipelineName(value.name, code, 502);
  const folder = readOptionalPipelineFolder(value.folder ?? "\\", code, 502);
  return { folder, id: value.id, name };
}

function readPipelineDefinition(value, code = "ADO_PIPELINE_RESPONSE_INVALID") {
  const summary = readPipelineSummary(value, code);
  const configuration = isRecord(value.configuration) ? value.configuration : undefined;
  if (!configuration || typeof configuration.type !== "string") {
    throw extensionError(502, code, "Azure DevOps returned a Pipeline without a valid configuration type.");
  }
  if (configuration.type !== "yaml") {
    return { configurationType: configuration.type, folder: summary.folder, name: summary.name, summary };
  }
  const repository = isRecord(configuration?.repository) ? configuration.repository : undefined;
  if (!repository || repository.type !== "azureReposGit") {
    throw extensionError(502, code, "Azure DevOps returned an invalid YAML Pipeline repository.");
  }
  const repositoryID = readPipelineUUID(repository.id, code, "Azure DevOps returned an invalid Pipeline repository identity.");
  const yamlPath = readExistingPipelineYamlPath(configuration.path, code);
  return { configurationType: "yaml", folder: summary.folder, name: summary.name, repositoryID, summary, yamlPath };
}

function pipelineCreateResponseMatchesDefinition(value, repository, requested) {
  const configuration = isRecord(value) && isRecord(value.configuration) ? value.configuration : undefined;
  if (!configuration || configuration.type !== "yaml") return false;
  if (configuration.path !== undefined
    && readExistingPipelineYamlPath(configuration.path, "ADO_PIPELINE_CREATE_RESPONSE_INVALID") !== requested.yamlPath) return false;

  if (configuration.repository !== undefined) {
    const returnedRepository = configuration.repository;
    if (!isRecord(returnedRepository)
      || (returnedRepository.type !== undefined && returnedRepository.type !== "azureReposGit")) return false;
    if (returnedRepository.id !== undefined
      && readPipelineUUID(returnedRepository.id, "ADO_PIPELINE_CREATE_RESPONSE_INVALID", "Azure DevOps returned an invalid Pipeline repository identity.").toLowerCase()
        !== requested.repositoryID.toLowerCase()) return false;
    if (returnedRepository.name !== undefined
      && (typeof returnedRepository.name !== "string" || returnedRepository.name.toLowerCase() !== repository.name.toLowerCase())) return false;
  }
  return true;
}

function samePipelineDefinition(existing, requested) {
  return existing.configurationType === "yaml"
    && existing.name.toLowerCase() === requested.name.toLowerCase()
    && samePipelineFolder(existing.folder, requested.folder)
    && existing.repositoryID.toLowerCase() === requested.repositoryID.toLowerCase()
    && existing.yamlPath === requested.yamlPath;
}

function samePipelineFolder(left, right) {
  return String(left).toLowerCase() === String(right).toLowerCase();
}

function publicCreatedPipeline(pipeline, repository, yamlPath, created, alreadyExists) {
  return {
    body: {
      alreadyExists,
      created,
      pipeline: {
        folder: pipeline.folder,
        id: pipeline.id,
        name: pipeline.name,
        repositoryID: repository.id,
        repositoryName: repository.name,
        yamlPath: yamlPath.startsWith("/") ? yamlPath.slice(1) : yamlPath,
      },
    },
  };
}

function readPipelineName(value, code = "ADO_PIPELINE_NAME_INVALID", statusCode = 400) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 128 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw extensionError(statusCode, code, "Pipeline name must be non-empty text of at most 128 characters without control characters.");
  }
  return name;
}

function readRepositoryYamlPath(value, code = "ADO_PIPELINE_YAML_PATH_INVALID", statusCode = 400) {
  const path = readRepositoryRelativeYamlPath(value, {
    code,
    invalidMessage: "YAML path must be a repository-relative .yml or .yaml path.",
    rejectDrivePrefix: false,
    statusCode,
    traversalMessage: "YAML path must be a repository-relative .yml or .yaml path without parent traversal.",
  });
  return `/${path}`;
}

function readExistingPipelineYamlPath(value, code = "ADO_PIPELINE_RESPONSE_INVALID") {
  if (typeof value !== "string" || value !== value.trim() || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    throw extensionError(502, code, "Azure DevOps returned an invalid Pipeline YAML path.");
  }
  const relativePath = value.startsWith("/") ? value.slice(1) : value;
  const normalized = readRepositoryYamlPath(relativePath, code, 502);
  return normalized;
}

function readOptionalPipelineFolder(value, code = "ADO_PIPELINE_FOLDER_INVALID", statusCode = 400) {
  if (value === undefined || value === null || value === "") return "\\";
  if (typeof value !== "string" || value !== value.trim() || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw extensionError(statusCode, code, "Pipeline folder must be a bounded Azure DevOps folder path.");
  }
  const normalized = value.replaceAll("/", "\\");
  if (normalized === "\\") return "\\";
  const relativeFolder = normalized.startsWith("\\") ? normalized.slice(1) : normalized;
  const segments = relativeFolder.split("\\");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw extensionError(statusCode, code, "Pipeline folder cannot contain empty or parent path segments.");
  }
  return `\\${segments.join("\\")}`;
}

function readOptionalPipelineContinuationToken(value, credential, statusCode = 400) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 2_000 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw extensionError(statusCode, "ADO_PIPELINE_CONTINUATION_INVALID", "Pipeline continuation token is invalid or exceeds its size limit.");
  }
  const encodedCredential = credential ? Buffer.from(`:${credential}`, "utf8").toString("base64") : "";
  if (credential && (value.includes(credential) || value.includes(encodedCredential))) {
    throw extensionError(statusCode, "ADO_PIPELINE_CONTINUATION_INVALID", "Azure DevOps returned a credential-shaped Pipeline continuation token.");
  }
  return value;
}

function readPipelineUUID(value, code, message) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw extensionError(502, code, message);
  }
  return value;
}

async function listWikis(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_list_wikis");
  const { authorization, organization, project } = await repositoryCredentials(parameters);
  const wikis = await fetchAzureDevOpsWikis(organization, project, authorization);
  return { body: { count: wikis.length, truncated: wikis.length >= 200, wikis } };
}

async function listProjectWikis(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const wikis = await fetchAzureDevOpsWikis(organization, project, authorization);
  return { body: { count: wikis.length, truncated: wikis.length >= 200, wikis } };
}

async function createProjectWiki(body) {
  const { authorization, organization } = readCredentials(body);
  const projectName = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const project = await resolveAzureDevOpsProject(organization, projectName, authorization);
  const name = readWikiName(body?.name ?? `${project.name}.wiki`);
  const existingWikis = await fetchAzureDevOpsWikis(organization, project.name, authorization);
  const existingProjectWiki = existingWikis.find((wiki) => wiki.type === "projectWiki");
  if (existingProjectWiki) return { body: { wiki: existingProjectWiki, alreadyExists: true } };
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wiki/wikis?api-version=7.1`,
    authorization,
    { body: { name, projectId: project.id, type: "projectWiki" }, method: "POST" },
  );
  if (response.body?.typeKey === "WikiAlreadyExistsException") {
    const wikis = await fetchAzureDevOpsWikis(organization, project.name, authorization);
    const existing = wikis.find((wiki) => wiki.name.toLowerCase() === name.toLowerCase() || wiki.type === "projectWiki");
    if (existing) return { body: { wiki: existing, alreadyExists: true } };
  }
  if (response.body?.typeKey === "GitRepositoryNameAlreadyExistsException") {
    const recovered = await recoverExistingProjectWikiRepository(organization, project, authorization, response.status);
    return { body: { ...recovered, recoveredExistingRepository: true } };
  }
  if (response.status === 409) {
    throw extensionError(409, "ADO_WIKI_NAME_CONFLICT", "A Wiki with this name already exists in the selected Azure DevOps Project.");
  }
  ensureWikiOk(response, "ADO_WIKI_CREATE_FAILED", "The Azure DevOps Project Wiki could not be created.");
  if (response.status !== 201) {
    throw extensionError(502, "ADO_WIKI_CREATE_RESPONSE_INVALID", "Azure DevOps returned an unexpected Wiki creation status.");
  }
  const wiki = publicWikis([response.body])[0];
  if (!wiki) throw extensionError(502, "ADO_WIKI_CREATE_RESPONSE_INVALID", "Azure DevOps returned invalid Project Wiki metadata.");
  return { body: { wiki, created: true } };
}

async function recoverExistingProjectWikiRepository(organization, project, authorization, originalStatus) {
  const repositoriesResponse = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project.name)}/_apis/git/repositories?includeHidden=true&api-version=7.1`,
    authorization,
  );
  if (!repositoriesResponse.ok) {
    throw extensionError(
      originalStatus || 500,
      "ADO_WIKI_BACKING_REPOSITORY_LOOKUP_FAILED",
      "The Project Wiki repository already exists, but it could not be inspected for safe Wiki recovery.",
      { upstreamStatus: repositoriesResponse.status },
    );
  }

  const expectedRepositoryName = `${project.name}.wiki`;
  const repositories = Array.isArray(repositoriesResponse.body?.value) ? repositoriesResponse.body.value : [];
  const repository = repositories.find((item) => isRecord(item)
    && typeof item.id === "string"
    && typeof item.name === "string"
    && item.name.toLowerCase() === expectedRepositoryName.toLowerCase());
  if (!repository) {
    throw extensionError(
      originalStatus || 500,
      "ADO_WIKI_BACKING_REPOSITORY_NOT_FOUND",
      "Azure DevOps reports that the Project Wiki repository name is already taken, but its hidden repository could not be found. Ask a Project Administrator to inspect the Wiki repository before retrying.",
      { repositoryName: expectedRepositoryName },
    );
  }

  const registeredWikis = await fetchAzureDevOpsWikis(organization, project.name, authorization);
  const registered = registeredWikis.find((wiki) => wiki.type === "codeWiki" && wiki.repositoryId === repository.id);
  if (registered) return { wiki: registered, created: false, alreadyExists: true };

  const rawBranch = typeof repository.defaultBranch === "string" ? repository.defaultBranch.trim() : "";
  const version = rawBranch.replace(/^refs\/heads\//i, "");
  if (!version) {
    throw extensionError(
      409,
      "ADO_WIKI_BACKING_REPOSITORY_BRANCH_REQUIRED",
      "The existing Project Wiki repository has no default branch and cannot yet be registered as a Wiki.",
      { repositoryName: repository.name },
    );
  }

  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wiki/wikis?api-version=7.1`,
    authorization,
    {
      body: {
        type: "codeWiki",
        name: repository.name,
        projectId: project.id,
        repositoryId: readUUID(repository.id, "ADO_WIKI_BACKING_REPOSITORY_INVALID", "Azure DevOps returned an invalid Wiki repository ID."),
        mappedPath: "/",
        version: { version },
      },
      method: "POST",
    },
  );
  ensureWikiOk(response, "ADO_WIKI_REPOSITORY_RECOVERY_FAILED", "The existing Wiki repository could not be registered as a Wiki.");
  if (response.status !== 201) {
    throw extensionError(502, "ADO_WIKI_RECOVERY_RESPONSE_INVALID", "Azure DevOps returned an unexpected Wiki recovery status.");
  }
  const wiki = publicWikis([response.body])[0];
  if (!wiki) throw extensionError(502, "ADO_WIKI_RECOVERY_RESPONSE_INVALID", "Azure DevOps returned invalid recovered Wiki metadata.");
  return { wiki, created: true };
}

async function writeWikiPage(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_write_wiki_page");
  const { authorization, organization, project } = await repositoryCredentials(parameters);
  const requestedWikiIdentifier = readContextValue(parameters.wikiIdentifier, "ADO_WIKI_IDENTIFIER_INVALID", "A Wiki ID or name is required.");
  const wiki = await resolveAzureDevOpsWiki(organization, project, authorization, requestedWikiIdentifier);
  const path = readWikiPagePath(parameters.path);
  const content = readWikiPageContent(parameters.content);
  const comment = readOptionalWikiComment(parameters.comment);
  const wikiPagesEndpoint = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(wiki.id)}/pages`;
  const pageQuery = new URLSearchParams({ "api-version": "7.1", path });
  let currentPage = await getWikiPage(wikiPagesEndpoint, authorization, path, true);
  let createdAncestors = [];

  let etag;
  if (currentPage.status === 200) {
    etag = currentPage.etag;
    if (typeof etag !== "string" || !etag.trim()) {
      throw extensionError(502, "ADO_WIKI_ETAG_MISSING", "Azure DevOps returned an existing Wiki page without an ETag; the page was not changed.");
    }
  } else {
    assertWikiPageMissing(currentPage, "ADO_WIKI_PAGE_READ_FAILED", "The existing Azure DevOps Wiki page could not be checked before writing.");
    createdAncestors = await ensureWikiPageAncestors(wikiPagesEndpoint, authorization, path);
    if (createdAncestors.length > 0) {
      currentPage = await getWikiPage(wikiPagesEndpoint, authorization, path, true);
      if (currentPage.status === 200) {
        etag = currentPage.etag;
        if (typeof etag !== "string" || !etag.trim()) {
          throw extensionError(502, "ADO_WIKI_ETAG_MISSING", "Azure DevOps returned an existing Wiki page without an ETag; the page was not changed.");
        }
      } else {
        assertWikiPageMissing(currentPage, "ADO_WIKI_PAGE_READ_FAILED", "The Azure DevOps Wiki page could not be checked before writing.");
      }
    }
  }

  if (comment) pageQuery.set("comment", comment);
  const response = await putWikiPageWithAncestorRetry(wikiPagesEndpoint, authorization, pageQuery, content, etag);
  ensureWikiOk(response, "ADO_WIKI_PAGE_WRITE_FAILED", "The Azure DevOps Wiki page could not be written.");
  if (response.status !== 200 && response.status !== 201) {
    throw extensionError(502, "ADO_WIKI_PAGE_RESPONSE_INVALID", "Azure DevOps returned an unexpected Wiki page write status.");
  }
  return {
    body: {
      created: response.status === 201,
      ...(createdAncestors.length > 0 ? { createdAncestors } : {}),
      wikiIdentifier: wiki.id,
      ...(wiki.name ? { wikiName: wiki.name } : {}),
      path,
      page: publicWikiPage(response.body, path),
      ...(response.etag ? { etag: response.etag } : {}),
    },
  };
}

async function publishPipelineYaml(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_publish_pipeline_yaml");
  const { authorization, organization, project } = await repositoryCredentials(parameters);
  const identity = readPipelineRepositorySelector(parameters, organization, project, PIPELINE_YAML_REPOSITORY_SELECTOR_ERRORS).value;
  const path = readPipelineYamlPath(parameters.path);
  const yamlContent = readPipelineYamlContent(parameters.yamlContent);
  const encodedOrganization = encodeURIComponent(organization);
  const encodedProject = encodeURIComponent(project);
  const repositoryResponse = await requestPipelineYamlRead(
    `https://dev.azure.com/${encodedOrganization}/${encodedProject}/_apis/git/repositories/${encodeURIComponent(identity)}?api-version=7.1`,
    authorization,
  );
  if (repositoryResponse.status === 404) {
    throw extensionError(404, "AZURE_DEVOPS_REPOSITORY_NOT_FOUND", "The Azure DevOps repository was not found in the selected project.");
  }
  ensurePipelineYamlReadOk(repositoryResponse, "ADO_PIPELINE_YAML_REPOSITORY_LOOKUP_FAILED", "The Azure DevOps repository could not be verified.");
  const repository = publicRepository(repositoryResponse.body, organization, project);
  assertPipelineYamlRepositoryIdentity(parameters, identity, repository);
  const { branch, ref } = readPipelineYamlDefaultBranch(repositoryResponse.body?.defaultBranch);
  const encodedRepositoryID = encodeURIComponent(repository.id);
  const branchTip = await readPipelineYamlBranchTip(encodedOrganization, encodedProject, encodedRepositoryID, branch, ref, authorization);
  const existingContent = await readPipelineYamlItem(
    encodedOrganization,
    encodedProject,
    encodedRepositoryID,
    branchTip,
    path,
    authorization,
  );
  const latestBranchTip = await readPipelineYamlBranchTip(encodedOrganization, encodedProject, encodedRepositoryID, branch, ref, authorization);
  if (latestBranchTip !== branchTip) throw pipelineYamlBranchConflict();

  if (existingContent !== undefined) {
    if (existingContent !== yamlContent) {
      throw extensionError(409, "ADO_PIPELINE_YAML_PATH_CONFLICT", "A different file already exists at this repository path; existing content was not changed.");
    }
    return {
      body: {
        branch,
        commitId: branchTip,
        path,
        result: "no-op",
      },
    };
  }

  const pushURL = `https://dev.azure.com/${encodedOrganization}/${encodedProject}/_apis/git/repositories/${encodedRepositoryID}/pushes?api-version=7.1`;
  let pushResponse;
  try {
    pushResponse = await requestJson(pushURL, authorization, {
      body: {
        refUpdates: [{ name: ref, oldObjectId: branchTip }],
        commits: [{
          comment: "Add Pipeline YAML",
          changes: [{
            changeType: "add",
            item: { path: `/${path}` },
            newContent: { content: yamlContent, contentType: "rawtext" },
          }],
        }],
      },
      method: "POST",
    });
  } catch {
    throw pipelineYamlPublishOutcomeUnknown();
  }

  if (pushResponse.status === 409 || pushResponse.status === 412 || isStalePipelineYamlRefUpdate(pushResponse.body)) {
    throw pipelineYamlBranchConflict();
  }
  if (pushResponse.status === 401 || pushResponse.status === 403) {
    throw pipelineYamlPermissionDenied(pushResponse.status);
  }
  if (!pushResponse.ok) {
    if (pushResponse.status >= 500) throw pipelineYamlPublishOutcomeUnknown(pushResponse.status);
    ensurePipelineYamlReadOk(pushResponse, "ADO_PIPELINE_YAML_PUSH_FAILED", "Azure DevOps rejected the Pipeline YAML commit.");
  }

  const refUpdate = Array.isArray(pushResponse.body?.refUpdates)
    ? pushResponse.body.refUpdates.find((item) => isRecord(item) && item.name === ref)
    : undefined;
  if (isStalePipelineYamlRefUpdate(pushResponse.body)) throw pipelineYamlBranchConflict();
  if (refUpdate && (refUpdate.success === false || (typeof refUpdate.updateStatus === "string" && refUpdate.updateStatus !== "succeeded"))) {
    throw extensionError(409, "ADO_PIPELINE_YAML_PUSH_REJECTED", "Azure DevOps rejected the Pipeline YAML commit; inspect the default branch before retrying.");
  }
  const commitId = Array.isArray(pushResponse.body?.commits)
    ? pushResponse.body.commits.find((item) => isRecord(item) && typeof item.commitId === "string")?.commitId
    : undefined;
  const newObjectId = isRecord(refUpdate) ? refUpdate.newObjectId : undefined;
  if (isRecord(refUpdate) && typeof refUpdate.oldObjectId === "string" && refUpdate.oldObjectId !== branchTip) {
    throw pipelineYamlBranchConflict();
  }
  const confirmedCommitID = typeof commitId === "string" && GIT_OBJECT_ID_PATTERN.test(commitId)
    ? commitId
    : typeof newObjectId === "string" && GIT_OBJECT_ID_PATTERN.test(newObjectId)
      ? newObjectId
      : undefined;
  if (!isRecord(refUpdate)
    || refUpdate.name !== ref
    || refUpdate.oldObjectId !== branchTip
    || typeof newObjectId !== "string"
    || !GIT_OBJECT_ID_PATTERN.test(newObjectId)
    || !confirmedCommitID
    || (typeof commitId === "string" && GIT_OBJECT_ID_PATTERN.test(commitId) && commitId !== newObjectId)) {
    throw pipelineYamlPublishOutcomeUnknown();
  }

  return {
    body: {
      branch,
      commitId: confirmedCommitID,
      path,
      result: "created",
    },
  };
}

function assertPipelineYamlRepositoryIdentity(parameters, identity, repository) {
  if (typeof parameters.repositoryName === "string") {
    if (repository.name.toLowerCase() !== parameters.repositoryName.trim().toLowerCase()) {
      throw extensionError(409, "AZURE_DEVOPS_REPOSITORY_IDENTITY_MISMATCH", "Azure DevOps returned a different repository than the selected repository name.");
    }
    return;
  }
  if (repository.id.toLowerCase() !== identity.toLowerCase()) {
    throw extensionError(409, "AZURE_DEVOPS_REPOSITORY_IDENTITY_MISMATCH", "Azure DevOps returned a different repository than the selected repository ID.");
  }
}

function readPipelineYamlPath(value) {
  return readRepositoryRelativeYamlPath(value, {
    code: "ADO_PIPELINE_YAML_PATH_INVALID",
    invalidMessage: "Pipeline YAML path must be a repository-relative .yml or .yaml path of at most 1024 characters.",
    rejectDrivePrefix: true,
    statusCode: 400,
    traversalMessage: "Pipeline YAML path must be a repository-relative .yml or .yaml path without traversal.",
  });
}

function readRepositoryRelativeYamlPath(value, options) {
  const path = typeof value === "string" ? value : "";
  if (!path
    || path !== path.trim()
    || path.length > 1_024
    || path.startsWith("/")
    || (options.rejectDrivePrefix && /^[A-Za-z]:/.test(path))
    || /[\u0000-\u001f\u007f\\]/.test(path)) {
    throw extensionError(options.statusCode, options.code, options.invalidMessage);
  }
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..") || !/\.ya?ml$/i.test(path)) {
    throw extensionError(options.statusCode, options.code, options.traversalMessage);
  }
  return path;
}

function readPipelineYamlContent(value) {
  if (typeof value !== "string"
    || !value.trim()
    || value.length > PIPELINE_YAML_CONTENT_MAX_LENGTH
    || value.includes("\0")) {
    throw extensionError(400, "ADO_PIPELINE_YAML_CONTENT_INVALID", "Pipeline YAML content is required, must not contain NUL, and must not exceed 100000 characters.");
  }
  return value;
}

function readPipelineYamlDefaultBranch(value) {
  if (typeof value !== "string" || !value.startsWith("refs/heads/")) {
    throw extensionError(409, "ADO_PIPELINE_YAML_DEFAULT_BRANCH_REQUIRED", "The selected Azure DevOps repository has no valid default branch.");
  }
  const branch = value.slice("refs/heads/".length);
  if (!branch
    || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/.test(branch)
    || branch.includes("..")
    || branch.includes("//")
    || branch.includes("@{")
    || branch.endsWith("/")
    || branch.endsWith(".")
    || branch.endsWith(".lock")) {
    throw extensionError(502, "ADO_PIPELINE_YAML_DEFAULT_BRANCH_INVALID", "Azure DevOps returned an invalid repository default branch.");
  }
  return { branch, ref: value };
}

async function readPipelineYamlBranchTip(organization, project, repositoryID, branch, ref, authorization) {
  const query = new URLSearchParams({ filter: `heads/${branch}`, "api-version": "7.1" });
  const response = await requestPipelineYamlRead(
    `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repositoryID}/refs?${query}`,
    authorization,
  );
  ensurePipelineYamlReadOk(response, "ADO_PIPELINE_YAML_BRANCH_LOOKUP_FAILED", "The Azure DevOps default branch tip could not be read.");
  if (!Array.isArray(response.body?.value)) {
    throw extensionError(502, "ADO_PIPELINE_YAML_BRANCH_RESPONSE_INVALID", "Azure DevOps returned an invalid default branch response.");
  }
  const matches = response.body.value.filter((item) => isRecord(item) && item.name === ref);
  if (matches.length !== 1 || typeof matches[0]?.objectId !== "string" || !GIT_OBJECT_ID_PATTERN.test(matches[0].objectId)) {
    throw extensionError(409, "ADO_PIPELINE_YAML_DEFAULT_BRANCH_NOT_FOUND", "The Azure DevOps repository default branch has no readable commit tip.");
  }
  return matches[0].objectId;
}

async function readPipelineYamlItem(organization, project, repositoryID, commitId, path, authorization) {
  const query = new URLSearchParams({
    "api-version": "7.1",
    includeContent: "true",
    path: `/${path}`,
    "versionDescriptor.version": commitId,
    "versionDescriptor.versionType": "commit",
  });
  const response = await requestPipelineYamlRead(
    `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repositoryID}/items?${query}`,
    authorization,
  );
  if (response.status === 404) return undefined;
  ensurePipelineYamlReadOk(response, "ADO_PIPELINE_YAML_ITEM_READ_FAILED", "The Azure DevOps repository path could not be checked.");
  const item = response.body;
  if (!isRecord(item) || item.isFolder === true || typeof item.content !== "string") {
    throw extensionError(502, "ADO_PIPELINE_YAML_ITEM_RESPONSE_INVALID", "Azure DevOps returned invalid file content metadata.");
  }
  if (typeof item.path === "string" && item.path !== `/${path}`) {
    throw extensionError(502, "ADO_PIPELINE_YAML_ITEM_RESPONSE_INVALID", "Azure DevOps returned a different repository path.");
  }
  if (typeof item.contentType === "string" && item.contentType.toLowerCase() === "base64encoded") {
    return Buffer.from(item.content, "base64").toString("utf8");
  }
  return item.content;
}

async function requestPipelineYamlRead(url, authorization) {
  try {
    return await requestJson(url, authorization);
  } catch {
    throw extensionError(502, "ADO_PIPELINE_YAML_REQUEST_FAILED", "The Azure DevOps Pipeline YAML request could not be completed.", { upstreamStatus: 502 });
  }
}

function ensurePipelineYamlReadOk(response, code, message) {
  if (response?.ok) return;
  const status = Number.isInteger(response?.status) && response.status >= 400 && response.status <= 599 ? response.status : 502;
  if (status === 401 || status === 403) throw pipelineYamlPermissionDenied(status);
  throw extensionError(status, code, `${message} (Azure DevOps HTTP ${status}).`, { upstreamStatus: status });
}

function pipelineYamlPermissionDenied(status) {
  return extensionError(status, "ADO_PIPELINE_YAML_PERMISSION_DENIED", `Azure DevOps denied the Pipeline YAML operation (HTTP ${status}).`, { upstreamStatus: status });
}

function pipelineYamlBranchConflict() {
  return extensionError(409, "ADO_PIPELINE_YAML_BRANCH_CONFLICT", "The repository default branch changed during publish; no automatic retry was attempted.", { upstreamStatus: 409 });
}

function pipelineYamlPublishOutcomeUnknown(status = 502) {
  return extensionError(502, "ADO_PIPELINE_YAML_PUBLISH_OUTCOME_UNKNOWN", "Azure DevOps did not confirm the Pipeline YAML commit. Check the default branch before retrying.", {
    upstreamStatus: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502,
  });
}

function isStalePipelineYamlRefUpdate(value) {
  return Array.isArray(value?.refUpdates)
    && value.refUpdates.some((item) => isRecord(item) && item.updateStatus === "staleOldObjectId");
}

async function createWorkItem(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_create_work_item");
  const { authorization, organization, project, token } = await repositoryCredentials(parameters);
  const workItemType = readContextValue(parameters.workItemType, "ADO_WORK_ITEM_TYPE_INVALID", "A Work Item type is required.", 128);
  const title = readContextValue(parameters.title, "ADO_WORK_ITEM_TITLE_INVALID", "A Work Item title is required.", 255);
  if (/[\u0000-\u001f\u007f]/.test(workItemType) || /[\u0000-\u001f\u007f]/.test(title)) {
    throw extensionError(400, "ADO_WORK_ITEM_INPUT_INVALID", "The Work Item type and title cannot contain control characters.");
  }
  const parentId = readOptionalWorkItemParentId(parameters.parentId);
  const patch = [{ op: "add", path: `/fields/${WORK_ITEM_CONFIRMATION_FIELDS.title.referenceName}`, value: title }];
  for (const field of WORK_ITEM_FIELDS) {
    const value = readOptionalWorkItemField(parameters[field.parameter], field);
    if (value === undefined) continue;
    patch.push({ op: "add", path: `/fields/${field.referenceName}`, value });
    if (field.markdown) {
      patch.push({ op: "add", path: `/multilineFieldsFormat/${field.referenceName}`, value: "Markdown" });
    }
  }

  const encodedOrganization = encodeAzureDevOpsPathSegment(organization);
  const encodedProject = encodeAzureDevOpsPathSegment(project);
  const encodedWorkItemType = encodeAzureDevOpsPathSegment(workItemType);
  if (parentId !== undefined) {
    patch.push({
      op: "add",
      path: "/relations/-",
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: `https://dev.azure.com/${encodedOrganization}/_apis/wit/workItems/${parentId}`,
      },
    });
  }
  const endpoint = `https://dev.azure.com/${encodedOrganization}/${encodedProject}/_apis/wit/workitems/$${encodedWorkItemType}?api-version=7.1`;
  let response;
  try {
    response = await requestJson(endpoint, authorization, {
      body: patch,
      contentType: "application/json-patch+json",
      method: "POST",
    });
  } catch {
    throw extensionError(
      502,
      "ADO_WORK_ITEM_CREATE_OUTCOME_UNKNOWN",
      "The Work Item creation outcome could not be confirmed. Check the Azure DevOps project before retrying.",
    );
  }
  ensureAzureDevOpsWorkItemResponseOk(response, token, "create");
  let summary;
  try {
    summary = confirmWorkItemSummary(response.body, token, organization);
  } catch {
    throw extensionError(
      502,
      "ADO_WORK_ITEM_CREATE_OUTCOME_UNKNOWN",
      "Azure DevOps did not return a complete Work Item identity confirmation. Check the project before retrying.",
    );
  }
  return { body: summary };
}

async function updateWorkItem(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_update_work_item");
  const workItemId = readWorkItemId(parameters.workItemId);
  const expectedRev = readOptionalWorkItemExpectedRev(parameters.expectedRev);
  const patch = [];
  const workItemType = readOptionalWorkItemString(parameters.workItemType, "ADO_WORK_ITEM_TYPE_INVALID", "Work Item type", 128);
  const title = readOptionalWorkItemString(parameters.title, "ADO_WORK_ITEM_TITLE_INVALID", "Title", 255);
  if (workItemType !== undefined) patch.push({ op: "add", path: `/fields/${WORK_ITEM_CONFIRMATION_FIELDS.type.referenceName}`, value: workItemType });
  if (title !== undefined) patch.push({ op: "add", path: `/fields/${WORK_ITEM_CONFIRMATION_FIELDS.title.referenceName}`, value: title });
  for (const field of WORK_ITEM_FIELDS) {
    const value = readOptionalWorkItemField(parameters[field.parameter], field);
    if (value === undefined) continue;
    patch.push({ op: "add", path: `/fields/${field.referenceName}`, value });
    if (field.markdown) {
      patch.push({ op: "add", path: `/multilineFieldsFormat/${field.referenceName}`, value: "Markdown" });
    }
  }
  if (patch.length === 0) {
    throw extensionError(400, "ADO_WORK_ITEM_UPDATE_FIELDS_REQUIRED", "Provide at least one Work Item field to update.");
  }
  if (expectedRev !== undefined) patch.unshift({ op: "test", path: "/rev", value: expectedRev });

  const { authorization, organization, project, token } = await repositoryCredentials(parameters);
  const encodedOrganization = encodeAzureDevOpsPathSegment(organization);
  const encodedProject = encodeAzureDevOpsPathSegment(project);
  const endpoint = `https://dev.azure.com/${encodedOrganization}/${encodedProject}/_apis/wit/workitems/${workItemId}?api-version=7.1`;
  let response;
  try {
    response = await requestJson(endpoint, authorization, {
      body: patch,
      contentType: "application/json-patch+json",
      method: "PATCH",
    });
  } catch {
    throw extensionError(
      502,
      "ADO_WORK_ITEM_UPDATE_OUTCOME_UNKNOWN",
      "The Work Item update outcome could not be confirmed. Check the Work Item before retrying.",
    );
  }
  ensureAzureDevOpsWorkItemResponseOk(response, token, "update", expectedRev);

  let summary;
  try {
    summary = confirmWorkItemSummary(response.body, token, organization);
  } catch {
    throw extensionError(
      502,
      "ADO_WORK_ITEM_UPDATE_OUTCOME_UNKNOWN",
      "Azure DevOps did not return a complete Work Item update confirmation. Check the Work Item before retrying.",
    );
  }
  if (summary.id !== workItemId) {
    throw extensionError(
      502,
      "ADO_WORK_ITEM_UPDATE_OUTCOME_UNKNOWN",
      "Azure DevOps returned a different Work Item ID after the update. Check the Work Item before retrying.",
    );
  }
  return { body: summary };
}

async function getWorkItem(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_get_work_item");
  const workItemId = readWorkItemId(parameters.workItemId);
  const { authorization, organization, project, token } = await repositoryCredentials(parameters);
  const query = new URLSearchParams({ fields: WORK_ITEM_READ_FIELD_REFERENCES.join(","), "api-version": "7.1" });
  const endpoint = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/wit/workitems/${workItemId}?${query}`;
  let response;
  try {
    response = await requestJson(endpoint, authorization);
  } catch {
    throw extensionError(502, "ADO_WORK_ITEM_GET_FAILED", "The Azure DevOps Work Item could not be read (HTTP 502).", { upstreamStatus: 502 });
  }
  ensureAzureDevOpsWorkItemReadOk(response, {
    failedCode: "ADO_WORK_ITEM_GET_FAILED",
    failedMessage: "The Azure DevOps Work Item could not be read",
    permissionMessage: "Azure DevOps denied Work Item read access",
  });

  try {
    return { body: publicWorkItemDetails(response.body, workItemId, organization, token) };
  } catch {
    throw extensionError(502, "AZURE_DEVOPS_WORK_ITEM_RESPONSE_INVALID", "Azure DevOps returned an invalid Work Item result.");
  }
}

async function listWorkItemRevisions(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_list_work_item_revisions");
  const workItemId = readWorkItemId(parameters.workItemId);
  const top = readWorkItemRevisionTop(parameters.top);
  const skip = readWorkItemRevisionSkip(parameters.skip);
  const { authorization, organization, project, token } = await repositoryCredentials(parameters);
  const query = new URLSearchParams({
    "$top": String(top),
    "$skip": String(skip),
    "api-version": "7.1",
  });
  const endpoint = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/wit/workItems/${workItemId}/revisions?${query}`;
  let response;
  try {
    response = await requestJson(endpoint, authorization);
  } catch {
    throw extensionError(502, "ADO_WORK_ITEM_REVISIONS_LIST_FAILED", "Azure DevOps Work Item revisions could not be read (HTTP 502).", { upstreamStatus: 502 });
  }
  ensureAzureDevOpsWorkItemReadOk(response, {
    failedCode: "ADO_WORK_ITEM_REVISIONS_LIST_FAILED",
    failedMessage: "Azure DevOps Work Item revisions could not be read",
    permissionMessage: "Azure DevOps denied Work Item revision read access",
  });

  try {
    const values = readWorkItemRevisionValues(response.body, top);
    const revisions = values
      .map((value) => {
        const snapshot = publicWorkItemDetails(value, workItemId, organization, token, { includeChangedMetadata: true });
        return { ...snapshot, truncatedFields: readTruncatedWorkItemFields(snapshot) };
      })
      .sort((left, right) => left.rev - right.rev);
    if (new Set(revisions.map((revision) => revision.rev)).size !== revisions.length) {
      throw new Error("Duplicate Work Item revision.");
    }

    const hasMore = revisions.length === top;
    const nextSkip = skip + revisions.length;
    return {
      body: {
        workItemId,
        top,
        skip,
        count: revisions.length,
        hasMore,
        ...(hasMore && nextSkip <= WORK_ITEM_REVISION_SKIP_MAX ? { nextSkip } : {}),
        revisions,
      },
    };
  } catch {
    throw extensionError(502, "AZURE_DEVOPS_WORK_ITEM_REVISIONS_RESPONSE_INVALID", "Azure DevOps returned an invalid Work Item revisions result.");
  }
}

function readWorkItemRevisionValues(value, top) {
  const values = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.value)
      ? value.value
      : undefined;
  if (!values || values.length > top) throw new Error("Invalid Work Item revisions page.");
  if (!Array.isArray(value) && value.count !== undefined
    && (!Number.isSafeInteger(value.count) || value.count < values.length)) {
    throw new Error("Invalid Work Item revisions count.");
  }
  return values;
}

function readTruncatedWorkItemFields(value) {
  const fields = [];
  for (const [name, fieldValue] of Object.entries(value)) {
    if (typeof fieldValue === "string" && fieldValue.endsWith(WORK_ITEM_TEXT_TRUNCATION_MARKER)) {
      fields.push(name);
    } else if (isRecord(fieldValue)
      && Object.values(fieldValue).some((nestedValue) => typeof nestedValue === "string" && nestedValue.endsWith(WORK_ITEM_TEXT_TRUNCATION_MARKER))) {
      fields.push(name);
    }
  }
  return fields;
}

function readWorkItemRevisionTop(value) {
  if (value === undefined) return WORK_ITEM_REVISION_TOP_DEFAULT;
  if (!Number.isSafeInteger(value) || value < 1 || value > WORK_ITEM_REVISION_TOP_MAX) {
    throw extensionError(400, "ADO_WORK_ITEM_REVISION_TOP_INVALID", "Work Item revision top must be an integer from 1 to 20.");
  }
  return value;
}

function readWorkItemRevisionSkip(value) {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0 || value > WORK_ITEM_REVISION_SKIP_MAX) {
    throw extensionError(400, "ADO_WORK_ITEM_REVISION_SKIP_INVALID", "Work Item revision skip must be an integer from 0 to 2147483647.");
  }
  return value;
}

function confirmWorkItemSummary(value, token, organization) {
  const id = value?.id;
  const rev = value?.rev;
  const type = readConfirmedWorkItemField(
    value?.fields?.[WORK_ITEM_CONFIRMATION_FIELDS.type.referenceName],
    WORK_ITEM_CONFIRMATION_FIELDS.type.maxLength,
    token,
  );
  const title = readConfirmedWorkItemField(
    value?.fields?.[WORK_ITEM_CONFIRMATION_FIELDS.title.referenceName],
    WORK_ITEM_CONFIRMATION_FIELDS.title.maxLength,
    token,
  );
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647
    || !Number.isSafeInteger(rev) || rev < 1 || rev > 2_147_483_647
    || !type || !title) {
    throw new Error("Work Item confirmation is incomplete.");
  }
  return {
    id,
    rev,
    type,
    title,
    url: `https://dev.azure.com/${encodeAzureDevOpsPathSegment(organization)}/_apis/wit/workItems/${id}`,
  };
}

function publicWorkItemDetails(value, expectedID, organization, token, { includeChangedMetadata = false } = {}) {
  if (!isRecord(value)
    || !Number.isSafeInteger(value.id)
    || value.id !== expectedID
    || !Number.isSafeInteger(value.rev)
    || value.rev < 1
    || value.rev > 2_147_483_647
    || !isRecord(value.fields)) {
    throw new Error("Invalid Work Item response.");
  }

  const fields = value.fields;
  const type = readRequiredWorkItemResponseText(fields[WORK_ITEM_CONFIRMATION_FIELDS.type.referenceName], WORK_ITEM_CONFIRMATION_FIELDS.type.maxLength, token);
  const title = readRequiredWorkItemResponseText(fields[WORK_ITEM_CONFIRMATION_FIELDS.title.referenceName], WORK_ITEM_CONFIRMATION_FIELDS.title.maxLength, token);
  const state = readRequiredWorkItemResponseText(fields["System.State"], 128, token);
  if (!type || !title || !state) throw new Error("Incomplete Work Item response.");

  const result = {
    id: value.id,
    rev: value.rev,
    type,
    title,
    state,
    url: `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wit/workItems/${value.id}`,
  };

  for (const field of WORK_ITEM_FIELDS) {
    if (field.parameter === "state") continue;
    const rawValue = fields[field.referenceName];
    if (rawValue === undefined || rawValue === null) continue;
    if (field.parameter === "assignedTo") {
      const identity = publicWorkItemIdentity(rawValue, token);
      if (identity) result.assignedTo = identity;
      continue;
    }
    if (field.validation === "string" || field.validation === "markdown" || field.validation === "severity" || field.validation === "activity") {
      const text = readWorkItemResponseText(rawValue, field.maxLength ?? 100_000, token);
      if (text !== undefined) result[field.parameter] = text;
      continue;
    }
    const number = readWorkItemResponseNumber(rawValue, field);
    if (number !== undefined) result[field.parameter] = number;
  }

  if (includeChangedMetadata) {
    const changedDate = fields["System.ChangedDate"];
    if (changedDate !== undefined && changedDate !== null) {
      const text = readWorkItemResponseText(changedDate, 64, token);
      if (text === undefined || !Number.isFinite(Date.parse(text))) throw new Error("Invalid Work Item changed date.");
      result.changedDate = text;
    }
    const changedBy = fields["System.ChangedBy"];
    if (changedBy !== undefined && changedBy !== null) {
      const identity = publicWorkItemIdentity(changedBy, token);
      if (identity) result.changedBy = identity;
    }
  }

  return result;
}

function readRequiredWorkItemResponseText(value, maxLength, token) {
  if (typeof value !== "string"
    || !value.trim()
    || value.length > maxLength
    || /[\u0000-\u001f\u007f]/.test(value)
    || containsAzureDevOpsCredential(value, token)) return undefined;
  return value;
}

function readWorkItemResponseText(value, maxLength, token) {
  if (typeof value !== "string" || /[\u0000\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new Error("Invalid Work Item text field.");
  }
  if (containsAzureDevOpsCredential(value, token)) return undefined;
  if (value.length <= maxLength) return value;
  const textLength = Math.max(0, maxLength - WORK_ITEM_TEXT_TRUNCATION_MARKER.length);
  return `${value.slice(0, textLength)}${WORK_ITEM_TEXT_TRUNCATION_MARKER}`;
}

function readWorkItemResponseNumber(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Invalid Work Item numeric field.");
  }
  if (field.validation === "priority" && (!Number.isSafeInteger(value) || value < 1 || value > 100_000)) {
    throw new Error("Invalid Work Item priority.");
  }
  if (field.validation === "integer" && (!Number.isSafeInteger(value) || value > 100_000)) {
    throw new Error("Invalid Work Item integer field.");
  }
  return value;
}

function publicWorkItemIdentity(value, token) {
  if (!isRecord(value)) throw new Error("Invalid Work Item identity.");
  const identity = {};
  for (const [field, maxLength] of [["displayName", 256], ["uniqueName", 512]]) {
    const text = value[field];
    if (text === undefined || text === null || text === "") continue;
    if (typeof text !== "string" || /[\u0000-\u001f\u007f]/.test(text)) throw new Error("Invalid Work Item identity field.");
    const bounded = readWorkItemResponseText(text, maxLength, token);
    if (bounded !== undefined) identity[field] = bounded;
  }
  return Object.keys(identity).length > 0 ? identity : undefined;
}

function containsAzureDevOpsCredential(value, token) {
  const extensionSecret = typeof process.env.EXTENSION_SECRET_KEY === "string" ? process.env.EXTENSION_SECRET_KEY.trim() : "";
  const credentials = new Set([token, extensionSecret].filter((credential) => typeof credential === "string" && credential));
  for (const credential of credentials) {
    const base64 = Buffer.from(credential, "utf8").toString("base64");
    const base64Url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const basicCredential = Buffer.from(`:${credential}`, "utf8").toString("base64");
    let urlEncoded = "";
    try {
      urlEncoded = encodeURIComponent(credential);
    } catch {
      // Raw and Base64 forms are still checked for malformed UTF-16 credentials.
    }
    const hex = Buffer.from(credential, "utf8").toString("hex");
    const encodings = [
      credential,
      urlEncoded,
      urlEncoded.replace(/%[0-9A-F]{2}/g, (match) => match.toLowerCase()),
      base64,
      base64.replace(/=+$/, ""),
      base64Url,
      hex,
      hex.toUpperCase(),
      basicCredential,
      `Basic ${basicCredential}`,
    ];
    const decodedBase64 = Buffer.from(credential, "base64");
    if (decodedBase64.length > 0
      && decodedBase64.toString("base64").replace(/=+$/, "") === credential.replace(/=+$/, "")) {
      const decodedHex = decodedBase64.toString("hex");
      encodings.push(decodedHex, decodedHex.toUpperCase(), decodedBase64.toString("latin1"));
    }
    if (encodings.some((encoded) => encoded && value.includes(encoded))) return true;
  }
  return false;
}

function ensureAzureDevOpsWorkItemReadOk(response, operation) {
  if (response?.ok) return;
  const status = Number.isInteger(response?.status) && response.status >= 400 && response.status <= 599 ? response.status : 502;
  if (status === 401 || status === 403) {
    throw extensionError(status, "ADO_WORK_ITEM_PERMISSION_DENIED", `${operation.permissionMessage} (HTTP ${status}).`, { upstreamStatus: status });
  }
  if (status === 404) {
    throw extensionError(404, "ADO_WORK_ITEM_NOT_FOUND_OR_UNAVAILABLE", "The Azure DevOps Work Item was not found or is not accessible (HTTP 404).", { upstreamStatus: status });
  }
  throw extensionError(status, operation.failedCode, `${operation.failedMessage} (HTTP ${status}).`, { upstreamStatus: status });
}

async function createPullRequest(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_create_pull_request");
  const credentials = await repositoryCredentials(parameters);
  const identity = readPullRequestRepositorySelector(parameters, credentials.organization, credentials.project);
  const sourceRefName = readPullRequestBranchRef(parameters.sourceRefName, "sourceRefName");
  const targetRefName = readPullRequestBranchRef(parameters.targetRefName, "targetRefName");
  const title = readPullRequestTitle(parameters.title);
  const description = readOptionalPullRequestDescription(parameters.description);
  const isDraft = readOptionalPullRequestBoolean(parameters.isDraft, "isDraft");
  const reviewerIds = readOptionalPullRequestReviewerIds(parameters.reviewerIds);
  const workItemIds = readOptionalPullRequestWorkItemIds(parameters.workItemIds);
  const labels = readOptionalPullRequestLabels(parameters.labels);
  const supportsIterations = readOptionalPullRequestBoolean(parameters.supportsIterations, "supportsIterations");
  assertPullRequestListPayloadSize({ reviewerIds, workItemIds, labels });
  const selectedProject = await resolvePullRequestProject(credentials.organization, credentials.project, credentials.authorization);
  const repository = await resolvePullRequestRepository(
    identity,
    credentials.organization,
    selectedProject,
    credentials.authorization,
  );
  const body = {
    sourceRefName,
    targetRefName,
    title,
    ...(description === undefined ? {} : { description }),
    ...(isDraft === undefined ? {} : { isDraft }),
    ...(workItemIds?.length ? { completionOptions: { transitionWorkItems: true } } : {}),
    ...(reviewerIds === undefined ? {} : { reviewers: reviewerIds.map((id) => ({ id })) }),
    ...(workItemIds === undefined ? {} : { workItemRefs: workItemIds.map((id) => ({ id: String(id) })) }),
    ...(labels === undefined ? {} : { labels: labels.map((name) => ({ name })) }),
  };
  const query = new URLSearchParams({ "api-version": "7.1" });
  if (supportsIterations !== undefined) query.set("supportsIterations", String(supportsIterations));
  const endpoint = `https://dev.azure.com/${encodeURIComponent(credentials.organization)}/${encodeURIComponent(credentials.project)}/_apis/git/repositories/${encodeURIComponent(repository.id)}/pullrequests?${query}`;

  let response;
  try {
    response = await requestJson(endpoint, credentials.authorization, { body, method: "POST" });
  } catch {
    throw pullRequestCreateOutcomeUnknown();
  }
  ensurePullRequestCreateOk(response);
  const created = readPullRequestCreateResponse(response.body, {
    isDraft: isDraft ?? false,
    repository,
    sourceRefName,
    targetRefName,
    title,
    token: credentials.token,
  });

  return {
    body: {
      id: created.id,
      isDraft: created.isDraft,
      repository: { id: repository.id, name: repository.name, project: selectedProject.name },
      sourceRefName: created.sourceRefName,
      status: created.status,
      targetRefName: created.targetRefName,
      title: created.title,
    },
  };
}

async function getPullRequest(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_get_pull_request");
  const credentials = await repositoryCredentials(parameters);
  const pullRequestId = readPullRequestID(parameters.pullRequestId);
  const commitTop = readPullRequestCommitTop(parameters.commitTop);
  const commitContinuationToken = readPullRequestCommitContinuationToken(parameters.commitContinuationToken);
  const selectedProject = await resolvePullRequestProject(credentials.organization, credentials.project, credentials.authorization);
  const encodedOrganization = encodeURIComponent(credentials.organization);
  const encodedProject = encodeURIComponent(selectedProject.name);
  const pullRequestResponse = await requestPullRequestDetailsJson(
    `https://dev.azure.com/${encodedOrganization}/${encodedProject}/_apis/git/pullrequests/${pullRequestId}?api-version=7.1`,
    credentials.authorization,
    "ADO_PULL_REQUEST_GET_FAILED",
    "Azure DevOps pull request details could not be loaded.",
  );
  ensurePullRequestDetailsOk(
    pullRequestResponse,
    "ADO_PULL_REQUEST_GET_FAILED",
    "Azure DevOps pull request details could not be loaded.",
    "ADO_PULL_REQUEST_NOT_FOUND",
  );
  const pullRequest = readPullRequestDetails(pullRequestResponse.body, {
    id: pullRequestId,
    project: selectedProject,
    token: credentials.token,
  });

  const query = new URLSearchParams({ "$top": String(commitTop), "api-version": "7.1" });
  if (commitContinuationToken !== undefined) query.set("continuationToken", commitContinuationToken);
  const commitsResponse = await requestPullRequestDetailsJson(
    `https://dev.azure.com/${encodedOrganization}/${encodedProject}/_apis/git/repositories/${encodeURIComponent(pullRequest.repository.id)}/pullRequests/${pullRequestId}/commits?${query}`,
    credentials.authorization,
    "ADO_PULL_REQUEST_COMMITS_FAILED",
    "Azure DevOps pull request commits could not be loaded.",
  );
  ensurePullRequestDetailsOk(
    commitsResponse,
    "ADO_PULL_REQUEST_COMMITS_FAILED",
    "Azure DevOps pull request commits could not be loaded.",
    "ADO_PULL_REQUEST_COMMITS_FAILED",
  );
  const commitPage = readPullRequestCommitPage(commitsResponse.body, commitsResponse.continuationToken, commitTop, credentials.token);

  return {
    body: {
      ...pullRequest,
      commitTop,
      commits: commitPage.commits,
      ...(commitPage.nextContinuationToken ? { nextContinuationToken: commitPage.nextContinuationToken } : {}),
    },
  };
}

function readPullRequestDetails(value, expected) {
  if (!isRecord(value)
    || !Number.isSafeInteger(value.pullRequestId) || value.pullRequestId !== expected.id
    || !isRecord(value.repository) || !isRecord(value.repository.project)) {
    throw extensionError(502, "ADO_PULL_REQUEST_RESPONSE_INVALID", "Azure DevOps returned an invalid pull request summary.");
  }
  const status = readPullRequestResponseText(value.status, 32, expected.token);
  const title = readPullRequestResponseText(value.title, 255, expected.token);
  const sourceRefName = readPullRequestDetailsBranchRef(value.sourceRefName, expected.token);
  const targetRefName = readPullRequestDetailsBranchRef(value.targetRefName, expected.token);
  const repositoryID = readPullRequestResponseUUID(value.repository.id, "ADO_PULL_REQUEST_RESPONSE_INVALID", "Azure DevOps returned an invalid pull request repository ID.", expected.token);
  const safeRepositoryName = readPullRequestResponseText(value.repository.name, 128, expected.token);
  const repositoryName = safeRepositoryName
    ? readPullRequestRepositoryName(safeRepositoryName, "ADO_PULL_REQUEST_RESPONSE_INVALID", 502)
    : undefined;
  const repositoryProjectID = readPullRequestResponseUUID(value.repository.project.id, "ADO_PULL_REQUEST_PROJECT_MISMATCH", "Azure DevOps returned an invalid pull request project identity.", expected.token);
  const repositoryProjectName = readPullRequestResponseText(value.repository.project.name, 128, expected.token);
  const selectedProjectName = readPullRequestResponseText(expected.project.name, 128, expected.token);
  if (!status || !["active", "abandoned", "completed", "notSet"].includes(status)
    || !title || !sourceRefName || !targetRefName || !repositoryName || !repositoryProjectName || !selectedProjectName) {
    throw extensionError(502, "ADO_PULL_REQUEST_RESPONSE_INVALID", "Azure DevOps returned an invalid pull request summary.");
  }
  if (repositoryProjectID.toLowerCase() !== expected.project.id.toLowerCase()
    || repositoryProjectName.toLowerCase() !== selectedProjectName.toLowerCase()) {
    throw extensionError(502, "ADO_PULL_REQUEST_PROJECT_MISMATCH", "Azure DevOps returned a pull request from a different project.");
  }
  const sourceCommitId = readPullRequestCommitReference(value.lastMergeSourceCommit, "ADO_PULL_REQUEST_RESPONSE_INVALID", expected.token);
  const targetCommitId = readPullRequestCommitReference(value.lastMergeTargetCommit, "ADO_PULL_REQUEST_RESPONSE_INVALID", expected.token);
  const lastMergeCommitId = readPullRequestCommitReference(value.lastMergeCommit, "ADO_PULL_REQUEST_RESPONSE_INVALID", expected.token);

  return {
    id: expected.id,
    status,
    title,
    sourceRefName,
    targetRefName,
    repository: { id: repositoryID, name: repositoryName, project: selectedProjectName },
    ...(sourceCommitId ? { sourceCommitId } : {}),
    ...(targetCommitId ? { targetCommitId } : {}),
    ...(lastMergeCommitId ? { lastMergeCommitId } : {}),
  };
}

function readPullRequestCommitReference(value, code, token) {
  if (value === undefined || value === null) return undefined;
  const commitId = isRecord(value) ? readPullRequestResponseText(value.commitId, 40, token) : undefined;
  if (!commitId || !GIT_OBJECT_ID_PATTERN.test(commitId)) {
    throw extensionError(502, code, "Azure DevOps returned an invalid pull request commit identity.");
  }
  return commitId;
}

function readPullRequestResponseUUID(value, code, message, token) {
  const id = readPullRequestResponseText(value, 36, token);
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw extensionError(502, code, message);
  }
  return id;
}

function readPullRequestDetailsBranchRef(value, token) {
  const text = readPullRequestResponseText(value, 255, token);
  if (!text) return undefined;
  try {
    return readPullRequestBranchRef(text, "branch ref");
  } catch {
    throw extensionError(502, "ADO_PULL_REQUEST_RESPONSE_INVALID", "Azure DevOps returned an invalid pull request branch ref.");
  }
}

async function requestPullRequestDetailsJson(url, authorization, code, message) {
  try {
    return await requestJson(url, authorization);
  } catch {
    throw extensionError(502, code, message, { upstreamStatus: 502 });
  }
}

function ensurePullRequestDetailsOk(response, code, message, notFoundCode) {
  if (response?.ok) return;
  const status = Number.isInteger(response?.status) && response.status >= 400 && response.status <= 599 ? response.status : 502;
  if (status === 401 || status === 403) {
    throw extensionError(status, "ADO_PULL_REQUEST_PERMISSION_DENIED", `Azure DevOps denied the pull request operation (HTTP ${status}).`, { upstreamStatus: status });
  }
  if (status === 404 && notFoundCode === "ADO_PULL_REQUEST_NOT_FOUND") {
    throw extensionError(404, notFoundCode, "The pull request was not found in the selected Azure DevOps project.", { upstreamStatus: 404 });
  }
  throw extensionError(status, code, `${message} (Azure DevOps HTTP ${status}).`, { upstreamStatus: status });
}

function readPullRequestID(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw extensionError(400, "ADO_PULL_REQUEST_ID_INVALID", "A positive 32-bit pull request ID is required.");
  }
  return value;
}

function readPullRequestCommitTop(value) {
  if (value === undefined) return PULL_REQUEST_COMMIT_TOP_DEFAULT;
  if (!Number.isSafeInteger(value) || value < 1 || value > PULL_REQUEST_COMMIT_TOP_MAX) {
    throw extensionError(400, "ADO_PULL_REQUEST_COMMIT_TOP_INVALID", "Pull request commit page size must be between 1 and 100.");
  }
  return value;
}

function readPullRequestCommitContinuationToken(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value || value.length > 2_000 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw extensionError(400, "ADO_PULL_REQUEST_CONTINUATION_TOKEN_INVALID", "Pull request commit continuation token must be at most 2000 printable characters.");
  }
  return value;
}

function readPullRequestCommitPage(value, continuationToken, commitTop, token) {
  const commits = Array.isArray(value) ? value : isRecord(value) ? value.value : undefined;
  if (!Array.isArray(commits) || commits.length > commitTop) {
    throw extensionError(502, "ADO_PULL_REQUEST_COMMITS_RESPONSE_INVALID", "Azure DevOps returned an invalid pull request commit page.");
  }
  const nextContinuationToken = readPullRequestResponseContinuationToken(continuationToken, token);
  return {
    commits: commits.map((commit) => readPullRequestCommitSummary(commit, token)),
    ...(nextContinuationToken ? { nextContinuationToken } : {}),
  };
}

function readPullRequestCommitSummary(value, token) {
  if (!isRecord(value)) {
    throw extensionError(502, "ADO_PULL_REQUEST_COMMITS_RESPONSE_INVALID", "Azure DevOps returned an invalid pull request commit.");
  }
  const commitId = readPullRequestResponseText(value.commitId, 40, token);
  const message = value.comment;
  if (!commitId || !GIT_OBJECT_ID_PATTERN.test(commitId)
    || typeof message !== "string"
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)
    || containsAzureDevOpsCredential(message, token)) {
    throw extensionError(502, "ADO_PULL_REQUEST_COMMITS_RESPONSE_INVALID", "Azure DevOps returned an invalid or sensitive pull request commit summary.");
  }
  const author = isRecord(value.author) ? value.author : undefined;
  const authorName = author ? readPullRequestResponseText(author.name, 128, token) : undefined;
  const authorDate = author ? readPullRequestCommitDate(author.date, token) : undefined;
  return {
    commitId,
    message: message.slice(0, PULL_REQUEST_COMMIT_MESSAGE_MAX_LENGTH),
    messageTruncated: message.length > PULL_REQUEST_COMMIT_MESSAGE_MAX_LENGTH || value.commentTruncated === true,
    ...(authorName ? { authorName } : {}),
    ...(authorDate ? { authorDate } : {}),
  };
}

function readPullRequestCommitDate(value, token) {
  if (typeof value !== "string" || value.length > 64 || /[\u0000-\u001f\u007f]/.test(value) || !Number.isFinite(Date.parse(value))
    || containsAzureDevOpsCredential(value, token)) return undefined;
  return value;
}

function readPullRequestResponseContinuationToken(value, token) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value || value.length > 2_000 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw extensionError(502, "ADO_PULL_REQUEST_COMMITS_RESPONSE_INVALID", "Azure DevOps returned an invalid pull request continuation token.");
  }
  if (containsAzureDevOpsCredential(value, token)) {
    throw extensionError(502, "ADO_PULL_REQUEST_COMMITS_RESPONSE_INVALID", "Azure DevOps returned an invalid pull request continuation token.");
  }
  return value;
}

async function listPullRequests(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_list_pull_requests");
  const credentials = await repositoryCredentials(parameters);
  const identity = readPullRequestRepositorySelector(parameters, credentials.organization, credentials.project);
  const sourceRefName = readOptionalPullRequestBranchRef(parameters.sourceRefName, "sourceRefName");
  const targetRefName = readOptionalPullRequestBranchRef(parameters.targetRefName, "targetRefName");
  const status = readPullRequestListStatus(parameters.status);
  const top = readPullRequestPageTop(parameters.top);
  const skip = readPullRequestPageSkip(parameters.skip);
  const selectedProject = await resolvePullRequestProject(credentials.organization, credentials.project, credentials.authorization);
  const repository = await resolvePullRequestRepository(
    identity,
    credentials.organization,
    selectedProject,
    credentials.authorization,
  );
  const query = new URLSearchParams({
    "$top": String(top),
    "$skip": String(skip),
    "api-version": "7.1",
    "searchCriteria.status": status,
  });
  if (sourceRefName !== undefined) query.set("searchCriteria.sourceRefName", sourceRefName);
  if (targetRefName !== undefined) query.set("searchCriteria.targetRefName", targetRefName);
  const endpoint = `https://dev.azure.com/${encodeURIComponent(credentials.organization)}/${encodeURIComponent(credentials.project)}/_apis/git/repositories/${encodeURIComponent(repository.id)}/pullrequests?${query}`;

  let response;
  try {
    response = await requestJson(endpoint, credentials.authorization);
  } catch {
    throw extensionError(502, "ADO_PULL_REQUEST_LIST_FAILED", "Azure DevOps pull requests could not be loaded.", { upstreamStatus: 502 });
  }
  ensurePullRequestReadOk(response, "ADO_PULL_REQUEST_LIST_FAILED", "Azure DevOps pull requests could not be loaded.");
  if (!isRecord(response.body) || !Array.isArray(response.body.value)
    || response.body.value.length > top
    || !Number.isSafeInteger(response.body.count)
    || response.body.count !== response.body.value.length) {
    throw extensionError(502, "ADO_PULL_REQUEST_LIST_RESPONSE_INVALID", "Azure DevOps returned an invalid pull request list.");
  }

  const pullRequests = response.body.value.map((item) => readPullRequestListSummary(item, {
    project: selectedProject,
    repository,
    token: credentials.token,
  }));
  return { body: { count: pullRequests.length, pullRequests, skip, status, top } };
}

async function resolvePullRequestProject(organization, projectName, authorization) {
  const endpoint = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects/${encodeURIComponent(projectName)}?api-version=7.1`;
  let response;
  try {
    response = await requestJson(endpoint, authorization);
  } catch {
    throw extensionError(502, "ADO_PULL_REQUEST_PROJECT_LOOKUP_FAILED", "The selected Azure DevOps project could not be verified.", { upstreamStatus: 502 });
  }
  if (response.status === 404) {
    throw extensionError(404, "ADO_PULL_REQUEST_PROJECT_NOT_FOUND", "The selected Azure DevOps project was not found.", { upstreamStatus: 404 });
  }
  ensurePullRequestReadOk(response, "ADO_PULL_REQUEST_PROJECT_LOOKUP_FAILED", "The selected Azure DevOps project could not be verified.");
  if (!isRecord(response.body)
    || typeof response.body.name !== "string"
    || response.body.name.toLowerCase() !== projectName.toLowerCase()) {
    throw extensionError(502, "ADO_PULL_REQUEST_PROJECT_RESPONSE_INVALID", "Azure DevOps returned a different or invalid project identity.");
  }
  return {
    id: readUUID(response.body.id, "ADO_PULL_REQUEST_PROJECT_RESPONSE_INVALID", "Azure DevOps returned an invalid project ID."),
    name: readContextValue(response.body.name, "ADO_PULL_REQUEST_PROJECT_RESPONSE_INVALID", "Azure DevOps returned an invalid project name.", 128),
  };
}

async function resolvePullRequestRepository(identity, organization, selectedProject, authorization) {
  const endpoint = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(selectedProject.name)}/_apis/git/repositories/${encodeURIComponent(identity.value)}?api-version=7.1`;
  let response;
  try {
    response = await requestJson(endpoint, authorization);
  } catch {
    throw extensionError(502, "ADO_PULL_REQUEST_REPOSITORY_LOOKUP_FAILED", "The selected Azure DevOps repository could not be verified.", { upstreamStatus: 502 });
  }
  if (response.status === 404) {
    throw extensionError(404, "AZURE_DEVOPS_REPOSITORY_NOT_FOUND", "The selected repository was not found in the configured Azure DevOps project.", { upstreamStatus: 404 });
  }
  ensurePullRequestReadOk(response, "ADO_PULL_REQUEST_REPOSITORY_LOOKUP_FAILED", "The selected Azure DevOps repository could not be verified.");
  const value = response.body;
  if (!isRecord(value) || !isRecord(value.project)) {
    throw extensionError(502, "ADO_PULL_REQUEST_REPOSITORY_RESPONSE_INVALID", "Azure DevOps returned invalid repository metadata.");
  }
  const id = readUUID(value.id, "ADO_PULL_REQUEST_REPOSITORY_RESPONSE_INVALID", "Azure DevOps returned an invalid repository ID.");
  const name = readPullRequestRepositoryName(value.name, "ADO_PULL_REQUEST_REPOSITORY_RESPONSE_INVALID", 502);
  const projectID = readUUID(value.project.id, "ADO_PULL_REQUEST_PROJECT_MISMATCH", "Azure DevOps returned an invalid repository project ID.");
  const project = readContextValue(value.project.name, "ADO_PULL_REQUEST_PROJECT_MISMATCH", "Azure DevOps returned an invalid repository project name.", 128);
  if (projectID.toLowerCase() !== selectedProject.id.toLowerCase() || project.toLowerCase() !== selectedProject.name.toLowerCase()) {
    throw extensionError(409, "AZURE_DEVOPS_PROJECT_MISMATCH", "The selected repository does not belong to the configured Azure DevOps project.");
  }
  if ((identity.kind === "id" && id.toLowerCase() !== identity.value.toLowerCase())
    || (identity.kind === "name" && name.toLowerCase() !== identity.value.toLowerCase())) {
    throw extensionError(409, "AZURE_DEVOPS_REPOSITORY_IDENTITY_MISMATCH", "Azure DevOps resolved a different repository than the selected identity.");
  }
  return { id, name };
}

function readPullRequestRepositorySelector(parameters, organization, project) {
  const supplied = ["repositoryReference", "repositoryID", "repositoryName"]
    .filter((field) => parameters[field] !== undefined);
  if (supplied.length !== 1) {
    throw extensionError(400, "AZURE_DEVOPS_REPOSITORY_IDENTITY_INVALID", "Provide exactly one verified Repository reference, ID, or name.");
  }
  if (supplied[0] === "repositoryID") {
    return { kind: "id", value: readUUID(parameters.repositoryID, "AZURE_DEVOPS_REPOSITORY_REFERENCE_INVALID", "The Azure DevOps repository ID is invalid.") };
  }
  if (supplied[0] === "repositoryName") {
    return { kind: "name", value: readPullRequestRepositoryName(parameters.repositoryName, "AZURE_DEVOPS_REPOSITORY_REFERENCE_INVALID") };
  }

  const value = readContextValue(parameters.repositoryReference, "AZURE_DEVOPS_REPOSITORY_REFERENCE_INVALID", "The Azure DevOps repository reference is invalid.", 300);
  const match = REPOSITORY_REFERENCE_PATTERN.exec(value);
  if (!match) throw extensionError(400, "AZURE_DEVOPS_REPOSITORY_REFERENCE_INVALID", "The Azure DevOps repository reference is invalid.");
  let referenceOrganization;
  let referenceProject;
  try {
    referenceOrganization = decodeURIComponent(match[1]);
    referenceProject = decodeURIComponent(match[2]);
  } catch {
    throw extensionError(400, "AZURE_DEVOPS_REPOSITORY_REFERENCE_INVALID", "The Azure DevOps repository reference is invalid.");
  }
  if (referenceOrganization.toLowerCase() !== organization.toLowerCase()) {
    throw extensionError(409, "AZURE_DEVOPS_ORGANIZATION_MISMATCH", "The repository reference belongs to another Azure DevOps organization.");
  }
  if (referenceProject.toLowerCase() !== project.toLowerCase()) {
    throw extensionError(409, "AZURE_DEVOPS_PROJECT_MISMATCH", "The repository reference belongs to another Azure DevOps project.");
  }
  return { kind: "id", value: readUUID(match[3], "AZURE_DEVOPS_REPOSITORY_REFERENCE_INVALID", "The Azure DevOps repository ID is invalid.") };
}

function readPullRequestRepositoryName(value, code, statusCode = 400) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 128 || name === "." || name === ".." || /[\\/\u0000-\u001f\u007f]/.test(name)) {
    throw extensionError(statusCode, code, "The Azure DevOps repository name is invalid.");
  }
  return name;
}

function readPullRequestBranchRef(value, field) {
  if (typeof value !== "string" || value !== value.trim() || value.length > 255 || !value.startsWith("refs/heads/")) {
    throw extensionError(400, "ADO_PULL_REQUEST_BRANCH_REF_INVALID", `${field} must be a valid refs/heads/<branch> value.`);
  }
  const branch = value.slice("refs/heads/".length);
  if (!branch || branch === "@" || branch.startsWith("/") || branch.endsWith("/") || branch.endsWith(".")
    || branch.includes("..") || branch.includes("//") || branch.includes("@{")
    || /[\u0000-\u0020\u007f~^:?*\\\[\]]/.test(branch)
    || branch.split("/").some((segment) => !segment || segment.startsWith(".") || segment.endsWith(".") || segment.toLowerCase().endsWith(".lock"))) {
    throw extensionError(400, "ADO_PULL_REQUEST_BRANCH_REF_INVALID", `${field} must be a valid refs/heads/<branch> value.`);
  }
  return value;
}

function readOptionalPullRequestBranchRef(value, field) {
  return value === undefined ? undefined : readPullRequestBranchRef(value, field);
}

function isValidPullRequestBranchRef(value) {
  if (typeof value !== "string" || value !== value.trim() || value.length > 255 || !value.startsWith("refs/heads/")) return false;
  const branch = value.slice("refs/heads/".length);
  return Boolean(branch)
    && branch !== "@"
    && !branch.startsWith("/")
    && !branch.endsWith("/")
    && !branch.endsWith(".")
    && !branch.includes("..")
    && !branch.includes("//")
    && !branch.includes("@{")
    && !/[\u0000-\u0020\u007f~^:?*\\\[\]]/.test(branch)
    && branch.split("/").every((segment) => segment && !segment.startsWith(".") && !segment.endsWith(".") && !segment.toLowerCase().endsWith(".lock"));
}

function readPullRequestListStatus(value) {
  const status = value === undefined ? "active" : value;
  if (typeof status !== "string" || !PULL_REQUEST_LIST_STATUSES.has(status)) {
    throw extensionError(400, "ADO_PULL_REQUEST_STATUS_INVALID", "status must be active, abandoned, completed, or all.");
  }
  return status;
}

function readPullRequestPageTop(value) {
  const top = value === undefined ? 50 : value;
  if (!Number.isSafeInteger(top) || top < 1 || top > 100) {
    throw extensionError(400, "ADO_PULL_REQUEST_PAGE_INVALID", "top must be an integer between 1 and 100.");
  }
  return top;
}

function readPullRequestPageSkip(value) {
  const skip = value === undefined ? 0 : value;
  if (!Number.isSafeInteger(skip) || skip < 0 || skip > 2_147_483_647) {
    throw extensionError(400, "ADO_PULL_REQUEST_PAGE_INVALID", "skip must be a 32-bit non-negative integer.");
  }
  return skip;
}

function readPullRequestListSummary(value, expected) {
  if (!isRecord(value)) {
    throw extensionError(502, "ADO_PULL_REQUEST_LIST_RESPONSE_INVALID", "Azure DevOps returned an invalid pull request summary.");
  }
  const id = value.pullRequestId;
  const status = readPullRequestResponseText(value.status, 32, expected.token);
  const title = readPullRequestResponseText(value.title, 255, expected.token);
  const sourceRefName = readPullRequestResponseText(value.sourceRefName, 255, expected.token);
  const targetRefName = readPullRequestResponseText(value.targetRefName, 255, expected.token);
  const sourceCommitId = readPullRequestCommitReference(value.lastMergeSourceCommit, "ADO_PULL_REQUEST_LIST_RESPONSE_INVALID", expected.token);
  const targetCommitId = readPullRequestCommitReference(value.lastMergeTargetCommit, "ADO_PULL_REQUEST_LIST_RESPONSE_INVALID", expected.token);
  const lastMergeCommitId = readPullRequestCommitReference(value.lastMergeCommit, "ADO_PULL_REQUEST_LIST_RESPONSE_INVALID", expected.token);
  const repositoryName = readPullRequestResponseText(expected.repository.name, 128, expected.token);
  const projectName = readPullRequestResponseText(expected.project.name, 128, expected.token);
  const repository = isRecord(value.repository) ? value.repository : undefined;
  const repositoryProject = repository && isRecord(repository.project) ? repository.project : undefined;
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647
    || !status || !PULL_REQUEST_RESULT_STATUSES.has(status)
    || !title || !sourceRefName || !isValidPullRequestBranchRef(sourceRefName)
    || !targetRefName || !isValidPullRequestBranchRef(targetRefName)
    || !repositoryName || !projectName
    || !repository
    || typeof repository.id !== "string" || repository.id.toLowerCase() !== expected.repository.id.toLowerCase()
    || typeof repository.name !== "string" || repository.name.toLowerCase() !== repositoryName.toLowerCase()
    || (repositoryProject && typeof repositoryProject.id === "string" && repositoryProject.id.toLowerCase() !== expected.project.id.toLowerCase())
    || (repositoryProject && typeof repositoryProject.name === "string" && repositoryProject.name.toLowerCase() !== expected.project.name.toLowerCase())) {
    throw extensionError(502, "ADO_PULL_REQUEST_LIST_RESPONSE_INVALID", "Azure DevOps returned a mismatched or invalid pull request summary.");
  }

  return {
    id,
    repository: { id: expected.repository.id, name: repositoryName, project: projectName },
    sourceRefName,
    status,
    targetRefName,
    title,
    ...(sourceCommitId ? { sourceCommitId } : {}),
    ...(targetCommitId ? { targetCommitId } : {}),
    ...(lastMergeCommitId ? { lastMergeCommitId } : {}),
  };
}

function readPullRequestTitle(value) {
  const title = typeof value === "string" ? value.trim() : "";
  if (!title || title.length > 255 || /[\u0000-\u001f\u007f]/.test(title)) {
    throw extensionError(400, "ADO_PULL_REQUEST_TITLE_INVALID", "Pull request title must be non-empty text of at most 255 characters.");
  }
  return title;
}

function readOptionalPullRequestDescription(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 100_000) {
    throw extensionError(400, "ADO_PULL_REQUEST_DESCRIPTION_INVALID", "Pull request description must be at most 100000 characters.");
  }
  return value;
}

function readOptionalPullRequestBoolean(value, field) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw extensionError(400, "ADO_PULL_REQUEST_INPUT_INVALID", `${field} must be a boolean.`);
  return value;
}

function readOptionalPullRequestReviewerIds(value) {
  return readOptionalPullRequestList(
    value,
    "ADO_PULL_REQUEST_REVIEWER_IDS_INVALID",
    "reviewerIds must contain at most 50 Azure DevOps identity UUIDs.",
    (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
  );
}

function readOptionalPullRequestWorkItemIds(value) {
  return readOptionalPullRequestList(
    value,
    "ADO_PULL_REQUEST_WORK_ITEM_IDS_INVALID",
    "workItemIds must contain at most 50 positive 32-bit integer IDs.",
    (id) => typeof id === "number" && Number.isSafeInteger(id) && id >= 1 && id <= 2_147_483_647,
  );
}

function readOptionalPullRequestLabels(value) {
  return readOptionalPullRequestList(
    value,
    "ADO_PULL_REQUEST_LABELS_INVALID",
    "labels must contain at most 50 non-empty strings of at most 128 characters.",
    (label) => typeof label === "string" && label.trim().length > 0 && label.length <= 128,
  );
}

function readOptionalPullRequestList(value, code, message, isValidItem) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50 || Object.keys(value).length !== value.length || value.some((item) => !isValidItem(item))) {
    throw extensionError(400, code, message);
  }
  return value;
}

function assertPullRequestListPayloadSize(values) {
  const listValues = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
  if (JSON.stringify(listValues).length > 10_000) {
    throw extensionError(400, "ADO_PULL_REQUEST_LISTS_TOO_LARGE", "Combined reviewerIds, workItemIds, and labels must not exceed 10,000 serialized characters.");
  }
}

function readPullRequestCreateResponse(value, expected) {
  if (!isRecord(value)) throw pullRequestCreateOutcomeUnknown();
  const id = value.pullRequestId;
  const status = readPullRequestResponseText(value.status, 32, expected.token);
  const title = readPullRequestResponseText(value.title, 255, expected.token);
  const sourceRefName = readPullRequestResponseText(value.sourceRefName, 255, expected.token);
  const targetRefName = readPullRequestResponseText(value.targetRefName, 255, expected.token);
  const returnedRepository = isRecord(value.repository) ? value.repository : undefined;
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647
    || !status || !title || title !== expected.title
    || !sourceRefName || sourceRefName !== expected.sourceRefName
    || !targetRefName || targetRefName !== expected.targetRefName
    || value.isDraft !== expected.isDraft
    || !returnedRepository
    || typeof returnedRepository.id !== "string" || returnedRepository.id.toLowerCase() !== expected.repository.id.toLowerCase()
    || typeof returnedRepository.name !== "string" || returnedRepository.name.toLowerCase() !== expected.repository.name.toLowerCase()) {
    throw pullRequestCreateOutcomeUnknown();
  }
  return { id, isDraft: expected.isDraft, sourceRefName, status, targetRefName, title };
}

function readPullRequestResponseText(value, maxLength, token) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) return undefined;
  if (containsAzureDevOpsCredential(value, token)) return undefined;
  return value;
}

function ensurePullRequestReadOk(response, code, message) {
  if (response?.ok) return;
  const status = Number.isInteger(response?.status) && response.status >= 400 && response.status <= 599 ? response.status : 502;
  if (status === 401 || status === 403) {
    throw extensionError(status, "ADO_PULL_REQUEST_PERMISSION_DENIED", `Azure DevOps denied the pull request operation (HTTP ${status}).`, { upstreamStatus: status });
  }
  throw extensionError(status, code, `${message} (Azure DevOps HTTP ${status}).`, { upstreamStatus: status });
}

function ensurePullRequestCreateOk(response) {
  if (response?.ok) return;
  const status = Number.isInteger(response?.status) && response.status >= 400 && response.status <= 599 ? response.status : 502;
  if (status === 401 || status === 403) {
    throw extensionError(status, "ADO_PULL_REQUEST_PERMISSION_DENIED", `Azure DevOps denied pull request creation (HTTP ${status}).`, { upstreamStatus: status });
  }
  if (status === 409) {
    throw extensionError(409, "ADO_PULL_REQUEST_CONFLICT", "Azure DevOps could not create the pull request because the request conflicts with repository state.", { upstreamStatus: status });
  }
  if (status === 408 || status === 429 || status >= 500) {
    throw pullRequestCreateOutcomeUnknown(status);
  }
  const code = status === 404 ? "ADO_PULL_REQUEST_BRANCH_OR_REPOSITORY_NOT_FOUND" : "ADO_PULL_REQUEST_CREATE_FAILED";
  throw extensionError(status, code, `Azure DevOps pull request creation failed (HTTP ${status}).`, { upstreamStatus: status });
}

function pullRequestCreateOutcomeUnknown(status = 502) {
  return extensionError(502, "ADO_PULL_REQUEST_CREATE_OUTCOME_UNKNOWN", "Azure DevOps did not confirm pull request creation. Verify the pull request in the selected project before retrying.", {
    upstreamStatus: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502,
  });
}

async function previewPipeline(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_preview_pipeline");
  const credentials = await repositoryCredentials(parameters);
  const { body, pipelineId } = readPipelineRunRequest(parameters, true);
  const response = await requestPipelineRunJson(
    pipelineRunsEndpoint(credentials, pipelineId),
    credentials.authorization,
    { body, method: "POST" },
    "ADO_PIPELINE_PREVIEW_FAILED",
    "Azure DevOps Pipeline preview failed.",
  );
  ensurePipelineRunOk(response, "ADO_PIPELINE_PREVIEW_FAILED", "Azure DevOps Pipeline preview failed.");
  if (!isRecord(response.body) || typeof response.body.finalYaml !== "string") {
    throw extensionError(502, "ADO_PIPELINE_PREVIEW_RESPONSE_INVALID", "Azure DevOps returned no resolved YAML for the Pipeline preview.");
  }

  const secrets = pipelineSecretValues(credentials);
  const safeYaml = redactPipelineYaml(response.body.finalYaml, secrets);
  return {
    body: {
      pipelineId,
      previewOnly: true,
      finalYaml: safeYaml.slice(0, PIPELINE_FINAL_YAML_MAX_LENGTH),
      truncated: safeYaml.length > PIPELINE_FINAL_YAML_MAX_LENGTH,
    },
  };
}

async function runPipeline(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_run_pipeline");
  const credentials = await repositoryCredentials(parameters);
  const { body, pipelineId } = readPipelineRunRequest(parameters, false);
  const response = await requestPipelineRunJson(
    pipelineRunsEndpoint(credentials, pipelineId),
    credentials.authorization,
    { body, method: "POST" },
    "ADO_PIPELINE_RUN_OUTCOME_UNKNOWN",
    "Azure DevOps may have queued the Pipeline run but did not return confirmation. Check Pipeline run history before retrying.",
  );
  if (!response.ok && response.status >= 500) {
    throw extensionError(
      502,
      "ADO_PIPELINE_RUN_OUTCOME_UNKNOWN",
      "Azure DevOps may have queued the Pipeline run but did not return confirmation. Check Pipeline run history before retrying.",
      pipelineErrorDetails(response),
    );
  }
  ensurePipelineRunOk(response, "ADO_PIPELINE_RUN_FAILED", "Azure DevOps Pipeline run could not be started.");

  try {
    return { body: publicPipelineRun(response.body, pipelineId, undefined, credentials) };
  } catch {
    throw extensionError(
      502,
      "ADO_PIPELINE_RUN_OUTCOME_UNKNOWN",
      "Azure DevOps accepted the Pipeline request but returned no verifiable run identity. Check run history before retrying.",
    );
  }
}

async function getPipelineRun(_body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_get_pipeline_run");
  const credentials = await repositoryCredentials(parameters);
  const pipelineId = readPipelineID(parameters.pipelineId);
  const runId = readPipelineID(parameters.runId, "ADO_PIPELINE_RUN_ID_INVALID", "A positive 32-bit Pipeline run ID is required.");
  const response = await requestPipelineRunJson(
    `${pipelineRunsPath(credentials, pipelineId)}/${runId}?api-version=7.1`,
    credentials.authorization,
    {},
    "ADO_PIPELINE_RUN_STATUS_FAILED",
    "Azure DevOps Pipeline run status could not be loaded.",
  );
  ensurePipelineRunOk(response, "ADO_PIPELINE_RUN_STATUS_FAILED", "Azure DevOps Pipeline run status could not be loaded.");
  return { body: publicPipelineRun(response.body, pipelineId, runId, credentials) };
}

function pipelineRunsEndpoint(credentials, pipelineId) {
  return `${pipelineRunsPath(credentials, pipelineId)}?api-version=7.1`;
}

function pipelineRunsPath(credentials, pipelineId) {
  return `https://dev.azure.com/${encodeURIComponent(credentials.organization)}/${encodeURIComponent(credentials.project)}/_apis/pipelines/${pipelineId}/runs`;
}

async function requestPipelineRunJson(url, authorization, options, code, message) {
  try {
    return await requestJson(url, authorization, options);
  } catch {
    throw extensionError(502, code, message);
  }
}

function ensurePipelineRunOk(response, code, message) {
  if (response?.ok) return;
  const status = Number.isInteger(response?.status) && response.status >= 400 && response.status <= 599 ? response.status : 502;
  throw extensionError(status, code, `${message} (Azure DevOps HTTP ${status}).`, pipelineErrorDetails(response));
}

function pipelineErrorDetails(response) {
  const status = Number.isInteger(response?.status) && response.status >= 400 && response.status <= 599 ? response.status : 502;
  return { upstreamStatus: status };
}

function readPipelineID(value, code = "ADO_PIPELINE_ID_INVALID", message = "A positive 32-bit Pipeline ID is required.") {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw extensionError(400, code, message);
  }
  return value;
}

function readPipelineRunRequest(parameters, previewRun) {
  const pipelineId = readPipelineID(parameters.pipelineId);
  const branchRef = readOptionalPipelineBranchRef(parameters.branchRef);
  const templateParameters = readPipelineTemplateParameters(parameters.templateParameters);
  return {
    pipelineId,
    body: {
      previewRun,
      ...(branchRef ? { resources: { repositories: { self: { refName: branchRef } } } } : {}),
      ...(templateParameters ? { templateParameters } : {}),
    },
  };
}

function readOptionalPipelineBranchRef(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value !== value.trim() || value.length > 255 || !value.startsWith("refs/heads/")) {
    throw extensionError(400, "ADO_PIPELINE_BRANCH_REF_INVALID", "branchRef must be a valid refs/heads/<branch> Azure DevOps ref.");
  }
  const branch = value.slice("refs/heads/".length);
  if (!branch || branch === "@" || branch.startsWith("/") || branch.endsWith("/") || branch.endsWith(".")
    || branch.includes("..") || branch.includes("//") || branch.includes("@{")
    || /[\u0000-\u0020\u007f~^:?*]/.test(branch) || branch.includes("\\") || branch.includes("[") || branch.includes("]")
    || branch.split("/").some((segment) => !segment || segment.startsWith(".") || segment.endsWith(".") || segment.toLowerCase().endsWith(".lock"))) {
    throw extensionError(400, "ADO_PIPELINE_BRANCH_REF_INVALID", "branchRef must be a valid refs/heads/<branch> Azure DevOps ref.");
  }
  return value;
}

function readPipelineTemplateParameters(value) {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw extensionError(400, "ADO_PIPELINE_TEMPLATE_PARAMETERS_INVALID", "templateParameters must be an object of scalar values.");
  }
  const entries = Object.entries(value);
  for (const [, parameterValue] of entries) {
    if (typeof parameterValue !== "string"
      && typeof parameterValue !== "boolean"
      && !(typeof parameterValue === "number" && Number.isFinite(parameterValue))) {
      throw extensionError(400, "ADO_PIPELINE_TEMPLATE_PARAMETERS_INVALID", "templateParameters values must be strings, finite numbers, or booleans.");
    }
  }
  return Object.fromEntries(entries);
}

function pipelineSecretValues(credentials) {
  const encodedCredential = Buffer.from(`:${credentials.token}`, "utf8").toString("base64");
  return [credentials.token, encodedCredential, extensionSecretKey().encoded].filter(Boolean);
}

function publicPipelineRun(value, expectedPipelineId, expectedRunId, credentials) {
  const pipeline = isRecord(value?.pipeline) ? value.pipeline : undefined;
  if (!isRecord(value)
    || !Number.isSafeInteger(value.id) || value.id < 1 || value.id > 2_147_483_647
    || (expectedRunId !== undefined && value.id !== expectedRunId)
    || !pipeline
    || !Number.isSafeInteger(pipeline.id) || pipeline.id !== expectedPipelineId
    || typeof pipeline.name !== "string" || !pipeline.name.trim() || pipeline.name.length > 256
    || /[\u0000-\u001f\u007f]/.test(pipeline.name)) {
    throw extensionError(502, "ADO_PIPELINE_RUN_RESPONSE_INVALID", "Azure DevOps returned an invalid Pipeline run identity.");
  }
  const state = ["unknown", "inProgress", "canceling", "completed"].includes(value.state) ? value.state : "unknown";
  const result = ["unknown", "succeeded", "failed", "canceled"].includes(value.result) ? value.result : "unknown";
  const secrets = pipelineSecretValues(credentials);
  const summary = {
    id: value.id,
    pipelineId: expectedPipelineId,
    pipelineName: sanitizePipelineText(pipeline.name, secrets),
    state,
    result,
  };
  const name = publicPipelineName(value.name, secrets);
  const createdDate = publicPipelineDate(value.createdDate);
  const finishedDate = publicPipelineDate(value.finishedDate);
  return {
    ...summary,
    ...(name ? { name } : {}),
    ...(createdDate ? { createdDate } : {}),
    ...(finishedDate ? { finishedDate } : {}),
  };
}

function publicPipelineName(value, secrets) {
  if (typeof value !== "string" || !value.trim() || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) return undefined;
  return sanitizePipelineText(value, secrets);
}

function publicPipelineDate(value) {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function redactPipelineYaml(value, secrets) {
  let text = sanitizePipelineText(value, secrets).replace(/((?:authorization\s*:\s*)?(?:basic|bearer)\s+)[^\s,;]+/gi, "$1[REDACTED]");
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    lines[index] = redactPipelineFlowStyleSecretValues(lines[index] ?? "");
  }
  const secretVariableValueLines = pipelineSecretVariableValueLines(lines);
  let blockIndent;
  let secretVariableIndent;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const indentation = /^\s*/.exec(line)?.[0].length ?? 0;
    if (blockIndent !== undefined) {
      if (!line.trim()) {
        lines[index] = "";
        continue;
      }
      if (indentation > blockIndent) {
        lines[index] = `${line.slice(0, indentation)}[REDACTED]`;
        continue;
      }
      blockIndent = undefined;
    }

    const match = /^(\s*(?:-\s*)?)["']?([A-Za-z_][A-Za-z0-9_.-]*)["']?\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, prefix, key, rawValue] = match;
    if ((key.toLowerCase() !== "issecret" && isSensitivePipelineKey(key))
      || secretVariableValueLines.has(index)
      || (key.toLowerCase() === "value" && secretVariableIndent !== undefined && indentation >= secretVariableIndent)) {
      lines[index] = `${prefix}${key}: [REDACTED]`;
      if (/^[|>](?:[+-]?\d?|\d?[+-]?)\s*(?:#.*)?$/.test(rawValue)) blockIndent = indentation;
      if (key.toLowerCase() === "value") secretVariableIndent = undefined;
      continue;
    }
    if (key.toLowerCase() === "name") {
      secretVariableIndent = /(?:password|secret|token|credential|authorization|(?:^|[^a-z0-9])pat(?:$|[^a-z0-9]))/i.test(rawValue)
        ? indentation
        : undefined;
    } else if (secretVariableIndent !== undefined && indentation <= secretVariableIndent) {
      secretVariableIndent = undefined;
    }
  }
  return lines.join("\n");
}

function redactPipelineFlowStyleSecretValues(line) {
  const replacements = [];
  for (const flowMap of readPipelineYamlFlowMaps(line)) {
    const entries = readPipelineYamlFlowEntries(line, flowMap.start, flowMap.end);
    if (!entries.some((entry) => entry.key.toLowerCase() === "issecret" && isYamlTrue(line.slice(entry.valueStart, entry.valueEnd)))) continue;
    for (const entry of entries) {
      if (entry.key.toLowerCase() === "value") replacements.push({ start: entry.valueStart, end: entry.valueEnd });
    }
  }

  const selected = [];
  for (const replacement of replacements.sort((left, right) => left.start - right.start || right.end - left.end)) {
    const overlaps = selected.some((existing) => replacement.start < existing.end && replacement.end > existing.start);
    if (!overlaps) selected.push(replacement);
  }
  let result = line;
  for (const replacement of selected.sort((left, right) => right.start - left.start)) {
    result = `${result.slice(0, replacement.start)}"[REDACTED]"${result.slice(replacement.end)}`;
  }
  return result;
}

function readPipelineYamlFlowMaps(line) {
  const ranges = [];
  const openings = [];
  let quote;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote === "double") {
      if (character === "\\") index += 1;
      else if (character === '"') quote = undefined;
      continue;
    }
    if (quote === "single") {
      if (character === "'" && line[index + 1] === "'") index += 1;
      else if (character === "'") quote = undefined;
      continue;
    }
    if (character === "#" && (index === 0 || /\s/.test(line[index - 1] ?? ""))) break;
    if (character === '"') quote = "double";
    else if (character === "'") quote = "single";
    else if (character === "{") openings.push(index);
    else if (character === "}" && openings.length > 0) ranges.push({ start: openings.pop(), end: index });
  }
  return ranges;
}

function readPipelineYamlFlowEntries(line, start, end) {
  const ranges = [];
  let entryStart = start + 1;
  let nesting = 0;
  let quote;
  for (let index = entryStart; index < end; index += 1) {
    const character = line[index];
    if (quote === "double") {
      if (character === "\\") index += 1;
      else if (character === '"') quote = undefined;
      continue;
    }
    if (quote === "single") {
      if (character === "'" && line[index + 1] === "'") index += 1;
      else if (character === "'") quote = undefined;
      continue;
    }
    if (character === '"') quote = "double";
    else if (character === "'") quote = "single";
    else if (character === "{" || character === "[") nesting += 1;
    else if ((character === "}" || character === "]") && nesting > 0) nesting -= 1;
    else if (character === "," && nesting === 0) {
      ranges.push({ start: entryStart, end: index });
      entryStart = index + 1;
    }
  }
  ranges.push({ start: entryStart, end });

  return ranges.flatMap((range) => {
    const colon = findPipelineYamlFlowColon(line, range.start, range.end);
    if (colon < 0) return [];
    const rawKey = line.slice(range.start, colon).trim();
    const key = unquotePipelineYamlFlowKey(rawKey);
    let valueStart = colon + 1;
    let valueEnd = range.end;
    while (valueStart < valueEnd && /\s/.test(line[valueStart] ?? "")) valueStart += 1;
    while (valueEnd > valueStart && /\s/.test(line[valueEnd - 1] ?? "")) valueEnd -= 1;
    return [{ key, valueStart, valueEnd }];
  });
}

function findPipelineYamlFlowColon(line, start, end) {
  let nesting = 0;
  let quote;
  for (let index = start; index < end; index += 1) {
    const character = line[index];
    if (quote === "double") {
      if (character === "\\") index += 1;
      else if (character === '"') quote = undefined;
      continue;
    }
    if (quote === "single") {
      if (character === "'" && line[index + 1] === "'") index += 1;
      else if (character === "'") quote = undefined;
      continue;
    }
    if (character === '"') quote = "double";
    else if (character === "'") quote = "single";
    else if (character === "{" || character === "[") nesting += 1;
    else if ((character === "}" || character === "]") && nesting > 0) nesting -= 1;
    else if (character === ":" && nesting === 0) return index;
  }
  return -1;
}

function unquotePipelineYamlFlowKey(value) {
  if (value.length < 2) return value;
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch { return value.slice(1, -1); }
  }
  return value;
}

function pipelineSecretVariableValueLines(lines) {
  const result = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const secret = parsePipelineYamlMapping(lines[index]);
    if (!secret || secret.key.toLowerCase() !== "issecret" || !isYamlTrue(secret.value)) continue;
    for (const direction of [-1, 1]) {
      for (let candidateIndex = index + direction; candidateIndex >= 0 && candidateIndex < lines.length; candidateIndex += direction) {
        const line = lines[candidateIndex] ?? "";
        if (!line.trim() || /^\s*#/.test(line)) continue;
        const candidate = parsePipelineYamlMapping(line);
        const physicalIndent = /^\s*/.exec(line)?.[0].length ?? 0;
        if (physicalIndent < secret.mappingIndent || (candidate && candidate.mappingIndent < secret.mappingIndent)) break;
        if (candidate?.mappingIndent === secret.mappingIndent && candidate.key.toLowerCase() === "value") {
          result.add(candidateIndex);
          break;
        }
      }
    }
  }
  return result;
}

function parsePipelineYamlMapping(line) {
  if (typeof line !== "string") return undefined;
  const physicalIndent = /^\s*/.exec(line)?.[0].length ?? 0;
  const remainder = line.slice(physicalIndent);
  const sequenceItem = remainder.startsWith("- ");
  const mapping = sequenceItem ? remainder.slice(2) : remainder;
  const match = /^["']?([A-Za-z_][A-Za-z0-9_.-]*)["']?\s*:\s*(.*)$/.exec(mapping);
  if (!match) return undefined;
  return {
    key: match[1],
    mappingIndent: physicalIndent + (sequenceItem ? 2 : 0),
    value: match[2],
  };
}

function isYamlTrue(value) {
  const withoutComment = value.replace(/\s+#.*$/, "").trim();
  return ["true", "'true'", '"true"'].includes(withoutComment.toLowerCase());
}

function isSensitivePipelineKey(value) {
  return /(?:api[-_]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|authorization|credential|private[-_]?key|(?:^|[^a-z0-9])pat(?:$|[^a-z0-9]))/i.test(value);
}

function sanitizePipelineText(value, secrets) {
  let safe = String(value).replace(/((?:authorization\s*:\s*)?(?:basic|bearer)\s+)[^\s,;]+/gi, "$1[REDACTED]");
  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join("[REDACTED]");
  }
  return safe;
}

async function fetchAzureDevOpsWikis(organization, project, authorization) {
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/wiki/wikis?api-version=7.1`,
    authorization,
  );
  ensureWikiOk(response, "ADO_WIKI_LIST_FAILED", "Azure DevOps wikis could not be loaded.");
  return publicWikis(response.body?.value);
}

async function resolveAzureDevOpsWiki(organization, project, authorization, identifier) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier)) {
    return { id: identifier };
  }

  const wikis = await fetchAzureDevOpsWikis(organization, project, authorization);
  const normalized = identifier.trim().toLowerCase();
  const byID = wikis.find((wiki) => wiki.id.toLowerCase() === normalized);
  if (byID) return byID;
  const byName = wikis.filter((wiki) => wiki.name.trim().toLowerCase() === normalized);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    throw extensionError(409, "ADO_WIKI_NAME_AMBIGUOUS", "More than one Wiki matches this name; use the Wiki ID from the synchronized Wiki list.");
  }
  throw extensionError(404, "ADO_WIKI_NOT_FOUND", "The Wiki name or ID was not found in the selected Azure DevOps Project.");
}

async function getWikiPage(endpoint, authorization, path, includeContent) {
  const query = new URLSearchParams({
    "api-version": "7.1",
    path,
    ...(includeContent ? { includeContent: "true" } : {}),
  });
  return requestJson(`${endpoint}?${query}`, authorization);
}

async function ensureWikiPageAncestors(endpoint, authorization, path) {
  const segments = path.split("/").filter(Boolean);
  const created = [];
  for (let index = 1; index < segments.length; index += 1) {
    const ancestorPath = `/${segments.slice(0, index).join("/")}`;
    const existing = await getWikiPage(endpoint, authorization, ancestorPath, false);
    if (existing.status === 200) continue;
    assertWikiPageMissing(existing, "ADO_WIKI_ANCESTOR_CHECK_FAILED", "A Wiki ancestor page could not be checked before writing.");

    const query = new URLSearchParams({ "api-version": "7.1", path: ancestorPath });
    const response = await putWikiPageWithAncestorRetry(endpoint, authorization, query, "", undefined, true);
    if (response.status === 201) created.push(ancestorPath);
  }
  return created;
}

async function putWikiPageWithAncestorRetry(endpoint, authorization, query, content, etag, allowExisting = false) {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await requestJson(
      `${endpoint}?${query}`,
      authorization,
      { body: { content }, method: "PUT", ...(etag ? { ifMatch: etag } : {}) },
    );
    if (response.ok) return response;
    if (!isMissingAncestorResponse(response) || attempt === maxAttempts - 1) {
      ensureWikiOk(response, etag ? "ADO_WIKI_PAGE_WRITE_FAILED" : "ADO_WIKI_ANCESTOR_CREATE_FAILED", etag
        ? "The Azure DevOps Wiki page could not be written."
        : "A required Wiki ancestor page could not be created.");
    }

    const path = query.get("path");
    if (path) {
      const existing = await getWikiPage(endpoint, authorization, path, false);
      if (existing.status === 200) {
        if (allowExisting) return existing;
        throw extensionError(409, "ADO_WIKI_PAGE_CHANGED_DURING_WRITE", "The Wiki page was created by another writer while this write was being retried.");
      }
      assertWikiPageMissing(existing, "ADO_WIKI_ANCESTOR_CHECK_FAILED", "A Wiki ancestor page could not be checked before retrying.");
    }
    await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }
  throw extensionError(502, "ADO_WIKI_PAGE_RESPONSE_INVALID", "The Wiki page write retry did not produce a result.");
}

function isMissingAncestorResponse(response) {
  return response?.status === 404 && response?.body?.typeKey === "WikiAncestorPageNotFoundException";
}

function assertWikiPageMissing(response, code, message) {
  if (response?.status === 404 && isWikiPageMissingResponse(response)) return;
  ensureWikiOk(response, code, message);
}

function isWikiPageMissingResponse(response) {
  const typeKey = response?.body?.typeKey;
  return typeKey === undefined
    || typeKey === "WikiPageNotFoundException"
    || typeKey === "WikiAncestorPageNotFoundException";
}

async function resolveAzureDevOpsProject(organization, projectName, authorization) {
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects/${encodeURIComponent(projectName)}?api-version=7.1`,
    authorization,
  );
  if (response.status === 404) throw extensionError(404, "ADO_PROJECT_NOT_FOUND", "The Azure DevOps project was not found.");
  ensureOk(response, "ADO_PROJECT_LOOKUP_FAILED", "The Azure DevOps project could not be loaded.");
  if (!isRecord(response.body) || typeof response.body.name !== "string" || response.body.name.toLowerCase() !== projectName.toLowerCase()) {
    throw extensionError(502, "ADO_PROJECT_METADATA_INVALID", "Azure DevOps returned a different project than the configured project.");
  }
  return {
    id: readUUID(response.body.id, "ADO_PROJECT_METADATA_INVALID", "Azure DevOps returned an invalid project ID."),
    name: response.body.name,
  };
}

async function lookupRepository(body, request) {
  return lookupRepositoryForTool(body, request, "azure_devops_configure_remote");
}

async function cloneRepository(body, request) {
  return lookupRepositoryForTool(body, request, "azure_devops_clone_repository");
}

async function lookupRepositoryForTool(body, request, expectedTool) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, expectedTool);
  const { authorization, organization, project: adoProject } = await repositoryCredentials(parameters);
  const identity = repositoryIdentity(parameters, organization, adoProject);
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(adoProject)}/_apis/git/repositories/${encodeURIComponent(identity)}?api-version=7.1`,
    authorization,
  );
  if (response.status === 404) throw extensionError(404, "AZURE_DEVOPS_REPOSITORY_NOT_FOUND", "The Azure DevOps repository was not found.");
  ensureOk(response, "ADO_REPOSITORY_LOOKUP_FAILED", "The Azure DevOps repository could not be loaded.");
  return {
    body: {
      operationPlan: publicRepositoryOperationPlan(parameters, expectedTool),
      repository: publicRepository(response.body, organization, adoProject),
    },
  };
}

async function getGitPushCredential(body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_push");
  const organization = readOrganization(parameters.organization);
  const adoProject = readContextValue(parameters.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const remoteName = readRemoteName(parameters.remoteName ?? "origin");
  const branch = readGitBranch(parameters.branch);
  const setUpstream = readOptionalBoolean(parameters.setUpstream, "AZURE_DEVOPS_POLICY_INVALID");
  const remoteUrl = canonicalRepositoryUrl(body?.observedRemoteUrl, organization, adoProject);

  let credentials;
  try {
    credentials = await repositoryCredentials({ organization, project: adoProject });
  } catch {
    throw extensionError(503, "AZURE_DEVOPS_CREDENTIAL_BROKER_UNAVAILABLE", "The Azure DevOps credential broker is unavailable.");
  }
  await verifyPushRepository(remoteUrl, organization, adoProject, credentials.authorization);

  return {
    body: {
      branch,
      organization,
      project: adoProject,
      remoteName,
      remoteUrl,
      setUpstream,
      token: credentials.token,
    },
  };
}

async function getGitPushPlan(_body, request) {
  assertBrokerRequest(request);
  const resolved = readResolvedToolCall(request, "azure_devops_push");
  return {
    body: {
      operationPlan: publicPushOperationPlan(resolved),
    },
  };
}

async function getGitPullPlan(_body, request) {
  assertBrokerRequest(request);
  const resolved = readResolvedToolCall(request, "azure_devops_git_pull");
  return {
    body: {
      operationPlan: publicPullOperationPlan(resolved),
    },
  };
}

async function getGitPullCredential(body, request) {
  assertBrokerRequest(request);
  const resolved = readResolvedToolCall(request, "azure_devops_git_pull");
  const parameters = resolved.parameters;
  const organization = readOrganization(parameters.organization);
  const adoProject = readContextValue(parameters.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const remoteName = readRemoteName(parameters.remoteName ?? "origin");
  const branch = readOptionalGitPullBranch(parameters.branch);
  const remoteUrl = canonicalRepositoryUrl(body?.observedRemoteUrl, organization, adoProject);

  let credentials;
  try {
    credentials = await repositoryCredentials({ organization, project: adoProject });
  } catch {
    throw extensionError(503, "AZURE_DEVOPS_CREDENTIAL_BROKER_UNAVAILABLE", "The Azure DevOps credential broker is unavailable.");
  }
  await verifyPullRepository(remoteUrl, organization, adoProject, credentials.authorization);

  return {
    body: {
      ...(branch ? { branch } : {}),
      organization,
      project: adoProject,
      remoteName,
      remoteUrl,
      token: credentials.token,
    },
  };
}

async function getGitCredential(body, request) {
  assertBrokerRequest(request);
  const { parameters } = readResolvedToolCall(request, "azure_devops_clone_repository");
  const { organization, project, token } = await repositoryCredentials(parameters);
  return { body: { credential: token, organization, project } };
}

async function repositoryCredentials(parameters) {
  const organization = readOrganization(parameters.organization);
  const project = readContextValue(parameters.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const token = await readCredential(organization, project);
  if (!token) throw extensionError(404, "ADO_CREDENTIAL_NOT_FOUND", "Azure DevOps credential has not been verified for this organization and project.");
  return {
    authorization: `Basic ${Buffer.from(`:${token}`, "utf8").toString("base64")}`,
    organization,
    project,
    token,
  };
}

function repositoryIdentity(parameters, organization, project) {
  if (parameters.remoteUrl !== undefined || parameters.url !== undefined) {
    throw extensionError(400, "AZURE_DEVOPS_CLONE_REMOTE_INPUT_FORBIDDEN", "Clone remote URL must come from verified Azure DevOps metadata.");
  }
  if (typeof parameters.repositoryReference === "string") {
    const match = REPOSITORY_REFERENCE_PATTERN.exec(parameters.repositoryReference.trim());
    if (!match) throw extensionError(400, "AZURE_DEVOPS_REPOSITORY_REFERENCE_INVALID", "The Azure DevOps repository reference is invalid.");
    if (decodeURIComponent(match[1]).toLowerCase() !== organization.toLowerCase()) {
      throw extensionError(400, "AZURE_DEVOPS_ORGANIZATION_MISMATCH", "The repository reference belongs to another Azure DevOps organization.");
    }
    if (decodeURIComponent(match[2]) !== project) {
      throw extensionError(400, "AZURE_DEVOPS_PROJECT_MISMATCH", "The repository reference belongs to another Azure DevOps project.");
    }
    return match[3];
  }
  if (typeof parameters.repositoryID === "string") return readUUID(parameters.repositoryID, "AZURE_DEVOPS_REPOSITORY_REFERENCE_INVALID", "The Azure DevOps repository ID is invalid.");
  return readContextValue(parameters.repositoryName, "AZURE_DEVOPS_REPOSITORY_REFERENCE_REQUIRED", "A verified repository reference, ID, or name is required.", 128);
}

function readResolvedToolCall(request, expectedTool) {
  const context = request?.extensionContext?.azureDevOps;
  const resolved = context?.resolvedToolCall;
  if (!isRecord(context) || !isRecord(resolved) || resolved.tool !== expectedTool || !isRecord(resolved.parameters)) {
    throw extensionError(409, "AZURE_DEVOPS_TOOL_CONTEXT_REQUIRED", "Azure DevOps tool context must be resolved by the Agent System backend.");
  }
  const effectiveOrganization = context.effectiveContext?.organization;
  if (typeof effectiveOrganization !== "string" || resolved.parameters.organization !== effectiveOrganization) {
    throw extensionError(409, "AZURE_DEVOPS_CONTEXT_MISMATCH", "Azure DevOps organization must come from the effective project context.");
  }
  const projectPolicy = context.effectiveContext?.parameterPolicy?.tools?.[expectedTool]?.fields?.project;
  const effectiveProject = context.effectiveContext?.adoProject;
  if (projectPolicy?.mode === "fixed"
    && (typeof effectiveProject !== "string"
      || projectPolicy.value !== effectiveProject
      || resolved.parameters.project !== projectPolicy.value)) {
    throw extensionError(409, "AZURE_DEVOPS_PROJECT_CONTEXT_MISMATCH", "Azure DevOps fixed project policy must match the effective ADO project.");
  }
  return resolved;
}

function publicRepositoryOperationPlan(parameters, tool) {
  const safeParameters = Object.fromEntries(Object.entries(parameters).filter(([key]) => !/(?:authorization|credential|pass(?:word|wd)?|(?:^|[^a-z0-9])pat(?:$|[^a-z0-9])|secret|token)/i.test(key)));
  return { parameters: safeParameters, tool };
}

function publicPushOperationPlan(resolved) {
  const parameters = Object.fromEntries(Object.entries(resolved.parameters).filter(([key]) => ["organization", "project", "repositoryPath", "remoteName", "branch", "setUpstream"].includes(key)));
  const sources = Object.fromEntries(Object.entries(resolved.sources ?? {}).filter(([key]) => Object.prototype.hasOwnProperty.call(parameters, key)));
  return { parameters, sources, tool: "azure_devops_push" };
}

function publicPullOperationPlan(resolved) {
  const parameters = Object.fromEntries(Object.entries(resolved.parameters).filter(([key]) => ["organization", "project", "repositoryPath", "remoteName", "branch"].includes(key)));
  const sources = Object.fromEntries(Object.entries(resolved.sources ?? {}).filter(([key]) => Object.prototype.hasOwnProperty.call(parameters, key)));
  return { parameters, sources, tool: "azure_devops_git_pull" };
}

function publicRepository(value, organization, adoProject, requireMatchingRemoteRepositoryName = true) {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || !isRecord(value.project)) {
    throw extensionError(502, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", "Azure DevOps returned invalid repository metadata.");
  }
  const id = readUUID(value.id, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", "Azure DevOps returned an invalid repository ID.");
  const name = readContextValue(value.name, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", "Azure DevOps returned an invalid repository name.", 128);
  const projectID = readUUID(value.project.id, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", "Azure DevOps returned an invalid project ID.");
  const projectName = readContextValue(value.project.name, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", "Azure DevOps returned an invalid project name.", 128);
  if (projectName.toLowerCase() !== adoProject.toLowerCase()) throw extensionError(502, "AZURE_DEVOPS_PROJECT_MISMATCH", "Azure DevOps returned repository metadata from another project.");
  const remoteUrl = canonicalRepositoryUrl(value.remoteUrl, organization, adoProject, requireMatchingRemoteRepositoryName ? name : undefined);
  return {
    id,
    name,
    project: { id: projectID, name: projectName },
    remoteUrl,
    repositoryReference: `azure-devops://${organization}/${adoProject}/${id}`,
  };
}

function assertRepositoryListName(value) {
  if (isRecord(value) && typeof value.name === "string" && /[\u0000-\u001f\u007f]/.test(value.name)) {
    throw extensionError(502, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", "Azure DevOps returned an invalid repository name.");
  }
}

async function verifyPushRepository(remoteUrl, organization, adoProject, authorization) {
  const repositoryName = repositoryNameFromCanonicalUrl(remoteUrl, organization, adoProject);
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(adoProject)}/_apis/git/repositories/${encodeURIComponent(repositoryName)}?api-version=7.1`,
    authorization,
  );
  if (response.status === 404) throw extensionError(409, "AZURE_DEVOPS_REPOSITORY_NOT_FOUND", "The Azure DevOps push repository was not found.");
  ensureOk(response, "AZURE_DEVOPS_REPOSITORY_LOOKUP_FAILED", "The Azure DevOps push repository could not be verified.");
  const repository = publicRepository(response.body, organization, adoProject, false);
  if (repository.remoteUrl !== remoteUrl) {
    throw extensionError(409, "AZURE_DEVOPS_REPOSITORY_REMOTE_MISMATCH", "Azure DevOps returned a different repository than the observed Git remote.");
  }
  return repository;
}

async function verifyPullRepository(remoteUrl, organization, adoProject, authorization) {
  const repositoryName = repositoryNameFromCanonicalUrl(remoteUrl, organization, adoProject);
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(adoProject)}/_apis/git/repositories/${encodeURIComponent(repositoryName)}?api-version=7.1`,
    authorization,
  );
  if (response.status === 404) throw extensionError(409, "AZURE_DEVOPS_REPOSITORY_NOT_FOUND", "The Azure DevOps pull repository was not found.");
  ensureOk(response, "AZURE_DEVOPS_REPOSITORY_LOOKUP_FAILED", "The Azure DevOps pull repository could not be verified.");
  const repository = publicRepository(response.body, organization, adoProject, false);
  if (repository.remoteUrl !== remoteUrl) {
    throw extensionError(409, "AZURE_DEVOPS_REPOSITORY_REMOTE_MISMATCH", "Azure DevOps returned a different repository than the observed Git remote.");
  }
  return repository;
}

function repositoryNameFromCanonicalUrl(value, organization, adoProject) {
  const remoteUrl = canonicalRepositoryUrl(value, organization, adoProject);
  const parsed = new URL(remoteUrl);
  const segments = canonicalRepositoryPathSegments(parsed);
  return parsed.hostname.toLowerCase() === "dev.azure.com" ? segments[3] : segments[2];
}

function canonicalRepositoryUrl(value, organization, adoProject, repositoryName) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || /[\r\n\0]/.test(value)) throw extensionError(502, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw extensionError(502, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
  }
  let username;
  try {
    username = decodeURIComponent(parsed.username);
  } catch {
    throw extensionError(502, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
  }
  const authority = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/.exec(value)?.[1] || "";
  const hasUserInfo = authority.includes("@");
  const userInfo = hasUserInfo ? authority.slice(0, authority.lastIndexOf("@")) : "";
  if (parsed.protocol !== "https:"
    || parsed.password
    || (hasUserInfo && (!username || userInfo.includes(":") || username.toLowerCase() !== organization.toLowerCase()))
    || parsed.port
    || hasExplicitPort(value)
    || parsed.search
    || parsed.hash) {
    throw extensionError(502, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
  }
  const segments = canonicalRepositoryPathSegments(parsed);
  const host = parsed.hostname.toLowerCase();
  const isDevAzure = host === "dev.azure.com";
  const visualStudioOrganization = host.endsWith(".visualstudio.com") ? host.slice(0, -".visualstudio.com".length) : "";
  const isVisualStudio = Boolean(visualStudioOrganization) && visualStudioOrganization === organization.toLowerCase();
  let remoteProject;
  let remoteRepository;
  if (isDevAzure && segments.length === 4 && segments[0].toLowerCase() === organization.toLowerCase() && segments[2].toLowerCase() === "_git") {
    remoteProject = segments[1];
    remoteRepository = segments[3];
  } else if (isVisualStudio && segments.length === 3 && segments[1].toLowerCase() === "_git") {
    remoteProject = segments[0];
    remoteRepository = segments[2];
  } else if (isVisualStudio && segments.length === 4 && segments[0].toLowerCase() === "defaultcollection" && segments[2].toLowerCase() === "_git") {
    remoteProject = segments[1];
    remoteRepository = segments[3];
  }
  if (!remoteProject
    || remoteProject.toLowerCase() !== adoProject.toLowerCase()
    || !remoteRepository
    || (repositoryName !== undefined && remoteRepository.toLowerCase() !== repositoryName.toLowerCase())) {
    throw extensionError(502, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
  }
  return `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(adoProject)}/_git/${encodeURIComponent(repositoryName || remoteRepository)}`;
}

function canonicalRepositoryPathSegments(parsed) {
  const rawSegments = parsed.pathname.split("/");
  if (rawSegments[0] === "") rawSegments.shift();
  if (rawSegments.length === 0 || rawSegments.some((segment) => !segment)) {
    throw extensionError(502, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
  }
  return rawSegments.map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      throw extensionError(502, "AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", CANONICAL_REMOTE_INVALID_MESSAGE);
    }
  });
}

function hasExplicitPort(value) {
  const authority = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/.exec(value)?.[1] || "";
  const host = authority.slice(authority.lastIndexOf("@") + 1);
  return host.includes(":");
}

async function listProjects(organization, authorization) {
  let continuationToken;
  let response = { body: undefined, ok: true, status: 200 };
  const projects = [];

  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ "$top": "100", "api-version": "7.1" });
    if (continuationToken) query.set("continuationToken", continuationToken);
    response = await requestJson(
      `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects?${query}`,
      authorization,
    );
    if (!response.ok) break;
    projects.push(...publicProjects(response.body?.value));
    continuationToken = response.continuationToken;
    if (!continuationToken) break;
  }

  return { ...response, projects: uniqueByID(projects) };
}

async function listTeams(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const query = new URLSearchParams({ "$top": "100", "api-version": "7.1" });
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects/${encodeURIComponent(project)}/teams?${query}`,
    authorization,
  );
  ensureOk(response, "ADO_TEAMS_REQUEST_FAILED", "Azure DevOps teams could not be loaded.");
  return { body: { project, teams: publicTeams(response.body?.value) } };
}

async function createTeam(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const name = readContextValue(body?.name, "ADO_TEAM_NAME_INVALID", "A team name is required.", 128);
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 1024) : "";
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects/${encodeURIComponent(project)}/teams?api-version=7.1`,
    authorization,
    { body: { description, name }, method: "POST" },
  );
  ensureOk(response, "ADO_TEAM_CREATE_FAILED", "The Azure DevOps team could not be created.");
  return { body: { project, team: publicTeams([response.body])[0] } };
}

async function updateTeam(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const teamID = readUUID(body?.teamID, "ADO_TEAM_INVALID", "A team ID is required.");
  const name = readContextValue(body?.name, "ADO_TEAM_NAME_INVALID", "A team name is required.", 128);
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 1024) : "";
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects/${encodeURIComponent(project)}/teams/${encodeURIComponent(teamID)}?api-version=7.1`,
    authorization,
    { body: { description, name }, method: "PATCH" },
  );
  ensureOk(response, "ADO_TEAM_UPDATE_FAILED", "The Azure DevOps team could not be updated.");
  return { body: { project, team: publicTeams([response.body])[0] } };
}

async function deleteTeam(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const teamID = readUUID(body?.teamID, "ADO_TEAM_INVALID", "A team ID is required.");
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects/${encodeURIComponent(project)}/teams/${encodeURIComponent(teamID)}?api-version=7.1`,
    authorization,
    { method: "DELETE" },
  );
  ensureOk(response, "ADO_TEAM_DELETE_FAILED", "The Azure DevOps team could not be deleted.");
  return { body: { project, teamID } };
}

async function listTeamMembers(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const query = new URLSearchParams({ "$top": "100", "api-version": "7.1" });
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects/${encodeURIComponent(project)}/teams/${encodeURIComponent(team)}/members?${query}`,
    authorization,
  );
  ensureOk(response, "ADO_TEAM_MEMBERS_REQUEST_FAILED", "Azure DevOps team members could not be loaded.");
  return { body: { project, team, members: publicTeamMembers(response.body?.value) } };
}

async function addTeamMember(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const memberID = readUUID(body?.memberID, "ADO_MEMBER_INVALID", "A member ID is required.");
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects/${encodeURIComponent(project)}/teams/${encodeURIComponent(team)}/members/${encodeURIComponent(memberID)}?api-version=7.1`,
    authorization,
    { method: "PUT" },
  );
  ensureOk(response, "ADO_TEAM_MEMBER_ADD_FAILED", "The member could not be added to the team.");
  return { body: { memberID, project, team } };
}

async function removeTeamMember(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const memberID = readUUID(body?.memberID, "ADO_MEMBER_INVALID", "A member ID is required.");
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects/${encodeURIComponent(project)}/teams/${encodeURIComponent(team)}/members/${encodeURIComponent(memberID)}?api-version=7.1`,
    authorization,
    { method: "DELETE" },
  );
  ensureOk(response, "ADO_TEAM_MEMBER_REMOVE_FAILED", "The member could not be removed from the team.");
  return { body: { memberID, project, team } };
}

async function listClassificationNodes(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const kind = body?.kind === "areas" ? "Areas" : body?.kind === "iterations" ? "Iterations" : undefined;
  if (!kind) throw extensionError(400, "ADO_CLASSIFICATION_KIND_INVALID", "Classification kind must be areas or iterations.");
  const query = new URLSearchParams({ "$depth": "10", "api-version": "7.1" });
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/wit/classificationnodes/${kind}?${query}`,
    authorization,
  );
  ensureOk(response, "ADO_CLASSIFICATION_REQUEST_FAILED", "Azure DevOps classification nodes could not be loaded.");
  return { body: { kind: body.kind, nodes: flattenClassificationNodes(response.body) } };
}

async function getTeamSettings(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const base = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}`;
  const [settingsResponse, fieldValuesResponse, iterationsResponse] = await Promise.all([
    requestJson(`${base}/_apis/work/teamsettings?api-version=7.1`, authorization),
    requestJson(`${base}/_apis/work/teamsettings/teamfieldvalues?api-version=7.1`, authorization).catch(() => undefined),
    requestJson(`${base}/_apis/work/teamsettings/iterations?api-version=7.1`, authorization).catch(() => undefined),
  ]);
  ensureOk(settingsResponse, "ADO_TEAM_SETTINGS_REQUEST_FAILED", "Azure DevOps team settings could not be loaded.");
  return {
    body: {
      fieldValues: fieldValuesResponse?.ok ? publicTeamFieldValues(fieldValuesResponse.body) : undefined,
      iterations: iterationsResponse?.ok ? publicIterations(iterationsResponse.body?.values) : [],
      project,
      settings: publicTeamSettings(settingsResponse.body),
      team,
    },
  };
}

async function updateTeamSettings(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const patch = readTeamSettingsPatch(body?.settings);
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/teamsettings?api-version=7.1`,
    authorization,
    { body: patch, method: "PATCH" },
  );
  ensureOk(response, "ADO_TEAM_SETTINGS_UPDATE_FAILED", "Azure DevOps team settings could not be updated.");
  return { body: { project, settings: publicTeamSettings(response.body), team } };
}

async function updateTeamFieldValues(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const values = Array.isArray(body?.values) ? body.values : [];
  if (values.length > 300) throw extensionError(400, "ADO_TEAM_FIELD_VALUES_INVALID", "A team may have at most 300 area paths.");
  const normalizedValues = values.map((item) => {
    if (!isRecord(item) || typeof item.value !== "string" || !item.value.trim() || typeof item.includeChildren !== "boolean") {
      throw extensionError(400, "ADO_TEAM_FIELD_VALUES_INVALID", "Each area path needs value and includeChildren.");
    }
    return { includeChildren: item.includeChildren, value: item.value.trim().slice(0, 512) };
  });
  const defaultValue = typeof body?.defaultValue === "string" ? body.defaultValue.trim() : "";
  if (!defaultValue) throw extensionError(400, "ADO_TEAM_FIELD_DEFAULT_INVALID", "A default area path is required.");
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/teamsettings/teamfieldvalues?api-version=7.1`,
    authorization,
    { body: { defaultValue, values: normalizedValues }, method: "PATCH" },
  );
  ensureOk(response, "ADO_TEAM_FIELD_VALUES_UPDATE_FAILED", "Azure DevOps team area paths could not be updated.");
  return { body: { fieldValues: publicTeamFieldValues(response.body), project, team } };
}

async function listTeamIterations(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const query = new URLSearchParams({ "api-version": "7.1" });
  if (body?.timeframe === "current") query.set("$timeframe", "current");
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/teamsettings/iterations?${query}`,
    authorization,
  );
  ensureOk(response, "ADO_TEAM_ITERATIONS_REQUEST_FAILED", "Azure DevOps team iterations could not be loaded.");
  return { body: { iterations: publicIterations(response.body?.values), project, team } };
}

async function addTeamIteration(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const id = readUUID(body?.iterationID, "ADO_ITERATION_INVALID", "An iteration ID is required.");
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/teamsettings/iterations?api-version=7.1`,
    authorization,
    { body: { id }, method: "POST" },
  );
  ensureOk(response, "ADO_TEAM_ITERATION_ADD_FAILED", "The iteration could not be assigned to the team.");
  return { body: { iteration: publicIteration(response.body), project, team } };
}

async function removeTeamIteration(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const id = readUUID(body?.iterationID, "ADO_ITERATION_INVALID", "An iteration ID is required.");
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/teamsettings/iterations/${encodeURIComponent(id)}?api-version=7.1`,
    authorization,
    { method: "DELETE" },
  );
  ensureOk(response, "ADO_TEAM_ITERATION_REMOVE_FAILED", "The iteration could not be removed from the team.");
  return { body: { iterationID: id, project, team } };
}

async function listBoards(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/boards?api-version=7.1`,
    authorization,
  );
  ensureOk(response, "ADO_BOARDS_REQUEST_FAILED", "Azure DevOps boards could not be loaded.");
  return { body: { boards: publicBoards(response.body?.value), project, team } };
}

async function getBoardColumns(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const board = readContextValue(body?.board, "ADO_BOARD_INVALID", "Azure DevOps board", 128);
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/boards/${encodeURIComponent(board)}/columns?api-version=7.1`,
    authorization,
  );
  ensureOk(response, "ADO_BOARD_COLUMNS_REQUEST_FAILED", "Azure DevOps board columns could not be loaded.");
  return { body: { board, columns: publicBoardColumns(response.body?.value), project, team } };
}

async function updateBoardColumns(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const board = readContextValue(body?.board, "ADO_BOARD_INVALID", "Azure DevOps board", 128);
  const columns = readBoardColumns(body?.columns);
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/boards/${encodeURIComponent(board)}/columns?api-version=7.1`,
    authorization,
    { body: columns, method: "PUT" },
  );
  ensureOk(response, "ADO_BOARD_COLUMNS_UPDATE_FAILED", "Azure DevOps board columns could not be updated.");
  return { body: { board, columns: publicBoardColumns(response.body?.value), project, team } };
}

async function listDashboards(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/dashboard/dashboards?api-version=7.1-preview.3`,
    authorization,
  );
  ensureOk(response, "ADO_DASHBOARDS_REQUEST_FAILED", "Azure DevOps dashboards could not be loaded.");
  const dashboards = publicDashboards(response.body?.value);
  const detailedDashboards = await Promise.all(dashboards.map(async (dashboard) => {
    const detail = await requestJson(
      `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/dashboard/dashboards/${encodeURIComponent(dashboard.id)}?api-version=7.1-preview.3`,
      authorization,
    ).catch(() => undefined);
    return detail?.ok ? publicDashboard(detail.body) ?? dashboard : dashboard;
  }));
  return { body: { dashboards: detailedDashboards, project, team } };
}

async function createDashboard(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const name = readContextValue(body?.name, "ADO_DASHBOARD_NAME_INVALID", "A dashboard name is required.", 128);
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 1024) : "";
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/dashboard/dashboards?api-version=7.1-preview.3`,
    authorization,
    { body: { description, name }, method: "POST" },
  );
  ensureOk(response, "ADO_DASHBOARD_CREATE_FAILED", "The Azure DevOps dashboard could not be created.");
  return { body: { dashboard: publicDashboard(response.body), project, team } };
}

async function updateDashboard(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const dashboardID = readUUID(body?.dashboardID, "ADO_DASHBOARD_INVALID", "A dashboard ID is required.");
  const name = readContextValue(body?.name, "ADO_DASHBOARD_NAME_INVALID", "A dashboard name is required.", 128);
  const payload = {
    description: typeof body?.description === "string" ? body.description.trim().slice(0, 1024) : "",
    eTag: typeof body?.eTag === "string" ? body.eTag : undefined,
    name,
  };
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/dashboard/dashboards/${encodeURIComponent(dashboardID)}?api-version=7.1-preview.3`,
    authorization,
    { body: omitUndefined(payload), method: "PUT" },
  );
  ensureOk(response, "ADO_DASHBOARD_UPDATE_FAILED", "The Azure DevOps dashboard could not be updated.");
  return { body: { dashboard: publicDashboard(response.body), project, team } };
}

async function deleteDashboard(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const dashboardID = readUUID(body?.dashboardID, "ADO_DASHBOARD_INVALID", "A dashboard ID is required.");
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/dashboard/dashboards/${encodeURIComponent(dashboardID)}?api-version=7.1-preview.3`,
    authorization,
    { method: "DELETE" },
  );
  ensureOk(response, "ADO_DASHBOARD_DELETE_FAILED", "The Azure DevOps dashboard could not be deleted.");
  return { body: { dashboardID, project, team } };
}

async function createDashboardWidget(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const dashboardID = readUUID(body?.dashboardID, "ADO_DASHBOARD_INVALID", "A dashboard ID is required.");
  const widget = readWidget(body?.widget);
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/dashboard/dashboards/${encodeURIComponent(dashboardID)}/widgets?api-version=7.1-preview.2`,
    authorization,
    { body: widget, method: "POST" },
  );
  ensureOk(response, "ADO_WIDGET_CREATE_FAILED", "The dashboard widget could not be created.");
  return { body: { project, team, widget: publicWidget(response.body) } };
}

async function updateDashboardWidget(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const dashboardID = readUUID(body?.dashboardID, "ADO_DASHBOARD_INVALID", "A dashboard ID is required.");
  const widgetID = readUUID(body?.widgetID, "ADO_WIDGET_INVALID", "A widget ID is required.");
  const widget = readWidget(body?.widget, true);
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/dashboard/dashboards/${encodeURIComponent(dashboardID)}/widgets/${encodeURIComponent(widgetID)}?api-version=7.1-preview.2`,
    authorization,
    { body: widget, method: "PATCH" },
  );
  ensureOk(response, "ADO_WIDGET_UPDATE_FAILED", "The dashboard widget could not be updated.");
  return { body: { project, team, widget: publicWidget(response.body) } };
}

async function deleteDashboardWidget(body) {
  const { authorization, organization } = readCredentials(body);
  const project = readContextValue(body?.project, "ADO_PROJECT_INVALID", "Azure DevOps project");
  const team = readContextValue(body?.team, "ADO_TEAM_INVALID", "Azure DevOps team");
  const dashboardID = readUUID(body?.dashboardID, "ADO_DASHBOARD_INVALID", "A dashboard ID is required.");
  const widgetID = readUUID(body?.widgetID, "ADO_WIDGET_INVALID", "A widget ID is required.");
  const response = await requestJson(
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/dashboard/dashboards/${encodeURIComponent(dashboardID)}/widgets/${encodeURIComponent(widgetID)}?api-version=7.1-preview.2`,
    authorization,
    { method: "DELETE" },
  );
  ensureOk(response, "ADO_WIDGET_DELETE_FAILED", "The dashboard widget could not be deleted.");
  return { body: { dashboardID, project, team, widgetID } };
}

async function requestJson(url, authorization, options = {}) {
  let response;
  try {
    const headers = { Accept: "application/json", Authorization: authorization };
    if (typeof options.ifMatch === "string") headers["If-Match"] = options.ifMatch;
    const request = { headers, signal: AbortSignal.timeout(12_000) };
    if (options.method) request.method = options.method;
    if (options.body !== undefined) {
      headers["Content-Type"] = options.contentType || "application/json";
      request.body = JSON.stringify(options.body);
    }
    response = await fetch(url, {
      ...request,
    });
  } catch (error) {
    throw extensionError(502, "ADO_NETWORK_REQUEST_FAILED", error instanceof Error ? error.message : "Azure DevOps request failed.");
  }

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  return {
    body,
    continuationToken: response.headers.get("x-ms-continuationtoken") || undefined,
    etag: response.headers.get("ETag") || undefined,
    ok: response.ok,
    status: response.status,
  };
}

function readCredentials(body) {
  const organization = readOrganization(body?.organization);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token || token.length > TOKEN_MAX_LENGTH) {
    throw extensionError(400, "ADO_TOKEN_INVALID", "Azure DevOps token is required.");
  }
  return {
    authorization: `Basic ${Buffer.from(`:${token}`, "utf8").toString("base64")}`,
    organization,
    token,
  };
}

function readOrganization(value) {
  const organization = typeof value === "string" ? value.trim() : "";
  if (!ORGANIZATION_PATTERN.test(organization)) {
    throw extensionError(400, "ADO_ORGANIZATION_INVALID", "Azure DevOps organization is invalid.");
  }
  return organization;
}

function extensionSecretKey() {
  const encoded = typeof process.env.EXTENSION_SECRET_KEY === "string" ? process.env.EXTENSION_SECRET_KEY.trim() : "";
  if (!encoded) throw extensionError(503, "ADO_EXTENSION_SECRET_KEY_MISSING", "EXTENSION_SECRET_KEY is required for Azure DevOps credential storage.");

  let key;
  if (/^[0-9a-f]{64}$/i.test(encoded)) {
    key = Buffer.from(encoded, "hex");
  } else {
    try {
      key = Buffer.from(encoded, "base64");
    } catch {
      key = Buffer.alloc(0);
    }
  }
  if (key.length !== 32) throw extensionError(503, "ADO_EXTENSION_SECRET_KEY_INVALID", "EXTENSION_SECRET_KEY must encode exactly 32 bytes.");
  return { encoded, key };
}

function credentialStorePath() {
  const configured = typeof process.env.ADO_CREDENTIAL_STORE_PATH === "string" ? process.env.ADO_CREDENTIAL_STORE_PATH.trim() : "";
  return configured || DEFAULT_CREDENTIAL_STORE_PATH;
}

function legacyCredentialStorePath() {
  const root = typeof process.env.OPENCODE_DATA_ROOT === "string" && process.env.OPENCODE_DATA_ROOT.trim()
    ? process.env.OPENCODE_DATA_ROOT.trim()
    : "/root/.local/share/opencode";
  return join(root, "agent-web", "extension-secrets", "azure-devops-platform.json");
}

async function storeCredential(organization, project, token) {
  extensionSecretKey();
  return enqueueCredentialWrite(async () => {
    const store = await readCredentialStore({ migrate: false });
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", extensionSecretKey().key, iv);
    const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    store.credentials[credentialKey(organization, project)] = {
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      organization,
      project,
    };
    await writeCredentialStore(store);
  });
}

async function readCredential(organization, project) {
  const store = await enqueueCredentialWrite(() => readCredentialStore());
  const entry = store.credentials[credentialKey(organization, project)];
  if (!entry) return undefined;

  try {
    const decipher = createDecipheriv("aes-256-gcm", extensionSecretKey().key, Buffer.from(entry.iv, "base64"));
    decipher.setAuthTag(Buffer.from(entry.authTag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(entry.ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw extensionError(500, "ADO_CREDENTIAL_STORE_INVALID", "The stored Azure DevOps credential could not be decrypted.");
  }
}

async function readCredentialStore({ migrate = true } = {}) {
  const path = credentialStorePath();
  const current = await readCredentialStoreFile(path);
  if (current) return current;

  const legacyPath = legacyCredentialStorePath();
  if (legacyPath === path) return { version: CREDENTIAL_STORE_VERSION, credentials: {} };
  const legacy = await readCredentialStoreFile(legacyPath);
  if (!legacy) return { version: CREDENTIAL_STORE_VERSION, credentials: {} };
  if (!migrate) return legacy;

  // Preserve credentials when deployments move from the shared OpenCode data volume.
  await writeCredentialStore(legacy);
  return legacy;
}

async function readCredentialStoreFile(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (parsed?.version === CREDENTIAL_STORE_VERSION && isRecord(parsed.credentials)) return parsed;
    if (parsed?.version === LEGACY_CREDENTIAL_STORE_VERSION && isRecord(parsed.credentials)) {
      // Organization-only entries cannot be safely assigned to an ADO project.
      return { version: CREDENTIAL_STORE_VERSION, credentials: {} };
    }
    throw new Error("invalid credential store");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    if (error?.message === "invalid credential store" || error instanceof SyntaxError) {
      throw extensionError(500, "ADO_CREDENTIAL_STORE_INVALID", "The Azure DevOps credential store is invalid.");
    }
    throw error;
  }
}

function credentialKey(organization, project) {
  return JSON.stringify([organization.toLowerCase(), project.toLowerCase()]);
}

async function writeCredentialStore(store) {
  const path = credentialStorePath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(store)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
}

function enqueueCredentialWrite(operation) {
  const next = credentialWriteQueue.then(operation, operation);
  credentialWriteQueue = next.then(() => undefined, () => undefined);
  return next;
}

function assertBrokerRequest(request) {
  const supplied = request?.headers?.["x-extension-secret-key"];
  const header = Array.isArray(supplied) ? supplied[0] : supplied;
  const expected = extensionSecretKey().encoded;
  if (header !== expected) throw extensionError(403, "ADO_EXTENSION_BACKEND_FORBIDDEN", "The Azure DevOps Extension backend request is not authorized.");
}

function readContextValue(value, code, label, maxLength = 256) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > maxLength) throw extensionError(400, code, `${label} is required.`);
  return result;
}

function readOptionalWorkItemField(value, field) {
  if (field.validation === "markdown") {
    return readOptionalWorkItemMarkdown(value, field.code, field.label);
  }
  if (field.validation === "string") {
    return readOptionalWorkItemString(value, field.code, field.label, field.maxLength);
  }
  if (field.validation === "priority") return readOptionalWorkItemPriority(value);
  if (field.validation === "severity") return readOptionalWorkItemSeverity(value);
  if (field.validation === "activity") return readOptionalWorkItemActivity(value);
  if (field.validation === "integer") return readOptionalWorkItemNumber(value, field.parameter, true);
  return readOptionalWorkItemNumber(value, field.parameter);
}

function readConfirmedWorkItemField(value, maxLength, token) {
  if (typeof value !== "string"
    || !value.trim()
    || value.length > maxLength
    || /[\u0000-\u001f\u007f]/.test(value)
    || containsAzureDevOpsCredential(value, token)) {
    return undefined;
  }
  return value.trim();
}

function readOptionalWorkItemParentId(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw extensionError(400, "ADO_WORK_ITEM_PARENT_ID_INVALID", "Parent Work Item ID must be a positive 32-bit integer.");
  }
  return value;
}

function readWorkItemId(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw extensionError(400, "ADO_WORK_ITEM_ID_INVALID", "Work Item ID must be a positive 32-bit integer.");
  }
  return value;
}

function readOptionalWorkItemExpectedRev(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw extensionError(400, "ADO_WORK_ITEM_EXPECTED_REV_INVALID", "Expected Work Item revision must be a positive 32-bit integer.");
  }
  return value;
}

function readOptionalWorkItemNumber(value, parameter, integer = false) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0
    || (integer && (!Number.isInteger(value) || value > 100_000))) {
    const message = integer
      ? "Work Item businessValue must be an integer from 0 to 100000."
      : `Work Item ${parameter} must be a finite non-negative number.`;
    throw extensionError(400, "ADO_WORK_ITEM_NUMERIC_FIELD_INVALID", message);
  }
  return value;
}

function readOptionalWorkItemString(value, code, label, maxLength) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw extensionError(400, code, `Work Item ${label} must be non-empty text of at most ${maxLength} characters without control characters.`);
  }
  return value.trim();
}

function readOptionalWorkItemPriority(value) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 100_000) {
    throw extensionError(400, "ADO_WORK_ITEM_PRIORITY_INVALID", "Work Item priority must be an integer between 1 and 100000.");
  }
  return value;
}

function readOptionalWorkItemMarkdown(value, code, label) {
  return readOptionalWorkItemText(value, {
    code,
    invalidMessage: `Work Item ${label} must be non-empty Markdown of at most 100000 characters.`,
    maxLength: 100_000,
    preserveWhitespace: true,
  });
}

function readOptionalWorkItemSeverity(value) {
  return readOptionalWorkItemText(value, {
    code: "ADO_WORK_ITEM_SEVERITY_INVALID",
    invalidMessage: "Work Item severity must be a non-empty value of at most 128 characters without control characters.",
    maxLength: 128,
    rejectControlCharacters: true,
  });
}

function readOptionalWorkItemActivity(value) {
  return readOptionalWorkItemText(value, {
    code: "ADO_WORK_ITEM_ACTIVITY_INVALID",
    invalidMessage: "Work Item activity must be non-empty text of at most 128 characters.",
    maxLength: 128,
    rejectControlCharacters: true,
  });
}

function readOptionalWorkItemText(value, options) {
  if (value === undefined) return undefined;
  const invalidCharacters = typeof value === "string" && (options.rejectControlCharacters
    ? /[\u0000-\u001f\u007f]/.test(value)
    : value.includes("\0"));
  if (typeof value !== "string" || value.length > options.maxLength || !value.trim() || invalidCharacters) {
    throw extensionError(400, options.code, options.invalidMessage);
  }
  return options.preserveWhitespace ? value : value.trim();
}

function encodeAzureDevOpsPathSegment(value) {
  try {
    return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  } catch {
    throw extensionError(400, "ADO_WORK_ITEM_PATH_INVALID", "The Azure DevOps Work Item path contains invalid text.");
  }
}

function readWikiPagePath(value) {
  let path = readContextValue(value, "ADO_WIKI_PAGE_PATH_INVALID", "A Wiki page path is required.", 2_048);
  if (/[\u0000-\u001f\u007f\\]/.test(path)) {
    throw extensionError(400, "ADO_WIKI_PAGE_PATH_INVALID", "The Wiki page path contains unsupported characters.");
  }
  if (!path.startsWith("/")) path = `/${path}`;
  const segments = path.slice(1).split("/");
  if (segments.length > 32 || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw extensionError(400, "ADO_WIKI_PAGE_PATH_INVALID", "The Wiki page path must contain at most 32 non-empty path segments.");
  }
  const lastSegment = segments.at(-1);
  if (lastSegment?.toLowerCase().endsWith(".md")) {
    segments[segments.length - 1] = lastSegment.slice(0, -3);
    if (!segments.at(-1)) throw extensionError(400, "ADO_WIKI_PAGE_PATH_INVALID", "A Wiki page name is required before the .md extension.");
    path = `/${segments.join("/")}`;
  }
  return path;
}

function readWikiName(value) {
  const name = readContextValue(value, "ADO_WIKI_NAME_INVALID", "A Project Wiki name is required.", 128);
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw extensionError(400, "ADO_WIKI_NAME_INVALID", "The Project Wiki name contains unsupported control characters.");
  }
  return name;
}

function readWikiPageContent(value) {
  if (typeof value !== "string" || !value.trim() || value.length > WIKI_CONTENT_MAX_LENGTH || value.includes("\0")) {
    throw extensionError(400, "ADO_WIKI_PAGE_CONTENT_INVALID", "Complete Markdown content is required and must not exceed 100000 characters.");
  }
  return value;
}

function readOptionalWikiComment(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 1_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw extensionError(400, "ADO_WIKI_COMMENT_INVALID", "The Wiki change comment is invalid.");
  }
  const comment = value.trim();
  return comment || undefined;
}

function readRemoteName(value) {
  const remoteName = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(remoteName)) {
    throw extensionError(400, "AZURE_DEVOPS_REMOTE_NAME_INVALID", "The Git remote name is invalid.");
  }
  return remoteName;
}

function readGitBranch(value) {
  const branch = typeof value === "string" ? value.trim() : "";
  if (!branch) throw extensionError(400, "AZURE_DEVOPS_BRANCH_REQUIRED", "A Git branch is required for push.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/.test(branch) || branch.includes("..") || branch.includes("//") || branch.includes("@{") || branch.startsWith("refs/") || branch.endsWith("/") || branch.endsWith(".") || branch.endsWith(".lock")) {
    throw extensionError(400, "AZURE_DEVOPS_BRANCH_INVALID", "The Git branch name is invalid.");
  }
  return branch;
}

function readOptionalGitPullBranch(value) {
  if (value === undefined) return undefined;
  const branch = typeof value === "string" ? value.trim() : "";
  if (!branch || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/.test(branch) || branch.includes("..") || branch.includes("//") || branch.includes("@{") || branch.startsWith("refs/") || branch.endsWith("/") || branch.endsWith(".") || branch.endsWith(".lock")) {
    throw extensionError(400, "AZURE_DEVOPS_BRANCH_INVALID", "The Git pull branch is invalid.");
  }
  return branch;
}

function readOptionalBoolean(value, code) {
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw extensionError(400, code, "The Boolean push parameter is invalid.");
  return value;
}

function readUUID(value, code, message) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw extensionError(400, code, message);
  }
  return result;
}

function readTeamSettingsPatch(value) {
  if (!isRecord(value)) throw extensionError(400, "ADO_TEAM_SETTINGS_INVALID", "Team settings are required.");
  const patch = {};
  if (value.bugsBehavior !== undefined) {
    const bugsBehavior = String(value.bugsBehavior).trim().toLowerCase();
    if (!["off", "astasks", "asrequirements"].includes(bugsBehavior)) {
      throw extensionError(400, "ADO_TEAM_SETTINGS_INVALID", "Bugs behavior is invalid.");
    }
    patch.bugsBehavior = bugsBehavior === "astasks" ? "asTasks" : bugsBehavior === "asrequirements" ? "asRequirements" : "off";
  }
  if (value.workingDays !== undefined) {
    const allowedDays = new Set(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]);
    if (!Array.isArray(value.workingDays) || value.workingDays.length === 0 || value.workingDays.some((day) => !allowedDays.has(String(day).toLowerCase()))) {
      throw extensionError(400, "ADO_TEAM_SETTINGS_INVALID", "Working days are invalid.");
    }
    patch.workingDays = [...new Set(value.workingDays.map((day) => String(day).toLowerCase()))];
  }
  for (const key of ["defaultIteration", "backlogIteration"]) {
    if (value[key] === undefined || value[key] === null || value[key] === "") continue;
    patch[key] = readUUID(value[key], "ADO_ITERATION_INVALID", `${key} must be an iteration ID.`);
  }
  if (value.defaultIterationMacro !== undefined) {
    if (value.defaultIterationMacro !== null && typeof value.defaultIterationMacro !== "string") {
      throw extensionError(400, "ADO_TEAM_SETTINGS_INVALID", "Default iteration macro is invalid.");
    }
    patch.defaultIterationMacro = value.defaultIterationMacro === null ? null : value.defaultIterationMacro.trim().slice(0, 256);
  }
  if (value.backlogVisibilities !== undefined) {
    if (!isRecord(value.backlogVisibilities)) throw extensionError(400, "ADO_TEAM_SETTINGS_INVALID", "Backlog visibility settings are invalid.");
    patch.backlogVisibilities = Object.fromEntries(Object.entries(value.backlogVisibilities).filter(([key, item]) => /^[A-Za-z0-9_.-]{1,128}$/.test(key) && typeof item === "boolean"));
  }
  if (Object.keys(patch).length === 0) throw extensionError(400, "ADO_TEAM_SETTINGS_INVALID", "At least one team setting is required.");
  return patch;
}

function readWidget(value, partial = false) {
  if (!isRecord(value)) throw extensionError(400, "ADO_WIDGET_INVALID", "Widget configuration is required.");
  const widget = {};
  if (typeof value.name === "string") widget.name = value.name.trim().slice(0, 128);
  if (typeof value.contributionId === "string") widget.contributionId = value.contributionId.trim().slice(0, 256);
  if (typeof value.settings === "string") widget.settings = value.settings.slice(0, 50_000);
  if (isRecord(value.position)) widget.position = readWidgetSize(value.position, "position");
  if (isRecord(value.size)) widget.size = readWidgetSize(value.size, "size");
  if (isRecord(value.settingsVersion)) {
    widget.settingsVersion = {
      major: readInteger(value.settingsVersion.major, 0, 99),
      minor: readInteger(value.settingsVersion.minor, 0, 99),
      patch: readInteger(value.settingsVersion.patch, 0, 99),
    };
  }
  if (!partial && (!widget.name || !widget.contributionId || !widget.position || !widget.size)) {
    throw extensionError(400, "ADO_WIDGET_INVALID", "A widget needs name, contributionId, position, and size.");
  }
  if (Object.keys(widget).length === 0) throw extensionError(400, "ADO_WIDGET_INVALID", "Widget configuration is empty.");
  return widget;
}

function readBoardColumns(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw extensionError(400, "ADO_BOARD_COLUMNS_INVALID", "A board must contain between 1 and 50 columns.");
  }
  return value.map((item) => {
    if (!isRecord(item)) throw extensionError(400, "ADO_BOARD_COLUMNS_INVALID", "Board column configuration is invalid.");
    const name = readContextValue(item.name, "ADO_BOARD_COLUMNS_INVALID", "A board column name is required.", 128);
    const column = {
      ...(typeof item.id === "string" ? { id: item.id } : {}),
      columnType: ["incoming", "inProgress", "outgoing"].includes(item.columnType) ? item.columnType : "inProgress",
      description: typeof item.description === "string" ? item.description.slice(0, 512) : "",
      isSplit: item.isSplit === true,
      itemLimit: readInteger(item.itemLimit ?? 0, 0, 1000),
      name,
    };
    if (isRecord(item.stateMappings)) column.stateMappings = Object.fromEntries(Object.entries(item.stateMappings).filter(([key, mapped]) => typeof key === "string" && typeof mapped === "string").slice(0, 50));
    return column;
  });
}

function readWidgetSize(value, label) {
  if (label === "position") {
    return {
      column: readInteger(value.column, 0, 100),
      row: readInteger(value.row, 0, 100),
    };
  }
  return {
    columnSpan: readInteger(value.columnSpan, 1, 100),
    rowSpan: readInteger(value.rowSpan, 1, 100),
  };
}

function readInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw extensionError(400, "ADO_WIDGET_INVALID", "Widget layout values are invalid.");
  return number;
}

function ensureOk(response, code, message) {
  if (response?.ok) return;
  const status = Number.isInteger(response?.status) && response.status >= 400 && response.status <= 599 ? response.status : 502;
  const details = summarizeAzureDevOpsError(response?.body, status);
  const diagnostics = [
    `Azure DevOps HTTP ${status}`,
    ...(details.upstreamCode ? [`code ${details.upstreamCode}`] : []),
    ...(details.upstreamMessage ? [details.upstreamMessage] : []),
    ...(details.upstreamInnerMessage ? [`inner error: ${details.upstreamInnerMessage}`] : []),
  ].join("; ");
  throw extensionError(status, code, `${message} (${diagnostics})`, details);
}

function ensureAzureDevOpsWorkItemResponseOk(response, token, operation, expectedRev) {
  const isUpdate = operation === "update";
  const operationLabel = isUpdate ? "update" : "creation";
  const operationVerb = isUpdate ? "updating" : "creating";
  const operationCode = isUpdate ? "UPDATE" : "CREATE";
  if (response?.ok) return;
  const status = Number.isInteger(response?.status) && response.status >= 400 && response.status <= 599 ? response.status : 502;
  const error = isRecord(response?.body?.error) ? response.body.error : isRecord(response?.body) ? response.body : {};
  if (isUpdate && expectedRev !== undefined && (status === 400 || status === 409)
    && (error.typeKey === "JsonPatchTestOperationFailedException" || error.typeKey === "WorkItemRevisionMismatchException")) {
    throw extensionError(
      409,
      "ADO_WORK_ITEM_REVISION_CONFLICT",
      "The Work Item changed after it was read. Reread the Work Item and its revision history, review the changes, then decide whether to submit a new update.",
      { upstreamStatus: status },
    );
  }
  const rawCode = [error.typeKey, error.errorCode, error.code]
    .find((candidate) => typeof candidate === "string" && candidate.trim());
  const encodedCredential = Buffer.from(`:${token}`, "utf8").toString("base64");
  const candidate = typeof rawCode === "string"
    ? safeAzureErrorText(rawCode).split(token).join("[REDACTED]").split(encodedCredential).join("[REDACTED]")
    : undefined;
  const upstreamCode = candidate && /^[A-Za-z0-9_.-]{1,100}$/.test(candidate) ? candidate : undefined;
  if (status >= 500) {
    throw extensionError(
      status,
      `ADO_WORK_ITEM_${operationCode}_OUTCOME_UNKNOWN`,
      `Azure DevOps returned HTTP ${status} while ${operationVerb} the Work Item. Check the project before retrying.`,
      { upstreamStatus: status, ...(upstreamCode ? { upstreamCode } : {}) },
    );
  }
  throw extensionError(
    status,
    `ADO_WORK_ITEM_${operationCode}_FAILED`,
    `Azure DevOps Work Item ${operationLabel} failed (HTTP ${status}${upstreamCode ? `, ${upstreamCode}` : ""}).`,
    { upstreamStatus: status, ...(upstreamCode ? { upstreamCode } : {}) },
  );
}

function ensureWikiOk(response, code, message) {
  if (response?.ok) return;
  const status = Number.isInteger(response?.status) && response.status >= 400 && response.status <= 599 ? response.status : 502;
  const typeKey = response?.body?.typeKey;
  if (typeKey === "WikiAncestorPageNotFoundException") {
    throw extensionError(status, "ADO_WIKI_ANCESTOR_PAGE_NOT_FOUND", "A parent Wiki page is missing and could not be created.", {
      upstreamStatus: status,
      upstreamType: typeKey,
    });
  }
  if (typeKey === "GitRepositoryNotFoundException") {
    throw extensionError(status, "ADO_WIKI_NOT_FOUND_OR_UNAVAILABLE", "The Wiki backing repository was not found or is not accessible.", {
      upstreamStatus: status,
      upstreamType: typeKey,
    });
  }
  const safeType = typeof typeKey === "string" ? safeAzureErrorText(typeKey) : undefined;
  throw extensionError(status, code, `${message} (Azure DevOps HTTP ${status}${safeType ? `, ${safeType}` : ""})`, {
    upstreamStatus: status,
    ...(safeType ? { upstreamType: safeType } : {}),
  });
}

function summarizeAzureDevOpsError(value, status) {
  const error = isRecord(value?.error) ? value.error : isRecord(value) ? value : {};
  const upstreamCode = [error.typeKey, error.errorCode, error.code]
    .find((candidate) => typeof candidate === "string" && candidate.trim());
  const innerException = isRecord(error.innerException) ? error.innerException : undefined;
  const innerInnerException = isRecord(innerException?.innerException) ? innerException.innerException : undefined;
  return {
    upstreamStatus: status,
    ...(typeof upstreamCode === "string" ? { upstreamCode: safeAzureErrorText(upstreamCode) } : {}),
    ...(typeof error.message === "string" ? { upstreamMessage: safeAzureErrorText(error.message) } : {}),
    ...(typeof innerException?.message === "string"
      ? { upstreamInnerMessage: safeAzureErrorText(innerException.message) }
      : typeof innerInnerException?.message === "string"
        ? { upstreamInnerMessage: safeAzureErrorText(innerInnerException.message) }
        : {}),
  };
}

function safeAzureErrorText(value) {
  return value
    .replace(/((?:authorization\s*:\s*)?(?:basic|bearer)\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/((?:access[_-]?token|refresh[_-]?token|token|pat|secret|password)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 1_000);
}

function publicProjects(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return [];
    return [{
      id: item.id,
      name: item.name,
      ...(typeof item.description === "string" ? { description: item.description } : {}),
      ...(typeof item.state === "string" ? { state: item.state } : {}),
      ...(typeof item.visibility === "string" ? { visibility: item.visibility } : {}),
    }];
  });
}

function publicWikis(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return [];
    return [{
      id: item.id,
      name: item.name,
      ...(typeof item.type === "string" ? { type: item.type } : {}),
      ...(typeof item.repositoryId === "string" ? { repositoryId: item.repositoryId } : {}),
      ...(typeof item.mappedPath === "string" ? { mappedPath: item.mappedPath } : {}),
      ...(typeof item.remoteUrl === "string" ? { remoteUrl: item.remoteUrl } : {}),
    }];
  });
}

function publicTeams(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return [];
    return [{
      id: item.id,
      name: item.name,
      ...(typeof item.description === "string" ? { description: item.description } : {}),
      ...(typeof item.projectId === "string" ? { projectId: item.projectId } : {}),
    }];
  });
}

function publicTeamMembers(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const identity = isRecord(item?.identity) ? item.identity : item;
    if (!isRecord(identity) || typeof identity.id !== "string") return [];
    return [{
      id: identity.id,
      ...(typeof identity.displayName === "string" ? { displayName: identity.displayName } : {}),
      ...(typeof identity.uniqueName === "string" ? { uniqueName: identity.uniqueName } : {}),
      ...(typeof identity.mail === "string" ? { mail: identity.mail } : {}),
    }];
  });
}

function publicTeamSettings(value) {
  if (!isRecord(value)) return {};
  return {
    ...(typeof value.bugsBehavior === "string" ? { bugsBehavior: value.bugsBehavior } : {}),
    ...(isRecord(value.backlogVisibilities) ? { backlogVisibilities: value.backlogVisibilities } : {}),
    ...(isRecord(value.backlogIteration) ? { backlogIteration: publicIteration(value.backlogIteration) } : {}),
    ...(isRecord(value.defaultIteration) ? { defaultIteration: publicIteration(value.defaultIteration) } : {}),
    ...(typeof value.defaultIterationMacro === "string" ? { defaultIterationMacro: value.defaultIterationMacro } : { defaultIterationMacro: null }),
    ...(Array.isArray(value.workingDays) ? { workingDays: value.workingDays.filter((day) => typeof day === "string") } : {}),
  };
}

function publicTeamFieldValues(value) {
  if (!isRecord(value)) return undefined;
  return {
    ...(typeof value.defaultValue === "string" ? { defaultValue: value.defaultValue } : {}),
    ...(isRecord(value.field) && typeof value.field.referenceName === "string" ? { field: { referenceName: value.field.referenceName } } : {}),
    values: Array.isArray(value.values) ? value.values.flatMap((item) => isRecord(item) && typeof item.value === "string" ? [{ value: item.value, includeChildren: item.includeChildren === true }] : []) : [],
  };
}

function publicIterations(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const iteration = publicIteration(item);
    return iteration?.id ? [iteration] : [];
  });
}

function publicIteration(value) {
  if (!isRecord(value) || typeof value.id !== "string") return undefined;
  return {
    id: value.id,
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    ...(typeof value.path === "string" ? { path: value.path } : {}),
    ...(isRecord(value.attributes) ? { attributes: {
      ...(typeof value.attributes.startDate === "string" ? { startDate: value.attributes.startDate } : {}),
      ...(typeof value.attributes.finishDate === "string" ? { finishDate: value.attributes.finishDate } : {}),
      ...(typeof value.attributes.timeFrame === "string" ? { timeFrame: value.attributes.timeFrame } : {}),
    } } : {}),
  };
}

function publicBoards(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return [];
    return [{ id: item.id, name: item.name, ...(typeof item.url === "string" ? { url: item.url } : {}) }];
  });
}

function publicBoardColumns(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.name !== "string") return [];
    return [{
      ...(typeof item.id === "string" ? { id: item.id } : {}),
      ...(typeof item.columnType === "string" ? { columnType: item.columnType } : {}),
      ...(typeof item.description === "string" ? { description: item.description } : {}),
      ...(typeof item.isSplit === "boolean" ? { isSplit: item.isSplit } : {}),
      ...(Number.isInteger(item.itemLimit) ? { itemLimit: item.itemLimit } : {}),
      name: item.name,
      ...(isRecord(item.stateMappings) ? { stateMappings: item.stateMappings } : {}),
    }];
  });
}

function flattenClassificationNodes(value) {
  const nodes = [];
  const visit = (node, parentPath = "") => {
    if (!isRecord(node) || typeof node.name !== "string") return;
    const path = typeof node.path === "string" && node.path ? node.path : [parentPath, node.name].filter(Boolean).join("\\");
    nodes.push({
      ...(typeof node.identifier === "string" ? { id: node.identifier } : {}),
      name: node.name,
      path,
      ...(typeof node.hasChildren === "boolean" ? { hasChildren: node.hasChildren } : {}),
      ...(isRecord(node.attributes) ? { attributes: node.attributes } : {}),
    });
    if (Array.isArray(node.children)) node.children.forEach((child) => visit(child, path));
  };
  visit(value);
  return nodes;
}

function publicDashboards(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const dashboard = publicDashboard(item);
    return dashboard?.id ? [dashboard] : [];
  });
}

function publicDashboard(value) {
  if (!isRecord(value) || typeof value.id !== "string") return undefined;
  return {
    id: value.id,
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(typeof value.eTag === "string" ? { eTag: value.eTag } : {}),
    ...(typeof value.dashboardScope === "string" ? { dashboardScope: value.dashboardScope } : {}),
    widgets: Array.isArray(value.widgets) ? value.widgets.flatMap((widget) => {
      const item = publicWidget(widget);
      return item?.id ? [item] : [];
    }) : [],
  };
}

function publicWikiPage(value, fallbackPath) {
  if (!isRecord(value)) {
    throw extensionError(502, "ADO_WIKI_PAGE_RESPONSE_INVALID", "Azure DevOps returned invalid Wiki page metadata.");
  }
  return {
    ...(Number.isInteger(value.id) ? { id: value.id } : {}),
    path: typeof value.path === "string" ? value.path : fallbackPath,
    ...(typeof value.gitItemPath === "string" ? { gitItemPath: value.gitItemPath } : {}),
    ...(typeof value.url === "string" ? { url: value.url } : {}),
    ...(typeof value.remoteUrl === "string" ? { remoteUrl: value.remoteUrl } : {}),
    ...(typeof value.isParentPage === "boolean" ? { isParentPage: value.isParentPage } : {}),
    ...(Number.isInteger(value.order) ? { order: value.order } : {}),
  };
}

function publicWidget(value) {
  if (!isRecord(value) || typeof value.id !== "string") return undefined;
  return {
    id: value.id,
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    ...(typeof value.contributionId === "string" ? { contributionId: value.contributionId } : {}),
    ...(typeof value.eTag === "string" ? { eTag: value.eTag } : {}),
    ...(typeof value.settings === "string" ? { settings: value.settings } : {}),
    ...(isRecord(value.position) ? { position: value.position } : {}),
    ...(isRecord(value.size) ? { size: value.size } : {}),
  };
}

function uniqueByID(values) {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

function omitUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publicProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return {
    ...(typeof value.id === "string" ? { id: value.id } : {}),
    ...(typeof value.displayName === "string" ? { displayName: value.displayName } : {}),
    ...(typeof value.emailAddress === "string" ? { emailAddress: value.emailAddress } : {}),
  };
}

function isAnonymousIdentity(value) {
  return !value || typeof value !== "object" || Array.isArray(value)
    || value.providerDisplayName === "Anonymous"
    || value.customDisplayName === "Anonymous"
    || value.descriptor === "System:PublicAccess;aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
}

function extensionError(statusCode, code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (details !== undefined) error.details = details;
  return error;
}
