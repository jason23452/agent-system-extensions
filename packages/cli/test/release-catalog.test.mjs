import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { validateExtensionCatalog } from "../src/lib/contracts.mjs";
import { prepareCliRelease, prepareExtensionRelease } from "../src/lib/release-catalog.mjs";
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

test("release preparation reuses pinned bytes and preserves them when source or hash conflicts", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-release-staging-"));
  try {
    const firstPath = join(root, "staged-first.aicxt");
    const changedPath = join(root, "staged-changed.aicxt");
    const fixedPath = join(root, "extensions", "gitlab", "dist", "gitlab-2.0.0.aicxt");
    const firstBytes = createAicxt({ extensionId: "gitlab", displayName: "GitLab Skills", version: "2.0.0" });
    const changedBytes = createAicxt({ extensionId: "gitlab", displayName: "GitLab Skills", version: "2.0.0", extraFileBytes: 3 });
    await writeFile(firstPath, firstBytes);
    await writeFile(changedPath, changedBytes);

    const first = await prepareExtensionRelease({
      repositoryRoot: root,
      extensionId: "gitlab",
      version: "2.0.0",
      artifactPath: firstPath,
      finalArtifactPath: fixedPath,
      sourceRevision,
    });
    const pinnedBytes = await readFile(fixedPath);
    const pinnedProvenance = await readFile(first.provenancePath, "utf8");
    const pinnedCatalog = await readFile(first.catalogPath, "utf8");

    const rerun = await prepareExtensionRelease({
      repositoryRoot: root,
      extensionId: "gitlab",
      version: "2.0.0",
      artifactPath: changedPath,
      finalArtifactPath: fixedPath,
      sourceRevision,
    });
    assert.equal(rerun.packageData.archiveSha256, first.packageData.archiveSha256);
    await assert.rejects(prepareExtensionRelease({
      repositoryRoot: root,
      extensionId: "gitlab",
      version: "2.0.0",
      artifactPath: changedPath,
      finalArtifactPath: fixedPath,
      sourceRevision: "b".repeat(40),
    }), (error) => error.code === "RELEASE_PROVENANCE_CONFLICT");

    assert.deepEqual(await readFile(fixedPath), pinnedBytes);
    assert.equal(await readFile(first.provenancePath, "utf8"), pinnedProvenance);
    assert.equal(await readFile(first.catalogPath, "utf8"), pinnedCatalog);
    assert.equal((await prepareExtensionRelease({
      repositoryRoot: root,
      extensionId: "gitlab",
      version: "2.0.0",
      artifactPath: changedPath,
      finalArtifactPath: fixedPath,
      sourceRevision,
    })).packageData.archiveSha256, first.packageData.archiveSha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("first promotion reuses exact preexisting bytes and rejects a different unpinned artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-release-promotion-"));
  try {
    const sameRoot = join(root, "same");
    const conflictRoot = join(root, "conflict");
    const packageBytes = createAicxt({ extensionId: "gitlab", displayName: "GitLab Skills", version: "2.0.0" });
    const changedBytes = createAicxt({ extensionId: "gitlab", displayName: "GitLab Skills", version: "2.0.0", extraFileBytes: 3 });
    const prepare = async (repositoryRoot, artifactBytes) => {
      const artifactPath = join(repositoryRoot, "candidate.aicxt");
      const finalArtifactPath = join(repositoryRoot, "extensions", "gitlab", "dist", "gitlab-2.0.0.aicxt");
      await mkdir(dirname(finalArtifactPath), { recursive: true });
      await writeFile(artifactPath, artifactBytes);
      await writeFile(finalArtifactPath, packageBytes);
      return { artifactPath, finalArtifactPath, repositoryRoot };
    };

    const reusable = await prepare(sameRoot, packageBytes);
    await prepareExtensionRelease({
      ...reusable,
      extensionId: "gitlab",
      version: "2.0.0",
      sourceRevision,
    });
    assert.deepEqual(await readFile(reusable.finalArtifactPath), packageBytes);

    const conflict = await prepare(conflictRoot, changedBytes);
    await assert.rejects(prepareExtensionRelease({
      ...conflict,
      extensionId: "gitlab",
      version: "2.0.0",
      sourceRevision,
    }), (error) => error.code === "RELEASE_IMMUTABLE_CONFLICT");
    assert.deepEqual(await readFile(conflict.finalArtifactPath), packageBytes);
    await assert.rejects(readFile(join(conflictRoot, "releases", "gitlab", "2.0.0.json")), { code: "ENOENT" });
    await assert.rejects(readFile(join(conflictRoot, "catalog.json")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI release preparation reuses a pinned tarball and rejects conflicting source without replacing it", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-release-staging-"));
  try {
    const firstPath = join(root, "staged-first.tgz");
    const changedPath = join(root, "staged-changed.tgz");
    const fixedPath = join(root, "packages", "cli", "dist", "release", "agent-system-extensions-cli-0.1.0.tgz");
    const firstBytes = Buffer.from("first reviewed CLI tarball bytes");
    const changedBytes = Buffer.from("different CLI tarball bytes");
    await writeFile(firstPath, firstBytes);
    await writeFile(changedPath, changedBytes);

    const first = await prepareCliRelease({
      repositoryRoot: root,
      version: "0.1.0",
      artifactPath: firstPath,
      finalArtifactPath: fixedPath,
      sourceRevision,
    });
    const rerun = await prepareCliRelease({
      repositoryRoot: root,
      version: "0.1.0",
      artifactPath: changedPath,
      finalArtifactPath: fixedPath,
      sourceRevision,
    });
    assert.equal(rerun.packageSha256, first.packageSha256);
    await assert.rejects(prepareCliRelease({
      repositoryRoot: root,
      version: "0.1.0",
      artifactPath: changedPath,
      finalArtifactPath: fixedPath,
      sourceRevision: "c".repeat(40),
    }), (error) => error.code === "RELEASE_PROVENANCE_CONFLICT");
    assert.deepEqual(await readFile(fixedPath), firstBytes);
    assert.equal(JSON.parse(await readFile(first.provenancePath, "utf8")).artifact.sha256, first.packageSha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preparing a new CLI patch release preserves previous fixed artifact bytes and provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-release-versioned-"));
  try {
    const oldSourcePath = join(root, "old-source.tgz");
    const newSourcePath = join(root, "new-source.tgz");
    const oldFixedPath = join(root, "packages", "cli", "dist", "release", "agent-system-extensions-cli-0.1.0.tgz");
    const newFixedPath = join(root, "packages", "cli", "dist", "release", "agent-system-extensions-cli-0.1.1.tgz");
    const oldBytes = Buffer.from("previous immutable CLI release bytes");
    const newBytes = Buffer.from("new CLI patch release bytes");
    await writeFile(oldSourcePath, oldBytes);
    await writeFile(newSourcePath, newBytes);

    const previous = await prepareCliRelease({
      repositoryRoot: root,
      version: "0.1.0",
      artifactPath: oldSourcePath,
      finalArtifactPath: oldFixedPath,
      sourceRevision,
    });
    const oldProvenanceBytes = await readFile(previous.provenancePath);
    const next = await prepareCliRelease({
      repositoryRoot: root,
      version: "0.1.1",
      artifactPath: newSourcePath,
      finalArtifactPath: newFixedPath,
      sourceRevision: "b".repeat(40),
    });

    assert.deepEqual(await readFile(oldFixedPath), oldBytes);
    assert.deepEqual(await readFile(previous.provenancePath), oldProvenanceBytes);
    assert.deepEqual(await readFile(newFixedPath), newBytes);
    assert.equal(next.provenance.version, "0.1.1");
    assert.equal(next.provenance.sourceRevision, "b".repeat(40));
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
