# 交接文件：第 7 週外部服務設定（給 Codex）

- 建立日期：2026-09-29
- 交接人：Claude（負責遊戲程式開發）
- 接手：Codex（負責需要登入後台的設定）
- 狀態：🟢 A、B、C、D 外部服務設定完成；登入與雲端同步程式交由 Claude 接續

---

## 0. 背景

「大航海地理」是一個 Vite + React + PixiJS 的 PWA 教育遊戲，第 1–6 週已完成並部署在
<https://age-of-exploration.odyliao-pikmin.workers.dev/>（Cloudflare Workers Builds，見 `docs/03-deployment-blocker.md`）。

第 7 週要加上 **Google 登入與雲端存檔**（企畫書 Q21），採用 Supabase Auth。程式碼由 Claude 撰寫；
本文件列出**必須在擁有者帳號後台操作**的設定，請 Codex 在擁有者同意下代為完成。

本次也要把 repo 改成以 `main` 為主分支：`main` 已由 Claude 建立，指向提交 `8577892`，與開發分支 `claude/gallant-bardeen-wewmq8` 相同。

## 1. 任務清單

### A. 分支設定（GitHub 與 Cloudflare）

分支模式：`main` 是正式版（production），`claude/gallant-bardeen-wewmq8` 是開發分支；開發完成後以 PR 合併進 `main`。

1. GitHub → repo **Settings → General → Default branch**：改為 `main`。
2. Cloudflare → Workers & Pages → `age-of-exploration` → **Settings → Build**：
   - **Production branch**：改為 `main`。
   - **Non-production branch builds**：開啟，讓開發分支的每次推送也建置出預覽版本（preview URL），方便驗證。
3. 驗證：
   - 在開發分支推送任一提交，確認 `Workers Builds: age-of-exploration` 仍成功，並且產生的是 **preview**，不會覆蓋正式網址。
   - 正式網址仍能開啟（目前 `main` 與開發分支內容相同）。

### B. Supabase 專案

完整步驟見 `docs/04-google-login-setup.md` 第 1、3 節，重點如下：

1. 在擁有者的 Supabase 帳號建立專案 `age-of-exploration`，Region 選 Tokyo 或 Singapore。
   資料庫密碼由擁有者保存，**不要**寫進 repo 或回報內容。
2. **SQL Editor**：貼上並執行 `supabase/migrations/0001_saves.sql`（可重複執行）。
   - 驗證：**Table Editor** 中出現 `saves` 表，**RLS enabled**，有 4 條 policy（select、insert、update、delete，各限自己的資料）。
3. **Authentication → Sign In / Providers → Google**：啟用，填入 C 步驟取得的 Client ID 與 Client Secret。
4. **Authentication → URL Configuration**：
   - Site URL：`https://age-of-exploration.odyliao-pikmin.workers.dev`
   - Redirect URLs：
     - `https://age-of-exploration.odyliao-pikmin.workers.dev/**`
     - `http://localhost:5173/**`
     - 若 A 步驟產生的預覽網址有固定格式（例如 `https://*-age-of-exploration.odyliao-pikmin.workers.dev/**`），也一併加入。

### C. Google OAuth 用戶端

完整步驟見 `docs/04-google-login-setup.md` 第 2 節。

1. Google Cloud Console 建立專案 `age-of-exploration`。
2. OAuth 同意畫面：
   - 外部使用者，應用程式名稱 `大航海地理`，範圍只要 `openid`、`email`、`profile`。
   - 發布狀態維持 **Testing**，並加入擁有者提供的試玩者 Gmail 為測試使用者。名單請向擁有者索取，不要自行猜測。
3. 建立「網頁應用程式」OAuth 用戶端：
   - JavaScript 來源：`https://age-of-exploration.odyliao-pikmin.workers.dev`、`http://localhost:5173`
   - 重新導向 URI：`https://<project-ref>.supabase.co/auth/v1/callback`
4. 把 Client ID 和 Client Secret 填進 Supabase（B-3）。**Client Secret 不要**寫進 repo 或回報內容。

### D. Cloudflare 建置變數

Cloudflare → `age-of-exploration` → **Settings → Build → Variables and secrets**，production 與 preview 都要設：

- `VITE_SUPABASE_URL`：`https://<project-ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY`：Supabase 的 Publishable key（或舊版 anon）

注意：這是**建置階段**的變數，Vite 會在 build 時寫進前端，不是 Worker runtime 變數。

## 2. 約束

- **絕不提交或回報**：資料庫密碼、`service_role`／secret key、Google Client Secret、Cloudflare API token。
- 可以寫進 repo 的只有 Project URL 與 Publishable（anon）key，這兩個本來就公開在前端。
- 不修改 `src/` 的程式碼；登入與同步功能由 Claude 在第 7 週實作。
- 若需要提交文件，推送到開發分支 `claude/gallant-bardeen-wewmq8`，不要直接推送到 `main`。推送前須通過 `npm run check` 與 `npm run build`。
- `wrangler.jsonc` 的 `name` 必須維持 `age-of-exploration`。
- Windows 環境注意：repo 使用 LF 換行，Prettier 檢查會拒絕 CRLF。

## 3. 完成後請回填

把以下內容寫在本文件最後的「4. 設定結果」，並把狀態改為 🟢；同時在 `docs/DEVLOG.md` 最上方加一筆紀錄：

- [x] GitHub 預設分支已改為 `main`
- [x] Cloudflare production branch 已改為 `main`，開發分支推送會產生 preview（附一個 preview 網址範例與其格式）
- [x] Supabase Project URL：`https://rixgyxhgmeshvahwzmts.supabase.co`
- [x] Supabase Publishable（anon）key：`sb_publishable_Fqpyj5dZ0qM3iXwGZFQhxQ_PpaHHODN`
- [x] `saves` 表已建立，RLS 開啟，4 條 policy 存在
- [x] Google Provider 已啟用；Redirect URLs 已設定（實際值見 B 節）
- [x] Google OAuth 同意畫面為 Testing，已加入 2 位測試使用者（不記錄信箱）
- [x] Cloudflare 建置變數 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 已設定（production 與 preview）
- [x] 遇到的問題或與本文件不同的操作已記錄（見 E 節）

## 4. 設定結果

### A. 分支設定（2026-09-29）

- GitHub 預設分支已改為 `main`，既有 `main` 仍指向 `857789284e80a796b7e9d9ebc1202ab0ea49e9ef`；本次沒有直接推送 `main`。
- Cloudflare production branch 已改為 `main`。
- 新版後台「設定 → 組建 → Previews Base」的「Worker 預覽的建置」已啟用，預覽命令為 `npx wrangler preview`，組建命令仍為 `npm run check && npm run build`。
- 開發分支比 `main` 多出的原有提交只有第 7 週設定文件、`.env.example` 與 SQL，遊戲程式相同。
- 第一次 preview 建置（提交 `5c04b5a`）的 check 與 build 成功，部署因缺少 `previews` 區塊失敗。已在 `wrangler.jsonc` 補上 `"previews": {}`；這是新版 Worker Previews 的必要設定，靜態資源仍使用頂層 `assets`。
- 提交 `c312abb` 的 GitHub `check` 與 `Workers Builds: age-of-exploration` 都成功；Cloudflare build ID 為 `a59383a4-748f-4356-b081-973fd7d9be5d`，預覽部署 ID 為 `5a256a6a`。
- 固定分支 preview：<https://claude-gallant-bardeen-wewmq8-age-of-exploration.odyliao-pikmin.workers.dev/>。
- 單次部署網址：<https://5a256a6a-age-of-exploration.odyliao-pikmin.workers.dev/>。
- Preview 網址格式為 `https://<preview-name>-age-of-exploration.odyliao-pikmin.workers.dev`；本分支的 `/` 轉為 `-`。單次部署網址則以 `<deployment-id>` 取代 `<preview-name>`。
- 已用瀏覽器開啟正式站與 preview，均出現「Age of Exploration」劇本選單，主控台沒有錯誤。正式部署在 preview 推送前後均為 `b91f6cb9`、100% 流量；正式站 HTTP 200，HTML SHA-256 亦保持一致，確認沒有被開發分支覆蓋。

### B. Supabase（2026-09-29）

- 免費組織：`odyliao-lab`；專案：`age-of-exploration`，Region 為 Northeast Asia (Tokyo)，`ap-northeast-1`。資料庫密碼由擁有者自行保存並完成專案建立。
- Project URL：`https://rixgyxhgmeshvahwzmts.supabase.co`。
- Publishable key：`sb_publishable_Fqpyj5dZ0qM3iXwGZFQhxQ_PpaHHODN`。這是可公開的前端金鑰，不是 secret key 或 `service_role`。
- 已在 SQL Editor 執行 repo 原有的 `supabase/migrations/0001_saves.sql`，結果為 `Success. No rows returned`。
- Table Editor 已確認 `public.saves` 存在；RLS 啟用，`saves_select_own`、`saves_insert_own`、`saves_update_own`、`saves_delete_own` 四條 policy 都套用至 `authenticated`。
- SQL 權限查詢確認 RLS 為 `true`、policy 數量為 `4`，`anon` 的 SELECT／INSERT／UPDATE／DELETE 全為 `false`；`authenticated` 已授權。Policies 頁面顯示 `API DISABLED` 並提示此表使用自訂權限，但已另外確認專案的 Data API 開關為啟用。
- Auth Site URL：`https://age-of-exploration.odyliao-pikmin.workers.dev`。
- Auth Redirect URLs 已儲存以下三筆：
  - `https://age-of-exploration.odyliao-pikmin.workers.dev/**`
  - `http://localhost:5173/**`
  - `https://*-age-of-exploration.odyliao-pikmin.workers.dev/**`

### C. Google OAuth 與 Supabase Google Provider（2026-09-29）

- Google Cloud 專案名稱為 `age-of-exploration`，實際 Project ID 為 `age-of-exploration-510108`。
- 應用程式品牌為「大航海地理」，使用者類型為 External，發布狀態維持 Testing，已儲存擁有者指定的 2 位測試使用者。
- 資料存取權僅設定 `openid`、`https://www.googleapis.com/auth/userinfo.email`、`https://www.googleapis.com/auth/userinfo.profile`，無機密或受限制範圍。
- 已建立「網頁應用程式」用戶端 `Age of Exploration Web`，JavaScript 來源為：
  - `https://age-of-exploration.odyliao-pikmin.workers.dev`
  - `http://localhost:5173`
- 已授權的重新導向 URI：`https://rixgyxhgmeshvahwzmts.supabase.co/auth/v1/callback`。
- OAuth Client ID 與 Client Secret 已填入此 Supabase 專案的 Google Provider，儲存後重新開啟確認為 Enabled。`Skip nonce checks` 與 `Allow users without an email` 均保持關閉。
- 支援信箱、開發者聯絡信箱與測試名單均依擁有者授權設定；文件只記錄測試人數。OAuth 憑證與資料庫密碼均未寫入 repo。

### D. Cloudflare 建置變數（2026-09-29）

`age-of-exploration` 的 **設定 → 組建 → 生產** 與 **Previews Base** 均已保存以下兩個文字型建置變數：

| 名稱                     | 值                                               |
| ------------------------ | ------------------------------------------------ |
| `VITE_SUPABASE_URL`      | `https://rixgyxhgmeshvahwzmts.supabase.co`       |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_Fqpyj5dZ0qM3iXwGZFQhxQ_PpaHHODN` |

- 生產設定以新頁面重新讀取，確認兩個值已保存；Previews Base 透過「匯入」複製這兩個公開變數，並確認已保存。
- 這些是 Vite 的建置階段變數。正式版仍使用 `npm run check && npm run build` → `npx wrangler deploy`，preview 使用相同建置命令 → `npx wrangler preview`。
- 正式版與 preview 共用此 Supabase 專案及資料庫；preview 並不是獨立的測試資料庫，後續登入／存檔測試須使用指定測試帳號。

### E. 介面差異與交接注意事項

- Cloudflare 新介面用 **Previews Base → Worker 預覽的建置** 管理開發分支；`npx wrangler preview` 要求 `wrangler.jsonc` 有 `"previews": {}`，已在開發分支補上。
- Google 新介面在 **Google Auth Platform → 品牌／目標對象／資料存取權／用戶端** 分別設定。專案 ID 自動加上 `-510108`；不影響應用程式名稱或 OAuth 回呼。
- 使用新版 `sb_publishable_…` 前端金鑰，環境變數名稱依原約定仍為 `VITE_SUPABASE_ANON_KEY`。
- Google 建立用戶端時提示設定可能需 5 分鐘至數小時生效。後台設定與儲存結果已確認；本次未修改 `src/` 或 `content/`，尚未進行遊戲內的 Google 登入、跨裝置同步及不同使用者資料隔離實測，這些由 Claude 實作後驗收。
- 開發時可將上列兩個公開值放入本機 `.env.local`；OAuth Client Secret、資料庫密碼、Supabase secret／service_role key 均不屬於前端變數。
- 後續以 PR 合併到 `main` 才更新正式版；開發分支推送只更新 preview。本次沒有直接推送 `main`。
