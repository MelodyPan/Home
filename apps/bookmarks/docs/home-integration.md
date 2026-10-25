# Home 與書籤／成長相簿整合操作說明

日期：2026-10-25。這一輪完成 Home 子系統架構與本機整合；公開網站先為唯讀預覽，雲端供應商尚未選定。

## 使用方式

在 `Home` 專案雙擊 `start-home.cmd`，或執行 `npm start`。首頁為 `http://127.0.0.1:4179/`，兩張獨立卡片分別進入：

- 書籤：`http://127.0.0.1:4179/bookmarks/bookmarks.html`
- 成長相簿：`http://127.0.0.1:4179/growth/growth.html`

兩個子網站頁面都能返回 Home，書籤與成長相簿目錄入口分別為 `/bookmarks/` 和 `/growth/`。舊 `/bookmarks/growth.html` 會轉址至新相簿網址；舊相簿 API 與照片路徑使用保留方法的 307 轉址。原獨立 Bookmarks 的 4178 埠仍可使用，不會被 Home 啟動器任意關閉。整合版的「停止服務」會停止同一個 Home 本機服務。

## 程式與個人資料分開

```text
Home/
├─ index.html                  保留原首頁內容，加入子系統卡片
├─ apps/bookmarks/             書籤程式、範本、測試及文件
├─ apps/growth/                成長相簿程式、測試與公開參考資料
├─ apps/shared/                共用主題、執行設定及資料鎖
├─ scripts/                    Home 服務、啟動及公開建置
├─ .home-local.json            個人資料位置設定（Git 忽略）
├─ data/bookmarks/             新安裝的預設空資料位置（Git 忽略）
├─ dist/                       公開建置產物（Git 忽略）
├─ package.json                npm start / test / run build
└─ start-home.cmd
```

本機這次整合以 `.home-local.json` 指向原本 `../Bookmarks`，因此書籤與孩子照片仍在原 `Bookmarks/assets`，沒有複製成第二份相簿。請繼續備份原資料目錄。這個設定不加入 Git；其他電腦未提供設定時，Home 會在 `data/bookmarks/assets` 初始化空白資料，不會取得這台電腦的照片。

`createBookmarkServer()` 現在可接收 `basePath`、`dataRoot` 及 `serveRoot`：子路徑、公開程式與私人資料各自指定，既有本機 API 與 ETag 衝突檢查保留。伺服器只提供明確列出的 Home HTML／圖片及子系統靜態檔案；`.home-local.json`、程式原始碼與私人資料目錄不能直接透過網址讀取。

## GitHub Pages 建置

在 Home 執行：

```powershell
npm test
npm run build
```

工作流程改為先測試、再建置，最後只發布 `dist/`。`apps/bookmarks` 的程式碼與測試可版本管理，但不整包發布成網站。

公開產物的書籤 HTML 從範本建立，內嵌清單與圖示陣列為空；不複製原始書籤、孩子 JSON、相片、備份、後端腳本或原始私人匯出。官方生長參考數據屬公開程式資源，可隨前端一起載入。測試使用 `tests/fixtures/` 的合成範例，不依賴私人書籤。

`Javascript/app-runtime.js` 依自身 script 網址定位子系統，支援 GitHub Pages `/Home/bookmarks/` 路徑。公開產物的 `site-config.js` 為 `preview`，顯示尚未設定雲端儲存的提示，不讀私人瀏覽器快取，也不發送資料存檔請求；本機 Home 服務動態回傳 `local` 設定。

建置只清理具有工具標記的 `Home/dist`，遇到未知 dist 目錄、符號連結或非預期輸出位置會停止，以免誤刪其他檔案。

## 本輪不包含線上雲端儲存

GitHub Pages 預覽目前無法登入、上傳新照片或跨裝置保存紀錄。供應商選定後，需接上登入、使用者資料隔離、私人照片存取與線上版本衝突處理。既有照片不會在本次整合自動上傳。

這次只更新本機程式，未推送或發布 GitHub。Home 原本尚未提交的首頁修改會保留，整合僅插入卡片。

## 原 Bookmarks 工作區更新

整合工具 `scripts/integrate-home.cjs` 是從原工作區移入 Home 的一次性工具；在原 Bookmarks 目錄執行 `node scripts/integrate-home.cjs ../Home` 可同步程式（需確保 Home 子系統沒有另行修改的程式）。正式後續開發以 Home 的 `apps/bookmarks/`、`apps/growth/` 與 `apps/shared/` 為準，避免兩處獨立改版。原整合工具已改為同步三個目錄，請勿使用原 Bookmarks 工作區中的舊版整合工具覆蓋拆站結果。

## 共用資料的存檔保護

原 4178 與 Home 4179 都需重新啟動至新版，才會共用跨程序鎖。儲存時先排他建立對應資料檔的 `.lock`，再重新讀取與比對 ETag；同一版本的兩筆存檔只接受一筆，另一筆回報 409。背景網址檢查也使用相同鎖。

正常完成或失敗會釋放鎖；不會自動搶走其他程序的鎖。若電腦或服務異常中止而留下鎖，先停止兩個本機服務，確認沒有存檔進行中，再只刪除 `assets/bookmarks-data.txt.lock` 或 `assets/growth-data.json.lock` 後重啟。不要刪除正式資料、備份或照片。
