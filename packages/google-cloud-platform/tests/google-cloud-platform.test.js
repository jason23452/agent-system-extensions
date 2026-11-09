import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GCP keeps Project isolation and denies credential-printing commands", async () => {
  const source = new URL("../source/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("extension.json", source), "utf8"));
  assert.equal(manifest.extensionId, "google-cloud-platform");
  assert.equal(manifest.resources.mcps, undefined);

  const { currentProject } = await import(new URL("plugins/google-cloud-platform/cli.ts", source));
  assert.equal(currentProject({ project: "trusted-project", directory: "/workspace/projects/other" }), "trusted-project");
  assert.equal(currentProject({ directory: "/workflow/projects/workflow-project" }), "workflow-project");

  const { activate } = await import(new URL("backend/entry.js", source));
  const backend = await activate({ project: "trusted-project" });
  await assert.rejects(
    () => backend.handle({ request: {
      method: "POST",
      path: "exec",
      query: { scope: "project", project: "another-project" },
      body: { args: ["projects", "list"] },
    } }),
    (error) => error.code === "GCP_PROJECT_CONTEXT_INVALID",
  );
  await assert.rejects(
    () => backend.handle({ request: {
      method: "POST",
      path: "exec",
      query: { scope: "project", project: "trusted-project" },
      body: { args: ["auth", "print-access-token"] },
    } }),
    (error) => error.code === "GCP_CREDENTIAL_COMMAND_FORBIDDEN",
  );

  const cli = await readFile(new URL("plugins/google-cloud-platform/cli.ts", source), "utf8");
  assert.doesNotMatch(cli, /auth\s+print-access-token|oauth2?|cloud.?run.*mcp/i);
});
