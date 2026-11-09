import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalogEntryFromRelease } from "../packages/cli/src/catalog.js";
import { downloadExtension, updateCatalog } from "../packages/cli/src/commands.js";
import { releaseFor } from "../test-support/fixtures.js";

async function withTempDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), "extension-distribution-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("download selects only the explicitly requested extension, channel and version", async () => {
  await withTempDirectory(async (directory) => {
    const stable = releaseFor({ version: "1.2.3" });
    const newer = releaseFor({ version: "1.3.0-dev.1", prerelease: true });
    const stableEntry = catalogEntryFromRelease({ release: stable.release, assetBytes: stable.assetBytes });
    const newerEntry = catalogEntryFromRelease({ release: newer.release, assetBytes: newer.assetBytes });
    const requests = [];
    const fetchImpl = async (url) => {
      requests.push(String(url));
      if (String(url) === "https://catalog.test/catalog.json") return Response.json({ schemaVersion: 1, extensions: [stableEntry, newerEntry] });
      if (String(url) === stableEntry.asset.url) return new Response(stable.assetBytes);
      throw new Error(`Unexpected request: ${url}`);
    };
    const outputPath = join(directory, "selected.aicxt");

    await downloadExtension({ catalogUrl: "https://catalog.test/catalog.json", id: "synthetic-fixture", channel: "stable", version: "1.2.3", outputPath, fetchImpl });

    assert.deepEqual(requests, ["https://catalog.test/catalog.json", stableEntry.asset.url]);
    assert.deepEqual(await readFile(outputPath), stable.assetBytes);
  });
});

test("download does not fall back when the exact version is absent", async () => {
  await withTempDirectory(async (directory) => {
    const newer = releaseFor({ version: "1.3.0-dev.1", prerelease: true });
    const entry = catalogEntryFromRelease({ release: newer.release, assetBytes: newer.assetBytes });
    let assetRequests = 0;
    const fetchImpl = async () => Response.json({ schemaVersion: 1, extensions: [entry] });

    await assert.rejects(downloadExtension({
      catalogUrl: "https://catalog.test/catalog.json",
      id: "synthetic-fixture",
      channel: "stable",
      version: "1.2.3",
      outputPath: join(directory, "missing.aicxt"),
      fetchImpl: async (url) => {
        if (String(url).endsWith("catalog.json")) return fetchImpl(url);
        assetRequests += 1;
        return new Response(newer.assetBytes);
      },
    }), /exact release|not found/i);

    assert.equal(assetRequests, 0);
  });
});

test("download hash mismatch leaves no partial output and preserves an existing destination", async () => {
  await withTempDirectory(async (directory) => {
    const release = releaseFor({ version: "1.2.3" });
    const entry = catalogEntryFromRelease({ release: release.release, assetBytes: release.assetBytes });
    const outputPath = join(directory, "existing.aicxt");
    const original = Buffer.from("existing package");
    const tamperedBytes = Buffer.from(release.assetBytes);
    tamperedBytes[0] ^= 0xff;
    await writeFile(outputPath, original);
    const fetchImpl = async (url) => String(url).endsWith("catalog.json")
      ? Response.json({ schemaVersion: 1, extensions: [entry] })
      : new Response(tamperedBytes);

    await assert.rejects(downloadExtension({ catalogUrl: "https://catalog.test/catalog.json", id: entry.id, channel: entry.channel, version: entry.version, outputPath, overwrite: true, fetchImpl }), /SHA-256|hash/i);
    assert.deepEqual(await readFile(outputPath), original);
  });
});

test("download refuses to replace an existing destination without explicit force", async () => {
  await withTempDirectory(async (directory) => {
    const release = releaseFor({ version: "1.2.3" });
    const entry = catalogEntryFromRelease({ release: release.release, assetBytes: release.assetBytes });
    const outputPath = join(directory, "existing.aicxt");
    const original = Buffer.from("do not replace");
    await writeFile(outputPath, original);
    let requests = 0;

    await assert.rejects(downloadExtension({
      catalogUrl: "https://catalog.test/catalog.json",
      id: entry.id,
      channel: entry.channel,
      version: entry.version,
      outputPath,
      fetchImpl: async () => {
        requests += 1;
        return Response.json({ schemaVersion: 1, extensions: [entry] });
      },
    }), /already exists/i);

    assert.equal(requests, 0);
    assert.deepEqual(await readFile(outputPath), original);
  });
});

test("catalog access rejects insecure URLs before making a request", async () => {
  await withTempDirectory(async (directory) => {
    let requests = 0;
    await assert.rejects(downloadExtension({
      catalogUrl: "http://catalog.test/catalog.json",
      id: "synthetic-fixture",
      channel: "stable",
      version: "1.2.3",
      outputPath: join(directory, "package.aicxt"),
      fetchImpl: async () => {
        requests += 1;
        return Response.json({ schemaVersion: 1, extensions: [] });
      },
    }), /HTTPS/i);
    assert.equal(requests, 0);
  });
});

test("catalog updater validates and writes only the current catalog document", async () => {
  await withTempDirectory(async (directory) => {
    const catalog = { schemaVersion: 1, extensions: [] };
    const requests = [];
    const outputPath = join(directory, "catalog.json");
    await updateCatalog({
      catalogUrl: "https://catalog.test/catalog.json",
      outputPath,
      fetchImpl: async (url) => {
        requests.push(String(url));
        return Response.json(catalog);
      },
    });

    assert.deepEqual(requests, ["https://catalog.test/catalog.json"]);
    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), catalog);
    assert.equal(requests.some((url) => url.endsWith(".aicxt")), false);
  });
});

test("catalog updater preserves the last valid file when the remote catalog is invalid", async () => {
  await withTempDirectory(async (directory) => {
    const outputPath = join(directory, "catalog.json");
    const original = Buffer.from('{"schemaVersion":1,"extensions":[]}\n');
    await writeFile(outputPath, original);

    await assert.rejects(updateCatalog({
      catalogUrl: "https://catalog.test/catalog.json",
      outputPath,
      fetchImpl: async () => Response.json({ schemaVersion: 99, extensions: [] }),
    }), /schemaVersion/i);

    assert.deepEqual(await readFile(outputPath), original);
  });
});

test("catalog updater atomically replaces a valid existing catalog", async () => {
  await withTempDirectory(async (directory) => {
    const outputPath = join(directory, "catalog.json");
    const previous = { schemaVersion: 1, extensions: [] };
    const next = { schemaVersion: 1, extensions: [] };
    await writeFile(outputPath, `${JSON.stringify(previous)}\n`);

    await updateCatalog({
      catalogUrl: "https://catalog.test/catalog.json",
      outputPath,
      fetchImpl: async () => Response.json(next),
    });

    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), next);
  });
});
