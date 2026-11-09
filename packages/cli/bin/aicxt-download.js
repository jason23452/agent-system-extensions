#!/usr/bin/env node
import { downloadExtension, DEFAULT_CATALOG_URL } from "../src/commands.js";

function parseArgs(args) {
  const values = new Map();
  let force = false;
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--force") {
      force = true;
      continue;
    }
    if (name === "--help" || name === "-h") return { help: true };
    if (!["--catalog", "--id", "--channel", "--version", "--output"].includes(name)) throw new Error(`Unknown option: ${name}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
    if (values.has(name)) throw new Error(`Option may only be specified once: ${name}`);
    values.set(name, value);
    index += 1;
  }
  return {
    catalogUrl: values.get("--catalog") ?? DEFAULT_CATALOG_URL,
    id: values.get("--id"),
    channel: values.get("--channel"),
    version: values.get("--version"),
    outputPath: values.get("--output"),
    overwrite: force,
  };
}

const usage = `Usage: aicxt-download --id <extensionId> --channel <stable|dev> --version <SemVer> --output <file> [--catalog <url>] [--force]

Downloads only the exact catalog release and verifies its size and SHA-256. It never falls back to a repository-wide latest release.`;

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage}\n`);
  } else {
    const result = await downloadExtension(options);
    process.stdout.write(`Downloaded ${result.entry.id}@${result.entry.version} (${result.entry.channel}) to ${result.outputPath}\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${usage}\n`);
  process.exitCode = 1;
}
