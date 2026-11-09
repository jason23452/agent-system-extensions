import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Open Design package declares canonical identity and its legacy alias", async () => {
  const manifest = JSON.parse(await readFile(new URL("../source/extension.json", import.meta.url), "utf8"));
  assert.equal(manifest.extensionId, "open-design");
  assert.equal(manifest.metadata.canonicalId, "open-design");
  assert.deepEqual(manifest.metadata.aliases, ["opendesign"]);
});
