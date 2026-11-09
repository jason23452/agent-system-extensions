const API_ROOT = "https://api.github.com";
const MAX_ASSET_BYTES = 512 * 1024 * 1024;

export class GitHubApiError extends Error {
  constructor(status, path) {
    super(`GitHub API request failed with HTTP ${status}: ${path}`);
    this.name = "GitHubApiError";
    this.status = status;
    this.path = path;
  }
}

export function repositoryFromEnvironment() {
  const value = process.env.GITHUB_REPOSITORY ?? "jason23452/agent-system-extensions";
  const [owner, repository, ...extra] = value.split("/");
  if (!owner || !repository || extra.length > 0) throw new Error("GITHUB_REPOSITORY must have the owner/repository form");
  return { owner, repository };
}

export function createGitHubClient({ owner, repository, token = undefined, fetchImpl = globalThis.fetch }) {
  if (!owner || !repository) throw new Error("GitHub owner and repository are required");
  const base = `${API_ROOT}/repos/${owner}/${repository}`;
  const commonHeaders = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "agent-system-extension-distribution",
  };

  async function request(path, { method = "GET", body, headers = {}, authenticated = true } = {}) {
    const requestHeaders = { ...commonHeaders, ...headers };
    if (body !== undefined) requestHeaders["content-type"] = "application/json";
    if (authenticated && token) requestHeaders.authorization = `Bearer ${token}`;
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: requestHeaders,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new GitHubApiError(response.status, path);
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      throw new Error(`GitHub API returned invalid JSON: ${path}`);
    }
  }

  async function getReleaseByTag(tag, { authenticated = Boolean(token) } = {}) {
    try {
      return await request(`/releases/tags/${encodeURIComponent(tag)}`, { authenticated });
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return null;
      throw error;
    }
  }

  async function createRelease({ tag, name = tag, body = "", prerelease, authenticated = true }) {
    return request("/releases", {
      method: "POST",
      authenticated,
      body: {
        tag_name: tag,
        name,
        body,
        draft: false,
        prerelease,
        make_latest: "false",
      },
    });
  }

  async function uploadReleaseAsset(release, name, bytes, { contentType = "application/octet-stream" } = {}) {
    if (typeof release?.upload_url !== "string") throw new Error("GitHub release is missing an upload URL");
    const uploadBase = release.upload_url.replace(/\{\?.*\}$/, "");
    const uploadUrl = new URL(uploadBase);
    if (uploadUrl.protocol !== "https:" || uploadUrl.hostname !== "uploads.github.com") throw new Error("GitHub release upload URL is not trusted");
    uploadUrl.searchParams.set("name", name);
    const headers = {
      ...commonHeaders,
      accept: "application/vnd.github+json",
      "content-type": contentType,
    };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetchImpl(uploadUrl, { method: "POST", headers, body: bytes, redirect: "error", signal: AbortSignal.timeout(300_000) });
    if (!response.ok) throw new GitHubApiError(response.status, "/releases/{id}/assets");
    return response.json();
  }

  async function fetchPublicAsset(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") throw new Error("Release asset URL must be an HTTPS github.com URL");
    const response = await fetchImpl(url, { headers: { accept: "application/octet-stream", "user-agent": commonHeaders["user-agent"] }, redirect: "follow", signal: AbortSignal.timeout(300_000) });
    if (!response.ok) throw new Error(`Public GitHub asset request failed with HTTP ${response.status}`);
    if (!response.body) throw new Error("Public GitHub asset response has no body");
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      length += bytes.length;
      if (length > MAX_ASSET_BYTES) throw new Error("Release asset exceeds the supported size");
      chunks.push(bytes);
    }
    return Buffer.concat(chunks, length);
  }

  async function listReleases({ authenticated = Boolean(token) } = {}) {
    const releases = [];
    for (let page = 1; ; page += 1) {
      const items = await request(`/releases?per_page=100&page=${page}`, { authenticated });
      if (!Array.isArray(items)) throw new Error("GitHub releases response must be an array");
      releases.push(...items);
      if (items.length < 100) return releases;
    }
  }

  async function getContents(path, { branch = "main", authenticated = true } = {}) {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    try {
      return await request(`/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`, { authenticated });
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return null;
      throw error;
    }
  }

  async function putContents(path, payload) {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    return request(`/contents/${encodedPath}`, { method: "PUT", body: payload, authenticated: true });
  }

  return { createRelease, fetchPublicAsset, getContents, getReleaseByTag, listReleases, putContents, request, uploadReleaseAsset };
}
