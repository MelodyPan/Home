# Home 與書籤子網站整合

更新日期：2026-10-29。本文件只描述書籤；其他子網站的儲存與部署方式，請閱讀各自文件。

## 本機開啟

在 Home 根目錄執行 `npm start` 或使用既有 Home 啟動器，再開啟 http://127.0.0.1:4179/bookmarks/ 。不要直接雙擊 HTML 使用 OAuth。

本機服務提供網頁、公開設定與無狀態網址檢查 API。它不讀寫舊書籤資料檔，也不提供舊 `/bookmarks/api/bookmarks` 儲存 API；書籤仍透過 Google 授權讀寫 Drive。

手機上的 127.0.0.1 是手機本身，不會連到電腦。跨裝置平常使用線上 HTTPS 網址。

## 公開建置

從 Home 根目錄執行 `npm test` 與 `npm run build`，只發布 `dist/`。書籤頁由範本產生空白資料，登入後才載入私人 Drive。圖片路徑與模組皆需支援 GitHub 專案子路徑 `/Home/`。

公開建置不包含 Node.js 伺服器，因此不提供網址檢查。不能把本機的 urlCheckAvailable 設定直接當成線上能力。

公開 Google Client ID 來自 `BOOKMARKS_GOOGLE_CLIENT_ID` 或根目錄 `bookmarks.config.json`，設定見 [Google Drive 設定](google-drive-setup.md)。Client Secret 或存取 token 不應放入公開設定。

## 發布

既有 GitHub Actions 會在 main 推送後測試、建置、部署。更新前確認提交範圍，避免混入私人資料與其他子網站未完成的改動；部署成功後再確認公開頁面與資源版本。

完整模組與驗證方式見 [開發維護說明](../../../docs/bookmarks-development.md)，一般使用見 [使用指南](../../../docs/bookmarks-guide.md)。
