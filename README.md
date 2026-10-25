# Home
home

## 書籤與成長相簿

雙擊 `start-home.cmd` 或執行 `npm start`，開啟 `http://127.0.0.1:4179/`。

- 書籤：`apps/bookmarks/`，入口 `/bookmarks/`。
- 成長相簿：`apps/growth/`，入口 `/growth/`。
- CathFlow：`apps/cathflow/`，入口 `/cathflow/`。
- DynastyExplorer：`apps/dynasty-explorer/`，入口 `/dynasty-explorer/`。
- 共用程式：`apps/shared/`；兩站由同一個 Home 服務啟動。
- 本機資料：由 `.home-local.json` 指定，該檔與私人資料不加入 Git。
- 測試：`npm test`；公開建置：`npm run build`。GitHub Pages 只發布 `dist/`。
- 公開站目前為唯讀預覽，雲端登入、照片上傳與儲存須待選定服務後接上。
- 不要把孩子資料、照片或原始私人書籤複製到公開目錄。

詳細說明見 `apps/bookmarks/docs/home-integration.md`。

拆站後仍沿用原資料目錄，無須搬移書籤與照片；舊 `/bookmarks/growth.html` 會導向新相簿網址。

## Google 帳號作品管理

後台：`http://127.0.0.1:4179/admin/`。支援新增、編輯、刪除、排序、精選及公開／隱藏；僅允許指定的 Google 管理員帳號，不使用 Supabase。

先依 [設定與部署指南](docs/google-portfolio-admin.md) 完成 Google OAuth Client ID 和管理員設定。未設定時後台保持鎖定。線上版本使用 Cloud Run＋私人 Cloud Storage JSON，`npm run start:cloud` 為雲端服務入口；GitHub Pages 可透過 `portfolio.config.json` 指向公開作品 API。
