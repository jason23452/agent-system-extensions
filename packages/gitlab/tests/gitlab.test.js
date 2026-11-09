import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFile = promisify(execFileCallback);
const source = new URL("../source/", import.meta.url);

test("GitLab project URL save is separate from sync; empty URL never clones or clears content", async () => {
  const { saveGitLabRepositoryUrl, syncSavedGitLabSkills } = await import(new URL("frontend/entry.js", source));
  const calls = [];
  let settings = { gitlab: { repositoryUrl: "https://example.invalid/skills.git", lastSyncedRevision: "keep-me" } };
  const host = { api: {
    async readExtensionSettings(scope) { calls.push(["read", scope]); return settings; },
    async writeExtensionSettings(next, scope) { calls.push(["write", scope]); settings = next; },
    async callExtensionBackend(path, options) { calls.push(["backend", path, options]); return { status: "synced" }; },
  } };

  await saveGitLabRepositoryUrl(host, "  https://example.invalid/skills.git  ");
  assert.equal(calls.some(([kind]) => kind === "backend"), false);
  assert.equal((await syncSavedGitLabSkills(host)).status, "synced");
  assert.equal(calls.filter(([kind]) => kind === "backend").length, 1);

  await saveGitLabRepositoryUrl(host, "");
  assert.equal(settings.gitlab.repositoryUrl, "");
  assert.equal(settings.gitlab.lastSyncedRevision, "keep-me");
  const before = calls.filter(([kind]) => kind === "backend").length;
  assert.equal((await syncSavedGitLabSkills(host)).status, "source-not-configured");
  assert.equal(calls.filter(([kind]) => kind === "backend").length, before);
});

test("GitLab backend reports an unset source without starting a clone", async () => {
  const { activate } = await import(new URL("backend/entry.js", source));
  let cloneStarted = false;
  const backend = await activate({ cloneRepository: async () => { cloneStarted = true; throw new Error("must not clone"); } });
  const result = await backend.handle({
    host: { scope: "project", project: "demo" },
    request: { method: "POST", path: "sync-skills", body: {} },
  });
  assert.equal(result.body.status, "source-not-configured");
  assert.equal(cloneStarted, false);
});

test("GitLab validates the full candidate before replacing existing Project Skills", async () => {
  const { syncGitLabSkills } = await import(new URL("backend/entry.js", source));
  const root = await mkdtemp(join(tmpdir(), "gitlab-invalid-candidate-test-"));
  const main = join(root, "main", "demo", ".opencode", "plugins", "gitlab");
  const workflow = join(root, "workflow", "demo", ".opencode", "plugins", "gitlab");
  const invalidSource = join(root, "invalid-source");
  try {
    await mkdir(join(main, "skills", "old-skill"), { recursive: true });
    await mkdir(join(workflow, "skills", "old-skill"), { recursive: true });
    await mkdir(invalidSource, { recursive: true });
    await writeFile(join(main, "skills", "old-skill", "SKILL.md"), "old-main\n");
    await writeFile(join(workflow, "skills", "old-skill", "SKILL.md"), "old-workflow\n");
    const result = await syncGitLabSkills({
      project: "demo",
      repositoryUrl: "https://example.invalid/invalid.git",
      targets: { main, "workflow-test": workflow },
      cloneRepository: async (_url, destination) => {
        await cp(invalidSource, destination, { recursive: true });
        return "candidate-revision";
      },
    });
    assert.equal(result.status, "failed");
    assert.equal(await readFile(join(main, "skills", "old-skill", "SKILL.md"), "utf8"), "old-main\n");
    assert.equal(await readFile(join(workflow, "skills", "old-skill", "SKILL.md"), "utf8"), "old-workflow\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GitLab local Git fixture supports partial retry without reapplying a completed target", async () => {
  const { applyGitLabSkillsToTarget, syncGitLabSkills } = await import(new URL("backend/entry.js", source));
  const root = await mkdtemp(join(tmpdir(), "gitlab-local-fixture-test-"));
  const repository = join(root, "source-repository");
  const main = join(root, "main", "demo", ".opencode", "plugins", "gitlab");
  const workflow = join(root, "workflow", "demo", ".opencode", "plugins", "gitlab");
  const skill = join(repository, "parent", "catalog", "one-skill");
  let failWorkflowOnce = true;
  const applyCalls = [];
  try {
    await mkdir(skill, { recursive: true });
    await mkdir(main, { recursive: true });
    await mkdir(workflow, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "---\nname: one-skill\n---\nSkill content\n");
    await execFile("git", ["init", "--initial-branch=main", repository], { timeout: 30_000, windowsHide: true });
    await execFile("git", ["add", "."], { cwd: repository, timeout: 30_000, windowsHide: true });
    await execFile("git", ["-c", "user.name=Ticket 02 Test", "-c", "user.email=ticket-02@example.invalid", "commit", "-m", "Add fixture Skill"], {
      cwd: repository,
      timeout: 30_000,
      windowsHide: true,
    });

    const cloneRepository = async (_url, destination) => {
      await execFile("git", ["clone", "--depth", "1", "--no-tags", "--single-branch", repository, destination], {
        cwd: root,
        timeout: 60_000,
        windowsHide: true,
      });
      const { stdout } = await execFile("git", ["rev-parse", "--verify", "HEAD"], { cwd: destination, timeout: 30_000, windowsHide: true });
      return stdout.trim();
    };
    const applyTarget = async (target, stagedSkills, revision, fingerprint) => {
      applyCalls.push(target.name);
      if (target.name === "workflow-test" && failWorkflowOnce) {
        failWorkflowOnce = false;
        throw new Error("injected target write failure");
      }
      return applyGitLabSkillsToTarget(target, stagedSkills, revision, fingerprint);
    };
    const options = {
      project: "demo",
      repositoryUrl: "https://gitlab.example.invalid/group/skills.git",
      targets: { main, "workflow-test": workflow },
      cloneRepository,
      applyTarget,
    };

    const first = await syncGitLabSkills(options);
    assert.equal(first.status, "partial");
    assert.equal(first.targets.main.status, "synced");
    assert.equal(first.targets["workflow-test"].status, "failed");
    assert.match(first.revision, /^[a-f0-9]{40}$/);
    const installedSkill = (await readFile(join(main, "skills", "parent", "catalog", "one-skill", "SKILL.md"), "utf8")).replaceAll("\r\n", "\n");
    assert.equal(installedSkill, "---\nname: one-skill\n---\nSkill content\n");

    applyCalls.length = 0;
    const retry = await syncGitLabSkills(options);
    assert.equal(retry.status, "synced");
    assert.equal(retry.targets.main.status, "unchanged");
    assert.equal(retry.targets["workflow-test"].status, "synced");
    assert.deepEqual(applyCalls, ["workflow-test"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GitLab selector preserves Plugin and Tool identity while navigating nested Skills", async () => {
  const { GITLAB_SELECT_SKILL_TOOL_NAME, discoverGitLabSkillGroups, selectGitLabSkill } = await import(new URL("plugins/gitlab/gitlab-selector.js", source));
  const root = await mkdtemp(join(tmpdir(), "gitlab-selector-test-"));
  const skillDirectory = join(root, "parent", "catalog", "one-skill");
  try {
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(join(skillDirectory, "SKILL.md"), "---\nname: one-skill\n---\nSelected content\n");
    assert.equal(GITLAB_SELECT_SKILL_TOOL_NAME, "gitlab_select_skill");
    assert.deepEqual(await discoverGitLabSkillGroups(root), [{
      parent: "parent",
      skills: [],
      catalogs: [{ catalog: "catalog", skills: ["one-skill"] }],
    }]);
    const selected = await selectGitLabSkill({ parent: "parent", catalog: "catalog", skillName: "one-skill" }, root);
    assert.match(selected.content, /Selected content/);
    assert.equal(selected.metadata.skillName, "one-skill");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
