import { lstat, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isPathInside, pluginError, readAzureDevOpsRepositoryPath, validateCloneDestination } from "./validation.ts";

export async function resolveAzureDevOpsRepositoryPath(projectRoot: string, value: unknown): Promise<string> {
  return resolveRepositoryPath(projectRoot, value, "AZURE_DEVOPS_REPOSITORY_PATH_INVALID");
}

export async function resolveAzureDevOpsConfigureRemoteTarget(
  projectRoot: string,
  value: unknown,
  repositoryName: string,
): Promise<{ repositoryPath?: string; worktree: string }> {
  if (value !== undefined) {
    const repositoryPath = readAzureDevOpsRepositoryPath(value);
    return {
      repositoryPath,
      worktree: await resolveAzureDevOpsRepositoryPath(projectRoot, repositoryPath),
    };
  }

  const inferredPath = readAzureDevOpsRepositoryPath(`repository/${repositoryName}`);
  let inferredCheckoutExists = false;
  try {
    await lstat(join(projectRoot, inferredPath));
    inferredCheckoutExists = true;
  } catch (error) {
    if (!isMissingPath(error)) {
      throw pluginError("AZURE_DEVOPS_REPOSITORY_PATH_INVALID", "The project repository directory could not be inspected safely.");
    }
  }

  if (inferredCheckoutExists) {
    return {
      repositoryPath: inferredPath,
      worktree: await resolveAzureDevOpsRepositoryPath(projectRoot, inferredPath),
    };
  }

  if (await hasGitMarker(projectRoot)) return { worktree: projectRoot };
  throw pluginError(
    "AZURE_DEVOPS_REPOSITORY_PATH_REQUIRED",
    `No Git checkout was found at ${inferredPath}; provide repositoryPath or clone the Azure DevOps repository first.`,
  );
}

export async function resolveAzureDevOpsPushRepositoryPath(projectRoot: string, value: unknown): Promise<string> {
  return resolveRepositoryPath(projectRoot, value, "AZURE_DEVOPS_PUSH_REPOSITORY_PATH_INVALID");
}

async function hasGitMarker(projectRoot: string): Promise<boolean> {
  try {
    const marker = await lstat(join(projectRoot, ".git"));
    return !marker.isSymbolicLink() && (marker.isDirectory() || marker.isFile());
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw pluginError("AZURE_DEVOPS_REPOSITORY_PATH_INVALID", "The current Git worktree could not be inspected safely.");
  }
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

async function resolveRepositoryPath(projectRoot: string, value: unknown, errorCode: string): Promise<string> {
  const repositoryPath = readAzureDevOpsRepositoryPath(value);
  const repositoryName = repositoryPath.slice("repository/".length);

  try {
    const resolvedProjectRoot = await realpath(projectRoot);
    const projectStats = await lstat(resolvedProjectRoot);
    if (!projectStats.isDirectory()) throw new Error("invalid project root");

    const repositoryRoot = join(resolvedProjectRoot, "repository");
    const repositoryRootStats = await lstat(repositoryRoot);
    if (repositoryRootStats.isSymbolicLink() || !repositoryRootStats.isDirectory()) throw new Error("invalid repository root");
    const resolvedRepositoryRoot = await realpath(repositoryRoot);
    if (!samePath(resolvedRepositoryRoot, repositoryRoot) || !isPathInside(resolvedProjectRoot, resolvedRepositoryRoot)) {
      throw new Error("repository root escaped project");
    }

    const destination = await validateCloneDestination(resolvedRepositoryRoot, repositoryName, { allowGitRepository: true });
    if (!destination.exists) throw new Error("repository does not exist");
    const repositoryStats = await lstat(destination.absolutePath);
    if (repositoryStats.isSymbolicLink() || !repositoryStats.isDirectory()) throw new Error("invalid repository directory");
    const resolvedRepository = await realpath(destination.absolutePath);
    if (!samePath(resolvedRepository, destination.absolutePath) || !isPathInside(resolvedRepositoryRoot, resolvedRepository)) {
      throw new Error("repository escaped project repository directory");
    }

    const gitMarker = await lstat(join(resolvedRepository, ".git"));
    if (gitMarker.isSymbolicLink() || !gitMarker.isDirectory()) throw new Error("repository is not a cloned Git repository");
    return resolvedRepository;
  } catch {
    throw pluginError(errorCode, "The selected repositoryPath is unavailable, unsafe, or is not a cloned Git repository.");
  }
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
