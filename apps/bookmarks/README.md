# 書籤工作台

在 Home 根目錄執行 `npm start`，從首頁的「書籤工作台」卡片進入，或開啟 `http://127.0.0.1:4179/bookmarks/`。

`bookmarks.html` 為入口；`src/home.html` 與 `src/home.css` 為建置範本，`Javascript/` 與 `scripts/` 負責書籤操作及本機儲存。重建頁面執行 `node apps/bookmarks/scripts/build-home.cjs`，只產生空白公開頁；本機資料由 API 載入。

成長相簿已拆至 `../growth/`，共用主題、執行設定及資料鎖位於 `../shared/`。Home 的 `npm test` 會執行全部網站的測試；`npm run build` 建置兩站的唯讀預覽。

詳見 [Home 整合說明](docs/home-integration.md) 及 [書籤操作指南](docs/user-guide.md)。
