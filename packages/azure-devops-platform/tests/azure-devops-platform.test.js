import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const source = new URL("../source/", import.meta.url);

test("Azure DevOps credentials are encrypted and bound to their Project", async () => {
  const directory = await mkdtemp(join(tmpdir(), "azure-devops-package-test-"));
  const previousKey = process.env.EXTENSION_SECRET_KEY;
  const previousPath = process.env.ADO_CREDENTIAL_STORE_PATH;
  const secretKey = Buffer.alloc(32, 23).toString("hex");
  const token = "synthetic-ado-token-never-persisted-in-plain-text";
  process.env.EXTENSION_SECRET_KEY = secretKey;
  process.env.ADO_CREDENTIAL_STORE_PATH = join(directory, "credentials.json");

  try {
    const manifest = JSON.parse(await readFile(new URL("extension.json", source), "utf8"));
    const configuration = JSON.parse(await readFile(new URL("config/extension.json", source), "utf8"));
    assert.equal(manifest.scope, "project");
    assert.equal(manifest.configuration.entry, "config/extension.json");
    assert.ok(configuration.platforms.some(({ id }) => id === "azure-devops"));
    assert.ok(configuration.deploymentPlatforms.some(({ id }) => id === "azure-devops-pipelines"));

    const { activate } = await import(new URL("backend/entry.js", source));
    const backend = await activate();
    const stored = await backend.handle({ request: {
      method: "POST",
      path: "store-credential",
      body: { organization: "ExampleOrg", project: "TrustedProject", token },
    } });
    assert.deepEqual(stored.body, { organization: "ExampleOrg", project: "TrustedProject", stored: true });

    const persisted = await readFile(process.env.ADO_CREDENTIAL_STORE_PATH, "utf8");
    const store = JSON.parse(persisted);
    assert.equal(store.version, 2);
    assert.equal(store.credentials['["exampleorg","trustedproject"]'].project, "TrustedProject");
    assert.doesNotMatch(persisted, new RegExp(token));

    const makeCredentialRequest = (project) => ({
      method: "POST",
      path: "get-git-credential",
      headers: { "x-extension-secret-key": secretKey },
      extensionContext: { azureDevOps: {
        effectiveContext: { organization: "ExampleOrg" },
        resolvedToolCall: {
          tool: "azure_devops_clone_repository",
          parameters: { organization: "ExampleOrg", project, repositoryName: "sample" },
        },
      } },
    });
    const credential = await backend.handle({ request: makeCredentialRequest("TrustedProject") });
    assert.equal(credential.body.credential, token);
    await assert.rejects(
      () => backend.handle({ request: makeCredentialRequest("AnotherProject") }),
      (error) => error.code === "ADO_CREDENTIAL_NOT_FOUND",
    );
  } finally {
    if (previousKey === undefined) delete process.env.EXTENSION_SECRET_KEY;
    else process.env.EXTENSION_SECRET_KEY = previousKey;
    if (previousPath === undefined) delete process.env.ADO_CREDENTIAL_STORE_PATH;
    else process.env.ADO_CREDENTIAL_STORE_PATH = previousPath;
    await rm(directory, { recursive: true, force: true });
  }
});

test("Azure DevOps verification uses PAT authorization without returning the secret", async () => {
  const previousFetch = globalThis.fetch;
  const token = "synthetic-ado-verification-token";
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), authorization: options.headers.Authorization });
    const pathname = new URL(String(url)).pathname;
    const body = pathname.endsWith("connectionData")
      ? { authenticatedUser: { id: "user-1", providerDisplayName: "Synthetic User" } }
      : pathname.endsWith("/_apis/projects")
        ? { value: [{ id: "project-1", name: "TrustedProject", state: "wellFormed" }] }
        : { id: "user-1", displayName: "Synthetic User", emailAddress: "synthetic@example.invalid" };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const { activate } = await import(new URL("backend/entry.js", source));
    const backend = await activate();
    const result = await backend.handle({ request: {
      method: "POST",
      path: "verify-token",
      body: { organization: "ExampleOrg", token },
    } });
    assert.equal(result.body.valid, true);
    assert.deepEqual(result.body.projects.map(({ name }) => name), ["TrustedProject"]);
    assert.equal(requests.length, 3);
    assert.ok(requests.every(({ authorization }) => authorization === `Basic ${Buffer.from(`:${token}`).toString("base64")}`));
    assert.doesNotMatch(JSON.stringify(result.body), new RegExp(token));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Azure DevOps plugin resolves an active Project and rejects missing context", async () => {
  const { currentOpenCodeProject } = await import(new URL("plugins/azure-devops-platform/agent/context.ts", source));
  assert.equal(currentOpenCodeProject({ project: { name: "trusted-project" }, directory: "/workspace/projects/other" }), "trusted-project");
  assert.equal(currentOpenCodeProject({ directory: "/workflow/projects/workflow-project" }), "workflow-project");
  assert.throws(() => currentOpenCodeProject({}), (error) => error.code === "AZURE_DEVOPS_OPENCODE_PROJECT_REQUIRED");
});
