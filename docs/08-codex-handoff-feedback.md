# 交接文件：試玩回饋資料表（給 Codex）

- 建立日期：2026-10-01
- 交接人：Claude（負責遊戲程式開發）
- 接手：Codex（負責需要登入後台的設定與實機驗收）
- 狀態：🟡 待設定

---

## 0. 背景

遊戲上方工具列新增了「💬 試玩回饋」按鈕（程式已合併進 `main`）：

- 玩家可以點標籤（好玩、卡住了、看不懂……）或寫幾句話，遊戲自動附上當下的劇本、日期、位置、
  進行中的任務、螢幕大小與版本（`src/game/feedback.ts` 的 `FeedbackContext`）。
- **已登入**的玩家：直接寫入 Supabase 的 `public.feedback` 資料表（`src/app/cloud.ts` 的 `pushFeedback`）。
- **沒登入或寫入失敗**：先存在玩家瀏覽器的 localStorage（`aoe-feedback`），登入後自動補送
  （`src/app/feedbackOutbox.ts` 的 `flushFeedback`），也可以按「複製」貼給開發者。

資料表還沒建立，所以目前登入的玩家送出時會失敗，然後退回本機保存。本次要在擁有者的 Supabase
專案建立資料表並做實機驗收。

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

完成後把以下勾選並補上說明，狀態改為 🟢；同時在 `docs/DEVLOG.md` 最上方加一筆紀錄。

- [ ] `0002_feedback.sql` 已執行成功
- [ ] RLS 為 true；只有 `feedback_insert_own` 一條 policy（authenticated、INSERT）
- [ ] 權限：anon 無；authenticated 只有 INSERT
- [ ] 以 authenticated 身分 SELECT 會被拒絕
- [ ] 登入後送出的回饋出現在 `feedback` 表，欄位內容正確
- [ ] 未登入時回饋只存在本機，可複製；重新登入後自動補送
- [ ] 測試資料已刪除或已註明保留
- [ ] 遇到的問題或與本文件不同的操作已記錄
