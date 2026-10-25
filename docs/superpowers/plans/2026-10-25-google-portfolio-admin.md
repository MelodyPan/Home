# Google 作品後台 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 使用 Google 帳號管理私人 JSON 作品清單，不使用 Supabase。

**Architecture:** 共用資料格式驗證、Node HTTP 作品 API、本機／GCS 兩種儲存介面、Google ID token 授權。Cloud Run 使用獨立公開入口；首頁透過公開 API 取得已發布資料。

**Tech Stack:** Node >=22、google-auth-library、原生 HTML/CSS/JS、Google Cloud Run/Storage。

**Spec:** ../specs/2026-10-25-google-portfolio-admin-design.md

## Global Constraints

- 不使用 Supabase；不建立自訂帳號密碼；不提供免登入寫入。
- 不讀寫或發布既有私人書籤、孩子與照片。
- 不提交、推送或部署；帳號設定尚未提供。
- 保留既有工作區未提交變更。

## Review Focus

- Google token 不可信任前端解碼；每次私人請求必須驗證與授權。
- 過期／未驗證 Email／非管理員不能讀寫 JSON。
- JSON 損壞或雲端失敗不能覆寫成初始清單。
- 並行存檔只能一筆成功，衝突不遺失草稿。
- 公開站不洩漏草稿、私人設定或本機資料 API。

### Task 1: 資料與後端

**Files:** apps/admin/server/{auth,store,handler,config}.cjs、apps/admin/public/project-model.js、apps/admin/tests/*.test.cjs

**Interfaces:** store.read() -> {document,revision}; store.write(document,expectedRevision) -> {document,revision}; verifier(token) -> verified Google payload；handler(req,res) -> handled boolean。

- [x] 先寫並執行失敗測試：未授權、格式錯誤、草稿過濾、排序及過期版本。
- [x] 實作格式驗證、本機鎖與 GCS generation 條件存檔、Google token 驗證、API。
- [x] 驗證測試通過。

### Task 2: 前後台與整合

**Files:** apps/admin/public/**、apps/admin/projects.seed.json、scripts/home-site-{server,build}.cjs、scripts/portfolio-server.cjs、index.html

- [x] 匯入目前公開作品成為初始 JSON。
- [x] 建立 Google 登入、作品列表、編輯表單、排序與儲存衝突處理。
- [x] 首頁載入公開作品並安全建立 DOM；未設定維持現有頁面。
- [x] 本機路由與靜態建置支援 admin/portfolio，補上 HTTP 整合測試。

### Task 3: 部署準備與驗收

**Files:** Dockerfile、.dockerignore、.home-portfolio.example.json、docs/google-portfolio-admin.md、README.md

- [x] 提供 Google Cloud 設定與部署步驟，以及本機設定範例。
- [x] 完整 npm test、npm run build、HTTP 靜態站與後台驗收。
- [x] 獨立審查並修正可重現問題，清楚列出尚待外部設定的項目。

## 執行紀錄

使用者指示先實作；Google Cloud 設定是否存在尚不確定。採目前工作區實作，因為所有既有子站仍有未追蹤檔案，避免另建工作目錄遺漏程式。

- 驗證：完整 npm test 通過 121 項（53 書籤、53 相簿、1 共用、9 後台、5 Home 整合）；npm run build、語法檢查及 git diff --check 通過。
- 審查：獨立 reviewer 發現同源 API 失敗時回退舊清單的問題；新增失敗回歸測試後修正，並加入 hidden CSS 以確保錯誤時真正隱藏舊清單。其餘身分、CAS、隔離與草稿流程未發現可行動問題。
- 瀏覽器：實際開啟本機 /admin/，確認無設定時顯示 Google 登入尚未設定，工作區保持隱藏。畫面保存於 docs/admin-login-preview.png。
- 外部限制：沒有 Google Cloud 專案／Client ID／管理員帳號；未進行真實 Google 登入、GCS 連線、Docker build 或雲端部署，相關步驟已文件化。
