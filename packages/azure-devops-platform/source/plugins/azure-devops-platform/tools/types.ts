export type AzureDevOpsRepositoryMetadata = {
  id: string;
  name: string;
  project: {
    id: string;
    name: string;
  };
  remoteUrl: string;
  repositoryReference: string;
};

export type AzureDevOpsGitOperations = {
  addRemote: (worktree: string, remoteName: string, remoteUrl: string) => Promise<void>;
  getCurrentBranch: (worktree: string) => Promise<string | undefined>;
  getFetchRemoteUrls: (worktree: string, remoteName: string) => Promise<readonly string[] | undefined>;
  getPushRemoteUrls: (worktree: string, remoteName: string) => Promise<readonly string[] | undefined>;
  getRemoteUrl: (worktree: string, remoteName: string) => Promise<string | undefined>;
  pull: (worktree: string, remoteName: string, branch: string | undefined, credential: string, expectedRemoteUrl: string, organization?: string, project?: string) => Promise<void>;
  push: (worktree: string, remoteName: string, branch: string, setUpstream: boolean, credential: string, expectedRemoteUrl: string, organization?: string, project?: string) => Promise<void>;
  setRemoteUrl: (worktree: string, remoteName: string, remoteUrl: string) => Promise<void>;
};

export type AzureDevOpsPushResolution = {
  branch: string;
  credential: string;
  organization: string;
  project: string;
  remoteName: string;
  remoteUrl: string;
  setUpstream: boolean;
};

export type AzureDevOpsPushPlan = {
  branch?: string;
  organization?: string;
  project?: string;
  repositoryPath: string;
  remoteName: string;
  resolvedValues: Record<string, unknown>;
  setUpstream?: boolean;
  sources: Record<string, "fixed" | "agent" | "derived">;
};

export type AzureDevOpsPullPlan = {
  branch?: string;
  organization?: string;
  project?: string;
  repositoryPath: string;
  remoteName: string;
  resolvedValues: Record<string, unknown>;
  sources: Record<string, "fixed" | "agent" | "derived">;
};

export type AzureDevOpsPullResolution = {
  branch?: string;
  credential: string;
  organization: string;
  project: string;
  remoteName: string;
  remoteUrl: string;
};

export type AzureDevOpsGitProcessResult = {
  stderr: string;
  stdout: string;
};

export type AzureDevOpsGitProcess = {
  execute: (
    worktree: string,
    args: string[],
    options?: { credential?: string; operation?: string },
  ) => Promise<AzureDevOpsGitProcessResult>;
  executeWithInput?: (
    worktree: string,
    args: string[],
    input: string,
    options?: { operation?: string; secrets?: readonly string[] },
  ) => Promise<void>;
};

export type AzureDevOpsGitRunner = (
  file: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    maxBuffer: number;
    timeout: number;
    windowsHide: boolean;
  },
) => Promise<{ stderr?: unknown; stdout?: unknown }>;

export type AzureDevOpsGitCloneInput = {
  branch?: string;
  credential: string;
  depth?: number;
  destination: string;
  ref?: string;
  remoteUrl: string;
  worktree: string;
};

export type AzureDevOpsGitCloneOperations = {
  clone: (input: AzureDevOpsGitCloneInput) => Promise<void>;
};

export type ConfigureAzureDevOpsRemoteDependencies = {
  git: AzureDevOpsGitOperations;
  resolveRepository: (input: Record<string, unknown>) => Promise<AzureDevOpsRepositoryMetadata>;
  worktree: string;
};

export type PushAzureDevOpsWorktreeDependencies = {
  git: Pick<AzureDevOpsGitOperations, "getPushRemoteUrls" | "getRemoteUrl" | "push"> & Partial<Pick<AzureDevOpsGitOperations, "getCurrentBranch">>;
  resolvePush: (input: Record<string, unknown>, remoteUrl: string, derivedValues: Record<string, unknown>, resolvedPlan: AzureDevOpsPushPlan) => Promise<AzureDevOpsPushResolution>;
  resolvePushPlan: (input: Record<string, unknown>, derivedValues: Record<string, unknown>) => Promise<AzureDevOpsPushPlan>;
  worktree: string;
};

export type PullAzureDevOpsWorktreeDependencies = {
  git: Pick<AzureDevOpsGitOperations, "getFetchRemoteUrls" | "pull">;
  resolvePull: (input: Record<string, unknown>, remoteUrl: string, resolvedPlan: AzureDevOpsPullPlan) => Promise<AzureDevOpsPullResolution>;
  resolvePullPlan: (input: Record<string, unknown>) => Promise<AzureDevOpsPullPlan>;
  worktree: string;
};

export type CloneAzureDevOpsRepositoryDependencies = {
  git: AzureDevOpsGitOperations & AzureDevOpsGitCloneOperations;
  getCredential: () => Promise<string>;
  resolveRepository: (input: Record<string, unknown>) => Promise<AzureDevOpsRepositoryMetadata>;
  worktree: string;
};

export type GitRunOptions = {
  environment?: NodeJS.ProcessEnv;
  runner?: AzureDevOpsGitRunner;
  secrets?: readonly string[];
};

export type CloneSelection = {
  branch?: string;
  depth?: number;
  ref?: string;
};

export type CloneDestination = {
  absolutePath: string;
  exists: boolean;
  identity?: CloneIdentity;
  relativePath: string;
  rootPath: string;
};

export type CloneIdentity = { birthtimeMs: number; dev: number; ino: number };
