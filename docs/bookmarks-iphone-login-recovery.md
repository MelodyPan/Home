# 書籤網站：iPhone 取消 Google 登入後的恢復處理

整理日期：2026-10-29（台灣時間）

前面的雲端儲存、登入效期、網址檢查、介面與手機調整，統一整理於 [書籤子網站調整總整理](bookmarks-adjustments.md)。

## 問題情境

1. 從 iPhone 主畫面捷徑開啟書籤網站。
2. 點右上角「登入」，再點「連接 Google Drive」。
3. 出現 Google 帳號驗證畫面後，不完成登入，直接按左上角關閉。
4. 返回書籤網站，再次點「登入」卻沒有作用。

預期行為：使用者可以取消登入，之後仍能重新開啟登入視窗、再次連接 Google Drive，不需要重新整理整個網站。

## 原因分析

原本網站在開始授權時進入「連接中」，並停用登入與連接按鈕，等待 Google 回傳成功或錯誤通知。程式已處理 Google 的 `error_callback`，但沒有處理「既沒有成功回應，也沒有取消通知」的情況。

若 iPhone 關閉外部驗證畫面後，網頁沒有收到取消通知，授權 Promise 就一直等待，介面也一直維持連接中。瀏覽器模擬測試已重現這個卡住的狀態；實際 iPhone 的事件順序仍需裝置驗收確認。

## 修正內容

### 返回頁面時恢復操作

- 監聽頁面離開、焦點返回、可見狀態變更及 `pageshow` 事件。
- 偵測到離開後返回可見頁面，先等待 1.5 秒，讓正常授權回應有時間完成。
- 這段時間內若仍未收到授權回應，就結束該次等待，提示「已取消 Google 登入，可以再次連接 Google Drive」。

這是避免介面卡住的恢復策略，不表示瀏覽器一定已明確回報「使用者取消」。若使用者在驗證尚未完成時主動切回網站，也可能結束該次等待，之後可重新登入。

### 保留可重新點擊的「登入」按鈕

等待 Google 授權期間，右上角「登入」不再因為「連接中」而一直停用。若仍有未完成的授權流程，再次點擊會先取消該流程，再開啟 Google Drive 管理視窗；等待狀態解除後，即可再次點「連接 Google Drive」。

載入雲端資料、上傳與其他需要等待完成的操作，仍保留原本的按鈕保護。

### 避免舊回應干擾新登入

- 每次授權只允許完成一次。
- 已取消或已結束的流程，即使稍後收到成功或錯誤回應，也會忽略。
- 流程結束時移除事件監聽與計時器，避免影響下一次登入。
- 等待授權最長為 5 分鐘，逾時後解除等待，允許重試。

上述「5 分鐘」只限制一次登入操作的等待時間；登入成功後，Google 憑證效期仍以實際回傳的 `expires_in` 為準，不會改回 10 小時或自動續期。

## 相關檔案

| 檔案 | 用途 |
| --- | --- |
| [bookmark-drive-ui.js](../apps/bookmarks/Javascript/bookmark-drive-ui.js) | 授權取消、返回頁面恢復、登入按鈕與舊回應隔離 |
| [bookmark-drive.browser.cjs](../apps/bookmarks/tests/bookmark-drive.browser.cjs) | 模擬沒有取消通知、重新登入及舊回應遲到的情境 |
| [bookmark-token-expiry.test.cjs](../apps/bookmarks/tests/bookmark-token-expiry.test.cjs) | 確認 Google 效期、重新整理恢復及到期登出仍正常 |

## 驗證結果

本次修正後，書籤自動測試 91 項通過，瀏覽器模擬測試也通過。主要驗證情境如下：

- Google 沒有回報取消時，右上角「登入」仍可操作。
- 點擊「登入」能結束卡住的等待，重新開啟管理視窗。
- 返回頁面後，能解除連接中的等待狀態。
- 舊流程遲到的成功回應不會完成新的授權。
- 取消後再次授權成功，仍可載入、建立及同步書籤。
- Google 憑證到期、F5 恢復登入及原有書籤操作未受影響。

一般測試從書籤目錄執行：

```powershell
Push-Location apps/bookmarks
node --test tests/*.test.cjs
Pop-Location
```

瀏覽器測試需先具備 Playwright 與可用瀏覽器，從專案根目錄執行：

```powershell
node apps/bookmarks/tests/bookmark-drive.browser.cjs
```

瀏覽器模擬不能替代實際 iPhone 驗收。5 分鐘逾時目前有程式保護，但本次瀏覽器測試沒有實際等待滿 5 分鐘。

## iPhone 驗收步驟

1. 發布新版後，從主畫面捷徑開啟網站。
2. 點「登入 → 連接 Google Drive」。
3. 在 Google 畫面按左上角關閉，返回網站，稍候確認按鈕可重新操作。
4. 若仍停在等待狀態，點右上角「登入」，再點「連接 Google Drive」。
5. 重複取消後再試，最後完成登入，確認可以載入書籤。

修正已完成並通過上述測試，納入 2026-10-29 的本輪發布；實際部署狀態以 [GitHub Actions](https://github.com/MelodyPan/Home/actions) 為準。尚未完成實際 iPhone 驗收。

## 同期調整：底部提示文字

iPhone 畫面底部的提示框原本是深色背景搭配灰色文字，閱讀對比不足。本機已改為白字、14px、字重 500；手機寬度驗證的文字對比為 6.30:1，且提示框未超出畫面。

樣式位於 [home.css](../apps/bookmarks/src/home.css) 的 `body[data-page=bookmarks] #toast`，並已重建 [bookmarks.html](../apps/bookmarks/bookmarks.html)。此調整一併納入本輪發布。
