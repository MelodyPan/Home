// 以服務及共用資料模組的檔案內容計算版本指紋，讓啟動器辨識是否需要重啟。
// 目前採原始位元組計算，因此只修改註解也會改變此指紋。
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
// 將書籤服務與共用模組雜湊成版本；Home 另外加入相簿服務的版本。
function getServerVersion(){const root=path.join(__dirname,'..');const hash=createHash('sha256');for(const file of ['../shared/scripts/data-lock.cjs','scripts/url-checker.cjs','scripts/server.cjs','Javascript/bookmark-core.js','Javascript/bookmark-file.js'])hash.update(fs.readFileSync(path.join(root,file)));return hash.digest('hex');}
module.exports={getServerVersion};
