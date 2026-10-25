# Google 帳號登入與 JSON 作品管理

本方案使用 Google Identity Services、Node.js 及 Google Cloud Storage，不使用 Supabase，也沒有自訂密碼或免登入編輯。管理頁位於 `/admin/`，目前原有 9 件作品已整理為初始資料。

## 先確認是否有 Google Cloud 專案

用準備管理網站的 Google 帳號開啟 [Google Cloud Console](https://console.cloud.google.com/)，點上方專案選單。如果已有適合的專案，可沿用；否則建立一個專案。Google 登入的 OAuth 設定可以先做，Cloud Run／Storage 的線上部署則需要專案啟用帳單計費。

接著在 Google Auth Platform 設定應用程式名稱、聯絡 Email、Audience，以及 Web application 類型的 OAuth Client。若應用程式仍處於測試狀態，將自己的帳號加入測試使用者。

Authorized JavaScript origins 先加入 `http://127.0.0.1:4179`。這裡使用 Google 按鈕的 JavaScript callback，不需要 OAuth Client Secret，也不要把 Client Secret 或服務帳號金鑰放到前端。

完成後會取得以 `.apps.googleusercontent.com` 結尾的 Client ID。Google 官方說明：[建立用戶端](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)、[伺服器驗證 ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)。

## 本機驗證 Google 登入

1. 執行 `npm ci`。
2. 複製 `.home-portfolio.example.json` 為 `.home-portfolio.json`，填入 Client ID 和允許的 Google Email。
3. 執行 `npm start`，開啟 `http://127.0.0.1:4179/admin/`。
4. 按 Google 登入按鈕，確認管理員帳號可維護，其他帳號被拒絕。

本機 JSON 保存於 `data/portfolio/projects.json`，不納入 Git。第一次儲存前以初始作品為底稿；後續存檔保留 `.bak` 並使用跨程序鎖。JSON 損壞時不會自動覆寫成空檔。私人 JSON 不提供直接網址下載，必須通過私人 API。

建議第一次登入後，透過帶有 Authorization 的 `/api/admin/me` 回應確認自己的 Google `sub`，填進 `adminSubjects`。設定了 `adminSubjects` 後，只有清單內的 sub 可管理，Email 白名單不再另外放行。Gmail／Google Workspace 可先以 Email 初始化；其他網域的 Google 帳號請直接使用 sub。

Token 僅保存在分頁記憶體，重新整理需再次按 Google 登入。Token 過期後需重新登入，尚未儲存的草稿會保留在目前分頁，也可下載。資料不存入 localStorage。

## 線上儲存與部署

建議 Cloud Run 提供後台和 API，Google Cloud Storage 使用專用私人 bucket 保存 `projects.json`。Cloud Run 使用所附服務帳號的 Application Default Credentials，不需下載服務帳號金鑰。

以下 PowerShell 範例需先安裝並登入 Google Cloud CLI，將所有佔位文字換成自己的值。這些命令會建立雲端資源並部署；目前未自動執行。

```powershell
$projectId = '你的專案-ID'
$bucketName = '全球唯一的私人-bucket-名稱'
$serviceName = 'home-portfolio'
$regionName = 'asia-east1'
$clientId = '你的-client-id.apps.googleusercontent.com'
$adminEmail = '你的-google-email'

gcloud auth login
gcloud config set project $projectId
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com storage.googleapis.com
gcloud iam service-accounts create home-portfolio
$serviceAccount = "home-portfolio@$projectId.iam.gserviceaccount.com"
gcloud storage buckets create "gs://$bucketName" --location=$regionName --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update "gs://$bucketName" --versioning
gcloud storage buckets add-iam-policy-binding "gs://$bucketName" --member="serviceAccount:$serviceAccount" --role=roles/storage.objectUser

# 只在物件尚不存在時匯入原有作品，避免覆蓋已維護的線上內容。
gcloud storage cp apps/admin/projects.seed.json "gs://$bucketName/projects.json" --if-generation-match=0

# 初次部署先使用無法通過來源驗證的佔位網址；取得服務網址後立即更新。
gcloud run deploy $serviceName --source . --region=$regionName --service-account=$serviceAccount --allow-unauthenticated --set-env-vars="GOOGLE_CLIENT_ID=$clientId,ADMIN_EMAILS=$adminEmail,PROJECTS_BUCKET=$bucketName,PUBLIC_ORIGIN=https://setup.invalid"
$serviceUrl = gcloud run services describe $serviceName --region=$regionName --format='value(status.url)'
gcloud run services update $serviceName --region=$regionName --update-env-vars="PUBLIC_ORIGIN=$serviceUrl"
```

`--allow-unauthenticated` 讓首頁與 Google 登入頁可被訪客載入；作品私人 API 仍會逐次驗證 Google token 與管理員名單。Cloud Run 入口不掛載原本的本機書籤／相簿寫入 API，避免把既有私人資料服務開上網。

取得 `$serviceUrl` 後，回到 Google Auth Platform 的 OAuth Client，將該 HTTPS 網址加入 Authorized JavaScript origins。再開啟 `$serviceUrl/admin/` 測試登入、儲存和公開首頁。部署者需要建置與部署服務的 IAM 權限；不同專案的組織政策可能需要管理員協助授權。

雲端 JSON 使用 generation 作為版本，存檔要求版本吻合；同一舊版本的兩筆更新只接受一筆，另一筆回覆 409。讀取時也固定 generation，避免把舊版本配上新內容。Bucket versioning 保留舊版，可由 Cloud Console 復原；建議另依需求設定保留期限與備份。[官方條件寫入說明](https://docs.cloud.google.com/storage/docs/request-preconditions)

## GitHub Pages 與 Cloud Run 的搭配

可直接使用 Cloud Run 提供完整 Home 網站。若仍以 GitHub Pages 作為公開首頁，將 `portfolio.config.json` 的 `apiBaseUrl` 設為 Cloud Run 的根網址，例如 `https://你的服務.run.app/`，再執行建置與原有發布流程。

公開首頁只讀 `/api/projects` 的已公開作品；私人資料與 Google token 不跨站傳送。GitHub Pages 的 `/admin/` 會跳轉到 Cloud Run 的 `/admin/`，Google 登入與私人 API 都在同一來源執行。

遠端 API 或同源 API 載入失敗時會顯示錯誤，不會重新顯示可能已隱藏或刪除的舊作品。只有未指定遠端且 API 回覆 404 的靜態 GitHub Pages 才維持原本清單；若直接以 `file://` 開啟 HTML，請改用 `npm start` 的網址才能進入後台。

## 日常操作

- 新增或編輯作品後，按表單底部的「儲存並更新首頁」，一次即可寫入 JSON，無須再按第二個按鈕；成功或失敗會同時顯示在頁面與表單附近。儲存成功後保留正在編輯的作品與公開設定，方便確認結果。
- 用上移／下移排序，取消「公開顯示」可保存草稿，勾選「精選作品」沿用首頁的精選樣式。
- 刪除會先確認；排序與刪除之後，按清單上方固定可見的「儲存清單變更」才對外生效。表單儲存也會一併保存目前清單的排序與刪除變更。
- 衝突時保留本機草稿，先下載草稿，再重新載入並整合新版本。尚未實作自動合併或草稿匯入。
- 管理頁沒有上傳 HTML、執行腳本或發布任意檔案的功能；作品文字以純文字顯示，連結只接受 http(s) 或站內相對路徑。

## 驗證範圍

若 Google 帳號選擇成功，但後端顯示無法與 Google 驗證服務連線，請確認啟動 Node.js 服務的環境可連到 `https://www.googleapis.com/oauth2/v1/certs`。受網路限制的開發沙箱可能無法下載 Google 公開驗簽金鑰；可在一般終端機執行 `npm start` 或雙擊 `start-home.cmd` 啟動。程式會將這種服務連線失敗回覆為 503，不會誤報為帳號登入過期，也不會跳過驗簽。

`npm test` 包含身分授權、未登入拒絕、資料格式、私人資料隔離、版本衝突、GCS 條件請求、草稿編輯及公開建置測試。Google Token 驗簽與雲端 Storage 實際連線使用官方函式庫及服務，需完成自己的 Google Cloud 設定後進行端到端驗證；本次尚未登入真實管理員或部署雲端。
