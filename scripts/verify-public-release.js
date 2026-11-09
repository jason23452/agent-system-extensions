import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createGitHubClient, repositoryFromEnvironment } from "./github.js";
import { catalogEntryFromRelease, isSyntheticFixtureEntry, validateCatalog } from "../packages/cli/src/catalog.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

async function main() {
  const tag = process.argv[2];
  const catalogPath = process.argv[3];
  if (!tag || !catalogPath) throw new Error("Usage: node scripts/verify-public-release.js <tag> <synthetic-catalog.json>");
  const { owner, repository } = repositoryFromEnvironment();
  const client = createGitHubClient({ owner, repository });
  const release = await client.getReleaseByTag(tag, { authenticated: false });
  if (!release) throw new Error(`Anonymous GitHub API could not read release ${tag}`);
  if (release.tag_name !== tag || release.draft !== false) throw new Error("Anonymous release metadata does not match the requested published tag");
  const packageAssets = release.assets?.filter((asset) => asset.name.toLowerCase().endsWith(".aicxt")) ?? [];
  if (packageAssets.length !== 1) throw new Error("Public synthetic release must contain exactly one .aicxt asset");
  const assetBytes = await client.fetchPublicAsset(packageAssets[0].browser_download_url);
  const entry = catalogEntryFromRelease({ release, assetBytes, owner, repository });
  if (!isSyntheticFixtureEntry(entry)) throw new Error("Release is not marked as an isolated synthetic fixture");

  const attachedCatalog = release.assets?.find((asset) => asset.name === "synthetic-catalog.json");
  if (!attachedCatalog) throw new Error("Release pipeline did not attach synthetic-catalog.json");
  const pipelineCatalog = JSON.parse((await client.fetchPublicAsset(attachedCatalog.browser_download_url)).toString("utf8"));
  validateCatalog(pipelineCatalog);
  if (pipelineCatalog.extensions.length !== 1 || canonical(pipelineCatalog.extensions[0]) !== canonical(entry)) {
    throw new Error("Pipeline catalog entry differs from the anonymously downloaded release metadata and asset");
  }

  const officialUrl = `https://raw.githubusercontent.com/${owner}/${repository}/main/catalog.json`;
  const officialResponse = await fetch(officialUrl, { headers: { accept: "application/json" }, redirect: "error" });
  if (!officialResponse.ok) throw new Error(`Anonymous official catalog read failed with HTTP ${officialResponse.status}`);
  const officialCatalog = JSON.parse(await officialResponse.text());
  validateCatalog(officialCatalog);
  if (officialCatalog.extensions.some((item) => item.id.startsWith("synthetic-") || item.tag === tag)) {
    throw new Error("Synthetic fixture release leaked into the official catalog");
  }

  const summary = {
    tag,
    prerelease: release.prerelease,
    channel: entry.channel,
    asset: entry.asset.name,
    size: assetBytes.length,
    sha256: createHash("sha256").update(assetBytes).digest("hex"),
    catalogAsset: attachedCatalog.name,
    officialCatalogEntries: officialCatalog.extensions.length,
    anonymous: true,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
