import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { prepareGitLabSource, validateGitLabSourceUrl } from "../backend/entry.js";
import { selectGitLabSkill } from "../plugins/gitlab/selector.js";

const execFile = promisify(execFileCallback);

test("Project source URLs allow explicit HTTP(S) and reject embedded credentials or URL tricks", () => {
  assert.equal(validateGitLabSourceUrl("http://127.0.0.1:8123/repository.git"), "http://127.0.0.1:8123/repository.git");
  assert.equal(validateGitLabSourceUrl("https://git.example.test/group/project.git"), "https://git.example.test/group/project.git");
  for (const value of [
    "file:///tmp/repository",
    "http://user:password@127.0.0.1/repository.git",
    "http://127.0.0.1/repository.git?token=synthetic",
    "http://127.0.0.1/repository.git#fragment",
    "not a URL",
  ]) assert.throws(() => validateGitLabSourceUrl(value), /URL|source/i);
});

test("a real dumb-HTTP Git clone discovers Skills by frontmatter and keeps attachments once", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "extension-gitlab-http-source-"));
  const repo = join(root, "work");
  const bare = join(root, "remote.git");
  const project = join(root, "project");
  await mkdir(join(repo, "catalog", "nested-skill", "references"), { recursive: true });
  await mkdir(join(repo, "catalog", "nested-skill", "child-folder", "deep-skill"), { recursive: true });
  await mkdir(join(repo, "images"), { recursive: true });
  await writeFile(join(repo, "SKILL.md"), "---\nname: root-skill\ndescription: Repository root Skill\n---\nRoot instructions.\n", "utf8");
  await writeFile(join(repo, "guide.md"), "Root attachment.\n", "utf8");
  await writeFile(join(repo, "catalog", "nested-skill", "SKILL.md"), "---\nname: nested-skill\ndescription: Nested Skill\n---\nNested instructions.\n", "utf8");
  await writeFile(join(repo, "catalog", "nested-skill", "references", "setup.md"), "Nested attachment.\n", "utf8");
  await writeFile(join(repo, "catalog", "nested-skill", "child-folder", "deep-skill", "SKILL.md"), "---\nname: deep-skill\n---\nDeep instructions.\n", "utf8");
  await writeFile(join(repo, "catalog", "nested-skill", "child-folder", "deep-skill", "reference.txt"), "Deep attachment.\n", "utf8");
  await writeFile(join(repo, "images", "diagram.bin"), Buffer.from([0, 255, 17, 42]));
  await execFile("git", ["init", "-b", "main", repo]);
  await execFile("git", ["-C", repo, "config", "user.name", "Synthetic Fixture"]);
  await execFile("git", ["-C", repo, "config", "user.email", "fixture@example.invalid"]);
  await execFile("git", ["-C", repo, "add", "."]);
  await execFile("git", ["-C", repo, "commit", "-m", "synthetic Skills"]);
  await execFile("git", ["clone", "--bare", repo, bare]);
  await execFile("git", ["-C", bare, "config", "http.getanyfile", "true"]);
  await execFile("git", ["-C", bare, "update-server-info"]);

  const server = createServer(async (request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const file = resolve(root, `.${requestPath}`);
    if (file !== root && !file.startsWith(`${root}${sep}`)) {
      response.writeHead(400).end();
      return;
    }
    try {
      const content = await readFile(file);
      response.writeHead(200, { "content-length": content.length });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  context.after(async () => {
    await closeServer(server);
    await rm(root, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const sourceUrl = `http://127.0.0.1:${address.port}/remote.git`;
  const candidate = await prepareGitLabSource(sourceUrl);

  assert.match(candidate.revision, /^[a-f0-9]{40,64}$/);
  assert.deepEqual(candidate.skills.map(({ name }) => name), ["deep-skill", "nested-skill", "root-skill"]);
  const rootSkill = candidate.resources.find((resource) => resource.kind === "skills" && resource.name === "root-skill");
  const nestedSkill = candidate.resources.find((resource) => resource.kind === "skills" && resource.name === "nested-skill");
  const deepSkill = candidate.resources.find((resource) => resource.kind === "skills" && resource.name === "deep-skill");
  assert.equal(rootSkill.files["SKILL.md"].toString("utf8").includes("Root instructions."), true);
  assert.equal(rootSkill.files["guide.md"].toString("utf8"), "Root attachment.\n");
  assert.equal(rootSkill.files["images/diagram.bin"].toString("base64"), Buffer.from([0, 255, 17, 42]).toString("base64"));
  assert.equal(nestedSkill.files["references/setup.md"].toString("utf8"), "Nested attachment.\n");
  assert.equal(Object.keys(nestedSkill.files).some((path) => path.includes("deep-skill")), false);
  assert.equal(deepSkill.files["reference.txt"].toString("utf8"), "Deep attachment.\n");
  assert.deepEqual(candidate.pluginContributions[0].contributions.filter(({ kind }) => kind === "skill").map(({ name }) => name), ["deep-skill", "nested-skill", "root-skill"]);

  const actualProject = join(project, ".opencode", "skills");
  for (const skill of candidate.resources.filter(({ kind }) => kind === "skills")) {
    await mkdir(join(actualProject, skill.name), { recursive: true });
    for (const [path, content] of Object.entries(skill.files)) {
      const output = join(actualProject, skill.name, path);
      await mkdir(join(output, ".."), { recursive: true });
      await writeFile(output, content);
    }
  }
  const pluginIndex = candidate.resources.find(({ kind, name }) => kind === "plugins" && name === "gitlab");
  const indexPath = join(project, ".opencode", "plugins", "gitlab", "source-skills.json");
  await mkdir(join(indexPath, ".."), { recursive: true });
  await writeFile(indexPath, pluginIndex.files["source-skills.json"]);
  const selected = await selectGitLabSkill({ skillName: "nested-skill" }, project);
  assert.equal(selected.content, "---\nname: nested-skill\ndescription: Nested Skill\n---\nNested instructions.\n");
  await assert.rejects(() => readFile(join(actualProject, "nested-skill", "child-folder", "deep-skill", "SKILL.md")));
});

test("duplicate frontmatter identities reject the candidate before returning resources", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "extension-gitlab-duplicate-source-"));
  const repo = join(root, "work");
  const bare = join(root, "remote.git");
  await mkdir(join(repo, "one"), { recursive: true });
  await mkdir(join(repo, "two"), { recursive: true });
  for (const folder of ["one", "two"]) {
    await writeFile(join(repo, folder, "SKILL.md"), "---\nname: duplicate-skill\n---\nDuplicate identity.\n", "utf8");
  }
  await execFile("git", ["init", "-b", "main", repo]);
  await execFile("git", ["-C", repo, "config", "user.name", "Synthetic Fixture"]);
  await execFile("git", ["-C", repo, "config", "user.email", "fixture@example.invalid"]);
  await execFile("git", ["-C", repo, "add", "."]);
  await execFile("git", ["-C", repo, "commit", "-m", "duplicate Skills"]);
  await execFile("git", ["clone", "--bare", repo, bare]);
  await execFile("git", ["-C", bare, "config", "http.getanyfile", "true"]);
  await execFile("git", ["-C", bare, "update-server-info"]);
  const server = createServer(async (request, response) => {
    const file = resolve(root, `.${new URL(request.url ?? "/", "http://localhost").pathname}`);
    try {
      const content = await readFile(file);
      response.writeHead(200, { "content-length": content.length }).end(content);
    }
    catch { response.writeHead(404).end(); }
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  context.after(async () => {
    await closeServer(server);
    await rm(root, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await assert.rejects(() => prepareGitLabSource(`http://127.0.0.1:${address.port}/remote.git`), /duplicate/i);
});

function closeServer(server) {
  return new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => error ? rejectPromise(error) : resolvePromise());
    server.closeAllConnections();
  });
}
