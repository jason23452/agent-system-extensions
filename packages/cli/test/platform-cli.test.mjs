import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runCli } from "../src/cli.mjs";
import { createAicxt } from "./fixtures.mjs";

test("local install sends the exact validated archive and explicit target through the platform API", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-install-"));
  try {
    const archive = createAicxt();
    const archivePath = join(root, "套件 with spaces.aicxt");
    await writeFile(archivePath, archive);
    const archiveHash = createHash("sha256").update(archive).digest("hex");
    const calls = [];
    const stdout = capture();
    const stderr = capture();
    const operationId = "ticket03-local-install";

    const exitCode = await runCli([
      "install", "fixture-extension", "--file", archivePath,
      "--platform", "http://127.0.0.1:3030/agent-system/",
      "--scope", "project", "--project", "demo-project", "--json",
    ], {
      cacheRoot: join(root, "product-cache"),
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        const form = init.body;
        assert.equal(form.get("scope"), "project");
        assert.equal(form.get("project"), "demo-project");
        assert.equal(form.get("extend"), "false");
        assert.equal(form.get("expectedExtensionId"), "fixture-extension");
        assert.equal(form.get("expectedVersion"), "1.2.3");
        assert.equal(form.get("expectedPackageSha256"), archiveHash);
        assert.equal(form.get("operationId"), operationId);
        assert.deepEqual(Buffer.from(await form.get("file").arrayBuffer()), archive);
        return jsonResponse({ operation: operation(operationId, "succeeded", identity(archiveHash)) });
      },
      randomUUID: () => operationId,
      stdout,
      stderr,
    });

    assert.equal(exitCode, 0, stderr.text());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:3030/agent-system/bff/extensions/install");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(JSON.parse(stdout.text()).operation.operationId, operationId);
    assert.deepEqual(await readFile(join(root, "product-cache", "artifacts", "fixture-extension", "1.2.3", `${archiveHash}.aicxt`)), archive);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a greater-than-one-MiB archive remains intact in the CLI multipart request", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-large-install-"));
  try {
    const archive = createAicxt({ extraFileBytes: 1_250_000 });
    const archivePath = join(root, "large.aicxt");
    await writeFile(archivePath, archive);
    assert.ok(archive.byteLength > 1024 * 1024);
    const stdout = capture();
    const stderr = capture();
    const exitCode = await runCli([
      "install", "fixture-extension", "--file", archivePath,
      "--platform", "http://127.0.0.1:3030",
      "--scope", "project", "--project", "large-project", "--json",
    ], {
      cacheRoot: join(root, "product-cache"),
      randomUUID: () => "ticket03-large-install",
      stdout,
      stderr,
      fetchImpl: async (_url, init) => {
        assert.ok((await init.body.get("file").arrayBuffer()).byteLength > 1024 * 1024);
        return jsonResponse({ operation: operation("ticket03-large-install", "succeeded", {
          extensionId: "fixture-extension",
          packageSha256: createHash("sha256").update(archive).digest("hex"),
          project: "large-project",
          scope: "project",
          version: "1.2.3",
        }) });
      },
    });
    assert.equal(exitCode, 0, stderr.text());
    assert.equal(JSON.parse(stdout.text()).sizeBytes, archive.byteLength);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("offline remote installation uses the pinned cached archive and does not contact GitHub", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-offline-install-"));
  try {
    const archive = createAicxt();
    const archivePath = join(root, "fixture.aicxt");
    await writeFile(archivePath, archive);
    const cacheRoot = join(root, "product-cache");
    const hash = createHash("sha256").update(archive).digest("hex");
    await runCli([
      "install", "fixture-extension", "--file", archivePath,
      "--platform", "http://127.0.0.1:3030", "--scope", "project", "--project", "demo-project", "--json",
    ], {
      cacheRoot,
      randomUUID: () => "ticket03-seed-cache",
      stdout: capture(),
      stderr: capture(),
      fetchImpl: async () => jsonResponse({ operation: operation("ticket03-seed-cache", "succeeded", identity(hash)) }),
    });

    const calls = [];
    const stdout = capture();
    const stderr = capture();
    const exitCode = await runCli([
      "install", "fixture-extension", "--platform", "http://127.0.0.1:3030",
      "--scope", "project", "--project", "demo-project", "--offline", "--version", "1.2.3", "--sha256", hash, "--json",
    ], {
      cacheRoot,
      randomUUID: () => "ticket03-offline-install",
      stdout,
      stderr,
      fetchImpl: async (url) => {
        calls.push(String(url));
        return jsonResponse({ operation: operation("ticket03-offline-install", "succeeded", identity(hash)) });
      },
    });

    assert.equal(exitCode, 0, stderr.text());
    assert.deepEqual(calls, ["http://127.0.0.1:3030/bff/extensions/install"]);
    assert.equal(JSON.parse(stdout.text()).source, "verified-cache");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("offline cache misses fail explicitly without contacting the platform", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-cache-miss-"));
  try {
    let calls = 0;
    const stderr = capture();
    const exitCode = await runCli([
      "install", "fixture-extension", "--platform", "http://127.0.0.1:3030",
      "--scope", "project", "--project", "demo-project", "--offline", "--version", "1.2.3", "--json",
    ], {
      cacheRoot: join(root, "product-cache"),
      stderr,
      stdout: capture(),
      fetchImpl: async () => { calls += 1; throw new Error("network must not be used for an offline cache miss"); },
    });
    assert.equal(exitCode, 3);
    assert.equal(JSON.parse(stderr.text()).error.code, "CACHE_ARTIFACT_MISSING");
    assert.equal(calls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an ingress 413 HTML error maps to a stable upload-limit error instead of an invalid-response error", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-upload-rejected-"));
  try {
    const archivePath = join(root, "fixture.aicxt");
    await writeFile(archivePath, createAicxt());
    const stderr = capture();
    const exitCode = await runCli([
      "install", "fixture-extension", "--file", archivePath,
      "--platform", "http://127.0.0.1:3030", "--scope", "project", "--project", "demo-project", "--json",
    ], {
      cacheRoot: join(root, "product-cache"),
      stdout: capture(),
      stderr,
      fetchImpl: async () => new Response("<html>request too large</html>", { status: 413, headers: { "content-type": "text/html" } }),
    });

    assert.equal(exitCode, 4);
    assert.equal(JSON.parse(stderr.text()).error.code, "PLATFORM_UPLOAD_TOO_LARGE");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("status returns Ticket 02 stage and per-runtime target details", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-status-"));
  try {
    const operationId = "ticket03-status-operation";
    const cacheRoot = join(root, "product-cache");
    await saveOperationFixture(cacheRoot, operationId, "c".repeat(64));
    const stdout = capture();
    const stderr = capture();
    const exitCode = await runCli(["status", "--operation", operationId, "--json"], {
      cacheRoot,
      fetchImpl: async (_url, init) => {
        assert.equal(JSON.parse(init.body).action, "query-status");
        return jsonResponse(operation(operationId, "succeeded", identity("c".repeat(64))));
      },
      stdout,
      stderr,
    });

    assert.equal(exitCode, 0, stderr.text());
    const status = JSON.parse(stdout.text());
    assert.equal(status.stages[0].phase, "package-install");
    assert.equal(status.targets.main.status, "verified");
    assert.equal(status.targets["workflow-test"].status, "verified");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remote install resolves catalog identity, verifies the artifact, then uploads that same pinned archive", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-remote-install-"));
  try {
    const archive = createAicxt();
    const hash = createHash("sha256").update(archive).digest("hex");
    const catalogUrl = "https://catalog.example.invalid/catalog.json";
    const artifactUrl = "https://github.com/jason23452/agent-system-extensions/releases/download/fixture-v1.2.3/fixture-extension-1.2.3.aicxt";
    const catalog = {
      contractVersion: "1.0.0",
      extensions: [{
        extensionId: "fixture-extension",
        latestVersion: "1.2.3",
        releases: [{
          artifact: { sha256: hash, sizeBytes: archive.byteLength, url: artifactUrl },
          contractVersion: "1.0.0",
          extensionId: "fixture-extension",
          hostRequirements: { minHostVersion: "0.0.0" },
          schemaVersion: "agent-system.extension-release.v1",
          version: "1.2.3",
        }],
      }],
      schemaVersion: "agent-system.extension-catalog.v1",
    };
    const calls = [];
    const operationId = "ticket03-remote-install";
    const stdout = capture();
    const stderr = capture();
    const exitCode = await runCli([
      "install", "fixture-extension", "--catalog-url", catalogUrl,
      "--platform", "http://127.0.0.1:3030", "--scope", "project", "--project", "demo-project", "--json",
    ], {
      cacheRoot: join(root, "product-cache"),
      randomUUID: () => operationId,
      stdout,
      stderr,
      fetchImpl: async (url, init) => {
        calls.push(String(url));
        if (String(url) === catalogUrl) return jsonResponse(catalog);
        if (String(url) === artifactUrl) return binaryResponse(archive);
        assert.equal(String(url), "http://127.0.0.1:3030/bff/extensions/install");
        assert.equal(init.body.get("expectedExtensionId"), "fixture-extension");
        assert.equal(init.body.get("expectedVersion"), "1.2.3");
        assert.equal(init.body.get("expectedPackageSha256"), hash);
        assert.deepEqual(Buffer.from(await init.body.get("file").arrayBuffer()), archive);
        return jsonResponse({ operation: operation(operationId, "succeeded", identity(hash)) });
      },
    });

    assert.equal(exitCode, 0, stderr.text());
    assert.deepEqual(calls, [catalogUrl, artifactUrl, "http://127.0.0.1:3030/bff/extensions/install"]);
    assert.equal(JSON.parse(stdout.text()).source, "github");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remote artifact integrity failure never falls back to another version or installs", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-remote-corrupt-"));
  try {
    const archive = createAicxt();
    const wrongHash = "0".repeat(64);
    const catalogUrl = "https://catalog.example.invalid/catalog.json";
    const artifactUrl = "https://github.com/jason23452/agent-system-extensions/releases/download/fixture-v1.2.3/fixture-extension-1.2.3.aicxt";
    const catalog = {
      contractVersion: "1.0.0",
      extensions: [{
        extensionId: "fixture-extension",
        latestVersion: "1.2.3",
        releases: [{
          artifact: { sha256: wrongHash, sizeBytes: archive.byteLength, url: artifactUrl },
          contractVersion: "1.0.0",
          extensionId: "fixture-extension",
          hostRequirements: { minHostVersion: "0.0.0" },
          schemaVersion: "agent-system.extension-release.v1",
          version: "1.2.3",
        }],
      }],
      schemaVersion: "agent-system.extension-catalog.v1",
    };
    const calls = [];
    const stderr = capture();
    const exitCode = await runCli([
      "install", "fixture-extension", "--catalog-url", catalogUrl,
      "--platform", "http://127.0.0.1:3030", "--scope", "project", "--project", "demo-project", "--json",
    ], {
      cacheRoot: join(root, "product-cache"),
      stderr,
      stdout: capture(),
      fetchImpl: async (url) => {
        calls.push(String(url));
        return String(url) === catalogUrl ? jsonResponse(catalog) : binaryResponse(archive);
      },
    });

    assert.equal(exitCode, 3);
    assert.equal(JSON.parse(stderr.text()).error.code, "ARTIFACT_HASH_MISMATCH");
    assert.deepEqual(calls, [catalogUrl, artifactUrl]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retry queries the saved pinned operation before resuming and preserves the target identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-retry-"));
  try {
    const archiveHash = "a".repeat(64);
    const operationId = "ticket03-retry-operation";
    const cacheRoot = join(root, "product-cache");
    await saveOperationFixture(cacheRoot, operationId, archiveHash);
    const requests = [];
    let queryCount = 0;
    const stdout = capture();
    const stderr = capture();

    const exitCode = await runCli(["retry", "--operation", operationId, "--json"], {
      cacheRoot,
      fetchImpl: async (url, init) => {
        const body = JSON.parse(init.body);
        requests.push({ url: String(url), body });
        assert.deepEqual(body.identity, identity(archiveHash));
        assert.equal(body.operationId, operationId);
        if (body.action === "query-status") {
          queryCount += 1;
          return jsonResponse(operation(operationId, "failed", identity(archiveHash), "resume"));
        }
        return jsonResponse(operation(operationId, "succeeded", identity(archiveHash)));
      },
      stdout,
      stderr,
    });

    assert.equal(exitCode, 0, stderr.text());
    assert.deepEqual(requests.map((item) => item.body.action), ["query-status", "resume"]);
    assert.equal(queryCount, 1);
    assert.deepEqual(requests.map((item) => item.url), [
      "http://127.0.0.1:3030/agent-system/bff/extensions/install/retry",
      "http://127.0.0.1:3030/agent-system/bff/extensions/install/retry",
    ]);
    assert.equal(JSON.parse(stdout.text()).status, "succeeded");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unknown operation status remains query-first and never blindly resumes", async () => {
  const root = await mkdtemp(join(tmpdir(), "extension-cli-unknown-"));
  try {
    const operationId = "ticket03-unknown-operation";
    const cacheRoot = join(root, "product-cache");
    await saveOperationFixture(cacheRoot, operationId, "b".repeat(64));
    const actions = [];
    const stdout = capture();
    const stderr = capture();
    const exitCode = await runCli(["retry", "--operation", operationId, "--json"], {
      cacheRoot,
      fetchImpl: async (_url, init) => {
        actions.push(JSON.parse(init.body).action);
        return jsonResponse(operation(operationId, "unknown", identity("b".repeat(64)), "query-first"));
      },
      stdout,
      stderr,
    });

    assert.equal(exitCode, 5);
    assert.deepEqual(actions, ["query-status"]);
    assert.equal(JSON.parse(stdout.text()).retryAction, "query-first");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function identity(packageSha256) {
  return { extensionId: "fixture-extension", packageSha256, project: "demo-project", scope: "project", version: "1.2.3" };
}

function operation(operationId, status, operationIdentity, retryAction = "none") {
  return {
    completed: status === "succeeded",
    identity: operationIdentity,
    operationId,
    phase: status === "succeeded" ? "completed" : "lifecycle-install",
    retryAction,
    schemaVersion: "agent-system.extension-install-operation.v1",
    stages: [{ attempt: 1, phase: "package-install", status: "succeeded" }],
    status,
    targets: {
      main: { catalogEntries: 1, status: "verified" },
      "workflow-test": { catalogEntries: 1, status: "verified" },
    },
  };
}

async function saveOperationFixture(cacheRoot, operationId, packageSha256) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(cacheRoot, "operations"), { recursive: true });
  await writeFile(join(cacheRoot, "operations", `${operationId}.json`), `${JSON.stringify({
    identity: identity(packageSha256),
    operationId,
    platformUrl: "http://127.0.0.1:3030/agent-system",
    schemaVersion: "agent-system.extension-install-operation-retry.v1",
  })}\n`);
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function binaryResponse(value) {
  return new Response(value, { headers: { "content-type": "application/octet-stream" } });
}

function capture() {
  const chunks = [];
  return { write: (chunk) => chunks.push(String(chunk)), text: () => chunks.join("") };
}
