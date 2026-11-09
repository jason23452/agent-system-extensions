import { request as httpRequest } from "node:http";
import { randomBytes } from "node:crypto";

const IMAGE = process.env.GCP_CLI_IMAGE || "gcr.io/google.com/cloudsdktool/google-cloud-cli:558.0.0-stable";
const DOCKER_SOCKET_PATH = process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock";
const PROJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const RUNTIME_ROOT = "/root/.config/gcloud";
const CALLBACK_PORT_PATH = `${RUNTIME_ROOT}/agent-system-login-callback-port`;
const GOOGLE_CLOUD_CLI_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/lib/google-cloud-sdk/bin";
const GOOGLE_CLOUD_CLI_PYTHON = "/usr/lib/google-cloud-sdk/platform/bundledpythonunix/bin/python3";
const BROWSER_REMOTE_CONTROL_URL = trimTrailingSlash(process.env.BROWSER_REMOTE_BASE_URL || "http://browser-remote:3001");

export async function activate(host = {}) {
  const project = requireProject(host.project);
  const slug = slugify(project);
  const container = `agent-system-google-cloud-platform-${slug}`;
  const volume = `${container}-data`;
  return {
    async handle({ request }) {
      if (request.method === "POST" && request.path === "install") {
        const ready = await ensureRuntime(container, volume, project);
        return { headers: noStoreHeaders(), body: { container, image: IMAGE, project, state: ready ? "ready" : "unavailable" } };
      }
      if (request.method === "GET" && request.path === "status") {
        const ready = await ensureRuntime(container, volume, project);
        const authOutput = ready ? await runExec(container, ["gcloud", "auth", "list", "--format=json"]) : "[]";
        let accounts = [];
        try { accounts = JSON.parse(authOutput); } catch { accounts = []; }
        const authenticated = Array.isArray(accounts) && accounts.length > 0;
        const loginProcessActive = ready && await isLoginProcessActive(container);
        const loginLog = ready && !authenticated && !loginProcessActive ? await readLoginLog(container) : "";
        const failed = !authenticated && !loginProcessActive && /error|failed|denied|cancel/i.test(loginLog);
        return { headers: noStoreHeaders(), body: { authenticated, container, image: IMAGE, project, state: ready ? "ready" : "unavailable", login: authenticated ? "succeeded" : failed ? "failed" : loginProcessActive ? "pending" : "idle", ...(failed ? { error: "GCP_LOGIN_PROCESS_FAILED", stage: "authorization" } : {}) } };
      }
      if (request.method === "POST" && request.path === "exec") {
        assertProjectRequest(request, project);
        const args = readGcloudArguments(request.body);
        await ensureRuntime(container, volume, project);
        const result = await runGcloudCommand(container, args);
        return {
          headers: noStoreHeaders(),
          body: {
            exitCode: result.exitCode,
            output: result.output,
            truncated: result.truncated,
          },
        };
      }
      if (request.method === "POST" && request.path === "login") {
        await ensureRuntime(container, volume, project);
        let startedLogin = false;
        try {
          let authorizationUrl = await readLoginUrl(container);
          if (!authorizationUrl || !(await isLoginProcessActive(container))) {
            await runExec(container, ["rm", "-f", `${RUNTIME_ROOT}/agent-system-login.log`, `${RUNTIME_ROOT}/agent-system-login.pid`, CALLBACK_PORT_PATH]);
            await runExec(container, ["bash", "-c", `DISPLAY=:0 BROWSER=/usr/bin/true gcloud auth login --brief > ${RUNTIME_ROOT}/agent-system-login.log 2>&1 & login_pid=$!; echo $login_pid > ${RUNTIME_ROOT}/agent-system-login.pid; wait $login_pid`], true);
            startedLogin = true;
            authorizationUrl = await waitForLoginUrl(container);
          }
          const callbackPort = await configureRuntimeCallbackPort(container, authorizationUrl);
          const { browserUrl, expiresAt } = await openBrowserRemoteLogin(container, authorizationUrl, callbackPort);
          return { headers: noStoreHeaders(), body: { browserUrl, container, expiresAt, state: "pending" } };
        } catch (error) {
          if (startedLogin) await cancelPendingLogin(container);
          throw error;
        }
      }
      if (request.method === "POST" && request.path === "logout") {
        await ensureRuntime(container, volume, project);
        await runExec(container, ["gcloud", "auth", "revoke", "--all", "--quiet"]);
        return { headers: noStoreHeaders(), body: { authenticated: false, container, project } };
      }
      if (request.method === "POST" && request.path === "cancel") {
        await ensureRuntime(container, volume, project);
        const body = await cancelProjectLogin({ container, project, runExec, isLoginProcessActive, cancelPendingLogin, browserRemoteRequest });
        return { headers: noStoreHeaders(), body };
      }
      throw extensionError(404, "GCP_PATH_NOT_FOUND", "Google Cloud Platform request path is unavailable.");
    },
  };
}

export async function cancelProjectLogin({ container, project, runExec, isLoginProcessActive, cancelPendingLogin, browserRemoteRequest }) {
  const authOutput = await runExec(container, ["gcloud", "auth", "list", "--format=json"]);
  let accounts = [];
  try { accounts = JSON.parse(authOutput); } catch { accounts = []; }
  if (Array.isArray(accounts) && accounts.length > 0) return { cancelled: false, authenticated: true, project };
  if (!(await isLoginProcessActive(container))) return { cancelled: false, authenticated: false, project };
  try { await browserRemoteRequest("POST", "/gcloud/callbacks/cancel", { target: container }); } catch { /* 專案程序仍須在 browser-remote 無法連線時停止。 */ }
  await cancelPendingLogin(container);
  return { cancelled: true, authenticated: false, project };
}

async function ensureRuntime(name, volume, project) {
  const image = await dockerRequest("GET", `/images/${encodeURIComponent(IMAGE)}/json`);
  if (image.status === 404) {
    const pull = await dockerRequest("POST", `/images/create?fromImage=${encodeURIComponent(IMAGE)}`, undefined, 1_200_000);
    if (pull.status < 200 || pull.status >= 300) throw extensionError(503, "GCP_IMAGE_PULL_FAILED", "The Google Cloud CLI image could not be pulled.");
  } else if (image.status < 200 || image.status >= 300) {
    throw extensionError(503, "GCP_IMAGE_INSPECT_FAILED", "The Google Cloud CLI image could not be inspected.");
  }
  const existing = await dockerRequest("GET", `/containers/${encodeURIComponent(name)}/json`);
  let container = existing.body;
  if (existing.status === 404) {
    const created = await dockerRequest("POST", `/containers/create?name=${encodeURIComponent(name)}`, {
      Image: IMAGE,
      Env: [`CLOUDSDK_CONFIG=${RUNTIME_ROOT}`, `CLOUDSDK_PYTHON=${GOOGLE_CLOUD_CLI_PYTHON}`, `PATH=${GOOGLE_CLOUD_CLI_PATH}`, `AGENT_SYSTEM_PROJECT=${project}`, "GCP_CLI_CALLBACK_PROXY_VERSION=2"],
      Labels: { "agent-system.extension": "google-cloud-platform", "agent-system.project": project },
      Cmd: ["bash", "-lc", `${GOOGLE_CLOUD_CLI_PYTHON} -c 'import socket,threading; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); s.bind(("0.0.0.0",8086)); s.listen();\ndef relay(c):\n try:\n  p=int(open("${CALLBACK_PORT_PATH}").read().strip()); u=socket.create_connection(("127.0.0.1",p)); threading.Thread(target=pipe,args=(c,u),daemon=True).start(); pipe(u,c)\n except Exception: c.close()\ndef pipe(a,b):\n try:\n  while True:\n   d=a.recv(65536)\n   if not d: break\n   b.sendall(d)\n except Exception: pass\n finally:\n  a.close(); b.close()\nwhile True:\n c,_=s.accept(); threading.Thread(target=relay,args=(c,),daemon=True).start()' & while :; do sleep 3600; done`],
      ExposedPorts: { "8086/tcp": {} },
      HostConfig: {
        Binds: [`${volume}:${RUNTIME_ROOT}`],
        RestartPolicy: { Name: "unless-stopped" },
      },
      NetworkingConfig: { EndpointsConfig: Object.fromEntries(runtimeNetworks().map((network) => [network, { Aliases: [name] }])) },
    });
    if (created.status < 200 || created.status >= 300) throw extensionError(503, "GCP_CONTAINER_CREATE_FAILED", "The project Google Cloud CLI container could not be created. Port 8085 may already be in use.");
    const inspected = await dockerRequest("GET", `/containers/${encodeURIComponent(name)}/json`);
    container = inspected.body;
  } else if (existing.status < 200 || existing.status >= 300 || !isRecord(container)) {
    throw extensionError(503, "GCP_CONTAINER_INSPECT_FAILED", "The project Google Cloud CLI container could not be inspected.");
  }
  const labels = container.Config?.Labels || {};
  if (labels["agent-system.extension"] !== "google-cloud-platform" || labels["agent-system.project"] !== project) {
    throw extensionError(409, "GCP_CONTAINER_CONFLICT", "The Google Cloud CLI container name belongs to another resource.");
  }
  const environment = new Set(Array.isArray(container.Config?.Env) ? container.Config.Env : []);
  const expectedEnvironment = [`CLOUDSDK_CONFIG=${RUNTIME_ROOT}`, `CLOUDSDK_PYTHON=${GOOGLE_CLOUD_CLI_PYTHON}`, `PATH=${GOOGLE_CLOUD_CLI_PATH}`, `AGENT_SYSTEM_PROJECT=${project}`, "GCP_CLI_CALLBACK_PROXY_VERSION=2"];
  if (container.Config?.Image !== IMAGE || expectedEnvironment.some((value) => !environment.has(value))) {
    if (container.State?.Running === true) await dockerRequest("POST", `/containers/${encodeURIComponent(name)}/stop?t=10`);
    const removed = await dockerRequest("DELETE", `/containers/${encodeURIComponent(name)}?force=true&v=false`);
    if (removed.status !== 204 && removed.status !== 404 && (removed.status < 200 || removed.status >= 300)) throw extensionError(503, "GCP_CONTAINER_REPLACE_FAILED", "The previous Google Cloud CLI container could not be replaced.");
    return ensureRuntime(name, volume, project);
  }
  const publishedPorts = container.HostConfig?.PortBindings || {};
  if (Object.values(publishedPorts).some((bindings) => Array.isArray(bindings) && bindings.length > 0)) {
    if (container.State?.Running === true) await dockerRequest("POST", `/containers/${encodeURIComponent(name)}/stop?t=10`);
    const removed = await dockerRequest("DELETE", `/containers/${encodeURIComponent(name)}?force=true&v=false`);
    if (removed.status !== 204 && removed.status !== 404 && (removed.status < 200 || removed.status >= 300)) throw extensionError(503, "GCP_CONTAINER_REPLACE_FAILED", "The previous Google Cloud CLI container could not be replaced.");
    return ensureRuntime(name, volume, project);
  }
  if (container.State?.Running !== true) {
    const started = await dockerRequest("POST", `/containers/${encodeURIComponent(name)}/start`);
    if (![204, 304].includes(started.status) && (started.status < 200 || started.status >= 300)) throw extensionError(503, "GCP_CONTAINER_START_FAILED", "The project Google Cloud CLI container could not be started.");
  }
  await connectRuntimeNetworks(name, container);
  return true;
}

async function configureRuntimeCallbackPort(container, authorizationUrl) {
  const url = new URL(authorizationUrl);
  const redirect = new URL(url.searchParams.get("redirect_uri") || "");
  const port = Number(redirect.port);
  if (url.hostname !== "accounts.google.com" || redirect.protocol !== "http:" || redirect.hostname !== "localhost" || redirect.pathname !== "/" || !Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw extensionError(502, "GCP_LOGIN_CALLBACK_INVALID", "The Google Cloud CLI selected an unsupported OAuth callback address.");
  }
  await runExec(container, ["bash", "-c", `printf '%s' '${port}' > '${CALLBACK_PORT_PATH}'`]);
  return port;
}

export async function openBrowserRemoteLogin(container, authorizationUrl, callbackPort) {
  const loginUrl = new URL(authorizationUrl);
  const state = loginUrl.searchParams.get("state") || "";
  if (loginUrl.hostname !== "accounts.google.com" || !Number.isInteger(callbackPort) || !state) {
    throw extensionError(502, "GCP_LOGIN_URL_INVALID", "The Google Cloud CLI produced an unsupported browser login URL.");
  }
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const sessionToken = randomBytes(32).toString("base64url");
  let tabId;
  let callbackRegistered = false;
  let sessionRegistered = false;
  try {
    await browserRemoteRequest("POST", "/gcloud/callbacks", { callbackPort, expiresAt, sessionToken, state, target: container });
    callbackRegistered = true;
    await browserRemoteRequest("POST", "/sessions", { expiresAt, token: sessionToken });
    sessionRegistered = true;
    const tab = await browserRemoteRequest("POST", `/sessions/${encodeURIComponent(sessionToken)}/api/tabs`, { url: authorizationUrl });
    tabId = typeof tab?.id === "string" ? tab.id : undefined;
    if (!tabId) throw extensionError(503, "GCP_BROWSER_TAB_CREATE_FAILED", "The server browser could not open the Google login page.");
    await browserRemoteRequest("PATCH", `/gcloud/callbacks/${encodeURIComponent(state)}`, { tabId });
    await browserRemoteRequest("POST", `/sessions/${encodeURIComponent(sessionToken)}/api/tabs/${encodeURIComponent(tabId)}/activate`);
    return { browserUrl: buildBrowserRemoteUrl(sessionToken), expiresAt };
  } catch (error) {
    if (tabId) await ignoreBrowserRemoteRequest("DELETE", `/sessions/${encodeURIComponent(sessionToken)}/api/tabs/${encodeURIComponent(tabId)}`);
    if (sessionRegistered) await ignoreBrowserRemoteRequest("DELETE", `/sessions/${encodeURIComponent(sessionToken)}`);
    if (callbackRegistered) await ignoreBrowserRemoteRequest("DELETE", `/gcloud/callbacks/${encodeURIComponent(state)}`);
    throw error;
  }
}

export function buildBrowserRemoteUrl(token) {
  return `/browser-remote/session/${encodeURIComponent(token)}/`;
}

async function browserRemoteRequest(method, path, body) {
  let response;
  try {
    response = await fetch(`${BROWSER_REMOTE_CONTROL_URL}${path}`, {
      ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
      method,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw extensionError(503, "GCP_BROWSER_REMOTE_UNAVAILABLE", "The server browser service is unavailable.");
  }
  if (!response.ok) {
    let failure;
    try { failure = await response.json(); } catch { failure = undefined; }
    if (failure?.code === "GCP_LOGIN_BUSY") {
      throw extensionError(409, "GCP_LOGIN_BUSY", "This Project already has an active Google Cloud login. Wait for it to finish or expire, then retry.");
    }
    throw extensionError(503, "GCP_BROWSER_REMOTE_REQUEST_FAILED", "The server browser could not complete the Google login setup.");
  }
  if (response.status === 204) return undefined;
  try { return await response.json(); } catch { return undefined; }
}

async function ignoreBrowserRemoteRequest(method, path) {
  try { await browserRemoteRequest(method, path); } catch { /* Cleanup is best effort. */ }
}

function runtimeNetworks() {
  const configured = typeof process.env.GCP_CLI_DOCKER_NETWORK === "string" ? process.env.GCP_CLI_DOCKER_NETWORK.trim() : "";
  const networks = (configured || "agent-system-main").split(",").map((network) => network.trim()).filter(Boolean);
  if (networks.some((network) => !/^[A-Za-z0-9_.-]{1,128}$/.test(network))) {
    throw extensionError(503, "GCP_DOCKER_NETWORK_INVALID", "The Google Cloud CLI Docker network configuration is invalid.");
  }
  return [...new Set(networks)];
}

async function connectRuntimeNetworks(name, container) {
  const attached = container.NetworkSettings?.Networks || {};
  for (const network of runtimeNetworks()) {
    if (Object.hasOwn(attached, network)) continue;
    const result = await dockerRequest("POST", `/networks/${encodeURIComponent(network)}/connect`, {
      Container: name,
      EndpointConfig: { Aliases: [name] },
    });
    if (result.status !== 201 && result.status !== 409 && (result.status < 200 || result.status >= 300)) {
      throw extensionError(503, "GCP_DOCKER_NETWORK_CONNECT_FAILED", "The Google Cloud CLI container could not join the server browser network.");
    }
  }
}

async function readLoginUrl(container) {
  const output = await runExec(container, ["bash", "-lc", `cat ${RUNTIME_ROOT}/agent-system-login.log 2>/dev/null || true`]);
  return extractAuthorizationUrl(output);
}

async function readLoginLog(container) {
  try { return await runExec(container, ["bash", "-lc", `cat ${RUNTIME_ROOT}/agent-system-login.log 2>/dev/null || true`]); }
  catch { return ""; }
}

async function isLoginProcessActive(container) {
  try {
    await runExec(container, ["bash", "-c", `login_pid=$(cat ${RUNTIME_ROOT}/agent-system-login.pid 2>/dev/null || true); test -n "$login_pid" && test -r "/proc/$login_pid/cmdline" && tr '\\000' ' ' < "/proc/$login_pid/cmdline" | grep -Eq '(^|[ /])gcloud(\\.py)?[[:space:]]+auth[[:space:]]+login([[:space:]]|$)'`]);
    return true;
  } catch {
    return false;
  }
}

async function cancelPendingLogin(container) {
  await runExec(container, ["bash", "-c", `login_pid=$(cat ${RUNTIME_ROOT}/agent-system-login.pid 2>/dev/null || true); if test -n "$login_pid" && test -r "/proc/$login_pid/cmdline" && tr '\\000' ' ' < "/proc/$login_pid/cmdline" | grep -Eq '(^|[ /])gcloud(\\.py)?[[:space:]]+auth[[:space:]]+login([[:space:]]|$)'; then pkill -TERM -P "$login_pid" 2>/dev/null || true; kill -TERM "$login_pid" 2>/dev/null || true; fi; rm -f ${RUNTIME_ROOT}/agent-system-login.log ${RUNTIME_ROOT}/agent-system-login.pid ${CALLBACK_PORT_PATH}`]).catch(() => undefined);
}

export function isGcloudLoginProcessCommandLine(commandLine) {
  return /(?:^|[\s/])gcloud(?:\.py)?\s+auth\s+login(?:\s|$)/.test(String(commandLine).replaceAll("\0", " "));
}

async function waitForLoginUrl(container) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const url = await readLoginUrl(container);
    if (url) return url;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw extensionError(504, "GCP_LOGIN_URL_TIMEOUT", "The Google Cloud CLI did not produce a browser authorization URL.");
}

function extractAuthorizationUrl(output) {
  const match = String(output).match(/https:\/\/accounts\.google\.com\/[^\s"']+/);
  if (!match) return undefined;
  try {
    const url = new URL(match[0]);
    const redirectUri = new URL(url.searchParams.get("redirect_uri") || "");
    return url.hostname === "accounts.google.com"
      && url.pathname.startsWith("/")
      && redirectUri.protocol === "http:"
      && redirectUri.hostname === "localhost"
      && redirectUri.pathname === "/"
      && Number(redirectUri.port) >= 1024
      && Number(redirectUri.port) <= 65_535
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

async function runExec(container, command, detached = false) {
  const created = await dockerRequest("POST", `/containers/${encodeURIComponent(container)}/exec`, {
    AttachStdout: !detached,
    AttachStderr: !detached,
    AttachStdin: false,
    Tty: false,
    Cmd: command,
  });
  const id = created.body?.Id;
  if (created.status < 200 || created.status >= 300 || typeof id !== "string") throw extensionError(503, "GCP_EXEC_CREATE_FAILED", "A Google Cloud CLI operation could not be started.");
  const started = await dockerRequest("POST", `/exec/${encodeURIComponent(id)}/start`, { Detach: detached, Tty: false }, 120_000);
  if (started.status < 200 || started.status >= 300) throw extensionError(503, "GCP_EXEC_START_FAILED", "A Google Cloud CLI operation could not be started.");
  if (detached) return "";
  const output = decodeDockerStream(started.text || "");
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const inspected = await dockerRequest("GET", `/exec/${encodeURIComponent(id)}/json`);
    if (inspected.body?.Running === false) {
      if (inspected.body.ExitCode !== 0) throw extensionError(503, "GCP_CLI_COMMAND_FAILED", "The Google Cloud CLI operation failed.");
      return output;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw extensionError(504, "GCP_CLI_COMMAND_TIMEOUT", "The Google Cloud CLI operation timed out.");
}

async function runGcloudCommand(container, args) {
  const created = await dockerRequest("POST", `/containers/${encodeURIComponent(container)}/exec`, {
    AttachStderr: true,
    AttachStdin: false,
    AttachStdout: true,
    Cmd: ["gcloud", ...args],
    Env: ["CLOUDSDK_CORE_DISABLE_PROMPTS=1"],
    Tty: true,
  });
  const id = created.body?.Id;
  if (created.status < 200 || created.status >= 300 || typeof id !== "string") {
    throw extensionError(503, "GCP_EXEC_CREATE_FAILED", "The gcloud command could not be started.");
  }
  const started = await dockerRequest("POST", `/exec/${encodeURIComponent(id)}/start`, { Detach: false, Tty: true }, 120_000, 128 * 1024);
  if (started.status < 200 || started.status >= 300) throw extensionError(503, "GCP_EXEC_START_FAILED", "The gcloud command could not be started.");
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const inspected = await dockerRequest("GET", `/exec/${encodeURIComponent(id)}/json`);
    if (inspected.body?.Running === false) {
      return {
        exitCode: Number.isInteger(inspected.body.ExitCode) ? inspected.body.ExitCode : 1,
        output: started.text.slice(0, 60_000),
        truncated: started.truncated === true || started.text.length > 60_000,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw extensionError(504, "GCP_CLI_COMMAND_TIMEOUT", "The gcloud command exceeded the 120 second execution limit.");
}

function assertProjectRequest(request, project) {
  if (request.query?.scope !== "project" || request.query?.project !== project) {
    throw extensionError(403, "GCP_PROJECT_CONTEXT_INVALID", "The gcloud command must use the active Project context.");
  }
}

function readGcloudArguments(body) {
  if (!isRecord(body) || Object.keys(body).length !== 1 || !Array.isArray(body.args)) {
    throw extensionError(400, "GCP_COMMAND_ARGUMENTS_INVALID", "Provide gcloud command arguments as an array.");
  }
  const args = body.args;
  if (args.length < 1 || args.length > 64 || args.some((value) => typeof value !== "string" || value.length === 0 || value.length > 2_048 || value.includes("\0"))) {
    throw extensionError(400, "GCP_COMMAND_ARGUMENTS_INVALID", "gcloud accepts 1 to 64 non-empty command arguments, each at most 2048 characters.");
  }
  if (args.reduce((length, value) => length + value.length, 0) > 8_192) {
    throw extensionError(400, "GCP_COMMAND_ARGUMENTS_INVALID", "The gcloud command arguments exceed the 8192 character limit.");
  }
  const normalized = args.map((value) => value.toLowerCase());
  const safeAuthRead = normalized[0] === "auth" && new Set(["list", "status", "describe"]).has(normalized[1]);
  const credentialCommands = [
    ["auth", "print-access-token"],
    ["auth", "print-identity-token"],
    ["auth", "login"],
    ["auth", "revoke"],
    ["auth", "activate-service-account"],
    ["auth", "application-default", "print-access-token"],
    ["auth", "application-default", "login"],
    ["auth", "application-default", "revoke"],
    ["config", "config-helper"],
  ];
  const printsCredential = credentialCommands.some((sequence) => containsSequence(normalized, sequence));
  const unsupportedAuth = normalized[0] === "auth" && !safeAuthRead;
  if (printsCredential || unsupportedAuth) {
    throw extensionError(403, "GCP_CREDENTIAL_COMMAND_FORBIDDEN", "Credential-management and token-printing commands are handled by the Extension login controls.");
  }
  return [...args];
}

function containsSequence(values, sequence) {
  return values.some((_, start) => sequence.every((value, offset) => values[start + offset] === value));
}

function decodeDockerStream(value) {
  const data = Buffer.from(value, "utf8");
  const chunks = [];
  let offset = 0;
  while (offset + 8 <= data.length) {
    const length = data.readUInt32BE(offset + 4);
    if (offset + 8 + length > data.length) break;
    chunks.push(data.subarray(offset + 8, offset + 8 + length));
    offset += 8 + length;
  }
  return chunks.length ? Buffer.concat(chunks).toString("utf8") : value;
}

function dockerRequest(method, path, body, timeoutMs = 30_000, maxResponseBytes = Number.MAX_SAFE_INTEGER) {
  return new Promise((resolve, reject) => {
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    const request = httpRequest({ method, path, socketPath: DOCKER_SOCKET_PATH, headers: { Accept: "application/json", ...(serialized === undefined ? {} : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(serialized) }) } }, (response) => {
      const chunks = [];
      let bytes = 0;
      let truncated = false;
      response.on("data", (chunk) => {
        const value = Buffer.from(chunk);
        const available = Math.max(0, maxResponseBytes - bytes);
        if (available > 0) chunks.push(value.subarray(0, available));
        if (value.length > available) truncated = true;
        bytes += value.length;
      });
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed;
        try { parsed = text ? JSON.parse(text) : undefined; } catch { parsed = undefined; }
        resolve({ status: response.statusCode || 500, body: parsed, text, truncated });
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(extensionError(504, "GCP_DOCKER_TIMEOUT", "A Google Cloud Docker operation timed out.")));
    request.on("error", (error) => reject(error.statusCode ? error : extensionError(503, "GCP_DOCKER_UNAVAILABLE", "Docker is unavailable.")));
    if (serialized !== undefined) request.write(serialized);
    request.end();
  });
}

function requireProject(value) {
  const project = typeof value === "string" ? value.trim() : "";
  if (!PROJECT_PATTERN.test(project)) throw extensionError(403, "GCP_PROJECT_CONTEXT_INVALID", "Google Cloud Platform requires an active Project context.");
  return project;
}

function slugify(value) { return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "project"; }
function noStoreHeaders() { return { "cache-control": "no-store" }; }
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function extensionError(statusCode, code, message) { const error = new Error(message); error.statusCode = statusCode; error.code = code; return error; }
function trimTrailingSlash(value) { return String(value).replace(/\/+$/, ""); }
