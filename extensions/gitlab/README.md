# GitLab Skills Extension

GitLab Extension 以每個 Project 自己保存的 HTTP(S) clone URL 為來源。安裝時不需要設定 URL；儲存或清除 URL 不會 clone，只有明確同步或重試才會讀取來源。

同步會先在暫存目錄 clone 並驗證完整候選，再以 `SKILL.md` frontmatter 的 `name` 作為 Skill identity，更新原生 `.opencode/skills/<name>/` 內容與 selector 清單。來源 URL 不接受內嵌帳密、query 或 fragment；此 Extension 不讀取環境變數作為來源 fallback，也不使用固定 repository URL。

宿主負責保存通用 source-sync operation、各 runtime receipt、readiness 與 change set。候選檔案只交給宿主套用；此套件不修改 Workflow graph、release snapshot 或 grants。

## 驗證與建置

在外部 Extensions repo 根目錄執行：

```sh
npm run test --workspace=@agent-system/extension-gitlab
npm run typecheck --workspace=@agent-system/extension-gitlab
npm run build --workspace=@agent-system/extension-gitlab
```

測試使用本機受控 HTTP Git fixture，不連線正式 GitLab 或使用者憑證。建置產物為 `dist/gitlab-2.0.0.aicxt`，此目錄已加入 Git 忽略清單。
