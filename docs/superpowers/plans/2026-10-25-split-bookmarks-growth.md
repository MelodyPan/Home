# 書籤與成長相簿拆站實作計畫

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 將書籤及相簿拆成兩個子目錄、入口與路由，保留資料及原功能。

**Architecture:** Home 共用一個 HTTP 服務。書籤與相簿分別擁有專用前端、儲存模組與測試；通用執行設定、樣式及資料鎖放入 apps/shared。Home 統一掛載、啟動與公開建置。

**Tech Stack:** Node.js >=22、原生 HTTP、HTML/CSS/JavaScript、node:test。

**Spec:** ../specs/2026-10-25-split-bookmarks-growth-design.md

## Global Constraints

- 沿用私人資料目錄，不搬移既有資料與照片。
- 保留 ETag、同來源驗證、資料鎖與寫入完成後停止服務。
- 保留現有未提交變更；不提交、推送或發布。
- 公開產物只含白名單資源與空白書籤。

## Review Focus

- 舊相簿網址可轉址；舊 API 使用保留方法的轉址。
- GitHub Pages 專案路徑下仍正確定位兩站資源。
- 私人檔案、設定與來源程式不能經 HTTP 或建置公開。
- 相簿照片與 ETag 寫入在新路徑仍正常。
- 啟動器版本指紋包含拆出的服務與資料鎖。

### Task 1: 固定拆站契約

**Files:** scripts/tests/split-sites.test.cjs

- [x] 測試兩站目錄入口、舊頁轉址、資源載入及站間隔離。
- [x] 測試新路徑 API、照片、ETag 衝突與舊資料目錄。
- [x] 測試公開建置兩站資源、空白資料及私人檔案排除。
- [x] 執行新測試確認目前路由未拆分而失敗。

### Task 2: 拆分程式與整合

**Files:** apps/growth/**、apps/shared/**、apps/bookmarks/scripts/server.cjs、scripts/home-site-{server,build}.cjs、scripts/test.cjs、index.html

**Interfaces:** createGrowthHandler(root, options) -> {handle, flush}; createGrowthServer(root, options) -> http.Server；createHomeServer(homeRoot, options) 沿用既有介面。

- [x] 搬移相簿專用前端、儲存、文件與測試；抽出共用資源。
- [x] Home 掛載 /growth；書籤服務只處理書籤，停止時等待兩站寫入。
- [x] 更新建置白名單、首頁兩張卡片及頁面間連結。
- [x] 更新測試啟動器及舊整合工具，避免重建合併網站。
- [x] 執行新測試及既有完整測試，修正拆分引起的路徑問題。

### Task 3: 文件與驗收

**Files:** README.md、apps/bookmarks/docs/home-integration.md、apps/growth/README.md、.gitignore

- [x] 記錄新目錄、網址與既有資料沿用方式。
- [x] 執行 npm test、npm run build，檢查差異及產物連結。
- [x] 回報結果與驗證證據。

## 執行紀錄

- 使用者已確認拆站設計，直接在目前工作區執行；既有 apps 尚未追蹤，另建 worktree 無法包含待拆分程式。

- 驗證紀錄：拆站驗收曾因原目錄入口為 200、缺少 dist/growth 而失敗；搬移與路由／建置更新後通過。書籤 53 項、相簿 53 項、共用 runtime 1 項與 Home 拆站 2 項組成完整測試。
- 執行器決定：不建立新分支、不提交工作區既有未追蹤檔案；保留使用者的目前 checkout，避免遺失尚未納入 Git 的待拆分程式。
- 最終審查：獨立 reviewer 未發現拆站路由、資料保護、停止服務或公開建置的可行動問題。
- 本機驗收：4179 健康檢查與目前版本一致；兩站入口和舊相簿轉址正常，啟動器再次執行成功。
