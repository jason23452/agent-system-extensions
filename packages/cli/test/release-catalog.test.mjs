import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { validateExtensionCatalog } from "../src/lib/contracts.mjs";
import { prepareExtensionRelease } from "../src/lib/release-catalog.mjs";
import { createAicxt } from "./fixtures.mjs";

const sourceRevision = "a".repeat(40);

test("preparing a GitLab release writes provenance and an independently versioned catalog entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-release-prepare-"));
  try {
    const artifactPath = join(root, "gitlab-2.0.0.aicxt");
    await writeFile(artifactPath, createAicxt({ extensionId: "gitlab", displayName: "GitLab Skills", version: "2.0.0" }));

    const result = await prepareExtensionRelease({
      repositoryRoot: root,
      extensionId: "gitlab",
      version: "2.0.0",
      artifactPath,
      sourceRevision,
    });
    const catalog = validateExtensionCatalog(JSON.parse(await readFile(result.catalogPath, "utf8")));
    const provenance = JSON.parse(await readFile(result.provenancePath, "utf8"));

    assert.equal(catalog.extensions[0].extensionId, "gitlab");
    assert.equal(catalog.extensions[0].latestVersion, "2.0.0");
    assert.equal(catalog.extensions[0].releases[0].artifact.sha256, result.packageData.archiveSha256);
    assert.equal(provenance.sourceRevision, sourceRevision);
    assert.equal(provenance.artifact.sha256, catalog.extensions[0].releases[0].artifact.sha256);
    assert.equal(provenance.artifact.url, "https://github.com/jason23452/agent-system-extensions/releases/download/gitlab-v2.0.0/gitlab-2.0.0.aicxt");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preparing the same fixed artifact is idempotent and a same-version different hash is rejected without overwriting", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-release-immutable-"));
  try {
    const firstPath = join(root, "first.aicxt");
    const changedPath = join(root, "changed.aicxt");
    await writeFile(firstPath, createAicxt({ extensionId: "gitlab", displayName: "GitLab Skills", version: "2.0.0" }));
    await writeFile(changedPath, createAicxt({ extensionId: "gitlab", displayName: "GitLab Skills", version: "2.0.0", extraFileBytes: 3 }));
    const first = await prepareExtensionRelease({ repositoryRoot: root, extensionId: "gitlab", version: "2.0.0", artifactPath: firstPath, sourceRevision });
    const beforeCatalog = await readFile(first.catalogPath, "utf8");
    const beforeProvenance = await readFile(first.provenancePath, "utf8");

    await prepareExtensionRelease({ repositoryRoot: root, extensionId: "gitlab", version: "2.0.0", artifactPath: firstPath, sourceRevision });
    await assert.rejects(prepareExtensionRelease({
      repositoryRoot: root,
      extensionId: "gitlab",
      version: "2.0.0",
      artifactPath: changedPath,
      sourceRevision,
    }), (error) => error.code === "RELEASE_IMMUTABLE_CONFLICT");

    assert.equal(await readFile(first.catalogPath, "utf8"), beforeCatalog);
    assert.equal(await readFile(first.provenancePath, "utf8"), beforeProvenance);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("catalog latest advances per Extension and cannot move backwards", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-release-latest-"));
  try {
    const writeArtifact = async (file, id, version) => writeFile(join(root, file), createAicxt({ extensionId: id, displayName: id, version }));
    await writeArtifact("gitlab-2.0.0.aicxt", "gitlab", "2.0.0");
    await writeArtifact("other-9.0.0.aicxt", "other-extension", "9.0.0");
    await writeArtifact("gitlab-2.1.0.aicxt", "gitlab", "2.1.0");
    await writeArtifact("gitlab-1.9.0.aicxt", "gitlab", "1.9.0");

    await prepareExtensionRelease({ repositoryRoot: root, extensionId: "gitlab", version: "2.0.0", artifactPath: join(root, "gitlab-2.0.0.aicxt"), sourceRevision });
    await prepareExtensionRelease({ repositoryRoot: root, extensionId: "other-extension", version: "9.0.0", artifactPath: join(root, "other-9.0.0.aicxt"), sourceRevision });
    await prepareExtensionRelease({ repositoryRoot: root, extensionId: "gitlab", version: "2.1.0", artifactPath: join(root, "gitlab-2.1.0.aicxt"), sourceRevision });
    const catalogPath = join(root, "catalog.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    assert.equal(catalog.extensions.find((item) => item.extensionId === "gitlab").latestVersion, "2.1.0");
    assert.equal(catalog.extensions.find((item) => item.extensionId === "other-extension").latestVersion, "9.0.0");
    const before = await readFile(catalogPath, "utf8");

    await assert.rejects(prepareExtensionRelease({
      repositoryRoot: root,
      extensionId: "gitlab",
      version: "1.9.0",
      artifactPath: join(root, "gitlab-1.9.0.aicxt"),
      sourceRevision,
    }), (error) => error.code === "RELEASE_LATEST_REGRESSION");
    assert.equal(await readFile(catalogPath, "utf8"), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
