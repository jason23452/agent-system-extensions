import { randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const PROJECT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SKILL_DOCUMENT_BYTES = 512 * 1024;
const SYNC_STATE_FILE = ".gitlab-skills-sync.json";

export async function activate({ cloneRepository = cloneGitRepository } = {}) {
  return {
    async handle({ host, request }) {
      if (request.method !== "POST" || !["install-skills", "sync-skills"].includes(request.path)) {
        return {
          status: 404,
          body: { error: { code: "GITLAB_SKILL_SYNC_PATH_NOT_FOUND", message: "GitLab Skills source path was not found." } },
        };
      }
      if (host.scope !== "project" || !host.project) {
        throw new Error("GitLab Skills source synchronization requires a trusted Project context.");
      }
      const repositoryUrl = isRecord(request.body) ? request.body.repositoryUrl : undefined;
      return { body: await syncGitLabSkills({ project: host.project, repositoryUrl, cloneRepository }) };
    },
    async dispose() {},
  };
}

export async function syncGitLabSkills({
  project,
  repositoryUrl,
  targets,
  projectsRoot = process.env.OPENCODE_PROJECTS_ROOT || "/workspace/projects",
  workflowProjectsRoot = process.env.OPENCODE_WORKFLOW_PROJECTS_ROOT || "/workflow/projects",
  cloneRepository = cloneGitRepository,
  applyTarget = applyGitLabSkillsToTarget,
}) {
  if (typeof project !== "string" || !PROJECT_NAME_PATTERN.test(project)) {
    throw new Error("GitLab Skills synchronization requires a valid Project identity.");
  }
  let normalizedUrl;
  try {
    normalizedUrl = normalizeRepositoryUrl(repositoryUrl);
  } catch {
    return { project, status: "failed", message: "The saved GitLab Skills repository URL is invalid; existing Skills were kept." };
  }
  if (!normalizedUrl) {
    return { project, status: "source-not-configured", message: "GitLab Skills source is not configured; no clone was started." };
  }

  let projectTargets;
  try {
    projectTargets = targets ?? {
      main: await resolvePluginDirectory(projectsRoot, project),
      "workflow-test": await resolvePluginDirectory(workflowProjectsRoot, project),
    };
  } catch {
    return { project, status: "failed", message: "GitLab Skills Project targets are unavailable; existing Skills were kept." };
  }
  const namedTargets = ["main", "workflow-test"].map((name) => ({ name, directory: projectTargets[name] }));
  if (namedTargets.some((target) => typeof target.directory !== "string" || !target.directory)) {
    return { project, status: "failed", message: "GitLab Skills targets are unavailable; existing Skills were kept." };
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "agent-system-gitlab-skills-"));
  try {
    const repositoryDirectory = join(temporaryRoot, "repository");
    const stagedSkillsDirectory = join(temporaryRoot, "skills");
    let revision;
    let skills;
    let fingerprint;
    try {
      revision = await cloneRepository(normalizedUrl, repositoryDirectory);
      skills = await stageSkills(repositoryDirectory, stagedSkillsDirectory);
      fingerprint = await fingerprintDirectory(stagedSkillsDirectory);
      if (typeof revision !== "string" || !revision.trim()) throw new Error("The candidate revision is unavailable.");
    } catch {
      return {
        project,
        status: "failed",
        message: "GitLab Skills candidate could not be cloned or validated; existing Skills were kept.",
        targets: Object.fromEntries(namedTargets.map(({ name }) => [name, { status: "not-applied" }])),
      };
    }

    const results = {};
    for (const target of namedTargets) {
      try {
        const previous = await readTargetState(target.directory);
        const targetSkills = join(target.directory, "skills");
        const installed = await lstat(targetSkills).then((details) => details.isDirectory() && !details.isSymbolicLink()).catch(() => false);
        if (installed && previous?.revision === revision && previous?.fingerprint === fingerprint) {
          results[target.name] = { revision, status: "unchanged" };
          continue;
        }
        await applyTarget(target, stagedSkillsDirectory, revision, fingerprint);
        results[target.name] = { revision, status: "synced" };
      } catch {
        results[target.name] = { revision: (await readTargetState(target.directory))?.revision, status: "failed" };
      }
    }

    const failed = Object.values(results).filter((result) => result.status === "failed").length;
    const succeeded = Object.values(results).filter((result) => result.status !== "failed").length;
    const status = failed === 0 ? "synced" : succeeded === 0 ? "failed" : "partial";
    return {
      project,
      status,
      ...(status === "partial" ? { message: "GitLab Skills were only partially applied; retry to finish the failed target." } : {}),
      ...(status === "failed" ? { message: "GitLab Skills could not be applied; retry after checking the Project targets." } : {}),
      revision,
      skillCount: skills.length,
      skills,
      pluginContributions: [{
        pluginName: "gitlab",
        contributions: [
          ...skills.map((name) => ({ kind: "skill", name })),
          { kind: "tool", name: "gitlab_select_skill" },
        ],
      }],
      targets: results,
    };
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

export async function applyGitLabSkillsToTarget(target, stagedSkillsDirectory, revision, fingerprint) {
  const targetSkills = join(target.directory, "skills");
  const replacement = await replaceDirectoryAtomically(targetSkills, stagedSkillsDirectory);
  try {
    await writeTargetState(target.directory, { fingerprint, revision });
  } catch (error) {
    await replacement.rollback();
    throw error;
  }
  await replacement.finalize();
}

export function normalizeRepositoryUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("The saved GitLab Skills repository URL is invalid.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("The saved GitLab Skills repository URL is not allowed.");
  }
  return url.toString().replace(/\/$/, "");
}

async function cloneGitRepository(repositoryUrl, destination) {
  const environment = {
    ...process.env,
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
  try {
    await execFile("git", ["clone", "--depth", "1", "--no-tags", "--single-branch", repositoryUrl, destination], {
      cwd: dirname(destination),
      env: environment,
      maxBuffer: 2 * 1024 * 1024,
      timeout: 120_000,
      windowsHide: true,
    });
    const result = await execFile("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: destination,
      env: environment,
      maxBuffer: 64 * 1024,
      timeout: 30_000,
      windowsHide: true,
    });
    return result.stdout.trim();
  } catch {
    throw new Error("Unable to clone the saved GitLab Skills repository.");
  }
}

async function resolvePluginDirectory(projectsRoot, project) {
  const root = await realpath(resolve(projectsRoot));
  const projectPath = resolve(root, project);
  if (!isPathInside(root, projectPath)) throw new Error("GitLab Skills Project path is invalid.");
  const projectDetails = await lstat(projectPath);
  if (!projectDetails.isDirectory() || projectDetails.isSymbolicLink()) throw new Error("GitLab Skills Project directory is unavailable.");
  const realProjectPath = await realpath(projectPath);
  if (!isPathInside(root, realProjectPath)) throw new Error("GitLab Skills Project resolves outside the managed Projects directory.");
  let current = realProjectPath;
  for (const segment of [".opencode", "plugins", "gitlab"]) {
    current = join(current, segment);
    const details = await lstat(current);
    if (!details.isDirectory() || details.isSymbolicLink()) throw new Error("GitLab Plugin directory is unavailable.");
    current = await realpath(current);
    if (!isPathInside(realProjectPath, current)) throw new Error("GitLab Plugin directory resolves outside the Project.");
  }
  return current;
}

async function stageSkills(repositoryDirectory, stagedSkillsDirectory) {
  const repositoryDetails = await lstat(repositoryDirectory);
  if (!repositoryDetails.isDirectory() || repositoryDetails.isSymbolicLink()) throw new Error("GitLab Skills candidate is not a supported directory.");
  const repositoryPath = await realpath(repositoryDirectory);
  const skillFiles = await findSkillFiles(repositoryPath);
  if (skillFiles.length === 0) throw new Error("The GitLab repository contains no SKILL.md files.");
  if (skillFiles.length > 199) throw new Error("The GitLab repository contains too many Skills to register as Plugin contributions.");

  const names = new Set();
  await mkdir(stagedSkillsDirectory, { recursive: true });
  for (const skillFile of skillFiles) {
    const name = await readSkillName(skillFile);
    if (!SKILL_NAME_PATTERN.test(name) || name.length > 64) throw new Error("The GitLab repository contains an invalid Skill name.");
    if (names.has(name)) throw new Error("The GitLab repository contains duplicate Skill names.");
    names.add(name);
    const relativeDirectory = relative(repositoryPath, dirname(skillFile));
    if (relativeDirectory.startsWith("..") || isAbsolute(relativeDirectory)) throw new Error("A GitLab Skill path escapes the cloned repository.");
    const targetDirectory = resolve(stagedSkillsDirectory, relativeDirectory || name);
    if (!isPathInside(stagedSkillsDirectory, targetDirectory)) throw new Error("A GitLab Skill path is invalid.");
    await copySkillDirectory(dirname(skillFile), targetDirectory);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

async function findSkillFiles(root) {
  const found = [];
  const visit = async (directory) => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules" || isForbiddenFileName(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("The GitLab repository contains a symbolic link.");
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name === "SKILL.md") found.push(path);
    }
  };
  await visit(root);
  return found;
}

async function copySkillDirectory(source, destination) {
  await mkdir(destination, { recursive: true });
  const entries = (await readdir(source, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules" || isForbiddenFileName(entry.name)) continue;
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error("A GitLab Skill contains a symbolic link.");
    if (entry.isDirectory()) await copySkillDirectory(sourcePath, destinationPath);
    else if (entry.isFile()) await cp(sourcePath, destinationPath, { errorOnExist: true });
    else throw new Error("A GitLab Skill contains an unsupported file type.");
  }
}

async function readSkillName(path) {
  const details = await lstat(path);
  if (!details.isFile() || details.isSymbolicLink() || details.size > MAX_SKILL_DOCUMENT_BYTES) throw new Error("A GitLab Skill SKILL.md is not a supported regular file.");
  const content = await readFile(path, "utf8");
  const frontmatter = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1];
  const rawName = frontmatter?.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const name = rawName?.replace(/^("|')(.*)\1$/, "$2");
  if (!name) throw new Error("A GitLab Skill is missing its name in SKILL.md frontmatter.");
  return name;
}

async function fingerprintDirectory(root) {
  const files = [];
  const visit = async (directory) => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("GitLab Skills candidate contains a symbolic link.");
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push({ path: relative(root, path).replaceAll("\\", "/"), content: await readFile(path) });
      else throw new Error("GitLab Skills candidate contains an unsupported file type.");
    }
  };
  await visit(root);
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function readTargetState(targetDirectory) {
  try {
    const value = JSON.parse(await readFile(join(targetDirectory, SYNC_STATE_FILE), "utf8"));
    if (value && typeof value.revision === "string" && typeof value.fingerprint === "string") return value;
  } catch {
    // 無效或缺少狀態時，以已驗證候選重新套用復原。
  }
  return undefined;
}

async function writeTargetState(targetDirectory, state) {
  const statePath = join(targetDirectory, SYNC_STATE_FILE);
  const temporary = join(targetDirectory, `.${SYNC_STATE_FILE}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: "wx" });
    await rename(temporary, statePath);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

async function replaceDirectoryAtomically(target, source) {
  const parent = dirname(target);
  const identity = randomUUID();
  const next = join(parent, `.gitlab-skills-next-${identity}`);
  const backup = join(parent, `.gitlab-skills-backup-${identity}`);
  await cp(source, next, { recursive: true, errorOnExist: true });
  let hadPrevious = false;
  try {
    const previous = await lstat(target).catch((error) => {
      if (isNodeError(error) && error.code === "ENOENT") return undefined;
      throw error;
    });
    if (previous) {
      if (!previous.isDirectory() || previous.isSymbolicLink()) throw new Error("Existing GitLab Plugin Skills path is not a safe directory.");
      await rename(target, backup);
      hadPrevious = true;
    }
    await rename(next, target);
  } catch (error) {
    await rm(next, { force: true, recursive: true }).catch(() => undefined);
    if (hadPrevious) await rename(backup, target).catch(() => undefined);
    throw error;
  }
  return {
    async rollback() {
      await rm(target, { force: true, recursive: true });
      if (hadPrevious) await rename(backup, target);
      await rm(next, { force: true, recursive: true });
    },
    async finalize() {
      if (hadPrevious) await rm(backup, { force: true, recursive: true });
    },
  };
}

function isForbiddenFileName(value) {
  const name = value.toLowerCase();
  return name === "bun.lock" || name === "bun.lockb" || name === "cargo.lock" || name === "composer.lock"
    || name === "gemfile.lock" || name === "package-lock.json" || name === "podfile.lock"
    || name === "pnpm-lock.yaml" || name === "pnpm-lock.yml" || name === "uv.lock" || name === "yarn.lock"
    || name === "lockfile" || name.includes("lockfile");
}

function isPathInside(root, path) {
  const child = relative(resolve(root), resolve(path));
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function isNodeError(error) {
  return error instanceof Error && "code" in error;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
