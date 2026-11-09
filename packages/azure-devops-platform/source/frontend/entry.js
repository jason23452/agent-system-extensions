const STYLE = `
.ado-editor{display:grid;align-content:start;gap:16px;width:100%;height:100%;max-height:100dvh;min-height:0;box-sizing:border-box;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;max-width:920px;margin:auto;padding:24px;color:var(--foreground,#172033);font:14px/1.5 ui-sans-serif,system-ui,sans-serif}
.ado-editor h1,.ado-editor h2,.ado-editor h3,.ado-editor p{margin:0}.ado-editor h1{font-size:22px}.ado-editor h2{font-size:15px}.ado-editor h3{font-size:13px}.ado-muted{color:var(--muted-foreground,#687386);font-size:12px}.ado-small{color:var(--muted-foreground,#687386);font-size:11px}
.ado-header{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;gap:12px;margin:-24px -24px 0;padding:16px 24px 12px;background:var(--background,#fff);border-bottom:1px solid var(--border,#dfe4ec)}.ado-header-content{display:grid;min-width:0;gap:4px}.ado-back{display:inline-flex;flex:0 0 auto;align-items:center;min-height:34px;border:1px solid var(--border,#dfe4ec);border-radius:8px;background:var(--background,#fff);color:var(--foreground,#172033);cursor:pointer;padding:0 10px;font:600 12px/1 inherit}.ado-back:hover{background:var(--muted,#f5f7fa)}
.ado-section{display:grid;gap:12px;border:1px solid var(--border,#dfe4ec);border-radius:14px;background:var(--card,#fff);padding:16px}.ado-section[hidden]{display:none}.ado-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ado-grid-wide{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:10px}.ado-field{display:grid;gap:5px;color:var(--muted-foreground,#687386);font-size:12px;font-weight:700}.ado-field input,.ado-field select,.ado-field textarea{width:100%;min-height:38px;box-sizing:border-box;border:1px solid var(--border,#dfe4ec);border-radius:8px;background:var(--background,#fff);color:var(--foreground,#172033);padding:8px 10px;font:inherit}.ado-field textarea{min-height:86px;resize:vertical}.ado-field select[multiple]{min-height:120px}.ado-field input:focus-visible,.ado-field select:focus-visible,.ado-field textarea:focus-visible,.ado-button:focus-visible,.ado-back:focus-visible{outline:2px solid var(--ring,#2563eb);outline-offset:2px}
.ado-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.ado-button{min-height:38px;border:0;border-radius:8px;background:#0078d4;color:#fff;cursor:pointer;padding:0 14px;font:600 13px/1 inherit}.ado-button.secondary{border:1px solid var(--border,#dfe4ec);background:var(--background,#fff);color:var(--foreground,#172033)}.ado-button.danger{border:1px solid #f0b7b2;background:#fff;color:#b42318}.ado-button:disabled{cursor:not-allowed;opacity:.55}.ado-status{min-height:20px;color:var(--muted-foreground,#687386);font-size:12px}.ado-status[data-kind=error]{color:#b42318}.ado-status[data-kind=success]{color:#067647}.ado-status[data-kind=busy]{color:#1d4ed8}.ado-result{margin:0;max-height:220px;overflow:auto;border-radius:8px;background:var(--muted,#f5f7fa);padding:12px;white-space:pre-wrap;font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}
.ado-divider{height:1px;background:var(--border,#dfe4ec)}.ado-check-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.ado-check{display:flex;align-items:center;gap:7px;border:1px solid var(--border,#dfe4ec);border-radius:8px;padding:8px;color:var(--foreground,#172033);font-size:12px}.ado-check input{accent-color:#0078d4}.ado-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}.ado-list li{display:flex;align-items:center;justify-content:space-between;gap:10px;border-radius:9px;background:var(--muted,#f5f7fa);padding:9px}.ado-list-copy{display:grid;min-width:0;gap:2px}.ado-list-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.ado-list-copy span{overflow:hidden;color:var(--muted-foreground,#687386);text-overflow:ellipsis;white-space:nowrap;font-size:11px}.ado-pill{display:inline-flex;align-items:center;border-radius:999px;background:#e8f1ff;color:#1d4ed8;padding:3px 8px;font-size:10px;font-weight:700}.ado-empty{border:1px dashed var(--border,#dfe4ec);border-radius:9px;padding:16px;text-align:center;color:var(--muted-foreground,#687386);font-size:12px}.ado-danger-zone{display:grid;gap:8px;border:1px solid #f2c7c3;border-radius:10px;background:#fff8f7;padding:12px}.ado-widget-form{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1.5fr) repeat(4,minmax(70px,.5fr));gap:8px}.ado-widget-form .ado-field:nth-child(3),.ado-widget-form .ado-field:nth-child(4),.ado-widget-form .ado-field:nth-child(5),.ado-widget-form .ado-field:nth-child(6){min-width:0}.ado-widget-list{display:grid;gap:7px}.ado-widget-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;border:1px solid var(--border,#dfe4ec);border-radius:8px;padding:9px}.ado-widget-row code{overflow:hidden;color:var(--muted-foreground,#687386);text-overflow:ellipsis;white-space:nowrap;font-size:10px}
.ado-policy-tools{display:grid;gap:10px}.ado-policy-tool{display:grid;gap:10px;border:1px solid var(--border,#dfe4ec);border-radius:10px;padding:12px}.ado-policy-tool h3{font-size:13px}.ado-policy-fields{display:grid;gap:8px}.ado-policy-field{display:grid;grid-template-columns:minmax(150px,.8fr) 112px minmax(0,1fr);align-items:center;gap:8px;border-radius:8px;background:var(--muted,#f5f7fa);padding:8px}.ado-policy-field > strong{font-size:12px}.ado-policy-field select,.ado-policy-field input,.ado-policy-field textarea{min-width:0;box-sizing:border-box;border:1px solid var(--border,#dfe4ec);border-radius:7px;background:var(--background,#fff);color:var(--foreground,#172033);padding:7px 8px;font:12px/1.3 inherit}.ado-policy-field input[type=checkbox]{width:16px;min-height:16px;accent-color:#0078d4}.ado-policy-field select:disabled,.ado-policy-field input:disabled{cursor:not-allowed;opacity:.65}.ado-policy-derived{color:var(--muted-foreground,#687386);font-size:11px}.ado-policy-required{display:inline-flex;align-items:center;gap:5px;color:var(--muted-foreground,#687386);font-size:11px;font-weight:600}.ado-policy-error{color:#b42318;font-size:11px}.ado-policy-value{display:flex;align-items:center;gap:8px;min-width:0}.ado-policy-value input{flex:1}.ado-policy-value textarea{flex:1;min-height:128px;resize:vertical;white-space:pre-wrap}.ado-policy-value code{overflow:hidden;color:var(--muted-foreground,#687386);text-overflow:ellipsis;white-space:nowrap;font-size:10px}
@media (max-width:720px){.ado-editor{padding:16px}.ado-header{margin:-16px -16px 0;padding:14px 16px 10px}.ado-grid,.ado-widget-form{grid-template-columns:1fr}.ado-check-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ado-grid-wide{grid-template-columns:1fr}}
`;

const POLICY_TOOL_DEFINITIONS = {
  azure_devops_create_repository: {
    label: "Create repository",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Project Context / credential broker" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", required: true, source: "Current ADO context" },
      { name: "repositoryName", label: "Repository name", type: "string", defaultMode: "agent", required: true },
      { name: "repositoryReference", label: "Repository reference", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Azure DevOps metadata / previous Tool result" },
      { name: "remoteUrl", label: "Canonical remote URL", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Azure DevOps metadata" },
      { name: "credential", label: "Credential", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Credential broker" },
    ],
  },
  azure_devops_configure_remote: {
    label: "Configure remote",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Project Context / credential broker" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", required: true, source: "Current ADO context" },
      { name: "repositoryReference", label: "Repository reference", type: "string", defaultMode: "agent" },
      { name: "repositoryID", label: "Repository ID", type: "uuid", defaultMode: "agent" },
      { name: "repositoryName", label: "Repository name", type: "string", defaultMode: "agent" },
      { name: "repositoryPath", label: "Repository path", type: "string", defaultMode: "agent", modes: ["fixed", "agent"], placeholder: "repository/<repo-name>", source: "Nested cloned repository under the current Project" },
      { name: "remoteName", label: "Remote name", type: "string", defaultMode: "fixed", defaultValue: "origin" },
      { name: "updateExisting", label: "Update existing remote", type: "boolean", defaultMode: "agent" },
      { name: "remoteUrl", label: "Canonical remote URL", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Azure DevOps metadata" },
      { name: "credential", label: "Credential", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Credential broker" },
    ],
  },
  azure_devops_push: {
    label: "Push worktree",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Project Context / credential broker" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", required: true, source: "Current ADO context" },
      { name: "repositoryPath", label: "Repository path", type: "string", defaultMode: "agent", modes: ["fixed", "agent"], required: true, requiredAlways: true, placeholder: "repository/<repo-name>", source: "Clone output such as repository/AI_Traning" },
      { name: "remoteName", label: "Remote name", type: "string", defaultMode: "fixed", defaultValue: "origin" },
      { name: "branch", label: "Branch", type: "string", defaultMode: "agent", required: true },
      { name: "setUpstream", label: "Set upstream", type: "boolean", defaultMode: "agent" },
      { name: "remoteUrl", label: "Canonical remote URL", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Azure DevOps metadata / current worktree" },
      { name: "credential", label: "Credential", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Credential broker" },
    ],
  },
  azure_devops_git_pull: {
    label: "Pull repository",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Project Context / credential broker" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", required: true, source: "Current ADO context" },
      { name: "repositoryPath", label: "Repository path", type: "string", defaultMode: "agent", modes: ["fixed", "agent"], required: true, requiredAlways: true, placeholder: "repository/<repo-name>", source: "Selected cloned checkout under the current Project" },
      { name: "remoteName", label: "Remote name", type: "string", defaultMode: "fixed", defaultValue: "origin" },
      { name: "branch", label: "Branch", type: "string", defaultMode: "agent" },
      { name: "remoteUrl", label: "Canonical remote URL", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Azure DevOps metadata / current worktree" },
      { name: "credential", label: "Credential", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Credential broker" },
    ],
  },
  azure_devops_clone_repository: {
    label: "Clone repository",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Project Context / credential broker" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", required: true, source: "Current ADO context" },
      { name: "repositoryReference", label: "Repository reference", type: "string", defaultMode: "agent" },
      { name: "repositoryID", label: "Repository ID", type: "uuid", defaultMode: "agent" },
      { name: "repositoryName", label: "Repository name", type: "string", defaultMode: "agent" },
      { name: "branch", label: "Branch", type: "string", defaultMode: "agent" },
      { name: "ref", label: "Ref", type: "string", defaultMode: "agent" },
      { name: "depth", label: "Depth", type: "integer", defaultMode: "agent" },
      { name: "destination", label: "Folder under repository/", type: "string", defaultMode: "agent", source: "Project-local repository/ directory" },
      { name: "remoteName", label: "Remote name", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Clone operation" },
      { name: "remoteUrl", label: "Canonical remote URL", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Azure DevOps metadata" },
      { name: "credential", label: "Credential", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Credential broker" },
    ],
  },
  azure_devops_list_wikis: {
    label: "List wikis",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", required: true, source: "Shared selected ADO Project context" },
    ],
  },
  azure_devops_list_repositories: {
    label: "List repositories",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", required: true, source: "Shared selected ADO Project context" },
    ],
  },
  azure_devops_list_pipelines: {
    label: "List Pipelines",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", required: true, source: "Shared selected ADO Project context" },
      { name: "continuationToken", label: "Continuation token", type: "string", defaultMode: "agent", modes: ["agent"], maxLength: 2000, source: "REST continuation token returned by the previous page" },
    ],
  },
  azure_devops_create_pipeline: {
    label: "Create YAML Pipeline",
    note: "Repository reference、Repository ID 與 Repository name 每次呼叫只能提供一種；YAML 必須已存在於該 Repository 的 default branch。",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", required: true, source: "Shared selected ADO Project context" },
      { name: "repositoryReference", label: "Repository reference", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 300 },
      { name: "repositoryID", label: "Repository ID", type: "uuid", defaultMode: "agent", modes: ["agent", "fixed"] },
      { name: "repositoryName", label: "Repository name", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 128 },
      { name: "name", label: "Pipeline name", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, maxLength: 128 },
      { name: "yamlPath", label: "Existing YAML path", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, maxLength: 1024, placeholder: "azure-pipelines.yml", source: "Repository-relative YAML file on the verified default branch" },
      { name: "folder", label: "Pipeline folder", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 512, placeholder: "\\Build\\CI" },
    ],
  },
  azure_devops_create_pull_request: {
    label: "Create pull request",
    note: "這是明確的寫入操作；PAT 需有 Project and Team (Read) vso.project 以載入／查詢 Project（包含既有 Project selector），並有 Code (Read & write) vso.code_write 建立 PR；仍須具備 Project／Repository 權限。每次呼叫必須只選一種 Repository reference、ID 或 name。只接受已存在的 refs/heads 分支。提供 Work Item IDs 時，PR 完成／merge 時會要求 Azure DevOps 將已連結項目轉到下一個邏輯狀態；此設定不會自動完成或 merge PR。",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", forcedMode: "fixed", required: true, source: "Shared selected ADO Project context" },
      { name: "repositoryReference", label: "Repository reference", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 300, format: "azure-devops-repository-reference", placeholder: "azure-devops://org/project/<repository-id>" },
      { name: "repositoryID", label: "Repository ID", type: "uuid", defaultMode: "agent", modes: ["agent", "fixed"] },
      { name: "repositoryName", label: "Repository name", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 128, format: "azure-devops-repository-name" },
      { name: "sourceRefName", label: "Source branch ref", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, maxLength: 255, format: "azure-devops-branch-ref", placeholder: "refs/heads/feature/change" },
      { name: "targetRefName", label: "Target branch ref", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, maxLength: 255, format: "azure-devops-branch-ref", placeholder: "refs/heads/main" },
      { name: "title", label: "Title", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, maxLength: 255, placeholder: "Pull request title" },
      { name: "description", label: "Description", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], allowEmpty: true, maxLength: 100_000, multiline: true, placeholder: "Optional pull request description" },
      { name: "isDraft", label: "Create as draft", type: "boolean", defaultMode: "agent", modes: ["agent", "fixed"] },
      { name: "reviewerIds", label: "Reviewer IDs (JSON array)", type: "json-array", arrayItemType: "uuid", maxItems: 50, maxLength: 10_000, defaultMode: "agent", modes: ["agent", "fixed"], placeholder: '[\n  "11111111-1111-4111-8111-111111111111"\n]', source: "At most 50 Azure DevOps identity UUIDs" },
      { name: "workItemIds", label: "Work Item IDs (JSON array)", type: "json-array", arrayItemType: "integer", itemMinimum: 1, itemMaximum: 2_147_483_647, maxItems: 50, maxLength: 10_000, defaultMode: "agent", modes: ["agent", "fixed"], placeholder: "[\n  123,\n  456\n]", source: "At most 50 positive 32-bit Work Item IDs" },
      { name: "labels", label: "Labels (JSON array)", type: "json-array", arrayItemType: "string", itemMaxLength: 128, maxItems: 50, maxLength: 10_000, defaultMode: "agent", modes: ["agent", "fixed"], placeholder: '[\n  "feature"\n]', source: "At most 50 non-empty labels, each at most 128 characters" },
      { name: "supportsIterations", label: "Support iterations", type: "boolean", defaultMode: "agent", modes: ["agent", "fixed"] },
    ],
  },
  azure_devops_get_pull_request: {
    label: "Get pull request details",
    note: "依固定 Organization／ADO Project 查詢 PR ID 與有限 commits 頁面；commitTop 預設 50、上限 100。續頁 token 只在單次呼叫提供。",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", forcedMode: "fixed", required: true, source: "Shared selected ADO Project context" },
      { name: "pullRequestId", label: "Pull request ID", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, minimum: 1, maximum: 2_147_483_647 },
      { name: "commitTop", label: "Commit page size", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 1, maximum: 100, placeholder: "50" },
      { name: "commitContinuationToken", label: "Commit continuation token", type: "string", defaultMode: "agent", modes: ["agent"], maxLength: 2_000, source: "nextContinuationToken returned by the previous page" },
    ],
  },
  azure_devops_list_pull_requests: {
    label: "List pull requests",
    note: "建立 PR 前先用相同 Repository、source branch 與 target branch 查詢 active PR；若已有相符 PR，回報既有項目並停止建立。status 未指定時使用 active。",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", forcedMode: "fixed", required: true, source: "Shared selected ADO Project context" },
      { name: "repositoryReference", label: "Repository reference", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 300, format: "azure-devops-repository-reference", placeholder: "azure-devops://org/project/<repository-id>" },
      { name: "repositoryID", label: "Repository ID", type: "uuid", defaultMode: "agent", modes: ["agent", "fixed"] },
      { name: "repositoryName", label: "Repository name", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 128, format: "azure-devops-repository-name" },
      { name: "sourceRefName", label: "Source branch ref", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 255, format: "azure-devops-branch-ref", placeholder: "refs/heads/feature/change" },
      { name: "targetRefName", label: "Target branch ref", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 255, format: "azure-devops-branch-ref", placeholder: "refs/heads/main" },
      { name: "status", label: "PR status", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 16, format: "azure-devops-pull-request-status", options: [{ value: "active", label: "active · 預設" }, { value: "abandoned", label: "abandoned" }, { value: "completed", label: "completed" }, { value: "all", label: "all" }] },
      { name: "top", label: "Page size ($top)", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 1, maximum: 100, placeholder: "50" },
      { name: "skip", label: "Offset ($skip)", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, maximum: 2_147_483_647, placeholder: "0" },
    ],
  },
  azure_devops_write_wiki_page: {
    label: "Write wiki page",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", required: true, source: "Shared selected ADO Project context" },
      { name: "wikiIdentifier", label: "Wiki ID or name", type: "string", defaultMode: "derived", modes: ["agent", "fixed", "derived"], required: true, requiredAlways: true, maxLength: 256, source: "Selected Wiki ID synchronized from the current Organization and Project" },
      { name: "path", label: "Wiki page path", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, maxLength: 2_048, placeholder: "/PRD/xxx/spec.md" },
      { name: "content", label: "Complete Markdown content", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, maxLength: 100_000, multiline: true, placeholder: "完整頁面 Markdown；更新時會取代整頁內容" },
      { name: "comment", label: "Change comment", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 1_000, placeholder: "Optional wiki change comment" },
    ],
  },
  azure_devops_create_work_item: {
    label: "Create Work Item",
    note: "Description、Repro Steps、System Info 與 Acceptance Criteria 會以原始 Markdown 保存；Azure DevOps 欄位一旦設為 Markdown，就不能再改回 HTML。Tags 使用分號分隔，分類路徑、Assigned To、Severity 與 State 由 Azure DevOps Project process 驗證。",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", forcedMode: "fixed", required: true, source: "Shared selected ADO Project context" },
      { name: "workItemType", label: "Work Item type", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, maxLength: 128, placeholder: "Task, Bug, User Story..." },
      { name: "title", label: "Title", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, maxLength: 255, placeholder: "Work Item title" },
      { name: "description", label: "Description (Markdown)", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 100_000, multiline: true, placeholder: "Optional raw Markdown description" },
      { name: "parentId", label: "Parent Work Item ID", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], maxValue: 2_147_483_647, placeholder: "Optional positive Work Item ID in this Project" },
      { name: "areaPath", label: "Area Path", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 2_048, placeholder: "Project\\Team\\Area" },
      { name: "iterationPath", label: "Iteration Path", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 2_048, placeholder: "Project\\Sprint 1" },
      { name: "assignedTo", label: "Assigned To", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 512, placeholder: "name@example.com" },
      { name: "priority", label: "Priority", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 1, maximum: 100_000, placeholder: "1" },
      { name: "tags", label: "Tags (semicolon-separated)", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 4_000, placeholder: "backend; urgent" },
      { name: "state", label: "State", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 128, placeholder: "Active" },
      { name: "reproSteps", label: "Repro Steps (Markdown)", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 100_000, multiline: true, placeholder: "Optional raw Markdown reproduction steps" },
      { name: "systemInfo", label: "System Info (Markdown)", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 100_000, multiline: true, placeholder: "Optional raw Markdown system information" },
      { name: "severity", label: "Severity", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 128, placeholder: "Optional severity validated by the Project process" },
      { name: "acceptanceCriteria", label: "Acceptance Criteria (Markdown)", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 100_000, multiline: true, placeholder: "Optional raw Markdown acceptance criteria" },
      { name: "originalEstimate", label: "Original Estimate", type: "number", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, placeholder: "0.5" },
      { name: "remainingWork", label: "Remaining Work", type: "number", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, placeholder: "0.5" },
      { name: "completedWork", label: "Completed Work", type: "number", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, placeholder: "0.5" },
      { name: "activity", label: "Activity", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 128, placeholder: "Development, Testing..." },
      { name: "storyPoints", label: "Story Points", type: "number", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, placeholder: "3.5" },
      { name: "effort", label: "Effort", type: "number", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, placeholder: "3.5" },
      { name: "size", label: "Size", type: "number", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, placeholder: "3.5" },
      { name: "businessValue", label: "Business Value", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, maximum: 100_000, placeholder: "100" },
    ],
  },
  azure_devops_get_work_item: {
    label: "Get Work Item",
    note: "唯讀取得目前 Work Item revision、實際 State 與受控標準欄位；Organization 和 Project 由目前 context 決定。",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", forcedMode: "fixed", required: true, source: "Shared selected ADO Project context" },
      { name: "workItemId", label: "Work Item ID", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, minimum: 1, maximum: 2_147_483_647 },
    ],
  },
  azure_devops_list_work_item_revisions: {
    label: "List Work Item revisions",
    note: "唯讀查詢固定 Project 中的 Work Item revision snapshots。每頁最多 20 筆；長文字會標示截斷欄位，使用 nextSkip 讀取下一頁。",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", forcedMode: "fixed", required: true, source: "Shared selected ADO Project context" },
      { name: "workItemId", label: "Work Item ID", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, minimum: 1, maximum: 2_147_483_647 },
      { name: "top", label: "Page size ($top)", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 1, maximum: 20, placeholder: "10" },
      { name: "skip", label: "Offset ($skip)", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, maximum: 2_147_483_647, placeholder: "0" },
    ],
  },
  azure_devops_update_work_item: {
    label: "Update Work Item",
    note: "Provide a Work Item ID and one or more fields to update. Omitted fields stay unchanged. Optionally pass the current rev from Get Work Item as expectedRev for an atomic revision check. On a revision conflict, reread the Work Item and revision history before deciding whether to submit a new update. The selected Project process validates any Work Item type change. Parent-child relations are not changed by this Tool.",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", forcedMode: "fixed", required: true, source: "Shared selected ADO Project context" },
      { name: "workItemId", label: "Work Item ID", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, minimum: 1, maximum: 2_147_483_647 },
      { name: "expectedRev", label: "Expected revision (call-time only)", type: "integer", defaultMode: "agent", modes: ["agent"], minimum: 1, maximum: 2_147_483_647, source: "rev returned by azure_devops_get_work_item; not stored as a fixed Project value" },
      { name: "workItemType", label: "Work Item type", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 128, placeholder: "Task, Bug, User Story..." },
      { name: "title", label: "Title", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 255, placeholder: "Replacement title" },
      { name: "description", label: "Description (Markdown)", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 100_000, multiline: true, placeholder: "Replacement raw Markdown description" },
      { name: "areaPath", label: "Area Path", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 2_048, placeholder: "Project\\Team\\Area" },
      { name: "iterationPath", label: "Iteration Path", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 2_048, placeholder: "Project\\Sprint 1" },
      { name: "assignedTo", label: "Assigned To", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 512, placeholder: "name@example.com" },
      { name: "priority", label: "Priority", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 1, maximum: 100_000, placeholder: "1" },
      { name: "tags", label: "Tags (semicolon-separated)", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 4_000, placeholder: "backend; urgent" },
      { name: "state", label: "State", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 128, placeholder: "Active" },
      { name: "reproSteps", label: "Repro Steps (Markdown)", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 100_000, multiline: true, placeholder: "Replacement raw Markdown reproduction steps" },
      { name: "systemInfo", label: "System Info (Markdown)", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 100_000, multiline: true, placeholder: "Replacement raw Markdown system information" },
      { name: "severity", label: "Severity", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 128, placeholder: "Severity validated by the Project process" },
      { name: "acceptanceCriteria", label: "Acceptance Criteria (Markdown)", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 100_000, multiline: true, placeholder: "Replacement raw Markdown acceptance criteria" },
      { name: "originalEstimate", label: "Original Estimate", type: "number", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, placeholder: "0.5" },
      { name: "remainingWork", label: "Remaining Work", type: "number", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, placeholder: "0.5" },
      { name: "completedWork", label: "Completed Work", type: "number", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, placeholder: "0.5" },
      { name: "activity", label: "Activity", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 128, placeholder: "Development, Testing..." },
      { name: "storyPoints", label: "Story Points", type: "number", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, placeholder: "3.5" },
      { name: "effort", label: "Effort", type: "number", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, placeholder: "3.5" },
      { name: "size", label: "Size", type: "number", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, placeholder: "3.5" },
      { name: "businessValue", label: "Business Value", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], minimum: 0, maximum: 100_000, placeholder: "100" },
    ],
  },
  azure_devops_publish_pipeline_yaml: {
    label: "Publish Pipeline YAML",
    note: "只有使用者明確要求提交 YAML 時才呼叫；工具會新增至 Repository default branch、建立 Git commit，並可能觸發既有 CI。Repository identity 必須只選一種；同路徑相同內容為 no-op，不同內容會回報 conflict。",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", forcedMode: "fixed", required: true, source: "Shared selected ADO Project context" },
      { name: "repositoryReference", label: "Repository reference", type: "string", defaultMode: "agent", modes: ["fixed", "agent"], maxLength: 300, placeholder: "azure-devops://org/project/<repository-id>" },
      { name: "repositoryID", label: "Repository ID", type: "uuid", defaultMode: "agent", modes: ["fixed", "agent"] },
      { name: "repositoryName", label: "Repository name", type: "string", defaultMode: "agent", modes: ["fixed", "agent"], maxLength: 128 },
      { name: "path", label: "Repository-relative YAML path", type: "string", defaultMode: "agent", modes: ["fixed", "agent"], required: true, requiredAlways: true, maxLength: 1_024, format: "pipeline-yaml-path", placeholder: "pipelines/build.yml" },
      { name: "yamlContent", label: "Complete YAML content", type: "string", defaultMode: "agent", forcedMode: "agent", required: true, requiredAlways: true, maxLength: 100_000, multiline: true, placeholder: "每次呼叫由 Agent 提供；不會儲存到 Project Context" },
    ],
  },
  azure_devops_preview_pipeline: {
    label: "Preview Pipeline",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", forcedMode: "fixed", modes: ["fixed"], required: true, source: "Shared selected ADO Project context" },
      { name: "pipelineId", label: "Pipeline ID", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, minimum: 1, maximum: 2_147_483_647 },
      { name: "branchRef", label: "Branch ref", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 255, format: "azure-devops-branch-ref", placeholder: "refs/heads/main" },
      { name: "templateParameters", label: "Template parameters (JSON)", type: "json", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 10_000, multiline: true, placeholder: "{\n  \"environment\": \"staging\"\n}" },
    ],
  },
  azure_devops_run_pipeline: {
    label: "Run Pipeline",
    note: "只有明確呼叫 Run Pipeline tool 才會啟動執行；Preview、YAML 發布與 Pipeline 定義建立都不會建立 run。",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", forcedMode: "fixed", modes: ["fixed"], required: true, source: "Shared selected ADO Project context" },
      { name: "pipelineId", label: "Pipeline ID", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, minimum: 1, maximum: 2_147_483_647 },
      { name: "branchRef", label: "Branch ref", type: "string", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 255, format: "azure-devops-branch-ref", placeholder: "refs/heads/main" },
      { name: "templateParameters", label: "Template parameters (JSON)", type: "json", defaultMode: "agent", modes: ["agent", "fixed"], maxLength: 10_000, multiline: true, placeholder: "{\n  \"environment\": \"staging\"\n}" },
    ],
  },
  azure_devops_get_pipeline_run: {
    label: "Get Pipeline run",
    fields: [
      { name: "organization", label: "Organization", type: "string", defaultMode: "derived", forcedMode: "derived", source: "Shared Azure DevOps Organization context" },
      { name: "project", label: "ADO Project", type: "string", defaultMode: "fixed", forcedMode: "fixed", modes: ["fixed"], required: true, source: "Shared selected ADO Project context" },
      { name: "pipelineId", label: "Pipeline ID", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, minimum: 1, maximum: 2_147_483_647 },
      { name: "runId", label: "Run ID", type: "integer", defaultMode: "agent", modes: ["agent", "fixed"], required: true, requiredAlways: true, minimum: 1, maximum: 2_147_483_647 },
    ],
  },
};

const SENSITIVE_KEY_PATTERN = /(?:api[-_]?key|access[-_]?token|refresh[-_]?token|token|secret|password|passwd|authorization|credential|private[-_]?key|(?:^|[^a-z0-9])pat(?:$|[^a-z0-9]))/i;
const SECRET_VALUE_PATTERN = /(?:pat[-_]|bearer\s+|token[-_]|secret[-_])/i;

export async function activate(host) {
  return {
    extensionId: "azure-devops-platform",
    version: "1.6.46",
    capabilities: ["azure-devops.context", "azure-devops.work-items", "azure-devops.team-management", "azure-devops.board-management", "azure-devops.board-columns", "azure-devops.dashboard-management"],
    editor: {
      mount(container, context) {
        return mount(host, container, context);
      },
    },
  };
}

export async function deactivate() {}

function mount(host, container, context) {
  const projectName = typeof context?.projectName === "string" ? context.projectName : "current project";
  const onBack = typeof context?.onBack === "function" ? context.onBack : undefined;
  const style = document.createElement("style");
  style.textContent = STYLE;
  const root = document.createElement("section");
  root.className = "ado-editor";
  root.setAttribute("aria-label", "Azure DevOps advanced configuration");
  root.innerHTML = `
    <header class="ado-header">
      <button class="ado-back" data-back type="button"${onBack ? "" : " disabled"}><span aria-hidden="true">←</span> 返回</button>
      <div class="ado-header-content">
        <h1>Azure DevOps 完整管理設定</h1>
        <p class="ado-muted">Organization、Project、Team、Board、Iteration、AssignedTo 與 Dashboard 都在此設定；目前 OpenCode Project：${escapeHtml(projectName)}。</p>
      </div>
    </header>

    <section class="ado-section">
      <div><h2>1. Organization 與 PAT</h2><p class="ado-muted">PAT 只送到 package backend。驗證成功後會載入目前 Organization 可存取的 Projects。</p></div>
      <form data-auth-form>
        <div class="ado-grid">
          <label class="ado-field">Organization<input data-organization autocomplete="organization" placeholder="contoso" required></label>
          <label class="ado-field">Personal Access Token<input data-token type="password" autocomplete="new-password" required></label>
        </div>
        <div class="ado-actions"><button class="ado-button" data-verify type="submit">驗證 PAT 並載入 Projects</button><span class="ado-status" data-auth-status role="status" aria-live="polite">尚未驗證。</span></div>
        <pre class="ado-result" data-auth-result hidden></pre>
      </form>
    </section>

    <section class="ado-section" data-context-section hidden>
      <div><h2>2. Default ADO Context</h2><p class="ado-muted">Organization、Project、Wiki 與 Team policy 會儲存在此 Extension 的 project-scoped settings，不會建立 OpenCode MCP server。</p></div>
      <div class="ado-grid">
        <label class="ado-field">作用的 Azure DevOps Project<select data-project required><option value="">請先驗證 PAT</option></select></label>
        <label class="ado-field">作用的 Wiki<select data-wiki disabled><option value="">選擇 Project 後同步 Wiki ID</option></select></label>
        <label class="ado-field">作用的 Team<select data-team disabled><option value="">先選擇 Project</option></select></label>
        <label class="ado-field">Default AssignedTo<select data-assigned disabled><option value="">目前使用者 / 不限制</option></select></label>
        <label class="ado-field">Default Area Path<select data-area disabled><option value="">不指定</option></select></label>
        <label class="ado-field">Default Iteration Path<select data-iteration disabled><option value="">不指定</option></select></label>
        <label class="ado-field">Default Board<select data-board disabled><option value="">不指定</option></select></label>
        <label class="ado-field">Default Dashboard<select data-dashboard disabled><option value="">不指定</option></select></label>
      </div>
      <div class="ado-grid-wide"><span class="ado-muted">使用 ADO 預設名稱「ProjectName.wiki」建立 Project Wiki。</span><button class="ado-button secondary" data-create-project-wiki type="button" disabled>新增 Project Wiki</button></div>
      <span class="ado-status" data-wiki-create-status role="status" aria-live="polite"></span>
      <div class="ado-actions"><button class="ado-button" data-save-context type="button" disabled>儲存 Default Context</button><span class="ado-status" data-context-status role="status" aria-live="polite"></span></div>
    </section>

    <section class="ado-section" data-policy-section>
      <div><h2>3. Custom Tool Parameter Policy</h2><p class="ado-muted">每個欄位都會保存到目前 Project 的 Azure DevOps Extension settings。fixed 由 context 決定、agent 每次呼叫提供，derived 由受控 context、Azure DevOps metadata、current worktree 或 credential broker 解析；Wiki ID 預設由目前 Organization 與 Project 同步。Push 與 Pull 的 Repository path 每次呼叫必填：fixed 模式須傳入 UI 指定的相同路徑，agent 模式可從 Clone 結果帶入；Work Item type 與 title 則在 fixed 或 agent 欄位解析後必填。</p></div>
      <div class="ado-policy-tools" data-policy-tools></div>
      <div class="ado-actions"><button class="ado-button" data-save-policy type="button" disabled>儲存 Tool Policy</button><span class="ado-status" data-policy-status role="status" aria-live="polite"></span></div>
    </section>

    <section class="ado-section" data-team-section hidden>
      <div><h2>4. Team、Board 與工作日</h2><p class="ado-muted">這些按鈕會直接呼叫 Azure DevOps REST API，需 PAT 具備對應的 Project/Team/Work/Dashboard 寫入權限。</p></div>
      <div class="ado-grid">
        <label class="ado-field">Bugs 行為<select data-bugs-behavior><option value="off">Off</option><option value="asTasks">As tasks</option><option value="asRequirements">As requirements</option></select></label>
        <label class="ado-field">Default Iteration Macro<input data-iteration-macro placeholder="@CurrentIteration"></label>
        <label class="ado-field">Default Iteration<select data-default-iteration><option value="">不變更</option></select></label>
        <label class="ado-field">Backlog Iteration<select data-backlog-iteration><option value="">不變更</option></select></label>
      </div>
      <div><h3>Working Days</h3><div class="ado-check-grid" data-working-days>
        <label class="ado-check"><input type="checkbox" value="monday">週一</label><label class="ado-check"><input type="checkbox" value="tuesday">週二</label><label class="ado-check"><input type="checkbox" value="wednesday">週三</label><label class="ado-check"><input type="checkbox" value="thursday">週四</label><label class="ado-check"><input type="checkbox" value="friday">週五</label><label class="ado-check"><input type="checkbox" value="saturday">週六</label><label class="ado-check"><input type="checkbox" value="sunday">週日</label>
      </div></div>
      <div><h3>Backlog Visibility</h3><div class="ado-check-grid" data-backlog-visibility>
        <label class="ado-check"><input type="checkbox" value="Microsoft.EpicCategory">Epic</label><label class="ado-check"><input type="checkbox" value="Microsoft.FeatureCategory">Feature</label><label class="ado-check"><input type="checkbox" value="Microsoft.RequirementCategory">Requirement</label>
      </div></div>
      <div class="ado-actions"><button class="ado-button" data-save-team-settings type="button">儲存 Team Settings</button><span class="ado-status" data-team-status role="status" aria-live="polite"></span></div>
      <div class="ado-divider"></div>
      <div><h3>Board Columns / WIP Limits</h3><div class="ado-grid-wide"><label class="ado-field">Board<select data-board-admin><option value="">請先選擇 Team</option></select></label><button class="ado-button secondary" data-load-board-columns type="button">載入 Columns</button></div><div class="ado-list" data-board-columns></div><div class="ado-actions"><button class="ado-button secondary" data-save-board-columns type="button">儲存 Board Columns</button><span class="ado-status" data-board-status role="status" aria-live="polite"></span></div></div>
      <div class="ado-divider"></div>
      <div class="ado-grid-wide"><label class="ado-field">Team Area Paths<input data-area-values placeholder="每行一個 Area Path，例如 Contoso\\Platform"></label><label class="ado-check"><input data-area-children type="checkbox">包含子 Area</label></div>
      <div class="ado-actions"><button class="ado-button secondary" data-save-area-values type="button">儲存 Team Area Paths</button><span class="ado-status" data-area-status role="status" aria-live="polite"></span></div>
      <div class="ado-divider"></div>
      <div><h3>Team Iterations / Sprints</h3><div class="ado-grid-wide"><label class="ado-field">加入 Project Iteration<select data-add-iteration disabled><option value="">沒有可加入的 Iteration</option></select></label><button class="ado-button secondary" data-add-iteration-button type="button" disabled>加入 Team</button></div><ul class="ado-list" data-team-iterations></ul></div>
      <div class="ado-divider"></div>
      <div><h3>Team 組織管理</h3><div class="ado-grid"><label class="ado-field">Team 名稱<input data-team-name placeholder="Platform Team"></label><label class="ado-field">Team 描述<input data-team-description placeholder="Team description"></label></div><div class="ado-actions"><button class="ado-button secondary" data-create-team type="button">建立 Team</button><button class="ado-button secondary" data-update-team type="button">更新目前 Team</button><button class="ado-button danger" data-delete-team type="button">刪除目前 Team</button><span class="ado-status" data-team-admin-status role="status" aria-live="polite"></span></div></div>
    </section>

    <section class="ado-section" data-dashboard-section hidden>
      <div><h2>5. Dashboard 與 Widgets</h2><p class="ado-muted">可列出、建立、重新命名、刪除 Team Dashboard，並新增或刪除 Widget。刪除操作會先要求確認。</p></div>
      <div class="ado-grid"><label class="ado-field">Dashboard<select data-dashboard-admin><option value="">請先選擇 Team</option></select></label><label class="ado-field">Dashboard 名稱<input data-dashboard-name placeholder="Overview"></label><label class="ado-field">Dashboard 描述<input data-dashboard-description placeholder="Team dashboard"></label></div>
      <div class="ado-actions"><button class="ado-button secondary" data-create-dashboard type="button">建立 Dashboard</button><button class="ado-button secondary" data-update-dashboard type="button">更新 Dashboard</button><button class="ado-button danger" data-delete-dashboard type="button">刪除 Dashboard</button><span class="ado-status" data-dashboard-status role="status" aria-live="polite"></span></div>
      <div class="ado-divider"></div>
      <div><h3>新增 Widget</h3><div class="ado-widget-form"><label class="ado-field">名稱<input data-widget-name placeholder="My Work"></label><label class="ado-field">Contribution ID<input data-widget-contribution value="ms.vss-dashboards-web.Microsoft.VisualStudioOnline.Dashboards.MarkdownWidget"></label><label class="ado-field">Row<input data-widget-row type="number" min="0" value="0"></label><label class="ado-field">Column<input data-widget-column type="number" min="0" value="0"></label><label class="ado-field">Row Span<input data-widget-row-span type="number" min="1" value="2"></label><label class="ado-field">Column Span<input data-widget-column-span type="number" min="1" value="4"></label></div><label class="ado-field">Widget Settings JSON<textarea data-widget-settings placeholder="{&quot;title&quot;:&quot;My Work&quot;}"></textarea></label><div class="ado-actions"><button class="ado-button" data-create-widget type="button">新增 Widget</button></div></div>
      <div><h3>目前 Widgets</h3><div class="ado-widget-list" data-widget-list></div></div>
    </section>

    <section class="ado-section" data-team-members-section hidden>
      <div><h2>6. Team Members 與 Assigned</h2><p class="ado-muted">AssignedTo 的選擇會保存為目前 Project 的 Extension settings；指定成員提供給管理操作使用。</p></div>
      <div class="ado-grid-wide"><label class="ado-field">加入成員 Identity ID<input data-member-id placeholder="00000000-0000-0000-0000-000000000000"></label><button class="ado-button secondary" data-add-member type="button">加入 Team</button></div>
      <div class="ado-list" data-members-list></div>
      <span class="ado-status" data-member-status role="status" aria-live="polite"></span>
    </section>

    <section class="ado-section" data-resource-section>
      <div><h2>Package Resources</h2><p class="ado-muted">套件提供的 OpenCode Plugin capabilities。</p></div>
      <ul class="ado-list"><li><div class="ado-list-copy"><strong>Skills</strong><span>Minimal API Service Cloud Run Pipeline</span></div><span class="ado-pill">1</span></li><li><div class="ado-list-copy"><strong>Plugin Tools</strong><span>Repository、Pipeline、Pull Request、Work Item revision、Work Item、Wiki 與 Git</span></div><span class="ado-pill">22</span></li></ul>
    </section>
  `;
  container.replaceChildren(style, root);

  const query = (selector) => root.querySelector(selector);
  const organizationInput = query("[data-organization]");
  const tokenInput = query("[data-token]");
  const authForm = query("[data-auth-form]");
  const verifyButton = query("[data-verify]");
  const authStatus = query("[data-auth-status]");
  const authResult = query("[data-auth-result]");
  const contextSection = query("[data-context-section]");
  const projectSelect = query("[data-project]");
  const wikiSelect = query("[data-wiki]");
  const createProjectWikiButton = query("[data-create-project-wiki]");
  const wikiCreateStatus = query("[data-wiki-create-status]");
  const teamSelect = query("[data-team]");
  const assignedSelect = query("[data-assigned]");
  const areaSelect = query("[data-area]");
  const iterationSelect = query("[data-iteration]");
  const boardSelect = query("[data-board]");
  const dashboardSelect = query("[data-dashboard]");
  const saveContextButton = query("[data-save-context]");
  const contextStatus = query("[data-context-status]");
  const policyTools = query("[data-policy-tools]");
  const savePolicyButton = query("[data-save-policy]");
  const policyStatus = query("[data-policy-status]");
  const teamSection = query("[data-team-section]");
  const dashboardSection = query("[data-dashboard-section]");
  const membersSection = query("[data-team-members-section]");
  const state = { boardColumns: [], boards: [], classifications: { areas: [], iterations: [] }, dashboards: [], fieldValues: undefined, iterations: [], members: [], organization: "", parameterPolicy: createDefaultParameterPolicy(), profile: undefined, projects: [], saved: {}, settings: {}, team: undefined, teams: [], wikis: [] };
  let disposed = false;
  const cleanups = [];

  const listen = (target, event, handler) => {
    target?.addEventListener(event, handler);
    cleanups.push(() => target?.removeEventListener(event, handler));
  };
  const setStatus = (element, message, kind = "") => {
    if (!element) return;
    element.textContent = message;
    element.dataset.kind = kind;
  };
  const credentials = () => {
    const organization = String(organizationInput?.value || "").trim();
    const token = String(tokenInput?.value || "").trim();
    if (!organization || !token) throw new Error("請先輸入 Organization 與 PAT。");
    return { organization, token };
  };
  const callBackend = (path, body = {}) => host.api.callExtensionBackend(path, { body: { ...credentials(), ...body }, method: "POST", scope: "project" });
  const runButton = async (button, action) => {
    if (button) button.disabled = true;
    try { await action(); } catch (error) { host.ui.showError(error instanceof Error ? error.message : String(error)); } finally { if (button) button.disabled = false; }
  };

  listen(query("[data-back]"), "click", () => onBack?.());
  listen(authForm, "submit", (event) => { event.preventDefault(); void verifyOrganization(); });
  listen(projectSelect, "change", () => { state.project = projectSelect.value; void loadProjectContext(); });
  listen(createProjectWikiButton, "click", () => void runButton(createProjectWikiButton, createProjectWiki));
  listen(teamSelect, "change", () => { state.team = state.teams.find((item) => item.id === teamSelect.value || item.name === teamSelect.value); void loadTeamContext(); });
  listen(boardSelect, "change", () => { query("[data-board-admin]").value = boardSelect.value; void loadBoardColumns(); });
  listen(dashboardSelect, "change", () => { query("[data-dashboard-admin]").value = dashboardSelect.value; renderDashboardDetails(); });
  listen(saveContextButton, "click", () => void runButton(saveContextButton, saveDefaultContext));
  listen(query("[data-save-team-settings]"), "click", () => void runButton(query("[data-save-team-settings]"), saveTeamSettings));
  listen(query("[data-save-area-values]"), "click", () => void runButton(query("[data-save-area-values]"), saveAreaValues));
  listen(query("[data-add-iteration-button]"), "click", () => void runButton(query("[data-add-iteration-button]"), addIteration));
  listen(query("[data-create-team]"), "click", () => void runButton(query("[data-create-team]"), createTeam));
  listen(query("[data-update-team]"), "click", () => void runButton(query("[data-update-team]"), updateTeam));
  listen(query("[data-delete-team]"), "click", () => void runButton(query("[data-delete-team]"), deleteTeam));
  listen(query("[data-add-member]"), "click", () => void runButton(query("[data-add-member]"), addMember));
  listen(query("[data-board-admin]"), "change", () => { boardSelect.value = query("[data-board-admin]").value; void loadBoardColumns(); });
  listen(query("[data-load-board-columns]"), "click", () => void runButton(query("[data-load-board-columns]"), loadBoardColumns));
  listen(query("[data-save-board-columns]"), "click", () => void runButton(query("[data-save-board-columns]"), saveBoardColumns));
  listen(query("[data-dashboard-admin]"), "change", () => { dashboardSelect.value = query("[data-dashboard-admin]").value; renderDashboardDetails(); });
  listen(query("[data-create-dashboard]"), "click", () => void runButton(query("[data-create-dashboard]"), createDashboard));
  listen(query("[data-update-dashboard]"), "click", () => void runButton(query("[data-update-dashboard]"), updateDashboard));
  listen(query("[data-delete-dashboard]"), "click", () => void runButton(query("[data-delete-dashboard]"), deleteDashboard));
  listen(query("[data-create-widget]"), "click", () => void runButton(query("[data-create-widget]"), createWidget));
  listen(query("[data-widget-list]"), "click", (event) => { const button = event.target.closest("[data-delete-widget]"); if (button) void runButton(button, () => deleteWidget(button.dataset.deleteWidget)); });
  listen(policyTools, "change", (event) => {
    if (event.target.matches("[data-policy-mode]")) {
      updatePolicyFromControls();
      renderParameterPolicy();
      return;
    }
    if (event.target.matches("[data-policy-required]")) updatePolicyFromControls();
  });
  listen(policyTools, "input", (event) => { if (event.target.matches("[data-policy-value]")) updatePolicyFromControls(); });
  listen(savePolicyButton, "click", () => void runButton(savePolicyButton, saveParameterPolicy));

  renderParameterPolicy();
  void loadSavedConfiguration();

  async function loadSavedConfiguration() {
    try {
      const extensionSettings = await host.api.readExtensionSettings("project");
      const savedContext = isRecord(extensionSettings.azureDevOps) ? safeContextDocument(extensionSettings.azureDevOps) : {};
      state.saved = {
        area: stringValue(savedContext.area, ""),
        assigned: stringValue(savedContext.assignedTo, ""),
        board: stringValue(savedContext.board, ""),
        dashboard: stringValue(savedContext.dashboard, ""),
        iteration: stringValue(savedContext.iteration, ""),
        project: stringValue(savedContext.project, ""),
        team: stringValue(savedContext.team, ""),
        wikiIdentifier: stringValue(savedContext.wikiIdentifier, ""),
      };
      state.organization = stringValue(savedContext.organization, "");
      if (state.organization && !organizationInput.value) organizationInput.value = state.organization;
      state.parameterPolicy = normalizeParameterPolicy(savedContext.parameterPolicy, state.saved.project);
      renderParameterPolicy();
    } catch {
      state.saved = {};
      state.parameterPolicy = createDefaultParameterPolicy();
      renderParameterPolicy();
    }
  }

  async function verifyOrganization() {
    if (verifyButton) verifyButton.disabled = true;
    setStatus(authStatus, "正在驗證 PAT 並載入 Organization Projects...", "busy");
    try {
      const response = await callBackend("verify-token");
      if (disposed) return;
      authResult.textContent = JSON.stringify(response, null, 2);
      authResult.hidden = false;
      if (!response?.valid || !response?.organizationAccessible) {
        setStatus(authStatus, response?.valid ? "PAT 有效，但無法存取 Organization。" : "PAT 無效。", "error");
        contextSection.hidden = true;
        return;
      }
      state.organization = response.organization;
      state.profile = response.profile;
      state.projects = normalizeProjects(response.projects);
      renderProjects();
      contextSection.hidden = false;
      setStatus(authStatus, `PAT 驗證成功，已載入 ${state.projects.length} 個 Projects。請選擇作用 Project。`, "success");
      if (state.projects.length > 0 && projectSelect.value) await loadProjectContext();
    } catch (error) {
      setStatus(authStatus, error instanceof Error ? error.message : "PAT 驗證失敗。", "error");
    } finally {
      if (!disposed && verifyButton) verifyButton.disabled = false;
    }
  }

  function renderProjects() {
    setOptions(projectSelect, state.projects, "請選擇作用的 Project", (item) => item.name, (item) => `${item.name}${item.state ? ` · ${item.state}` : ""}`, state.saved.project);
    saveContextButton.disabled = !projectSelect.value;
    syncFixedProject(projectSelect.value);
    updatePolicySaveState();
  }

  async function loadProjectContext() {
    const project = projectSelect.value;
    resetTeamSections();
    state.wikis = [];
    setOptions(wikiSelect, [], "先同步 Organization 與 Project", (wiki) => wiki.id, (wiki) => wiki.name, "", true);
    wikiSelect.disabled = true;
    createProjectWikiButton.disabled = true;
    setStatus(wikiCreateStatus, "");
    syncFixedProject(project);
    updatePolicySaveState();
    if (!project) { saveContextButton.disabled = true; return; }
    saveContextButton.disabled = true;
    setStatus(contextStatus, "正在載入 Teams、Area Paths、Iterations 與 Wiki IDs...", "busy");
    try {
      await callBackend("store-credential", { project });
      const [teams, areas, iterations, wikis] = await Promise.all([
        callBackend("list-teams", { project }),
        callBackend("list-classification-nodes", { kind: "areas", project }),
        callBackend("list-classification-nodes", { kind: "iterations", project }),
        callBackend("list-project-wikis", { project }),
      ]);
      state.teams = normalizeTeams(teams?.teams);
      state.classifications.areas = normalizeNodes(areas?.nodes);
      state.classifications.iterations = normalizeNodes(iterations?.nodes);
      state.wikis = normalizeWikis(wikis?.wikis);
      renderWikis();
      setOptions(teamSelect, state.teams, "不指定 Team", (item) => item.id, (item) => item.name, state.saved.team, true);
      setOptions(areaSelect, state.classifications.areas, "不指定 Area Path", (item) => item.path, (item) => item.path, state.saved.area, true);
      setOptions(iterationSelect, state.classifications.iterations, "不指定 Iteration Path", (item) => item.path, (item) => item.path, state.saved.iteration, true);
      teamSelect.disabled = false;
      areaSelect.disabled = false;
      iterationSelect.disabled = false;
      state.team = state.teams.find((item) => item.id === teamSelect.value || item.name === teamSelect.value);
      saveContextButton.disabled = false;
      createProjectWikiButton.disabled = false;
      setStatus(contextStatus, `Project context 已載入，並同步 ${state.wikis.length} 個 Wiki ID。可儲存 Project，或選擇 Team 進入完整管理。`, "success");
      if (state.team) await loadTeamContext();
    } catch (error) {
      setStatus(contextStatus, error instanceof Error ? error.message : "Project context 載入失敗。", "error");
    }
  }

  async function loadTeamContext() {
    const project = projectSelect.value;
    const team = state.team;
    if (!project || !team) { resetTeamSections(); return; }
    teamSection.hidden = false;
    dashboardSection.hidden = false;
    membersSection.hidden = false;
    setStatus(contextStatus, `正在載入 ${team.name} 的 Board、Members 與 Dashboards...`, "busy");
    try {
      const [members, settings, dashboards, boards] = await Promise.all([
        callBackend("list-team-members", { project, team: team.id }),
        callBackend("get-team-settings", { project, team: team.id }),
        callBackend("list-dashboards", { project, team: team.id }),
        callBackend("list-boards", { project, team: team.id }),
      ]);
      state.members = normalizeMembers(members?.members);
      state.settings = settings?.settings ?? {};
      state.fieldValues = settings?.fieldValues;
      state.iterations = normalizeIterations(settings?.iterations);
      state.dashboards = normalizeDashboards(dashboards?.dashboards);
      state.boards = normalizeBoards(boards?.boards);
      renderTeamContext();
      setStatus(contextStatus, `${team.name} context 已載入。`, "success");
    } catch (error) {
      setStatus(contextStatus, error instanceof Error ? error.message : "Team context 載入失敗。", "error");
    }
  }

  function renderTeamContext() {
    setOptions(assignedSelect, state.members, "目前使用者 / 不限制", (item) => item.displayName || item.uniqueName || item.id, (item) => item.mail ? `${item.displayName} · ${item.mail}` : item.displayName || item.uniqueName || item.id, state.saved.assigned, true);
    if (state.profile?.displayName && ![...assignedSelect.options].some((option) => option.value === state.profile.displayName)) {
      const option = new Option(`${state.profile.displayName} · current PAT user`, state.profile.displayName);
      assignedSelect.add(option, 1);
    }
    assignedSelect.disabled = false;
    applyTeamSettings(state.settings);
    renderAreaValues();
    renderTeamIterations();
    renderBoards();
    renderDashboards();
    renderMembers();
    query("[data-team-name]").value = state.team?.name ?? "";
    query("[data-team-description]").value = state.team?.description ?? "";
  }

  function applyTeamSettings(settings) {
    query("[data-bugs-behavior]").value = settings.bugsBehavior === "asTasks" || settings.bugsBehavior === "AsTasks" ? "asTasks" : settings.bugsBehavior === "asRequirements" || settings.bugsBehavior === "AsRequirements" ? "asRequirements" : "off";
    query("[data-iteration-macro]").value = settings.defaultIterationMacro ?? "";
    setOptions(query("[data-default-iteration]"), state.classifications.iterations, "不變更", (item) => item.id, (item) => item.path, settings.defaultIteration?.id ?? "", true);
    setOptions(query("[data-backlog-iteration]"), state.classifications.iterations, "不變更", (item) => item.id, (item) => item.path, settings.backlogIteration?.id ?? "", true);
    const days = new Set((settings.workingDays ?? []).map((day) => String(day).toLowerCase()));
    root.querySelectorAll("[data-working-days] input").forEach((input) => { input.checked = days.has(input.value); });
    const visibility = settings.backlogVisibilities ?? {};
    root.querySelectorAll("[data-backlog-visibility] input").forEach((input) => { input.checked = visibility[input.value] !== false; });
  }

  async function saveDefaultContext() {
    const project = projectSelect.value;
    if (!project) throw new Error("請先選擇作用的 Project。");
    const parameterPolicy = normalizeParameterPolicy(collectParameterPolicy(), project);
    const contextValues = {
      area: areaSelect.value,
      assigned: assignedSelect.value,
      board: boardSelect.value,
      dashboard: dashboardSelect.value,
      iteration: iterationSelect.value,
      parameterPolicy: compactParameterPolicy(parameterPolicy, project),
      project,
      team: state.team?.name ?? "",
      wikiIdentifier: wikiSelect.value,
    };
    assertParameterPolicyForSave(parameterPolicy);
    setStatus(contextStatus, "正在儲存 Default Context...", "busy");
    await saveAzureDevOpsSettings(host, contextValues, state.organization);
    state.parameterPolicy = parameterPolicy;
    state.saved = { ...state.saved, ...contextValues };
    renderParameterPolicy();
    setStatus(contextStatus, "Default Context 已儲存到目前 OpenCode Project。", "success");
  }

  async function createProjectWiki() {
    const project = projectSelect.value;
    if (!project) throw new Error("請先選擇作用的 Azure DevOps Project。");
    setStatus(wikiCreateStatus, `正在建立名稱為「${project}」的 Azure DevOps Project Wiki...`, "busy");
    let created;
    try {
      const response = await callBackend("create-project-wiki", { project });
      created = normalizeWikis(response?.wiki ? [response.wiki] : [])[0];
      if (!created) throw new Error("Azure DevOps 未回傳有效的 Wiki ID。");
      state.wikis = mergeWikis(state.wikis, [created]);
      state.saved.wikiIdentifier = created.id;
      renderWikis();
       await saveAzureDevOpsSettings(host, { project, wikiIdentifier: created.id }, state.organization);
      state.saved = { ...state.saved, project, wikiIdentifier: created.id };
      const resultMessage = response.recoveredExistingRepository && response.alreadyExists
        ? `已找到既有的 Code Wiki「${created.name}」，並重新選取。`
        : response.recoveredExistingRepository
          ? `已找到先前建立的 Wiki repository，並將它註冊為 Code Wiki「${created.name}」。`
        : response.alreadyExists
          ? `Project Wiki「${created.name}」已存在，已重新選取。`
          : `已建立 Project Wiki「${created.name}」。`;
      setStatus(wikiCreateStatus, `${resultMessage} Wiki ID ${created.id} 已同步到目前 Project Context。`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "建立 Project Wiki 失敗。";
      setStatus(wikiCreateStatus, created
        ? `${created.name} 已建立，但 Wiki ID 同步失敗：${message}`
        : message, "error");
      throw error;
    }
  }

  async function saveParameterPolicy() {
    const project = projectSelect.value || state.saved.project;
    if (!project) throw new Error("請先選擇作用的 Azure DevOps Project。");
    const parameterPolicy = normalizeParameterPolicy(collectParameterPolicy(), project);
    const storedParameterPolicy = compactParameterPolicy(parameterPolicy, project);
    const wikiIdentifier = wikiSelect.value || state.saved.wikiIdentifier || "";
    assertParameterPolicyForSave(parameterPolicy);
    setStatus(policyStatus, "正在儲存 Tool Policy...", "busy");
    await saveAzureDevOpsSettings(host, { parameterPolicy: storedParameterPolicy, project, wikiIdentifier }, state.organization);
    state.parameterPolicy = parameterPolicy;
    state.saved = { ...state.saved, parameterPolicy: storedParameterPolicy, project, wikiIdentifier };
    renderParameterPolicy();
    setStatus(policyStatus, "Custom Tool Policy 已儲存到目前 OpenCode Project。", "success");
  }

  async function saveTeamSettings() {
    if (!state.team) throw new Error("請先選擇 Team。");
    const settings = {
      backlogVisibilities: { ...(state.settings.backlogVisibilities ?? {}), ...Object.fromEntries([...root.querySelectorAll("[data-backlog-visibility] input")].map((input) => [input.value, input.checked])) },
      bugsBehavior: query("[data-bugs-behavior]").value,
      backlogIteration: query("[data-backlog-iteration]").value || undefined,
      defaultIteration: query("[data-default-iteration]").value || undefined,
      defaultIterationMacro: query("[data-iteration-macro]").value.trim() || null,
      workingDays: [...root.querySelectorAll("[data-working-days] input:checked")].map((input) => input.value),
    };
    setStatus(query("[data-team-status]"), "正在更新 Azure DevOps Team Settings...", "busy");
    const response = await callBackend("update-team-settings", { project: projectSelect.value, settings, team: state.team.id });
    state.settings = response.settings ?? state.settings;
    applyTeamSettings(state.settings);
    setStatus(query("[data-team-status]"), "Team Settings 已更新。", "success");
  }

  function renderAreaValues() {
    const values = state.fieldValues?.values ?? [];
    query("[data-area-values]").value = values.map((item) => item.value).join("\n");
    query("[data-area-children]").checked = values.some((item) => item.includeChildren);
  }

  async function saveAreaValues() {
    if (!state.team) throw new Error("請先選擇 Team。");
    const values = query("[data-area-values]").value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).map((value) => ({ includeChildren: query("[data-area-children]").checked, value }));
    const defaultValue = values.some((item) => item.value === state.fieldValues?.defaultValue) ? state.fieldValues.defaultValue : values[0]?.value;
    if (!defaultValue || values.length === 0) throw new Error("至少需要一個 Area Path。");
    setStatus(query("[data-area-status]"), "正在更新 Team Area Paths...", "busy");
    const response = await callBackend("update-team-field-values", { defaultValue, project: projectSelect.value, team: state.team.id, values });
    state.fieldValues = response.fieldValues;
    renderAreaValues();
    setOptions(areaSelect, state.fieldValues.values, "不指定 Area Path", (item) => item.value, (item) => item.value, state.saved.area, true);
    setStatus(query("[data-area-status]"), "Team Area Paths 已更新。", "success");
  }

  function renderTeamIterations() {
    const list = query("[data-team-iterations]");
    list.replaceChildren();
    if (!state.iterations.length) { list.append(emptyNode("目前 Team 沒有已加入的 Iteration。")); }
    state.iterations.forEach((iteration) => {
      const item = document.createElement("li");
      const copy = document.createElement("div"); copy.className = "ado-list-copy";
      const strong = document.createElement("strong"); strong.textContent = iteration.name || iteration.path || iteration.id;
      const span = document.createElement("span"); span.textContent = `${iteration.path || ""}${iteration.attributes?.timeFrame ? ` · ${iteration.attributes.timeFrame}` : ""}`;
      copy.append(strong, span);
      const button = document.createElement("button"); button.className = "ado-button danger"; button.type = "button"; button.textContent = "移除"; button.dataset.removeIteration = iteration.id;
      button.addEventListener("click", () => void runButton(button, () => removeIteration(iteration.id)));
      item.append(copy, button); list.append(item);
    });
    const available = state.classifications.iterations.filter((node) => !state.iterations.some((item) => item.id === node.id));
    setOptions(query("[data-add-iteration]"), available, "沒有可加入的 Iteration", (item) => item.id, (item) => item.path, "");
    query("[data-add-iteration]").disabled = available.length === 0;
    query("[data-add-iteration-button]").disabled = available.length === 0;
  }

  function renderBoards() {
    setOptions(boardSelect, state.boards, "不指定 Board", (item) => item.name, (item) => item.name, state.saved.board, true);
    setOptions(query("[data-board-admin]"), state.boards, "請選擇 Board", (item) => item.name, (item) => item.name, boardSelect.value || state.saved.board);
    boardSelect.disabled = false;
    if (query("[data-board-admin]").value) boardSelect.value = query("[data-board-admin]").value;
    void loadBoardColumns();
  }

  async function loadBoardColumns() {
    const board = query("[data-board-admin]").value || boardSelect.value;
    if (!state.team || !board) {
      state.boardColumns = [];
      renderBoardColumns();
      return;
    }
    setStatus(query("[data-board-status]"), "正在載入 Board Columns...", "busy");
    try {
      const response = await callBackend("get-board-columns", { board, project: projectSelect.value, team: state.team.id });
      state.boardColumns = Array.isArray(response?.columns) ? response.columns : [];
      renderBoardColumns();
      setStatus(query("[data-board-status]"), `已載入 ${state.boardColumns.length} 個 Board Columns。`, "success");
    } catch (error) {
      setStatus(query("[data-board-status]"), error instanceof Error ? error.message : "Board Columns 載入失敗。", "error");
    }
  }

  function renderBoardColumns() {
    const list = query("[data-board-columns]");
    list.replaceChildren();
    if (!state.boardColumns.length) { list.append(emptyNode("請選擇 Board 並載入 Columns。")); return; }
    state.boardColumns.forEach((column, index) => {
      const row = document.createElement("div"); row.className = "ado-widget-row"; row.dataset.boardColumnIndex = String(index);
      const copy = document.createElement("div"); copy.className = "ado-list-copy";
      const strong = document.createElement("strong"); strong.textContent = column.name;
      const span = document.createElement("span"); span.textContent = `${column.columnType || "inProgress"} · ${column.id || "new"}`;
      copy.append(strong, span);
      const controls = document.createElement("div"); controls.className = "ado-actions";
      const limit = document.createElement("input"); limit.className = "ado-field"; limit.type = "number"; limit.min = "0"; limit.max = "1000"; limit.value = String(column.itemLimit ?? 0); limit.title = "WIP limit"; limit.dataset.columnLimit = "";
      const split = document.createElement("label"); split.className = "ado-check"; split.textContent = "Split";
      const splitInput = document.createElement("input"); splitInput.type = "checkbox"; splitInput.checked = column.isSplit === true; splitInput.dataset.columnSplit = ""; split.prepend(splitInput);
      const name = document.createElement("input"); name.className = "ado-field"; name.value = column.name; name.title = "Column name"; name.dataset.columnName = "";
      controls.append(name, limit, split); row.append(copy, controls); list.append(row);
    });
  }

  async function saveBoardColumns() {
    const board = query("[data-board-admin]").value || boardSelect.value;
    if (!state.team || !board || !state.boardColumns.length) throw new Error("請先載入 Board Columns。");
    const columns = [...query("[data-board-columns]").querySelectorAll("[data-board-column-index]")].map((row) => {
      const index = Number(row.dataset.boardColumnIndex);
      const original = state.boardColumns[index];
      return { ...original, isSplit: row.querySelector("[data-column-split]").checked, itemLimit: numberValue(row.querySelector("[data-column-limit]"), 0), name: row.querySelector("[data-column-name]").value.trim() };
    });
    setStatus(query("[data-board-status]"), "正在更新 Board Columns / WIP Limits...", "busy");
    const response = await callBackend("update-board-columns", { board, columns, project: projectSelect.value, team: state.team.id });
    state.boardColumns = Array.isArray(response?.columns) ? response.columns : columns;
    renderBoardColumns();
    setStatus(query("[data-board-status]"), "Board Columns / WIP Limits 已更新。", "success");
  }

  async function addIteration() {
    const iterationID = query("[data-add-iteration]").value;
    if (!iterationID || !state.team) throw new Error("請先選擇要加入的 Iteration。");
    await callBackend("add-team-iteration", { iterationID, project: projectSelect.value, team: state.team.id });
    await loadTeamContext();
  }

  async function removeIteration(iterationID) {
    if (!state.team || !window.confirm("確定要從目前 Team 移除此 Iteration？")) return;
    await callBackend("remove-team-iteration", { iterationID, project: projectSelect.value, team: state.team.id });
    await loadTeamContext();
  }

  async function createTeam() {
    const name = query("[data-team-name]").value.trim();
    if (!name) throw new Error("請輸入 Team 名稱。");
    setStatus(query("[data-team-admin-status]"), "正在建立 Team...", "busy");
    const response = await callBackend("create-team", { description: query("[data-team-description]").value.trim(), name, project: projectSelect.value });
    await reloadTeams(response.team?.id);
    setStatus(query("[data-team-admin-status]"), "Team 已建立。", "success");
  }

  async function updateTeam() {
    if (!state.team) throw new Error("請先選擇 Team。");
    const name = query("[data-team-name]").value.trim();
    if (!name) throw new Error("請輸入 Team 名稱。");
    setStatus(query("[data-team-admin-status]"), "正在更新 Team...", "busy");
    const response = await callBackend("update-team", { description: query("[data-team-description]").value.trim(), name, project: projectSelect.value, teamID: state.team.id });
    await reloadTeams(response.team?.id ?? state.team.id);
    setStatus(query("[data-team-admin-status]"), "Team 已更新。", "success");
  }

  async function deleteTeam() {
    if (!state.team || !window.confirm(`確定要刪除 Team「${state.team.name}」？此操作會直接修改 Azure DevOps。`)) return;
    await callBackend("delete-team", { project: projectSelect.value, teamID: state.team.id });
    state.saved.team = "";
    await reloadTeams();
    setStatus(query("[data-team-admin-status]"), "Team 已刪除。", "success");
  }

  async function reloadTeams(selectedID) {
    const response = await callBackend("list-teams", { project: projectSelect.value });
    state.teams = normalizeTeams(response.teams);
    setOptions(teamSelect, state.teams, "不指定 Team", (item) => item.id, (item) => item.name, selectedID ?? state.team?.id ?? "", true);
    state.team = state.teams.find((item) => item.id === teamSelect.value);
    if (state.team) await loadTeamContext(); else resetTeamSections();
  }

  function renderMembers() {
    const list = query("[data-members-list]"); list.replaceChildren();
    if (!state.members.length) { list.append(emptyNode("目前無法載入 Team members，或 PAT 沒有成員讀取權限。")); return; }
    state.members.forEach((member) => {
      const item = document.createElement("li"); const copy = document.createElement("div"); copy.className = "ado-list-copy";
      const strong = document.createElement("strong"); strong.textContent = member.displayName || member.uniqueName || member.id;
      const span = document.createElement("span"); span.textContent = member.mail || member.uniqueName || member.id;
      const button = document.createElement("button"); button.className = "ado-button danger"; button.type = "button"; button.textContent = "移除";
      button.addEventListener("click", () => void runButton(button, () => removeMember(member.id)));
      copy.append(strong, span); item.append(copy, button); list.append(item);
    });
  }

  async function addMember() {
    if (!state.team) throw new Error("請先選擇 Team。");
    const memberID = query("[data-member-id]").value.trim();
    if (!memberID) throw new Error("請輸入 Identity ID。");
    setStatus(query("[data-member-status]"), "正在加入 Team member...", "busy");
    await callBackend("add-team-member", { memberID, project: projectSelect.value, team: state.team.id });
    query("[data-member-id]").value = "";
    await loadTeamContext();
    setStatus(query("[data-member-status]"), "Team member 已加入。", "success");
  }

  async function removeMember(memberID) {
    if (!state.team || !window.confirm("確定要從目前 Team 移除此成員？")) return;
    setStatus(query("[data-member-status]"), "正在移除 Team member...", "busy");
    await callBackend("remove-team-member", { memberID, project: projectSelect.value, team: state.team.id });
    await loadTeamContext();
    setStatus(query("[data-member-status]"), "Team member 已移除。", "success");
  }

  function renderDashboards() {
    setOptions(dashboardSelect, state.dashboards, "不指定 Dashboard", (item) => item.id, (item) => item.name, state.saved.dashboard, true);
    setOptions(query("[data-dashboard-admin]"), state.dashboards, "請選擇 Dashboard", (item) => item.id, (item) => item.name, state.saved.dashboard);
    dashboardSelect.disabled = false;
    renderDashboardDetails();
  }

  function renderDashboardDetails() {
    const selectedID = query("[data-dashboard-admin]").value || dashboardSelect.value;
    if (selectedID && dashboardSelect.value !== selectedID) dashboardSelect.value = selectedID;
    const dashboard = state.dashboards.find((item) => item.id === selectedID);
    query("[data-dashboard-name]").value = dashboard?.name ?? "";
    query("[data-dashboard-description]").value = dashboard?.description ?? "";
    const list = query("[data-widget-list]"); list.replaceChildren();
    if (!dashboard?.widgets?.length) { list.append(emptyNode("目前 Dashboard 沒有可管理的 Widget，或 API 沒有回傳 Widget 清單。")); return; }
    dashboard.widgets.forEach((widget) => {
      const row = document.createElement("div"); row.className = "ado-widget-row";
      const copy = document.createElement("div"); copy.className = "ado-list-copy";
      const strong = document.createElement("strong"); strong.textContent = widget.name || widget.id;
      const code = document.createElement("code"); code.textContent = widget.contributionId || "Unknown contribution";
      copy.append(strong, code);
      const button = document.createElement("button"); button.className = "ado-button danger"; button.type = "button"; button.textContent = "刪除"; button.dataset.deleteWidget = widget.id;
      row.append(copy, button); list.append(row);
    });
  }

  async function createDashboard() {
    if (!state.team) throw new Error("請先選擇 Team。");
    const name = query("[data-dashboard-name]").value.trim();
    if (!name) throw new Error("請輸入 Dashboard 名稱。");
    setStatus(query("[data-dashboard-status]"), "正在建立 Dashboard...", "busy");
    const response = await callBackend("create-dashboard", { description: query("[data-dashboard-description]").value.trim(), name, project: projectSelect.value, team: state.team.id });
    await reloadDashboards(response.dashboard?.id);
    setStatus(query("[data-dashboard-status]"), "Dashboard 已建立。", "success");
  }

  async function updateDashboard() {
    const dashboard = selectedDashboard();
    if (!dashboard) throw new Error("請先選擇 Dashboard。");
    setStatus(query("[data-dashboard-status]"), "正在更新 Dashboard...", "busy");
    const response = await callBackend("update-dashboard", { dashboardID: dashboard.id, description: query("[data-dashboard-description]").value.trim(), eTag: dashboard.eTag, name: query("[data-dashboard-name]").value.trim(), project: projectSelect.value, team: state.team.id });
    await reloadDashboards(response.dashboard?.id ?? dashboard.id);
    setStatus(query("[data-dashboard-status]"), "Dashboard 已更新。", "success");
  }

  async function deleteDashboard() {
    const dashboard = selectedDashboard();
    if (!dashboard || !window.confirm(`確定要刪除 Dashboard「${dashboard.name}」及其 Widgets？`)) return;
    await callBackend("delete-dashboard", { dashboardID: dashboard.id, project: projectSelect.value, team: state.team.id });
    await reloadDashboards();
    setStatus(query("[data-dashboard-status]"), "Dashboard 已刪除。", "success");
  }

  async function reloadDashboards(selectedID) {
    const response = await callBackend("list-dashboards", { project: projectSelect.value, team: state.team.id });
    state.dashboards = normalizeDashboards(response.dashboards);
    renderDashboards();
    if (selectedID) { query("[data-dashboard-admin]").value = selectedID; dashboardSelect.value = selectedID; renderDashboardDetails(); }
  }

  async function createWidget() {
    const dashboard = selectedDashboard();
    if (!dashboard) throw new Error("請先選擇 Dashboard。");
    let settings = query("[data-widget-settings]").value.trim();
    if (settings) { try { JSON.parse(settings); } catch { throw new Error("Widget Settings 必須是有效 JSON。"); } }
    const widget = { contributionId: query("[data-widget-contribution]").value.trim(), name: query("[data-widget-name]").value.trim(), position: { column: numberValue(query("[data-widget-column]"), 0), row: numberValue(query("[data-widget-row]"), 0) }, settings, settingsVersion: { major: 1, minor: 0, patch: 0 }, size: { columnSpan: numberValue(query("[data-widget-column-span]"), 4), rowSpan: numberValue(query("[data-widget-row-span]"), 2) } };
    await callBackend("create-dashboard-widget", { dashboardID: dashboard.id, project: projectSelect.value, team: state.team.id, widget });
    await reloadDashboards(dashboard.id);
    setStatus(query("[data-dashboard-status]"), "Widget 已新增。", "success");
  }

  async function deleteWidget(widgetID) {
    const dashboard = selectedDashboard();
    if (!dashboard || !window.confirm("確定要刪除這個 Dashboard Widget？")) return;
    await callBackend("delete-dashboard-widget", { dashboardID: dashboard.id, project: projectSelect.value, team: state.team.id, widgetID });
    await reloadDashboards(dashboard.id);
    setStatus(query("[data-dashboard-status]"), "Widget 已刪除。", "success");
  }

  function selectedDashboard() {
    const id = query("[data-dashboard-admin]").value || dashboardSelect.value;
    return state.dashboards.find((dashboard) => dashboard.id === id);
  }

  function renderParameterPolicy() {
    if (!policyTools) return;
    policyTools.replaceChildren();
    for (const [toolName, toolDefinition] of Object.entries(POLICY_TOOL_DEFINITIONS)) {
      const tool = document.createElement("section");
      tool.className = "ado-policy-tool";
      const heading = document.createElement("h3");
      heading.textContent = `${toolDefinition.label} · ${toolName}`;
      tool.append(heading);
      if (toolDefinition.note) {
        const note = document.createElement("p");
        note.className = "ado-muted";
        note.textContent = toolDefinition.note;
        tool.append(note);
      }
      const fields = document.createElement("div");
      fields.className = "ado-policy-fields";
      const configuredFields = state.parameterPolicy?.tools?.[toolName]?.fields ?? {};
      for (const fieldDefinition of toolDefinition.fields) {
        const configured = isRecord(configuredFields[fieldDefinition.name]) ? configuredFields[fieldDefinition.name] : {};
        const row = document.createElement("div");
        row.className = "ado-policy-field";
        const label = document.createElement("strong");
        label.textContent = fieldDefinition.label;
        const mode = document.createElement("select");
        mode.dataset.policyMode = "";
        mode.dataset.tool = toolName;
        mode.dataset.field = fieldDefinition.name;
        const modes = fieldDefinition.forcedMode ? [fieldDefinition.forcedMode] : fieldDefinition.modes ?? ["fixed", "agent", "derived"];
        const selectedMode = modes.includes(configured.mode) ? configured.mode : fieldDefinition.defaultMode;
        for (const optionValue of modes) {
          const option = new Option(optionValue, optionValue);
          mode.append(option);
        }
        mode.value = selectedMode;
        if (fieldDefinition.forcedMode) mode.disabled = true;
        const valueArea = document.createElement("div");
        valueArea.className = "ado-policy-value";
        if (selectedMode === "derived") {
          const derived = document.createElement("span");
          derived.className = "ado-policy-derived";
          derived.textContent = `唯讀 derived${fieldDefinition.source ? ` · ${fieldDefinition.source}` : ""}`;
          valueArea.append(derived);
        } else if (selectedMode === "fixed") {
          const input = Array.isArray(fieldDefinition.options)
            ? document.createElement("select")
            : fieldDefinition.multiline || fieldDefinition.type === "json" || fieldDefinition.type === "json-array"
              ? document.createElement("textarea")
              : document.createElement("input");
          const numeric = numericPolicy(fieldDefinition);
          input.dataset.policyValue = "";
          input.dataset.tool = toolName;
          input.dataset.field = fieldDefinition.name;
          if (!Array.isArray(fieldDefinition.options) && !fieldDefinition.multiline && fieldDefinition.type !== "json" && fieldDefinition.type !== "json-array") input.type = fieldDefinition.type === "boolean" ? "checkbox" : numeric ? "number" : "text";
          for (const optionDefinition of fieldDefinition.options ?? []) {
            input.append(new Option(optionDefinition.label, optionDefinition.value));
          }
          if (numeric) {
            input.min = String(numeric.minimum);
            input.step = numeric.step;
            if (numeric.maximum !== undefined) input.max = String(numeric.maximum);
          }
          if (Number.isInteger(fieldDefinition.maxLength)) input.maxLength = fieldDefinition.maxLength;
          if (fieldDefinition.requiredAlways) input.required = true;
          if (fieldDefinition.type === "boolean") input.checked = configured.value === true;
          else {
            input.value = policyValueText(configured.value, fieldDefinition);
            if (Array.isArray(fieldDefinition.options) && !input.value) input.value = fieldDefinition.options[0]?.value ?? "";
          }
          input.placeholder = fieldDefinition.placeholder ?? (fieldDefinition.defaultValue === undefined ? "固定值" : String(fieldDefinition.defaultValue));
          valueArea.append(input);
        } else {
          const requiredLabel = document.createElement("label");
          requiredLabel.className = "ado-policy-required";
          const required = document.createElement("input");
          required.type = "checkbox";
          required.dataset.policyRequired = "";
          required.dataset.tool = toolName;
          required.dataset.field = fieldDefinition.name;
          required.checked = fieldDefinition.requiredAlways === true || configured.required === true || (configured.required === undefined && fieldDefinition.required === true);
          required.disabled = fieldDefinition.requiredAlways === true;
          requiredLabel.append(required, document.createTextNode("每次呼叫必填"));
          valueArea.append(requiredLabel);
        }
        row.append(label, mode, valueArea);
        fields.append(row);
      }
      tool.append(fields);
      policyTools.append(tool);
    }
    updatePolicySaveState();
  }

  function renderWikis() {
    const selectedWikiIdentifier = selectWikiIdentifier(state.wikis, state.saved.wikiIdentifier);
    setOptions(
      wikiSelect,
      state.wikis,
      state.wikis.length ? "請選擇預設 Wiki" : "目前 Project 沒有可用 Wiki",
      (wiki) => wiki.id,
      (wiki) => `${wiki.name}${wiki.type === "projectWiki" ? " · Project Wiki" : ""} · ${wiki.id}`,
      selectedWikiIdentifier,
      true,
    );
    wikiSelect.disabled = state.wikis.length === 0;
    state.saved.wikiIdentifier = wikiSelect.value;
  }

  function updatePolicyFromControls() {
    try {
      state.parameterPolicy = collectParameterPolicy();
      setStatus(policyStatus, "Policy 有未儲存變更。", "busy");
    } catch (error) {
      setStatus(policyStatus, error instanceof Error ? error.message : "Policy 欄位無效。", "error");
    }
    updatePolicySaveState();
  }

  function collectParameterPolicy() {
    const policy = createDefaultParameterPolicy(projectSelect.value || state.saved.project);
    for (const [toolName, toolDefinition] of Object.entries(POLICY_TOOL_DEFINITIONS)) {
      const fields = policy.tools[toolName].fields;
      for (const fieldDefinition of toolDefinition.fields) {
        const modeInput = policyTools?.querySelector(`[data-policy-mode][data-tool="${toolName}"][data-field="${fieldDefinition.name}"]`);
        const mode = fieldDefinition.forcedMode || modeInput?.value || fieldDefinition.defaultMode;
        const field = { mode };
        if (mode === "fixed") {
          const valueInput = policyTools?.querySelector(`[data-policy-value][data-tool="${toolName}"][data-field="${fieldDefinition.name}"]`);
          const value = readPolicyInputValue(valueInput, fieldDefinition);
          if (value !== undefined) field.value = value;
        }
        if (mode === "agent") {
          const requiredInput = policyTools?.querySelector(`[data-policy-required][data-tool="${toolName}"][data-field="${fieldDefinition.name}"]`);
          field.required = fieldDefinition.requiredAlways === true || (requiredInput ? requiredInput.checked : fieldDefinition.required === true);
        }
        fields[fieldDefinition.name] = field;
      }
    }
    return policy;
  }

  function syncFixedProject(project) {
    if (!project) return;
    for (const toolName of Object.keys(POLICY_TOOL_DEFINITIONS)) {
      const projectField = state.parameterPolicy?.tools?.[toolName]?.fields?.project;
      if (projectField?.mode === "fixed") projectField.value = project;
    }
    renderParameterPolicy();
  }

  function updatePolicySaveState() {
    if (savePolicyButton) savePolicyButton.disabled = !(projectSelect?.value || state.saved.project);
  }

  function resetTeamSections() {
    state.team = undefined; state.members = []; state.iterations = []; state.dashboards = []; state.boards = []; state.boardColumns = []; state.settings = {}; state.fieldValues = undefined;
    teamSection.hidden = true; dashboardSection.hidden = true; membersSection.hidden = true;
    assignedSelect.disabled = true; boardSelect.disabled = true; dashboardSelect.disabled = true;
  }

  return {
    destroy() {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
      container.replaceChildren();
    },
  };
}

async function saveAzureDevOpsSettings(host, values, organization) {
  const currentSettings = await host.api.readExtensionSettings("project");
  const settings = isRecord(currentSettings) ? { ...currentSettings } : {};
  const context = isRecord(settings.azureDevOps) ? safeContextDocument(settings.azureDevOps) : {};
  if (organization) context.organization = organization;
  const contextKeys = { area: "area", assigned: "assignedTo", board: "board", dashboard: "dashboard", iteration: "iteration", project: "project", team: "team", wikiIdentifier: "wikiIdentifier", parameterPolicy: "parameterPolicy" };
  for (const [inputKey, contextKey] of Object.entries(contextKeys)) {
    if (!Object.prototype.hasOwnProperty.call(values, inputKey)) continue;
    if (values[inputKey] === undefined || values[inputKey] === "") delete context[contextKey];
    else context[contextKey] = values[inputKey];
  }
  context.parameterPolicy = compactParameterPolicy(context.parameterPolicy, stringValue(context.project, ""));
  settings.azureDevOps = context;
  await host.api.writeExtensionSettings(settings, "project");
}

function createDefaultParameterPolicy(adoProject) {
  return {
    version: 1,
    tools: Object.fromEntries(Object.entries(POLICY_TOOL_DEFINITIONS).map(([toolName, toolDefinition]) => [toolName, {
      fields: Object.fromEntries(toolDefinition.fields.map((field) => [field.name, {
        mode: field.forcedMode || field.defaultMode,
        ...(field.required ? { required: true } : {}),
        ...(field.name === "project" && adoProject ? { value: adoProject } : field.defaultValue === undefined ? {} : { value: field.defaultValue }),
      }])),
    }])),
  };
}

export function normalizeParameterPolicy(value, adoProject) {
  const defaults = createDefaultParameterPolicy(adoProject);
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.tools)) return defaults;
  for (const [toolName, toolDefinition] of Object.entries(POLICY_TOOL_DEFINITIONS)) {
    const rawTool = isRecord(value.tools[toolName]) && isRecord(value.tools[toolName].fields) ? value.tools[toolName] : {};
    for (const field of toolDefinition.fields) {
      const defaultField = defaults.tools[toolName].fields[field.name];
      const rawField = isRecord(rawTool.fields?.[field.name]) ? rawTool.fields[field.name] : {};
      const allowedModes = field.forcedMode ? [field.forcedMode] : field.modes ?? ["fixed", "agent", "derived"];
      const mode = allowedModes.includes(rawField.mode) ? rawField.mode : defaultField.mode;
      const normalized = { mode };
      if (mode === "fixed") {
        const fixedValue = safePolicyValue(rawField.value, field) ? rawField.value : defaultField.value;
        if (safePolicyValue(fixedValue, field)) normalized.value = fixedValue;
      }
      if (mode === "agent") {
        normalized.required = field.requiredAlways === true || (typeof rawField.required === "boolean" ? rawField.required : defaultField.required === true);
      } else if (defaultField.required === true) {
        normalized.required = true;
      }
      defaults.tools[toolName].fields[field.name] = normalized;
    }
  }
  return defaults;
}

export function compactParameterPolicy(value, adoProject) {
  const normalized = normalizeParameterPolicy(value, adoProject);
  const defaults = createDefaultParameterPolicy(adoProject);
  const tools = {};
  for (const [toolName, toolDefinition] of Object.entries(POLICY_TOOL_DEFINITIONS)) {
    const fields = {};
    for (const fieldDefinition of toolDefinition.fields) {
      const fieldName = fieldDefinition.name;
      const actual = normalized.tools[toolName].fields[fieldName];
      const defaultField = defaults.tools[toolName].fields[fieldName];
      const difference = {};
      if (actual.mode !== defaultField.mode) difference.mode = actual.mode;
      if (actual.mode === "fixed"
        && Object.prototype.hasOwnProperty.call(actual, "value")
        && (!Object.prototype.hasOwnProperty.call(defaultField, "value") || !samePolicyValue(actual.value, defaultField.value))) {
        difference.value = actual.value;
      }
      if (actual.mode === "agent") {
        const actualRequired = actual.required === true;
        const defaultRequired = defaultField.required === true;
        if (actualRequired !== defaultRequired) difference.required = actualRequired;
      }
      if (Object.keys(difference).length > 0) fields[fieldName] = difference;
    }
    if (Object.keys(fields).length > 0) tools[toolName] = { fields };
  }
  return { version: 1, tools };
}

function samePolicyValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function assertRequiredWorkItemPolicy(parameterPolicy) {
  assertRequiredWorkItemPolicyForTool(parameterPolicy, "azure_devops_create_work_item");
}

export function assertRequiredWorkItemGetPolicy(parameterPolicy) {
  assertRequiredWorkItemPolicyForTool(parameterPolicy, "azure_devops_get_work_item");
}

export function assertRequiredWorkItemRevisionsPolicy(parameterPolicy) {
  const toolName = "azure_devops_list_work_item_revisions";
  assertRequiredWorkItemPolicyForTool(parameterPolicy, toolName);
  const fields = parameterPolicy?.tools?.[toolName]?.fields;
  for (const fieldName of ["top", "skip"]) {
    const definition = POLICY_TOOL_DEFINITIONS[toolName].fields.find((field) => field.name === fieldName);
    const field = fields?.[fieldName];
    if (!definition || !field || (field.mode !== "fixed" && field.mode !== "agent")) {
      throw new Error(`${fieldName} 必須設定為 fixed 或 agent 模式。`);
    }
    if (field.mode === "fixed" && !safePolicyValue(field.value, definition)) {
      throw new Error(`${definition.label} 設為 fixed 時必須設定有效值。`);
    }
  }
}

export function assertRequiredWorkItemUpdatePolicy(parameterPolicy) {
  assertRequiredWorkItemPolicyForTool(parameterPolicy, "azure_devops_update_work_item");
}

function assertRequiredWorkItemPolicyForTool(parameterPolicy, toolName) {
  const fields = parameterPolicy?.tools?.[toolName]?.fields;
  for (const fieldDefinition of POLICY_TOOL_DEFINITIONS[toolName].fields.filter((field) => field.requiredAlways)) {
    const field = fields?.[fieldDefinition.name];
    if (field?.mode === "fixed" && !safePolicyValue(field.value, fieldDefinition)) {
      throw new Error(`${fieldDefinition.label} 為必填，請設定有效 fixed 值或切換成 agent 模式。`);
    }
    if (field?.mode === "agent" && field.required !== true) {
      throw new Error(`${fieldDefinition.label} 必須在每次呼叫中提供，或切換成 fixed 模式。`);
    }
    if (field?.mode !== "fixed" && field?.mode !== "agent") {
      throw new Error(`${fieldDefinition.label} 必須設定為 fixed 或 agent 模式。`);
    }
  }
}

export function assertRequiredPipelineYamlPolicy(parameterPolicy) {
  const fields = parameterPolicy?.tools?.azure_devops_publish_pipeline_yaml?.fields;
  for (const fieldDefinition of POLICY_TOOL_DEFINITIONS.azure_devops_publish_pipeline_yaml.fields.filter((field) => field.requiredAlways)) {
    const field = fields?.[fieldDefinition.name];
    if (fieldDefinition.name === "yamlContent" && field?.mode !== "agent") {
      throw new Error("Complete YAML content 必須由 Agent 每次提供，不可設為 fixed 或儲存在 Project Context。");
    }
    if (field?.mode === "fixed" && !safePolicyValue(field.value, fieldDefinition)) {
      throw new Error(`${fieldDefinition.label} 為必填，請設定有效 fixed 值或切換成 agent 模式。`);
    }
    if (field?.mode === "agent" && field.required !== true) {
      throw new Error(`${fieldDefinition.label} 必須在每次呼叫中提供，或切換成 fixed 模式。`);
    }
    if (field?.mode !== "fixed" && field?.mode !== "agent") {
      throw new Error(`${fieldDefinition.label} 必須設定為 fixed 或 agent 模式。`);
    }
  }
}

export function assertRequiredPipelinePolicy(parameterPolicy) {
  const fields = parameterPolicy?.tools?.azure_devops_create_pipeline?.fields;
  const definitions = POLICY_TOOL_DEFINITIONS.azure_devops_create_pipeline.fields;
  for (const fieldName of ["name", "yamlPath"]) {
    const fieldDefinition = definitions.find((field) => field.name === fieldName);
    const field = fields?.[fieldName];
    if (!fieldDefinition || !field) throw new Error("Pipeline policy 欄位缺少設定。");
    if (field.mode === "fixed" && !safePolicyValue(field.value, fieldDefinition)) {
      throw new Error(`${fieldDefinition.label} 為必填，請設定有效 fixed 值或切換成 agent 模式。`);
    }
    if (field.mode === "agent" && field.required !== true) {
      throw new Error(`${fieldDefinition.label} 必須在每次呼叫中提供，或切換成 fixed 模式。`);
    }
    if (field.mode !== "fixed" && field.mode !== "agent") {
      throw new Error(`${fieldDefinition.label} 必須設定為 fixed 或 agent 模式。`);
    }
    if (fieldName === "yamlPath" && field.mode === "fixed" && !isRepositoryYamlPolicyPath(field.value)) {
      throw new Error("Existing YAML path 必須是 Repository-relative .yml 或 .yaml 路徑，且不能包含 parent traversal。");
    }
  }
  const folder = fields?.folder;
  const folderDefinition = definitions.find((field) => field.name === "folder");
  if (folder?.mode === "fixed" && (!folderDefinition || !safePolicyValue(folder.value, folderDefinition))) {
    throw new Error("Pipeline folder 為 fixed 時必須設定有效值。");
  }
  if (folder?.mode === "fixed" && !isPipelineFolderPolicyPath(folder.value)) {
    throw new Error("Pipeline folder 不能包含空白 segment 或 parent traversal。");
  }
}

export function assertRequiredPullRequestPolicy(parameterPolicy) {
  const toolName = "azure_devops_create_pull_request";
  const fields = parameterPolicy?.tools?.[toolName]?.fields;
  const definitions = POLICY_TOOL_DEFINITIONS[toolName].fields;
  for (const fieldName of ["sourceRefName", "targetRefName", "title"]) {
    const fieldDefinition = definitions.find((field) => field.name === fieldName);
    const field = fields?.[fieldName];
    if (!fieldDefinition || !field) throw new Error("Pull request policy 欄位缺少設定。");
    if (field.mode === "fixed" && !safePolicyValue(field.value, fieldDefinition)) {
      throw new Error(`${fieldDefinition.label} 為必填，請設定有效 fixed 值或切換成 agent 模式。`);
    }
    if (field.mode === "agent" && field.required !== true) {
      throw new Error(`${fieldDefinition.label} 必須在每次呼叫中提供，或切換成 fixed 模式。`);
    }
    if (field.mode !== "fixed" && field.mode !== "agent") {
      throw new Error(`${fieldDefinition.label} 必須設定為 fixed 或 agent 模式。`);
    }
  }

  const selectorDefinitions = definitions.filter((field) => ["repositoryReference", "repositoryID", "repositoryName"].includes(field.name));
  const fixedSelectors = selectorDefinitions.filter((definition) => {
    const field = fields?.[definition.name];
    if (field?.mode !== "fixed") return false;
    if (!safePolicyValue(field.value, definition)) {
      throw new Error(`${definition.label} 設為 fixed 時必須是有效 Repository selector。`);
    }
    return true;
  });
  const requiredAgentSelectors = selectorDefinitions.filter((definition) => {
    const field = fields?.[definition.name];
    return field?.mode === "agent" && field.required === true;
  });
  if (fixedSelectors.length > 1 || requiredAgentSelectors.length > 1 || (fixedSelectors.length > 0 && requiredAgentSelectors.length > 0)) {
    throw new Error("Repository reference、Repository ID 與 Repository name 的固定／必填設定必須最多選擇一種。");
  }

  const listValues = {};
  for (const fieldName of ["reviewerIds", "workItemIds", "labels"]) {
    const definition = definitions.find((field) => field.name === fieldName);
    const field = fields?.[fieldName];
    if (!definition || !field || (field.mode !== "fixed" && field.mode !== "agent")) {
      throw new Error(`${definition?.label ?? fieldName} 必須設定為 fixed 或 agent 模式。`);
    }
    if (field.mode === "fixed") {
      if (!safePolicyValue(field.value, definition)) {
        throw new Error(`${definition.label} 必須是符合限制的 JSON array。`);
      }
      listValues[fieldName] = field.value;
    }
  }
  if (JSON.stringify(listValues).length > 10_000) {
    throw new Error("Reviewer IDs、Work Item IDs 與 Labels 的合併 JSON array 不可超過 10,000 字元。");
  }
}

export function assertRequiredPullRequestDetailsPolicy(parameterPolicy) {
  const toolName = "azure_devops_get_pull_request";
  const fields = parameterPolicy?.tools?.[toolName]?.fields;
  const definitions = POLICY_TOOL_DEFINITIONS[toolName].fields;
  const pullRequestIdDefinition = definitions.find((field) => field.name === "pullRequestId");
  const pullRequestId = fields?.pullRequestId;
  if (!pullRequestIdDefinition || !pullRequestId
    || (pullRequestId.mode === "fixed" && !safePolicyValue(pullRequestId.value, pullRequestIdDefinition))
    || (pullRequestId.mode === "agent" && pullRequestId.required !== true)
    || (pullRequestId.mode !== "fixed" && pullRequestId.mode !== "agent")) {
    throw new Error("Pull request ID 必須設定為有效 fixed 值，或在每次呼叫中提供。");
  }

  const commitTopDefinition = definitions.find((field) => field.name === "commitTop");
  const commitTop = fields?.commitTop;
  if (!commitTopDefinition || !commitTop
    || (commitTop.mode === "fixed" && !safePolicyValue(commitTop.value, commitTopDefinition))
    || (commitTop.mode !== "fixed" && commitTop.mode !== "agent")) {
    throw new Error("Commit page size 必須是 1 至 100 的 fixed 值，或由 Agent 提供。");
  }

  if (fields?.commitContinuationToken?.mode !== "agent") {
    throw new Error("Commit continuation token 只能由 Agent 在單次呼叫中提供。");
  }
}

export function assertPullRequestListPolicy(parameterPolicy) {
  const toolName = "azure_devops_list_pull_requests";
  const fields = parameterPolicy?.tools?.[toolName]?.fields;
  const definitions = POLICY_TOOL_DEFINITIONS[toolName].fields;
  const selectorDefinitions = definitions.filter((field) => ["repositoryReference", "repositoryID", "repositoryName"].includes(field.name));
  const fixedSelectors = selectorDefinitions.filter((definition) => {
    const field = fields?.[definition.name];
    if (field?.mode !== "fixed") return false;
    if (!safePolicyValue(field.value, definition)) {
      throw new Error(`${definition.label} 設為 fixed 時必須是有效 Repository selector。`);
    }
    return true;
  });
  const requiredAgentSelectors = selectorDefinitions.filter((definition) => {
    const field = fields?.[definition.name];
    return field?.mode === "agent" && field.required === true;
  });
  if (fixedSelectors.length > 1 || requiredAgentSelectors.length > 1 || (fixedSelectors.length > 0 && requiredAgentSelectors.length > 0)) {
    throw new Error("PR 清單的 Repository reference、Repository ID 與 Repository name 固定／必填設定必須最多選擇一種。");
  }

  for (const definition of definitions.filter((field) => !["organization", "project", "repositoryReference", "repositoryID", "repositoryName"].includes(field.name))) {
    const field = fields?.[definition.name];
    if (field?.mode !== "agent" && field?.mode !== "fixed") {
      throw new Error(`${definition.label} 必須設定為 fixed 或 agent 模式。`);
    }
    if (field.mode === "fixed" && !safePolicyValue(field.value, definition)) {
      throw new Error(`${definition.label} 設為 fixed 時必須是有效值。`);
    }
  }
}

export function assertParameterPolicyForSave(parameterPolicy) {
  assertRequiredWorkItemPolicy(parameterPolicy);
  assertRequiredWorkItemGetPolicy(parameterPolicy);
  assertRequiredWorkItemRevisionsPolicy(parameterPolicy);
  assertRequiredWorkItemUpdatePolicy(parameterPolicy);
  assertRequiredRepositoryPath(parameterPolicy);
  assertRequiredPipelineYamlPolicy(parameterPolicy);
  assertRequiredPipelinePolicy(parameterPolicy);
  assertRequiredPullRequestPolicy(parameterPolicy);
  assertRequiredPullRequestDetailsPolicy(parameterPolicy);
  assertPullRequestListPolicy(parameterPolicy);
}

function assertRequiredRepositoryPath(parameterPolicy) {
  for (const toolName of ["azure_devops_push", "azure_devops_git_pull"]) {
    const field = parameterPolicy?.tools?.[toolName]?.fields?.repositoryPath;
    if (field?.mode === "fixed" && (typeof field.value !== "string" || !/^repository\/[^/\\]+$/.test(field.value))) {
      throw new Error("Repository path 為必填，請輸入 repository/<repo-name>（例如 repository/AI_Traning）或切換成 agent 模式。");
    }
    if (field?.mode === "agent" && field.required !== true) {
      throw new Error("Repository path 必須設定為每次呼叫必填。");
    }
  }
}

function isRepositoryYamlPolicyPath(value) {
  if (typeof value !== "string" || value !== value.trim() || !value || value.length > 1024
    || value.startsWith("/") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return false;
  return value.split("/").every((segment) => segment && segment !== "." && segment !== "..")
    && /\.ya?ml$/i.test(value);
}

function isPipelineFolderPolicyPath(value) {
  if (typeof value !== "string" || value !== value.trim() || value.length > 512
    || /[\u0000-\u001f\u007f]/.test(value)) return false;
  if (value === "\\") return true;
  const segments = value.replaceAll("/", "\\").split("\\").filter((segment, index) => !(index === 0 && segment === ""));
  return segments.length > 0 && segments.every((segment) => segment && segment !== "." && segment !== "..")
    && !value.includes("//") && !value.includes("\\\\");
}

export function normalizeWikis(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((wiki) => {
    if (!isRecord(wiki) || typeof wiki.id !== "string" || !wiki.id.trim() || typeof wiki.name !== "string" || !wiki.name.trim()) return [];
    return [{
      id: wiki.id.trim(),
      name: wiki.name.trim(),
      ...(typeof wiki.type === "string" ? { type: wiki.type } : {}),
    }];
  });
}

export function selectWikiIdentifier(wikis, savedIdentifier) {
  if (!Array.isArray(wikis) || wikis.length === 0) return "";
  if (typeof savedIdentifier === "string" && wikis.some((wiki) => wiki.id === savedIdentifier)) return savedIdentifier;
  return wikis.find((wiki) => wiki.type === "projectWiki")?.id ?? wikis[0]?.id ?? "";
}

export function mergeWikis(current, added) {
  const wikis = new Map(normalizeWikis(current).map((wiki) => [wiki.id, wiki]));
  for (const wiki of normalizeWikis(added)) wikis.set(wiki.id, wiki);
  return [...wikis.values()];
}

export { safeContextDocument };

export function readPolicyInputValue(input, field) {
  if (!input) return undefined;
  if (field.type === "boolean") return input.checked;
  const rawValue = String(input.value ?? "");
  if (field.allowEmpty === true) {
    const maxLength = Number.isInteger(field.maxLength) ? field.maxLength : 2_000;
    const value = field.multiline ? rawValue : rawValue.trim();
    if (value.length > maxLength) throw new Error(`${field.label} 超過 ${maxLength} 字元上限。`);
    return value;
  }
  if (!rawValue.trim()) return field.type === "json" ? {} : field.type === "json-array" ? [] : undefined;
  const value = field.multiline ? rawValue : rawValue.trim();
  if (field.type === "json-array") return parsePolicyArrayText(value, field);
  if (field.type === "json") {
    const maxLength = Number.isInteger(field.maxLength) ? field.maxLength : 10_000;
    if (value.length > maxLength) throw new Error(`${field.label} 超過 ${maxLength} 字元上限。`);
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error(`${field.label} 必須是有效的 JSON object。`);
    }
    if (!isBoundedJsonObject(parsed, maxLength)) {
      throw new Error(`${field.label} 必須是 ${maxLength} 字元內的 JSON object。`);
    }
    return parsed;
  }
  const numeric = numericPolicy(field);
  if (numeric) return numeric.parse(value);
  return value;
}

export function parsePolicyArrayText(value, field) {
  const maxLength = Number.isInteger(field.maxLength) ? field.maxLength : 10_000;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new Error(`${field.label} 超過 ${maxLength} 字元上限。`);
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${field.label} 必須是有效的 JSON array。`);
  }
  if (!isBoundedJsonArray(parsed, field, maxLength)) {
    throw new Error(`${field.label} 必須是符合元素型別、數量與長度限制的 JSON array。`);
  }
  return parsed;
}

function safePolicyValue(value, field) {
  if (value === undefined || value === null) return false;
  if (field.type === "boolean") return typeof value === "boolean";
  if (field.type === "uuid") return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if (field.type === "json") return isBoundedJsonObject(value, Number.isInteger(field.maxLength) ? field.maxLength : 10_000);
  if (field.type === "json-array") return isBoundedJsonArray(value, field, Number.isInteger(field.maxLength) ? field.maxLength : 10_000);
  const numeric = numericPolicy(field);
  if (numeric) return numeric.isValid(value);
  const maxLength = Number.isInteger(field.maxLength) ? field.maxLength : 2_000;
  return typeof value === "string"
    && (field.allowEmpty === true || value.trim().length > 0)
    && value.length <= maxLength
    && (!field.format || isValidPolicyFormat(value, field.format))
    && !/(?:pat[-_]|bearer\s+|token[-_]|secret[-_])/i.test(value);
}

function isValidPolicyFormat(value, format) {
  if (format === "azure-devops-branch-ref") return isAzureDevOpsBranchPolicyRef(value);
  if (format === "azure-devops-pull-request-status") return ["active", "abandoned", "completed", "all"].includes(value);
  if (format === "azure-devops-repository-name") {
    return value === value.trim() && value !== "." && value !== ".." && !/[\\/\u0000-\u001f\u007f]/.test(value);
  }
  if (format === "azure-devops-repository-reference") {
    const match = /^azure-devops:\/\/([^/]+)\/([^/]+)\/([0-9a-f-]{36})$/i.exec(value);
    if (!match || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(match[3])) return false;
    try {
      return Boolean(decodeURIComponent(match[1]) && decodeURIComponent(match[2]));
    } catch {
      return false;
    }
  }
  if (format !== "pipeline-yaml-path") return true;
  if (value !== value.trim()
    || value.startsWith("/")
    || value.startsWith("\\")
    || /^[A-Za-z]:/.test(value)
    || /[\u0000-\u001f\u007f\\]/.test(value)) return false;
  const segments = value.split("/");
  return !segments.some((segment) => !segment || segment === "." || segment === "..") && /\.ya?ml$/i.test(value);
}

function isAzureDevOpsBranchPolicyRef(value) {
  if (typeof value !== "string" || value !== value.trim() || !value.startsWith("refs/heads/") || value.length > 255) return false;
  const branch = value.slice("refs/heads/".length);
  if (!branch || branch === "@" || branch.startsWith("/") || branch.endsWith("/") || branch.endsWith(".")
    || branch.includes("..") || branch.includes("//") || branch.includes("@{")
    || /[\u0000-\u0020\u007f~^:?*\\\[\]]/.test(branch)) return false;
  return branch.split("/").every((segment) => segment.length > 0
    && !segment.startsWith(".")
    && !segment.endsWith(".")
    && !segment.toLowerCase().endsWith(".lock"));
}

function numericPolicy(field) {
  const integer = field.type === "integer";
  if (!integer && field.type !== "number") return undefined;
  const minimum = field.minimum ?? (integer ? 1 : 0);
  const maximum = integer
    ? field.maxValue ?? field.maximum ?? 100_000
    : field.maximum;
  const isValid = (value) => typeof value === "number"
    && (integer ? Number.isInteger(value) : Number.isFinite(value))
    && value >= minimum
    && (maximum === undefined || value <= maximum);
  return {
    minimum,
    maximum,
    step: integer ? "1" : "any",
    isValid,
    parse(value) {
      const number = Number(value);
      if (!isValid(number)) {
        if (integer) throw new Error(`${field.label} 必須是 ${minimum} 到 ${maximum} 的整數。`);
        throw new Error(`${field.label} 必須是有限的非負數值。`);
      }
      return number;
    },
  };
}

function policyValueText(value, field) {
  if (value === undefined || value === null) return "";
  return field?.type === "json" || field?.type === "json-array" ? JSON.stringify(value, null, 2) : String(value);
}

function isBoundedJsonObject(value, maxLength) {
  if (!isRecord(value)) return false;
  try {
    return JSON.stringify(value).length <= maxLength;
  } catch {
    return false;
  }
}

function isBoundedJsonArray(value, field, maxLength) {
  if (!Array.isArray(value) || value.length > (field.maxItems ?? 50) || Object.keys(value).length !== value.length) return false;
  const validItems = value.every((item) => {
    if (field.arrayItemType === "uuid") {
      return typeof item === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item);
    }
    if (field.arrayItemType === "integer") {
      return typeof item === "number" && Number.isSafeInteger(item)
        && item >= (field.itemMinimum ?? 1) && item <= (field.itemMaximum ?? 2_147_483_647);
    }
    if (field.arrayItemType === "string") {
      return typeof item === "string" && item.trim().length > 0 && item.length <= (field.itemMaxLength ?? 128);
    }
    return false;
  });
  if (!validItems) return false;
  try {
    return JSON.stringify(value).length <= maxLength;
  } catch {
    return false;
  }
}

function safeContextDocument(value) {
  if (!isRecord(value)) return {};
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (typeof child === "string" && SECRET_VALUE_PATTERN.test(child)) continue;
    if (isRecord(child)) result[key] = safeContextDocument(child);
    else if (Array.isArray(child)) result[key] = child.filter((item) => typeof item !== "string" || !SECRET_VALUE_PATTERN.test(item));
    else result[key] = child;
  }
  return result;
}

function setOptions(select, items, placeholder, getValue, getLabel, selectedValue, allowEmpty = false) {
  if (!select) return;
  select.replaceChildren();
  if (placeholder) select.append(new Option(placeholder, ""));
  items.forEach((item) => select.append(new Option(getLabel(item), getValue(item))));
  const candidate = items.some((item) => getValue(item) === selectedValue) ? selectedValue : allowEmpty ? "" : select.options[1]?.value ?? "";
  select.value = candidate;
}

function normalizeProjects(value) { return Array.isArray(value) ? value.filter((item) => isRecord(item) && typeof item.name === "string" && typeof item.id === "string") : []; }
function normalizeTeams(value) { return Array.isArray(value) ? value.filter((item) => isRecord(item) && typeof item.name === "string" && typeof item.id === "string") : []; }
function normalizeNodes(value) { return Array.isArray(value) ? value.filter((item) => isRecord(item) && typeof item.path === "string" && typeof item.id === "string") : []; }
function normalizeMembers(value) { return Array.isArray(value) ? value.filter((item) => isRecord(item) && typeof item.id === "string") : []; }
function normalizeIterations(value) { return Array.isArray(value) ? value.filter((item) => isRecord(item) && typeof item.id === "string") : []; }
function normalizeBoards(value) { return Array.isArray(value) ? value.filter((item) => isRecord(item) && typeof item.name === "string") : []; }
function normalizeDashboards(value) { return Array.isArray(value) ? value.filter((item) => isRecord(item) && typeof item.id === "string") : []; }
function numberValue(input, fallback) { const value = Number(input?.value); return Number.isInteger(value) && value >= 0 ? value : fallback; }
function emptyNode(message) { const node = document.createElement("li"); node.className = "ado-empty"; node.textContent = message; return node; }
function stringValue(value, fallback) { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[character])); }
