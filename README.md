# Age of Exploration — 地理探索教育遊戲

一款以「大航海時代」為題材的教育遊戲，讓學生透過航海、探險、任務與角色成長，
在遊玩過程中自然學會世界地理（大洲、國家、海洋、地形、氣候、經緯度、文化與物產）。

> 目前狀態：**M1 專案骨架完成**，第一週可玩切片開發中。[劇本選單已上線](https://age-of-exploration.odyliao-pikmin.workers.dev/)，部署驗證紀錄見 [docs/03-deployment-blocker.md](docs/03-deployment-blocker.md)。
>
> 授權：程式碼 MIT，遊戲內容（知識卡、任務文本）CC BY-SA 4.0。

## 文件索引

| 文件                                                               | 內容                               |
| ------------------------------------------------------------------ | ---------------------------------- |
| [docs/01-game-design-document.md](docs/01-game-design-document.md) | 完整企畫書（遊戲設計文件，GDD）    |
| [docs/02-open-questions.md](docs/02-open-questions.md)             | 動工前需要逐項討論、定案的問題清單 |
| [docs/03-deployment-blocker.md](docs/03-deployment-blocker.md)     | Cloudflare 部署卡關紀錄與交接說明  |
| [docs/DEVLOG.md](docs/DEVLOG.md)                                   | 開發進度日誌                       |

## 開發

```bash
npm install
npm run dev              # 開發伺服器
npm run check            # 型別、lint、內容驗證、單元測試（CI 也跑這個）
npm run content:validate # 只驗證 content/ 下的資料檔
npm run build            # 產出 dist/
```

### 目錄

| 目錄        | 內容                                                                    |
| ----------- | ----------------------------------------------------------------------- |
| `content/`  | 遊戲內容資料（劇本、海域區、港口、任務、知識卡），純 JSON，CC BY-SA 4.0 |
| `src/data/` | 內容 schema（Zod）、交叉參照驗證、載入器                                |
| `src/app/`  | React 介面                                                              |
| `tools/`    | 命令列工具（內容驗證等）                                                |
| `docs/`     | 企畫書、決策清單、開發日誌                                              |

### 部署（Cloudflare）

實際採用 **Cloudflare Workers Builds 的 GitHub 整合**，以 Workers Static Assets 發布 `dist/`。

公開網址：**[https://age-of-exploration.odyliao-pikmin.workers.dev/](https://age-of-exploration.odyliao-pikmin.workers.dev/)**。

| 設定              | 值                                |
| ----------------- | --------------------------------- |
| Worker 名稱       | `age-of-exploration`              |
| GitHub repository | `odyliao-lab/Age-of-Exploration`  |
| Production branch | `claude/gallant-bardeen-wewmq8`   |
| Build command     | `npm run check && npm run build`  |
| Deploy command    | `npx wrangler deploy`             |
| Root directory    | `/`                               |
| Node              | 22，由 `.nvmrc` 指定              |
| 靜態資源目錄      | `dist/`，由 `wrangler.jsonc` 指定 |

每次推送到上述 production branch，Cloudflare 會自動安裝依賴、執行完整檢查與建置，成功後才部署。GitHub Actions 的 `check` workflow 也會照常執行。

後台設定位置為「Workers 和 Pages → age-of-exploration → 設定 → 建置」。Worker 名稱須與 `wrangler.jsonc` 的 `name` 完全一致；改名時兩處及本段必須一起更新。

此次建立流程為「Workers 和 Pages → 建立應用程式 → Continue with GitHub → 選取 `Age-of-Exploration` → 下一步」，填入上述命令，再於「進階設定 → API Token」選「建立新 Token」，名稱為 `age-of-exploration-build`，按「部署」。Token 由 Cloudflare 管理，密鑰不寫入 repo。

- `public/_headers` 提供安全標頭及帶雜湊靜態資源的長期快取；SPA fallback 由 `wrangler.jsonc` 設定。
- 推送前必須執行 `npm run check` 與 `npm run build`。
- 本機可用 `npx wrangler deploy --dry-run` 檢查部署設定（不需登入）。
- 後台排查證據與 GitHub Actions 備案見 [部署卡關紀錄](docs/03-deployment-blocker.md)。

## 專案流程

1. **企畫** — 撰寫並討論企畫書，逐項定案 `docs/02-open-questions.md` 中的問題。
2. **技術規格** — 根據定案結果補上技術架構、資料格式與內容清單。
3. **MVP 實作** — 以最小可玩版本驗證核心循環與教學效果。
4. **內容擴充** — 逐區域擴充港口、任務、圖鑑與教材對應。
5. **教師端與部署** — 班級管理、學習報表、上線。

所有進度、決策與變更皆記錄於本 repo（Issue、PR 與 `docs/DEVLOG.md`）。
