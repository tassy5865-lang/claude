// Code.gs の構文チェック(Apps Script の実行環境がなくても最低限の確認ができる)
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
new Function(src);
console.log('gas/Code.gs: syntax OK');
