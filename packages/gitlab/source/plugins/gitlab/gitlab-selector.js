import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const GITLAB_SKILLS_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "skills");
export const GITLAB_SELECT_SKILL_TOOL_NAME = "gitlab_select_skill";
const MAX_GITLAB_SKILL_DOCUMENT_BYTES = 512 * 1024;

export async function discoverGitLabSkillPaths(root = GITLAB_SKILLS_DIRECTORY) {
  const entries = await discoverGitLabSkillEntries(root);
  return [...new Set(entries.map((entry) => dirname(entry.path)))].sort((left, right) => left.localeCompare(right));
}

export async function discoverGitLabSkillGroups(root = GITLAB_SKILLS_DIRECTORY) {
  const groups = new Map();
  for (const entry of await discoverGitLabSkillEntries(root)) {
    const group = groups.get(entry.parent) ?? { catalogs: new Map(), skills: new Set() };
    if (entry.catalog === undefined) group.skills.add(entry.name);
    else {
      const skills = group.catalogs.get(entry.catalog) ?? new Set();
      skills.add(entry.name);
      group.catalogs.set(entry.catalog, skills);
    }
    groups.set(entry.parent, group);
  }
  return [...groups.entries()]
    .map(([parent, group]) => ({
      parent,
      skills: [...group.skills].sort((left, right) => left.localeCompare(right)),
      catalogs: [...group.catalogs.entries()]
        .map(([catalog, skills]) => ({ catalog, skills: [...skills].sort((left, right) => left.localeCompare(right)) }))
        .sort((left, right) => left.catalog.localeCompare(right.catalog)),
    }))
    .sort((left, right) => left.parent.localeCompare(right.parent));
}

export async function selectGitLabSkill(selection, root = GITLAB_SKILLS_DIRECTORY) {
  const entries = await discoverGitLabSkillEntries(root);
  if (selection.parent === undefined) {
    if (selection.catalog !== undefined || selection.skillName !== undefined) throw new Error("Choose a GitLab Skill parent before selecting a catalog or Skill.");
    return { content: JSON.stringify({ groups: await discoverGitLabSkillGroups(root) }, null, 2), metadata: { title: "GitLab Skills by parent and catalog" } };
  }
  const parentEntries = entries.filter((entry) => entry.parent === selection.parent);
  if (parentEntries.length === 0) throw new Error("The requested GitLab Skill parent does not exist.");
  if (selection.catalog === undefined) {
    if (selection.skillName === undefined) {
      const group = (await discoverGitLabSkillGroups(root)).find((entry) => entry.parent === selection.parent);
      return { content: JSON.stringify({ parent: selection.parent, skills: group.skills, catalogs: group.catalogs }, null, 2), metadata: { title: `GitLab Skills: ${selection.parent}` } };
    }
    const selected = parentEntries.find((entry) => entry.catalog === undefined && entry.name === selection.skillName);
    if (selected) return readSelectedGitLabSkill(selected, root);
    if (parentEntries.some((entry) => entry.catalog !== undefined && entry.name === selection.skillName)) throw new Error("Choose the GitLab Skill catalog before selecting a nested Skill.");
    throw new Error("The requested Skill is not a direct Skill under that GitLab Skill parent.");
  }
  const catalogEntries = parentEntries.filter((entry) => entry.catalog === selection.catalog);
  if (catalogEntries.length === 0) throw new Error("The requested GitLab Skill catalog does not exist under that parent.");
  if (selection.skillName === undefined) {
    return { content: JSON.stringify({ parent: selection.parent, catalog: selection.catalog, skills: catalogEntries.map(({ name }) => name) }, null, 2), metadata: { title: `GitLab Skills: ${selection.parent}/${selection.catalog}` } };
  }
  const selected = catalogEntries.find((entry) => entry.name === selection.skillName);
  if (!selected) throw new Error("The requested Skill is not inside that GitLab Skill catalog.");
  return readSelectedGitLabSkill(selected, root);
}

async function readSelectedGitLabSkill(selected, root) {
  const rootPath = await realpath(resolve(root));
  const skillPath = await realpath(selected.path);
  if (!isPathInside(rootPath, skillPath)) throw new Error("Selected GitLab Skill resolves outside the Plugin Skills directory.");
  const details = await stat(skillPath);
  if (!details.isFile() || details.size > MAX_GITLAB_SKILL_DOCUMENT_BYTES) throw new Error("Selected GitLab Skill SKILL.md is not a supported regular file.");
  return {
    content: await readFile(skillPath, "utf8"),
    metadata: { title: `Selected GitLab Skill: ${selected.name}`, parent: selected.parent, ...(selected.catalog ? { catalog: selected.catalog } : {}), skillName: selected.name },
  };
}

async function discoverGitLabSkillEntries(root) {
  const absoluteRoot = resolve(root);
  const rootDetails = await lstat(absoluteRoot).catch((error) => {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (!rootDetails) return [];
  if (!rootDetails.isDirectory() || rootDetails.isSymbolicLink()) throw new Error("GitLab Plugin Skills directory is unavailable.");
  const rootPath = await realpath(absoluteRoot);
  const found = [];
  const parents = (await readdir(rootPath, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).sort((a, b) => a.name.localeCompare(b.name));
  for (const parent of parents) {
    const parentPath = join(rootPath, parent.name);
    const catalogs = (await readdir(parentPath, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).sort((a, b) => a.name.localeCompare(b.name));
    for (const catalog of catalogs) {
      const direct = await readGitLabSkillEntry(rootPath, parent.name, undefined, catalog.name);
      if (direct) {
        found.push(direct);
        continue;
      }
      const catalogPath = join(parentPath, catalog.name);
      const skills = (await readdir(catalogPath, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).sort((a, b) => a.name.localeCompare(b.name));
      for (const skill of skills) {
        const nested = await readGitLabSkillEntry(rootPath, parent.name, catalog.name, skill.name);
        if (nested) found.push(nested);
      }
    }
  }
  return found.sort((a, b) => a.parent.localeCompare(b.parent) || (a.catalog ?? "").localeCompare(b.catalog ?? "") || a.name.localeCompare(b.name));
}

async function readGitLabSkillEntry(rootPath, parent, catalog, name) {
  const skillPath = join(rootPath, parent, ...(catalog ? [catalog] : []), name, "SKILL.md");
  try {
    const details = await lstat(skillPath);
    if (!details.isFile() || details.isSymbolicLink()) return undefined;
    const realSkillPath = await realpath(skillPath);
    if (!isPathInside(rootPath, realSkillPath)) return undefined;
    return { parent, ...(catalog ? { catalog } : {}), name, path: realSkillPath };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

function isPathInside(root, path) {
  const relativePath = relative(root, path);
  return relativePath !== "" && relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

function isNodeError(error) {
  return error instanceof Error && "code" in error;
}
