# Agent System Extensions CLI

共用 CLI 是獨立版本的 Node.js 24 npm 套件；消費者取得預建 `.tgz` 即可執行，不需安裝 Git、TypeScript 或編譯工具。Extension 來源與本地 `.aicxt` 都會進入相同的 archive identity／完整性檢查與平台安裝流程。

## 指令

```text
agent-system-extensions install <extension-id> --platform <url> --scope <project|global> [--project <name>] [--version <semver>]
agent-system-extensions update <extension-id> --platform <url> --scope <project|global> [--project <name>] [--version <semver>]
agent-system-extensions install --file <package.aicxt> --platform <url> --scope <project|global> [--project <name>]
agent-system-extensions status --operation <id>
agent-system-extensions retry --operation <id>
agent-system-extensions pack <extension-directory> --output <package.aicxt>
agent-system-extensions validate <package.aicxt>
```

所有安裝都必須明確提供 `--platform` 及 `--scope`；project scope 另須 `--project`。cwd 與 npm cache 位置不會改變目標。平台 URL 必須是無帳密、query 或 fragment 的絕對 HTTP(S) 基底 URL。CLI 不新增認證系統，也不會猜測／連接內網平台。

- 未指定 `--version` 的遠端安裝只從指定 Extension 的 catalog `latestVersion` 解析一次，之後以固定 version／SHA-256 驗證並安裝。
- `--file` 接受本地 `.aicxt`；若同時提供位置 `extension-id`、`--version` 或 `--sha256`，都會核對封存 identity。
- `update` 預設送出 `extend=true`；可用 `--extend false` 明確覆寫。`install` 預設 `extend=false`。
- `status` 只查詢已保存的 operation；`retry` 先 query-status，只有平台回覆 `retryAction=resume` 才送 resume。`unknown` 保持 query-first，不盲目重送安裝副作用。
- `pack` 以安全的 ZIP store 格式打包來源目錄，拒絕 symlink、路徑穿越、重複檔名或不合法 manifest；輸出檔若已存在就拒絕覆寫。
- `validate` 檢查 `.aicxt` ZIP、manifest identity、必要檔案及宣告的 SHA-256 integrity。

例：

```powershell
agent-system-extensions install gitlab --platform http://localhost:3000 --scope project --project demo-project --version 2.0.0
agent-system-extensions status --operation 6f23787f-1c03-4a1d-a61f-26e9c1c1f924
```

`gitlab` 為 project scope。未設定 GitLab Project clone URL 時，安裝套件不會 clone；設定與明確同步屬 GitLab Extension 的另一段產品行為。

## 版本與完整性快取

Windows 預設為 `%LOCALAPPDATA%\AgentSystem\extensions`；Linux 預設為 `$XDG_CACHE_HOME/agent-system/extensions`，未設定 XDG 時使用 `~/.cache/agent-system/extensions`。可使用 `AGENT_SYSTEM_EXTENSIONS_CACHE` 或 `--cache-dir` 覆寫。產品 cache 與 npm/npx bootstrap cache 分離。

快取路徑以 Extension ID/version/SHA-256 固定識別。`--offline` 不讀 catalog、不連 GitHub，必須提供 `--version`；若同一版本沒有唯一 SHA，可加 `--sha256` 固定內容。缺少、損毀或 hash 不符時明確失敗，不改用其他版本；平台仍須可連線才能完成上傳安裝。

下載流程先驗 catalog contract、HTTP status/media type、artifact size、SHA-256、封存 ID/version 與 manifest integrity，再將驗證過的原始 bytes 原樣放入 multipart。GitHub redirect 只在 HTTPS 下接受；HTML、錯版、同版異 hash 不會轉成成功結果或 fallback 到 latest。

## 狀態、錯誤及退出碼

JSON 輸出可在任意指令加 `--json`。`status`、`retry` 與 install 回報平台的 operation phase、stage、Main/Workflow-test target 狀態及 catalog entry 數。

| 退出碼 | 意義 |
| --- | --- |
| `0` | 命令成功；安裝 operation 已完成 |
| `2` | 命令／參數錯誤 |
| `3` | catalog、release、下載或快取來源失敗 |
| `4` | 平台 HTTP／operation 契約失敗；install operation ID 仍保存供查詢 |
| `5` | 安裝部分完成、失敗、執行中或結果 unknown；依 status/retry 結果續跑 |
| `6` | 本地套件、pack、validate 或 release artifact 錯誤 |

錯誤 JSON 形狀為 `{"error":{"code":"...","message":"..."}}`，可能附安全的身分／階段診斷資料，不輸出 request body、憑證或秘密。

## 開發與本地安裝

在 Extensions repo 根目錄：

```sh
npm ci
npm run build --workspace=@agent-system/extension-contracts
npm run build --workspace=@agent-system/extensions-cli
npm run test --workspace=@agent-system/extensions-cli
npm run typecheck --workspace=@agent-system/extensions-cli
```

`npm test` 會打包 CLI tarball，使用獨立乾淨 npm cache 執行 `npm exec`，並測試本地安裝；這只驗證本地 artifact 啟動，不能代替正式 GitHub Release 的匿名 npx 驗收。

正式 CLI `.tgz` 範例（**僅在該版本已經過獨立 review 並正式發布後使用**）：

```sh
npx --yes --package=https://github.com/jason23452/agent-system-extensions/releases/download/cli-v0.1.0/agent-system-extensions-cli-0.1.0.tgz agent-system-extensions --help
```

正式發布與 immutable tag 規則見 repo 根目錄 README；不得以本機 build 產物冒稱 GitHub 匿名下載驗收。
