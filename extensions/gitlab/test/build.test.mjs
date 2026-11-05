import assert from "node:assert/strict";
import test from "node:test";
import { createExtensionArchive } from "../build.mjs";

test("the GitLab builder emits a self-contained 2.0.0 .aicxt with matching source-sync metadata", async () => {
  const { archive, files, manifest } = await createExtensionArchive();
  const entries = readStoredZipEntries(archive);
  const source = [...files.entries()].map(([path, content]) => [path, content.toString("utf8")]);

  assert.equal(manifest.extensionId, "gitlab");
  assert.equal(manifest.version, "2.0.0");
  assert.equal(manifest.scope, "project");
  assert.equal(manifest.workflowNodes, undefined);
  assert.equal(manifest.backend.lifecycle, undefined);
  assert.equal(manifest.hostContract.settings.properties.sourceUrl.type, "string");
  assert.deepEqual(manifest.resources.plugins[0].files, ["plugins/gitlab/gitlab.ts", "plugins/gitlab/selector.js"]);
  assert.deepEqual(manifest.pluginContributions, [{
    pluginName: "gitlab",
    contributions: [{ kind: "tool", name: "gitlab_select_skill" }],
  }]);
  assert.equal(entries.get("extension.json").toString("utf8").includes('"version": "2.0.0"'), true);
  assert.equal(entries.has("backend/entry.js"), true);
  assert.equal(entries.has("frontend/entry.js"), true);
  assert.equal(entries.has("plugins/gitlab.ts"), true);
  assert.equal(entries.has("plugins/gitlab/gitlab.ts"), true);
  assert.equal(entries.has("plugins/gitlab/selector.js"), true);
  assert.equal(source.some(([path, content]) => path === "backend/entry.js" && (content.includes("GITLAB_SKILLS_REPOSITORY") || content.includes("192.168.1.104"))), false);
});

function readStoredZipEntries(archive) {
  const files = new Map();
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const flags = archive.readUInt16LE(offset + 6);
    const method = archive.readUInt16LE(offset + 8);
    const size = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameOffset = offset + 30;
    const name = archive.toString("utf8", nameOffset, nameOffset + nameLength);
    const contentOffset = nameOffset + nameLength + extraLength;
    assert.equal(flags & 0x0800, 0x0800);
    assert.equal(method, 0);
    files.set(name, archive.subarray(contentOffset, contentOffset + size));
    offset = contentOffset + size;
  }
  assert.equal(archive.readUInt32LE(offset), 0x02014b50);
  return files;
}
