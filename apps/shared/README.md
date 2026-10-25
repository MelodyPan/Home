# 共用資源

`Javascript/app-runtime.js` 與 `site-config.js` 提供站內 API 定位及本機／公開預覽設定；`src/cozy-theme.css` 為共用主題，`scripts/data-lock.cjs` 為跨程序資料鎖。

Home 的服務與建置流程會將前端資源提供在兩站各自的網址下，確保 `document.currentScript` 能定位正確的子網站。私人資料不放在這裡。
