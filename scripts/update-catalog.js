import { writeFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, dirname, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { mergeCatalogs, validateCatalog } from "../packages/cli/src/catalog.js";
import { buildOfficialCatalog } from "./catalog-build.js";
import { createGitHubClient, GitHubApiError, repositoryFromEnvironment } from "./github.js";

const EMPTY_CATALOG = Object.freeze({ schemaVersion: 1, extensions: [] });

function parseContents(contents) {
  if (contents === null) return { catalog: EMPTY_CATALOG, sha: undefined };
  if (contents.type !== "file" || contents.encoding !== "base64" || typeof contents.content !== "string") {
    throw new Error("GitHub contents API did not return a base64 catalog file");
  }
  let catalog;
  try {
    catalog = JSON.parse(Buffer.from(contents.content.replace(/\s+/g, ""), "base64").toString("utf8"));
  } catch {
    throw new Error("The current catalog.json on main is invalid JSON");
  }
  validateCatalog(catalog);
  return { catalog, sha: contents.sha };
}

function serializeCatalog(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

export async function updateOfficialCatalog({ client, branch = "main", maxConflicts = 3 }) {
  if (!client) throw new Error("GitHub client is required");
  for (let attempt = 1; attempt <= maxConflicts; attempt += 1) {
    const [contents, releases] = await Promise.all([
      client.getContents("catalog.json", { branch }),
      client.listReleases(),
    ]);
    const current = parseContents(contents);
    const catalog = await buildOfficialCatalog(current.catalog, releases, { fetchAsset: client.fetchPublicAsset });
    const serialized = serializeCatalog(catalog);
    if (serializeCatalog(current.catalog) === serialized) return { catalog, changed: false, attempts: attempt };

    const payload = {
      message: "chore(catalog): update validated Extension releases",
      content: Buffer.from(serialized).toString("base64"),
      branch,
      ...(current.sha ? { sha: current.sha } : {}),
    };
    try {
      await client.putContents("catalog.json", payload);
      return { catalog, changed: true, attempts: attempt };
    } catch (error) {
      if (!(error instanceof GitHubApiError) || ![409, 422].includes(error.status) || attempt === maxConflicts) throw error;
    }
  }
  throw new Error("Catalog update exhausted its bounded conflict retries");
}

async function writeJson(path, value) {
  const target = resolve(path);
  const temporary = resolve(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  const content = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await writeFile(temporary, content, { flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) throw new Error("Usage: node scripts/update-catalog.js <catalog-output-path>");
  const { owner, repository } = repositoryFromEnvironment();
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required by the GitHub Actions catalog writer");
  const client = createGitHubClient({ owner, repository, token });
  const result = await updateOfficialCatalog({ client });
  await writeJson(outputPath, result.catalog);
  process.stdout.write(`Validated ${result.catalog.extensions.length} catalog releases; changed=${result.changed}; conflict_attempts=${result.attempts}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
