# 書籤開發文件入口

更新日期：2026-10-29。

完整且已對照程式的說明集中在 [開發維護說明](../../../docs/bookmarks-development.md)，一般使用者請看 [使用指南](../../../docs/bookmarks-guide.md)。

維護前先確認以下條件：

- 正式書籤存 Google Drive；瀏覽器只暫存授權及版面偏好，不保留本機書籤資料庫。
- 每個資料集以台灣日期每天一個檔案；同日更新、跨日有修改才新增。
- 同日版本必須比較 file ID 與 commit；版本檔缺漏或衝突不能用空白資料蓋過去。
- Drive v3 ETag 讀不到時，使用 v2 JSON etag 與同版本條件式更新；兩邊都沒有有效版本資訊才停止。
- Google 授權效期依實際 expires_in，不自動續期。取消與 token 到期是不同流程。
- 本機檢查 API 不讀寫書籤文件；前端完成整批後，才合併結果並同步 Drive。
- 編輯 src 範本後要重建 bookmarks.html；發布前測試乾淨副本，不倚賴未提交檔案。

相關文件：[Google Drive 設定](google-drive-setup.md)、[整合與部署](home-integration.md)、[歷次調整](../../../docs/bookmarks-adjustments.md)、[iPhone 取消登入恢復](../../../docs/bookmarks-iphone-login-recovery.md)。
