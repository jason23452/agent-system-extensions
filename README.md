# Agent System Extensions 分發 repo

此公開 repo 維護共用 Extension Catalog 契約、精確版本下載器、僅更新 catalog 的 CLI，以及發布自動化。目前尚未包含五套正式 Extension；其來源與首批正式版由 Ticket 02 負責。

## Release 契約

- Extension release tag 格式固定為 `<extensionId>-<SemVer>`，例如 `gitlab-2.1.0-dev.1`。Tag、`.aicxt` 根目錄 `extension.json` 的身分／版本，以及 Release prerelease 標記必須一致。
- 每個 Release 恰有一個名為 `<tag>.aicxt` 的套件 asset，例如 `gitlab-2.1.0-dev.1.aicxt`。Workflow 會驗證 ZIP archive 與 manifest、保留既有 asset 位元組，並匿名讀回確認大小與 SHA-256。
- Stable SemVer 對應 `stable`；SemVer prerelease 對應 `dev`，且 GitHub Release 必須標記為 prerelease。Build metadata 不改變 channel。
- `catalog.json` 採 schema v1（`packages/cli/schemas/catalog-v1.schema.json`）。每筆項目固定 `id`、`version`、`channel`、tag、公開 asset URL、SHA-256、大小、host 相容性與套件 metadata。Catalog 選版不使用 repo-wide `latest`。
- Catalog 更新只會累加，不移除舊版本。GitHub Contents API 寫入會附上目前檔案 SHA；併發衝突時，job 重新讀取最新 catalog，與已發布 Release 合併後重試。同一 `id`／version 的 metadata 衝突會直接失敗，不覆寫已發布身分。
- `synthetic-` ID namespace 專供分發測試。公開 workflow 會在測試 Release 附加 `synthetic-catalog.json` 供匿名驗證，但不會寫入正式 `catalog.json`。
- CLI 使用 `cli/v<version>` tag 發布零相依 npm `.tgz`。套件只作為 GitHub Release asset 發布，不會上傳 npm registry。

## CLI 使用（Node.js 24+）

### 精確版本套件下載

```powershell
npx --yes --package="https://github.com/jason23452/agent-system-extensions/releases/download/cli/v1.0.0/agent-system-extension-distribution-cli-1.0.0.tgz" -- aicxt-download --id gitlab --channel stable --version 2.0.0 --output gitlab-2.0.0.aicxt
```

此命令只下載 catalog 指定的精確項目，並在寫入目的檔前驗證位元組。版本不存在或 hash 不符時會失敗，不會 fallback 到 `latest`。如需指定其他 catalog 來源，使用 `--catalog <url>`。

### 僅更新 catalog

```powershell
npx --yes --package="https://github.com/jason23452/agent-system-extensions/releases/download/cli/v1.0.0/agent-system-extension-distribution-cli-1.0.0.tgz" -- extension-catalog --output .\catalog.json
```

此命令取得並驗證目前完整的公開 `catalog.json`；不會下載 `.aicxt` asset，也不會安裝或切換 Extension。未指定 `--output` 時，通過驗證的 JSON 會輸出至 stdout。

### 本機安裝

```powershell
Invoke-WebRequest "https://github.com/jason23452/agent-system-extensions/releases/download/cli/v1.0.0/agent-system-extension-distribution-cli-1.0.0.tgz" -OutFile .\agent-system-extension-distribution-cli-1.0.0.tgz
npm install --global .\agent-system-extension-distribution-cli-1.0.0.tgz
aicxt-download --help
extension-catalog --help
```

Linux 請使用 `curl -fL <release-asset-url> -o agent-system-extension-distribution-cli-1.0.0.tgz` 下載，再執行 `npm install --global ./agent-system-extension-distribution-cli-1.0.0.tgz`。

## 維護者流程

- 使用 Node 24 執行 `npm test`；測試只使用 Node 內建 test runner，無需安裝步驟。
- `npm run fixture:build` 可確定性地重建保留的 synthetic `.aicxt`；`npm run fixture:verify` 驗證已追蹤 archive 可重現。
- 發布 Extension 時，先將已驗證的 `.aicxt` 放在 `packages/<extensionId>/<extensionId>-<SemVer>.aicxt`，再推送完全相符的 tag。Release workflow 會建立不可變 Release 並更新完整 catalog。
- 發布 CLI 時推送 `cli/v<package-version>`。Workflow 會打包並附加 `.tgz`；不執行 `npm publish`。
