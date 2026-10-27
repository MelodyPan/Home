# Home 與書籤／成長相簿整合

更新日期：2026-10-26。

## 使用方式

在 Home 根目錄執行 npm start 或雙擊 start-home.cmd。首頁為 http://127.0.0.1:4179/；書籤入口 /bookmarks/，相簿入口 /growth/。Home 的停止服務仍位於 /admin/ 右上角，會等待相簿寫入完成。停止本機服務不代表 Drive 草稿已同步，關閉書籤前須確認同步狀態。

bookmarks 僅使用 Google Drive，localhost 也不讀寫本機書籤。依 [Drive 設定](google-drive-setup.md) 設定 Client ID，連接自己的帳號並首次匯入。舊 /bookmarks/assets/bookmarks-data.txt、/bookmarks/api/bookmarks 已移除；另提供手動觸發、無狀態的網址連線檢查 API，不讀寫本機書籤。

成長相簿維持原有本機儲存。Home 的 .home-local.json 仍可提供 growthDataRoot；為相容既有安裝，也沿用 bookmarksDataRoot 作為相簿的舊資料根目錄。這個舊設定名稱不代表書籤仍會讀取該處資料。本機既有書籤、照片及備份皆不刪除。

## 程式與資料

- apps/bookmarks：書籤頁面、Drive 存取及測試。
- apps/growth：相簿程式與原有本機資料服務。
- apps/shared：共用主題、runtime 與相簿使用的資料鎖。
- bookmarks.config.json：公開 Google OAuth Client ID，不含密碼或私鑰。
- .home-local.json：Git 忽略的相簿資料位置設定。
- dist：公開建置產物，不包含私人書籤、相簿 JSON、照片或備份。

舊相簿網址及 API 轉址保持原有行為。相簿仍保留跨程序資料鎖與 ETag；書籤已不使用本機檔案鎖。

## 公開建置

npm test 執行各子站測試；npm run build 建置書籤 Drive 模式與相簿唯讀預覽。只有設定公開 Client ID 後才能連接 Drive；未設定時顯示設定提示。公開首頁依原有行為不列私人子網站入口，部署後可直接開啟 /Home/bookmarks/。

GitHub Actions 只發布 dist，可透過 BOOKMARKS_GOOGLE_CLIENT_ID Repository Variable 注入 Client ID；詳見 Drive 設定文件。本次程式修改不會自行推送或發布網站，也不會自動上傳舊資料。
