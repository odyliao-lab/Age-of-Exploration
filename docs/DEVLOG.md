# 開發進度日誌

記錄每次重要進展、決策與變更。新項目請加在最上方。

---

## 2026-09-29 — Cloudflare 部署問題解決，推送自動部署驗收通過

- 公開網址：https://age-of-exploration.odyliao-pikmin.workers.dev/ 。
- 實際採用 Workers Builds 的 GitHub 整合，生產分支維持 `claude/gallant-bardeen-wewmq8`；組建命令為 `npm run check && npm run build`，成功後執行 `npx wrangler deploy`。
- 排除同名專案、缺少 `workers.dev` 子網域及 repo 不可見；經擁有者同意，於匯入頁明確建立並指定 `age-of-exploration-build` Token 後成功部署，未改 Worker 名稱或遊戲內容。
- 故障位於 Cloudflare 後台的專案／Git 建置初始化階段；原始未知錯誤未留下 API 錯誤碼，無法將更深層內部原因斷言為 Token 或暫時性後台錯誤。詳細證據見 `docs/03-deployment-blocker.md`。
- Node 22 的完整檢查（5 個測試）、build、Wrangler dry-run 通過。公開網站顯示「Age of Exploration／東方寶船」，主控台無錯誤；HTTP、安全標頭、靜態資源快取與 SPA fallback 驗證通過。
- 推送 `350f205` 自動觸發 Cloudflare 建置 `ac118223-7e63-428c-83f9-2eeca0f9628e`，11:16 完成；GitHub `check` 與 `Workers Builds: age-of-exploration` 均成功，Worker 版本更新為 `27838b6b-52c0-433e-afba-c9038bebded5`。未採用 GitHub Actions 部署備案，也未新增 repository secrets。

## 2026-09-29 — Cloudflare 部署卡關，交接處理

- repo 端部署設定已就緒：`.nvmrc`（Node 22）、`public/_headers`、`wrangler.jsonc`（Workers 靜態資源）、CI 加入格式檢查。
- 卡關：Cloudflare 從未對本 repo 觸發建置；後台以 Workers 流程建立專案 `age-of-exploration` 時出現「an unknown error occurred」。
- 詳細經過、推測原因、備案與完成標準見 `docs/03-deployment-blocker.md`。
- 下一步：由 Codex 接手解決部署；第一週切片的地圖開發（第 3～4 小時）與部署問題互不相依，可並行。

## 2026-09-29 — M1 專案初始化與內容 schema（第一週切片第 1～2 小時）

- 專案骨架：Vite ＋ React 19 ＋ TypeScript ＋ PixiJS 8（尚未使用）＋ Zustand ＋ Dexie ＋ Zod ＋ i18next。
- 內容 schema（`src/data/schema.ts`）：海域區、港口、知識卡、任務（四種步驟）、劇本；
  交叉參照驗證（`src/data/validate.ts`）強制企畫書規則：任務至少一個學習目標、傳說必附科學對照、家鄉海域 Tier 0。
- 命令列驗證 `npm run content:validate`；`npm run check` 串起型別、lint、內容驗證與測試；GitHub Actions 每次推送執行。
- 首批內容：東方寶船劇本（6 章）、3 個海域區、4 個港口（泉州、廣州、歸仁、麻六甲）、6 張知識卡、序章與第一章各 1 個任務。
- 介面目前只有劇本選單，已在 Chromium 驗證可渲染、無錯誤。
- 授權檔：根目錄 MIT、`content/LICENSE.md` CC BY-SA 4.0、`content/credits.md` 素材登錄。
- README 新增開發指令與 Cloudflare Pages 設定值。
- 下一步（第 3～4 小時）：Natural Earth GeoJSON 世界地圖、等距圓柱投影、縮放平移、港口標記。

## 2026-09-29 — 全部決策定案，企畫書 v1.0

- Q14～Q25 定案：美術與內容規範、TypeScript 技術堆疊、Google 登入（Supabase Auth）、
  Cloudflare Pages、MIT ＋ CC BY-SA 4.0、一人每週 10 小時、親友試玩。
- 企畫書升為 **v1.0 定案版**：新增 14.4 語言與地名、14.5 知識卡審核、15.1.1 帳號策略、
  第 18 章開發計畫（第一週可玩切片 ＋ 第 2～7 週規劃 ＋ 試玩計畫）。
- 重要判斷：原 MVP 範圍以每週 10 小時需 6～8 週，因此「一週」重新定義為可玩切片。
- 下一步：M1 專案初始化與 schema，開始第一週切片。

## 2026-09-29 — 優先級 2 定案，企畫書 v0.4

- Q7～Q13 全部定案（採企畫建議）。
- 企畫書新增 5.5 沉船與失敗機制、9.5 外觀自訂與社交；10.2、10.3、11 補上定案細節。
- 下一步：討論優先級 3（Q14～Q19 內容與美術）與優先級 4（Q20～Q25 技術與營運）。

## 2026-09-28 — 劇本衍生問題定案，企畫書 v0.3

- Q26～Q30 定案：MVP 首劇本為東方寶船；正式版 6 個劇本（另 2 個候補）；
  圖鑑與知識共用、Tier 獨立、全部劇本開放自選；歷史人物僅作 NPC。
- 企畫書 3.3 劇本表改為含開發順序與覆蓋區域；7.2、9.3、16.1 同步更新。
- 下一步：討論優先級 2（Q7～Q13）。

## 2026-09-28 — 優先級 1 定案，企畫書 v0.2

- Q1～Q6 定案（詳見 `docs/02-open-questions.md` 決議記錄）。
- 企畫書升版 v0.2：
  - 新增 3.3「多劇本模式」與 8 個劇本草案；7.2 改為劇本章節設計，以「東方寶船」為範例。
  - Tier 改為相對於劇本家鄉的同心圓擴展；海域區不再帶固定 Tier。
  - 教師端移至後期（M7），MVP 加入自學支援（今日航程、航海日誌、匯出紀錄）。
  - MVP 改為「完整劇本框架 ＋ 1 個劇本」，M6 加入第二劇本驗證框架。
- 新增衍生問題 Q26～Q30（劇本選擇、數量、進度關係、推薦方式、歷史人物角色）。
- 下一步：討論 Q26～Q30 與優先級 2（Q7～Q13）。

## 2026-09-28 — 專案啟動、企畫書 v0.1

- 建立 repo 基本結構（README、docs/）。
- 完成企畫書草案 `docs/01-game-design-document.md` v0.1，涵蓋：
  學習設計、核心循環、地圖與航海、圖鑑、任務、成就、人物成長、事件、
  貿易、適性學習、教師端、美術、技術建議、MVP 範圍與里程碑、風險。
- 整理 25 項動工前待討論問題 `docs/02-open-questions.md`。
- 下一步：逐項討論 Q1～Q6（優先級 1），定案後更新企畫書為 v0.2。
