import assert from "node:assert/strict";
import test from "node:test";
import { activate } from "../backend/entry.js";

const request = (method, path, body = {}) => ({ body, headers: {}, method, path, query: { project: "demo", scope: "project" } });

test("GitLab installs without cloning and reports an unconfigured Project as pending", async () => {
  const calls = [];
  let reads = 0;
  const backend = await activate();
  const host = {
    scope: "project",
    project: "demo",
    readSettings: async () => { reads += 1; return {}; },
    sourceSync: {
      readStatus: async (input) => { calls.push(["status", input]); return { source: { desiredUrl: null, status: "not-configured" } }; },
      synchronize: async () => { calls.push(["sync"]); throw new Error("unexpected sync"); },
      retry: async () => { calls.push(["retry"]); throw new Error("unexpected retry"); },
    },
  };

  const installResult = await backend.handle({ host, request: request("POST", "install-skills") });
  const state = await backend.handle({ host, request: request("GET", "source-sync/status") });

  assert.equal(installResult.status, 404);
  assert.deepEqual(state.body.source, { desiredUrl: null, status: "not-configured" });
  assert.equal(reads, 1);
  assert.deepEqual(calls, [["status", { desiredUrl: null }]]);
});

test("only an explicit sync clones the saved Project URL snapshot", async () => {
  const calls = [];
  let settingsReads = 0;
  const backend = await activate();
  const host = {
    scope: "project",
    project: "demo",
    readSettings: async () => {
      settingsReads += 1;
      return { sourceUrl: "http://127.0.0.1:18111/skills.git" };
    },
    sourceSync: {
      synchronize: async (input) => {
        calls.push(["sync", input.sourceUrl, typeof input.prepare]);
        return { operation: { sourceUrl: input.sourceUrl, status: "running" } };
      },
    },
  };

  const result = await backend.handle({ host, request: request("POST", "source-sync/sync") });

  assert.equal(settingsReads, 1);
  assert.deepEqual(calls, [["sync", "http://127.0.0.1:18111/skills.git", "function"]]);
  assert.deepEqual(result.body.operation, { sourceUrl: "http://127.0.0.1:18111/skills.git", status: "running" });
});

test("an unconfigured Project cannot trigger a clone and retry forwards its saved operation identity", async () => {
  const retryCalls = [];
  const backend = await activate();
  const host = {
    scope: "project",
    project: "demo",
    readSettings: async () => ({}),
    sourceSync: {
      synchronize: async () => { throw new Error("unexpected clone"); },
      retry: async (input) => {
        retryCalls.push({ action: input.action, operationId: input.operationId, hasPrepare: typeof input.prepare === "function" });
        return { operation: { operationId: input.operationId, status: "unknown" } };
      },
    },
  };

  await assert.rejects(() => backend.handle({ host, request: request("POST", "source-sync/sync") }), /URL/i);
  const result = await backend.handle({ host, request: request("POST", "source-sync/retry", { action: "query-status", operationId: "sync-1" }) });

  assert.deepEqual(result.body.operation, { operationId: "sync-1", status: "unknown" });
  assert.deepEqual(retryCalls, [{ action: "query-status", operationId: "sync-1", hasPrepare: true }]);
});
