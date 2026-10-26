# 書籤工作台開發指南

更新日期：2026-10-26。一般操作見 [書籤指南](user-guide.md)，首次設定見 [Google Drive 設定](google-drive-setup.md)。

## 架構

原生 HTML、CSS、JavaScript，資料一律存放 Google Drive；沒有本機書籤資料 API 或儲存模式切換。Node.js 22 用於建置、測試與本機靜態服務。成長相簿仍由獨立的 apps/growth 處理。

| 檔案 | 責任 |
| --- | --- |
| src/home.html、src/home.css | 頁面範本與樣式 |
| Javascript/bookmark-core.js | 書籤分類、編輯、搜尋與匯出 |
| Javascript/bookmark-file.js | JSON 快照格式與驗證 |
| Javascript/bookmark-drive.js | Drive API、版本圖、不可變快照、重試 |
| Javascript/bookmark-cloud.js | 帳號、資料集、同步佇列與記憶體草稿 |
| Javascript/bookmark-drive-ui.js | Google 授權、匯入、版本選擇與連接控制 |
| Javascript/home.js | 書籤畫面與操作 |
| scripts/drive-config.cjs | 驗證並輸出公開 Client ID 設定 |
| scripts/server.cjs | 本機公開資源、健康檢查、服務停止與子站委派 |

## 資料流

使用者按連接 → Google token 授權 → Drive about 確認帳號 → 搜尋本應用程式建立的資料集 → 載入唯一最新版本或提示選擇 → 編輯 → 序列化建立快照。

每份雲端檔案含 format、datasetId、parents、data；data 沿用 schemaVersion:1、baseEntries、changes、favorites、checkedAt、衍生 entries。appProperties 保存用途、資料集及父版本；合併版本的完整父清單存於內容。一般版本僅需下載最新快照，合併版本需讀取其父清單。搜尋支援分頁，遺失祖先、循環或格式錯誤時停止，不靜默建立空白資料。

存檔先確認目前版本，再預先配置 Drive file ID，以 multipart create 建立新檔。上傳結果不明時重試同一 ID，不覆寫檔案。兩個裝置同時存檔可能產生分支，但內容不會互相覆蓋；使用者明確選擇後建立含所有衝突父版本的新快照。Drive 搜尋結果延遲可能延後衝突發現，這不是分散式鎖；所有已上傳分支仍保留。

授權 token 與最後操作時間只暫存在目前分頁 sessionStorage，F5 後可恢復，閒置 10 分鐘登出；草稿、帳號與資料集識別只在分頁記憶體，localStorage 僅保存格狀／清單偏好。中斷連接清空私人畫面；有未同步內容時先提示。更新目前無草稿的分頁可重新載入雲端；編輯對話框開啟時不因切回視窗而刷新內容。

## 開發與驗證

在 Home 根目錄執行 npm test、npm run build。修改範本後執行 node apps/bookmarks/scripts/build-home.cjs 重建 bookmarks.html。公開建置只發布白名單資源與空白內嵌資料，不讀取原本私人書籤。

自動測試使用合成資料與模擬 Drive。額外瀏覽器驗證見 google-drive-setup.md；未設定 Client ID 與真實 Google 帳號前，不能宣稱真實跨裝置驗收通過。

舊版報告工具與 history 內文件保留作歷史參考，不是目前儲存流程。自動網址檢查的本機 API 已移除；原有檢查結果與手動狀態仍可使用。
