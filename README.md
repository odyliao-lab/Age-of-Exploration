# Age of Exploration — 地理探索教育遊戲

一款以「大航海時代」為題材的教育遊戲，讓學生透過航海、探險、任務與角色成長，
在遊玩過程中自然學會世界地理（大洲、國家、海洋、地形、氣候、經緯度、文化與物產）。

> 目前狀態：**企畫書 v1.0 已定案**，準備進入第一週可玩切片開發。
>
> 授權：程式碼 MIT，遊戲內容（知識卡、任務文本）CC BY-SA 4.0。

## 文件索引

| 文件                                                               | 內容                               |
| ------------------------------------------------------------------ | ---------------------------------- |
| [docs/01-game-design-document.md](docs/01-game-design-document.md) | 完整企畫書（遊戲設計文件，GDD）    |
| [docs/02-open-questions.md](docs/02-open-questions.md)             | 動工前需要逐項討論、定案的問題清單 |
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

### 部署（Cloudflare Pages）

Cloudflare Pages 已連接本 repo（Git 整合）：

| 設定                   | 值                                       |
| ---------------------- | ---------------------------------------- |
| Framework preset       | None 或 Vite                             |
| Build command          | `npm run build`                          |
| Build output directory | `dist`                                   |
| Node version           | 22（由 `.nvmrc` 指定，不需另設環境變數） |

- 每次推送到 production branch 會自動部署；其他分支會產生 preview 網址。
- `public/_headers` 設定安全標頭，並讓 `assets/` 下帶雜湊的檔案長期快取。

## 專案流程

1. **企畫** — 撰寫並討論企畫書，逐項定案 `docs/02-open-questions.md` 中的問題。
2. **技術規格** — 根據定案結果補上技術架構、資料格式與內容清單。
3. **MVP 實作** — 以最小可玩版本驗證核心循環與教學效果。
4. **內容擴充** — 逐區域擴充港口、任務、圖鑑與教材對應。
5. **教師端與部署** — 班級管理、學習報表、上線。

所有進度、決策與變更皆記錄於本 repo（Issue、PR 與 `docs/DEVLOG.md`）。
