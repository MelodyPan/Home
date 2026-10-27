# Bookmarks 雲端儲存

更新日期：2026-10-26。使用者已選擇私人 Google Drive，僅供本人跨裝置使用，且明確要求不保留書籤本機儲存方式。

設定與驗收見 [Google Drive 設定](google-drive-setup.md)，架構見 [開發指南](README.md)。本機及公開網站皆採 Drive，未連接不能編輯；成長相簿未包含在本次雲端改造。

每日書籤檔透過 Drive API 建立，同日以 ETag 條件式更新，台灣日期跨日後有修改才新增檔案，資料檔不公開分享。OAuth 採 drive.file，token 僅暫存在目前分頁 sessionStorage，Google token 自動靜默續期，最長登入 8 小時後清除（不限制閒置時間）；同步失敗的草稿只在目前分頁，使用者可手動下載。並行修改以條件式更新阻止舊資料覆寫；原分頁保留未同步草稿，由使用者選擇版本。

首次匯入由使用者選擇舊 bookmarks-data.txt 並確認數量，不自動讀取或上傳原本私人資料。真正連線需要使用者建立 Google 專案、啟用 Drive API 並設定 Web Client ID；尚未完成真實帳號驗證時，不把模擬測試當成正式驗收。

本方案不建立 Cloud Storage bucket 或服務帳號，不需要把 Drive 資料夾設成公開。
