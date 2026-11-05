import assert from "node:assert/strict";
import test from "node:test";
import { sourceSyncPresentation } from "../frontend/entry.js";

test("partial readiness failure reports applied targets and keeps failed-stage retry visible", () => {
  const presentation = sourceSyncPresentation({
    operation: {
      candidateRevision: "revision-candidate",
      retryAction: "resume",
      sourceUrl: "http://127.0.0.1:41001/project.git",
      status: "failed",
    },
    source: { desiredUrl: "http://127.0.0.1:41001/project.git", status: "configured" },
    targets: {
      main: {
        appliedRevision: "revision-candidate",
        appliedSourceUrl: "http://127.0.0.1:41001/project.git",
        readiness: "ready",
      },
      "workflow-test": {
        appliedRevision: "revision-candidate",
        appliedSourceUrl: "http://127.0.0.1:41001/project.git",
        readiness: "not-ready",
      },
    },
  });

  assert.equal(presentation.retryAction, "resume");
  assert.equal(presentation.retryVisible, true);
  assert.match(presentation.message, /部分失敗/);
  assert.match(presentation.message, /Main runtime.*已套用.*ready/);
  assert.match(presentation.message, /Workflow-test runtime.*已套用.*not-ready/);
  assert.doesNotMatch(presentation.message, /既有已套用內容保留|已回滾/);
});

test("candidate preparation failure does not imply that a failed target kept old content", () => {
  const presentation = sourceSyncPresentation({
    operation: {
      retryAction: "resume",
      sourceUrl: "http://127.0.0.1:41001/project.git",
      status: "failed",
    },
    source: { desiredUrl: "http://127.0.0.1:41001/project.git", status: "configured" },
    targets: {
      main: { appliedRevision: "old-main", appliedSourceUrl: "http://127.0.0.1:41001/old.git", readiness: "ready" },
      "workflow-test": { appliedRevision: "old-workflow", appliedSourceUrl: "http://127.0.0.1:41001/old.git", readiness: "ready" },
    },
  });

  assert.equal(presentation.retryAction, "resume");
  assert.equal(presentation.retryVisible, true);
  assert.match(presentation.message, /候選 clone／驗證階段/);
  assert.match(presentation.message, /未進入 target 套用/);
  assert.doesNotMatch(presentation.message, /既有已套用內容保留/);
});

test("a target without the candidate receipt is identified without claiming its content was preserved", () => {
  const presentation = sourceSyncPresentation({
    operation: {
      candidateRevision: "revision-candidate",
      retryAction: "resume",
      sourceUrl: "http://127.0.0.1:41001/project.git",
      status: "failed",
    },
    source: { desiredUrl: "http://127.0.0.1:41001/project.git", status: "configured" },
    targets: {
      main: {
        appliedRevision: "revision-candidate",
        appliedSourceUrl: "http://127.0.0.1:41001/project.git",
        readiness: "ready",
      },
      "workflow-test": {
        appliedRevision: "previous-revision",
        appliedSourceUrl: "http://127.0.0.1:41001/previous.git",
        readiness: "not-ready",
      },
    },
  });

  assert.equal(presentation.retryAction, "resume");
  assert.match(presentation.message, /Main runtime 已套用候選/);
  assert.match(presentation.message, /Workflow-test runtime 尚未確認套用此候選/);
  assert.match(presentation.message, /目前 receipt revision previous-revision/);
  assert.doesNotMatch(presentation.message, /Workflow-test.*內容保留|既有已套用內容保留/);
});
