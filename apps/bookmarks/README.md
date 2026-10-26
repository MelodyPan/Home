# 書籤工作台

在 Home 根目錄執行 `npm start`，從首頁的「書籤工作台」卡片進入，或開啟 `http://127.0.0.1:4179/bookmarks/`。

書籤一律使用私人 Google Drive，電腦與手機以同一 Google 帳號連接。先依 [Google Drive 設定步驟](docs/google-drive-setup.md) 建立 OAuth Client ID，填入 Home 根目錄的 `bookmarks.config.json`。未連接時不載入書籤，也不回退至本機資料。

`bookmarks.html` 為入口；`src/home.html` 與 `src/home.css` 為建置範本。重建頁面執行 `node apps/bookmarks/scripts/build-home.cjs`，只產生空白公開頁；私人資料於 Google 授權後從 Drive 載入。每次同步保留版本快照，衝突時可選擇要採用的版本。

成長相簿已拆至 `../growth/`，原有儲存方式未變更。Home 的 `npm test` 執行全部網站測試；`npm run build` 建置使用 Drive 的書籤網站與相簿預覽，不包含私人資料。

詳見 [Home 整合說明](docs/home-integration.md) 及 [書籤操作指南](docs/user-guide.md)。
