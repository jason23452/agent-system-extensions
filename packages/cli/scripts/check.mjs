import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["src", "scripts", "test"];
const files = [];
for (const target of targets) await collect(join(packageRoot, target), files);
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", timeout: 10_000, windowsHide: true });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || `Node syntax check failed: ${file}\n`);
    process.exitCode = result.status ?? 1;
    break;
  }
}
if (process.exitCode === undefined) process.stdout.write(`Node syntax check passed for ${files.length} JavaScript files.\n`);

async function collect(directory, output) {
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path, output);
    else if (entry.isFile() && entry.name.endsWith(".mjs")) output.push(path);
  }
}
