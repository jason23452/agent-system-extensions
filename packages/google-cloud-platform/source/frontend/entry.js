const STYLE = `.gcp{display:grid;gap:16px;max-width:680px;margin:0 auto;padding:24px;color:var(--foreground,#172033);font:14px/1.5 ui-sans-serif,system-ui,sans-serif}.gcp h1,.gcp p{margin:0}.gcp-card{display:grid;gap:12px;border:1px solid var(--border,#dfe4ec);border-radius:12px;background:var(--card,#fff);padding:18px}.gcp-actions{display:flex;gap:8px}.gcp button{min-height:40px;border:0;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer;padding:0 14px;font:600 13px/1 inherit}.gcp button.secondary{background:#475467}.gcp button:disabled{cursor:not-allowed;opacity:.55}.gcp-status{min-height:22px;color:var(--muted-foreground,#687386)}.gcp-status[data-kind=error]{color:#b42318}.gcp-status[data-kind=success]{color:#067647}.gcp-retry{display:none}.gcp-retry[data-visible=true]{display:inline-flex}`;

export async function activate(host) {
  return {
    extensionId: "google-cloud-platform",
    version: "2.3.7",
    editor: { mount(container) { return mount(host, container); } },
  };
}

export async function deactivate() {}

function mount(host, container) {
  const style = document.createElement("style");
  style.textContent = STYLE;
  const root = document.createElement("section");
  root.className = "gcp";
  root.setAttribute("aria-label", "Google Cloud Platform gcloud CLI");
   root.innerHTML = `<h1>Google Cloud Platform</h1><p>此 Project 使用獨立的 Docker 容器執行 Google Cloud CLI，登入憑證保存在該 Project 專屬的持久化 volume。</p><section class="gcp-card"><strong>Google Cloud CLI 登入</strong><p data-status class="gcp-status" role="status" aria-live="polite">正在檢查 gcloud 登入狀態。</p><div class="gcp-actions"><button data-login type="button">使用 Google 帳戶登入</button><button data-cancel class="secondary" type="button" hidden>取消登入</button><button data-retry class="gcp-retry" type="button" data-visible="false">重試登入</button><button class="secondary" data-logout type="button">登出</button></div><p>授權頁會在 Agent System 的遠端瀏覽器開啟；原頁面會持續確認此 Project 的實際登入結果。</p></section>`;
  container.replaceChildren(style, root);
  const status = root.querySelector("[data-status]");
  const loginButton = root.querySelector("[data-login]");
  const logoutButton = root.querySelector("[data-logout]");
  const retryButton = root.querySelector("[data-retry]");
  const cancelButton = root.querySelector("[data-cancel]");
  let disposed = false;
  let attempt = 0;
  let pollingTimer;
  let popup;
  let pendingBrowserUrl;
  let loginStarted = false;
  let loginRequest;

  const showStatus = (message, kind = "") => {
    if (disposed) return;
    status.textContent = message;
    status.dataset.kind = kind;
  };
  const call = (path, method = "GET") => host.api.callExtensionBackend(path, { method, scope: "project" });
  const setRetry = (visible) => { retryButton.dataset.visible = String(visible); };
  const retry = () => {
    if (pendingBrowserUrl) {
      const entry = window.open(pendingBrowserUrl, "_blank");
      if (entry) { entry.opener = null; popup = entry; setRetry(false); showStatus("等待使用者在遠端瀏覽器完成 Google 授權…"); return; }
    }
    void login();
  };
  const delay = (ms) => new Promise((resolve) => { pollingTimer = window.setTimeout(resolve, ms); });
  const refresh = async () => {
    const refreshAttempt = attempt;
    try {
      const result = await call("status");
      if (disposed || refreshAttempt !== attempt) return;
      if (attempt && result.authenticated) {
        showStatus(`已成功登入 Google Cloud（Project：${result.project}）。`, "success");
        setRetry(false);
        attempt += 1;
        return;
      }
      if (attempt === 0) showStatus(result.authenticated ? `已登入 Google Cloud（Project：${result.project}）。` : `gcloud CLI 已就緒，尚未登入（Project：${result.project}）。`, result.authenticated ? "success" : "");
    } catch {
      if (!disposed && refreshAttempt === attempt && attempt === 0) { showStatus("無法啟動或檢查此 Project 的 gcloud 容器。請確認 Docker 可用且本機 port 8085 未被占用。", "error"); setRetry(true); }
    }
  };
  const login = async () => {
    if (disposed || loginButton.disabled) return;
    const currentAttempt = ++attempt;
    popup = window.open("about:blank", "google-cloud-platform-gcloud-oauth");
    if (popup) { popup.opener = null; popup.document.title = "正在準備 Google 登入"; popup.document.body.textContent = "正在連線至 Agent System 遠端瀏覽器，請稍候…"; }
    loginButton.disabled = true;
    setRetry(false);
    cancelButton.hidden = false;
    showStatus("準備中：正在啟動此 Project 的 gcloud OAuth 登入程序…");
    try {
      loginStarted = true;
      loginRequest = call("login", "POST");
      const result = await loginRequest;
      if (disposed || currentAttempt !== attempt) return;
      const url = new URL(result.browserUrl, window.location.origin);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("invalid browser URL");
      pendingBrowserUrl = url.toString();
      if (popup && !popup.closed) popup.location.replace(url.toString());
      else {
        const opened = window.open(url.toString(), "_blank");
        if (opened) { opened.opener = null; showStatus("已在 Agent System 的遠端瀏覽器開啟 Google 登入。完成授權後，回呼會由 browser-remote 轉送至此 Project 的 gcloud 容器。"); }
        else { showStatus("彈出視窗遭阻擋或已關閉。請按「重試登入」開啟同源授權入口。", "error"); setRetry(true); }
      }
      if (popup && !popup.closed) showStatus("等待使用者在遠端瀏覽器完成 Google 授權…");
      const deadline = Math.min(Number(result.expiresAt) || Date.now() + 5 * 60_000, Date.now() + 5 * 60_000);
      while (!disposed && currentAttempt === attempt && Date.now() < deadline) {
        await delay(2_000);
        if (disposed || currentAttempt !== attempt) return;
        const state = await call("status");
        if (disposed || currentAttempt !== attempt) return;
        if (state.authenticated) { showStatus(`已成功登入 Google Cloud（Project：${state.project}）。`, "success"); setRetry(false); loginStarted = false; attempt += 1; return; }
        if (state.login === "failed" || state.state === "unavailable") throw Object.assign(new Error("login failed"), { code: state.error || "GCP_LOGIN_PROCESS_FAILED", stage: state.stage || "status" });
        if (popup?.closed) { await cancelRemoteLogin(); if (disposed || currentAttempt !== attempt) return; loginStarted = false; showStatus("遠端登入分頁已關閉，登入程序已取消；如需授權請重新開啟登入入口。", "error"); setRetry(true); cancelButton.hidden = true; return; }
      }
      if (disposed || currentAttempt !== attempt) return;
      showStatus("登入逾時：尚未收到此 Project 的授權結果。您可以重試登入。", "error");
      await cancelRemoteLogin();
      loginStarted = false;
      cancelButton.hidden = true;
      setRetry(true);
    } catch (error) {
      if (disposed || currentAttempt !== attempt) return;
      if (popup && !popup.closed) popup.close();
      const code = typeof error?.code === "string" ? error.code : "GCP_LOGIN_SETUP_FAILED";
      const stage = code.includes("CONTAINER") || code.includes("DOCKER") ? "容器準備" : code.includes("BROWSER") ? "遠端瀏覽器建立" : code.includes("CALLBACK") || code.includes("AUTHORIZATION") || code.includes("PROCESS_FAILED") ? "授權回呼" : "登入狀態查詢";
      const message = code === "GCP_LOGIN_BUSY"
        ? "此 Project 已有 Google Cloud 登入正在進行。請等待完成或逾時後再重試。"
        : `登入失敗（${stage}，${code}）。請確認服務可用後重試。`;
      showStatus(message, "error");
      loginStarted = false;
      cancelButton.hidden = true;
      setRetry(true);
    } finally {
      if (!disposed && (currentAttempt === attempt || currentAttempt + 1 === attempt)) loginButton.disabled = false;
    }
  };
  const cancelRemoteLogin = async () => {
    if (!loginStarted) return;
    loginStarted = false;
    try { await loginRequest; } catch { return; }
    try { await call("cancel", "POST"); } catch { /* 清理請求失敗時仍保留取消操作的使用者回饋。 */ }
  };
  const cancel = async () => {
    if (!loginButton.disabled) return;
    attempt += 1;
    window.clearTimeout(pollingTimer);
    if (popup && !popup.closed) popup.close();
    await cancelRemoteLogin();
    cancelButton.hidden = true;
    loginButton.disabled = false;
    showStatus("已取消 Google 登入。", "error");
    setRetry(true);
  };
  const logout = async () => {
    logoutButton.disabled = true;
    try {
      await call("logout", "POST");
      showStatus("已登出 Google Cloud CLI。", "success");
    } catch {
      showStatus("無法登出 Google Cloud CLI。", "error");
    } finally {
      if (!disposed) logoutButton.disabled = false;
    }
  };

  loginButton.addEventListener("click", login);
  retryButton.addEventListener("click", retry);
  cancelButton.addEventListener("click", cancel);
  logoutButton.addEventListener("click", logout);
  void refresh();
  return { destroy() { disposed = true; attempt += 1; window.clearTimeout(pollingTimer); void cancelRemoteLogin(); if (popup && !popup.closed && popup.location.href === "about:blank") popup.close(); loginButton.removeEventListener("click", login); retryButton.removeEventListener("click", retry); cancelButton.removeEventListener("click", cancel); logoutButton.removeEventListener("click", logout); container.replaceChildren(); } };
}
