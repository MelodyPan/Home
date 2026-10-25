# Google 登入與 JSON 作品後台

使用者已要求先實作，並明確指定 Google 帳號登入、不要 Supabase。本設計記錄執行時的具體選擇。

- 前端：沿用原生 HTML/CSS/JS，新增 `apps/admin/`，首頁仍保留目前靜態作品作為未設定雲端時的內容。
- 登入：Google Identity Services 按鈕，ID token 僅保存在分頁記憶體；每次私人 API 請求由 Node.js 官方 Google Auth Library 驗簽、audience、有效期，再檢查管理員白名單。沒有自訂密碼或免登入管理模式。
- 授權：優先設定 Google `sub`；若先用 Email 設定，僅接受 Google 權威驗證的 Gmail 或 Workspace Email，且必須 email_verified。私人 API 不開放跨站 CORS。
- JSON：本機可用私人檔案；雲端採私人 Google Cloud Storage `projects.json`，以 generation 條件寫入避免兩人覆蓋。讀取固定 generation，確保資料與版本相符。
- 公開首頁：只取已公開作品；設定雲端後，讀取失敗顯示錯誤，不回退成可能已下架的舊清單。後台保留完整草稿。
- 部署：Cloud Run 使用獨立的公開服務入口，僅提供建置後的靜態頁與作品 API，不暴露本機書籤／相簿寫入 API。GitHub Pages 可透過公開 API URL 讀作品，後台移至同源 Cloud Run 網址，避免跨站登入問題。
- 未設定時：後台顯示尚待設定 Google 登入，不讓訪客編輯；原首頁仍可看。Google Cloud 專案、OAuth Client ID、管理員帳號尚未提供，因此不宣稱已完成線上登入或部署。
- 操作：新增、編輯、刪除、排序、公開／隱藏、精選、連結與新分頁選項；刪除需確認，未儲存變更有提示；存檔衝突保留編輯內容，不能無聲覆寫。
- 驗證：真實本機 HTTP + 暫存 JSON 測登入拒絕、白名單、欄位驗證、公開過濾、版本衝突；Google 與 Cloud Storage 邊界以可注入的外部介面測試，真實第三方登入須完成帳號設定後驗證。
