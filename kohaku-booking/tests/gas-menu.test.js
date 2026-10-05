const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

// Code.gs を Node の vm で読み込む(Apps Script の関数宣言はコンテキストのグローバルになる)
function loadGas() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const ctx = vm.createContext({ console });
  vm.runInContext(src + '\n;this.__consts = { SEED_MENU, SEED_OPTIONS, MENU_HEADERS, OPTION_HEADERS };', ctx);
  return { ...ctx, ...ctx.__consts };
}

test('parseMenuRows_: 数値でない行は除外し、空の料金は null、cats は配列', () => {
  const g = loadGas();
  const rows = g.parseMenuRows_([
    ['a1', 'テストA', '60', '7000', '説明', 'aroma, first', 'aroma', '', 'ON', '1'],
    ['a2', '料金が壊れている', '60', 'abc', '', 'aroma', 'aroma', '', 'ON', '2'],
    ['a3', '所要分が壊れている', 'x', '1000', '', 'aroma', 'aroma', '', 'ON', '3'],
    ['',   'IDなし', '60', '1000', '', 'aroma', 'aroma', '', 'ON', '4'],
    ['a5', '当日案内', '', '', '', 'omakase', 'omakase', 'omakase', 'ON', '5'],
    ['a6', '非表示', '40', '3000', '', 'steam', 'steam', '', 'OFF', '6']
  ]);
  assert.deepStrictEqual(Array.from(rows.map(r => r.id)), ['a1', 'a5', 'a6']);
  assert.strictEqual(rows[0].min, 60);
  assert.strictEqual(rows[0].price, 7000);
  assert.deepStrictEqual(Array.from(rows[0].cats), ['aroma', 'first']);
  assert.strictEqual(rows[1].price, null);
  assert.strictEqual(rows[2].show, false);
});

test('publicMenu_: 表示=ON のみ・並び順・show を含まない', () => {
  const g = loadGas();
  const menu = g.parseMenuRows_([
    ['b', 'B', '40', '2000', '', 'steam', 'steam', '', 'ON', '2'],
    ['a', 'A', '40', '1000', '', 'steam', 'steam', '', 'ON', '1'],
    ['c', 'C', '40', '3000', '', 'steam', 'steam', '', 'OFF', '3']
  ]);
  const opts = g.parseOptionRows_([['o1', 'O1', '10', '1500', 'ON', '1'], ['o2', 'O2', '0', '1000', 'OFF', '2']]);
  const pub = g.publicMenu_(menu, opts);
  assert.deepStrictEqual(Array.from(pub.menu.map(m => m.id)), ['a', 'b']);
  assert.deepStrictEqual(Array.from(pub.options.map(o => o.id)), ['o1']);
  assert.ok(!('show' in pub.menu[0]));
});

const MENU = [
  ['m60', 'Relax', '60', '7000', '', 'aroma', 'aroma', '', 'ON', '1'],
  ['pair', 'ペア蒸し', '40', '6000', '', 'pair', 'pair', 'pair', 'ON', '2'],
  ['omk', 'おまかせ', '', '', '', 'omakase', 'omakase', 'omakase', 'ON', '3'],
  ['off', '非表示', '40', '3000', '', 'steam', 'steam', '', 'OFF', '4']
];
const OPTS = [['head', '頭ほぐし', '10', '1500', 'ON', '1'], ['bath', 'フットバス', '0', '1000', 'ON', '2'], ['x', '非表示', '10', '500', 'OFF', '3']];
const calc = (g, d) => g.calcBooking_(g.parseMenuRows_(MENU), g.parseOptionRows_(OPTS), d);

test('calcBooking_: メニュー+オプションの料金・所要分・名前をシートの値で決める', () => {
  const g = loadGas();
  const r = calc(g, { menuId: 'm60', optionIds: ['head', 'bath'], total: 1, minutes: 5, menuName: '改ざん' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), { ok: true, menuName: 'Relax', minutes: 70, total: 9500, optionNames: ['頭ほぐし', 'フットバス'] });
});

test('calcBooking_: ペアはオプション料金が2名分で、名前に(2名分)が付く', () => {
  const g = loadGas();
  const r = calc(g, { menuId: 'pair', optionIds: ['head'] });
  assert.strictEqual(r.total, 6000 + 1500 * 2);
  assert.deepStrictEqual(Array.from(r.optionNames), ['頭ほぐし(2名分)']);
});

test('calcBooking_: おまかせは料金null、minutes は 60/90/120 のみ', () => {
  const g = loadGas();
  assert.strictEqual(calc(g, { menuId: 'omk', minutes: 90 }).total, null);
  assert.strictEqual(calc(g, { menuId: 'omk', minutes: 90 }).minutes, 90);
  assert.strictEqual(calc(g, { menuId: 'omk', minutes: 75 }).error, 'bad_minutes');
  assert.strictEqual(calc(g, { menuId: 'omk' }).error, 'bad_minutes');
});

test('calcBooking_: 未知・非表示のメニュー/オプションは bad_menu、重複オプションは1回だけ数える', () => {
  const g = loadGas();
  assert.strictEqual(calc(g, { menuId: 'nope' }).error, 'bad_menu');
  assert.strictEqual(calc(g, { menuId: 'off' }).error, 'bad_menu');
  assert.strictEqual(calc(g, { menuId: 'm60', optionIds: ['x'] }).error, 'bad_menu');
  assert.strictEqual(calc(g, { menuId: 'm60', optionIds: ['zzz'] }).error, 'bad_menu');
  assert.strictEqual(calc(g, { menuId: 'm60', optionIds: ['head', 'head'] }).total, 7000 + 1500);
  assert.strictEqual(calc(g, { menuId: 'm60', optionIds: 'head' }).error, 'bad_menu');   // 配列でない
});

test('初期データ: ID が一意で、見出し数と列数が合い、全行がパースを通る', () => {
  const g = loadGas();
  const ids = g.SEED_MENU.map(r => r[0]);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(g.SEED_MENU.every(r => r.length === g.MENU_HEADERS.length));
  assert.ok(g.SEED_OPTIONS.every(r => r.length === g.OPTION_HEADERS.length));
  assert.strictEqual(g.parseMenuRows_(g.SEED_MENU.map(r => r.map(String))).length, g.SEED_MENU.length);
  assert.strictEqual(g.parseOptionRows_(g.SEED_OPTIONS.map(r => r.map(String))).length, g.SEED_OPTIONS.length);
});

// doGet / doPost をスタブ(シート・ロック・キャッシュ)で動かす
function loadGasWithStubs({ menuRows, optionRows }) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const sheetOf = rows => ({ getLastRow: () => rows.length + 1, getRange: () => ({ getValues: () => rows }) });
  const cache = {};
  const ctx = vm.createContext({
    console,
    ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {}, tryLock: () => true }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    Utilities: { formatDate: () => '260101' },
    CalendarApp: {},
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => n === 'メニュー' ? sheetOf(menuRows) : n === 'オプション' ? sheetOf(optionRows) : null }) }
  });
  vm.runInContext(src, ctx);
  return ctx;
}
const parse = out => JSON.parse(out.s);

test('menu API: 表示ONの行だけを返す(個人情報なし)', () => {
  const g = loadGasWithStubs({
    menuRows: [['a', 'A', '40', '1000', '', 'steam', 'steam', '', 'ON', '1'], ['b', 'B', '40', '2000', '', 'steam', 'steam', '', 'OFF', '2']],
    optionRows: [['o', 'O', '10', '1500', 'ON', '1']]
  });
  const r = parse(g.doGet({ parameter: { action: 'menu' } }));
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.menu.map(m => m.id), ['a']);
  assert.deepStrictEqual(r.options.map(o => o.id), ['o']);
});

test('menu API: シートが読めなければ menu_unavailable', () => {
  const g = loadGasWithStubs({ menuRows: [], optionRows: [] });
  g.loadMenu_ = () => { throw new Error('boom'); };
  assert.strictEqual(parse(g.doGet({ parameter: { action: 'menu' } })).error, 'menu_unavailable');
});

test('doPost: 未知の menuId は bad_menu(クライアントの料金は信用しない)', () => {
  const g = loadGasWithStubs({
    menuRows: [['a', 'A', '40', '1000', '', 'steam', 'steam', '', 'ON', '1']],
    optionRows: [['o', 'O', '10', '1500', 'ON', '1']]   // 空だと初期データ書き込み(スタブ未対応)に入る
  });
  const body = { date: '2099-01-05', time: '10:00', menuId: 'zzz', menuName: '安く見せる', total: 1, minutes: 40, name: 'x', kana: 'ｘ', tel: '09012345678', email: 'a@b.jp', visit: '初回' };
  const r = parse(g.doPost({ postData: { contents: JSON.stringify(body) } }));
  assert.strictEqual(r.error, 'bad_menu');
});

test('最終レビュー: kind の大文字小文字・全角数字・指数表記', () => {
  const g = loadGas();
  const rows = g.parseMenuRows_([
    ['p', 'ペア', '40', '６０００', '', 'pair', 'pair', 'PAIR', 'on', '1'],
    ['e', '指数表記', '40', '1e3', '', 'aroma', 'aroma', '', 'ON', '2'],
    ['h', '16進', '0x10', '1000', '', 'aroma', 'aroma', '', 'ON', '3']
  ]);
  assert.deepStrictEqual(Array.from(rows.map(r => r.id)), ['p']);
  assert.strictEqual(rows[0].kind, 'pair');
  assert.strictEqual(rows[0].price, 6000);
  assert.strictEqual(rows[0].show, true);
});

test('最終レビュー: 古い index.html(options名のみ・optionIds無し)は bad_menu', () => {
  const g = loadGas();
  assert.strictEqual(calc(g, { menuId: 'm60', options: ['頭ほぐし'] }).error, 'bad_menu');
});

test('最終レビュー: menu API の fresh=1 はキャッシュを使わない', () => {
  const rows = [['a', 'A', '40', '1000', '', 'steam', 'steam', '', 'ON', '1']];
  const g = loadGasWithStubs({ menuRows: rows, optionRows: [['o', 'O', '10', '1500', 'ON', '1']] });
  assert.strictEqual(parse(g.doGet({ parameter: { action: 'menu' } })).menu[0].price, 1000);
  rows[0][3] = '2000';
  assert.strictEqual(parse(g.doGet({ parameter: { action: 'menu' } })).menu[0].price, 1000, '通常はキャッシュ');
  assert.strictEqual(parse(g.doGet({ parameter: { action: 'menu', fresh: '1' } })).menu[0].price, 2000, 'freshは最新');
});
