# 部署卡關紀錄：Cloudflare

- 建立日期：2026-09-29
- 狀態：🟢 **已解決**，公開網站與推送自動部署均驗證通過
- 處理：Codex，2026-09-29
- 公開網址：[Age of Exploration](https://age-of-exploration.odyliao-pikmin.workers.dev/)

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

## 4. 原始錯誤、排查與解決方式

錯誤訊息：建立 Workers 專案時，專案名稱欄位 `age-of-exploration` 顯示「an unknown error occurred」。

交接時的推測原因（以下保留歷史紀錄，實際排查結果見後文）：

1. **同名專案已存在**：擁有者先前「連結 repo」時，可能已建立名為 `age-of-exploration` 的 Worker 或 Pages 專案。
2. **帳號尚未設定 workers.dev 子網域**：第一次使用 Workers 的帳號須先註冊子網域，否則建立專案常出現不明錯誤。
3. **GitHub App 權限不足**：Cloudflare Workers and Pages 這個 GitHub App 未被授權存取本 repo。
4. **後台暫時性錯誤**。

### 2026-09-29 接手後的實際檢查

- **同名專案已排除**：在正確 Cloudflare 帳戶的「Workers 和 Pages」選擇「顯示全部」，清單只有既有的 `pikmin-mush-maintenance`，沒有 `age-of-exploration` Worker 或 Pages 專案。
- **子網域已排除**：「帳戶詳細資料 → 子網域」已有 `odyliao-pikmin.workers.dev`，不需要重新註冊或改名。
- **repo 可見性已確認**：「建立應用程式 → Continue with GitHub」的帳戶為 `odyliao-lab`，可列出並選取 `Age-of-Exploration`。GitHub「Settings → Applications → Installed GitHub Apps」也已列出 `Cloudflare Workers and Pages`。進一步開啟 `Configure` 需要擁有者完成 GitHub 的 `Confirm access → Verify via email`。
- **重試前尚無 Cloudflare 建置**：提交 `c71c9081e30ad576edf7ced19d70dfb9bbe780b5` 只有 GitHub Actions `check` 成功，沒有 Cloudflare check、commit status 或 deployment；帳戶的 Workers 組建分鐘數為 0。
- **匯入表單的額外前置條件**：「進階設定 → API Token」只有「建立新 Token」。取得擁有者同意後，明確選取它並填入 `age-of-exploration-build`，再按「部署」，成功建立同名 Worker 與首次建置。此憑證由 Cloudflare 管理，未複製到 repo。

### 根本原因與證據界限

已定位的故障環節是 **Cloudflare 後台的專案／Git 建置初始化**：原先專案沒有建立完成，因此根本沒有執行 repo 的建置或部署命令。不是 Vite 建置、`wrangler.jsonc` 名稱不符、同名專案或缺少 `workers.dev` 子網域造成的建置失敗。

本次明確建立並指定建置 Token 後，同一名稱、repo、分支及原有 `wrangler.jsonc` 即可成功部署。**原始 `an unknown error occurred` 未留下 API 錯誤碼，且本次未再出現，因此無法證明其更深層內部原因就是 Token 欄位、權限或 Cloudflare 暫時性故障。** 不將成功重試的相關性寫成已證實的後端根因。

### 實際採用的部署方式

1. 「Workers 和 Pages → 建立應用程式 → Continue with GitHub」。
2. 帳戶選 `odyliao-lab`，選取 `Age-of-Exploration`，按「下一步」。
3. 專案名稱 `age-of-exploration`；組建命令 `npm run check && npm run build`；部署命令 `npx wrangler deploy`；根目錄 `/`。
4. 「進階設定 → API Token → 建立新 Token」，Token 名稱填 `age-of-exploration-build`，按「部署」。
5. 「設定 → 組建」確認生產分支為 `claude/gallant-bardeen-wewmq8`、包括路徑為 `*`、沒有排除路徑。

首次建置 ID：`d058ed7b-8e92-4c6e-8974-70dc89f0edd7`；2026-09-29 11:11（Asia/Taipei）完成，日誌顯示 Node `22.23.3`、完整檢查與 build 成功、`Success: Deploy command completed`。Worker 版本為 `a80dddd7-211f-486d-a46a-b817f1db4291`。

已從公開網址驗證劇本選單、瀏覽器主控台無 error/warning、首頁與 JS/CSS 為 HTTP 200、安全標頭、靜態資源 `max-age=31536000, immutable`，以及導航到其他路徑時的 SPA fallback。

### 推送自動部署驗收

- 推送提交 [`350f205`](https://github.com/odyliao-lab/Age-of-Exploration/commit/350f2054be51472869d5c939b45fef0bde9c6885) 後，Cloudflare 自動觸發建置 `ac118223-7e63-428c-83f9-2eeca0f9628e`，無需手動重試或再按部署。
- GitHub 同一提交的 `check` 與 `Workers Builds: age-of-exploration` 均成功；Cloudflare 日誌再次通過 5 個測試、build 與 `wrangler deploy`。
- 2026-09-29 11:16（Asia/Taipei）完成自動部署，Worker 版本更新為 `27838b6b-52c0-433e-afba-c9038bebded5`。
- GitHub Actions 檢查：[run 36516377112](https://github.com/odyliao-lab/Age-of-Exploration/actions/runs/36516377112)。

## 5. 限制

- 先前處理者執行於雲端容器，網路政策封鎖 `*.pages.dev` 與 `*.workers.dev`，無法直接開啟部署網址驗證；也無法操作擁有者的瀏覽器或 Cloudflare 後台。
- repo 內**沒有** Cloudflare API token，也不應把 token 寫入 repo。

## 6. 解決時須遵守的約束

- 保持 `wrangler.jsonc` 的 `name` 與 Cloudflare 上的專案名稱**完全一致**，否則 Workers Builds 會失敗。
- 若改用其他專案名稱，同步修改 `wrangler.jsonc`，並更新 README「部署」段落。
- 不要提交任何密鑰。若採用 GitHub Actions 部署，改用 GitHub repository secrets（`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`）。
- 推送前必須通過 `npm run check` 與 `npm run build`。

## 7. 備案：改用 GitHub Actions 部署

**本次未採用**：Workers Git 整合已成功建立。保留此節供未來 Git 整合故障時使用，避免同時啟用兩套部署。

若後台的 Git 整合一直無法建立，可改由 GitHub Actions 呼叫 wrangler 部署，完全不依賴後台的專案建立流程。
需要擁有者做的事：

1. 在 Cloudflare 建立 API Token（範本「Edit Cloudflare Workers」）。
2. 取得 Account ID（後台 Workers & Pages 總覽頁右側）。
3. 在 GitHub repo「Settings → Secrets and variables → Actions」新增 `CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID`。

repo 端需新增一個部署 workflow：在 `check` 通過後執行 `npm run build` 與 `npx wrangler deploy`。
第一次執行 `wrangler deploy` 會自動建立 Worker，因此不會遇到後台建立專案的錯誤。

## 8. 完成標準

- [x] 取得可公開存取的網址，開啟後看到「Age of Exploration」劇本選單，瀏覽器主控台無錯誤。
- [x] 推送到 production branch 後會自動重新部署。
- [x] README「部署」段落記載實際採用的方式與網址。
- [x] `docs/DEVLOG.md` 記錄解決方式；本文件狀態改為 🟢，並記載故障定位與根本原因的證據界限。
