# 書籤選擇性本機快取實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 同意暫存後優先顯示已同步的本機書籤；存檔先寫 Drive，主動登出清除快取。
**Architecture:** 獨立 BookmarkCache 管理已驗證快照與帳號選擇；DriveUI 投影唯讀快取，不將快取當作 CloudSession 授權或遠端版本。
**Tech Stack:** 原生 JavaScript、localStorage、node:test、Playwright Edge。
**Spec:** ../specs/2026-10-29-bookmarks-local-cache-design.md

## Global Constraints
- Google Drive 保留正式資料、ETag 與一天一檔。
- 不同意暫存維持現況，token 不存 localStorage，未同步草稿不存快取。
- 主動登出清除快照，授權自然到期保留唯讀快取。

## Review Focus
- 不同帳號、資料集的畫面與版本不可混用。
- 配額與格式錯誤不得造成已同步內容遺失或阻斷雲端功能。
- 啟動快取必須解除載入遮罩，不能等待網路才顯示。
- 多分頁的清除設定不可被其他分頁重新寫回。
- 背景讀取與寫入失敗不可覆蓋記憶體草稿。

## Tasks
- [x] 1. 新增 bookmark-cache.js 與 bookmark-cache.test.cjs：驗證授權選擇、格式、原子替換、清除、帳號隔離與儲存失敗；先紅後綠。
- [x] 2. 修改 bookmark-drive-ui.js、home.js、home.html 與公開建置白名單：首次詢問、唯讀快取投影、成功同步才存快取、登出清除、快取管理、跨分頁清除。
- [x] 3. 擴充瀏覽器測試：同意／拒絕、延遲網路 F5、授權到期唯讀、雲端存檔更新、手動登出清除；維持舊流程測試。
- [x] 4. 更新中文文件，執行單元測試、瀏覽器測試與公開建置，檢查 diff。使用者尚未要求發布本次變更，不提交或推送。

## 完成紀錄

- 98 項書籤單元／整合測試、11 項 scripts 測試通過。
- Playwright Edge：快取優先 F5、內容相同保留 DOM、同意／拒絕、雲端成功才替換、失敗保留舊快取、跨分頁延遲舊回應與重新同步恢復、授權到期唯讀及主動登出清除皆通過。
- 公開建置成功，新增模組已列入本機服務與公開產物白名單；手機管理視窗截圖已檢視。
- 獨立審查指出配額不足停用及多分頁版本回退，已修正並補回歸測試；複核未發現剩餘阻斷項目。
- Ruling: 停用先清快照釋放容量，正常更新以單次 setItem 原子替換；兩者目的不同。
- Ruling: 多分頁衝突先暫停編輯，下次雲端核對開始前建立快取基準；確認後可恢復，即使 document 物件未改變。
- 同工作區已有其他子站異動，保留不修改。本次尚未提交／發布；未使用真實 iPhone 或真實 Google 帳號驗收。
