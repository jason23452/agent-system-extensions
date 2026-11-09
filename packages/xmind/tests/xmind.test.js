import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fixtureArchive, manifestFor } from "../../../test-support/fixtures.js";

test("XMind opens content.json, falls back to content.xml, and preserves invalid input", async () => {
  const { default: converter } = await import("../builder-tools/xmind-to-markdown.ts");
  const root = await mkdtemp(join(tmpdir(), "xmind-package-conversion-test-"));
  const jsonInput = join(root, "map.xmind");
  const xmlInput = join(root, "fallback.xmind");
  const invalidInput = join(root, "invalid.xmind");
  try {
    await writeFile(jsonInput, fixtureArchive(manifestFor(), [{
      name: "content.json",
      content: JSON.stringify([{ title: "Planning", rootTopic: { title: "Project", children: [{ title: "Release" }] } }]),
    }]));
    await writeFile(xmlInput, fixtureArchive(manifestFor(), [{
      name: "content.xml",
      content: "<sheet><title>Fallback</title><topic><title>Root</title><topics><topic><title>Child</title></topic></topics></topic></sheet>",
    }]));
    await writeFile(invalidInput, fixtureArchive(manifestFor(), [{ name: "metadata.json", content: "{}" }]));

    const converted = await converter.execute({ filePath: "map.xmind" }, { directory: root });
    assert.match(await readFile(join(root, "map.md"), "utf8"), /# Planning[\s\S]*- Project[\s\S]*- Release/);
    assert.equal(converted.metadata.output, "map.md");
    await converter.execute({ filePath: "fallback.xmind" }, { directory: root });
    assert.match(await readFile(join(root, "fallback.md"), "utf8"), /# Fallback[\s\S]*- Root[\s\S]*- Child/);

    const original = await readFile(invalidInput);
    await assert.rejects(() => converter.execute({ filePath: "invalid.xmind" }, { directory: root }), /缺少 content\.json 或 content\.xml/);
    assert.deepEqual(await readFile(invalidInput), original);
    await assert.rejects(() => converter.execute({ filePath: "../outside.xmind" }, { directory: root }), /Project/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("XMind conversion and editing enforce their archive size limits", async () => {
  const { default: converter } = await import("../builder-tools/xmind-to-markdown.ts");
  const { default: editor } = await import("../builder-tools/xmind-edit.ts");
  const root = await mkdtemp(join(tmpdir(), "xmind-package-size-test-"));
  const oversized = join(root, "oversized.xmind");
  try {
    await writeFile(oversized, Buffer.alloc(25 * 1024 * 1024 + 1));
    await assert.rejects(() => converter.execute({ filePath: "oversized.xmind" }, { directory: root }), /25MB/);
    await assert.rejects(() => editor.execute({ filePath: "oversized.xmind", mode: "read" }, { directory: root }), /25MB/);
    const source = await readFile(new URL("../builder-tools/xmind-edit.ts", import.meta.url), "utf8");
    assert.match(source, /MAX_UNCOMPRESSED_BYTES\s*=\s*50\s*\*\s*1024\s*\*\s*1024/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
