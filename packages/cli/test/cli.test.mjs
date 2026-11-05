import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAicxt } from "./fixtures.mjs";

const cli = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));

test("CLI help documents the supported installation workflow", () => {
  const result = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /install/);
  assert.match(result.stdout, /update/);
  assert.match(result.stdout, /status/);
  assert.match(result.stdout, /retry/);
  assert.match(result.stdout, /pack/);
  assert.match(result.stdout, /validate/);
});

test("validate reports the exact identity and SHA-256 of a valid local package", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-validate-"));
  try {
    const archive = createAicxt();
    const path = join(root, "fixture.aicxt");
    await writeFile(path, archive);

    const result = runCli("validate", path, "--json");
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      extensionId: "fixture-extension",
      packageSha256: "4de9409f2b7fb0e10d44c5eeba46008fc33732cb899545d66b6134eec6000622",
      sizeBytes: archive.byteLength,
      version: "1.2.3",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validate rejects package resource integrity mismatches with a stable package error", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-invalid-"));
  try {
    const path = join(root, "invalid.aicxt");
    await writeFile(path, createAicxt({ entryIntegrity: `sha256-${"0".repeat(64)}` }));

    const result = runCli("validate", path, "--json");
    assert.equal(result.status, 6);
    assert.equal(JSON.parse(result.stderr).error.code, "PACKAGE_INTEGRITY_MISMATCH");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validate accepts packages whose manifest has no optional backend section", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-optional-backend-"));
  try {
    const archivePath = join(root, "resource-only.aicxt");
    await writeFile(archivePath, createAicxt({ withoutBackend: true }));
    const result = runCli("validate", archivePath, "--json");

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).extensionId, "fixture-extension");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validate accepts the base64 SHA-256 integrity encoding supported by the platform", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-base64-integrity-"));
  try {
    const archivePath = join(root, "base64-integrity.aicxt");
    await writeFile(archivePath, createAicxt({ integrityEncoding: "base64" }));
    const result = runCli("validate", archivePath, "--json");

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).extensionId, "fixture-extension");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pack builds a package from a directory and validates the produced archive", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-pack-"));
  try {
    const extensionRoot = join(root, "extension");
    const output = join(root, "fixture.aicxt");
    const archive = createAicxt();
    const packageFiles = readAicxtEntries(archive);
    await mkdir(join(extensionRoot, "backend"), { recursive: true });
    await writeFile(join(extensionRoot, "extension.json"), packageFiles.get("extension.json"));
    await writeFile(join(extensionRoot, "backend", "entry.js"), packageFiles.get("backend/entry.js"));

    const result = runCli("pack", extensionRoot, "--output", output, "--json");
    assert.equal(result.status, 0, result.stderr);
    const packed = JSON.parse(result.stdout);
    assert.equal(packed.extensionId, "fixture-extension");
    assert.equal(packed.version, "1.2.3");
    assert.equal((await readFile(output)).byteLength, packed.sizeBytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function runCli(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 10_000 });
}

function readAicxtEntries() {
  const archive = createAicxt();
  const eocdOffset = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const directoryOffset = archive.readUInt32LE(eocdOffset + 16);
  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  const entries = new Map();
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const name = archive.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    entries.set(name, archive.subarray(start, start + compressedSize));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
