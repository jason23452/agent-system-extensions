import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, basename, resolve } from "node:path";
import { Transform, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { validateCatalog } from "./catalog.js";

export const DEFAULT_CATALOG_URL = "https://raw.githubusercontent.com/jason23452/agent-system-extensions/main/catalog.json";
const MAX_CATALOG_BYTES = 5 * 1024 * 1024;

async function responseBuffer(response, maxBytes) {
  if (!response.ok) throw new Error(`HTTP ${response.status} while requesting catalog`);
  if (!response.body) throw new Error("Catalog response has no body");
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    length += bytes.length;
    if (length > maxBytes) throw new Error("Catalog response exceeds the supported size");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, length);
}

async function destinationExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function writeValidatedFile(path, bytes, { overwrite = true } = {}) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const temporary = resolve(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    if (overwrite) {
      await rename(temporary, target);
    } else {
      await linkWithoutOverwrite(temporary, target);
      await rm(temporary, { force: true });
    }
    return target;
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

async function linkWithoutOverwrite(source, destination) {
  const { link } = await import("node:fs/promises");
  try {
    await link(source, destination);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`Output already exists: ${destination}; pass --force to replace it`);
    throw error;
  }
}

async function readCatalog(url, fetchImpl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Catalog URL must be a valid public HTTPS URL");
  }
  if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) throw new Error("Catalog URL must use HTTPS and must not contain credentials");
  const response = await fetchImpl(url, { headers: { accept: "application/json" }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
  const bytes = await responseBuffer(response, MAX_CATALOG_BYTES);
  let catalog;
  try {
    catalog = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Catalog response is not valid JSON");
  }
  validateCatalog(catalog);
  return catalog;
}

export async function downloadExtension({ catalogUrl = DEFAULT_CATALOG_URL, id, channel, version, outputPath, overwrite = false, fetchImpl = globalThis.fetch }) {
  if (typeof id !== "string" || id.length === 0) throw new Error("An exact Extension ID is required");
  if (channel !== "stable" && channel !== "dev") throw new Error("Channel must be stable or dev");
  if (typeof version !== "string" || version.length === 0) throw new Error("An exact SemVer version is required");
  if (typeof outputPath !== "string" || outputPath.length === 0) throw new Error("An output path is required");
  const output = resolve(outputPath);
  if (!overwrite && await destinationExists(output)) throw new Error(`Output already exists: ${output}; pass --force to replace it`);

  const catalog = await readCatalog(catalogUrl, fetchImpl);
  const entry = catalog.extensions.find((candidate) => candidate.id === id && candidate.channel === channel && candidate.version === version);
  if (!entry) throw new Error(`Exact release not found: ${id} ${channel} ${version}; no latest fallback is used`);

  const response = await fetchImpl(entry.asset.url, { redirect: "follow", signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} while downloading ${entry.asset.name}`);
  if (!response.body) throw new Error("Release asset response has no body");
  const temporary = resolve(dirname(output), `.${basename(output)}.${randomUUID()}.tmp`);
  const hash = createHash("sha256");
  let size = 0;
  const verifier = new Transform({
    transform(chunk, _encoding, callback) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > entry.asset.size) return callback(new Error("Downloaded asset exceeds the catalog size"));
      hash.update(bytes);
      callback(null, bytes);
    },
  });
  await mkdir(dirname(output), { recursive: true });
  try {
    await pipeline(Readable.fromWeb(response.body), verifier, createWriteStream(temporary, { flags: "wx" }));
    if (size !== entry.asset.size) throw new Error("Downloaded asset size does not match the catalog");
    if (hash.digest("hex") !== entry.asset.sha256) throw new Error("Downloaded asset SHA-256 does not match the catalog");
    if (overwrite) {
      await rename(temporary, output);
    } else {
      await linkWithoutOverwrite(temporary, output);
      await rm(temporary, { force: true });
    }
    return { entry, outputPath: output };
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

export async function updateCatalog({ catalogUrl = DEFAULT_CATALOG_URL, outputPath, fetchImpl = globalThis.fetch }) {
  const catalog = await readCatalog(catalogUrl, fetchImpl);
  const content = `${JSON.stringify(catalog, null, 2)}\n`;
  if (outputPath === undefined) return { catalog, content };
  if (typeof outputPath !== "string" || outputPath.length === 0) throw new Error("Output path must not be empty");
  const savedPath = await writeValidatedFile(outputPath, Buffer.from(content), { overwrite: true });
  return { catalog, content, outputPath: savedPath };
}

export async function readLocalCatalog(path) {
  const catalog = JSON.parse(await readFile(path, "utf8"));
  validateCatalog(catalog);
  return catalog;
}
