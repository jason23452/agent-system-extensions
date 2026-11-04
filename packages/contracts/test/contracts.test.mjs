import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  checkExtensionHostCompatibility,
  extensionReleaseIdentity,
  ExtensionContractValidationError,
  validateExtensionCatalog,
  validateExtensionContributions,
  validateExtensionHostContext,
  validateExtensionHostContract,
  validateExtensionLifecycleStatus,
  validateExtensionLifecycleRetryRequest,
  validateExtensionPackageMetadata,
  validateExtensionRelease,
  validateExtensionSourceSyncState,
} from "../dist/index.js";

const fixtures = new URL("../fixtures/v1/", import.meta.url);

test("the shared v1 corpus has the same valid, invalid, and host-incompatible decisions", async () => {
  const suite = JSON.parse(await readFile(new URL("manifest.json", fixtures), "utf8"));
  assert.equal(suite.contractVersion, "1.0.0");

  for (const scenario of suite.cases) {
    const fixture = JSON.parse(await readFile(new URL(scenario.file, fixtures), "utf8"));
    const validate = () => {
      switch (scenario.contract) {
        case "metadata": return validateExtensionPackageMetadata(fixture);
        case "release": return validateExtensionRelease(fixture);
        case "catalog": return validateExtensionCatalog(fixture);
        case "host-contract": return validateExtensionHostContract(fixture);
        case "contributions": return validateExtensionContributions(fixture);
        case "lifecycle": return validateExtensionLifecycleStatus(fixture);
        case "retry": return validateExtensionLifecycleRetryRequest(fixture);
        case "host-context": return validateExtensionHostContext(fixture);
        case "source-sync": return validateExtensionSourceSyncState(fixture);
        default: throw new Error(`Unknown fixture contract: ${scenario.contract}`);
      }
    };

    if (scenario.expected === "invalid") {
      assert.throws(validate, (error) => error instanceof ExtensionContractValidationError
        && error.code === scenario.errorCode, scenario.file);
      continue;
    }
    const result = validate();
    if (scenario.contract === "release") {
      const compatibility = checkExtensionHostCompatibility(result.hostRequirements, scenario.hostVersion, scenario.hostCapabilities);
      assert.equal(compatibility.compatible, scenario.expected === "valid", scenario.file);
      if (scenario.expected === "incompatible") assert.deepEqual(compatibility.reasons, [scenario.incompatibleReason ?? "host-version-too-old"], scenario.file);
    }
  }
});

test("release identity includes the archive hash even when Extension and version match", async () => {
  const release = validateExtensionRelease(JSON.parse(await readFile(new URL("release.valid.json", fixtures), "utf8")));
  const original = extensionReleaseIdentity({
    extensionId: release.extensionId,
    version: release.version,
    packageSha256: release.artifact.sha256,
  });
  const rebuilt = extensionReleaseIdentity({
    extensionId: release.extensionId,
    version: release.version,
    packageSha256: "b".repeat(64),
  });
  assert.notEqual(original, rebuilt);
});

test("lifecycle outcomes remain attached to one pinned operation identity", async () => {
  const statuses = await Promise.all(["operation.succeeded.json", "operation.failed.json", "operation.unknown.json"].map(async (file) => {
    const status = validateExtensionLifecycleStatus(JSON.parse(await readFile(new URL(file, fixtures), "utf8")));
    return { completed: status.completed, identity: status.identity, operationId: status.operationId };
  }));
  assert.deepEqual(statuses.map(({ operationId }) => operationId), ["install-open-design-001", "install-open-design-001", "install-open-design-001"]);
  assert.equal(statuses[0].completed, true);
  assert.deepEqual(statuses[1].identity, statuses[0].identity);
  assert.deepEqual(statuses[2].identity, statuses[0].identity);
  for (const file of ["retry.query-status.json", "retry.resume.json"]) {
    const retry = validateExtensionLifecycleRetryRequest(JSON.parse(await readFile(new URL(file, fixtures), "utf8")));
    assert.equal(retry.operationId, statuses[0].operationId);
    assert.deepEqual(retry.identity, statuses[0].identity);
  }
});

test("clearing a source setting preserves previously applied target revisions", async () => {
  const state = validateExtensionSourceSyncState(JSON.parse(await readFile(new URL("sync.not-configured.json", fixtures), "utf8")));
  assert.equal(state.source.desiredUrl, null);
  assert.equal(state.targets.main.appliedRevision, "rev-main-1");
  assert.equal(state.targets["workflow-test"].appliedRevision, "rev-test-1");
});

test("a failed source change retains each target's previous applied source", async () => {
  const state = validateExtensionSourceSyncState(JSON.parse(await readFile(new URL("sync.failed-source-change.json", fixtures), "utf8")));
  const desiredUrl = "https://gitlab.example.test/group/new-skills.git";
  const appliedUrl = "https://gitlab.example.test/group/old-skills.git";

  assert.equal(state.source.desiredUrl, desiredUrl);
  assert.equal(state.operation.sourceUrl, desiredUrl);
  assert.equal(state.operation.status, "failed");
  assert.equal(state.targets.main.appliedSourceUrl, appliedUrl);
  assert.equal(state.targets["workflow-test"].appliedSourceUrl, appliedUrl);
  assert.notEqual(state.targets.main.appliedSourceUrl, state.source.desiredUrl);
});
