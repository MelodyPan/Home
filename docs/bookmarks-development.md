# 書籤網站開發維護說明

更新日期：2026-10-30。以目前本機程式核對；一般操作先看 [使用指南](bookmarks-guide.md)。本文件只描述書籤子網站，不替其他子網站定義儲存方式。

## 先認識架構

這是一個原生 HTML、CSS、JavaScript 網站。瀏覽器直接透過 Google OAuth 與 Drive API 讀寫書籤；Node.js 22 負責本機網頁服務、網址檢查、測試與公開建置。

GitHub Pages 發布靜態檔案，沒有 Node.js 檢查服務。畫面是否允許檢查取決於 `BookmarksConfig.urlCheckAvailable`，不能單靠解除按鈕的 `disabled` 就讓線上版檢查網址。

## 模組分工

| 模組 | 責任 |
| --- | --- |
| [home.html](../apps/bookmarks/src/home.html)、[home.css](../apps/bookmarks/src/home.css) | 頁面與樣式來源；不是直接編輯產出的 HTML |
| [home.js](../apps/bookmarks/Javascript/home.js) | UI 狀態、搜尋排序、簡易／詳細卡片、批次操作與檢查結果套用 |
| [bookmark-core.js](../apps/bookmarks/Javascript/bookmark-core.js) | 純資料處理、分類、篩選、異動合併、Chrome 匯出 |
| [bookmark-file.js](../apps/bookmarks/Javascript/bookmark-file.js) | 建立與嚴格驗證 JSON 備份 |
| [bookmark-drive.js](../apps/bookmarks/Javascript/bookmark-drive.js) | Drive 私人資料夾、每日檔案、版本關係、條件式寫入與冪等重試 |
| [bookmark-cloud.js](../apps/bookmarks/Javascript/bookmark-cloud.js) | 連接狀態、帳號確認、同步佇列、分頁草稿與衝突 |
| [bookmark-cache.js](../apps/bookmarks/Javascript/bookmark-cache.js) | 帳號同意設定、成功同步快照、格式驗證與原子替換 |
| [bookmark-login.js](../apps/bookmarks/Javascript/bookmark-login.js) | 分頁授權暫存及實際 `expires_in` 資訊 |
| [bookmark-drive-ui.js](../apps/bookmarks/Javascript/bookmark-drive-ui.js) | Google 授權生命週期、登入管理視窗、匯入與效期清除 |
| [bookmark-check.js](../apps/bookmarks/Javascript/bookmark-check.js) | 檢查範圍、URL 去重、前端敏感網址過濾與結果合併 |
| [bookmark-quick.js](../apps/bookmarks/Javascript/bookmark-quick.js) | 可開啟收藏的首頁順序與上移／下移 |
| [url-checker.cjs](../apps/bookmarks/scripts/url-checker.cjs)、[url-check-api.cjs](../apps/bookmarks/scripts/url-check-api.cjs) | 無狀態 HTTP 檢查、來源驗證、併發與位址限制 |
| [drive-config.cjs](../apps/bookmarks/scripts/drive-config.cjs) | 驗證公開 Client ID，產生瀏覽器設定 |
| [home-site-build.cjs](../scripts/home-site-build.cjs) | 公開資源白名單、空白書籤頁、共用資源與設定輸出 |

`Javascript/site-config.js` 是服務或建置時產生的資源，不是需要手動新增的書籤原始碼。公開建置讀取設定時，環境變數 `BOOKMARKS_GOOGLE_CLIENT_ID` 優先於 `bookmarks.config.json`。

## 資料分三層，不要混在一起

| 層次 | 保存什麼 |
| --- | --- |
| Google Drive | 正式書籤、收藏、分類、排序、檢查結果及歷史每日檔 |
| 分頁記憶體 | 目前已載入資料、未同步草稿、UI 篩選及同步工作 |
| 瀏覽器儲存 | `sessionStorage` 保存授權相關資料；`localStorage` 保存格狀／清單偏好，以及使用者同意後的已同步書籤快取與同意選擇 |

不從舊本機資料 API 自動恢復書籤。BookmarkCache 僅在同意後保存成功同步的快照，不保存 token 或草稿；不提供離線編輯。F5 先呈現已驗證快取，有效授權存在時再背景確認 Drive。快取只投影到 home.js 的顯示狀態（cacheReadonly），不注入 CloudSession 的 document、account 或 revision；編輯仍須雲端 ready。

快取 key 為 `melody-bookmarks-cache-v1`，同意選擇 key 為 `melody-bookmarks-cache-consent-v1`。快照包含 accountId、datasetId、revision、syncedAt、document，使用 BookmarkFile 驗證。只以單次 setItem 替換快取，不先 removeItem，避免配額失敗破壞上一份快照。主動登出清除快照；自然到期可繼續唯讀瀏覽。清除並停用會設定該帳號選擇為 false，避免其他分頁寫回。

### 備份與 Drive 外層格式

使用者下載的備份是 `schemaVersion:1` 的資料物件。Drive 檔案還有版本外層：

```text
Drive 檔案：format、datasetId、commit、parents、data
                                           └─ data 是網站備份資料
```

不要把整個 Drive 外層檔案直接當成匯入備份。網站「備份 JSON」下載的是內層資料；目前 `readDataFile()` 只接受這個格式。

| 內層欄位 | 用途 |
| --- | --- |
| `baseEntries` | 原始書籤 |
| `changes.added`、`deletedIds`、`entryOverrides` | 新增、刪除、名稱／網址修改 |
| `changes.categoryOverrides`、`statusOverrides` | 手動分類與手動狀態 |
| `changes.categoryOrder`、`workSubcategories`、`workSubcategoryAssignments` | 主分類順序、子分類定義與歸屬 |
| `changes.quickOrder` | 首頁常用入口順序 |
| `changes.urlChecks` | 各筆自動檢查結果與檢查時間 |
| `favorites` | 收藏 ID |
| `checkedAt` | 最後一次完整檢查完成時間 |
| `updatedAt` | 快照建立時間 |
| `entries` | 合併來源與異動後的衍生資料，不是還原來源 |

`workSubcategories` 是相容舊資料的欄位名稱；`category:'dev'` 表示程式開發，省略時屬工作系統。`readDataFile()` 驗證 ID、欄位與參照關係，再由核心重新合併，不信任檔案附帶的 `entries`。

## Drive 寫入需要保持的條件

1. 先確認帳號，再搜尋此應用程式標記的資料集。
2. `MelodyHome` 資料夾需要符合名稱、類型、應用程式標記及未分享條件；不把私人資料移進已分享的同名資料夾。
3. 依 `Asia/Taipei` 計算每日檔名。同一天更新同一檔案，跨日有修改才新建。
4. 版本識別為 `fileId~commit`；舊檔可能只有 `fileId`。檔案 ID 相同不代表內容版本相同。
5. 驗證父版本是否存在及是否形成循環，不能用缺漏的資料悄悄建立空白書籤覆蓋。
6. 同日寫入先取得版本 ETag，再帶 `If-Match`。v3 ETag 可讀時使用 v3 multipart PATCH；不可讀時以 v2 JSON 的 `etag` 及 v2 multipart PUT 更新，屬性轉成 PRIVATE，不能混用兩個版本的 ETag 與寫入端點。
7. v2 仍缺有效 ETag 就停止。412 轉為衝突處理，不能移除 `If-Match` 硬寫。
8. 跨日先對前一個 head 條件式預約 `nextDay/nextFile`，讓並行裝置嘗試建立同一個新檔 ID。
9. `pending` 保留尚未確認的原操作；重試核對上傳內容與 commit，避免回應遺失時重複新增或覆蓋其他裝置。

`parents` 保存實際 Drive 檔案 ID，和 UI 使用的 `fileId~commit` 不同。當日檔案反覆更新時要保留原父關係，不能把自己加入父清單。

## 同步狀態與防閃動

`BookmarkCloud` 可能處於 disconnected、connecting、loading、choosing、empty、ready、saving、error 或 conflict。`pending` 是排隊存檔數，`busy` 保護連接、載入、重試等操作，`draft` 是尚未確認寫入的內容。

- 約 600ms 的防抖把尚未開始的修改合併成最新快照；已開始的寫入仍依序完成。
- 內容比較忽略每次重新產生的 `updatedAt`，避免只改時間就重傳。
- 失敗時記住當次的快照與 revision，先確認該次操作，再補寫使用者後續的最新草稿。
- 草稿綁定原帳號；取得新 token 後，必須用 Drive `about` 確認帳號，不能直接把舊草稿寫到新帳號。
- 同資料集背景刷新保留已顯示文件。回傳內容完全相同時保留物件參照，`home.js` 因此不需要重建卡片。
- 初次掛載的 `initialLoad` 完成後才移除載入遮罩；背景刷新不使用這個全頁遮罩。

## Google 授權與取消

憑證到期時間使用實際 `expires_in`，不自動續期、不因操作延長。`bookmark-login.js` 的 `limit` 參數保留舊呼叫介面；書籤目前傳入 `undefined`，不再採用 10 小時上限。不要因看到相容欄位而把舊規則寫回文件。

`pendingAuthorization` 表示目前尚未結束的授權要求，與成功後的 token 是不同生命週期。每次只能 settle 一次，結束後清除監聽與計時器，已結束流程的舊回應直接忽略。

若偵測到離開後返回頁面，等待 1.5 秒仍沒有有效回應，就結束當次等待；這是恢復策略，不是確定知道外部視窗已關閉。右上角登入也能取消卡住的流程後重試。5 分鐘限制的是授權等待，不是 token 使用期限。詳細與尚待實機驗收事項見 [iPhone 說明](bookmarks-iphone-login-recovery.md)。

Google 的正常 popup 錯誤由 `error_callback` 處理，參考 [官方錯誤處理](https://developers.google.com/identity/oauth2/web/guides/error)。

## 畫面狀態怎麼對應？

- `simpleLinks` 記錄從上方簡易入口進入；是否真的顯示簡易連結由 `simplePresentation()` 決定：有搜尋字詞時改用詳細卡片。
- `selectionAvailable()` 決定是否提供勾選：下方分類，或上方入口有關鍵字時才提供。
- 點常用收藏先清除各項篩選；點所有書籤重設 `allSort='url'`。
- `allSort` 與其他詳細頁的 `sort` 分開。網址排序不再套用工作系統優先，以免破壞網址順序。
- `expandedCategory` 只記錄側欄展開狀態；收合不能重置右側已選的子分類結果。
- `changes.quickOrder` 控制首頁全部可開啟收藏的順序，不是所有書籤的排序。首頁用緊密多欄連結清單，依上到下、再由左到右排列；透過 `#quick-links` 限定樣式，不能改到其他頁的簡易卡片。
- `quickPurpose` 是首頁獨立的工作／生活切換，初始值為 work，沒有 all 選項；使用 getBookmarkPurpose 分類，再篩選已排序的收藏，不改變全站 state.purpose 或 Drive 內容。標題與切換位於 quick-caption-main；手機版縮小局部字級與間距，使標題、工作／生活切換及排序按鈕維持同一排。
- 手機寬度不超過 740px 時，#bookmark-grid[data-presentation=simple] 固定兩欄；不套用到首頁清單或詳細卡片。#sort 以同範圍 12px 規則覆蓋共用手機表單的 16px 字級，其他表單欄位維持原設定。
- 所有書籤／常用收藏已移除裝飾說明，頁面底部的宣傳文字、回到頂端按鈕及 footer 也已移除；浮動「上」按鈕保留。
- 浮動「上」按鈕取決於非首頁、分類為 all、不是 favorites 且頁面已捲動；目前不出現在其他分類。

這些 UI 篩選與展開狀態不寫進私人書籤檔，收藏／分類／常用入口順序等資料異動才會同步。

## 修改前登入與接續操作

`bookmark-drive-ui.js` 提供 `requiresLogin()` 與 `ensureWriteAccess()`，以實際憑證期限檢查登入。待完成操作綁定來源帳號與資料集，只有登入後 Drive 載入成功、快取版本沒有衝突才接續；取消視窗、授權錯誤、離線或來源不符都取消等待。一般設定視窗的登入不會自動觸發修改。

`home.js` 在編輯／收藏入口與編輯表單送出前攔截未登入操作，同一時間只保留一個待完成操作。收藏記錄目標狀態，避免登入期間雲端已完成相同操作時反向切換；編輯表單只在記憶體保留輸入，登入後比較該筆名稱、網址、分類等欄位，已變動則要求重新確認。成功後仍走原本的 Drive 存檔及快取更新流程。

## 書籤圖示規則

| 畫面 | 分類圖示 | 網站圖示失敗時 |
| --- | --- | --- |
| 首頁常用收藏清單 | 不顯示 | 不顯示圖示或備用文字，不留圖示空位 |
| 所有書籤／常用收藏簡易卡片 | 固定顯示 | 只保留分類圖示；成功才與網站圖示並列 |
| 詳細卡片 | 不另外顯示分類圖示 | 沿用名稱首字等文字備援 |

home.js 的 simpleLink() 建立 simple-link-icons 容器，內含獨立的 site-category-icon 與 simple-website-icon。網站部分呼叫 siteSymbol(entry, category.color, false)，false 表示不建立文字備援；分類部分不屬於載入備援，所以網站圖示成功也不能將它隱藏。圖片確認 load 才揭露網站圖示，所有來源都失敗就移除圖片。首頁同樣使用不帶文字備援的模式，詳細卡片則保留預設備援。

bookmark-core.js 的 bookmarkIconSources() 依序提供：精確主機對應的站內固定圖示、可接受的內嵌點陣圖、外站根目錄 favicon.ico。ChatGPT（含舊 chat.openai.com）與 Gemini 的固定資源位於 [images/icons](../apps/bookmarks/images/icons/README.md)，不用每次向外站讀圖。不使用第三方圖示服務；其他網站的 favicon 不保證可取得，來源與資源白名單維護方式見該目錄說明。

## 網址檢查的邊界

前端每次只向 API 送一個 URL，去重後預設 4 筆併發；本機 API 預設最多同時 6 個檢查。API 驗證來源、JSON 格式與請求大小，不接受整份書籤或 Google token，也不在本機存書籤文件。

前端與檢查器會略過含查詢參數、帳密、疑似私人識別碼及登出／刪除等操作型 URL。伺服器逐跳驗證重新導向，先查 DNS，再把實際連線固定到已驗證的公開 IP，避免 DNS 改變後連到內部位址。

檢查先 HEAD，必要時 GET；只使用回應狀態，不下載完整內容做語意判斷。2xx 成功、404／410 可能失效、401／403 等受限，其餘異常待確認。完整規則看 `checkUrl()`，使用者語意見 [使用指南](bookmarks-guide.md)。

`home.js` 先完成整批，再確認帳號、資料集與有效網址仍相符，才合併與呼叫 `cloud.save()`。完整檢查才更新全域 `checkedAt`；手動狀態仍優先。`saving` 階段開始後，不能把「檢查已取消」誤當作撤銷已寫入的雲端結果。

## 建置與驗證

從 Home 根目錄執行：

```powershell
node apps/bookmarks/scripts/build-home.cjs
npm test
npm run build
```

`bookmarks.html` 是產出檔；範本或 CSS 修改後須重建。建置以空白 `entries` 與圖示資料產生公開頁，不會內嵌個人書籤。公開產物在 `dist/`，本機資料與恢復報告不應被提交。

只跑書籤測試時，必須使用書籤工作目錄，部分測試依賴相對路徑：

```powershell
Push-Location apps/bookmarks
node --test tests/*.test.cjs
Pop-Location
```

瀏覽器模擬需安裝 Playwright 與瀏覽器，從根目錄執行 `node apps/bookmarks/tests/bookmark-drive.browser.cjs`。可用 `PLAYWRIGHT_MODULE` 指定模組路徑，`BROWSER_CHANNEL=msedge` 指定 Edge。它攔截 Google 請求，不能取代真實 Google 帳號與 iPhone 驗收。

發布前使用只含提交檔案的乾淨副本測試與建置，避免未追蹤的輔助檔案造成假通過。GitHub Actions 在 main 推送後執行測試、建置與 Pages 部署；實際設定見 [工作流程](../.github/workflows/static.yml)，未經要求不自動推送。

最新發布／待發布狀態與歷次調整分別記在 [調整總整理](bookmarks-adjustments.md) 及 [iPhone 修正](bookmarks-iphone-login-recovery.md)，不要把歷史試作需求當成現行規則。
