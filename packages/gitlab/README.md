# GitLab Skills

單一 project-scoped `gitlab` Plugin 管理 Project 的直接及巢狀 Skills。每個 Project 的 clone URL 與同步分開儲存；URL 為空時不會 clone，也不會移除已同步 Skills。同步會先驗證完整 clone candidate，再分別套用到 `main` 和 `workflow-test`；target 失敗後可重試，且不重寫已同步完成的 target。遷移來源見 [`source.json`](source.json)。
