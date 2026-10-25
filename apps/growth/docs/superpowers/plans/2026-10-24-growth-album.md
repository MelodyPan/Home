# 本機多孩子成長相簿 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在既有本機書籤網站加入多孩子成長相簿、左右翻頁及紀錄維護。
**Architecture:** 沿用原生 HTML/CSS/JS 與 Node HTTP 服務，growth.html 為獨立入口。JSON 中保存孩子及紀錄，照片以獨立檔案存放；採同來源驗證、ETag 衝突保護與原子替換、上一版備份。
**Tech Stack:** Node.js 22+, browser DOM/Fetch/Canvas, node:test；無第三方套件。
**Spec:** 使用者已選擇直接實作「本機使用、可分別管理多位孩子」。

## Global Constraints
- 保留既有書籤資料與啟動方式；只綁定 127.0.0.1。
- 不上傳個人資料、不新增託管網站；介面使用繁體中文。
- 本目錄不是 Git repository，直接修改現有檔案，不建立 worktree 或 commit。

## Review Focus
- 空白首次使用可建立第一位孩子；缺檔才初始化，損毀資料不能覆蓋。
- 孩子及紀錄關聯驗證；刪除孩子要確認並移除所屬紀錄。
- 圖片限制型別、檔案大小及路徑；不任意提供本機檔案。
- 跨視窗存檔衝突應拒絕，保留使用者表單。
- 翻頁邊界、手機操作、儲存失敗及原有書籤功能。

### Task 1: 持久化服務
Files: scripts/growth-store.cjs, scripts/server.cjs, scripts/server-version.cjs, tests/growth-server.test.cjs
Interfaces: createGrowthStore(root) => {handle(req,res), flush()}; GET/PUT /api/growth; POST /api/growth/photos; GET /assets/growth-photos/<uuid>.<ext>.
- [x] 先寫 HTTP 行為測試，確認缺少 API 時失敗。
- [x] 實作 JSON schema 驗證、ETag/備份/排隊寫入、圖片驗證與讀取。
- [x] 驗證初始載入、重啟持久化、備份、衝突、非法來源、格式錯誤、路徑限制。

### Task 2: 相簿及維護介面
Files: growth.html, src/growth.css, Javascript/growth.js, src/home.html, index.html
- [x] 新增首頁入口；提供孩子管理、紀錄及照片編輯、刪除確認、年份搜尋。
- [x] 製作雙頁相簿、前後頁按鈕、鍵盤與觸控滑動、照片切換與空狀態。
- [x] 瀏覽器已驗證新增兩位孩子、多張照片、翻頁、修改及重新載入；刪除在原生確認視窗受到測試工具阻擋，刪除資料隔離以 HTTP 整合測試驗證。

### Task 3: 回歸與文件
Files: README.md, docs/README.md
- [x] 更新使用、資料位置及備份說明。
- [x] 執行 node --test、node --check 及首頁重建。
- [x] 記錄通過數與任何未完成的瀏覽器檢查。

## 執行與驗證紀錄
- 先新增成長 API 整合測試，確認未實作時回傳 404（失敗），實作後全部通過。
- 瀏覽器使用獨立暫存資料：建立兩位測試孩子、生日及文字紀錄、兩張照片縮圖／上傳／切換、上一頁、修改故事、年份及關鍵字篩選、重新載入與 390px 版面。
- 刪除確認視窗可觸發，但 IAB 測試工具在原生 confirm 出現後操作逾時；未宣稱完整通過瀏覽器刪除流程。HTTP 整合測試驗證刪除孩子保留其他孩子紀錄，以及兩筆併發寫入只允許一筆成功。
- 獨立唯讀程式審查未發現 Critical / Important 問題。未採用 Git 工作樹，因現有資料夾不是 Git repository。
- Ruling: 本機既有專案直接實作，不新增 Sites 託管；符合使用者選定的本機使用方式。
- Ruling: 刪除保留照片實體，以維持上一版備份可還原；README 已說明磁碟保留行為。
