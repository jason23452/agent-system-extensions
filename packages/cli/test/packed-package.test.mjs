import assert from "node:assert/strict";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("npm tarball is self-contained and launches from a clean npm cache and local installation", { timeout: 50_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-package-smoke-"));
  try {
    const npmCache = join(root, "fresh-npm-cache");
    const packed = runNpm(["pack", "--ignore-scripts", "--json", `--pack-destination=${root}`], packageRoot, npmCache);
    assert.equal(packed.status, 0, packed.stderr);
    const packRecord = JSON.parse(packed.stdout)[0];
    const tarball = join(root, packRecord.filename);
    assert.match(packRecord.filename, /extensions-cli-0\.1\.0\.tgz$/);
    assert.equal(packRecord.files.some((file) => file.path.startsWith("dist/release/")), false,
      "the prepared release tarball must not recursively include itself or adjacent pinned artifacts");

    const npxResult = runNpm(["exec", "--offline", "--yes", "--package", tarball, "--", "agent-system-extensions", "--help"], root, npmCache);
    assert.equal(npxResult.status, 0, npxResult.stderr);
    assert.match(npxResult.stdout, /Agent System Extensions CLI/, `npm exec did not print CLI help (stderr: ${npxResult.stderr})`);

    const installRoot = join(root, "installed-cli");
    const installResult = runNpm(["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installRoot, tarball], root, npmCache);
    assert.equal(installResult.status, 0, installResult.stderr);
    const bundledContracts = join(installRoot, "node_modules", "@agent-system", "extensions-cli", "dist", "vendor", "contracts", "index.js");
    const contracts = await import(pathToFileURL(bundledContracts).href);
    assert.equal(typeof contracts.validateExtensionCatalog, "function");
    const installedCli = join(installRoot, "node_modules", "@agent-system", "extensions-cli", "dist", "cli.mjs");
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
