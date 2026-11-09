import { lstat, mkdir, mkdtemp, realpath, rename, rm } from "node:fs/promises";
import { relative, resolve, join } from "node:path";
import type { AzureDevOpsRepositoryMetadata, CloneAzureDevOpsRepositoryDependencies, CloneDestination, CloneIdentity } from "./types.ts";
import { readWorktree } from "../agent/context.ts";
import {
  hasGitMarker,
  isPluginError,
  isPathInside,
  isRecord,
  mapCredentialError,
  mapGitError,
  mapRepositoryError,
  pluginError,
  readCredential,
  readCloneSelection,
  REPOSITORY_REFERENCE_PATTERN,
  validateAzureDevOpsRemoteUrl,
  validateRepositoryMetadata,
  validateCloneDestination,
} from "./validation.ts";

const CLONE_STAGING_DIRECTORY_PREFIX = ".azure-devops-clone-staging-";
const CLONE_REPOSITORY_DIRECTORY = "repository";

export async function cloneAzureDevOpsRepository(
  input: Record<string, unknown>,
  dependencies: CloneAzureDevOpsRepositoryDependencies,
): Promise<Record<string, unknown>> {
  if (input.remoteUrl !== undefined || input.url !== undefined) {
    throw pluginError("AZURE_DEVOPS_CLONE_REMOTE_INPUT_FORBIDDEN", "Clone remote URL must come from verified Azure DevOps metadata.");
  }

  const worktree = await resolveWorktree(dependencies.worktree);
  let repository: AzureDevOpsRepositoryMetadata;
  try {
    repository = validateRepositoryMetadata(await dependencies.resolveRepository(input));
  } catch (error) {
    throw mapRepositoryError(error);
  }
  const selection = readCloneSelection(input);
  const repositoryRootPath = join(worktree, CLONE_REPOSITORY_DIRECTORY);
  const destination = await validateCloneDestination(repositoryRootPath, input.destination ?? repository.name);
  const repositoryRoot = await ensureCloneRepositoryDirectory(worktree);
  if (!sameClonePath(destination.rootPath, repositoryRoot)) {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_BOUNDARY", "Clone repository directory changed before the operation started.");
  }

  let credential = "";
  let stagingPath: string | undefined;
  try {
    try {
      credential = readCredential(await dependencies.getCredential());
    } catch (error) {
      throw mapCredentialError(error);
    }

    stagingPath = await createCloneStagingDirectory(repositoryRoot);
    try {
      await dependencies.git.clone({
        ...selection,
        credential,
        destination: stagingPath,
        remoteUrl: repository.remoteUrl,
        worktree,
      });
      const originUrl = await dependencies.git.getRemoteUrl(stagingPath, "origin");
      if (!originUrl) throw pluginError("AZURE_DEVOPS_CLONE_ORIGIN_MISSING", "Git clone did not create the default origin remote.");
      const repositoryReference = REPOSITORY_REFERENCE_PATTERN.exec(repository.repositoryReference);
      if (!repositoryReference) throw pluginError("AZURE_DEVOPS_REPOSITORY_METADATA_INVALID", "Azure DevOps repository reference is invalid.");
      let canonicalOriginUrl: string;
      try {
        canonicalOriginUrl = validateAzureDevOpsRemoteUrl(originUrl, repositoryReference[1]!, repository.project.name, repository.name);
      } catch {
        throw pluginError("AZURE_DEVOPS_CLONE_ORIGIN_MISMATCH", "Git clone origin did not match the verified Azure DevOps repository.");
      }
      if (canonicalOriginUrl !== repository.remoteUrl) {
        throw pluginError("AZURE_DEVOPS_CLONE_ORIGIN_MISMATCH", "Git clone origin did not match the verified Azure DevOps repository.");
      }
      await commitCloneStaging(repositoryRoot, destination, stagingPath);
      stagingPath = undefined;
    } catch (error) {
      throw mapGitError(error, [credential, process.env.EXTENSION_SECRET_KEY ?? ""]);
    }
  } catch (error) {
    if (stagingPath) await removeCloneStaging(stagingPath).catch(() => undefined);
    throw error;
  } finally {
    credential = "";
  }

  const relativePath = `${CLONE_REPOSITORY_DIRECTORY}/${destination.relativePath}`;
  return {
    cloned: true,
    destination: relativePath,
    path: relativePath,
    remoteName: "origin",
    remoteUrl: repository.remoteUrl,
    repository,
    selection,
  };
}

async function ensureCloneRepositoryDirectory(worktree: string): Promise<string> {
  await assertCloneWorktreeStable(worktree);
  const repositoryRoot = join(worktree, CLONE_REPOSITORY_DIRECTORY);
  try {
    await mkdir(repositoryRoot);
  } catch (error) {
    if (!isRecord(error) || error.code !== "EEXIST") {
      throw pluginError("AZURE_DEVOPS_CLONE_REPOSITORY_ROOT_FAILED", "The project repository directory could not be prepared.");
    }
  }

  await assertCloneWorktreeStable(worktree);
  const stats = await lstat(repositoryRoot).catch(() => undefined);
  if (!stats) throw pluginError("AZURE_DEVOPS_CLONE_REPOSITORY_ROOT_FAILED", "The project repository directory is unavailable.");
  if (stats.isSymbolicLink()) {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_BOUNDARY", "The project repository directory cannot be a symbolic link.");
  }
  if (!stats.isDirectory()) {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_CONFLICT", "The project repository path is not a directory.");
  }

  const resolvedRepositoryRoot = await realpath(repositoryRoot).catch(() => undefined);
  if (!resolvedRepositoryRoot
    || !sameClonePath(resolvedRepositoryRoot, repositoryRoot)
    || !isPathInside(worktree, resolvedRepositoryRoot)) {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_BOUNDARY", "The project repository directory must remain inside the current worktree.");
  }
  return resolvedRepositoryRoot;
}

async function resolveWorktree(value: unknown): Promise<string> {
  const worktree = readWorktree(value);
  try {
    const resolved = await realpath(worktree);
    const stats = await lstat(resolved);
    if (!stats.isDirectory()) throw new Error("worktree is not a directory");
    return resolved;
  } catch (error) {
    if (isPluginError(error)) throw error;
    throw pluginError("AZURE_DEVOPS_WORKTREE_INVALID", "The current OpenCode worktree is unavailable.");
  }
}

async function createCloneStagingDirectory(rootPath: string): Promise<string> {
  await assertCloneWorktreeStable(rootPath);
  try {
    return await mkdtemp(join(rootPath, CLONE_STAGING_DIRECTORY_PREFIX));
  } catch {
    throw pluginError("AZURE_DEVOPS_CLONE_STAGING_FAILED", "A controlled clone staging directory could not be created.");
  }
}

async function commitCloneStaging(rootPath: string, destination: CloneDestination, stagingPath: string): Promise<void> {
  await assertCloneWorktreeStable(rootPath);
  const stagedIdentity = await assertCloneStagingPath(rootPath, stagingPath);
  const checkedDestination = await validateCloneDestination(rootPath, destination.relativePath);
  if (checkedDestination.exists !== destination.exists || !sameCloneIdentity(destination.identity, checkedDestination.identity)) {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_CONFLICT", "Clone destination changed before commit.");
  }
  const stagedBeforeRename = await assertCloneStagingPath(rootPath, stagingPath);
  if (!sameCloneIdentity(stagedIdentity, stagedBeforeRename)) {
    throw pluginError("AZURE_DEVOPS_CLONE_STAGING_FAILED", "The clone staging directory changed before commit.");
  }

  if (checkedDestination.exists) {
    try {
      await rm(destination.absolutePath, { recursive: false });
    } catch {
      throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_CONFLICT", "Clone destination must remain an empty directory until commit.");
    }
  }

  await assertCloneWorktreeStable(rootPath);
  const targetAfterReservation = await lstat(destination.absolutePath).catch(() => undefined);
  if (targetAfterReservation) {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_CONFLICT", "Clone destination was established before commit.");
  }
  try {
    await rename(stagingPath, destination.absolutePath);
  } catch {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_CONFLICT", "The staged clone could not be committed atomically.");
  }

  try {
    await assertCloneWorktreeStable(rootPath);
    const committedDestination = await validateCloneDestination(rootPath, destination.relativePath, { allowGitRepository: true });
    if (!committedDestination.exists || !(await hasGitMarker(committedDestination.absolutePath))) {
      throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_CONFLICT", "The staged clone commit could not be verified.");
    }
  } catch (error) {
    await removeCommittedCloneIfOwned(rootPath, destination.absolutePath, stagedIdentity);
    throw error;
  }
}

async function assertCloneWorktreeStable(rootPath: string): Promise<void> {
  try {
    const resolvedRoot = await realpath(rootPath);
    const stats = await lstat(resolvedRoot);
    if (!stats.isDirectory() || !sameClonePath(resolvedRoot, rootPath)) throw new Error("worktree changed");
  } catch {
    throw pluginError("AZURE_DEVOPS_CLONE_DESTINATION_BOUNDARY", "The clone root changed while cloning.");
  }
}

async function assertCloneStagingPath(rootPath: string, stagingPath: string): Promise<CloneIdentity> {
  const relativeStagingPath = relative(rootPath, stagingPath).replaceAll("\\", "/");
  if (!relativeStagingPath || relativeStagingPath === "." || relativeStagingPath.startsWith("../") || relativeStagingPath.includes("/") || !relativeStagingPath.startsWith(CLONE_STAGING_DIRECTORY_PREFIX)) {
    throw pluginError("AZURE_DEVOPS_CLONE_STAGING_FAILED", "The clone staging directory is outside the controlled repository directory.");
  }
  try {
    const stats = await lstat(stagingPath);
    const resolved = await realpath(stagingPath);
    if (stats.isSymbolicLink() || !stats.isDirectory() || !sameClonePath(resolved, stagingPath) || !isPathInside(rootPath, resolved)) {
      throw new Error("unsafe staging directory");
    }
    return cloneIdentity(stats);
  } catch {
    throw pluginError("AZURE_DEVOPS_CLONE_STAGING_FAILED", "The clone staging directory is unavailable or unsafe.");
  }
}

async function removeCommittedCloneIfOwned(rootPath: string, destinationPath: string, stagedIdentity: CloneIdentity): Promise<void> {
  try {
    await assertCloneWorktreeStable(rootPath);
    const relativeDestination = relative(rootPath, destinationPath).replaceAll("\\", "/");
    if (!relativeDestination || relativeDestination.split("/").length !== 1) return;
    const stats = await lstat(destinationPath);
    if (stats.isSymbolicLink() || !stats.isDirectory() || !sameCloneIdentity(stagedIdentity, cloneIdentity(stats))) return;
    const resolvedDestination = await realpath(destinationPath);
    if (!sameClonePath(resolvedDestination, destinationPath) || !isPathInside(rootPath, resolvedDestination)) return;
    await rm(resolvedDestination, { force: true, recursive: true });
  } catch {
    return;
  }
}

async function removeCloneStaging(stagingPath: string): Promise<void> {
  const stats = await lstat(stagingPath).catch(() => undefined);
  if (!stats) return;
  if (stats.isSymbolicLink() || !stats.isDirectory()) return;
  const resolved = await realpath(stagingPath).catch(() => undefined);
  if (!resolved || !sameClonePath(resolved, stagingPath)) return;
  await rm(resolved, { force: true, recursive: true });
}

function cloneIdentity(stats: { birthtimeMs: number; dev: number; ino: number }): CloneIdentity {
  return { birthtimeMs: stats.birthtimeMs, dev: stats.dev, ino: stats.ino };
}

function sameCloneIdentity(left: CloneDestination["identity"], right: CloneDestination["identity"]): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.ino !== 0 && right.ino !== 0) return left.dev === right.dev && left.ino === right.ino;
  return left.birthtimeMs === right.birthtimeMs && left.dev === right.dev;
}

function sameClonePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
