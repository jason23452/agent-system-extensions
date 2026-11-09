import { basename, dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Plugin, Skill } from "@opencode/plugin";
import { currentOpenCodeProject, currentWorktree } from "./agent/context.ts";
import { AZURE_DEVOPS_PLUGIN_AGENT_PARAMETERS } from "./agent/parameters.ts";
import {
  callRepositoryBackend,
  readGitCredentialResponse,
  readPullPlanResponse,
  readPullResponse,
  readPushPlanResponse,
  readPushResponse,
  readRepositoryOperationPlan,
  readRepositoryResponse,
} from "./backend-client/client.ts";
import {
  AZURE_DEVOPS_GIT_CREDENTIAL_CACHE_TTL_MS,
  cacheAzureDevOpsGitCredential,
  getCachedAzureDevOpsCredential,
} from "./tools/credential-cache.ts";
import { cloneAzureDevOpsRepository } from "./tools/clone.ts";
import {
  configureAzureDevOpsGitCredentialHelper,
  configureAzureDevOpsGitIdentity,
  createAzureDevOpsGitOperations,
  createAzureDevOpsGitProcess,
} from "./tools/git.ts";
import { pullAzureDevOpsWorktree } from "./tools/pull.ts";
import { readAzureDevOpsWikiListResponse, readAzureDevOpsWikiWriteResponse } from "./tools/wiki.ts";
import { readAzureDevOpsWorkItemDetailsResponse } from "./tools/work-item-details.ts";
import { readAzureDevOpsWorkItemRevisionsResponse } from "./tools/work-item-revisions.ts";
import { readAzureDevOpsWorkItemCreateResponse, readAzureDevOpsWorkItemUpdateResponse } from "./tools/work-item.ts";
import { readAzureDevOpsPullRequestCreateResponse } from "./tools/pull-request.ts";
import { readAzureDevOpsPullRequestDetailsResponse } from "./tools/pull-request-get.ts";
import { readAzureDevOpsPullRequestListResponse } from "./tools/pull-request-list.ts";
import { readAzureDevOpsPipelineYamlPublishResponse } from "./tools/pipeline-yaml.ts";
import { readAzureDevOpsRepositoryListResponse } from "./tools/repository-list.ts";
import {
  readAzureDevOpsPipelineCreateResponse,
  readAzureDevOpsPipelineListResponse,
  readAzureDevOpsPipelinePreviewResponse,
  readAzureDevOpsPipelineRunResponse,
  readAzureDevOpsPipelineRunStatusResponse,
} from "./tools/pipeline.ts";
import {
  configureAzureDevOpsRemote,
  pushAzureDevOpsWorktree,
} from "./tools/repository.ts";
import { createAzureDevOpsToolInputSchemas } from "./tools/parameters.ts";
import {
  resolveAzureDevOpsRepositoryPath,
  resolveAzureDevOpsConfigureRemoteTarget,
  resolveAzureDevOpsPushRepositoryPath,
} from "./tools/repository-path.ts";
import {
  assertPushInput,
  assertPullInput,
  omitUndefined,
  pluginError,
  readAzureDevOpsRepositoryPath,
  sanitizePushDerivedValues,
  validateAzureDevOpsRemoteUrl,
} from "./tools/validation.ts";

const AZURE_DEVOPS_PIPELINE_SKILL_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "skills",
  "minimal-api-service-cloud-run-pipeline",
);

type AzureDevOpsPlatformTestSeams = {
  agentParameters: typeof AZURE_DEVOPS_PLUGIN_AGENT_PARAMETERS;
  configureAzureDevOpsRemote: typeof configureAzureDevOpsRemote;
  configureAzureDevOpsGitIdentity: typeof configureAzureDevOpsGitIdentity;
  createAzureDevOpsGitOperations: typeof createAzureDevOpsGitOperations;
  createAzureDevOpsGitProcess: typeof createAzureDevOpsGitProcess;
  pushAzureDevOpsWorktree: typeof pushAzureDevOpsWorktree;
  pullAzureDevOpsWorktree: typeof pullAzureDevOpsWorktree;
  cloneAzureDevOpsRepository: typeof cloneAzureDevOpsRepository;
  toOpenCodeToolResult: typeof toOpenCodeToolResult;
  validateAzureDevOpsRemoteUrl: typeof validateAzureDevOpsRemoteUrl;
};

type AzureDevOpsToolContext = {
  directory?: string;
  worktree?: string;
};

const pluginTestSeams: AzureDevOpsPlatformTestSeams = {
  agentParameters: AZURE_DEVOPS_PLUGIN_AGENT_PARAMETERS,
  configureAzureDevOpsRemote,
  configureAzureDevOpsGitIdentity,
  createAzureDevOpsGitOperations,
  createAzureDevOpsGitProcess,
  pushAzureDevOpsWorktree,
  pullAzureDevOpsWorktree,
  cloneAzureDevOpsRepository,
  toOpenCodeToolResult,
  validateAzureDevOpsRemoteUrl,
};
export const azureDevOpsPlatformTestSeams = pluginTestSeams;

export function createAzureDevOpsToolDefinitions(pluginInput: unknown = {}) {
    const toolInputs = createAzureDevOpsToolInputSchemas();
    const gitProcess = createAzureDevOpsGitProcess();
    const git = createAzureDevOpsGitOperations(gitProcess);

    return {
        azure_devops_create_repository: {
          description: "Create an Azure DevOps Git repository in the effective project context.",
          input: toolInputs.createRepository,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            currentWorktree(pluginInput, context);
            const result = await callRepositoryBackend(openCodeProject, "create-repository", {
              tool: "azure_devops_create_repository",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult("Azure DevOps repository created", result);
          },
        },
        azure_devops_list_repositories: {
          description: "List accessible Azure DevOps Git repositories in the effective organization and selected project, including each repository's verified HTTPS clone URL.",
          input: toolInputs.listRepositories,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "list-repositories", {
              tool: "azure_devops_list_repositories",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult(
              "Azure DevOps repositories",
              readAzureDevOpsRepositoryListResponse(response),
            );
          },
        },
        azure_devops_list_pipelines: {
          description: "List Azure DevOps Pipelines in the effective project context. Pass the returned continuationToken to retrieve the next page.",
          input: toolInputs.listPipelines,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "list-pipelines", {
              tool: "azure_devops_list_pipelines",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult("Azure DevOps Pipelines", readAzureDevOpsPipelineListResponse(response));
          },
        },
        azure_devops_create_pipeline: {
          description: "Create an Azure DevOps YAML Pipeline definition for a verified Azure Repos Git repository. The YAML file must already exist on that repository's verified default branch. Repeating the exact definition is idempotent; a same-name different definition returns a conflict. This tool does not start a Pipeline run.",
          input: toolInputs.createPipeline,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "create-pipeline", {
              tool: "azure_devops_create_pipeline",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult(
              "Azure DevOps Pipeline definition",
              readAzureDevOpsPipelineCreateResponse(response),
            );
          },
        },
        azure_devops_git_config: {
          description: "Set local user.name=opencode and user.email=opencode@double-cash.com, configure credential.helper=cache, and cache the Azure DevOps PAT in memory for 15 minutes so git_pull and Bash git pull can authenticate. Provide repositoryPath to target a nested repository/<name> checkout; otherwise the current Git worktree is used.",
          input: toolInputs.gitConfig,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const projectWorktree = currentWorktree(pluginInput, context);
            const repositoryPath = args.repositoryPath === undefined
              ? undefined
              : readAzureDevOpsRepositoryPath(args.repositoryPath);
            const worktree = repositoryPath
              ? await resolveAzureDevOpsPushRepositoryPath(projectWorktree, repositoryPath)
              : projectWorktree;

            const credential = await resolveAzureDevOpsGitCredential(openCodeProject);
            try {
              const credentialHelper = await configureAzureDevOpsGitCredentialHelper(
                worktree,
                credential.organization,
                credential.project,
                credential.credential,
                gitProcess,
              );
              const user = await configureAzureDevOpsGitIdentity(worktree, gitProcess);
              const expiresAt = cacheAzureDevOpsGitCredential(
                credential.organization,
                credential.project,
                credential.credential,
              );
              return toOpenCodeToolResult("Azure DevOps Git identity configured", {
                credentialCache: {
                  cached: true,
                  expiresAt: new Date(expiresAt).toISOString(),
                  ttlMilliseconds: AZURE_DEVOPS_GIT_CREDENTIAL_CACHE_TTL_MS,
                },
                credentialHelper,
                ...(repositoryPath ? { repositoryPath } : {}),
                user,
              });
            } finally {
              credential.credential = "";
            }
          },
        },
        azure_devops_configure_remote: {
          description: "Configure the verified Azure DevOps remote in a cloned nested checkout under repository/<name>. Provide repositoryPath when the checkout folder differs from the Azure DevOps repository name; otherwise the matching repository/<repositoryName> checkout is selected automatically. If no nested match exists, a Git current worktree is used. Matching remotes are idempotent; replacing a different existing remote requires updateExisting=true.",
          input: toolInputs.configureRemote,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const projectWorktree = currentWorktree(pluginInput, context);
            const response = await callRepositoryBackend(openCodeProject, "lookup-repository", {
              tool: "azure_devops_configure_remote",
              agentInput: omitUndefined({ ...args }),
            });
            const repository = readRepositoryResponse(response);
            const operationParameters = readRepositoryOperationPlan(response, "azure_devops_configure_remote");
            const target = await resolveAzureDevOpsConfigureRemoteTarget(
              projectWorktree,
              operationParameters.repositoryPath,
              repository.name,
            );
            const targetParameters = target.repositoryPath
              ? { ...operationParameters, repositoryPath: target.repositoryPath }
              : operationParameters;
            const result = await configureAzureDevOpsRemote(targetParameters, {
              git,
              resolveRepository: async () => repository,
              worktree: target.worktree,
            });
            return toOpenCodeToolResult("Azure DevOps remote configured", result);
          },
        },
        azure_devops_clone_repository: {
          description: "Clone a verified Azure DevOps repository from the UI-configured organization and project under the current project's repository/ directory.",
          input: toolInputs.cloneRepository,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            let stage = "OpenCode project context";
            try {
              const openCodeProject = currentOpenCodeProject(pluginInput);
              stage = "OpenCode worktree context";
              const worktree = currentWorktree(pluginInput, context);
              const agentInput = omitUndefined({ ...args });
              stage = "OpenCode tool metadata";
              stage = "Azure DevOps repository lookup";
              const response = await callRepositoryBackend(openCodeProject, "clone-repository", {
                tool: "azure_devops_clone_repository",
                agentInput,
              });
              stage = "Repository metadata validation";
              const repository = readRepositoryResponse(response);
              const operationParameters = readRepositoryOperationPlan(response, "azure_devops_clone_repository");
              stage = "Git clone";
              const result = await cloneAzureDevOpsRepository(operationParameters, {
                git,
                getCredential: async () => resolveCachedOrBrokeredAzureDevOpsGitCredential(
                  openCodeProject,
                  operationParameters,
                  agentInput,
                ),
                resolveRepository: async () => repository,
                worktree,
              });
              return toOpenCodeToolResult("Azure DevOps repository cloned", result);
            } catch (error) {
              const errorMessage = error instanceof Error
                ? error.message
                : error && typeof error === "object" && "message" in error
                  ? String(error.message)
                  : String(error);
              if (/\bsplit\b/.test(errorMessage)) {
                throw pluginError("AZURE_DEVOPS_CLONE_RUNTIME_FAILED", `Clone failed during ${stage}.`);
              }
              throw error;
            }
          },
        },
        azure_devops_push: {
          description: "Push the selected branch from repositoryPath to its canonical Azure DevOps remote. Always provide repository/<name> from azure_devops_clone_repository. If the Project UI pins a fixed path, provide that same path.",
          input: toolInputs.push,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            assertPushInput(args);
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const projectWorktree = currentWorktree(pluginInput, context);
            const repositoryPath = readAzureDevOpsRepositoryPath(args.repositoryPath);
            const worktree = await resolveAzureDevOpsPushRepositoryPath(projectWorktree, repositoryPath);
            const pushInput = omitUndefined({ ...args, repositoryPath });
            assertPushInput(pushInput);
            const result = await pushAzureDevOpsWorktree(pushInput, {
              git,
              resolvePushPlan: async (input, derivedValues) => {
                const response = await callRepositoryBackend(openCodeProject, "push-plan", {
                  derivedValues: sanitizePushDerivedValues(derivedValues),
                  tool: "azure_devops_push",
                  agentInput: omitUndefined({ ...input }),
                });
                return readPushPlanResponse(response);
              },
              resolvePush: async (input, remoteUrl, derivedValues, resolvedPlan) => {
                const response = await callRepositoryBackend(openCodeProject, "push-credential", {
                  derivedValues: sanitizePushDerivedValues(derivedValues),
                  observedRemoteUrl: remoteUrl,
                  tool: "azure_devops_push",
                  agentInput: omitUndefined({ ...input }),
                  verifiedResolvedValues: resolvedPlan.resolvedValues,
                  verifiedResolvedSources: resolvedPlan.sources,
                });
                const credential = readPushResponse(response, remoteUrl);
                cacheAzureDevOpsGitCredential(credential.organization, credential.project, credential.credential);
                return credential;
              },
              worktree,
            });
            return toOpenCodeToolResult("Azure DevOps branch pushed", result);
          },
        },
        azure_devops_git_pull: {
          description: "Pull changes from a verified Azure DevOps remote into the selected cloned checkout under repository/<name>. Provide repositoryPath every time. Optionally select a remote branch; otherwise Git uses the current branch's configured upstream.",
          input: toolInputs.pull,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            assertPullInput(args);
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const projectWorktree = currentWorktree(pluginInput, context);
            const repositoryPath = readAzureDevOpsRepositoryPath(args.repositoryPath);
            const worktree = await resolveAzureDevOpsRepositoryPath(projectWorktree, repositoryPath);
            const pullInput = omitUndefined({ ...args, repositoryPath });
            const result = await pullAzureDevOpsWorktree(pullInput, {
              git,
              resolvePullPlan: async (input) => {
                const response = await callRepositoryBackend(openCodeProject, "pull-plan", {
                  tool: "azure_devops_git_pull",
                  agentInput: omitUndefined({ ...input }),
                });
                return readPullPlanResponse(response);
              },
              resolvePull: async (input, remoteUrl, plan) => {
                const agentInput: Record<string, unknown> = {};
                for (const key of ["project", "repositoryPath", "remoteName", "branch"]) {
                  if (plan.sources[key] === "agent" && input[key] !== undefined) agentInput[key] = input[key];
                }
                const response = await callRepositoryBackend(openCodeProject, "pull-credential", {
                  observedRemoteUrl: remoteUrl,
                  tool: "azure_devops_git_pull",
                  agentInput,
                  verifiedResolvedValues: plan.resolvedValues,
                  verifiedResolvedSources: plan.sources,
                });
                return readPullResponse(response, remoteUrl);
              },
              worktree,
            });
            return toOpenCodeToolResult("Azure DevOps repository pulled", result);
          },
        },
        azure_devops_list_wikis: {
          description: "List the wikis in the effective Azure DevOps organization and project context.",
          input: toolInputs.listWikis,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "list-wikis", {
              tool: "azure_devops_list_wikis",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult("Azure DevOps wikis", readAzureDevOpsWikiListResponse(response));
          },
        },
        azure_devops_write_wiki_page: {
          description: "Create a wiki page or replace the complete Markdown content of an existing page. By default, use the Wiki ID synchronized from the current Organization and Project context; if wikiIdentifier is supplied while policy is derived, the supplied value is ignored. Set Wiki ID policy to Agent to resolve an Agent-provided Wiki name or ID within the current Project. Missing parent pages are created as empty pages; a trailing .md is accepted as the backing Git item extension. Existing pages are updated with ETag concurrency protection.",
          input: toolInputs.writeWikiPage,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "write-wiki-page", {
              tool: "azure_devops_write_wiki_page",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult("Azure DevOps wiki page written", readAzureDevOpsWikiWriteResponse(response));
          },
        },
        azure_devops_create_work_item: {
          description: "Create one Azure DevOps Work Item in the fixed project context. workItemType and title are required after project policy resolution and may be Agent-provided or fixed. An optional positive parentId creates a parent-child relation to a Work Item in the same project. Area Path, Iteration Path, Assigned To, integer Priority, semicolon-separated Tags, State, and Severity may each be Agent-provided or fixed by project policy and are validated by the selected Azure DevOps Project process. Original Estimate, Remaining Work, Completed Work, Activity, Story Points, Effort, Size, and Business Value may also be Agent-provided or fixed. Optional description, reproSteps, systemInfo, and acceptanceCriteria are sent as raw Markdown and permanently configure those fields as Markdown.",
          input: toolInputs.createWorkItem,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "create-work-item", {
              tool: "azure_devops_create_work_item",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult(
              "Azure DevOps Work Item created",
              readAzureDevOpsWorkItemCreateResponse(response),
            );
          },
        },
        azure_devops_get_work_item: {
          description: "Read one Azure DevOps Work Item from the fixed project context. Returns its current revision, actual state, and only the supported standard fields; this tool has no write side effects.",
          input: toolInputs.getWorkItem,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "get-work-item", {
              tool: "azure_devops_get_work_item",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult(
              "Azure DevOps Work Item",
              readAzureDevOpsWorkItemDetailsResponse(response),
            );
          },
        },
        azure_devops_list_work_item_revisions: {
          description: "List bounded Azure DevOps Work Item revision snapshots from the fixed project context. Each snapshot uses the same allowlisted fields as azure_devops_get_work_item; long text reports truncatedFields. Use nextSkip to continue when hasMore is true. This tool is read-only.",
          input: toolInputs.listWorkItemRevisions,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "list-work-item-revisions", {
              tool: "azure_devops_list_work_item_revisions",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult(
              "Azure DevOps Work Item revisions",
              readAzureDevOpsWorkItemRevisionsResponse(response),
            );
          },
        },
        azure_devops_update_work_item: {
          description: "Partially update an existing Azure DevOps Work Item in the fixed project context. workItemId is required after project policy resolution. Provide only the fields to change; omitted fields remain unchanged. At least one mutable field is required. When available, pass the current rev returned by azure_devops_get_work_item as the call-time expectedRev to atomically prevent overwriting a concurrent update. If the revision conflicts, reread the Work Item and its revision history, review the changes, then decide whether to submit a new update; never automatically retry or replay the patch. The selected Project process validates optional Work Item type changes. This tool does not change parent-child relations.",
          input: toolInputs.updateWorkItem,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "update-work-item", {
              tool: "azure_devops_update_work_item",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult(
              "Azure DevOps Work Item updated",
              readAzureDevOpsWorkItemUpdateResponse(response),
            );
          },
        },
        azure_devops_create_pull_request: {
          description: "Explicitly create an Azure DevOps pull request in the effective Organization and selected ADO Project. Select exactly one verified Repository reference, ID, or name, and provide existing source and target refs/heads branches plus a title. Before creating, when the Repository and both branches are known, call azure_devops_list_pull_requests with the same Repository, sourceRefName, targetRefName, and status active. If a matching active PR exists, report that PR and do not call this create tool. This workflow preflight does not guarantee atomic uniqueness across concurrent requests. Optionally provide at most 50 reviewer identity UUIDs, positive Work Item IDs, and non-empty labels. When Work Item IDs are provided, request that Azure DevOps transition linked work items to their next logical state when the PR is completed. This write operation does not push branches or commits, complete or merge the pull request, or enable auto-completion. If the result is uncertain, verify the pull request in Azure DevOps before trying again.",
          input: toolInputs.createPullRequest,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "create-pull-request", {
              tool: "azure_devops_create_pull_request",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult(
              "Azure DevOps pull request created",
              readAzureDevOpsPullRequestCreateResponse(response),
            );
          },
        },
        azure_devops_get_pull_request: {
          description: "Get the bounded status, title, source/target branches, repository identity, merge commit IDs, and one page of commit summaries for a pull request in the selected Azure DevOps project. Use pullRequestId returned by another tool. Commit pages default to 50 and allow at most 100; pass nextContinuationToken as commitContinuationToken to continue.",
          input: toolInputs.getPullRequest,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "get-pull-request", {
              tool: "azure_devops_get_pull_request",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult(
              "Azure DevOps pull request details",
              readAzureDevOpsPullRequestDetailsResponse(response),
            );
          },
        },
        azure_devops_list_pull_requests: {
          description: "List Azure DevOps pull requests in the effective Organization and selected ADO Project. Select exactly one verified Repository reference, ID, or name. Optionally filter with full refs/heads sourceRefName and targetRefName values. status accepts active, abandoned, completed, or all and defaults to active. top is bounded from 1 to 100 and defaults to 50; skip is a bounded non-negative offset and defaults to 0. Returns bounded PR summaries without fetching commits.",
          input: toolInputs.listPullRequests,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "list-pull-requests", {
              tool: "azure_devops_list_pull_requests",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult(
              "Azure DevOps pull requests",
              readAzureDevOpsPullRequestListResponse(response),
            );
          },
        },
        azure_devops_publish_pipeline_yaml: {
          description: "Explicitly publish a new .yml or .yaml file to the verified Azure DevOps repository's default branch. This creates a Git commit and may trigger the repository's existing CI pipelines. Existing identical content is a no-op; differing content at the same path is a conflict. Never use this tool when the user only asks to generate YAML.",
          input: toolInputs.publishPipelineYaml,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "publish-pipeline-yaml", {
              tool: "azure_devops_publish_pipeline_yaml",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult(
              "Azure DevOps Pipeline YAML published to default branch",
              readAzureDevOpsPipelineYamlPublishResponse(response),
            );
          },
        },
        azure_devops_preview_pipeline: {
          description: "Preview the expanded YAML for an existing Azure DevOps Pipeline without creating a run. This operation never queues or starts a Pipeline; select an optional refs/heads branch and bounded scalar template parameters through the current project policy.",
          input: toolInputs.pipelinePreview,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "preview-pipeline", {
              tool: "azure_devops_preview_pipeline",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult(
              "Azure DevOps Pipeline YAML preview",
              readAzureDevOpsPipelinePreviewResponse(response),
            );
          },
        },
        azure_devops_run_pipeline: {
          description: "Explicitly start one Azure DevOps Pipeline run. This is the only tool in this group that queues work; it must be called only when the user explicitly requests a run. Preview, YAML publishing, and Pipeline definition creation never start a run. Branch refs and scalar template parameters are restricted by the current project policy.",
          input: toolInputs.pipelineRun,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "run-pipeline", {
              tool: "azure_devops_run_pipeline",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult(
              "Azure DevOps Pipeline run started",
              readAzureDevOpsPipelineRunResponse(response),
            );
          },
        },
        azure_devops_get_pipeline_run: {
          description: "Get the bounded state, result, and identity summary for a specific Azure DevOps Pipeline run in the current project.",
          input: toolInputs.getPipelineRun,
          async execute(args: Record<string, unknown>, context: AzureDevOpsToolContext) {
            const openCodeProject = currentOpenCodeProject(pluginInput);
            const response = await callRepositoryBackend(openCodeProject, "get-pipeline-run", {
              tool: "azure_devops_get_pipeline_run",
              agentInput: omitUndefined({ ...args }),
            });
            return toOpenCodeToolResult(
              "Azure DevOps Pipeline run status",
              readAzureDevOpsPipelineRunStatusResponse(response),
            );
          },
        },
    };
}

const AzureDevOpsPlatformPlugin = Plugin.define({
  id: "azure-devops-platform",
  async setup(context) {
    const directory = context.location.directory;
    const pluginInput = { directory, project: basename(directory) };
    const toolDefinitions = createAzureDevOpsToolDefinitions(pluginInput);
    const skillPath = join(AZURE_DEVOPS_PIPELINE_SKILL_DIRECTORY, "SKILL.md");
    const skillContent = await readFile(skillPath, "utf8");

    await context.skill.transform((editor) => {
      editor.add({
        id: Skill.ID.make("minimal-api-service-cloud-run-pipeline"),
        name: Skill.Name.make("Minimal API Service Cloud Run Pipeline"),
        description: "Use when the user asks for the minimal-api-service Azure DevOps CI/CD template that builds a Docker image, pushes it to Artifact Registry, and deploys it to Cloud Run.",
        path: Skill.Info.fields.path.make(skillPath),
        content: skillContent,
      });
    });

    await context.tool.transform((editor) => {
      for (const [name, definition] of Object.entries(toolDefinitions)) {
        editor.add({
          name,
          ...definition,
          options: { codemode: false },
          async execute(input, toolContext) {
            return definition.execute(input as Record<string, unknown>, {
              ...toolContext,
              directory: toolContext.directory ?? directory,
              worktree: toolContext.worktree ?? directory,
            });
          },
        });
      }
    });
  },
});

export default AzureDevOpsPlatformPlugin;

function toOpenCodeToolResult(title: string, value: Record<string, unknown>) {
  return { content: JSON.stringify(value, null, 2), metadata: { title } };
}

async function resolveAzureDevOpsGitCredential(openCodeProject: string): Promise<{
  credential: string;
  organization: string;
  project: string;
}> {
  return readGitCredentialResponse(await callRepositoryBackend(openCodeProject, "get-git-credential", {
    tool: "azure_devops_clone_repository",
    agentInput: {},
  }));
}

async function resolveCachedOrBrokeredAzureDevOpsGitCredential(
  openCodeProject: string,
  operationParameters: Record<string, unknown>,
  agentInput: Record<string, unknown>,
): Promise<string> {
  const expectedOrganization = typeof operationParameters.organization === "string"
    ? operationParameters.organization
    : undefined;
  const expectedProject = typeof operationParameters.project === "string"
    ? operationParameters.project
    : undefined;
  if (expectedOrganization && expectedProject) {
    const cached = getCachedAzureDevOpsCredential(expectedOrganization, expectedProject);
    if (cached) return cached.credential;
  }

  const credential = readGitCredentialResponse(await callRepositoryBackend(openCodeProject, "get-git-credential", {
    tool: "azure_devops_clone_repository",
    agentInput,
  }));
  if ((expectedOrganization && !sameContextValue(expectedOrganization, credential.organization))
    || (expectedProject && !sameContextValue(expectedProject, credential.project))) {
    credential.credential = "";
    throw pluginError("AZURE_DEVOPS_CONTEXT_MISMATCH", "Azure DevOps credential does not match the verified repository context.");
  }
  cacheAzureDevOpsGitCredential(credential.organization, credential.project, credential.credential);
  return credential.credential;
}

function sameContextValue(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
