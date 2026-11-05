const STYLE = `.gitlab-source{display:grid;gap:18px;max-width:760px;margin:0 auto;padding:24px;color:var(--foreground,#172033);font:14px/1.5 ui-sans-serif,system-ui,sans-serif}.gitlab-source h1,.gitlab-source p{margin:0}.gitlab-source h1{font-size:22px}.gitlab-card{display:grid;gap:12px;border:1px solid var(--border,#dfe4ec);border-radius:12px;background:var(--card,#fff);padding:18px}.gitlab-field{display:grid;gap:6px}.gitlab-field input{min-height:42px;border:1px solid var(--border,#cbd5e1);border-radius:8px;padding:0 12px;background:var(--background,#fff);color:inherit;font:inherit}.gitlab-actions{display:flex;flex-wrap:wrap;gap:8px}.gitlab-actions button{min-height:40px;border:0;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer;padding:0 14px;font:600 13px/1 inherit}.gitlab-actions button.secondary{background:#475467}.gitlab-actions button.danger{background:#b42318}.gitlab-actions button:disabled{cursor:not-allowed;opacity:.55}.gitlab-note,.gitlab-target small{color:var(--muted-foreground,#687386)}.gitlab-status{min-height:22px;color:var(--muted-foreground,#687386)}.gitlab-status[data-kind=error]{color:#b42318}.gitlab-status[data-kind=success]{color:#067647}.gitlab-targets{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}.gitlab-target{display:grid;gap:5px;padding:12px;border:1px solid var(--border,#dfe4ec);border-radius:9px}.gitlab-target strong{font-size:13px}.gitlab-target span{overflow-wrap:anywhere}.gitlab-changes{display:grid;gap:4px;padding-left:20px}.gitlab-hidden{display:none!important}`;

export async function activate(host) {
  return {
    extensionId: "gitlab",
    version: "2.0.0",
    editor: { mount(container) { return mount(host, container); } },
  };
}

export async function deactivate() {}

function mount(host, container) {
  const style = document.createElement("style");
  style.textContent = STYLE;
  const root = document.createElement("section");
  root.className = "gitlab-source";
  root.setAttribute("aria-label", "GitLab Skills Project source synchronization");
  root.innerHTML = `<h1>GitLab Skills</h1><p>每個 Project 可選擇自己的 GitLab repository。儲存或清除來源不會下載內容；只有按下「立即同步」才會 clone 並套用到兩個 runtime。</p><section class="gitlab-card"><label class="gitlab-field"><strong for="gitlab-source-url">Project clone URL</strong><input id="gitlab-source-url" type="url" autocomplete="url" spellcheck="false" placeholder="https://gitlab.example/group/project.git" aria-describedby="gitlab-url-note"></label><p id="gitlab-url-note" class="gitlab-note">僅支援 HTTP(S) URL；不可在 URL 中嵌入帳密、query 或 fragment。</p><div class="gitlab-actions"><button type="button" data-save>儲存 URL</button><button type="button" class="secondary" data-clear>清除 URL</button><button type="button" data-sync>立即同步</button><button type="button" class="secondary gitlab-hidden" data-retry>查詢／重試</button></div><p class="gitlab-status" data-status role="status" aria-live="polite">正在讀取 Project 設定與同步狀態。</p></section><section class="gitlab-card"><strong>來源狀態</strong><p data-source>尚未讀取</p><div class="gitlab-targets"><div class="gitlab-target"><strong>Main runtime</strong><span data-target="main">尚未讀取</span></div><div class="gitlab-target"><strong>Workflow-test runtime</strong><span data-target="workflow-test">尚未讀取</span></div></div><div data-changes></div></section>`;
  container.replaceChildren(style, root);

  const input = root.querySelector("#gitlab-source-url");
  const status = root.querySelector("[data-status]");
  const saveButton = root.querySelector("[data-save]");
  const clearButton = root.querySelector("[data-clear]");
  const syncButton = root.querySelector("[data-sync]");
  const retryButton = root.querySelector("[data-retry]");
  const sourceStatus = root.querySelector("[data-source]");
  const changes = root.querySelector("[data-changes]");
  const controller = new AbortController();
  const signal = controller.signal;
  let settings = {};
  let sourceState;
  let busy = false;
  let destroyed = false;

  const showStatus = (message, kind = "") => {
    if (destroyed) return;
    status.textContent = message;
    status.dataset.kind = kind;
  };
  const setBusy = (value) => {
    busy = value;
    for (const button of [saveButton, clearButton, syncButton, retryButton]) button.disabled = value;
  };
  const call = (path, method = "GET", body) => host.api.callExtensionBackend(path, {
    method,
    scope: "project",
    ...(body === undefined ? {} : { body }),
  });

  const refresh = async (message) => {
    try {
      settings = await host.api.readExtensionSettings("project");
      input.value = typeof settings.sourceUrl === "string" ? settings.sourceUrl : "";
      sourceState = await call("source-sync/status");
      renderState(sourceState, sourceStatus, root, changes, retryButton);
      if (message) showStatus(message, "success");
      else showStatus(defaultStatusMessage(sourceState));
    } catch (error) {
      showStatus(readableError(error), "error");
    }
  };

  const save = async () => {
    if (busy) return;
    let sourceUrl;
    try { sourceUrl = validateSourceUrl(input.value); }
    catch (error) { showStatus(error.message, "error"); return; }
    setBusy(true);
    try {
      settings = await host.api.writeExtensionSettings({ ...settings, sourceUrl }, "project");
      await refresh("URL 已儲存；尚未啟動 clone。按「立即同步」才會套用來源內容。");
    } catch (error) { showStatus(readableError(error), "error"); }
    finally { setBusy(false); }
  };

  const clear = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = { ...settings };
      delete next.sourceUrl;
      settings = await host.api.writeExtensionSettings(next, "project");
      input.value = "";
      await refresh("已清除此 Project 的來源設定；既有 Skills、已套用來源與 revision 均保留。");
    } catch (error) { showStatus(readableError(error), "error"); }
    finally { setBusy(false); }
  };

  const synchronize = async () => {
    if (busy) return;
    if (input.value.trim() !== String(settings.sourceUrl ?? "")) {
      showStatus("表單 URL 尚未儲存；請先儲存，再執行同步。", "error");
      return;
    }
    if (!settings.sourceUrl) {
      showStatus("尚未設定 Project clone URL。", "error");
      return;
    }
    setBusy(true);
    showStatus("正在 clone、檢查候選 Skills，完成驗證後才會套用。請稍候。");
    try {
      sourceState = await call("source-sync/sync", "POST", {});
      renderState(sourceState, sourceStatus, root, changes, retryButton);
      showStatus(defaultStatusMessage(sourceState), sourceState.operation?.status === "succeeded" ? "success" : "");
      await refresh();
    } catch (error) { showStatus(readableError(error), "error"); }
    finally { setBusy(false); }
  };

  const retry = async () => {
    if (busy || !sourceState?.operation) return;
    const { operation } = sourceState;
    const action = sourceSyncPresentation(sourceState).retryAction;
    if (!action) return;
    setBusy(true);
    try {
      sourceState = await call("source-sync/retry", "POST", { operationId: operation.operationId, action });
      renderState(sourceState, sourceStatus, root, changes, retryButton);
      showStatus(defaultStatusMessage(sourceState), sourceState.operation?.status === "succeeded" ? "success" : "");
      await refresh();
    } catch (error) { showStatus(readableError(error), "error"); }
    finally { setBusy(false); }
  };

  saveButton.addEventListener("click", save, { signal });
  clearButton.addEventListener("click", clear, { signal });
  syncButton.addEventListener("click", synchronize, { signal });
  retryButton.addEventListener("click", retry, { signal });
  void refresh();
  return {
    destroy() {
      destroyed = true;
      controller.abort();
      container.replaceChildren();
    },
  };
}

function validateSourceUrl(value) {
  if (typeof value !== "string" || value.trim() === "") throw new Error("請輸入 Project clone URL。");
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new Error("Project clone URL 格式無效。"); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error("僅支援不含帳密、query 或 fragment 的 HTTP(S) clone URL。");
  }
  return value.trim();
}

function renderState(state, sourceStatus, root, changes, retryButton) {
  const configured = state.source.status === "configured";
  sourceStatus.textContent = configured
    ? `目前設定來源：${state.source.desiredUrl}`
    : "來源尚未設定；安裝仍可使用，但不會執行 clone。";
  for (const target of ["main", "workflow-test"]) {
    const value = state.targets[target];
    const lines = [
      `Readiness：${value.readiness}`,
      `Applied source：${value.appliedSourceUrl ?? "未知／尚未套用"}`,
      `Revision：${value.appliedRevision ?? "—"}`,
      `Content SHA-256：${value.contentSha256 ?? "—"}`,
    ];
    root.querySelector(`[data-target="${target}"]`).textContent = lines.join(" · ");
  }
  const presentation = sourceSyncPresentation(state);
  retryButton.classList.toggle("gitlab-hidden", !presentation.retryVisible);
  if (!state.changes) {
    changes.replaceChildren();
    return;
  }
  const heading = document.createElement("strong");
  heading.textContent = `候選 revision：${state.changes.candidateRevision}`;
  const list = document.createElement("ul");
  list.className = "gitlab-changes";
  for (const [action, entries] of [["新增", state.changes.added], ["修改", state.changes.modified], ["刪除", state.changes.deleted]]) {
    for (const entry of entries) {
      const item = document.createElement("li");
      item.textContent = `${action} ${entry.kind}: ${entry.name}`;
      list.append(item);
    }
  }
  changes.replaceChildren(heading, list);
}

export function sourceSyncPresentation(state) {
  const operation = state?.operation;
  const retryAction = operation?.retryAction === "query-first"
    ? "query-status"
    : operation?.retryAction === "resume" ? "resume" : undefined;
  const retryVisible = retryAction !== undefined;

  if (operation?.status === "succeeded") {
    return { message: "同步完成；兩個 runtime 的 applied receipt 與 readiness 已分別確認。", retryAction, retryVisible };
  }
  if (operation?.status === "failed") {
    const revision = operation.candidateRevision;
    if (typeof revision !== "string" || revision.length === 0) {
      return {
        message: "同步失敗於候選 clone／驗證階段；本次作業未進入 target 套用。可重試或修改來源後重新同步。",
        retryAction,
        retryVisible,
      };
    }

    const targetLabels = { main: "Main runtime", "workflow-test": "Workflow-test runtime" };
    const applied = [];
    const unconfirmed = [];
    for (const target of ["main", "workflow-test"]) {
      const receipt = state.targets[target];
      if (receipt.appliedRevision === revision && receipt.appliedSourceUrl === operation.sourceUrl) {
        const retryNote = receipt.readiness === "ready" ? "" : "；此 target 尚未 ready，需續跑";
        applied.push(`${targetLabels[target]} 已套用候選 revision ${revision}（readiness ${receipt.readiness}${retryNote}）`);
      } else {
        unconfirmed.push(`${targetLabels[target]} 尚未確認套用此候選（目前 receipt revision ${receipt.appliedRevision ?? "未知／尚未套用"}；readiness ${receipt.readiness}）`);
      }
    }
    const parts = [...applied, ...unconfirmed].join("；");
    const headline = applied.length > 0 ? "同步部分失敗" : "同步失敗；尚無 target receipt 可確認候選已套用";
    return {
      message: `${headline}；候選 revision ${revision}：${parts}。可重試失敗階段或修改來源後重新同步。`,
      retryAction,
      retryVisible,
    };
  }
  if (operation?.status === "unknown") return { message: "同步結果未知；請先查詢狀態，不會盲目重做。", retryAction, retryVisible };
  if (operation?.status === "running") return { message: "同步作業進行中。", retryAction, retryVisible };
  return {
    message: state?.source?.status === "configured" ? "來源已設定；尚未同步或同步內容尚未全部就緒。" : "來源待設定。儲存 URL 不會啟動 clone。",
    retryAction,
    retryVisible,
  };
}

function defaultStatusMessage(state) {
  return sourceSyncPresentation(state).message;
}

function readableError(error) {
  return error instanceof Error ? error.message : "GitLab Skill 操作失敗。";
}
