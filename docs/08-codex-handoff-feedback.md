# 交接文件：試玩回饋資料表（給 Codex）

- 建立日期：2026-10-01
- 交接人：Claude（負責遊戲程式開發）
- 接手：Codex（負責需要登入後台的設定與實機驗收）
- 狀態：🟢 已完成（2026-10-01）

---

## 0. 背景

遊戲上方工具列新增了「💬 試玩回饋」按鈕（程式已合併進 `main`）：

- 玩家可以點標籤（好玩、卡住了、看不懂……）或寫幾句話，遊戲自動附上當下的劇本、日期、位置、
  進行中的任務、螢幕大小與版本（`src/game/feedback.ts` 的 `FeedbackContext`）。
- **已登入**的玩家：直接寫入 Supabase 的 `public.feedback` 資料表（`src/app/cloud.ts` 的 `pushFeedback`）。
- **沒登入或寫入失敗**：先存在玩家瀏覽器的 localStorage（`aoe-feedback`），登入後自動補送
  （`src/app/feedbackOutbox.ts` 的 `flushFeedback`），也可以按「複製」貼給開發者。

交接時資料表尚未建立，登入的玩家送出時會失敗，然後退回本機保存。本次已在擁有者的 Supabase
專案建立資料表並完成正式站實機驗收，結果見第 3 節。

- Supabase 專案：`age-of-exploration`（Project URL `https://rixgyxhgmeshvahwzmts.supabase.co`）
- 正式站：<https://age-of-exploration.odyliao-pikmin.workers.dev/>
- 開發分支 preview：<https://claude-gallant-bardeen-wewmq8-age-of-exploration.odyliao-pikmin.workers.dev/>
- 正式站與 preview 共用同一個 Supabase 專案與資料庫。

## 1. 任務清單

### A. 建立資料表

1. Supabase → **SQL Editor**：貼上並執行 `supabase/migrations/0002_feedback.sql`（可重複執行）。
2. 驗證（在 SQL Editor 執行，貼回結果）：

   ```sql
   -- RLS 必須是 true
   select relrowsecurity from pg_class where oid = 'public.feedback'::regclass;

   -- 只能有一條 policy：feedback_insert_own，對象 authenticated，指令 INSERT
   select policyname, roles, cmd from pg_policies
   where schemaname = 'public' and tablename = 'feedback';

   -- anon 不能有任何權限；authenticated 只能有 INSERT（不能 SELECT／UPDATE／DELETE）
   select grantee, privilege_type from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'feedback'
     and grantee in ('anon', 'authenticated')
   order by grantee, privilege_type;
   ```

3. 確認玩家讀不到回饋：

   ```sql
   begin;
   set local role authenticated;
   select count(*) from public.feedback; -- 預期：permission denied for table feedback
   rollback;
   ```

### B. 實機驗收

請用擁有者提供的**測試帳號**（Google 登入目前是 Testing 模式），在正式站操作：

1. **登入後送出**：用 Google 登入 → 進任一劇本 → 按上方 💬 → 點「好玩」並寫「Codex 驗收 1」→ 送出。
   - 畫面應顯示「收到了，謝謝你！」。
   - Table Editor → `feedback` 出現一筆：`user_id` 是測試帳號、`tags` 為 `{好玩}`、`message` 為「Codex 驗收 1」，
     `context` 有 `scenarioId`、`place`、`gameDate`、`device`、`build` 等欄位。
2. **未登入先存、登入後補送**：登出 → 進劇本 → 💬 → 寫「Codex 驗收 2」→ 送出。
   - 畫面應顯示「已經存在這台裝置上……」，`feedback` 表**沒有**新增。
   - 按「📋 複製」，確認剪貼簿有一段【試玩回饋】文字。
   - 重新登入 → 回到選單或進劇本後，`feedback` 表應自動多出「Codex 驗收 2」那一筆。
3. **劇本結局的按鈕**：不必玩完劇本，略過即可（自動化測試已涵蓋）。
4. 驗收完成後，可在 Table Editor 刪除這兩筆測試資料（擁有者可以刪，玩家不行），或保留並在下方註明。

### C. 若發現程式問題

- 不修改 `src/`；把現象、重現步驟、瀏覽器主控台錯誤（遮掉任何金鑰或 token）記在下方「3. 設定結果」，
  由 Claude 修正。
- 常見原因參考：Data API 沒有開放 `public` schema、`0002` 沒有執行成功、測試帳號不在 Google 測試名單。

## 2. 約束

- **絕不提交或回報**：資料庫密碼、`service_role`／secret key、Google Client Secret、Cloudflare API token、
  測試帳號的信箱。
- 不修改 `src/`、`content/` 與既有的 migration 檔案。
- 若需要提交文件，推送到開發分支 `claude/gallant-bardeen-wewmq8`，不要直接推送到 `main`。
  推送前須通過 `npm run check` 與 `npm run build`。
- repo 使用 LF 換行，Prettier 檢查會拒絕 CRLF。

## 3. 設定結果

2026-10-01 已完成以下設定與驗收，並在 `docs/DEVLOG.md` 最上方新增紀錄。

- [x] `0002_feedback.sql` 已執行成功
- [x] RLS 為 true；只有 `feedback_insert_own` 一條 policy（authenticated、INSERT）
- [x] 權限：anon 無；authenticated 只有 INSERT
- [x] 以 authenticated 身分 SELECT 會被拒絕
- [x] 登入後送出的回饋出現在 `feedback` 表，欄位內容正確
- [x] 未登入時回饋只存在本機，可複製；重新登入後自動補送
- [x] 測試資料已刪除或已註明保留
- [x] 遇到的問題或與本文件不同的操作已記錄

### SQL 執行與權限結果（2026-10-01）

在 `age-of-exploration` 專案的 SQL Editor 執行原始 `0002_feedback.sql`，結果為
`Success. No rows returned`。未修改 migration。

| 檢查                                         | 實際結果                                                       |
| -------------------------------------------- | -------------------------------------------------------------- |
| `relrowsecurity`                             | `true`                                                         |
| policy                                       | 恰好一列：`feedback_insert_own` / `{authenticated}` / `INSERT` |
| anon / authenticated 權限查詢                | 恰好一列：`authenticated` / `INSERT`；anon 沒有任何列          |
| `set local role authenticated` 後執行 SELECT | `ERROR: 42501: permission denied for table feedback`           |

SELECT 被拒絕是預期結果；未採用後台提示的 GRANT SELECT。接著執行 `rollback`，
確認管理查詢的角色為 `postgres`，實機驗收前 `public.feedback` 共 0 筆。

### 正式站實機驗收

- 環境：Windows Chrome，正式站；劇本「繞地球一圈」（`round-the-world`），停在聖盧卡爾，
  遊戲日期 `1519/9/20`，回饋內的版本為 `2026-10-01T10:25`。
- **登入後送出**：點「💬 試玩回饋」，選「好玩」、輸入「Codex 驗收 1」，畫面顯示
  「收到了，謝謝你！開發者會看到這則回饋。」Table Editor 出現 1 筆，`tags` 為 `["好玩"]`，
  `message` 正確；以管理 SQL 核對 `user_id` 對應擁有者提供的測試帳號。
- **未登入先存**：登出後回到同一劇本，送出「Codex 驗收 2」，畫面顯示
  「已經存在這台裝置上……」。重新整理 Table Editor 仍為 1 筆；管理 SQL 確認第二筆為 0 筆。
- **複製**：按「📋 複製」後實際讀取剪貼簿，包含 `【試玩回饋】`、`Codex 驗收 2`、劇本、
  遊戲日期、位置、裝置尺寸及版本。
- **登入補送**：重新使用同一測試帳號登入，未再按送出，Table Editor 自動多出第二筆，總數變為 2。
  兩筆的 `user_id` 相同且正確，皆含 `scenarioId`、`place`、`gameDate`、`device`、`build`；
  遊戲「我之前寫的回饋（2）」兩筆皆顯示「已送出」。
- 驗收中未觀察到遊戲瀏覽器主控台的 error 或 warning。依交接要求略過劇本結局按鈕。

### 存檔衝突與其他操作紀錄

這次登入時跳出「東方寶船」存檔衝突：本機為 9/30、第 14 天，雲端為 9/29、第 1 天。
擁有者確認兩份都是測試存檔，並明確同意保留本機、覆蓋雲端後，選了
「保留這台裝置的進度」（保留本機）。衝突對話框正常關閉、同步完成，能繼續進入劇本；
後續重新登入沒有再次出現該衝突。**本次衝突處理畫面運作正常。**

未發現需交由 Claude 修正的回饋功能問題；本次未修改 `src/`、`content/` 或既有 migration。

### 測試資料保留

以下兩筆刻意保留在 `public.feedback`，方便擁有者或 Claude 核對；未刪除其他資料。
時間為台北時間（UTC+8），記錄 ID 為回饋列 ID，非使用者 ID。

| 訊息         | 回饋列 ID                              | 資料庫建立時間      | 備註                                      |
| ------------ | -------------------------------------- | ------------------- | ----------------------------------------- |
| Codex 驗收 1 | `fd9fda8c-394a-444d-86a4-e5f23ffd0a2a` | 2026-10-01 19:50:24 | 已登入直接送出，標籤「好玩」              |
| Codex 驗收 2 | `91024526-a09d-47cd-8c4e-bbcd6f965847` | 2026-10-01 19:53:03 | 19:52:06 未登入時本機保存，重新登入後補送 |

### 本機檢查環境紀錄

Node.js 22 首輪 `npm run check` 的型別、ESLint、Prettier 與內容驗證通過；單元測試為
208 項通過、2 項超過既有 5000ms 時限，沒有回報功能斷言失敗：

- `src/game/content.test.ts`：`Treasure Fleet MVP content > can reach every port by sea from the nearest scenario home`
  （5289ms）。
- `src/game/content.test.ts`：`Into the Unknown content > plays every quest from start to finish`（5145ms）。

降低並行 worker 數後仍出現 timeout：

| 驗證方式                                                   | 結果                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 原設定 `npm run check`                                     | 208 通過、2 timeout（上述兩項）                                                                         |
| `VITEST_MAX_WORKERS=2` 執行完整 `npm run check`            | 206 通過、4 timeout：上述兩項，加上 Treasure Fleet 與 Monsoon Merchant 的完整任務測試                   |
| `VITEST_MAX_WORKERS=1` 單獨執行 `src/game/content.test.ts` | 6 通過、5 timeout：港口海路可達性、historic routes、Into the Unknown、Westward Gamble、Around the World |
| 獨立執行 `npm run build`                                   | 通過，`dist/` 產出成功                                                                                  |

Around the World 使用原有 60000ms 時限，其餘上述超時測試使用原有 5000ms 時限。
未修改測試、timeout、Vitest 設定或 CI。過程中取樣觀察到本機 CPU 負載 100%，
但尚不能僅憑此確認 timeout 的唯一原因。

關閉遊戲驗收分頁後，Windows 的單一 worker 內容測試改善為 10 通過、1 timeout；
剩餘 `Into the Unknown` 完整任務測試為 6326ms。這項環境差異保留供 Claude 後續查核。

**最終驗證通過**：在既有 WSL Ubuntu 的 Linux 檔案系統建立相同工作樹的隔離副本，
使用 Node.js `22.22.2`、`npm ci` 安裝鎖定依賴，執行 `VITEST_MAX_WORKERS=1 npm run check`
與 `npm run build`，兩者皆成功。全部 **26 個測試檔、210 項測試通過**；先前超時的港口可達性
與 `Into the Unknown` 測試分別為 4333ms、3801ms，皆符合原有 5000ms 時限。
未放寬 timeout、略過測試或變更 CI。最後補入本段驗證紀錄後，再檢查兩份文件的格式與 LF 換行。
