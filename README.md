# Agent System Extensions

此 repo 維護 Extension 原始碼、共用 CLI 與跨 repo 發布／宿主契約。正式來源為公開 repo `jason23452/agent-system-extensions`；本機 worktree 的 build、測試與候選 artifact 不代表已建立 GitHub Release。

## 工作區與版本

- 使用 Node.js 24 LTS；npm workspaces 是 repo 套件邊界。
- 共用 CLI 與每個 Extension 各自維護版本；CLI 目前版本 `0.1.1`，GitLab Extension 首版 `2.0.0`。兩者的版本互不推導。
- Extension `.aicxt` 由 catalog 以 extension ID、版本、SHA-256、size 與每套 `latestVersion` 定位。CLI `.tgz` 與 Extension `.aicxt` 分開建立及發布。
- `packages/contracts` 是 release/catalog、package metadata、host、lifecycle 與 source-sync wire contract 的唯一維護位置。
- `extensions/gitlab/` 擁有完整 GitLab source-sync 及專屬 builder；共用 CLI 只呼叫其 build script，不複製 GitLab source 或 builder。

## 本機驗證

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`npm test` 使用 Node.js 內建 test runner，包含 CLI resolver/cache/API 行為與 npm tarball 安裝 smoke。測試只以替身替代外部 GitHub／平台 API 邊界；這不能替代部署 ingress 的真實 HTTP/runtime 驗收。

`npm run build` 建立 contracts、GitLab `.aicxt` 與自足 CLI 套件內容。主要輸出為：

- `extensions/gitlab/dist/gitlab-2.0.0.aicxt`
- `packages/cli/dist/`
- `packages/cli/dist/release/agent-system-extensions-cli-0.1.1.tgz`（執行 CLI release prepare 時產生）

`dist/` 為忽略的建置輸出。GitLab ZIP 含建置時間戳，release 時必須保留 prepare 所產生的 artifact，不能重建後以另一個 hash 覆寫同版本。

## 發布流程

先產生並審查候選，不會在一般 build/test 時建立遠端 Release：

```sh
node scripts/release.mjs prepare-extension --extension gitlab --version 2.0.0
node scripts/release.mjs prepare-cli
```

Extension prepare 會驗證 `.aicxt`、產生／更新 `catalog.json`，並寫入 `releases/<extension>/<version>.json` provenance。CLI prepare 使用 npm pack 產生獨立 `.tgz` 及 `releases/cli/<version>.json` provenance。兩者會拒絕同版異 hash，release asset 按建立時的 bytes 記錄。

**只有獨立 reviewer 通過、正式版本內容穩定且發布授權就緒後**，才可用 provenance 中原始 artifact 執行 `publish-extension` 或 `publish-cli`。發布命令需要明確 `--review-evidence <reference>`；同一 GitHub tag 若已有 release，僅驗證相同 asset hash，拒絕覆寫、追加缺失 asset 或同版異 hash。不得對 dev/integration branch 或非產品 repo 建立／更新 Release。

公開 catalog 固定讀取 `https://raw.githubusercontent.com/jason23452/agent-system-extensions/main/catalog.json`；不使用 repo 級 `releases/latest` 解析 Extension 版本。Extension asset tag 為 `<extensionId>-v<version>`，CLI asset tag 為 `cli-v<version>`。

## 共用 CLI

CLI 使用方式、cache、穩定退出碼與支援入口見 [`packages/cli/README.md`](packages/cli/README.md)。Node 24 Windows/Linux matrix 由 `.github/workflows/cli-contract.yml` 驗證。部署 ingress 與 runtime 真實安裝仍須由隔離 E2E fixture 驗收；單元測試不能宣稱已通過此項。
