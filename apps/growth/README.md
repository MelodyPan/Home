# 成長相簿

在 Home 根目錄執行 `npm start`，從首頁的「成長相簿」卡片進入，或開啟 `http://127.0.0.1:4179/growth/`。

- `growth.html`：網站入口。
- `Javascript/`、`src/`：相簿、電子書及成長數字的前端程式與樣式。
- `scripts/server.cjs`：相簿 HTTP 處理器，由 Home 掛載於 `/growth`。
- `scripts/growth-store.cjs`：孩子資料、照片、ETag 與存檔。
- `docs/data/`：生長曲線的公開參考資料。
- `tests/`：相簿測試；在此目錄執行 `node --test`，或在 Home 根目錄執行 `npm test`。

共用的主題、執行設定與資料鎖位於 `../shared/`；本機服務及公開建置會將其提供在各站自己的資源網址下。

私人資料沿用 `.home-local.json` 的 `bookmarksDataRoot`，包含原有 `assets/growth-data.json` 及 `assets/growth-photos/`，拆站不搬移或重建資料。若日後要分開存放，可在該設定新增 `growthDataRoot`（相對於 Home 根目錄）；請先安排資料搬移與備份，再修改設定。

完整操作說明見 [相簿指南](docs/growth-album.md)。公開建置仍為唯讀預覽，不包含私人資料與照片。
