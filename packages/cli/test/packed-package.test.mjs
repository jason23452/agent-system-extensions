import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("npm tarball is self-contained and launches from a clean npm cache and local installation", { timeout: 50_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-package-smoke-"));
  try {
    const packageManifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    const expectedFilename = `agent-system-extensions-cli-${packageManifest.version}.tgz`;
    const npmCache = join(root, "fresh-npm-cache");
    const preparedTarball = process.env.AGENT_SYSTEM_CLI_TARBALL;
    let tarball;
    if (preparedTarball) {
      tarball = resolve(preparedTarball);
      assert.equal(basename(tarball), expectedFilename);
      const repositoryRoot = resolve(packageRoot, "../..");
      const provenance = JSON.parse(await readFile(join(repositoryRoot, "releases", "cli", `${packageManifest.version}.json`), "utf8"));
      const artifactBytes = await readFile(tarball);
      assert.equal(provenance.schemaVersion, "agent-system.cli-release-provenance.v1");
      assert.equal(provenance.packageName, packageManifest.name);
      assert.equal(provenance.version, packageManifest.version);
      assert.match(provenance.sourceRevision, /^[a-f0-9]{40,64}$/);
      assert.equal(provenance.sourceRevision, process.env.AGENT_SYSTEM_CLI_SOURCE_REVISION);
      assert.equal(provenance.artifact.assetName, expectedFilename);
      assert.equal(
        provenance.artifact.url,
        `https://github.com/jason23452/agent-system-extensions/releases/download/cli-v${packageManifest.version}/${expectedFilename}`,
      );
      assert.equal(provenance.artifact.sha256, createHash("sha256").update(artifactBytes).digest("hex"));
      assert.equal(provenance.artifact.sizeBytes, artifactBytes.byteLength);
    } else {
      const packed = runNpm(["pack", "--ignore-scripts", "--json", `--pack-destination=${root}`], packageRoot, npmCache);
      assert.equal(packed.status, 0, packed.stderr);
      const packRecord = JSON.parse(packed.stdout)[0];
      assert.equal(packRecord.filename, expectedFilename);
      assert.equal(packRecord.files.some((file) => file.path.startsWith("dist/release/")), false,
        "the prepared release tarball must not recursively include itself or adjacent pinned artifacts");
      tarball = join(root, packRecord.filename);
    }

    const npxResult = runNpm(["exec", "--offline", "--yes", "--package", tarball, "--", "agent-system-extensions", "--help"], root, npmCache);
    assert.equal(npxResult.status, 0, npxResult.stderr);
    assert.match(npxResult.stdout, /Agent System Extensions CLI/, `npm exec did not print CLI help (stderr: ${npxResult.stderr})`);

    const installRoot = join(root, "installed-cli");
    const installResult = runNpm(["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installRoot, tarball], root, npmCache);
    assert.equal(installResult.status, 0, installResult.stderr);
    const bundledContracts = join(installRoot, "node_modules", "@agent-system", "extensions-cli", "dist", "vendor", "contracts", "index.js");
    const contracts = await import(pathToFileURL(bundledContracts).href);
    assert.equal(typeof contracts.validateExtensionCatalog, "function");
    const installedPackageRoot = join(installRoot, "node_modules", "@agent-system", "extensions-cli");
    const installedManifest = JSON.parse(await readFile(join(installedPackageRoot, "package.json"), "utf8"));
    assert.equal(installedManifest.version, packageManifest.version);
    const installedCli = join(installedPackageRoot, "dist", "cli.mjs");
    const localResult = spawnSync(process.execPath, [installedCli, "--help"], { encoding: "utf8", timeout: 5_000, windowsHide: true });
    assert.equal(localResult.status, 0, localResult.stderr);
    assert.match(localResult.stdout, /install/);

    const symlinkedCli = join(root, "agent-system-extensions-link.mjs");
    await symlink(installedCli, symlinkedCli, "file");
    const symlinkResult = spawnSync(process.execPath, [symlinkedCli, "--help"], {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
    });
    assert.equal(symlinkResult.status, 0, symlinkResult.stderr);
    assert.match(
      symlinkResult.stdout,
      /Agent System Extensions CLI/,
      `a symlinked package executable must start the CLI entry point (stderr: ${symlinkResult.stderr})`,
    );
    assert.match(await readFile(installedCli, "utf8"), /\brealpathSync\b/, "the installed tarball must contain the symlink-safe entry point");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function runNpm(args, cwd, cache) {
  const environment = { ...process.env, npm_config_cache: cache };
  return spawnSync("npm", args, {
    cwd,
    encoding: "utf8",
    env: environment,
    shell: process.platform === "win32",
    timeout: 15_000,
    windowsHide: true,
  });
}
