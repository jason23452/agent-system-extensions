const SETTINGS_KEY = "gitlab";

export async function activate(host) {
  return {
    extensionId: "gitlab",
    version: "2.0.0",
    capabilities: ["gitlab.project-skills", "gitlab_select_skill"],
    editor: { mount(container, context) { return mount(host, container, context); } },
  };
}

export async function saveGitLabRepositoryUrl(host, value) {
  if (typeof value !== "string") throw new Error("GitLab repository URL must be text.");
  const settings = await readProjectSettings(host);
  const current = isRecord(settings[SETTINGS_KEY]) ? settings[SETTINGS_KEY] : {};
  settings[SETTINGS_KEY] = { ...current, repositoryUrl: value.trim() };
  await host.api.writeExtensionSettings(settings, "project");
  return settings[SETTINGS_KEY].repositoryUrl;
}

export async function syncSavedGitLabSkills(host) {
  const settings = await readProjectSettings(host);
  const gitlab = isRecord(settings[SETTINGS_KEY]) ? settings[SETTINGS_KEY] : {};
  const repositoryUrl = typeof gitlab.repositoryUrl === "string" ? gitlab.repositoryUrl.trim() : "";
  if (!repositoryUrl) return { project: "", status: "source-not-configured", message: "請先儲存 GitLab Skills repository URL。" };
  return host.api.callExtensionBackend("sync-skills", { body: { repositoryUrl }, method: "POST", scope: "project" });
}

function mount(host, container, context) {
  const root = document.createElement("section");
  root.className = "gitlab-extension-settings";
  root.setAttribute("aria-label", "GitLab Skills 設定");
  root.innerHTML = `
    <style>
      .gitlab-extension-settings{display:grid;gap:12px;max-width:760px;padding:20px;color:var(--foreground,#172033);font:14px/1.5 system-ui,sans-serif}
      .gitlab-extension-settings h2,.gitlab-extension-settings p{margin:0}
      .gitlab-extension-settings label{display:grid;gap:5px;font-size:12px;font-weight:650}
      .gitlab-extension-settings input{min-height:38px;box-sizing:border-box;border:1px solid var(--border,#dfe4ec);border-radius:8px;background:var(--background,#fff);color:var(--foreground,#172033);padding:8px 10px;font:inherit}
      .gitlab-extension-settings .actions{display:flex;flex-wrap:wrap;gap:8px}
      .gitlab-extension-settings button{min-height:36px;border:0;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer;padding:0 12px;font:600 12px system-ui,sans-serif}
      .gitlab-extension-settings button.secondary{border:1px solid var(--border,#dfe4ec);background:var(--background,#fff);color:var(--foreground,#172033)}
      .gitlab-extension-settings button:disabled{cursor:not-allowed;opacity:.55}
      .gitlab-extension-settings [data-status]{min-height:20px;color:var(--muted-foreground,#687386);font-size:12px}
    </style>
    <h2>GitLab Skills 來源</h2>
    <p>設定目前 Project 專用的 GitLab clone URL。儲存設定不會 clone；只有按下「同步 Skills」才會驗證來源並更新 main 與 workflow-test。清空並儲存 URL 會停止後續同步，但保留既有 Skills。</p>
    <label>Project repository URL<input data-repository-url type="url" autocomplete="url" placeholder="https://gitlab.example/group/skills.git"></label>
    <div class="actions"><button data-save type="button">儲存 URL</button><button class="secondary" data-sync type="button" disabled>同步 Skills</button></div>
    <p data-status role="status" aria-live="polite">載入 ${escapeHtml(context?.projectName || "目前 Project")} 的設定…</p>
  `;
  container.replaceChildren(root);
  const input = root.querySelector("[data-repository-url]");
  const saveButton = root.querySelector("[data-save]");
  const syncButton = root.querySelector("[data-sync]");
  const status = root.querySelector("[data-status]");
  let savedUrl = "";
  let disposed = false;
  const refreshSyncButton = () => { syncButton.disabled = !savedUrl || input.value.trim() !== savedUrl; };
  const onInput = () => refreshSyncButton();
  const onSave = async () => {
    saveButton.disabled = true;
    status.textContent = "正在儲存 Project 設定…";
    try {
      savedUrl = await saveGitLabRepositoryUrl(host, input.value);
      status.textContent = savedUrl ? "URL 已儲存；尚未同步 Skills。" : "URL 已清空；既有 Skills 與同步內容保留。";
      refreshSyncButton();
    } catch (error) {
      status.textContent = errorMessage(error);
    } finally {
      saveButton.disabled = false;
    }
  };
  const onSync = async () => {
    syncButton.disabled = true;
    status.textContent = "正在 clone 並驗證候選 Skills…";
    try {
      status.textContent = formatSyncResult(await syncSavedGitLabSkills(host));
    } catch (error) {
      status.textContent = errorMessage(error);
    } finally {
      if (!disposed) refreshSyncButton();
    }
  };
  input.addEventListener("input", onInput);
  saveButton.addEventListener("click", onSave);
  syncButton.addEventListener("click", onSync);
  void readProjectSettings(host).then((settings) => {
    const gitlab = isRecord(settings[SETTINGS_KEY]) ? settings[SETTINGS_KEY] : {};
    savedUrl = typeof gitlab.repositoryUrl === "string" ? gitlab.repositoryUrl.trim() : "";
    input.value = savedUrl;
    status.textContent = savedUrl ? "已載入已儲存的來源；同步需明確按下按鈕。" : "來源待設定；目前不會 clone。";
    refreshSyncButton();
  }).catch((error) => { status.textContent = errorMessage(error); });
  return {
    destroy() {
      disposed = true;
      input.removeEventListener("input", onInput);
      saveButton.removeEventListener("click", onSave);
      syncButton.removeEventListener("click", onSync);
      container.replaceChildren();
    },
  };
}

async function readProjectSettings(host) {
  const settings = await host.api.readExtensionSettings("project");
  return isRecord(settings) ? { ...settings } : {};
}

function formatSyncResult(result) {
  if (result?.status === "synced") return `同步完成：${result.skillCount ?? 0} 個 Skills，revision ${result.revision ?? "unknown"}。`;
  if (result?.status === "partial") return `部分同步：${JSON.stringify(result.targets ?? {})}。可重試失敗的 target。`;
  if (result?.status === "source-not-configured") return "來源待設定；沒有執行 clone。";
  return result?.message || "GitLab Skills 同步失敗；既有內容保留。";
}

function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
