export type ExtensionPackageScope = "global" | "project";
export type ExtensionPackageResourceKind = "agents" | "commands" | "mcp" | "plugins" | "skills" | "tools";

export type ExtensionFileAssociation = {
  extension: string;
  mediaType?: string;
};

export type ExtensionPackageMetadata = {
  aliases?: string[];
  capabilities?: string[];
  extendResources?: boolean;
  fileAssociations?: ExtensionFileAssociation[];
  icon?: string;
  [key: string]: unknown;
};

export type ExtensionHostRequirements = {
  capabilities?: string[];
  maxHostVersionExclusive?: string;
  minHostVersion: string;
};

export type ExtensionSettingField = {
  description?: string;
  required?: boolean;
  sensitive?: boolean;
  type: "array" | "boolean" | "integer" | "number" | "object" | "string";
};

export type ExtensionHostContract = {
  schemaVersion: "agent-system.extension-host.v1";
  settings?: {
    properties: Record<string, ExtensionSettingField>;
    schemaVersion: "agent-system.extension-settings.v1";
  };
  context?: {
    properties: Record<string, { description?: string; type: "boolean" | "number" | "string" }>;
    schemaVersion: "agent-system.extension-context.v1";
  };
  migrations?: Array<{ fromVersion: string; id: string; toVersion: string }>;
};

export type ExtensionContributionMetadata = {
  aliases?: string[];
  fileAssociations?: ExtensionFileAssociation[];
  icon?: string;
  kind: ExtensionPackageResourceKind;
  name: string;
};

export type ExtensionReleaseArtifact = {
  sha256: string;
  sizeBytes: number;
  url: string;
};

export type ExtensionRelease = {
  artifact: ExtensionReleaseArtifact;
  contractVersion: "1.0.0";
  extensionId: string;
  hostRequirements: ExtensionHostRequirements;
  metadata?: ExtensionPackageMetadata;
  schemaVersion: "agent-system.extension-release.v1";
  version: string;
};

export type ExtensionCatalog = {
  contractVersion: "1.0.0";
  extensions: Array<{
    extensionId: string;
    latestVersion: string;
    releases: ExtensionRelease[];
  }>;
  schemaVersion: "agent-system.extension-catalog.v1";
};

export type ExtensionOperationIdentity = {
  extensionId: string;
  packageSha256: string;
  project?: string;
  scope: ExtensionPackageScope;
  version: string;
};

export type ExtensionLifecycleStatus = {
  completed: boolean;
  identity: ExtensionOperationIdentity;
  operationId: string;
  phase: string;
  retryAction: "none" | "query-first" | "resume";
  schemaVersion: "agent-system.extension-lifecycle-status.v1";
  status: "failed" | "running" | "succeeded" | "unknown";
};

export type ExtensionLifecycleRetryRequest = {
  action: "query-status" | "resume";
  identity: ExtensionOperationIdentity;
  operationId: string;
  schemaVersion: "agent-system.extension-lifecycle-retry.v1";
};

export type ExtensionHostContext = ExtensionOperationIdentity & {
  operationId?: string;
  schemaVersion: "agent-system.extension-host-context.v1";
  target: "main" | "workflow-test";
};

export type ExtensionSourceSyncTarget = {
  appliedRevision?: string;
  contentSha256?: string;
  readiness: "not-ready" | "ready" | "unknown";
};

export type ExtensionSourceSyncState = {
  changes?: {
    added: Array<{ kind: ExtensionPackageResourceKind; name: string }>;
    candidateRevision: string;
    deleted: Array<{ kind: ExtensionPackageResourceKind; name: string }>;
    modified: Array<{ kind: ExtensionPackageResourceKind; name: string }>;
  };
  operation?: {
    candidateRevision?: string;
    candidateSha256?: string;
    completed: boolean;
    operationId: string;
    retryAction: "none" | "query-first" | "resume";
    sourceUrl: string;
    status: "failed" | "running" | "succeeded" | "unknown";
  };
  schemaVersion: "agent-system.extension-source-sync.v1";
  source: { desiredUrl: null | string; status: "configured" | "not-configured" };
  targets: {
    main: ExtensionSourceSyncTarget;
    "workflow-test": ExtensionSourceSyncTarget;
  };
};

/** The host binds this zero-argument API to the installed Extension scope and Project. */
export type ExtensionHostApi = {
  readSettings(): Promise<Record<string, unknown>>;
};
