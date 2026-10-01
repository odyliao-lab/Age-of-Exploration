# Age of Exploration — 地理探索教育遊戲

一款以「大航海時代」為題材的教育遊戲，讓學生透過航海、探險、任務與角色成長，
在遊玩過程中自然學會世界地理（大洲、國家、海洋、地形、氣候、經緯度、文化與物產）。

> 目前狀態：七個劇本都可以玩，準備進行親友試玩。[正式版](https://age-of-exploration.odyliao-pikmin.workers.dev/)。開發進度見 [docs/DEVLOG.md](docs/DEVLOG.md)。
>
> 授權：程式碼 MIT，遊戲內容（知識卡、任務文本）CC BY-SA 4.0（見 [content/LICENSE.md](content/LICENSE.md)）。

## 劇本

| 劇本       | 時代               | 內容                                                       | 約需時數 |
| ---------- | ------------------ | ---------------------------------------------------------- | -------- |
| 東方寶船   | 15 世紀初          | 從泉州追隨鄭和寶船，航向東南亞、印度洋與東非               | 12       |
| 航向未知   | 15 世紀末          | 葡萄牙見習領航員沿非洲南下、繞過好望角到印度               | 8        |
| 季風商人   | 15 世紀初          | 亞丁的阿拉伯商人跟著季風往返阿拉伯海、印度、東非與中國     | 8        |
| 星辰導航者 | 約 12～13 世紀     | 玻里尼西亞航海家靠星羅盤與海上的徵兆，航向夏威夷、紐西蘭等 | 5        |
| 向西的賭注 | 15 世紀末          | 1492 年橫渡大西洋到加勒比海，認識泰諾人與哥倫布大交換      | 5        |
| 北方長船   | 10 世紀末～11 世紀 | 北歐船主經冰島、格陵蘭到北美洲的文蘭                       | 5        |
| 繞地球一圈 | 16 世紀初          | 跟著麥哲倫船隊穿過海峽、橫渡太平洋，從另一邊回到西班牙     | 6        |

主要玩法：親手掌舵（風向、洋流、搶風）、港口城鎮與市集、觀星／正午量太陽／看岸形／測深定位、
探索迷霧與自己的海圖、任務與小考、知識卡圖鑑、船員與船長成長。海圖東西兩端在換日線接起來，可以繞地球一圈。
可以安裝成 PWA 離線遊玩；用 Google 登入可以跨裝置同步存檔；遊戲內的 💬 按鈕可以送出試玩回饋。

技術：Vite、React、TypeScript、PixiJS（海圖與城鎮）、Zustand、Zod（內容驗證）、Vitest、Supabase（登入、雲端存檔、回饋）。

## 文件索引

| 文件                                                                         | 內容                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [docs/01-game-design-document.md](docs/01-game-design-document.md)           | 完整企畫書（遊戲設計文件，GDD）                              |
| [docs/02-open-questions.md](docs/02-open-questions.md)                       | 動工前需要逐項討論、定案的問題清單                           |
| [docs/03-deployment-blocker.md](docs/03-deployment-blocker.md)               | Cloudflare 部署卡關紀錄與交接說明                            |
| [docs/04-google-login-setup.md](docs/04-google-login-setup.md)               | Google 登入與 Supabase 設定步驟                              |
| [docs/05-codex-handoff-week7-setup.md](docs/05-codex-handoff-week7-setup.md) | 外部服務設定交接與結果（分支、Supabase、Google、Cloudflare） |
| [docs/06-redesign-proposal.md](docs/06-redesign-proposal.md)                 | 改版提案（親手駕船、港口城鎮）                               |
| [docs/07-polynesia-design-notes.md](docs/07-polynesia-design-notes.md)       | 「星辰導航者」劇本的設計筆記（已實作）                       |
| [docs/08-codex-handoff-feedback.md](docs/08-codex-handoff-feedback.md)       | 試玩回饋資料表的設定交接與驗收結果                           |
| [docs/playtest-guide.md](docs/playtest-guide.md)                             | 親友試玩說明                                                 |
| [docs/DEVLOG.md](docs/DEVLOG.md)                                             | 開發進度日誌                                                 |

## 開發

```bash
npm install
npm run dev              # 開發伺服器
npm run check            # 型別、lint、格式（Prettier）、內容驗證、單元測試（CI 也跑這個）
npm run content:validate # 只驗證 content/ 下的資料檔
npm run build            # 產出 dist/
```

### 目錄

| 目錄        | 內容                                                                          |
| ----------- | ----------------------------------------------------------------------------- |
| `content/`  | 遊戲內容資料（劇本、海域區、港口、任務、知識卡、船員），純 JSON，CC BY-SA 4.0 |
| `src/data/` | 內容 schema（Zod）、交叉參照驗證、載入器                                      |
| `src/game/` | 遊戲規則（純函式、有單元測試）：航行、天候、導航、任務、交易、存檔            |
| `src/geo/`  | 地理計算：距離與方位、陸地遮罩、海岸判定、海上航線搜尋                        |
| `src/map/`  | 世界海圖的繪製（PixiJS）                                                      |
| `src/town/` | 港口城鎮的配置與繪製                                                          |
| `src/app/`  | React 介面、狀態管理、雲端同步                                                |
| `public/`   | PWA 圖示、manifest、安全標頭                                                  |
| `supabase/` | 資料庫 migration（雲端存檔、試玩回饋）                                        |
| `tools/`    | 命令列工具（內容驗證、Service Worker 產生等）                                 |
| `docs/`     | 企畫書、設計筆記、交接文件、試玩說明、開發日誌                                |

### 部署（Cloudflare）

實際採用 **Cloudflare Workers Builds 的 GitHub 整合**，以 Workers Static Assets 發布 `dist/`。

公開網址：**[https://age-of-exploration.odyliao-pikmin.workers.dev/](https://age-of-exploration.odyliao-pikmin.workers.dev/)**。

| 設定              | 值                                |
| ----------------- | --------------------------------- |
| Worker 名稱       | `age-of-exploration`              |
| GitHub repository | `odyliao-lab/Age-of-Exploration`  |
| Production branch | `main`                            |
| Preview branch    | `claude/gallant-bardeen-wewmq8`   |
| Build command     | `npm run check && npm run build`  |
| Deploy command    | `npx wrangler deploy`             |
| Preview command   | `npx wrangler preview`            |
| Root directory    | `/`                               |
| Node              | 22，由 `.nvmrc` 指定              |
| 靜態資源目錄      | `dist/`，由 `wrangler.jsonc` 指定 |

每次推送到上述 production branch，Cloudflare 會自動安裝依賴、執行完整檢查與建置，成功後才部署。GitHub Actions 的 `check` workflow 也會照常執行。

`main` 為 GitHub 預設分支與正式版來源；開發分支推送由已啟用的 Worker Previews 建置獨立預覽，完成後以 PR 合併進 `main`。新版後台的預覽設定位於「設定 → 組建 → Previews Base」，部署命令為 `npx wrangler preview`，並需要 `wrangler.jsonc` 的 `previews` 區塊。第 7 週外部服務設定與實際預覽網址見 [交接文件](docs/05-codex-handoff-week7-setup.md)。

Google 登入、雲端存檔與試玩回饋需要建置變數 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（可公開的前端值，已設定在 Cloudflare）；本機開發時把 `.env.example` 複製成 `.env.local` 填入。沒有設定時遊戲只使用本機存檔，回饋也只存在本機。

Supabase 的資料表由 `supabase/migrations/` 建立（已在正式專案執行）：`0001_saves.sql` 是雲端存檔，`0002_feedback.sql` 是試玩回饋（玩家只能新增、讀不到；開發者在 Table Editor 讀取）。兩者都開啟列層級權限（RLS）。

目前開發分支預覽：<https://claude-gallant-bardeen-wewmq8-age-of-exploration.odyliao-pikmin.workers.dev/>。

後台設定位置為「Workers 和 Pages → age-of-exploration → 設定 → 建置」。Worker 名稱須與 `wrangler.jsonc` 的 `name` 完全一致；改名時兩處及本段必須一起更新。

此次建立流程為「Workers 和 Pages → 建立應用程式 → Continue with GitHub → 選取 `Age-of-Exploration` → 下一步」，填入上述命令，再於「進階設定 → API Token」選「建立新 Token」，名稱為 `age-of-exploration-build`，按「部署」。Token 由 Cloudflare 管理，密鑰不寫入 repo。

- `public/_headers` 提供安全標頭及帶雜湊靜態資源的長期快取；SPA fallback 由 `wrangler.jsonc` 設定。
- 推送前必須執行 `npm run check` 與 `npm run build`。
- 本機可用 `npx wrangler deploy --dry-run` 檢查部署設定（不需登入）。
- 後台排查證據與 GitHub Actions 備案見 [部署卡關紀錄](docs/03-deployment-blocker.md)。

## 專案流程

1. ✅ **企畫** — 撰寫並討論企畫書，逐項定案 `docs/02-open-questions.md` 中的問題。
2. ✅ **技術規格** — 根據定案結果補上技術架構、資料格式與內容清單。
3. ✅ **MVP 實作** — 以最小可玩版本驗證核心循環與教學效果。
4. ✅ **內容擴充** — 七個劇本、港口、任務、圖鑑與教材對應。
5. 🔄 **親友試玩** — 依 [試玩說明](docs/playtest-guide.md) 進行，回饋整理後再調整。
6. ⬜ **教師端** — 班級管理、學習報表（尚未開始）。

正式站已上線（Cloudflare），開發分支推送會產生預覽版本，確認後以 PR 合併進 `main`。

所有進度、決策與變更皆記錄於本 repo（Issue、PR 與 `docs/DEVLOG.md`）。
