import { lstatSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { isRecord, pluginError } from "../tools/validation.ts";

export function currentOpenCodeProject(input: unknown): string {
  const value = isRecord(input) ? input.project : undefined;
  const directory = isRecord(input) && typeof input.directory === "string" ? input.directory : undefined;
  const project = typeof value === "string"
    ? value
    : isRecord(value) && typeof value.name === "string"
      ? value.name
      : process.env.AGENT_SYSTEM_PROJECT || (directory ? basename(directory) : undefined);
  if (typeof project !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(project.trim())) {
    throw pluginError("AZURE_DEVOPS_OPENCODE_PROJECT_REQUIRED", "The current OpenCode project identity is required.");
  }
  return project.trim();
}

export function currentWorktree(input: unknown, context: unknown): string {
  const contextWorktree = isRecord(context) ? context.worktree : undefined;
  const contextDirectory = isRecord(context) ? context.directory : undefined;
  const inputWorktree = isRecord(input) ? input.worktree : undefined;
  const inputDirectory = isRecord(input) ? input.directory : undefined;
  const worktree = firstPath(contextWorktree, contextDirectory, inputWorktree, inputDirectory);
  const directory = firstPath(contextDirectory, inputDirectory);
  const normalizedWorktree = readWorktree(worktree);
  if (!directory) return normalizedWorktree;

  const normalizedDirectory = readWorktree(directory);
  if (samePath(normalizedWorktree, normalizedDirectory) || hasGitMarker(normalizedWorktree)) {
    return normalizedWorktree;
  }
  return normalizedDirectory;
}

export function readWorktree(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw pluginError("AZURE_DEVOPS_WORKTREE_REQUIRED", "The current OpenCode worktree is required.");
  }
  return value.trim();
}

function firstPath(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function hasGitMarker(path: string): boolean {
  try {
    lstatSync(join(path, ".git"));
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return false;
    throw pluginError("AZURE_DEVOPS_WORKTREE_INVALID", "The current OpenCode worktree could not be inspected.");
  }
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
