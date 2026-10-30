# 成長相簿

在 Home 根目錄執行 npm start，開啟 http://127.0.0.1:4179/growth/；公開靜態網站也使用相同的私人 Google Drive 儲存方式。

右上角「登入」連接與 bookmarks 相同的 Google OAuth 應用程式。未連接時不載入私人資料，登入後可跨裝置使用相同相簿。設定沿用根目錄 bookmarks.config.json 的 googleClientId 或 BOOKMARKS_GOOGLE_CLIENT_ID 環境變數；詳見 [Google Drive 設定](../../bookmarks/docs/google-drive-setup.md)。

每個相簿資料集每月一份完整紀錄檔，名稱為 growth-YYYY-MM.json，依台灣時區計算儲存月份。同月更新同一份，跨月有修改才建立新檔；每份包含所有歷年紀錄。照片獨立存於私人 MelodyHome／成長相簿照片／孩子代號 資料夾，不每月重複上傳，也不公開分享。重新登入或重新載入會整理既有照片；孩子更名不改代號，紀錄移動後會更新照片位置，檔案 ID 與內容保留。育銓固定使用 01、Baby 使用 02，其餘孩子從 03 起編號，多位孩子共用的照片存於「共同照片」。

原有本機 JSON 與照片不再作日常讀寫來源，原檔保留。第一次在管理視窗選取含 growth-data.json 與 growth-photos 的資料夾，確認孩子、故事及照片數量後匯入。也可下載與還原包含照片的 .growth 完整備份。匯入建立獨立相簿，不取代既有資料。

- Javascript/growth.js：既有畫面、表單與縮圖。
- Javascript/growth-cloud-ui.js：Google 授權、同步管理、私人照片網址、匯入與備份。
- Javascript/growth-drive.js：每月 Drive 版本、條件式更新及照片存取。
- Javascript/growth-data.js：共用資料驗證。
- Javascript/growth-backup.js：含照片與校驗的可攜備份。
- scripts/server.cjs：僅提供公開靜態資源與設定；舊資料及照片 API 回傳 404。
- scripts/growth-store.cjs：保留舊格式的回歸測試，不由正式服務載入。

在 Home 根目錄執行 npm test 及 npm run build。完整操作說明見 [相簿指南](docs/growth-album.md)。測試使用替身 Drive，真實 Google 授權及跨裝置同步仍需實際帳號驗收。
