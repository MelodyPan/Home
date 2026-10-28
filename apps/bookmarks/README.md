# 書籤工作台

這個網站整理個人網站連結，資料一律保存在自己的 Google Drive，電腦與手機可使用同一份書籤。

- **第一次使用：** [使用指南](../../docs/bookmarks-guide.md)，從登入、找書籤到備份逐步說明。
- **設定網站：** [Google Drive 設定](docs/google-drive-setup.md)，給管理者設定 OAuth Client ID。
- **維護程式：** [開發維護說明](../../docs/bookmarks-development.md)，說明模組、資料與驗證方式。
- **查歷次改動：** [調整總整理](../../docs/bookmarks-adjustments.md)。

線上入口：https://melodypan.github.io/Home/bookmarks/ 。本機在 Home 根目錄執行 `npm start` 後開啟 http://127.0.0.1:4179/bookmarks/ 。

本機與線上都使用 Google Drive；本機另外提供網址連線檢查。GitHub Pages 目前沒有檢查服務，按鈕停用是預期限制。

`src/home.html` 與 `src/home.css` 是範本，執行 `node apps/bookmarks/scripts/build-home.cjs` 產生 `bookmarks.html`。公開頁不內嵌私人書籤，登入後才從 Drive 載入。
