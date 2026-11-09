import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(packageRoot, "source");
const outputRoot = process.argv[2] ? resolve(process.argv[2]) : undefined;
if (!outputRoot) throw new Error("Provide an isolated output directory for generated XMind workflow assets.");
const templatePath = join(sourceRoot, "workflows", "workflow-xmind.json");
const converterToolPath = join(packageRoot, "builder-tools", "xmind-to-markdown.ts");
const editToolPath = join(packageRoot, "builder-tools", "xmind-edit.ts");
const workflowPackagePath = join(outputRoot, "workflows", "workflow-xmind.json");
const planWorkflowPackagePath = join(outputRoot, "workflows", "workflow-xmind-plan.json");

const workflow = JSON.parse(await readFile(templatePath, "utf8"));
const converterTool = await readFile(converterToolPath, "utf8");
const editTool = await readFile(editToolPath, "utf8");

workflow.id = "workflow-xmind";
workflow.name = "XMind Workflow";
workflow.description = "XMind 讀取、Markdown 轉換、安全編輯與 AI 節點延伸 Agent App。";
workflow.metadata = {
  role: "xmind-extension",
  packageFormat: ".aicxt",
  packageArtifact: "xmind.aicxt",
  workflowAsset: "workflows/workflow-xmind.json",
  capabilities: ["xmind.read", "xmind.to-markdown", "xmind.edit", "xmind.generate"],
};
workflow.createdAt = "2026-01-01T00:00:00.000Z";
workflow.updatedAt = workflow.createdAt;

const command = workflow.nodes.find((node) => node.id === "command");
const agent = workflow.nodes.find((node) => node.id === "agent");
const converter = workflow.nodes.find((node) => node.id === "tool");
const skill = workflow.nodes.find((node) => node.id === "skill");
if (!command || !agent || !converter || !skill) throw new Error("The XMind workflow template is missing required nodes");
converter.data.content = converterTool;

command.data.name = "xmind";
command.data.content = [
  "---",
  "description: 讀取、轉換、編輯 XMind 與 AI 節點延伸",
  "agent: xmind-agent",
  "---",
  "先判斷 `$ARGUMENTS` 的工作模式。",
  "",
  "若內容包含 `\"mode\": \"expand-node\"` 或 `\"mode\":\"expand-node\"`，這是 XMind UI 的節點延伸請求：",
  "- 不讀取檔案、不呼叫任何 tool、不建立或修改 artifact。",
  "- 依 selectedNode、ancestry、existingChildren、instruction 與 count，產生指定數量的下一層節點。",
  "- 標題具體、互不重複、避免重述既有子節點，並沿用目前節點的語言。",
  "- 每個 title 最多 72 字元；note 為可選補充，最多 240 字元。",
  "- 唯一輸出必須是 `<xmind-nodes>{\"nodes\":[{\"title\":\"...\",\"note\":\"...\"}]}</xmind-nodes>`，不得加入 Markdown code fence、前言或解釋。",
  "",
  "其他模式才依下列檔案流程處理：",
  "- 先使用 xmind-edit tool 的 mode=read 讀取指定 .xmind，確認 nodeId 與目前結構。",
  "- 要求轉 Markdown 時，呼叫 xmind-to-markdown。",
  "- 要求修改 XMind 時，先列出 operations，只有使用者明確確認後才呼叫 xmind-edit 的 mode=edit。",
  "- 編輯預設輸出同名 .edited.xmind 與 .edited.md，不覆寫原始檔案。",
  "- 找不到節點或操作不明確時停止並回報，不猜測。",
  "",
  "使用者需求：",
  "$ARGUMENTS",
].join("\n");

agent.data.name = "xmind-agent";
agent.data.content = [
  "---",
  "name: xmind-agent",
  "description: 讀取、轉換與安全編輯 XMind .xmind 檔案",
  "mode: primary",
  "model: opencode/deepseek-v4-flash-free",
  "tools:",
  "  xmind-to-markdown: true",
  "  xmind-edit: true",
  "permission:",
  "  task: deny",
  "  edit: deny",
  "  write: deny",
  "  bash: deny",
  "  xmind-to-markdown: allow",
  "  xmind-edit: allow",
  "---",
  "你是 XMind 專用 Agent，所有心智圖檔案操作都必須以 .xmind 為來源或輸出。",
  "",
  "能力：",
  "1. 讀取 .xmind：使用 xmind-edit，mode=read，取得工作表、節點、備註、連結、狀態與 nodeId。",
  "2. 轉 Markdown：使用 xmind-to-markdown，輸出同名 .md；原始 .xmind 必須保留。",
  "3. 編輯 .xmind：先讀取並根據 nodeId 產生 operations 預覽，使用者明確確認後才使用 xmind-edit，mode=edit。",
  "",
  "編輯規則：",
  "- 支援 set-title、set-note、set-link、set-status、add、remove、move。",
  "- 不得猜測 parentId 或 nodeId；找不到就停止。",
  "- 預設輸出 source.edited.xmind 與 source.edited.md，不覆寫原始檔案。",
  "- 只有使用者明確要求且 overwrite=true 時才可覆寫來源。",
  "- 不直接讀取 ZIP binary，不使用 edit、write、bash 或 task。",
].join("\n");

converter.data.name = "xmind-to-markdown";
skill.data.name = "xmind";
skill.data.content = [
  "---",
  "name: xmind",
  "description: XMind AI 節點延伸、讀取、Markdown 轉換與安全編輯規則",
  "compatibility: opencode",
  "---",
  "# XMind",
  "",
  "- mode=expand-node 是純結構發想，不呼叫工具；只回傳 `<xmind-nodes>` 包覆的 nodes JSON。",
  "- AI 節點不得重複 existingChildren，須遵守 count 並沿用 selectedNode 語言。",
  "- 原始 .xmind 必須保留，除非使用者明確要求 overwrite=true。",
  "- 讀取與編輯先使用 xmind-edit mode=read 取得 nodeId。",
  "- 編輯只使用明確的 operations，不猜測節點。",
  "- 轉換使用 xmind-to-markdown，產生同名 Markdown artifact。",
  "- 編輯預設產生 .edited.xmind 與 .edited.md。",
].join("\n");

const expandAgentData = {
  mode: "managed",
  name: "xmind-node-agent",
  scope: "global",
  content: [
    "---",
    "name: xmind-node-agent",
    "description: 依目前節點脈絡產生專業且不重複的下一層 XMind 分支",
    "mode: subagent",
    "model: opencode/deepseek-v4-flash-free",
    "permission:",
    "  \"*\": deny",
    "---",
    "你是 XMind 節點架構 Agent。你只負責將目前選取節點延伸成清楚、互補且可執行的下一層分支。",
    "",
    "- 嚴格遵守 count，避免與 existingChildren 或彼此重複。",
    "- 沿用 selectedNode 的語言與領域用詞；每個節點只表達一個面向。",
    "- title 最多 72 字元；note 可選且最多 240 字元。",
    "- 不使用任何工具、不讀寫檔案，也不描述推理過程。",
    "- 唯一輸出是 `<xmind-nodes>{\"nodes\":[{\"title\":\"...\",\"note\":\"...\"}]}</xmind-nodes>`。",
  ].join("\n"),
};
const expandAgentNode = workflow.nodes.find((node) => node.id === "expand-agent");
if (expandAgentNode) {
  expandAgentNode.type = "resource.agent";
  expandAgentNode.position = { x: 380, y: 360 };
  expandAgentNode.data = expandAgentData;
} else {
  workflow.nodes.push({ id: "expand-agent", type: "resource.agent", position: { x: 380, y: 360 }, data: expandAgentData });
}

workflow.nodes = workflow.nodes.filter((node) => node.id !== "expand-command" && node.type !== "resource.plugin" && node.type !== "resource.mcp");
const editToolNode = workflow.nodes.find((node) => node.id === "edit-tool");
if (editToolNode) {
  editToolNode.type = "resource.tool";
  editToolNode.position = { x: 700, y: 300 };
  editToolNode.data = { mode: "managed", name: "xmind-edit", scope: "global", content: editTool };
} else {
  workflow.nodes.push({
    id: "edit-tool",
    type: "resource.tool",
    position: { x: 700, y: 300 },
    data: { mode: "managed", name: "xmind-edit", scope: "global", content: editTool },
  });
}
workflow.edges = workflow.edges.filter((edge) => !["plugin", "mcp", "expand-command"].includes(edge.source) && !["plugin", "mcp", "expand-command"].includes(edge.target) && !["edit-tool-agent", "expand-command-agent", "command-expand-agent", "agent-expand-agent"].includes(edge.id));
workflow.edges.push({
  id: "edit-tool-agent",
  source: "edit-tool",
  target: "agent",
  kind: "capability",
  sourceHandle: "capability",
  targetHandle: "capability",
});
workflow.edges.push({
  id: "agent-expand-agent",
  source: "agent",
  target: "expand-agent",
  kind: "delegation",
  sourceHandle: "delegation",
  targetHandle: "subagent",
});

const serializedWorkflow = `${JSON.stringify(workflow, null, 2)}\n`;
const planWorkflow = {
  schemaVersion: "agent-system.workflow.v3",
  id: "workflow-xmind-plan",
  name: "XMind Planning Workflow",
  description: "依整體需求產生完整 XMind 規劃的無工具 Agent App。",
  scope: "global",
  nodes: [
    {
      id: "command",
      type: "resource.command",
      position: { x: 100, y: 180 },
      data: {
        mode: "managed",
        name: "xmind-plan",
        scope: "global",
        content: [
          "---",
          "description: 依整體需求產生完整 XMind 規劃",
          "agent: xmind-plan-agent",
          "---",
          "依 `$ARGUMENTS` 產生一份可直接繪製的完整心智圖規劃。",
          "",
          "- 根據需求建立明確中心主題、6 至 10 個互補的一級分支，並視需要提供二至三級子節點。",
          "- 沿用使用者語言，節點簡潔、具體且不重複，不使用任何工具或檔案操作。",
          "- 唯一輸出是 `<xmind-plan>{\"title\":\"中心主題\",\"nodes\":[{\"title\":\"分支\",\"note\":\"可選\",\"children\":[]}]}</xmind-plan>`。",
          "- 不得加入 Markdown code fence、前言、分析或解釋。",
          "",
          "$ARGUMENTS",
        ].join("\n"),
      },
    },
    {
      id: "agent",
      type: "resource.agent",
      position: { x: 420, y: 180 },
      data: {
        mode: "managed",
        name: "xmind-plan-agent",
        scope: "global",
        content: [
          "---",
          "name: xmind-plan-agent",
          "description: 將整體需求轉成完整且專業的多層 XMind 規劃",
          "mode: primary",
          "model: opencode/deepseek-v4-flash-free",
          "permission:",
          "  \"*\": deny",
          "---",
          "你是 XMind 規劃 Agent。將使用者的整體需求整理成結構完整、分支互補且可直接繪製的心智圖。",
          "",
          "- 建立一個中心主題與 6 至 10 個一級分支，必要時加入二至三級 children。",
          "- 沿用需求語言；每個 title 最多 72 字元，note 最多 240 字元。",
          "- 不使用工具、不讀寫檔案、不描述推理。",
          "- 唯一輸出是 `<xmind-plan>{\"title\":\"中心主題\",\"nodes\":[{\"title\":\"分支\",\"note\":\"可選\",\"children\":[]}]}</xmind-plan>`。",
        ].join("\n"),
      },
    },
  ],
  edges: [
    {
      id: "command-agent",
      source: "command",
      target: "agent",
      kind: "capability",
      sourceHandle: "capability",
      targetHandle: "agent",
    },
  ],
  metadata: {
    role: "xmind-extension",
    packageFormat: ".aicxt",
    packageArtifact: "xmind.aicxt",
    workflowAsset: "workflows/workflow-xmind-plan.json",
    capabilities: ["xmind.plan"],
  },
  variables: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const serializedPlanWorkflow = `${JSON.stringify(planWorkflow, null, 2)}\n`;
await mkdir(join(outputRoot, "workflows"), { recursive: true });
await writeFile(workflowPackagePath, serializedWorkflow, "utf8");
await writeFile(planWorkflowPackagePath, serializedPlanWorkflow, "utf8");
console.log(JSON.stringify({ outputRoot, files: ["workflows/workflow-xmind.json", "workflows/workflow-xmind-plan.json"] }, null, 2));
