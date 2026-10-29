# 隨網站保存的書籤圖示

從官方網站／官方 CDN 取得的原始圖示，2026-10-29 保存，沒有重新繪製。用途為識別書籤連結，不表示網站由這些品牌經營或認可。

| 檔案 | 對應主機 | 官方來源 |
| --- | --- | --- |
| chatgpt.ico | chatgpt.com、www.chatgpt.com、chat.openai.com | https://chatgpt.com/cdn/assets/favicon-eex17e9e.ico |
| gemini.png | gemini.google.com | https://www.gstatic.com/lamda/images/gemini_sparkle_4g_512_lt_f94943af3be039176192d.png |

Gemini 圖示使用當日官方 /app HTML 的 rel=icon 來源。bookmark-core.js 的 shippedIcons 使用精確主機名稱比對，先讀此目錄圖片；成功後不向外站發送圖示請求。其他網站仍先嘗試匯出檔內嵌圖示，再讀根目錄 favicon.ico，失敗時保留文字備援。

新增固定圖示時，一併更新 shippedIcons、本機 server.cjs 資源白名單、根目錄 scripts/home-site-build.cjs 的複製白名單與測試。不要將登入憑證、私人網址或個人書籤清單加入這個公開目錄。
