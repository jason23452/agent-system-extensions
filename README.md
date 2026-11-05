# Agent System Extensions

此 repo 是 Agent System Extensions 及共用 CLI 的公開原始碼工作區。Ticket 01 建立初始工作區與發布／宿主契約；各產品擴充套件內容及 CLI 功能由其負責票券交付。

## 工作區基線

- 使用 Node.js 24 LTS；npm workspaces 是 repo 的套件邊界。
- CLI 與每個 Extension 各自維護套件版本。五個 Extension workspace 皆以已決議的 2.0.0 內容為版本基線；CLI 使用獨立且尚未發布的 0.1.0 workspace 版本。
- Extension release 是不可變的 `.aicxt` artifact。Catalog 與 release 身分包含 extension ID、version 及 SHA-256；catalog 明確指定每個 Extension 的 latest 版本。
- `packages/contracts` 是版本化 release、catalog、package metadata、host、lifecycle、source-sync wire contract 與共用 conformance fixtures 的唯一維護位置。

GitLab Extension source-sync 由本 repo 的 `extensions/gitlab/` workspace 擁有；其他 Extension 與 CLI 內容由各自負責票券交付。

## GitLab Extension 驗證

在 repo 根目錄執行：

```sh
npm ci
npm run test --workspace=@agent-system/extension-gitlab
npm run typecheck --workspace=@agent-system/extension-gitlab
npm run build --workspace=@agent-system/extension-gitlab
```

套件建置輸出為 `extensions/gitlab/dist/gitlab-2.0.0.aicxt`；`dist/` 為忽略的本機產物，不提交到 source repo。
