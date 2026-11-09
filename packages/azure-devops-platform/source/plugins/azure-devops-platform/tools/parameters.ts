import { DESTINATION_MAX_LENGTH, GIT_REF_MAX_LENGTH, UUID_PATTERN } from "./validation.ts";

type JsonSchema = Record<string, unknown>;
type AzureDevOpsToolInputSet = Record<string, JsonSchema>;

const PIPELINE_YAML_PATH_PATTERN = /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)(?!.*[\\\u0000-\u001f\u007f]).+\.ya?ml$/i;

function stringSchema(options: {
  description?: string;
  enum?: readonly string[];
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
} = {}): JsonSchema {
  return {
    type: "string",
    ...(options.minLength === undefined ? {} : { minLength: options.minLength }),
    ...(options.maxLength === undefined ? {} : { maxLength: options.maxLength }),
    ...(options.pattern === undefined ? {} : { pattern: options.pattern.source }),
    ...(options.enum === undefined ? {} : { enum: [...options.enum] }),
    ...(options.description === undefined ? {} : { description: options.description }),
  };
}

function numberSchema(options: {
  description?: string;
  integer?: boolean;
  minimum?: number;
  maximum?: number;
} = {}): JsonSchema {
  return {
    type: options.integer ? "integer" : "number",
    ...(options.minimum === undefined ? {} : { minimum: options.minimum }),
    ...(options.maximum === undefined ? {} : { maximum: options.maximum }),
    ...(options.description === undefined ? {} : { description: options.description }),
  };
}

function booleanSchema(description?: string): JsonSchema {
  return { type: "boolean", ...(description === undefined ? {} : { description }) };
}

function objectSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return { type: "object", properties, required, additionalProperties: false };
}

const project = stringSchema({ minLength: 1, maxLength: 80, description: "Optional project policy value." });
const configureRemoteRepositoryPath = stringSchema({ minLength: 1, maxLength: DESTINATION_MAX_LENGTH, description: "Optional cloned repository path under repository/, such as repository/solo-block-stacker. When provided, configure the remote in that nested checkout instead of the current worktree." });
const repositoryPath = stringSchema({ minLength: 1, maxLength: DESTINATION_MAX_LENGTH, description: "Required for every push; use repository/<name> from azure_devops_clone_repository. If the Project UI pins a fixed path, provide that same path." });
const pullRepositoryPath = stringSchema({ minLength: 1, maxLength: DESTINATION_MAX_LENGTH, description: "Required for every pull; use repository/<name> from azure_devops_clone_repository." });
const repositoryName = stringSchema({ minLength: 1, maxLength: 128, description: "The repository name resolved by the backend." });
const repositoryReference = stringSchema({ minLength: 1, maxLength: 300, description: "A verified Azure DevOps repository reference." });
const repositoryID = stringSchema({ pattern: UUID_PATTERN, description: "A verified Azure DevOps repository ID." });
const sourceRefName = stringSchema({ minLength: 11, maxLength: 255, pattern: /^refs\/heads\/.+$/, description: "Required full source branch ref, such as refs/heads/feature/change." });
const targetRefName = stringSchema({ minLength: 11, maxLength: 255, pattern: /^refs\/heads\/.+$/, description: "Required full target branch ref, such as refs/heads/main." });
const pullRequestListSourceRefName = stringSchema({ minLength: 11, maxLength: 255, pattern: /^refs\/heads\/.+$/, description: "Optional full source branch ref filter, such as refs/heads/feature/change." });
const pullRequestListTargetRefName = stringSchema({ minLength: 11, maxLength: 255, pattern: /^refs\/heads\/.+$/, description: "Optional full target branch ref filter, such as refs/heads/main." });
const pullRequestStatus = stringSchema({ minLength: 1, maxLength: 16, enum: ["active", "abandoned", "completed", "all"], description: "Optional Azure DevOps PR status filter: active, abandoned, completed, or all. Defaults to active." });
const pullRequestTop = numberSchema({ integer: true, minimum: 1, maximum: 100, description: "Optional page size from 1 to 100; defaults to 50." });
const pullRequestSkip = numberSchema({ integer: true, minimum: 0, maximum: 2_147_483_647, description: "Optional number of PRs to skip; defaults to 0." });
const reviewerIds: JsonSchema = { type: "array", items: stringSchema({ pattern: UUID_PATTERN }), maxItems: 50, description: "Optional list of at most 50 Azure DevOps reviewer identity UUIDs." };
const workItemIds: JsonSchema = { type: "array", items: numberSchema({ integer: true, minimum: 1, maximum: 2_147_483_647 }), maxItems: 50, description: "Optional list of at most 50 positive 32-bit Azure DevOps Work Item IDs." };
const labels: JsonSchema = { type: "array", items: stringSchema({ minLength: 1, maxLength: 128, pattern: /\S/ }), maxItems: 50, description: "Optional list of at most 50 non-empty pull request labels, each at most 128 characters." };
const remoteName = stringSchema({ minLength: 1, maxLength: 128, description: "The local Git remote name." });
const pipelineID = numberSchema({ integer: true, minimum: 1, maximum: 2_147_483_647, description: "Azure DevOps Pipeline ID resolved by the current project policy." });
const branchRef = stringSchema({ minLength: 11, maxLength: 255, pattern: /^refs\/heads\/.+$/, description: "Optional full Git branch ref, such as refs/heads/main." });
const templateParameters: JsonSchema = {
  type: "object",
  propertyNames: { pattern: "^[A-Za-z_][A-Za-z0-9_.-]{0,63}$" },
  additionalProperties: { anyOf: [stringSchema({ maxLength: 1_000 }), { type: "number" }, { type: "boolean" }] },
  description: "Optional bounded scalar template parameters; secret-shaped names/values and nested values are rejected by project policy.",
};
const runID = numberSchema({ integer: true, minimum: 1, maximum: 2_147_483_647, description: "Azure DevOps Pipeline run ID resolved by the current project policy." });
const expectedRev = numberSchema({ integer: true, minimum: 1, maximum: 2_147_483_647, description: "Optional positive 32-bit revision returned by azure_devops_get_work_item. On a revision conflict, reread the Work Item and its revision history before deciding whether to submit a new update." });
const repositoryIdentity = { repositoryReference, repositoryID, repositoryName };

const workItemMutableFields = {
  workItemType: stringSchema({ minLength: 1, maxLength: 128, description: "Optional replacement Work Item type; the selected Project process validates the type change." }),
  title: stringSchema({ minLength: 1, maxLength: 255, description: "Optional replacement Work Item title." }),
  description: stringSchema({ minLength: 1, maxLength: 100_000, description: "Optional raw Markdown description; Azure DevOps stores this field as Markdown." }),
  areaPath: stringSchema({ minLength: 1, maxLength: 2_048, description: "Optional Azure DevOps Area Path; the selected project process validates the path." }),
  iterationPath: stringSchema({ minLength: 1, maxLength: 2_048, description: "Optional Azure DevOps Iteration Path; the selected project process validates the path." }),
  assignedTo: stringSchema({ minLength: 1, maxLength: 512, description: "Optional Azure DevOps identity to assign the Work Item to." }),
  priority: numberSchema({ integer: true, minimum: 1, maximum: 100_000, description: "Optional integer Work Item priority; Azure DevOps validates the configured process value." }),
  tags: stringSchema({ minLength: 1, maxLength: 4_000, description: "Optional Azure DevOps tags as a semicolon-separated string." }),
  state: stringSchema({ minLength: 1, maxLength: 128, description: "Optional Azure DevOps System.State value; the selected project process validates the state." }),
  reproSteps: stringSchema({ minLength: 1, maxLength: 100_000, description: "Optional raw Markdown reproduction steps; Azure DevOps stores this field as Markdown." }),
  systemInfo: stringSchema({ minLength: 1, maxLength: 100_000, description: "Optional raw Markdown system information; Azure DevOps stores this field as Markdown." }),
  severity: stringSchema({ minLength: 1, maxLength: 128, description: "Optional Work Item severity, validated against the Azure DevOps Project process." }),
  acceptanceCriteria: stringSchema({ minLength: 1, maxLength: 100_000, description: "Optional raw Markdown acceptance criteria; Azure DevOps stores this field as Markdown." }),
  originalEstimate: numberSchema({ minimum: 0, description: "Optional non-negative decimal Original Estimate in Microsoft.VSTS.Scheduling.OriginalEstimate." }),
  remainingWork: numberSchema({ minimum: 0, description: "Optional non-negative decimal Remaining Work in Microsoft.VSTS.Scheduling.RemainingWork." }),
  completedWork: numberSchema({ minimum: 0, description: "Optional non-negative decimal Completed Work in Microsoft.VSTS.Scheduling.CompletedWork." }),
  activity: stringSchema({ minLength: 1, maxLength: 128, description: "Optional Activity picklist value in Microsoft.VSTS.Common.Activity." }),
  storyPoints: numberSchema({ minimum: 0, description: "Optional non-negative decimal Story Points in Microsoft.VSTS.Scheduling.StoryPoints." }),
  effort: numberSchema({ minimum: 0, description: "Optional non-negative decimal Effort in Microsoft.VSTS.Scheduling.Effort." }),
  size: numberSchema({ minimum: 0, description: "Optional non-negative decimal Size in Microsoft.VSTS.Scheduling.Size." }),
  businessValue: numberSchema({ integer: true, minimum: 0, maximum: 100_000, description: "Optional integer Business Value in Microsoft.VSTS.Common.BusinessValue." }),
};

export function createAzureDevOpsToolInputSchemas(): AzureDevOpsToolInputSet {
  return {
    createRepository: objectSchema({ project, repositoryName }),
    createPipeline: objectSchema({
      project, repositoryReference, repositoryID, repositoryName,
      name: stringSchema({ minLength: 1, maxLength: 128, description: "Pipeline name, resolved through the current project policy." }),
      yamlPath: stringSchema({ minLength: 1, maxLength: 1_024, description: "Repository-relative .yml or .yaml file already present on the Repository default branch." }),
      folder: stringSchema({ minLength: 1, maxLength: 512, description: "Optional Azure DevOps Pipeline folder, such as \\Build\\CI." }),
    }),
    createPullRequest: objectSchema({
      project, ...repositoryIdentity, sourceRefName, targetRefName,
      title: stringSchema({ minLength: 1, maxLength: 255, description: "Required title for the new Azure DevOps pull request." }),
      description: stringSchema({ maxLength: 100_000, description: "Optional pull request description, limited to 100,000 characters." }),
      isDraft: booleanSchema("Create the pull request as a draft when true."), reviewerIds, workItemIds, labels,
      supportsIterations: booleanSchema("Whether the pull request supports iterations."),
    }),
    getPullRequest: objectSchema({
      project,
      pullRequestId: numberSchema({ integer: true, minimum: 1, maximum: 2_147_483_647, description: "Required positive 32-bit Azure DevOps pull request ID in the selected project." }),
      commitTop: numberSchema({ integer: true, minimum: 1, maximum: 100, description: "Optional commit page size from 1 to 100; defaults to 50." }),
      commitContinuationToken: stringSchema({ minLength: 1, maxLength: 2_000, description: "Optional continuation token returned by the previous pull request commit page." }),
    }),
    listPullRequests: objectSchema({
      project, ...repositoryIdentity,
      sourceRefName: pullRequestListSourceRefName, targetRefName: pullRequestListTargetRefName,
      status: pullRequestStatus, top: pullRequestTop, skip: pullRequestSkip,
    }),
    createWorkItem: objectSchema({
      project,
      workItemType: stringSchema({ minLength: 1, maxLength: 128, description: "Work Item type resolved from the current project policy." }),
      title: stringSchema({ minLength: 1, maxLength: 255, description: "Work Item title resolved from the current project policy." }),
      description: workItemMutableFields.description,
      parentId: numberSchema({ integer: true, minimum: 1, maximum: 2_147_483_647, description: "Optional positive Parent Work Item ID for a parent-child relation in the current Azure DevOps project." }),
      ...Object.fromEntries(Object.entries(workItemMutableFields).filter(([name]) => name !== "description")),
    }),
    getWorkItem: objectSchema({
      project, workItemId: numberSchema({ integer: true, minimum: 1, maximum: 2_147_483_647, description: "Required positive 32-bit ID of the Azure DevOps Work Item to read." }),
    }),
    listWorkItemRevisions: objectSchema({
      project,
      workItemId: numberSchema({ integer: true, minimum: 1, maximum: 2_147_483_647, description: "Required positive 32-bit ID of the Azure DevOps Work Item whose revision history is read." }),
      top: numberSchema({ integer: true, minimum: 1, maximum: 20, description: "Optional page size from 1 to 20; defaults to 10." }),
      skip: numberSchema({ integer: true, minimum: 0, maximum: 2_147_483_647, description: "Optional revision offset from 0 to 2147483647; defaults to 0." }),
    }),
    updateWorkItem: objectSchema({
      project,
      workItemId: numberSchema({ integer: true, minimum: 1, maximum: 2_147_483_647, description: "Required ID of the existing Azure DevOps Work Item to update." }),
      expectedRev, ...workItemMutableFields,
    }),
    configureRemote: objectSchema({
      project, ...repositoryIdentity, repositoryPath: configureRemoteRepositoryPath, remoteName,
      updateExisting: booleanSchema("Explicitly allow replacing an existing remote URL."),
    }),
    cloneRepository: objectSchema({
      project, ...repositoryIdentity,
      branch: stringSchema({ minLength: 1, maxLength: GIT_REF_MAX_LENGTH, description: "The branch or tag to check out." }),
      ref: stringSchema({ minLength: 1, maxLength: GIT_REF_MAX_LENGTH, description: "The verified Git ref to check out." }),
      depth: numberSchema({ integer: true, minimum: 1, maximum: 100_000, description: "Optional shallow clone depth." }),
      destination: stringSchema({ minLength: 1, maxLength: DESTINATION_MAX_LENGTH, description: "A single relative destination segment under the current project's repository/ directory; nested paths containing '/' or '\\' are not allowed." }),
    }),
    gitConfig: objectSchema({
      repositoryPath: stringSchema({ minLength: 1, maxLength: DESTINATION_MAX_LENGTH, description: "Optional repository/<name> checkout under the current project. If omitted, configure the current Git worktree." }),
    }),
    listRepositories: objectSchema({ project }),
    listPipelines: objectSchema({
      project, continuationToken: stringSchema({ minLength: 1, maxLength: 2_000, description: "Optional Azure DevOps REST continuation token returned by the previous page." }),
    }),
    pull: objectSchema({ project, repositoryPath: pullRepositoryPath, remoteName, branch: stringSchema({ minLength: 1, maxLength: 255, description: "Optional remote branch. If omitted, Git uses the selected local branch's configured upstream." }) }, ["repositoryPath"]),
    push: objectSchema({
      project, repositoryPath, remoteName,
      branch: stringSchema({ minLength: 1, maxLength: 255, description: "The local branch to push; policy may require or derive it." }),
      setUpstream: booleanSchema("Explicitly set the remote tracking branch for this push."),
    }, ["repositoryPath"]),
    listWikis: objectSchema({ project }),
    pipelinePreview: objectSchema({ project, pipelineId: pipelineID, branchRef, templateParameters }),
    pipelineRun: objectSchema({ project, pipelineId: pipelineID, branchRef, templateParameters }),
    getPipelineRun: objectSchema({ project, pipelineId: pipelineID, runId: runID }),
    writeWikiPage: objectSchema({
      project,
      wikiIdentifier: stringSchema({ minLength: 1, maxLength: 256, description: "Optional Wiki ID or name from azure_devops_list_wikis. By default, the UI-synchronized Wiki ID is used and this input is ignored in derived policy; set Agent or fixed policy to override the source." }),
      path: stringSchema({ minLength: 1, maxLength: 2_048, description: "Wiki page path, such as /Getting-Started/Setup. A trailing .md backing-file extension is accepted and removed; missing parent pages are created as empty pages. The project policy may provide a fixed value." }),
      content: stringSchema({ minLength: 1, maxLength: 100_000, description: "Complete Markdown page content. Writing replaces the entire existing page; the project policy may provide fixed multiline content." }),
      comment: stringSchema({ minLength: 1, maxLength: 1_000, description: "Optional comment associated with the wiki page change." }),
    }),
    publishPipelineYaml: objectSchema({
      project,
      repositoryReference: stringSchema({ minLength: 1, maxLength: 300, description: "A verified Azure DevOps repository reference in the current organization and project." }),
      repositoryID: stringSchema({ pattern: UUID_PATTERN, description: "The verified Azure DevOps repository ID, such as the ID returned by azure_devops_list_repositories." }),
      repositoryName: stringSchema({ minLength: 1, maxLength: 128, description: "The Azure DevOps repository name in the current project." }),
      path: stringSchema({ minLength: 1, maxLength: 1_024, pattern: PIPELINE_YAML_PATH_PATTERN, description: "Repository-relative .yml or .yaml path. Absolute paths, parent traversal, backslashes, and control characters are rejected." }),
      yamlContent: stringSchema({ minLength: 1, maxLength: 100_000, pattern: /\S/, description: "Required complete YAML file content for this call, limited to 100000 characters. The content is never returned or saved in Project Context." }),
    }, ["yamlContent"]),
  };
}
