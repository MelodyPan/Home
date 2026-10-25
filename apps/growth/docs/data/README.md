# 生長參考資料來源

擷取日期：2026-10-24。原檔保存於此，供核對；網站使用轉換後的 `Javascript/growth-reference.js`，顯示期間不向外部送出孩子資料。

| 原始檔 | 官方來源 | 網站使用範圍 |
| --- | --- | --- |
| `hpa-growth-0-7.ods` | [國健署 0–7 歲生長曲線](https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=1596&pid=549)，附件「兒童生長曲線摺頁之圖表原始數據」 | 兩歲後身高、五歲後體重，至 7 歲，每半年節點 |
| `who-length-girls.xlsx`、`who-length-boys.xlsx` | [WHO Length/height-for-age](https://www.who.int/tools/child-growth-standards/standards/length-height-for-age)，Percentiles / Birth to 2 years Excel | 出生至 24 個月的身長，逐月節點 |
| `who-weight-girls.xlsx`、`who-weight-boys.xlsx` | [WHO Weight-for-age](https://www.who.int/tools/child-growth-standards/standards/weight-for-age)，Percentiles / Birth to 5 years Excel | 出生至 60 個月體重，逐月節點 |

國健署官方說明：0–5 歲依 WHO 標準，5–7 歲採臺灣銜接研究。網站保留國健署較大年齡資料，嬰幼兒部分以 WHO 較密的表格補足，未自行外推超過 7 歲的曲線。資料只繪出 P3、P15、P50、P85、P97，忽略來源表其餘欄位；也不執行 BMI 分級。

網站的參考線是各來源節點的直線連線，不是逐日 LMS 算法或精確百分位計算器；不得把孩子點到參考線的距離解讀為計算出的精確百分位。身長資料至 24 個月，其後使用國健署身高節點；量測方式及專業判讀請依原始來源。

轉換方式（Python 標準函式庫，無需額外安裝套件）：

```powershell
python scripts/import-growth-reference.py
node --test tests/growth-percentiles.test.cjs
```

轉換程式依 ODS 欄位位置與 XLSX 的 Month／P3 等欄名讀取，檢查節點數與範圍；各原檔 SHA-256 寫入轉換結果並由測試驗證。更新來源時必須一併核對已知數值、使用範圍、來源說明及產生的前端檔案。
