import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("CLI build preserves existing release artifacts in dist", { timeout: 20_000 }, async () => {
  const releaseDirectory = join(packageRoot, "dist", "release");
  const sentinel = join(releaseDirectory, `ticket03-build-preservation-${process.pid}.tgz`);
  const pinnedArtifact = join(releaseDirectory, "agent-system-extensions-cli-0.1.0.tgz");
  let pinnedBytes;
  try {
    pinnedBytes = await readFile(pinnedArtifact);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(releaseDirectory, { recursive: true });
  const sentinelBytes = Buffer.from("do not remove release assets while compiling CLI sources");
  await writeFile(sentinel, sentinelBytes, { flag: "wx" });
  try {
    const result = spawnSync(process.execPath, [join(packageRoot, "scripts", "build.mjs")], {
      cwd: packageRoot,
      encoding: "utf8",
      timeout: 15_000,
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await readFile(sentinel), sentinelBytes);
    if (pinnedBytes) assert.deepEqual(await readFile(pinnedArtifact), pinnedBytes);
  } finally {
    await rm(sentinel, { force: true });
  }
});
