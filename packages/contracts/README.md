# 共用 Extension 契約

`@agent-system/extension-contracts` 是外部 Extension repo 的 wire contract 唯一定義來源。它提供 TypeScript 型別、執行期驗證器與版本化 fixtures，供 catalog、CLI、Extension workspace 與宿主按同一規則互通。

```sh
npm run build --workspace=@agent-system/extension-contracts
npm test --workspace=@agent-system/extension-contracts
```

Fixture corpus 位於 `fixtures/v1/`。宿主 repo 的 `backend/test/fixtures/extension-contracts/v1/` 是同版 conformance 副本；新增或修改案例時兩邊必須同一個變更一併更新，不能建立不同的期望結果。

詳細 wire semantics 見 `contract.md`。
