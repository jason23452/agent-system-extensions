import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(packageRoot, "src");
const outputRoot = join(packageRoot, "dist");
const contractsRoot = resolve(packageRoot, "../contracts/dist");

await mkdir(outputRoot, { recursive: true });
await copyJavaScriptFiles(sourceRoot, outputRoot);
await cp(contractsRoot, join(outputRoot, "vendor", "contracts"), { recursive: true });
process.stdout.write(`${JSON.stringify({ output: outputRoot, files: await listJavaScriptFiles(outputRoot) })}\n`);

async function copyJavaScriptFiles(source, target) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const relativePath = relative(sourceRoot, sourcePath);
    const targetPath = join(target, relativePath);
    if (entry.isDirectory()) {
      await mkdir(targetPath, { recursive: true });
      await copyJavaScriptFiles(sourcePath, target);
    } else if (entry.isFile() && entry.name.endsWith(".mjs")) {
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, await readFile(sourcePath));
    }
  }
}

async function listJavaScriptFiles(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await listJavaScriptFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".mjs")) paths.push(relative(outputRoot, path).replaceAll("\\", "/"));
  }
  return paths.sort();
}
