# Azure DevOps Platform

Project-scoped Azure DevOps Extension 套件。`2.0.0` 首版依 [`source.json`](source.json) 記錄的 source tree 重建；backend、frontend、Project 設定、Plugin、Tools、Skills 與退役 MCP context migration 均由套件負責。

Backend 會先驗證 PAT，再保存至受保護的 Extension secret store。Runtime Project identity 由 Agent System host 提供，不從未信任的 Tool input 推導。
