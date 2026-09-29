# 交接文件：第 7 週外部服務設定（給 Codex）

- 建立日期：2026-09-29
- 交接人：Claude（負責遊戲程式開發）
- 接手：Codex（負責需要登入後台的設定）
- 狀態：🟡 待處理

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

- [ ] GitHub 預設分支已改為 `main`
- [ ] Cloudflare production branch 已改為 `main`，開發分支推送會產生 preview（附一個 preview 網址範例與其格式）
- [ ] Supabase Project URL：`https://<project-ref>.supabase.co`
- [ ] Supabase Publishable（anon）key：`...`（公開值，可直接寫）
- [ ] `saves` 表已建立，RLS 開啟，4 條 policy 存在
- [ ] Google Provider 已啟用；Redirect URLs 已設定（列出實際值）
- [ ] Google OAuth 同意畫面為 Testing，已加入 N 位測試使用者（只寫人數，不寫信箱）
- [ ] Cloudflare 建置變數 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 已設定（production 與 preview）
- [ ] 遇到的問題或與本文件不同的操作（例如後台介面改名）

## 4. 設定結果

（待 Codex 填寫）
