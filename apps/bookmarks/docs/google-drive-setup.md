# Google Drive 書籤設定

更新日期：2026-10-26。bookmarks 現在只使用你自己的 Google Drive。電腦與手機開啟同一個網站、連接同一 Google 帳號，即可載入同一份書籤。成長相簿的儲存方式未變更。

## 1. 建立 Google 專案並啟用 Drive API

1. 開啟 [Google Cloud Console](https://console.cloud.google.com/)，使用要保存書籤的 Google 帳號登入。
2. 在上方專案選單建立專案，例如 `Home Bookmarks`，也可使用你已有的專案。
3. 開啟「API 和服務」→「程式庫」，搜尋 **Google Drive API**，按「啟用」。

本功能不使用 Google Cloud Storage bucket，也不需要服務帳號私鑰。Drive API 的使用及可能適用的計費、配額，請查看[官方用量說明](https://developers.google.com/workspace/drive/api/guides/limits)；檔案占用你的 Google Drive 容量。每次存檔保留完整版本，容量會隨使用累積。

## 2. 設定 Google Auth Platform

依 [Google OAuth 同意畫面說明](https://developers.google.com/workspace/guides/configure-oauth-consent)，在 Google Auth Platform 中設定：

1. **Branding／品牌資訊**：填寫應用程式名稱、支援電子郵件及開發者聯絡電子郵件。
2. **Audience／目標對象**：一般個人 Gmail 帳號選 **External／外部**；自己使用不代表可選僅限 Workspace 組織的 Internal。
3. 尚在 **Testing／測試** 時，在測試使用者中加入自己的 Google 電子郵件。
4. **Data Access／資料存取權**：加入 `https://www.googleapis.com/auth/drive.file`。

`drive.file` 只讓網站操作它建立或你明確選取授權的檔案，不要求存取整個雲端硬碟。[官方權限說明](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

測試模式有帳號及授權限制；先以自己的測試帳號驗證。長期使用時，再依 Console 指示完成應用程式發布設定。這裡的「發布應用程式」是 OAuth 狀態，與網站是否已部署是不同事項。

## 3. 建立 Web OAuth Client ID

1. 在 **Clients／用戶端** 建立 OAuth 用戶端。
2. 類型選 **Web application／網頁應用程式**。
3. 在 **Authorized JavaScript origins／已授權的 JavaScript 來源**，加入實際使用的來源。例如：

   ```text
   http://127.0.0.1:4179
   https://melodypan.github.io
   ```

   若使用獨立除錯服務，再加入 `http://127.0.0.1:4178`。其他自訂網域也必須逐一加入。

   這裡只填協定、網域及連接埠，**不要加 `/Home/bookmarks/` 路徑**。來源必須與瀏覽器網址完全一致。這個本機服務使用 `127.0.0.1`；請使用啟動器提供的網址。

4. 此實作使用瀏覽器 token popup，不使用後端 OAuth callback，不需為它設定重新導向 URI。
5. 複製 Client ID，例如 `123456789-example.apps.googleusercontent.com`。**不需要貼上 Client Secret。**

參考：[Google Client ID 設定](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)、[瀏覽器授權方式](https://developers.google.com/identity/oauth2/web/guides/use-token-model)。

## 4. 設定 Home

編輯 Home 根目錄的 `bookmarks.config.json`：

```json
{
  "googleClientId": "你的ClientID.apps.googleusercontent.com"
}
```

Client ID 是公開設定，可隨網站發布。不要填 Client Secret、Google 密碼、access token 或服務帳號 JSON。

也可使用環境變數 `BOOKMARKS_GOOGLE_CLIENT_ID`，優先於檔案設定。GitHub Pages 工作流程支援同名 Repository **Variable**：在 GitHub 專案 Settings → Secrets and variables → Actions → Variables 加入，再重新執行建置。若未設定 Variable，沿用 JSON 中的 Client ID。

完成後：

```powershell
npm start
```

開啟 `http://127.0.0.1:4179/bookmarks/bookmarks.html`。本機伺服器現在只提供書籤網頁，資料仍一律從 Drive 讀寫。

線上使用需執行 `npm run build` 並部署 `dist/`，或透過既有 GitHub Pages 工作流程部署。網站入口為 `https://melodypan.github.io/Home/bookmarks/`（部署完成後）；公開首頁仍不列出私人子網站卡片，可將此網址加入瀏覽器收藏。

## 5. 第一次匯入

1. 按網頁右上角「登入」，在管理視窗內按「連接 Google Drive」，選擇自己的帳號並允許權限。
2. 尚無雲端書籤時，按「匯入書籤資料檔」，選取原本的 `bookmarks-data.txt`。
3. 這台電腦原始資料位置是 `C:\Users\D078\source\repos\Bookmarks\assets\bookmarks-data.txt`。程式不會自動讀取或刪除它。
4. 確認顯示的書籤、收藏數量，再同意匯入。要保留原資料時，請不要選「建立空白書籤」。
5. 等待顯示「已同步至 Google Drive」。

資料檔以 `bookmarks-YYYY-MM-DD.json` 命名，以台灣日期（Asia/Taipei）每個資料集每天一個檔案；當天操作更新同一檔，隔天有修改才新增檔案。既有日期時間命名的舊版本保留，不會自動刪除。新檔由網站建立在私人 Drive 的 **MelodyHome** 資料夾內，不必開放連結分享。資料夾由網站建立，重用前會確認應用程式標記及未分享狀態；重新連接時，網站會將它之前建立的根目錄版本移到這裡，不改動書籤內容。若同名資料夾已分享或未授權給此應用程式，網站會建立新的私人 MelodyHome 資料夾，不將私人書籤搬入已分享資料夾。

每份版本另存父版本及資料集識別資訊，供跨裝置辨識。不要直接修改、刪除個別版本檔，否則可能造成版本鏈不完整。

本版匯入接受原本的 JSON 資料備份，不直接接受 Chrome HTML 匯出檔。已有資料時，按右上角「雲端管理」（未連接時按「登入」），在管理視窗內按「重新匯入」。畫面會先顯示筆數並要求確認，確認後取代目前資料集的內容；更新當日檔案並保留前幾天的檔案，不另建第二份資料集。匯入後清除篩選並顯示所有書籤。尚未同步完成、離線或有衝突時，請先處理同步狀態。

Google Drive 連接、帳號、同步狀態、「重新同步」、匯入、匯出 Chrome 書籤及備份 JSON 都集中在此管理視窗。關閉視窗仍會繼續同步；同步狀態只顯示在管理視窗內。有版本衝突時會自動開啟管理視窗，供選擇版本。

## 6. 手機或另一台電腦

開啟已部署的同一網址，按「連接 Google Drive」，使用相同 Google 帳號。網站會尋找既有資料，不需重複匯入。若找到多份資料集，會列出建立時間與識別碼供選擇。

所有裝置必須使用同一 Google 專案及此應用程式的設定，才能一致存取其檔案標記。不要在手機另建一個 OAuth 專案。手機上的 `127.0.0.1` 指向手機本身，不會連到電腦。

授權憑證暫存在目前分頁的 sessionStorage，F5 後會自動恢復並從 Drive 重新取得書籤。不限制閒置時間；Google 授權約 1 小時，到期前 5 分鐘會自動靜默續期，登入後最長維持 8 小時，續期失敗則在授權到期時清除登入及畫面資料。關閉分頁、手動中斷連接或 Google 授權到期後需重新登入。未同步草稿仍只在記憶體，授權到期登出時會清除。登入 Google 帳號與允許網站操作 Drive 是兩個步驟。

## 7. 同步失敗與衝突

- 修改會依序同步；關閉分頁前，確認顯示「已同步至 Google Drive」。
- 無網路、權限失效或配額錯誤會停止新的編輯。未同步內容只留在目前分頁，提供重試及「下載目前資料」。關閉分頁或瀏覽器仍可能遺失未同步變更。
- 授權過期，重新連接原 Google 帳號；選到不同帳號時不會把舊草稿寫入新帳號。
- 不同裝置同時修改時，條件式更新阻止舊資料覆蓋較新的內容；未同步草稿留在原分頁。先下載需要留存的內容，再選擇雲端版本或目前分頁草稿，按「使用選取版本」更新當日檔案。不自動合併內容。
- 版本檔尚未被 Drive 搜尋列出時可能暫時要求重試；重試沿用預先配置的檔案 ID，避免同一次儲存重複建立版本。
- 不自動清理歷史版本，亦不提供離線資料庫。瀏覽器只記住格狀／清單的顯示偏好。
- 本機網站右上角「?」提供手動執行連線檢查、進度與取消。結果完成後同步至 Drive；純靜態網站未設定檢查服務時停用此按鈕。內部網址、查詢參數及疑似私人識別碼略過，不將登入限制或逾時認定失效。

## 8. 驗證

一般自動測試與公開建置：

```powershell
npm test
npm run build
```

額外瀏覽器模擬測試：先在開發環境提供 Playwright 與瀏覽器，再執行 `node apps/bookmarks/tests/bookmark-drive.browser.cjs`。可用 `PLAYWRIGHT_MODULE` 指定已安裝的模組路徑，`BROWSER_CHANNEL=msedge` 選用 Edge。測試攔截 Google 請求，不能替代真實帳號驗收。

填入 Client ID 後，需實際完成：首次匯入、另一裝置載入、兩端修改、重新授權及衝突恢復。尚未用你的真實 Google 帳號完成這些步驟前，不能視為正式跨裝置驗收完成。

已連接時，右上角顯示「登出」，點擊即中斷 Google Drive 連接並清除分頁登入暫存；「雲端管理」開啟同步、匯入、匯出與備份視窗。未同步時，登出前仍會提示確認。
