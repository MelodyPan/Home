# 成長數字紀錄實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每筆故事可選填身高 cm／體重 kg，每位孩子可查看自己的日期曲線與量測表。

**Architecture:** 保持 schemaVersion 1，以可省略的 heightCm、weightKg 數字欄位擴充紀錄。獨立原生 JS 模組負責格式、篩選與 SVG 曲線，不新增外部套件；接入既有本機存檔、篩選與編輯流程。

**Tech Stack:** 原生 JavaScript、CSS、SVG、Node.js node:test。

- [x] 先建立失敗測試，涵蓋空值、數值邊界、孩子隔離、時間間隔與單點。
- [x] 儲存層驗證／保存數值；前端表單讀寫、手帳顯示。
- [x] 成長數字頁籤：各自量尺的兩張曲線、最新值與日期、可編輯明細、無資料狀態。
- [x] HTTP 持久化、全頁載入與功能回歸測試；審查及本機服務更新。
- [x] 補齊中文程式註解與 docs 操作／資料欄位說明。

驗證：完整測試 88 項通過，靜態資源透過 HTTP 與磁碟內容一致，正式 JSON 與備份 SHA-256 未改變。已完成唯讀程式碼審查。尚未實測真實瀏覽器的手機排版及 SVG 外觀，DOM 替身測試不取代視覺驗證。

數值只呈現個人紀錄，不推算孕週或套用醫學百分位。輸入防誤範圍為身高大於 0 且最多 300 cm、體重大於 0 且最多 500 kg；此為程式輸入界限。空欄位不當成零，同一天多筆量測均保留。
