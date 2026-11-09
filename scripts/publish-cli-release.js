import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createGitHubClient, GitHubApiError, repositoryFromEnvironment } from "./github.js";

async function getOrCreateRelease(client, tag) {
  let release = await client.getReleaseByTag(tag);
  if (release) return release;
  try {
    return await client.createRelease({
      tag,
      name: `Extension distribution CLI ${tag.slice("cli/".length)}`,
      prerelease: false,
      body: `Prebuilt, self-contained Node.js 24 CLI package. Install from the attached .tgz or execute it with npx; it is not published to the npm registry.`,
    });
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.status !== 422) throw error;
    release = await client.getReleaseByTag(tag);
    if (!release) throw error;
    return release;
  }
}

async function main() {
  const tag = process.argv[2];
  const assetPath = process.argv[3];
  if (!tag || !assetPath) throw new Error("Usage: node scripts/publish-cli-release.js <cli/vSemVer> <package.tgz>");
  const packageInfo = JSON.parse(await readFile("packages/cli/package.json", "utf8"));
  if (tag !== `cli/v${packageInfo.version}`) throw new Error(`CLI release tag must be cli/v${packageInfo.version}`);
  const expectedName = "agent-system-extension-distribution-cli-" + packageInfo.version + ".tgz";
  if (basename(assetPath) !== expectedName) throw new Error(`npm pack asset must be named ${expectedName}`);
  const bytes = await readFile(resolve(assetPath));
  if (bytes.length === 0) throw new Error("npm pack produced an empty CLI tarball");
  const { owner, repository } = repositoryFromEnvironment();
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required to publish the CLI GitHub Release");
  const client = createGitHubClient({ owner, repository, token });
  let release = await getOrCreateRelease(client, tag);
  if (release.tag_name !== tag || release.draft !== false || release.prerelease !== false) throw new Error(`Existing CLI release metadata conflicts with ${tag}`);
  const existing = release.assets?.find((asset) => asset.name === expectedName);
  if (existing) {
    const published = await client.fetchPublicAsset(existing.browser_download_url);
    const expectedHash = createHash("sha256").update(bytes).digest("hex");
    const publishedHash = createHash("sha256").update(published).digest("hex");
    if (published.length !== bytes.length || publishedHash !== expectedHash) throw new Error(`Immutable CLI release asset differs from the local package: ${expectedName}`);
  } else {
    if (release.assets?.some((asset) => asset.name.endsWith(".tgz"))) throw new Error(`CLI release ${tag} already contains another tarball`);
    await client.uploadReleaseAsset(release, expectedName, bytes, { contentType: "application/gzip" });
  }
  release = await client.getReleaseByTag(tag);
  const uploaded = release?.assets?.find((asset) => asset.name === expectedName);
  if (!uploaded) throw new Error(`CLI release ${tag} is missing ${expectedName}`);
  const published = await client.fetchPublicAsset(uploaded.browser_download_url);
  const sha256 = createHash("sha256").update(published).digest("hex");
  if (published.length !== bytes.length || sha256 !== createHash("sha256").update(bytes).digest("hex")) throw new Error("Published CLI tarball failed anonymous byte-for-byte verification");
  process.stdout.write(`${JSON.stringify({ tag, asset: expectedName, size: published.length, sha256 })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
