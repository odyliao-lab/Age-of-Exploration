# 第 7 週準備：Google 登入（Supabase）設定步驟

第 7 週要做「用 Google 帳號登入、存檔同步到雲端」（企畫書 Q21）。
這需要用你自己的帳號建立兩個服務，這部分只能由你操作。完成後把**第 5 步列出的兩個值**交給 Claude，其餘程式由 Claude 接手。

預估時間：20–30 分鐘。兩個服務在這個規模下都是免費方案。

---

## 1. 建立 Supabase 專案

1. 到 <https://supabase.com> 用 GitHub 或 Google 帳號登入。
2. **New project**：
   - Name：`age-of-exploration`
   - Database Password：按「Generate」產生並**自己保存**（之後不需要交給 Claude）
   - Region：選 **Northeast Asia (Tokyo)** 或 **Southeast Asia (Singapore)**，離台灣近
3. 建立後進入專案，記下網址中的 **project ref**（`https://supabase.com/dashboard/project/<project-ref>`），第 2 步會用到。

## 2. 建立 Google OAuth 用戶端

1. 到 <https://console.cloud.google.com>，上方選單 **建立新專案**，名稱 `age-of-exploration`。
2. 左側 **API 和服務 → OAuth 同意畫面**（新版介面叫 **Google Auth Platform**）：
   - 使用者類型：**外部**
   - 應用程式名稱：`大航海地理`；使用者支援電子郵件、開發人員聯絡資訊填你的信箱
   - 範圍（Scopes）只需要預設的 `openid`、`email`、`profile`
   - 發布狀態維持 **測試中（Testing）**，並在 **測試使用者** 加入試玩親友的 Gmail（最多 100 人）。
     這樣不需要 Google 審核；日後要公開再申請發布。
3. **憑證 → 建立憑證 → OAuth 用戶端 ID**：
   - 應用程式類型：**網頁應用程式**
   - 已授權的 JavaScript 來源：
     - `https://age-of-exploration.odyliao-pikmin.workers.dev`
     - `http://localhost:5173`
   - 已授權的重新導向 URI：
     - `https://<project-ref>.supabase.co/auth/v1/callback`（把 `<project-ref>` 換成第 1 步記下的值）
4. 建立後會顯示 **用戶端 ID** 與 **用戶端密鑰**。

## 3. 在 Supabase 啟用 Google 登入

1. Supabase 專案 → **Authentication → Sign In / Providers → Google**：開啟，貼上第 2 步的用戶端 ID 與用戶端密鑰，儲存。
2. **Authentication → URL Configuration**：
   - Site URL：`https://age-of-exploration.odyliao-pikmin.workers.dev`
   - Redirect URLs 加入：
     - `https://age-of-exploration.odyliao-pikmin.workers.dev/**`
     - `http://localhost:5173/**`

## 4. 在 Cloudflare 加入建置變數

Vite 在建置時把設定寫進網頁，所以要設在 **建置** 變數：

Cloudflare → Workers & Pages → `age-of-exploration` → **Settings → Build → Variables and secrets**，新增：

| 名稱                     | 值                                  |
| ------------------------ | ----------------------------------- |
| `VITE_SUPABASE_URL`      | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | 第 5 步的 publishable（anon）金鑰   |

## 5. 交給 Claude 的資料

Supabase 專案 → **Project Settings → API Keys**（或 **Data API**）：

- **Project URL**：`https://<project-ref>.supabase.co`
- **Publishable key**（舊版介面叫 `anon` `public`）

這兩個值本來就會出現在網頁裡，可以公開；資料安全靠資料庫的列層級權限（RLS），Claude 會在第 7 週寫好。

> ⚠️ **不要**交出：資料庫密碼、`service_role`／secret key、Google 用戶端密鑰。它們只放在 Supabase 後台。

## 6. 第 7 週 Claude 會做的事

- 資料表 `saves`（每位玩家每個劇本一筆存檔）與 RLS 規則：只能讀寫自己的存檔。SQL 會放在 repo，由你在 Supabase 的 SQL Editor 貼上執行一次。
- 登入／登出按鈕；未登入時照常用本機存檔（不強迫登入）。
- 登入後同步：本機與雲端存檔比較，保留進度較新的一份，衝突時讓玩家選。
- 隱私：只儲存 Google 提供的使用者 ID 與存檔內容，不讀取其他資料；試玩說明加上給家長的說明。
