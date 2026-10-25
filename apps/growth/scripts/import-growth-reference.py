"""將國健署官方 ODS 的男／女孩 0–7 歲百分位節點轉為離線 JS；只用 Python 標準函式庫。"""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs/data/hpa-growth-0-7.ods'
NS = {'t': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0'}
T = '{' + NS['t'] + '}'
with ZipFile(SOURCE) as archive:
    xml = ET.fromstring(archive.read('content.xml'))
tables = xml.findall('.//t:table', NS)
data = {'source': 'https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=1596&pid=549',
        'download': 'https://www.hpa.gov.tw/Pages/ashx/GetFile.ashx?lang=c&type=1&sid=03f9ae3d44014bc8b4cf49d8327ede82',
        'retrievedAt': '2026-10-24', 'sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'percentiles': [3, 15, 50, 85, 97], 'maxAgeMonths': 84, 'sexes': {}}
for table, sex in zip(tables[:2], ['male', 'female']):
    output = {'heightCm': [], 'weightKg': []}
    for row in table.findall('t:table-row', NS)[3:]:
        cells = []
        for cell in row:
            if cell.tag not in (T + 'table-cell', T + 'covered-table-cell'):
                continue
            count = min(int(cell.get(T + 'number-columns-repeated', '1')), max(0, 16-len(cells)))
            cells.extend([''.join(cell.itertext()).strip()] * count)
            if len(cells) >= 16:
                break
        if not cells or not cells[0]:
            continue
        try:
            age = 0 if cells[0] == '出生' else float(cells[0]) * 12
        except ValueError:
            continue
        if age > 84:
            continue
        # 官方另含 P25/P75，網站依圖例只取 P3/P15/P50/P85/P97，不自行產生其他百分位。
        for key, start in [('weightKg', 1), ('heightCm', 9)]:
            output[key].append([age] + [float(cells[start+i]) for i in [0, 1, 3, 5, 6]])
    assert len(output['heightCm']) == 15 and len(output['weightKg']) == 15
    assert [row[0] for row in output['heightCm']] == list(range(0, 85, 6))
    data['sexes'][sex] = output
# 嬰兒前幾個月成長較快，以 WHO 原始逐月表補足節點；兩歲後身高維持國健署本土表。
# 體重 WHO 可用至五歲，其後銜接國健署 5–7 歲資料，不自行外推參考值。
data['whoSources'] = []
S = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
for sex, name in [('male', 'boys'), ('female', 'girls')]:
    for key, metric, filename, limit in [('heightCm', 'length-height-for-age', f'who-length-{name}.xlsx', 24),
                                          ('weightKg', 'weight-for-age', f'who-weight-{name}.xlsx', 60)]:
        path = ROOT / 'docs/data' / filename
        with ZipFile(path) as archive:
            strings = [''.join(item.itertext()) for item in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', S)]
            rows = ET.fromstring(archive.read('xl/worksheets/sheet1.xml')).findall('.//s:row', S)
            def values(row):
                result = []
                for cell in row.findall('s:c', S):
                    text = cell.findtext('s:v', '', S)
                    result.append(strings[int(text)] if cell.get('t') == 's' else text)
                return result
            header = values(rows[0])
            columns = [header.index('Month')] + [header.index('P' + str(p)) for p in data['percentiles']]
            monthly = [[float(values(row)[i]) for i in columns] for row in rows[1:] if values(row) and float(values(row)[0]) <= limit]
        assert len(monthly) == limit + 1
        data['sexes'][sex][key] = monthly + [row for row in data['sexes'][sex][key] if row[0] > limit]
        data['whoSources'].append({'file': filename, 'page': 'https://www.who.int/tools/child-growth-standards/standards/' + metric,
                                   'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'maxMonths': limit})
payload = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
target = ROOT / 'Javascript/growth-reference.js'
target.write_text('// 由 scripts/import-growth-reference.py 產生；WHO 逐月＋國健署半年節點，非逐日參考值。\n'
                  '(function(scope){const data=' + payload + ';\n'
                  "if(typeof module!=='undefined'&&module.exports)module.exports=data;else scope.GrowthReference=data;\n"
                  '})(globalThis);\n', encoding='utf-8')
print('Generated WHO monthly + HPA half-year knots; HPA SHA-256: ' + data['sha256'])
