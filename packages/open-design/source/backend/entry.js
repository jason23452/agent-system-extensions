import { request as httpRequest } from "node:http";

const OPEN_DESIGN_IMAGE = process.env.OPEN_DESIGN_IMAGE || "ghcr.io/nexu-io/od:0.18.0";
let CONTAINER_NAME = process.env.OPEN_DESIGN_CONTAINER_NAME || "agent-system-open-design";
let VOLUME_NAME = process.env.OPEN_DESIGN_VOLUME_NAME || "agent-system-open-design-data";
let HOST_PORT = process.env.OPEN_DESIGN_HOST_PORT || "7456";
let SERVICE_URL = trimTrailingSlash(process.env.OPEN_DESIGN_SERVICE_URL || `http://${CONTAINER_NAME}:7456`);
let PUBLIC_URL = trimTrailingSlash(process.env.OPEN_DESIGN_PUBLIC_URL || `http://127.0.0.1:${HOST_PORT}`);
let PROJECT_ID;
let PROJECT_SLUG;
const DOCKER_SOCKET_PATH = process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock";
const MCP_PACKAGE = process.env.OPEN_DESIGN_MCP_PACKAGE || "open-design-mcp@0.16.1";
const OPENCODE_PACKAGE = process.env.OPEN_DESIGN_OPENCODE_PACKAGE || "opencode-ai@1.18.9";
const OPENCODE_REMOTE_URL = trimTrailingSlash(process.env.OPEN_DESIGN_OPENCODE_REMOTE_URL || "http://agent-system-opencode-server:4096");
const OPENCODE_AGENT_ID = "agent-system-opencode";
const OPENCODE_AGENT_PROFILE_PATH = process.env.OPEN_DESIGN_AGENT_PROFILE_PATH || "/home/open-design/.open-design/agents.local.json";
const OPENCODE_PROVIDER_FINGERPRINT_PATH = "/home/open-design/.open-design/agent-system-provider-fingerprint";
const OPENCODE_AGENT_WRAPPER_PATH = process.env.OPEN_DESIGN_AGENT_WRAPPER_PATH || "/usr/local/bin/open-design-opencode";
const OPENCODE_AGENT_CLI_PATH = process.env.OPEN_DESIGN_AGENT_CLI_PATH || "/usr/local/bin/open-design-opencode-cli";
const OPENCODE_PROJECTS_ROOT = process.env.OPEN_DESIGN_OPENCODE_PROJECTS_ROOT || "/workspace/projects";
const MCP_CONTAINERS = unique([
  process.env.OPENCODE_CONTAINER_NAME || "agent-system-opencode-server",
  process.env.OPENCODE_WORKFLOW_CONTAINER_NAME || "agent-system-opencode-workflow-server",
]);
const NETWORKS = unique((process.env.OPEN_DESIGN_NETWORKS || "agent-system-main,agent-system-workflow").split(",").map((value) => value.trim()).filter(Boolean));
const HEALTH_TIMEOUT_MS = 2_500;
const SERVICE_START_TIMEOUT_MS = 60_000;
const EXEC_TIMEOUT_MS = 120_000;
const IMAGE_PULL_TIMEOUT_MS = 1_200_000;
let providerFingerprint = "";

export async function activate(host = {}) {
  configureProjectRuntime(host.project);
  return {
    async handle({ request }) {
      if (request.method === "GET" && request.path === "status") {
        return { body: await readStatus() };
      }

      if (request.method === "POST" && request.path === "sync") {
        return { body: await syncProjectProviders() };
      }

      if (request.method === "POST" && request.path === "open") {
        return { body: await openOpenDesign() };
      }

      if (request.method !== "POST" || request.path !== "install") {
        throw extensionError(404, "OPEN_DESIGN_PATH_NOT_FOUND", "Open Design extension path was not found.");
      }

      return { body: await installOpenDesign() };
    },
  };
}

async function installOpenDesign() {
  await allocateProjectPort();
  const image = await ensureImage();
  const container = await ensureContainer();
  const service = await waitForService();
  if (!service.ok) {
    throw extensionError(503, "OPEN_DESIGN_SERVICE_UNAVAILABLE", "Open Design Docker service did not become healthy after startup.");
  }

  const mcp = mcpSummary();
  const providers = await syncOpenCodeProviderStatus();
  const agent = await ensureAgentRuntime(providers);
  providerFingerprint = fingerprintProviders(providers);
  return {
    ok: true,
    image: { name: OPEN_DESIGN_IMAGE, pulled: image.pulled },
    container: {
      name: CONTAINER_NAME,
      created: container.created,
      started: container.started,
      networks: NETWORKS,
    },
    service: {
      name: "open-design",
      state: "ready",
      publicUrl: PUBLIC_URL,
      internalUrl: SERVICE_URL,
    },
    mcp,
    agent,
    providers: providers.map(({ id, name, models }) => ({ id, name, modelCount: models.length })),
  };
}

async function syncProjectProviders() {
  const providers = await syncOpenCodeProviderStatus();
  const nextFingerprint = fingerprintProviders(providers);
  const persisted = nextFingerprint === providerFingerprint
    || await containerFileMatches(OPENCODE_PROVIDER_FINGERPRINT_PATH, nextFingerprint);
  const changed = !persisted;
  if (changed) {
    await writeAgentRuntimeFiles(providers);
    await restartManagedContainer();
    const service = await waitForService();
    if (!service.ok || !(await waitForAgentRuntime()).ready) {
      throw extensionError(503, "OPEN_DESIGN_PROVIDER_SYNC_FAILED", "Open Design did not become ready after synchronizing OpenCode providers.");
    }
    providerFingerprint = nextFingerprint;
  }
  return {
    ok: true,
    changed,
    providers: providers.map(({ id, name, authenticated, models }) => ({ id, name, authenticated, modelCount: models.length })),
  };
}

function fingerprintProviders(providers) {
  return JSON.stringify(providers.map(({ id, defaultModel, models }) => ({
    id,
    defaultModel,
    models: models.map(({ id: modelID }) => modelID),
  })));
}

async function openOpenDesign() {
  await allocateProjectPort();
  await ensureImage();
  const container = await ensureContainer();
  const service = await waitForService();
  if (!service.ok) {
    throw extensionError(503, "OPEN_DESIGN_SERVICE_UNAVAILABLE", "Open Design Docker service did not become healthy after startup.");
  }
  return {
    ok: true,
    container: { name: CONTAINER_NAME, created: container.created, started: container.started },
    service: { name: "open-design", state: "ready", publicUrl: PUBLIC_URL, internalUrl: SERVICE_URL },
  };
}

function configureProjectRuntime(project) {
  if (!project) return;
  PROJECT_ID = project;
  PROJECT_SLUG = slugify(project);
  CONTAINER_NAME = `agent-system-open-design-${PROJECT_SLUG}`;
  VOLUME_NAME = `agent-system-open-design-${PROJECT_SLUG}-data`;
  SERVICE_URL = `http://${CONTAINER_NAME}:7456`;
  PUBLIC_URL = `http://127.0.0.1:${HOST_PORT}`;
}

async function allocateProjectPort() {
  if (!PROJECT_ID || process.env.OPEN_DESIGN_HOST_PORT) return;
  const inspected = await dockerRequest("GET", `/containers/${encodeURIComponent(CONTAINER_NAME)}/json`);
  const existingPort = inspected.body?.HostConfig?.PortBindings?.["7456/tcp"]?.[0]?.HostPort;
  if (typeof existingPort === "string" && existingPort) {
    HOST_PORT = existingPort;
    PUBLIC_URL = `http://127.0.0.1:${HOST_PORT}`;
    return;
  }
  const listed = await dockerRequest("GET", "/containers/json?all=true");
  const used = new Set();
  for (const container of Array.isArray(listed.body) ? listed.body : []) {
    for (const port of Array.isArray(container.Ports) ? container.Ports : []) {
      if (typeof port.PublicPort === "number") used.add(String(port.PublicPort));
    }
  }
  for (let port = 7460; port <= 7560; port += 1) {
    if (!used.has(String(port))) {
      HOST_PORT = String(port);
      PUBLIC_URL = `http://127.0.0.1:${HOST_PORT}`;
      return;
    }
  }
  throw extensionError(503, "OPEN_DESIGN_PORT_UNAVAILABLE", "No host port is available for this Open Design project.");
}

function slugify(value) {
  const slug = String(value).toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
  return (slug || "project").slice(0, 48);
}

async function readStatus() {
  await allocateProjectPort();
  const health = await checkService();
  return {
    ok: health.ok,
    image: OPEN_DESIGN_IMAGE,
    container: CONTAINER_NAME,
    service: {
      name: "open-design",
      state: health.ok ? "ready" : "unavailable",
      publicUrl: PUBLIC_URL,
      internalUrl: SERVICE_URL,
    },
    mcp: mcpSummary(),
    agent: { id: OPENCODE_AGENT_ID, remoteUrl: OPENCODE_REMOTE_URL, state: "managed" },
  };
}

async function ensureImage() {
  const existing = await dockerRequest("GET", `/images/${encodeURIComponent(OPEN_DESIGN_IMAGE)}/json`);
  if (existing.status >= 200 && existing.status < 300) return { pulled: false };
  if (existing.status !== 404) {
    throw extensionError(503, "OPEN_DESIGN_IMAGE_INSPECT_FAILED", "Open Design Docker image could not be inspected.");
  }

  const pulled = await dockerRequest(
    "POST",
    `/images/create?fromImage=${encodeURIComponent(OPEN_DESIGN_IMAGE)}`,
    undefined,
    IMAGE_PULL_TIMEOUT_MS,
  );
  if (pulled.status < 200 || pulled.status >= 300) {
    throw extensionError(503, "OPEN_DESIGN_IMAGE_PULL_FAILED", `Official Open Design image could not be pulled: ${OPEN_DESIGN_IMAGE}.`);
  }
  return { pulled: true };
}

async function ensureContainer() {
  let inspected = await dockerRequest("GET", `/containers/${encodeURIComponent(CONTAINER_NAME)}/json`);
  let created = false;
  let started = false;

  if (inspected.status === 404) {
    inspected = await createManagedContainer();
    created = true;
  }

  if (inspected.status < 200 || inspected.status >= 300 || !isRecord(inspected.body)) {
    throw extensionError(503, "OPEN_DESIGN_CONTAINER_INSPECT_FAILED", "Open Design Docker container could not be inspected.");
  }
  assertManagedContainer(inspected.body);

   if (inspected.body.Config?.Image !== OPEN_DESIGN_IMAGE || !isManagedContainerConfigCurrent(inspected.body)) {
    await replaceManagedContainer(inspected.body);
    inspected = await createManagedContainer();
    created = true;
  }

  await connectMissingNetworks(inspected.body);

  if (inspected.body.State?.Running !== true) {
    const startedResponse = await dockerRequest("POST", `/containers/${encodeURIComponent(CONTAINER_NAME)}/start`);
    if (startedResponse.status !== 204 && startedResponse.status !== 304 && (startedResponse.status < 200 || startedResponse.status >= 300)) {
      throw extensionError(503, "OPEN_DESIGN_CONTAINER_START_FAILED", "Open Design Docker container could not be started.");
    }
    started = true;
  }

  return { created, started };
}

async function createManagedContainer() {
  const createdResponse = await dockerRequest("POST", `/containers/create?name=${encodeURIComponent(CONTAINER_NAME)}`, containerSpec());
  if (createdResponse.status === 409) {
    const inspected = await dockerRequest("GET", `/containers/${encodeURIComponent(CONTAINER_NAME)}/json`);
    if (inspected.status >= 200 && inspected.status < 300 && isRecord(inspected.body)) return inspected;
  }
  if (createdResponse.status < 200 || createdResponse.status >= 300 || !isRecord(createdResponse.body) || typeof createdResponse.body.Id !== "string") {
    throw extensionError(503, "OPEN_DESIGN_CONTAINER_CREATE_FAILED", "Open Design Docker container could not be created.");
  }
  const inspected = await dockerRequest("GET", `/containers/${encodeURIComponent(CONTAINER_NAME)}/json`);
  if (inspected.status < 200 || inspected.status >= 300 || !isRecord(inspected.body)) {
    throw extensionError(503, "OPEN_DESIGN_CONTAINER_INSPECT_FAILED", "Open Design Docker container could not be inspected after creation.");
  }
  return inspected;
}

async function replaceManagedContainer(container) {
  if (container.State?.Running === true) {
    const stopped = await dockerRequest("POST", `/containers/${encodeURIComponent(CONTAINER_NAME)}/stop?t=10`);
    if (stopped.status !== 204 && stopped.status !== 304 && stopped.status !== 404 && (stopped.status < 200 || stopped.status >= 300)) {
      throw extensionError(503, "OPEN_DESIGN_CONTAINER_STOP_FAILED", "The previous Open Design Docker container could not be stopped for image replacement.");
    }
  }

  const removed = await dockerRequest("DELETE", `/containers/${encodeURIComponent(CONTAINER_NAME)}?force=true&v=false`);
  if (removed.status !== 204 && removed.status !== 404 && (removed.status < 200 || removed.status >= 300)) {
    throw extensionError(503, "OPEN_DESIGN_CONTAINER_REMOVE_FAILED", "The previous Open Design Docker container could not be removed for image replacement.");
  }
}

function containerSpec() {
  return {
    Image: OPEN_DESIGN_IMAGE,
    Env: [
      "NODE_ENV=production",
      "OD_BIND_HOST=0.0.0.0",
      "OD_PORT=7456",
      "OD_WEB_PORT=7456",
      "OD_DISABLE_API_AUTH=1",
      ...(PROJECT_ID ? [`OD_PROJECT_ID=${PROJECT_ID}`, `OD_PROJECT_DIR=/workspace/projects/${PROJECT_SLUG}`] : []),
      `OD_ALLOWED_ORIGINS=${allowedOrigins()}`,
    ],
    ExposedPorts: { "7456/tcp": {} },
    Labels: {
      "agent-system.extension": "open-design",
       "agent-system.extension-version": "1.21.2",
      ...(PROJECT_ID ? { "agent-system.project": PROJECT_ID } : {}),
    },
    HostConfig: {
      Binds: [`${VOLUME_NAME}:/app/.od`],
      PortBindings: { "7456/tcp": [{ HostPort: HOST_PORT }] },
      RestartPolicy: { Name: "unless-stopped" },
    },
    NetworkingConfig: {
      EndpointsConfig: Object.fromEntries(NETWORKS.map((network) => [network, { Aliases: [CONTAINER_NAME] }])),
    },
  };
}

function isManagedContainerConfigCurrent(container) {
  const env = new Set(Array.isArray(container.Config?.Env) ? container.Config.Env : []);
  return [
    "NODE_ENV=production",
    "OD_BIND_HOST=0.0.0.0",
    "OD_PORT=7456",
      "OD_WEB_PORT=7456",
      "OD_DISABLE_API_AUTH=1",
      ...(PROJECT_ID ? [`OD_PROJECT_ID=${PROJECT_ID}`, `OD_PROJECT_DIR=/workspace/projects/${PROJECT_SLUG}`] : []),
      `OD_ALLOWED_ORIGINS=${allowedOrigins()}`,
  ].every((value) => env.has(value));
}

function allowedOrigins() {
  return unique([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:7456",
    "http://127.0.0.1:7456",
    `http://localhost:${HOST_PORT}`,
    `http://127.0.0.1:${HOST_PORT}`,
  ]).join(",");
}

function assertManagedContainer(container) {
  const labels = isRecord(container.Config?.Labels) ? container.Config.Labels : {};
  if (labels["agent-system.extension"] !== "open-design") {
    throw extensionError(409, "OPEN_DESIGN_CONTAINER_CONFLICT", `Docker container name is already used by another container: ${CONTAINER_NAME}.`);
  }
}

async function connectMissingNetworks(container) {
  const attached = isRecord(container.NetworkSettings?.Networks) ? container.NetworkSettings.Networks : {};
  for (const network of NETWORKS) {
    if (Object.prototype.hasOwnProperty.call(attached, network)) continue;
    const response = await dockerRequest("POST", `/networks/${encodeURIComponent(network)}/connect`, {
      Container: CONTAINER_NAME,
      EndpointConfig: { Aliases: [CONTAINER_NAME] },
    });
    if (response.status !== 201 && response.status !== 409 && (response.status < 200 || response.status >= 300)) {
      throw extensionError(503, "OPEN_DESIGN_NETWORK_CONNECT_FAILED", `Open Design Docker container could not join network ${network}.`);
    }
  }
}

async function waitForService() {
  const deadline = Date.now() + SERVICE_START_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    const health = await checkService();
    if (health.ok) return health;
    await delay(500);
  }
  return { ok: false };
}

async function checkService() {
  try {
    const response = await fetch(`${SERVICE_URL}/api/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false };
  }
}

async function ensureAgentRuntime(providers) {
  await ensureAgentCliAliases();
  const detected = await readAgentRuntimeStatus();
  if (detected.ready) {
    await writeAgentRuntimeFiles(providers);
    await restartManagedContainer();
    await waitForService();
    await waitForAgentRuntime();
    return {
      id: OPENCODE_AGENT_ID,
      package: OPENCODE_PACKAGE,
      remoteUrl: OPENCODE_REMOTE_URL,
      state: "ready",
      restarted: false,
    };
  }

  await runContainerExec(
    CONTAINER_NAME,
    ["npm", "install", "--global", "--no-fund", "--no-audit", OPENCODE_PACKAGE],
    "OPEN_DESIGN_AGENT_INSTALL_FAILED",
    "OpenCode agent runtime could not be installed in the Open Design container.",
  );
  await prepareAgentHome();
  await ensureAgentCliAliases();
  await writeAgentRuntimeFiles(providers);
  await restartManagedContainer();

  const service = await waitForService();
  if (!service.ok) {
    throw extensionError(503, "OPEN_DESIGN_AGENT_RESTART_FAILED", "Open Design did not become healthy after installing the OpenCode agent runtime.");
  }

  const ready = await waitForAgentRuntime();
  if (!ready.ready) {
    throw extensionError(503, "OPEN_DESIGN_AGENT_UNAVAILABLE", "The OpenCode agent runtime was installed but Open Design did not detect it.");
  }

  return {
    id: OPENCODE_AGENT_ID,
    package: OPENCODE_PACKAGE,
    remoteUrl: OPENCODE_REMOTE_URL,
    state: "ready",
    restarted: true,
  };
}

async function prepareAgentHome() {
  const script = `const fs = require('node:fs'); fs.mkdirSync('/home/open-design/.open-design', { recursive: true }); fs.chownSync('/home/open-design', 1001, 1001); fs.chownSync('/home/open-design/.open-design', 1001, 1001); const source = '/usr/local/bin/opencode'; const target = ${JSON.stringify(OPENCODE_AGENT_CLI_PATH)}; if (fs.existsSync(source)) { if (fs.existsSync(target)) fs.unlinkSync(source); else fs.renameSync(source, target); }`;
  await runContainerExec(
    CONTAINER_NAME,
    ["node", "-e", script],
    "OPEN_DESIGN_AGENT_HOME_FAILED",
    "OpenCode agent home could not be prepared.",
  );
}

async function ensureAgentCliAliases() {
  const script = [
    "const fs = require('node:fs');",
    `const target = ${JSON.stringify(OPENCODE_AGENT_CLI_PATH)};`,
    "const aliases = ['/usr/local/bin/opencode'];",
    "const managedAlias = '/usr/local/bin/opencode-cli';",
    "if (!fs.existsSync(target)) process.exit(0);",
    "if (fs.lstatSync(managedAlias, { throwIfNoEntry: false })) fs.unlinkSync(managedAlias);",
    "for (const alias of aliases) { if (fs.existsSync(alias) || fs.lstatSync(alias, { throwIfNoEntry: false })) fs.unlinkSync(alias); fs.symlinkSync(target, alias); }",
  ].join(" ");
  await runContainerExec(
    CONTAINER_NAME,
    ["node", "-e", script],
    "OPEN_DESIGN_AGENT_ALIAS_FAILED",
    "OpenCode command aliases could not be prepared in the Open Design container.",
  );
}

async function readAgentRuntimeStatus() {
  try {
    const response = await fetch(`${SERVICE_URL}/api/agents`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!response.ok) return { ready: false };
    const body = await response.json();
    const agent = Array.isArray(body?.agents) ? body.agents.find((item) => item?.id === OPENCODE_AGENT_ID) : undefined;
    return { ready: agent?.available === true };
  } catch {
    return { ready: false };
  }
}

async function waitForAgentRuntime() {
  const deadline = Date.now() + SERVICE_START_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    const status = await readAgentRuntimeStatus();
    if (status.ready) return status;
    await delay(500);
  }
  return { ready: false };
}

async function writeAgentRuntimeFiles(providers) {
  const fingerprint = fingerprintProviders(providers);
  const profile = agentProfile(providers);
  const defaultModel = profile.agents[0].defaultModel;
  const files = {
    [OPENCODE_AGENT_PROFILE_PATH]: JSON.stringify(profile, null, 2) + "\n",
    [OPENCODE_PROVIDER_FINGERPRINT_PATH]: fingerprint,
    [OPENCODE_AGENT_WRAPPER_PATH]: agentWrapperScript(),
  };
  const encoded = Buffer.from(JSON.stringify(files), "utf8").toString("base64");
  const preferences = Buffer.from(JSON.stringify({ agentID: OPENCODE_AGENT_ID, defaultModel }), "utf8").toString("base64");
  const script = [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const files = JSON.parse(Buffer.from(process.argv[1], 'base64').toString('utf8'));",
    "const preferences = JSON.parse(Buffer.from(process.argv[2], 'base64').toString('utf8'));",
    "for (const [file, content] of Object.entries(files)) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); if (file.endsWith('open-design-opencode')) fs.chmodSync(file, 0o755); }",
    "const appConfigPath = '/app/.od/app-config.json';",
    "let appConfig = {}; try { const parsed = JSON.parse(fs.readFileSync(appConfigPath, 'utf8')); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) appConfig = parsed; } catch {}",
    "const agentModels = appConfig.agentModels && typeof appConfig.agentModels === 'object' && !Array.isArray(appConfig.agentModels) ? appConfig.agentModels : {};",
    "const currentModel = agentModels[preferences.agentID] && typeof agentModels[preferences.agentID] === 'object' && !Array.isArray(agentModels[preferences.agentID]) ? agentModels[preferences.agentID] : {};",
    "appConfig = { ...appConfig, agentId: preferences.agentID, agentModels: { ...agentModels, [preferences.agentID]: { ...currentModel, model: preferences.defaultModel } } };",
    "fs.writeFileSync(appConfigPath, JSON.stringify(appConfig, null, 2) + '\\n', 'utf8');",
  ].join(" ");
  await runContainerExec(
    CONTAINER_NAME,
    ["node", "-e", script, encoded, preferences],
    "OPEN_DESIGN_AGENT_CONFIG_FAILED",
    "OpenCode agent runtime configuration could not be written.",
  );
}

function agentProfile(providers = []) {
  const connectedDefault = providers.find((provider) => provider.defaultModel);
  const model = process.env.OPEN_DESIGN_OPENCODE_MODEL
    || (connectedDefault ? `${connectedDefault.id}/${connectedDefault.defaultModel}` : "opencode/big-pickle");
  const models = providers.flatMap((provider) => provider.models.map((item) => ({
    id: `${provider.id}/${item.id}`,
    label: item.name || `${provider.id}/${item.id}`,
  })));
  const syncedModels = models.length > 0 ? models : [{ id: model, label: model }];
  return {
    agents: [{
      id: OPENCODE_AGENT_ID,
      name: "Agent System OpenCode",
      baseAgent: "opencode",
      bin: "open-design-opencode",
      defaultModel: model,
      models: syncedModels,
    }],
  };
}

async function syncOpenCodeProviderStatus() {
  try {
    const providerUrl = new URL(`${OPENCODE_REMOTE_URL}/provider`);
    if (PROJECT_ID) providerUrl.searchParams.set("directory", `${OPENCODE_PROJECTS_ROOT}/${PROJECT_ID}`);
    const response = await fetch(providerUrl, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!response.ok) return [];
    const body = await response.json();
    const connected = Array.isArray(body?.connected) ? body.connected.filter((id) => typeof id === "string") : [];
    const connectedProviders = new Set(connected);
    const connectedOrder = new Map(connected.map((id, index) => [id, index]));
    const defaultModels = isRecord(body?.default) ? body.default : {};
    return (Array.isArray(body?.all) ? body.all : []).map((provider) => ({
      id: typeof provider?.id === "string" ? provider.id : "unknown",
      name: typeof provider?.name === "string" ? provider.name : undefined,
      authenticated: connectedProviders.has(provider?.id),
      defaultModel: typeof defaultModels[provider?.id] === "string" ? defaultModels[provider.id] : undefined,
      models: Object.values(isRecord(provider?.models) ? provider.models : {}).map((model) => ({
        id: typeof model?.id === "string" ? model.id : "unknown",
        name: typeof model?.name === "string" ? model.name : undefined,
      })).filter((model) => model.id !== "unknown"),
    })).filter((provider) => provider.id !== "unknown" && provider.authenticated && provider.models.length > 0)
      .sort((left, right) => (connectedOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (connectedOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  } catch {
    return [];
  }
}

function agentWrapperScript() {
  return `#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args[0] === "models") {
  try {
    const profile = JSON.parse(readFileSync(${JSON.stringify(OPENCODE_AGENT_PROFILE_PATH)}, "utf8"));
    const agent = profile.agents?.find((item) => item?.id === ${JSON.stringify(OPENCODE_AGENT_ID)});
    const models = Array.isArray(agent?.models) ? agent.models.map((item) => item?.id).filter(Boolean) : [];
    process.stdout.write(models.join("\\n") + (models.length ? "\\n" : ""));
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

const runIndex = args.indexOf("run");
const remoteUrl = ${JSON.stringify(OPENCODE_REMOTE_URL)};
const remoteProjectDir = process.env.OPEN_DESIGN_OPENCODE_PROJECT_DIR || ${JSON.stringify(`${OPENCODE_PROJECTS_ROOT}/${PROJECT_ID || "project"}`)};
if (runIndex >= 0) {
  args.splice(runIndex + 1, 0, "--attach", remoteUrl, "--dir", remoteProjectDir);
}
const child = spawn(process.env.OPEN_DESIGN_OPENCODE_BIN || ${JSON.stringify(OPENCODE_AGENT_CLI_PATH)}, args, {
  env: process.env,
  stdio: ["inherit", "pipe", "inherit"],
});

let lineBuffer = "";
let sessionID = "";
const seenPartIDs = new Set();

function trackLine(line) {
  try {
    const event = JSON.parse(line);
    if (typeof event?.sessionID === "string") sessionID = event.sessionID;
    if (typeof event?.part?.id === "string") seenPartIDs.add(event.part.id);
  } catch {}
}

child.stdout.on("data", (chunk) => {
  const text = chunk.toString("utf8");
  process.stdout.write(text);
  lineBuffer += text;
  const lines = lineBuffer.split(/\\r?\\n/);
  lineBuffer = lines.pop() || "";
  for (const line of lines) trackLine(line);
});

async function hydrateAttachedRun() {
  if (lineBuffer.trim()) trackLine(lineBuffer.trim());
  if (runIndex < 0 || !sessionID) return;

  const messagesUrl = new URL("/session/" + encodeURIComponent(sessionID) + "/message", remoteUrl + "/");
  messagesUrl.searchParams.set("directory", remoteProjectDir);
  const deadline = Date.now() + 15_000;
  let assistant;
  do {
    const response = await fetch(messagesUrl, { signal: AbortSignal.timeout(2_500) });
    if (response.ok) {
      const messages = await response.json();
      assistant = Array.isArray(messages)
        ? [...messages].reverse().find((message) => message?.info?.role === "assistant")
        : undefined;
      if (assistant?.info?.time?.completed) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < deadline);

  if (!assistant) return;
  if (assistant.info?.error) {
    process.stdout.write(JSON.stringify({ type: "error", sessionID, error: assistant.info.error }) + "\\n");
  }
  const eventTypes = { "step-start": "step_start", "step-finish": "step_finish", text: "text", tool: "tool_use" };
  for (const part of Array.isArray(assistant.parts) ? assistant.parts : []) {
    if (!part?.id || seenPartIDs.has(part.id)) continue;
    const type = eventTypes[part.type];
    if (!type) continue;
    seenPartIDs.add(part.id);
    process.stdout.write(JSON.stringify({ type, timestamp: Date.now(), sessionID, part }) + "\\n");
  }
}

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on("exit", async (code, signal) => {
  try {
    await hydrateAttachedRun();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
`;
}

async function restartManagedContainer() {
  const response = await dockerRequest("POST", `/containers/${encodeURIComponent(CONTAINER_NAME)}/restart?t=10`);
  if (response.status !== 204 && response.status !== 304 && (response.status < 200 || response.status >= 300)) {
    throw extensionError(503, "OPEN_DESIGN_CONTAINER_RESTART_FAILED", "Open Design Docker container could not be restarted after agent setup.");
  }
}

async function containerFileMatches(path, content) {
  try {
    const encoded = Buffer.from(content, "utf8").toString("base64");
    const script = "const fs=require('node:fs'); const expected=Buffer.from(process.argv[2],'base64').toString('utf8'); process.exit(fs.existsSync(process.argv[1])&&fs.readFileSync(process.argv[1],'utf8')===expected?0:1)";
    return await runContainerExec(CONTAINER_NAME, ["node", "-e", script, path, encoded], "OPEN_DESIGN_FINGERPRINT_READ_FAILED", "Open Design provider fingerprint could not be read.", true) === 0;
  } catch {
    return false;
  }
}

async function runContainerExec(container, command, errorCode, message, allowNonZero = false) {
  const created = await dockerRequest("POST", `/containers/${encodeURIComponent(container)}/exec`, {
    AttachStderr: false,
    AttachStdout: false,
    User: "0",
    Cmd: command,
  });
  const execID = created.body?.Id;
  if (created.status < 200 || created.status >= 300 || typeof execID !== "string") {
    throw extensionError(503, errorCode, message);
  }

  const started = await dockerRequest("POST", `/exec/${encodeURIComponent(execID)}/start`, { Detach: true, Tty: false });
  if (started.status < 200 || started.status >= 300) {
    throw extensionError(503, errorCode, message);
  }

  const deadline = Date.now() + EXEC_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    const status = await dockerRequest("GET", `/exec/${encodeURIComponent(execID)}/json`);
    if (status.status >= 200 && status.status < 300 && isRecord(status.body) && status.body.Running === false) {
      if (status.body.ExitCode !== 0 && !allowNonZero) throw extensionError(503, errorCode, message);
      return status.body.ExitCode;
    }
    await delay(500);
  }
  throw extensionError(504, `${errorCode}_TIMEOUT`, message);
}

function mcpSummary() {
  return {
    name: "open-design",
    package: MCP_PACKAGE,
    containers: MCP_CONTAINERS,
    config: mcpConfig(),
    state: "configured",
  };
}

function mcpConfig() {
  return {
    type: "local",
    command: ["npx", "--yes", MCP_PACKAGE],
    environment: { OD_DAEMON_URL: SERVICE_URL },
    enabled: true,
  };
}

function dockerRequest(method, path, body, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    const request = httpRequest({
      method,
      path,
      socketPath: DOCKER_SOCKET_PATH,
      headers: {
        Accept: "application/json",
        ...(serialized === undefined ? {} : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(serialized) }),
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed;
        try {
          parsed = text ? JSON.parse(text) : undefined;
        } catch {
          parsed = undefined;
        }
        resolve({ status: response.statusCode || 500, body: parsed, text });
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(extensionError(504, "OPEN_DESIGN_DOCKER_TIMEOUT", "Docker operation timed out.")));
    request.on("error", (error) => reject(error.statusCode ? error : extensionError(503, "OPEN_DESIGN_DOCKER_UNAVAILABLE", "Docker socket is unavailable.")));
    if (serialized !== undefined) request.write(serialized);
    request.end();
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}

function unique(values) {
  return [...new Set(values)];
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extensionError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
