# Home 與 Bookmarks 子系統整合計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Home 內新增 Bookmarks 與成長相簿入口，本機可完整讀寫，GitHub 發布產物不含個人資料。

**Architecture:** Home/apps/bookmarks 放子系統程式；共用本機服務在 /bookmarks 子路徑掛載，根目錄仍為 Home。公開建置只輸出 dist，空白資料與明確預覽模式。雲端供應商未選定，這輪不假裝已能線上存檔，也不部署 main。

**Tech Stack:** 原生 HTML/CSS/JS、Node.js 內建 http/fs、node:test；不新增套件。

- [x] 測試子路徑讀寫、根首頁及資料根目錄隔離。
- [x] 前端資源/API 支援子路徑，公開預覽不讀本機快取或送出存檔。
- [x] 建置公開靜態產物與 Home 整合工具，禁止打包個人資料。
- [x] 保留 Home 現有 index.html 修改，加入入口與只發布 dist 的工作流程。
- [x] 完成原功能回歸、Home 實際載入、資料完整性與打包範圍驗證。

Ruling: 保留原 Bookmarks 目錄作為現有個人資料位置，以 Home/.home-local.json（Git 忽略）指定資料根目錄；不複製或搬移孩子照片，避免兩份資料不同步。新機器無設定時使用 Home/data/bookmarks（同樣忽略）初始化空資料。未選雲端前，公開站為唯讀預覽，不推送發布。

Ruling: Home/index.html 有使用者尚未提交的修改，僅插入子系統卡片並保留其餘位元組，不重建該首頁。整合腳本先在工作區內準備，寫入 Home 時由系統審查跨目錄寫入權限。

驗證結果：Home npm test 107 項通過；npm run build 成功。實際 4179 Home／子系統／照片 HTTP 讀取成功，私有設定與後端路徑 404；原首頁既有內容與四份資料／備份的 SHA-256 不變。公開產物 22 檔，無私人資料；尚未推送或部署。未進行瀏覽器視覺與觸控實測。
