import type {
  ExtensionCatalog,
  ExtensionContributionMetadata,
  ExtensionHostContext,
  ExtensionHostContract,
  ExtensionHostRequirements,
  ExtensionLifecycleStatus,
  ExtensionLifecycleRetryRequest,
  ExtensionOperationIdentity,
  ExtensionPackageMetadata,
  ExtensionRelease,
  ExtensionSourceSyncState,
  ExtensionPackageResourceKind,
} from "./types.js";

export const EXTENSION_CONTRACT_VERSION = "1.0.0" as const;
export const EXTENSION_HOST_CONTRACT_VERSION = "agent-system.extension-host.v1" as const;

const EXTENSION_ID_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RESOURCE_KINDS = new Set<ExtensionPackageResourceKind>(["agents", "commands", "mcp", "plugins", "skills", "tools"]);

export class ExtensionContractValidationError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
    this.name = "ExtensionContractValidationError";
  }
}

export function validateExtensionPackageMetadata(value: unknown, canonicalExtensionId?: string): ExtensionPackageMetadata {
  const metadata = asRecord(value, "EXTENSION_METADATA_INVALID");
  const serialized = JSON.stringify(metadata);
  if (new TextEncoder().encode(serialized).byteLength > 64 * 1024) fail("EXTENSION_METADATA_TOO_LARGE");

  if (metadata.aliases !== undefined) validateAliases(metadata.aliases, "EXTENSION_METADATA_INVALID");
  if (canonicalExtensionId && Array.isArray(metadata.aliases) && metadata.aliases.includes(canonicalExtensionId)) {
    fail("EXTENSION_METADATA_INVALID");
  }
  if (metadata.icon !== undefined && (typeof metadata.icon !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(metadata.icon))) {
    fail("EXTENSION_METADATA_INVALID");
  }
  if (metadata.fileAssociations !== undefined) validateFileAssociations(metadata.fileAssociations, "EXTENSION_METADATA_INVALID");
  if (metadata.capabilities !== undefined) validateStringList(metadata.capabilities, /^[a-z0-9][a-z0-9:._/-]{0,127}$/, "EXTENSION_METADATA_INVALID");
  if (metadata.extendResources !== undefined && typeof metadata.extendResources !== "boolean") fail("EXTENSION_METADATA_INVALID");

  return cloneJson(metadata) as ExtensionPackageMetadata;
}

export function validateExtensionHostRequirements(value: unknown): ExtensionHostRequirements {
  const requirements = asRecord(value, "EXTENSION_HOST_REQUIREMENTS_INVALID");
  assertOnlyKeys(requirements, ["capabilities", "maxHostVersionExclusive", "minHostVersion"], "EXTENSION_HOST_REQUIREMENTS_INVALID");
  if (typeof requirements.minHostVersion !== "string" || !SEMVER_PATTERN.test(requirements.minHostVersion)) {
    fail("EXTENSION_HOST_REQUIREMENTS_INVALID");
  }
  if (requirements.maxHostVersionExclusive !== undefined
    && (typeof requirements.maxHostVersionExclusive !== "string" || !SEMVER_PATTERN.test(requirements.maxHostVersionExclusive))) {
    fail("EXTENSION_HOST_REQUIREMENTS_INVALID");
  }
  if (typeof requirements.maxHostVersionExclusive === "string"
    && compareVersions(requirements.minHostVersion, requirements.maxHostVersionExclusive) >= 0) {
    fail("EXTENSION_HOST_REQUIREMENTS_INVALID");
  }
  if (requirements.capabilities !== undefined) {
    validateStringList(requirements.capabilities, /^[a-z][a-zA-Z0-9._-]{0,99}$/, "EXTENSION_HOST_REQUIREMENTS_INVALID");
  }
  return cloneJson(requirements) as unknown as ExtensionHostRequirements;
}

export function validateExtensionHostContract(value: unknown): ExtensionHostContract {
  const contract = asRecord(value, "EXTENSION_HOST_CONTRACT_INVALID");
  assertOnlyKeys(contract, ["context", "migrations", "schemaVersion", "settings"], "EXTENSION_HOST_CONTRACT_INVALID");
  if (contract.schemaVersion !== EXTENSION_HOST_CONTRACT_VERSION) fail("EXTENSION_HOST_CONTRACT_UNSUPPORTED");

  if (contract.settings !== undefined) {
    const settings = asRecord(contract.settings, "EXTENSION_SETTINGS_DEFINITION_INVALID");
    assertOnlyKeys(settings, ["properties", "schemaVersion"], "EXTENSION_SETTINGS_DEFINITION_INVALID");
    if (settings.schemaVersion !== "agent-system.extension-settings.v1") fail("EXTENSION_SETTINGS_DEFINITION_UNSUPPORTED");
    validateSettingProperties(settings.properties);
  }
  if (contract.context !== undefined) {
    const context = asRecord(contract.context, "EXTENSION_CONTEXT_DEFINITION_INVALID");
    assertOnlyKeys(context, ["properties", "schemaVersion"], "EXTENSION_CONTEXT_DEFINITION_INVALID");
    if (context.schemaVersion !== "agent-system.extension-context.v1") fail("EXTENSION_CONTEXT_DEFINITION_UNSUPPORTED");
    validateContextProperties(context.properties);
  }
  if (contract.migrations !== undefined) validateMigrations(contract.migrations);

  return cloneJson(contract) as unknown as ExtensionHostContract;
}

export function validateExtensionContributions(value: unknown): ExtensionContributionMetadata[] {
  if (!Array.isArray(value) || value.length > 500) fail("EXTENSION_CONTRIBUTIONS_INVALID");
  const seen = new Set<string>();
  return value.map((item) => {
    const contribution = asRecord(item, "EXTENSION_CONTRIBUTIONS_INVALID");
    assertOnlyKeys(contribution, ["aliases", "fileAssociations", "icon", "kind", "name"], "EXTENSION_CONTRIBUTIONS_INVALID");
    if (typeof contribution.kind !== "string" || !RESOURCE_KINDS.has(contribution.kind as ExtensionPackageResourceKind)
      || typeof contribution.name !== "string" || !/^[A-Za-z0-9_.-]{1,100}$/.test(contribution.name)) {
      fail("EXTENSION_CONTRIBUTIONS_INVALID");
    }
    const identity = `${contribution.kind}:${contribution.name}`;
    if (seen.has(identity)) fail("EXTENSION_CONTRIBUTIONS_DUPLICATE");
    seen.add(identity);
    if (contribution.aliases !== undefined) validateAliases(contribution.aliases, "EXTENSION_CONTRIBUTIONS_INVALID");
    if (contribution.icon !== undefined && (typeof contribution.icon !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(contribution.icon))) {
      fail("EXTENSION_CONTRIBUTIONS_INVALID");
    }
    if (contribution.fileAssociations !== undefined) validateFileAssociations(contribution.fileAssociations, "EXTENSION_CONTRIBUTIONS_INVALID");
    return cloneJson(contribution) as unknown as ExtensionContributionMetadata;
  });
}

export function validateExtensionRelease(value: unknown): ExtensionRelease {
  const release = asRecord(value, "EXTENSION_RELEASE_INVALID");
  assertOnlyKeys(release, ["artifact", "contractVersion", "extensionId", "hostRequirements", "metadata", "schemaVersion", "version"], "EXTENSION_RELEASE_INVALID");
  if (release.schemaVersion !== "agent-system.extension-release.v1") fail("EXTENSION_RELEASE_UNSUPPORTED");
  if (release.contractVersion !== EXTENSION_CONTRACT_VERSION) fail("EXTENSION_CONTRACT_UNSUPPORTED");
  validateExtensionId(release.extensionId, "EXTENSION_RELEASE_INVALID");
  validateVersion(release.version, "EXTENSION_RELEASE_INVALID");
  const artifact = asRecord(release.artifact, "EXTENSION_RELEASE_ARTIFACT_INVALID");
  assertOnlyKeys(artifact, ["sha256", "sizeBytes", "url"], "EXTENSION_RELEASE_ARTIFACT_INVALID");
  if (typeof artifact.sha256 !== "string" || !SHA256_PATTERN.test(artifact.sha256)
    || typeof artifact.sizeBytes !== "number" || !Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0 || artifact.sizeBytes > 25 * 1024 * 1024
    || typeof artifact.url !== "string" || !isPublicHttpsUrl(artifact.url)) {
    fail("EXTENSION_RELEASE_ARTIFACT_INVALID");
  }
  validateExtensionHostRequirements(release.hostRequirements);
  if (release.metadata !== undefined) validateExtensionPackageMetadata(release.metadata, release.extensionId);
  return cloneJson(release) as unknown as ExtensionRelease;
}

export function validateExtensionCatalog(value: unknown): ExtensionCatalog {
  const catalog = asRecord(value, "EXTENSION_CATALOG_INVALID");
  assertOnlyKeys(catalog, ["contractVersion", "extensions", "schemaVersion"], "EXTENSION_CATALOG_INVALID");
  if (catalog.schemaVersion !== "agent-system.extension-catalog.v1") fail("EXTENSION_CATALOG_UNSUPPORTED");
  if (catalog.contractVersion !== EXTENSION_CONTRACT_VERSION) fail("EXTENSION_CONTRACT_UNSUPPORTED");
  if (!Array.isArray(catalog.extensions) || catalog.extensions.length > 1_000) fail("EXTENSION_CATALOG_INVALID");

  const extensionIds = new Set<string>();
  for (const item of catalog.extensions) {
    const entry = asRecord(item, "EXTENSION_CATALOG_ENTRY_INVALID");
    assertOnlyKeys(entry, ["extensionId", "latestVersion", "releases"], "EXTENSION_CATALOG_ENTRY_INVALID");
    validateExtensionId(entry.extensionId, "EXTENSION_CATALOG_ENTRY_INVALID");
    if (extensionIds.has(entry.extensionId as string)) fail("EXTENSION_CATALOG_DUPLICATE_EXTENSION");
    extensionIds.add(entry.extensionId as string);
    if (!Array.isArray(entry.releases) || entry.releases.length === 0 || entry.releases.length > 500) fail("EXTENSION_CATALOG_ENTRY_INVALID");
    const versions = new Set<string>();
    let latestFound = false;
    for (const rawRelease of entry.releases) {
      const release = validateExtensionRelease(rawRelease);
      if (release.extensionId !== entry.extensionId) fail("EXTENSION_CATALOG_RELEASE_ID_MISMATCH");
      if (versions.has(release.version)) fail("EXTENSION_CATALOG_VERSION_CONFLICT");
      versions.add(release.version);
      if (release.version === entry.latestVersion) latestFound = true;
    }
    if (!latestFound) fail("EXTENSION_CATALOG_LATEST_MISSING");
  }
  return cloneJson(catalog) as unknown as ExtensionCatalog;
}

export function checkExtensionHostCompatibility(
  requirementsValue: unknown,
  hostVersion: string,
  hostCapabilities: readonly string[] = [],
): { compatible: boolean; reasons: string[] } {
  const requirements = validateExtensionHostRequirements(requirementsValue);
  if (!SEMVER_PATTERN.test(hostVersion)) return { compatible: false, reasons: ["host-version-invalid"] };
  const reasons: string[] = [];
  if (compareVersions(hostVersion, requirements.minHostVersion) < 0) reasons.push("host-version-too-old");
  if (requirements.maxHostVersionExclusive && compareVersions(hostVersion, requirements.maxHostVersionExclusive) >= 0) {
    reasons.push("host-version-too-new");
  }
  const supported = new Set(hostCapabilities);
  if (requirements.capabilities?.some((capability) => !supported.has(capability))) reasons.push("host-capability-missing");
  return { compatible: reasons.length === 0, reasons };
}

export function extensionReleaseIdentity(identity: Pick<ExtensionOperationIdentity, "extensionId" | "version" | "packageSha256">): string {
  validateExtensionId(identity.extensionId, "EXTENSION_ID_INVALID");
  validateVersion(identity.version, "EXTENSION_VERSION_INVALID");
  if (!SHA256_PATTERN.test(identity.packageSha256)) fail("EXTENSION_PACKAGE_HASH_INVALID");
  return `${identity.extensionId}@${identity.version}#${identity.packageSha256}`;
}

export function validateExtensionLifecycleStatus(value: unknown): ExtensionLifecycleStatus {
  const status = asRecord(value, "EXTENSION_LIFECYCLE_STATUS_INVALID");
  assertOnlyKeys(status, ["completed", "identity", "operationId", "phase", "retryAction", "schemaVersion", "status"], "EXTENSION_LIFECYCLE_STATUS_INVALID");
  if (status.schemaVersion !== "agent-system.extension-lifecycle-status.v1") fail("EXTENSION_LIFECYCLE_STATUS_UNSUPPORTED");
  validateOperationId(status.operationId);
  if (typeof status.phase !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(status.phase)) fail("EXTENSION_LIFECYCLE_STATUS_INVALID");
  const identity = validateOperationIdentity(status.identity);
  if (typeof status.completed !== "boolean"
    || !["failed", "running", "succeeded", "unknown"].includes(String(status.status))
    || !["none", "query-first", "resume"].includes(String(status.retryAction))) {
    fail("EXTENSION_LIFECYCLE_STATUS_INVALID");
  }
  if (status.status === "succeeded" && (status.completed !== true || status.retryAction !== "none")) fail("EXTENSION_LIFECYCLE_STATUS_INVALID");
  if (status.status === "running" && (status.completed !== false || status.retryAction !== "none")) fail("EXTENSION_LIFECYCLE_STATUS_INVALID");
  if (status.status === "unknown" && (status.completed !== false || status.retryAction !== "query-first")) fail("EXTENSION_LIFECYCLE_STATUS_INVALID");
  if (status.status === "failed" && status.retryAction === "query-first") fail("EXTENSION_LIFECYCLE_STATUS_INVALID");
  return { ...cloneJson(status), identity } as unknown as ExtensionLifecycleStatus;
}

export function validateExtensionLifecycleRetryRequest(value: unknown): ExtensionLifecycleRetryRequest {
  const request = asRecord(value, "EXTENSION_LIFECYCLE_RETRY_INVALID");
  assertOnlyKeys(request, ["action", "identity", "operationId", "schemaVersion"], "EXTENSION_LIFECYCLE_RETRY_INVALID");
  if (request.schemaVersion !== "agent-system.extension-lifecycle-retry.v1") fail("EXTENSION_LIFECYCLE_RETRY_UNSUPPORTED");
  if (request.action !== "query-status" && request.action !== "resume") fail("EXTENSION_LIFECYCLE_RETRY_INVALID");
  validateOperationId(request.operationId);
  return {
    action: request.action,
    identity: validateOperationIdentity(request.identity),
    operationId: request.operationId,
    schemaVersion: request.schemaVersion,
  };
}

export function validateExtensionHostContext(value: unknown): ExtensionHostContext {
  const context = asRecord(value, "EXTENSION_HOST_CONTEXT_INVALID");
  assertOnlyKeys(context, ["extensionId", "operationId", "packageSha256", "project", "schemaVersion", "scope", "target", "version"], "EXTENSION_HOST_CONTEXT_INVALID");
  if (context.schemaVersion !== "agent-system.extension-host-context.v1") fail("EXTENSION_HOST_CONTEXT_UNSUPPORTED");
  if (context.target !== "main" && context.target !== "workflow-test") fail("EXTENSION_HOST_CONTEXT_INVALID");
  const identity = validateOperationIdentity({
    extensionId: context.extensionId,
    packageSha256: context.packageSha256,
    project: context.project,
    scope: context.scope,
    version: context.version,
  });
  if (context.operationId !== undefined) validateOperationId(context.operationId);
  return { ...identity, schemaVersion: context.schemaVersion, target: context.target, ...(context.operationId ? { operationId: context.operationId as string } : {}) };
}

export function validateExtensionSourceSyncState(value: unknown): ExtensionSourceSyncState {
  const state = asRecord(value, "EXTENSION_SOURCE_SYNC_INVALID");
  assertOnlyKeys(state, ["changes", "operation", "schemaVersion", "source", "targets"], "EXTENSION_SOURCE_SYNC_INVALID");
  if (state.schemaVersion !== "agent-system.extension-source-sync.v1") fail("EXTENSION_SOURCE_SYNC_UNSUPPORTED");
  const source = asRecord(state.source, "EXTENSION_SOURCE_SYNC_INVALID");
  assertOnlyKeys(source, ["desiredUrl", "status"], "EXTENSION_SOURCE_SYNC_INVALID");
  if ((source.status === "not-configured" && source.desiredUrl !== null)
    || (source.status === "configured" && (typeof source.desiredUrl !== "string" || !isHttpUrl(source.desiredUrl)))) {
    fail("EXTENSION_SOURCE_SYNC_INVALID");
  }
  if (source.status !== "not-configured" && source.status !== "configured") fail("EXTENSION_SOURCE_SYNC_INVALID");
  const targets = asRecord(state.targets, "EXTENSION_SOURCE_SYNC_INVALID");
  assertOnlyKeys(targets, ["main", "workflow-test"], "EXTENSION_SOURCE_SYNC_INVALID");
  validateSyncTarget(targets.main);
  validateSyncTarget(targets["workflow-test"]);
  if (state.operation !== undefined) validateSyncOperation(state.operation);
  if (state.changes !== undefined) validateSyncChanges(state.changes);
  return cloneJson(state) as unknown as ExtensionSourceSyncState;
}

function validateOperationIdentity(value: unknown): ExtensionOperationIdentity {
  const identity = asRecord(value, "EXTENSION_OPERATION_IDENTITY_INVALID");
  assertOnlyKeys(identity, ["extensionId", "packageSha256", "project", "scope", "version"], "EXTENSION_OPERATION_IDENTITY_INVALID");
  validateExtensionId(identity.extensionId, "EXTENSION_OPERATION_IDENTITY_INVALID");
  validateVersion(identity.version, "EXTENSION_OPERATION_IDENTITY_INVALID");
  if (typeof identity.packageSha256 !== "string" || !SHA256_PATTERN.test(identity.packageSha256)) fail("EXTENSION_OPERATION_IDENTITY_INVALID");
  if (identity.scope === "project") {
    if (typeof identity.project !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(identity.project)) fail("EXTENSION_OPERATION_IDENTITY_INVALID");
  } else if (identity.scope === "global") {
    if (identity.project !== undefined) fail("EXTENSION_OPERATION_IDENTITY_INVALID");
  } else {
    fail("EXTENSION_OPERATION_IDENTITY_INVALID");
  }
  return cloneJson(identity) as unknown as ExtensionOperationIdentity;
}

function validateSyncTarget(value: unknown): void {
  const target = asRecord(value, "EXTENSION_SOURCE_SYNC_TARGET_INVALID");
  assertOnlyKeys(target, ["appliedRevision", "appliedSourceUrl", "contentSha256", "readiness"], "EXTENSION_SOURCE_SYNC_TARGET_INVALID");
  if (!Object.prototype.hasOwnProperty.call(target, "appliedSourceUrl")) fail("EXTENSION_SOURCE_SYNC_TARGET_INVALID");
  if (!["not-ready", "ready", "unknown"].includes(String(target.readiness))) fail("EXTENSION_SOURCE_SYNC_TARGET_INVALID");
  if (target.appliedSourceUrl !== null
    && (typeof target.appliedSourceUrl !== "string" || !isHttpUrl(target.appliedSourceUrl) || target.appliedRevision === undefined)) {
    fail("EXTENSION_SOURCE_SYNC_TARGET_INVALID");
  }
  if (target.appliedRevision !== undefined && (typeof target.appliedRevision !== "string" || !target.appliedRevision.trim())) fail("EXTENSION_SOURCE_SYNC_TARGET_INVALID");
  if (target.contentSha256 !== undefined && (typeof target.contentSha256 !== "string" || !SHA256_PATTERN.test(target.contentSha256))) fail("EXTENSION_SOURCE_SYNC_TARGET_INVALID");
  if ((target.appliedRevision === undefined) !== (target.contentSha256 === undefined)) fail("EXTENSION_SOURCE_SYNC_TARGET_INVALID");
  if (target.readiness === "ready" && target.appliedRevision === undefined) fail("EXTENSION_SOURCE_SYNC_TARGET_INVALID");
}

function validateSyncOperation(value: unknown): void {
  const operation = asRecord(value, "EXTENSION_SOURCE_SYNC_OPERATION_INVALID");
  assertOnlyKeys(operation, ["candidateRevision", "candidateSha256", "completed", "operationId", "retryAction", "sourceUrl", "status"], "EXTENSION_SOURCE_SYNC_OPERATION_INVALID");
  validateOperationId(operation.operationId);
  if (typeof operation.sourceUrl !== "string" || !isHttpUrl(operation.sourceUrl)
    || !["failed", "running", "succeeded", "unknown"].includes(String(operation.status))
    || typeof operation.completed !== "boolean"
    || !["none", "query-first", "resume"].includes(String(operation.retryAction))) {
    fail("EXTENSION_SOURCE_SYNC_OPERATION_INVALID");
  }
  if (operation.status === "succeeded" && (operation.completed !== true || operation.retryAction !== "none")) fail("EXTENSION_SOURCE_SYNC_OPERATION_INVALID");
  if (operation.status === "running" && (operation.completed !== false || operation.retryAction !== "none")) fail("EXTENSION_SOURCE_SYNC_OPERATION_INVALID");
  if (operation.status === "unknown" && (operation.completed !== false || operation.retryAction !== "query-first")) fail("EXTENSION_SOURCE_SYNC_OPERATION_INVALID");
  if (operation.status === "failed" && operation.retryAction === "query-first") fail("EXTENSION_SOURCE_SYNC_OPERATION_INVALID");
  if (operation.candidateRevision !== undefined && (typeof operation.candidateRevision !== "string" || !operation.candidateRevision.trim())) fail("EXTENSION_SOURCE_SYNC_OPERATION_INVALID");
  if (operation.candidateSha256 !== undefined && (typeof operation.candidateSha256 !== "string" || !SHA256_PATTERN.test(operation.candidateSha256))) fail("EXTENSION_SOURCE_SYNC_OPERATION_INVALID");
  if ((operation.candidateRevision === undefined) !== (operation.candidateSha256 === undefined)) fail("EXTENSION_SOURCE_SYNC_OPERATION_INVALID");
}

function validateSyncChanges(value: unknown): void {
  const changes = asRecord(value, "EXTENSION_SOURCE_CHANGES_INVALID");
  assertOnlyKeys(changes, ["added", "candidateRevision", "deleted", "modified"], "EXTENSION_SOURCE_CHANGES_INVALID");
  if (typeof changes.candidateRevision !== "string" || !changes.candidateRevision.trim()) fail("EXTENSION_SOURCE_CHANGES_INVALID");
  const seen = new Set<string>();
  for (const key of ["added", "modified", "deleted"] as const) {
    if (!Array.isArray(changes[key])) fail("EXTENSION_SOURCE_CHANGES_INVALID");
    for (const item of changes[key] as unknown[]) {
      const resource = asRecord(item, "EXTENSION_SOURCE_CHANGES_INVALID");
      assertOnlyKeys(resource, ["kind", "name"], "EXTENSION_SOURCE_CHANGES_INVALID");
      if (typeof resource.kind !== "string" || !RESOURCE_KINDS.has(resource.kind as ExtensionPackageResourceKind)
        || typeof resource.name !== "string" || !/^[A-Za-z0-9_.-]{1,100}$/.test(resource.name)) {
        fail("EXTENSION_SOURCE_CHANGES_INVALID");
      }
      const identity = `${resource.kind}:${resource.name}`;
      if (seen.has(identity)) fail("EXTENSION_SOURCE_CHANGES_DUPLICATE");
      seen.add(identity);
    }
  }
}

function validateSettingProperties(value: unknown): void {
  const properties = asRecord(value, "EXTENSION_SETTINGS_DEFINITION_INVALID");
  if (Object.keys(properties).length > 200) fail("EXTENSION_SETTINGS_DEFINITION_INVALID");
  for (const [name, rawField] of Object.entries(properties)) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name)) fail("EXTENSION_SETTINGS_DEFINITION_INVALID");
    const field = asRecord(rawField, "EXTENSION_SETTINGS_DEFINITION_INVALID");
    assertOnlyKeys(field, ["description", "required", "sensitive", "type"], "EXTENSION_SETTINGS_DEFINITION_INVALID");
    if (!["array", "boolean", "integer", "number", "object", "string"].includes(String(field.type))) fail("EXTENSION_SETTINGS_DEFINITION_INVALID");
    if (field.required !== undefined && typeof field.required !== "boolean") fail("EXTENSION_SETTINGS_DEFINITION_INVALID");
    if (field.sensitive !== undefined && typeof field.sensitive !== "boolean") fail("EXTENSION_SETTINGS_DEFINITION_INVALID");
    if (field.description !== undefined && (typeof field.description !== "string" || field.description.length > 500)) fail("EXTENSION_SETTINGS_DEFINITION_INVALID");
  }
}

function validateContextProperties(value: unknown): void {
  const properties = asRecord(value, "EXTENSION_CONTEXT_DEFINITION_INVALID");
  if (Object.keys(properties).length > 100) fail("EXTENSION_CONTEXT_DEFINITION_INVALID");
  for (const [name, rawField] of Object.entries(properties)) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name)) fail("EXTENSION_CONTEXT_DEFINITION_INVALID");
    const field = asRecord(rawField, "EXTENSION_CONTEXT_DEFINITION_INVALID");
    assertOnlyKeys(field, ["description", "type"], "EXTENSION_CONTEXT_DEFINITION_INVALID");
    if (!["boolean", "number", "string"].includes(String(field.type))) fail("EXTENSION_CONTEXT_DEFINITION_INVALID");
    if (field.description !== undefined && (typeof field.description !== "string" || field.description.length > 500)) fail("EXTENSION_CONTEXT_DEFINITION_INVALID");
  }
}

function validateMigrations(value: unknown): void {
  if (!Array.isArray(value) || value.length > 100) fail("EXTENSION_MIGRATIONS_INVALID");
  const ids = new Set<string>();
  for (const item of value) {
    const migration = asRecord(item, "EXTENSION_MIGRATIONS_INVALID");
    assertOnlyKeys(migration, ["fromVersion", "id", "toVersion"], "EXTENSION_MIGRATIONS_INVALID");
    if (typeof migration.id !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(migration.id)
      || typeof migration.fromVersion !== "string" || !SEMVER_PATTERN.test(migration.fromVersion)
      || typeof migration.toVersion !== "string" || !SEMVER_PATTERN.test(migration.toVersion)
      || migration.fromVersion === migration.toVersion) {
      fail("EXTENSION_MIGRATIONS_INVALID");
    }
    if (ids.has(migration.id)) fail("EXTENSION_MIGRATIONS_DUPLICATE");
    ids.add(migration.id);
  }
}

function validateFileAssociations(value: unknown, code: string): void {
  if (!Array.isArray(value) || value.length > 64) fail(code);
  const extensions = new Set<string>();
  for (const item of value) {
    const association = asRecord(item, code);
    if (typeof association.extension !== "string" || !/^\.[a-z0-9][a-z0-9._+-]{0,31}$/.test(association.extension)) fail(code);
    if (extensions.has(association.extension)) fail(code);
    extensions.add(association.extension);
    if (association.mediaType !== undefined
      && (typeof association.mediaType !== "string" || !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(association.mediaType))) {
      fail(code);
    }
  }
}

function validateAliases(value: unknown, code: string): void {
  validateStringList(value, /^[a-z0-9][a-z0-9_.-]{0,63}$/, code);
}

function validateStringList(value: unknown, pattern: RegExp, code: string): void {
  if (!Array.isArray(value) || value.length > 200) fail(code);
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !pattern.test(item) || seen.has(item)) fail(code);
    seen.add(item);
  }
}

function validateExtensionId(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || !EXTENSION_ID_PATTERN.test(value)) fail(code);
}

function validateVersion(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || !SEMVER_PATTERN.test(value)) fail(code);
}

function validateOperationId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) fail("EXTENSION_OPERATION_ID_INVALID");
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: string[], code: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail(code);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function compareVersions(first: string, second: string): number {
  const firstMatch = SEMVER_PATTERN.exec(first)!;
  const secondMatch = SEMVER_PATTERN.exec(second)!;
  const firstCore = firstMatch.slice(1, 4);
  const secondCore = secondMatch.slice(1, 4);
  for (let index = 0; index < 3; index += 1) {
    const comparison = compareNumericIdentifiers(firstCore[index]!, secondCore[index]!);
    if (comparison !== 0) return comparison;
  }

  const firstPrerelease = firstMatch[4]?.split(".");
  const secondPrerelease = secondMatch[4]?.split(".");
  if (!firstPrerelease || !secondPrerelease) {
    if (!firstPrerelease && !secondPrerelease) return 0;
    return firstPrerelease ? -1 : 1;
  }
  for (let index = 0; index < Math.min(firstPrerelease.length, secondPrerelease.length); index += 1) {
    const firstIdentifier = firstPrerelease[index]!;
    const secondIdentifier = secondPrerelease[index]!;
    const firstIsNumeric = /^\d+$/.test(firstIdentifier);
    const secondIsNumeric = /^\d+$/.test(secondIdentifier);
    if (firstIsNumeric && secondIsNumeric) {
      const comparison = compareNumericIdentifiers(firstIdentifier, secondIdentifier);
      if (comparison !== 0) return comparison;
    } else if (firstIsNumeric !== secondIsNumeric) {
      return firstIsNumeric ? -1 : 1;
    } else if (firstIdentifier !== secondIdentifier) {
      return firstIdentifier < secondIdentifier ? -1 : 1;
    }
  }
  if (firstPrerelease.length !== secondPrerelease.length) return firstPrerelease.length < secondPrerelease.length ? -1 : 1;
  return 0;
}

function compareNumericIdentifiers(first: string, second: string): number {
  if (first.length !== second.length) return first.length < second.length ? -1 : 1;
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.toLowerCase() === "github.com" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function fail(code: string): never {
  throw new ExtensionContractValidationError(code);
}
