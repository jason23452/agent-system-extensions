import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SKILL_DOCUMENT_BYTES = 512 * 1024;
const INDEX_PATH = join(".opencode", "plugins", "gitlab", "source-skills.json");

export const GITLAB_SELECT_SKILL_TOOL_NAME = "gitlab_select_skill";

export async function discoverGitLabSkills(projectRoot) {
  const index = await readSkillIndex(projectRoot);
  const skills = [];
  for (const name of index.skills) {
    const content = await readNativeSkill(projectRoot, name);
    if (readFrontmatterName(content) !== name) {
      throw new Error(`Installed GitLab Skill identity does not match its native Skill directory: ${name}.`);
    }
    skills.push({ name, content });
  }
  return skills;
}

export async function selectGitLabSkill(selection, projectRoot) {
  const skills = await discoverGitLabSkills(projectRoot);
  if (selection.skillName === undefined) {
    return {
      content: JSON.stringify({ skills: skills.map(({ name }) => name) }, null, 2),
      metadata: { title: "GitLab Skills" },
    };
  }
  if (typeof selection.skillName !== "string" || !SKILL_NAME_PATTERN.test(selection.skillName)) {
    throw new Error("Choose a valid frontmatter Skill identity.");
  }
  const skill = skills.find(({ name }) => name === selection.skillName);
  if (!skill) throw new Error("The requested GitLab Skill is not installed in this Project.");
  return {
    content: skill.content,
    metadata: { title: `Selected GitLab Skill: ${skill.name}`, skillName: skill.name },
  };
}

async function readSkillIndex(projectRoot) {
  const root = await realpath(resolve(projectRoot));
  const indexPath = join(root, INDEX_PATH);
  const details = await lstat(indexPath).catch((error) => {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (!details) return { skills: [] };
  if (!details.isFile() || details.isSymbolicLink() || details.size > 64 * 1024) {
    throw new Error("GitLab Skill index is not a supported regular file.");
  }
  const value = JSON.parse(await readFile(indexPath, "utf8"));
  if (value?.schemaVersion !== "agent-system.gitlab-skill-index.v1" || !Array.isArray(value.skills) || value.skills.length > 199) {
    throw new Error("GitLab Skill index is invalid.");
  }
  const names = new Set();
  for (const name of value.skills) {
    if (typeof name !== "string" || !SKILL_NAME_PATTERN.test(name) || name.length > 64 || names.has(name)) {
      throw new Error("GitLab Skill index contains an invalid or duplicate identity.");
    }
    names.add(name);
  }
  return { skills: [...names].sort((left, right) => left.localeCompare(right)) };
}

async function readNativeSkill(projectRoot, name) {
  const root = await realpath(resolve(projectRoot));
  const skillPath = join(root, ".opencode", "skills", name, "SKILL.md");
  const details = await lstat(skillPath);
  if (!details.isFile() || details.isSymbolicLink() || details.size > MAX_SKILL_DOCUMENT_BYTES) {
    throw new Error(`GitLab Skill document is not a supported regular file: ${name}.`);
  }
  const actualPath = await realpath(skillPath);
  if (!isPathInside(root, actualPath)) throw new Error("GitLab Skill document resolves outside the Project.");
  return readFile(actualPath, "utf8");
}

function readFrontmatterName(content) {
  const frontmatter = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1];
  const line = frontmatter?.split(/\r?\n/).find((item) => /^name\s*:/.test(item));
  if (!line) return undefined;
  const value = line.slice(line.indexOf(":") + 1).trim();
  if (value.startsWith("\"") && value.endsWith("\"")) {
    try { return JSON.parse(value); } catch { return undefined; }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  return value.replace(/\s+#.*$/, "").trim();
}

function isPathInside(root, path) {
  const child = relative(resolve(root), resolve(path));
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function isNodeError(error) {
  return error instanceof Error && "code" in error;
}
