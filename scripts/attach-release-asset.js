import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createGitHubClient, repositoryFromEnvironment } from "./github.js";

async function main() {
  const tag = process.argv[2];
  const filePath = process.argv[3];
  const assetName = process.argv[4] ?? basename(filePath ?? "");
  if (!tag || !filePath || !assetName) throw new Error("Usage: node scripts/attach-release-asset.js <tag> <file-path> [asset-name]");
  const bytes = await readFile(resolve(filePath));
  const { owner, repository } = repositoryFromEnvironment();
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required to attach a release asset");
  const client = createGitHubClient({ owner, repository, token });
  const release = await client.getReleaseByTag(tag);
  if (!release || release.draft) throw new Error(`Published release is missing: ${tag}`);
  const existing = release.assets?.find((asset) => asset.name === assetName);
  if (existing) {
    const published = await client.fetchPublicAsset(existing.browser_download_url);
    const expectedHash = createHash("sha256").update(bytes).digest("hex");
    const publishedHash = createHash("sha256").update(published).digest("hex");
    if (published.length !== bytes.length || publishedHash !== expectedHash) throw new Error(`Release asset ${assetName} already exists with different content; it was not replaced`);
  } else {
    await client.uploadReleaseAsset(release, assetName, bytes, { contentType: "application/json" });
  }
  process.stdout.write(`Attached immutable ${assetName} to ${tag}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
