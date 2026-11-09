#!/usr/bin/env node
import { updateCatalog, DEFAULT_CATALOG_URL } from "../src/commands.js";

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--help" || name === "-h") return { help: true };
    if (!["--catalog", "--output"].includes(name)) throw new Error(`Unknown option: ${name}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
    if (values.has(name)) throw new Error(`Option may only be specified once: ${name}`);
    values.set(name, value);
    index += 1;
  }
  return { catalogUrl: values.get("--catalog") ?? DEFAULT_CATALOG_URL, outputPath: values.get("--output") };
}

const usage = `Usage: extension-catalog [--catalog <url>] [--output <file>]

Fetches and validates the current complete public catalog. With --output it atomically replaces that file; without --output it writes JSON to stdout. It never downloads or installs an Extension package.`;

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage}\n`);
  } else {
    const result = await updateCatalog(options);
    if (result.outputPath) process.stdout.write(`Updated catalog at ${result.outputPath} (${result.catalog.extensions.length} releases)\n`);
    else process.stdout.write(result.content);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${usage}\n`);
  process.exitCode = 1;
}
