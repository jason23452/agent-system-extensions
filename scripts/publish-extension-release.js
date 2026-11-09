import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  catalogEntryFromRelease,
  isSyntheticFixtureEntry,
  parseExtensionTag,
} from "../packages/cli/src/catalog.js";
import { createGitHubClient, GitHubApiError, repositoryFromEnvironment } from "./github.js";

function packageAssetName(tag) {
  return `${tag}.aicxt`;
}

function validateReleaseIdentity(release, tag, prerelease) {
  if (release.tag_name !== tag || release.draft !== false || release.prerelease !== prerelease) {
    throw new Error(`Existing GitHub Release metadata conflicts with immutable tag ${tag}`);
  }
}

async function getOrCreateRelease(client, { tag, prerelease }) {
  let release = await client.getReleaseByTag(tag);
  if (release) return release;
  try {
    return await client.createRelease({
      tag,
      name: tag,
      prerelease,
      body: `Automated immutable Extension release for \`${tag}\`.\n\nThe attached .aicxt asset is validated against its tag and manifest before publication.`,
    });
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.status !== 422) throw error;
    release = await client.getReleaseByTag(tag);
    if (!release) throw error;
    return release;
  }
}

async function main() {
  const tag = process.env.GITHUB_REF_NAME ?? process.argv[2];
  if (!tag) throw new Error("GITHUB_REF_NAME or an exact release tag is required");
  const identity = parseExtensionTag(tag);
  if (!identity) throw new Error(`Tag must use <extensionId>-<SemVer>: ${tag}`);
  const assetPath = resolve("packages", identity.id, packageAssetName(tag));
  const assetBytes = await readFile(assetPath);
  const { owner, repository } = repositoryFromEnvironment();
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required to publish a GitHub Release");
  const client = createGitHubClient({ owner, repository, token });
  const prerelease = identity.version.includes("-");
  const expectedUrl = `https://github.com/${owner}/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(packageAssetName(tag))}`;
  const expectedRelease = {
    tag_name: tag,
    draft: false,
    prerelease,
    assets: [{ name: packageAssetName(tag), size: assetBytes.length, state: "uploaded", browser_download_url: expectedUrl }],
  };
  const expectedEntry = catalogEntryFromRelease({ release: expectedRelease, assetBytes, owner, repository });
  const syntheticId = identity.id.startsWith("synthetic-");
  const markedSynthetic = expectedEntry.metadata.package.distributionTestFixture === true;
  if (syntheticId !== markedSynthetic) throw new Error("Synthetic release tags and manifest metadata must use the reserved synthetic- fixture contract");

  let release = await getOrCreateRelease(client, { tag, prerelease });
  validateReleaseIdentity(release, tag, prerelease);
  const packageAssets = Array.isArray(release.assets) ? release.assets.filter((asset) => typeof asset?.name === "string" && asset.name.toLowerCase().endsWith(".aicxt")) : [];
  if (packageAssets.some((asset) => asset.name !== packageAssetName(tag))) throw new Error(`Release ${tag} already contains a different .aicxt asset`);
  if (packageAssets.length === 0) {
    await client.uploadReleaseAsset(release, packageAssetName(tag), assetBytes);
  }

  release = await client.getReleaseByTag(tag);
  validateReleaseIdentity(release, tag, prerelease);
  const uploaded = release.assets?.find((asset) => asset.name === packageAssetName(tag));
  if (!uploaded) throw new Error(`Release ${tag} is missing its uploaded package asset`);
  const publishedBytes = await client.fetchPublicAsset(uploaded.browser_download_url);
  const expectedHash = createHash("sha256").update(assetBytes).digest("hex");
  const publishedHash = createHash("sha256").update(publishedBytes).digest("hex");
  if (publishedBytes.length !== assetBytes.length || publishedHash !== expectedHash) {
    throw new Error(`Published .aicxt asset differs from the validated local package for ${tag}; the immutable asset was not replaced`);
  }
  const entry = catalogEntryFromRelease({ release, assetBytes: publishedBytes, owner, repository });
  if (isSyntheticFixtureEntry(entry) !== syntheticId) throw new Error("Release fixture marker does not match its reserved tag namespace");
  process.stdout.write(`${JSON.stringify({ tag, channel: entry.channel, asset: entry.asset.name, size: entry.asset.size, sha256: entry.asset.sha256, synthetic: syntheticId })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
