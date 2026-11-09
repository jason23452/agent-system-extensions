import { randomUUID } from "node:crypto";
import { writeFile, rename, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { buildSyntheticCatalog } from "./catalog-build.js";
import { createGitHubClient, repositoryFromEnvironment } from "./github.js";

async function main() {
  const tag = process.argv[2];
  const output = process.argv[3];
  if (!tag || !output) throw new Error("Usage: node scripts/build-synthetic-catalog.js <tag> <output-path>");
  const { owner, repository } = repositoryFromEnvironment();
  const client = createGitHubClient({ owner, repository });
  const release = await client.getReleaseByTag(tag, { authenticated: false });
  if (!release) throw new Error(`Public GitHub Release is not visible yet: ${tag}`);
  if (release.tag_name !== tag) throw new Error("Public GitHub Release returned a different tag");
  const catalog = await buildSyntheticCatalog(release, { fetchAsset: client.fetchPublicAsset });
  const target = resolve(output);
  const temporary = resolve(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, { flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
  process.stdout.write(`Built isolated synthetic catalog for ${tag}: ${catalog.extensions[0].asset.sha256}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
