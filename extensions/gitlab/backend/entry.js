import { execFile as execFileCallback } from "node:child_process";
import { lstat, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SKILLS = 199;
const MAX_SKILL_DOCUMENT_BYTES = 512 * 1024;
const MAX_SKILL_FILE_BYTES = 10 * 1024 * 1024;
const MAX_CANDIDATE_BYTES = 25 * 1024 * 1024;
const MAX_CANDIDATE_FILES = 4_000;
const SOURCE_SYNC_TOOL = { kind: "tool", name: "gitlab_select_skill" };

export function validateGitLabSourceUrl(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("GitLab Skill source URL is required.");
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("GitLab Skill source URL is invalid.");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:")
    || !url.hostname
    || url.username
    || url.password
    || url.search
    || url.hash) {
    throw new Error("GitLab Skill source URL must be an HTTP(S) clone URL without credentials, query, or fragment.");
  }
  return value.trim();
}

export async function prepareGitLabSource(sourceUrl) {
  const url = validateGitLabSourceUrl(sourceUrl);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "agent-system-gitlab-source-"));
  const repository = join(temporaryRoot, "repository");
  try {
    const gitEnvironment = {
      ...process.env,
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
    };
    try {
      await execFile("git", ["clone", "--no-tags", "--no-recurse-submodules", url, repository], {
        cwd: temporaryRoot,
        env: gitEnvironment,
        maxBuffer: 2 * 1024 * 1024,
        timeout: 120_000,
        windowsHide: true,
      });
    } catch (error) {
      throw new Error("Unable to clone the selected GitLab Skill source.", { cause: error });
    }
    const revision = (await execFile("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: repository,
      env: gitEnvironment,
      maxBuffer: 64 * 1024,
      timeout: 15_000,
      windowsHide: true,
    })).stdout.trim();
    if (!/^[a-f0-9]{40,64}$/.test(revision)) throw new Error("The GitLab Skill source returned an invalid revision.");
    return await discoverGitLabSkills(repository, revision);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function discoverGitLabSkills(repository, revision = "") {
  const repositoryRoot = await realpath(resolve(repository));
  const rootDetails = await lstat(repositoryRoot);
  if (!rootDetails.isDirectory() || rootDetails.isSymbolicLink()) {
    throw new Error("GitLab Skill source is not a safe repository directory.");
  }
  const paths = await findSkillFiles(repositoryRoot);
  if (paths.length === 0) throw new Error("The selected repository contains no SKILL.md files.");
  if (paths.length > MAX_SKILLS) throw new Error("The selected repository contains too many Skills to register.");

  const skillDirectories = new Set(paths.map((path) => resolve(dirname(path))));
  const preflight = await preflightSkillFiles(paths, skillDirectories);
  const entries = [];
  const identities = new Set();
  for (const path of paths) {
    const { name, content } = await readSkillName(path);
    if (!SKILL_NAME_PATTERN.test(name) || name.length > 64) {
      throw new Error("The selected repository contains an invalid Skill frontmatter name.");
    }
    if (identities.has(name)) throw new Error(`The selected repository contains duplicate Skill identity: ${name}.`);
    identities.add(name);
    const directory = dirname(path);
    if (!isPathInside(repositoryRoot, directory) && directory !== repositoryRoot) {
      throw new Error("A GitLab Skill directory escapes the cloned repository.");
    }
    const document = preflight.filesBySkill.get(resolve(directory))?.find((file) => resolve(file.path) === resolve(path));
    if (!document || document.size !== content.byteLength) throw new Error("A GitLab Skill document changed after candidate preflight.");
    entries.push({ directory, documentContent: content, name, path });
  }

  const names = entries.map(({ name }) => name).sort((left, right) => left.localeCompare(right));
  const skillIndex = Buffer.from(`${JSON.stringify({ schemaVersion: "agent-system.gitlab-skill-index.v1", skills: names }, null, 2)}\n`, "utf8");
  assertCandidateBudget(preflight.fileCount + 1, preflight.byteCount + skillIndex.byteLength);

  const resources = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const files = await readSkillFiles(preflight.filesBySkill.get(resolve(entry.directory)) ?? [], entry.path, entry.documentContent);
    resources.push({ kind: "skills", name: entry.name, files });
  }
  resources.push({
    kind: "plugins",
    name: "gitlab",
    files: { "source-skills.json": skillIndex },
  });
  return {
    revision,
    skills: names.map((name) => ({ kind: "skills", name })),
    resources,
    pluginContributions: [{
      pluginName: "gitlab",
      contributions: [SOURCE_SYNC_TOOL, ...names.map((name) => ({ kind: "skill", name }))],
    }],
  };
}

export async function activate() {
  return {
    async handle({ host, request }) {
      if (request.path === "source-sync/status" && request.method === "GET") {
        const settings = await host.readSettings();
        return { body: await host.sourceSync.readStatus({ desiredUrl: configuredUrl(settings) }) };
      }

      if (request.path === "source-sync/sync" && request.method === "POST") {
        const settings = await host.readSettings();
        const sourceUrl = configuredUrl(settings);
        if (!sourceUrl) throw new Error("Save a Project GitLab clone URL before synchronizing Skills.");
        return {
          body: await host.sourceSync.synchronize({
            sourceUrl,
            prepare: prepareGitLabSource,
          }),
        };
      }

      if (request.path === "source-sync/retry" && request.method === "POST") {
        const body = request.body && typeof request.body === "object" ? request.body : {};
        if (typeof body.operationId !== "string" || !["query-status", "resume"].includes(body.action)) {
          throw new Error("A source synchronization operation ID and retry action are required.");
        }
        return {
          body: await host.sourceSync.retry({
            action: body.action,
            operationId: body.operationId,
            prepare: prepareGitLabSource,
          }),
        };
      }

      return {
        status: 404,
        body: { error: { code: "EXTENSION_BACKEND_PATH_NOT_FOUND", message: "GitLab source synchronization path was not found." } },
      };
    },
    async dispose() {},
  };
}

function configuredUrl(settings) {
  const value = settings?.sourceUrl;
  if (value === undefined || value === null || value === "") return null;
  return validateGitLabSourceUrl(value);
}

async function findSkillFiles(root) {
  const found = [];
  const visit = async (directory) => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("The selected repository contains an unsupported symbolic link.");
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name === "SKILL.md") found.push(path);
      else if (!entry.isFile()) throw new Error("The selected repository contains an unsupported filesystem entry.");
    }
  };
  await visit(root);
  return found.sort((left, right) => left.localeCompare(right));
}

async function readSkillName(path) {
  const details = await lstat(path);
  if (!details.isFile() || details.isSymbolicLink() || details.size > MAX_SKILL_DOCUMENT_BYTES) {
    throw new Error("A GitLab Skill SKILL.md is not a supported regular file.");
  }
  const content = await readFile(path);
  const frontmatter = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content.toString("utf8"))?.[1];
  const line = frontmatter?.split(/\r?\n/).find((item) => /^name\s*:/.test(item));
  if (!line) throw new Error("A GitLab Skill is missing its name in SKILL.md frontmatter.");
  const raw = line.slice(line.indexOf(":") + 1).trim();
  const name = parseYamlScalar(raw);
  if (!name) throw new Error("A GitLab Skill has an empty name in SKILL.md frontmatter.");
  return { content, name };
}

function parseYamlScalar(value) {
  if (value.startsWith("\"") && value.endsWith("\"")) {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "string" ? parsed.trim() : "";
    } catch {
      return "";
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'").trim();
  return value.replace(/\s+#.*$/, "").trim();
}

async function preflightSkillFiles(paths, skillDirectories) {
  const documentPaths = new Set(paths.map((path) => resolve(path)));
  const filesBySkill = new Map();
  let fileCount = 0;
  let byteCount = 0;

  for (const documentPath of paths) {
    const skillRoot = dirname(documentPath);
    const files = [];
    const visit = async (directory) => {
      const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        const path = join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error("A GitLab Skill contains an unsupported symbolic link.");
        if (entry.isDirectory()) {
          if (resolve(path) !== resolve(skillRoot) && skillDirectories.has(resolve(path))) continue;
          await visit(path);
          continue;
        }
        if (!entry.isFile()) throw new Error("A GitLab Skill contains an unsupported filesystem entry.");
        const details = await lstat(path);
        const isSkillDocument = documentPaths.has(resolve(path));
        const maxBytes = isSkillDocument ? MAX_SKILL_DOCUMENT_BYTES : MAX_SKILL_FILE_BYTES;
        if (!details.isFile() || details.isSymbolicLink() || details.size > maxBytes) {
          throw new Error(isSkillDocument
            ? "A GitLab Skill SKILL.md is not a supported regular file."
            : "A GitLab Skill contains an unsupported or oversized attachment.");
        }
        const fileName = relative(skillRoot, path).split(sep).join("/");
        if (!fileName || fileName.startsWith("../") || isAbsolute(fileName)) throw new Error("A GitLab Skill attachment path is invalid.");
        files.push({ fileName, path, size: details.size });
        fileCount += 1;
        byteCount += details.size;
        assertCandidateBudget(fileCount + 1, byteCount);
      }
    };
    await visit(skillRoot);
    filesBySkill.set(resolve(skillRoot), files);
  }

  return { byteCount, fileCount, filesBySkill };
}

async function readSkillFiles(candidateFiles, documentPath, documentContent) {
  const files = {};
  for (const candidate of candidateFiles) {
    const path = resolve(candidate.path);
    if (path === resolve(documentPath)) {
      files[candidate.fileName] = documentContent;
      continue;
    }
    const details = await lstat(path);
    if (!details.isFile() || details.isSymbolicLink() || details.size !== candidate.size || details.size > MAX_SKILL_FILE_BYTES) {
      throw new Error("A GitLab Skill attachment changed or became unsupported after candidate preflight.");
    }
    const content = await readFile(path);
    if (content.byteLength !== candidate.size) throw new Error("A GitLab Skill attachment changed while being read.");
    files[candidate.fileName] = content;
  }
  return files;
}

function assertCandidateBudget(fileCount, byteCount) {
  if (fileCount > MAX_CANDIDATE_FILES) throw new Error("The selected repository contains too many candidate files to synchronize.");
  if (byteCount > MAX_CANDIDATE_BYTES) throw new Error("The selected repository contains too much Skill content to synchronize.");
}

function isPathInside(root, path) {
  const child = relative(resolve(root), resolve(path));
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}
