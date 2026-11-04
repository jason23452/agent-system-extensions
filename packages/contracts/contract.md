# Extension Release 與宿主 Wire Contract v1

`contractVersion` 為 `1.0.0`。所有 schema 都有獨立 `schemaVersion`；未知版本、非法完整性資料及不相容的 host requirement 必須明確拒絕。新增可選欄位採向後相容；改變欄位意義或必要欄位時升 schema version。

## Release、catalog 與 identity

- Release schema 為 `agent-system.extension-release.v1`，包含 `extensionId`、semver `version`、公開 GitHub HTTPS artifact URL、SHA-256 與 25 MiB 內的 byte size、`hostRequirements` 及可用 metadata。
- Catalog schema 為 `agent-system.extension-catalog.v1`。每個 Extension 有明確 `latestVersion` 與不可變 releases；latest 必須指向 catalog 內的確切版本。不得用 repo 級 GitHub `releases/latest` 推導。
- 安裝身分包含 extension ID、version、archive SHA-256、scope 與 Project。Release identity 為 ID／version／hash；同 ID／version 的不同 hash 是不同內容且不得覆寫同版 release。Catalog 不接受同一 Extension 內重複 version。
- `hostRequirements` 定義 SemVer precedence 的 `minHostVersion`、可選排除上界及必需 host capabilities；prerelease 順序依 SemVer 比較，build metadata 不影響 precedence。Schema 合法不表示 host 相容；呼叫端還需以實際 host 版本與能力作明確相容判定。

## Package metadata、host API 與 contributions

- Extension package 保留 `metadata` 的 Extension-owned JSON 欄位；通用 host 驗證 `aliases`、icon token 與 `fileAssociations`，但不刪除未由 host 解讀的既有 package metadata。
- `hostContract` 宣告 versioned settings schema、非機密 context 欄位與版本遷移。Settings values 屬於該 Extension；`host.readSettings()` 為零參數介面，由 host 綁定目前安裝的 scope／Project，套用於 install lifecycle 與一般 hook 呼叫。Extension 不得以傳入任意 scope 或 Project 來擴大讀取範圍。
- Host context 僅包含 host 注入且已驗證的 Extension identity、scope、Project、target 與 operation identity；不得將秘密值放入 context 或 Agent input。敏感設定只能依 host 設定 API／credential boundary 取得。
- Contribution metadata 以 kind/name 為 identity，可選宣告 aliases、icon 與 file associations；宣告不代表 runtime contribution 已驗證可用。

## Lifecycle status、source sync

- Lifecycle status 固定 `operationId` 及完整安裝身分，可表示 running／succeeded／failed／unknown、是否 completed 及 retry action。Retry request 只能針對相同 operation ID 與 identity 執行 `query-status` 或 `resume`；`unknown` 必須先 query-first。成功的 completed 作業重試不新增副作用，且相同操作的 status 保持相同 operation ID。
- Source sync 分別保存設定的 `desiredUrl`、操作的 `sourceUrl`，及 Main／workflow-test target 的實際 `appliedSourceUrl`、revision、content hash 與 readiness。換來源同步失敗時，desired 與 operation 可指向新 URL，但每個 target 保留舊 applied URL／revision／hash，不能標成新來源已生效。`appliedSourceUrl` 為必填欄位：URL 表示已知實際生效來源，`null` 表示未知（包含舊狀態未記錄來源）；消費端遇 `null` 必須顯示未知，絕不從 desired 或 operation URL 推論。清除 URL 以 `not-configured`／`null` 表示，且不抹除先前已知的 applied URL。Operation 保存 candidate identity、completed 與 retry action；`unknown` 同樣必須 query-first。
- Candidate resource change set 區分 added／modified／deleted；它是待套用候選，不代表兩個 target 均已生效。

## Conformance fixtures

`fixtures/v1/manifest.json` 列出兩 repo 共用的合法、非法、host 不相容、狀態與同步案例。外部 contracts test 與宿主 contract test 都逐案驗證相同期望，包含同版異 hash 衝突、既有 metadata、`unknown` 先查詢與清空來源保留 applied target。
