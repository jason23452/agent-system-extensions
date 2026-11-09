export async function activate(host) {
  return {
    extensionId: "open-design",
    version: "1.21.2",
    capabilities: ["open-design.daemon", "open-design.mcp", "open-design.workspace"],
    editor: {
      mount(container, context) {
        return mount(host, container, context);
      },
    },
  };
}

function mount(host, container, context) {
  const projectName = typeof context?.projectName === "string" && context.projectName ? context.projectName : "";
  const frame = document.createElement("iframe");
  frame.title = "Open Design workspace";
  frame.setAttribute("allow", "clipboard-read; clipboard-write");
  frame.style.cssText = "display:block;width:100%;height:100%;min-height:100dvh;border:0;background:#fff";
  container.replaceChildren(frame);

  let disposed = false;
  let syncTimer = null;

  const start = async () => {
    if (!projectName) throw new Error("OpenDesign 需要目前 Project。");
    let response = await host.api.callExtensionBackend("status", { method: "GET", scope: "project" });
    if (!response?.ok) {
      response = await host.api.callExtensionBackend("open", {
        body: { project: projectName },
        method: "POST",
        scope: "project",
      });
    }
    if (disposed) return;
    const publicUrl = stringValue(response?.service?.publicUrl, "");
    if (!publicUrl) throw new Error("OpenDesign container 沒有回傳 public URL。");
    frame.src = publicUrl;
    syncTimer = window.setInterval(() => void syncProviders(), 10_000);
    void syncProviders();
  };

  const syncProviders = async () => {
    if (disposed) return;
    try {
      const result = await host.api.callExtensionBackend("sync", {
        body: { project: projectName },
        method: "POST",
        scope: "project",
      });
      if (result?.changed && !disposed) frame.src = frame.src;
    } catch {
      // A provider login or runtime restart can briefly interrupt synchronization.
    }
  };

  void start().catch((error) => {
    if (disposed) return;
    const message = error instanceof Error ? error.message : String(error);
    host.ui.showError(message);
    const fallback = document.createElement("p");
    fallback.textContent = message;
    fallback.style.cssText = "padding:24px;color:#b42318;font:14px system-ui";
    container.replaceChildren(fallback);
  });

  return {
    destroy() {
      disposed = true;
      if (syncTimer !== null) window.clearInterval(syncTimer);
      frame.src = "about:blank";
      container.replaceChildren();
    },
  };
}

function stringValue(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
