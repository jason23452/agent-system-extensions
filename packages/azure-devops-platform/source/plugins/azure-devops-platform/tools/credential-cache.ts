import { pluginError } from "./validation.ts";

export const AZURE_DEVOPS_GIT_CREDENTIAL_CACHE_TTL_MS = 15 * 60 * 1_000;

type CachedCredential = {
  credential: string;
  expiresAt: number;
  timeout: ReturnType<typeof setTimeout>;
};

const credentials = new Map<string, CachedCredential>();

export function cacheAzureDevOpsGitCredential(
  organization: string,
  project: string,
  credential: string,
  now = Date.now(),
): number {
  const key = credentialKey(organization, project);
  if (typeof credential !== "string" || !credential.trim() || credential.length > 500) {
    throw pluginError("AZURE_DEVOPS_CREDENTIAL_BROKER_INVALID", "The credential broker returned no usable Git credential.");
  }

  clearEntry(key);
  const expiresAt = now + AZURE_DEVOPS_GIT_CREDENTIAL_CACHE_TTL_MS;
  const entry: CachedCredential = {
    credential,
    expiresAt,
    timeout: setTimeout(() => {
      if (credentials.get(key) === entry) credentials.delete(key);
    }, AZURE_DEVOPS_GIT_CREDENTIAL_CACHE_TTL_MS),
  };
  entry.timeout.unref?.();
  credentials.set(key, entry);
  return expiresAt;
}

export function getCachedAzureDevOpsCredential(
  organization: string,
  project: string,
  now = Date.now(),
): { credential: string; expiresAt: number } | undefined {
  const key = credentialKey(organization, project);
  const entry = credentials.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    clearEntry(key);
    return undefined;
  }
  return { credential: entry.credential, expiresAt: entry.expiresAt };
}

function credentialKey(organization: string, project: string): string {
  if (typeof organization !== "string" || !organization.trim() || organization.length > 100
    || typeof project !== "string" || !project.trim() || project.length > 128
    || /[\r\n\0]/.test(organization) || /[\r\n\0]/.test(project)) {
    throw pluginError("AZURE_DEVOPS_CONTEXT_INVALID", "Azure DevOps organization and project are required for credential caching.");
  }
  return JSON.stringify([organization.trim().toLowerCase(), project.trim().toLowerCase()]);
}

function clearEntry(key: string): void {
  const entry = credentials.get(key);
  if (!entry) return;
  clearTimeout(entry.timeout);
  credentials.delete(key);
}
