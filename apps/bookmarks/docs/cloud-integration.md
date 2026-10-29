# 書籤雲端儲存摘要

更新日期：2026-10-29。一般操作見 [使用指南](../../../docs/bookmarks-guide.md)，程式設計見 [開發維護說明](../../../docs/bookmarks-development.md)。

書籤一律使用私人 Google Drive，不提供本機資料儲存模式，不需要 Cloud Storage bucket、服務帳號或公開分享資料夾。

檔案位於 MelodyHome，以台灣日期每天一檔。同日條件式更新，跨日有修改才新增。版本衝突由使用者選擇，不自動覆蓋另一台裝置的新資料。

OAuth 使用 drive.file；token 僅暫存在目前分頁 sessionStorage。效期依 Google 回傳 expires_in，不設 10 小時續期窗口。未同步草稿只在記憶體，失敗時先下載備份。

第一次或再次匯入，請使用網站提供的 JSON 匯入功能，不是直接把任意檔案放進 Drive。Chrome HTML 匯出檔不是目前網頁接受的匯入格式。

本機與公開網站都讀寫同一份 Drive 書籤；只有本機提供網址檢查服務。設定與管理者操作見 [Google Drive 設定](google-drive-setup.md)。

使用者可選擇 localStorage 快取已同步書籤；F5 優先顯示，Drive 存檔成功後才替換。自然到期可唯讀瀏覽，主動登出會清除快取。快取不授予編輯權限，詳見 [使用指南](../../../docs/bookmarks-guide.md)。
