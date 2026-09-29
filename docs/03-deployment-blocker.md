# 部署卡關紀錄：Cloudflare

- 建立日期：2026-09-29
- 狀態：🔴 **未解決**，網站尚未上線
- 負責：交接給下一位處理者（Codex）

---

## 1. 目標

把本 repo 自動部署到 Cloudflare，取得一個公開網址，供親友試玩（企畫書 Q22、第 18.5 節）。
每次推送到 production branch 應自動重新建置與部署。

## 2. 目前 repo 狀態（已就緒，已驗證）

| 項目             | 狀態 | 說明                                                                             |
| ---------------- | ---- | -------------------------------------------------------------------------------- |
| 建置             | ✅   | `npm run build` 產出 `dist/`（Vite）                                             |
| 完整檢查         | ✅   | `npm run check`：型別、lint、格式、內容驗證、單元測試                            |
| GitHub Actions   | ✅   | `.github/workflows/check.yml` 在每次推送執行，最近一次通過                       |
| Node 版本        | ✅   | `.nvmrc` 指定 22                                                                 |
| Workers 部署設定 | ✅   | `wrangler.jsonc`：名稱 `age-of-exploration`，靜態資源目錄 `./dist`，SPA fallback |
| Wrangler 試跑    | ✅   | `npx wrangler deploy --dry-run` 成功（不需登入）                                 |
| 回應標頭         | ✅   | `public/_headers`：安全標頭、`/assets/*` 長期快取                                |
| Pages 相容       | ✅   | `wrangler.jsonc` 未設 `pages_build_output_dir`，Pages 流程會忽略它               |

分支：目前 repo **只有** `claude/gallant-bardeen-wewmq8` 一個分支，因此它也是預設分支。尚無 `main`。

## 3. 卡關過程

1. 擁有者表示已在 Cloudflare 連結 repo，但後台看不到任何部署網址。
2. 從 GitHub 端查詢：這個 repo 的 commit **沒有任何來自 Cloudflare 的 status、check run 或 deployment 紀錄**，只有 GitHub Actions 的檢查。
   代表 Cloudflare 從未對本 repo 觸發過建置，也就是專案尚未真正建立，或 Cloudflare 的 GitHub App 沒有這個 repo 的權限。
3. 擁有者在新版後台找不到 Pages 的建立入口（新版後台預設走 Workers 流程）。
   因此 repo 補上 `wrangler.jsonc`，讓後台預設的「Workers → Import a repository」流程也能部署。
4. 擁有者依 Workers 流程操作，專案名稱使用預設的 `age-of-exploration`，後台出現 **「an unknown error occurred」**，無法建立專案。

## 4. 未解決的錯誤與推測原因

錯誤訊息：建立 Workers 專案時，專案名稱欄位 `age-of-exploration` 顯示「an unknown error occurred」。

推測原因（未驗證，依可能性排序）：

1. **同名專案已存在**：擁有者先前「連結 repo」時，可能已建立名為 `age-of-exploration` 的 Worker 或 Pages 專案。
2. **帳號尚未設定 workers.dev 子網域**：第一次使用 Workers 的帳號須先註冊子網域，否則建立專案常出現不明錯誤。
3. **GitHub App 權限不足**：Cloudflare Workers and Pages 這個 GitHub App 未被授權存取本 repo。
4. **後台暫時性錯誤**。

## 5. 限制

- 先前處理者執行於雲端容器，網路政策封鎖 `*.pages.dev` 與 `*.workers.dev`，無法直接開啟部署網址驗證；也無法操作擁有者的瀏覽器或 Cloudflare 後台。
- repo 內**沒有** Cloudflare API token，也不應把 token 寫入 repo。

## 6. 解決時須遵守的約束

- 保持 `wrangler.jsonc` 的 `name` 與 Cloudflare 上的專案名稱**完全一致**，否則 Workers Builds 會失敗。
- 若改用其他專案名稱，同步修改 `wrangler.jsonc`，並更新 README「部署」段落。
- 不要提交任何密鑰。若採用 GitHub Actions 部署，改用 GitHub repository secrets（`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`）。
- 推送前必須通過 `npm run check` 與 `npm run build`。

## 7. 備案：改用 GitHub Actions 部署

若後台的 Git 整合一直無法建立，可改由 GitHub Actions 呼叫 wrangler 部署，完全不依賴後台的專案建立流程。
需要擁有者做的事：

1. 在 Cloudflare 建立 API Token（範本「Edit Cloudflare Workers」）。
2. 取得 Account ID（後台 Workers & Pages 總覽頁右側）。
3. 在 GitHub repo「Settings → Secrets and variables → Actions」新增 `CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID`。

repo 端需新增一個部署 workflow：在 `check` 通過後執行 `npm run build` 與 `npx wrangler deploy`。
第一次執行 `wrangler deploy` 會自動建立 Worker，因此不會遇到後台建立專案的錯誤。

## 8. 完成標準

- [ ] 取得可公開存取的網址，開啟後看到「Age of Exploration」劇本選單，瀏覽器主控台無錯誤。
- [ ] 推送到 production branch 後會自動重新部署。
- [ ] README「部署」段落記載實際採用的方式與網址。
- [ ] `docs/DEVLOG.md` 記錄解決方式；本文件狀態改為 🟢 並補上根本原因。
