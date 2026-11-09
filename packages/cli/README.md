# Extension 分發 CLI

此 Node.js 24 LTS CLI 套件提供兩個職責分離的命令：

- `aicxt-download`：依精確的 `id`／`channel`／`version` 下載 catalog 指定 asset，寫入目的檔前驗證位元組大小與 SHA-256。
- `extension-catalog`：取得並驗證最新完整的公開 `catalog.json`；不下載或安裝 `.aicxt` asset。

兩個命令均無相依套件，並以預先建置的 npm tarball 附加於 `jason23452/agent-system-extensions` 的 GitHub Release `cli/v<version>`。
