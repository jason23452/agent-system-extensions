# Catalog v1 契約

權威結構為 [`packages/cli/schemas/catalog-v1.schema.json`](../packages/cli/schemas/catalog-v1.schema.json)，執行期額外驗證 SemVer prerelease、tag/channel/manifest 一致性、唯一 release identity 與 GitHub Release asset URL。

## 頂層

```json
{
  "schemaVersion": 1,
  "extensions": []
}
```

`schemaVersion` 固定為整數 `1`。`extensions` 是全部可取得的精確 Extension 版本；空陣列是有效目錄。

## Release 項目

每個項目包含：

- `id`：與 `.aicxt` root `extension.json.extensionId` 相同。
- `version`：SemVer，與 tag 和 manifest 相同。
- `channel`：正式版 `stable`；包含 prerelease 的 SemVer 為 `dev`。SemVer build metadata 不改變 channel。
- `tag`：`<id>-<version>`。
- `asset`：唯一 `.aicxt` 的名稱、匿名公開 GitHub Release URL、原始位元組 SHA-256 小寫 hex 及 byte size。
- `compatibility.agentSystem`：manifest 宣告的 host range；未宣告時使用 `*`（沒有額外限制）。其他 compatibility 欄位可由後續 package contract 擴充。
- `metadata`：`displayName`、`description` 與完整 package `metadata` 物件，供目錄消費端使用；目錄不含套件的程式碼內容。

Release URL 固定為 `https://github.com/jason23452/agent-system-extensions/releases/download/<tag>/<tag>.aicxt`。下載器會先完整驗證目錄，再依指定 `id`、`channel`、`version` 唯一選取；缺少或不相符即失敗，不查 repo `latest`。

Catalog updater 只 GET 目前 `main/catalog.json`、驗證 schema 並原子寫入呼叫端指定路徑；不解析 Release、不下載 `.aicxt`、不安裝套件。

## 發布與併發

Extension Release 一經存在不得替換 tag、prerelease 狀態或 `.aicxt` 位元組。相同 tag 的重試只在遠端 asset 與本地候選完全相同時視為冪等；不同內容必須失敗。Catalog 更新以 Contents API 的 blob SHA 做 optimistic concurrency：發生衝突時重新讀取最新 catalog 並合併新已發布項目，保留既有項目；相同 `id`／`version` 的內容衝突拒絕發布。

`synthetic-` ID 與 `metadata.distributionTestFixture: true` 僅供外部發布流程測試。Synthetic catalog 附在對應的測試 Release 作為 `synthetic-catalog.json`，不得寫入正式 `catalog.json`。
