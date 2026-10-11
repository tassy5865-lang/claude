const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

function loadGas() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const ctx = vm.createContext({ console });
  vm.runInContext(src + '\n;this.__c = { MENU_HEADERS, OPTION_HEADERS };', ctx);
  return Object.assign(ctx, ctx.__c);
}
const j = o => JSON.parse(JSON.stringify(o));

/* フェイクのシート/キャッシュで、書き込み位置・ID不変・キャッシュ消去を確かめる */
function fakeSheet(headers, rows) {
  const data = [headers.slice()].concat(rows.map(r => r.slice()));
  return {
    data,
    getLastRow: () => data.length,
    getRange(r, c, nr, nc) {
      const rng = {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) out.push((data[r - 1 + i] || []).slice(c - 1, c - 1 + nc));
          return out;
        },
        setValues(v) {
          for (let i = 0; i < v.length; i++) {
            data[r - 1 + i] = data[r - 1 + i] || [];
            for (let k = 0; k < v[i].length; k++) data[r - 1 + i][c - 1 + k] = v[i][k];
          }
          return rng;
        },
        setNumberFormat() { return rng; }
      };
      return rng;
    }
  };
}
const MENU_ROWS = [
  ['aroma60', 'Relax', '60', '7000', '説明A', 'aroma,first', 'aroma', '', 'ON', '2'],
  ['hidden1', '非表示', '40', '3000', '', 'steam', 'steam', '', 'OFF', '9'],
  ['pair1', 'ペア', '40', '6000', '', 'pair', 'pair', 'pair', 'ON', '1']
];
const OPT_ROWS = [['head', '頭ほぐし', '10', '1500', 'ON', '1']];
function gasWithSheets() {
  const g = loadGas();
  const sheets = { 'メニュー': fakeSheet(g.MENU_HEADERS, MENU_ROWS), 'オプション': fakeSheet(g.OPTION_HEADERS, OPT_ROWS) };
  const removed = [];
  g.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] }) };
  g.CacheService = { getScriptCache: () => ({ get: k => (k === 'adm:tok' ? '1' : null), remove: k => removed.push(k), put() {} }) };
  return { g, sheets, removed };
}
const call = (g, action, extra) => j(g.handleAction_(Object.assign({ action, token: 'tok' }, extra)));
const base = (o = {}) => Object.assign({ id: '', name: 'x', min: 60, price: 1, desc: '', cats: ['aroma'], g: 'aroma', kind: '', show: true, order: 1 }, o);

test('adminMenu: 表示OFFも含めて並び順で返し、選択肢も返す', () => {
  const { g } = gasWithSheets();
  const r = call(g, 'adminMenu');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.menu.map(m => m.id), ['pair1', 'aroma60', 'hidden1']);
  assert.strictEqual(r.menu.find(m => m.id === 'hidden1').show, false);
  assert.deepStrictEqual(r.options.map(o => o.id), ['head']);
  assert.deepStrictEqual(r.cats, ['first', 'rec', 'aroma', 'facial', 'steam', 'pair', 'omakase']);
  assert.deepStrictEqual(r.groups, ['aroma', 'facial', 'steam', 'pair', 'omakase']);
  assert.deepStrictEqual(r.kinds, ['', 'pair', 'omakase']);
});

test('adminMenuSave(更新): 指定IDの行だけを書き換え、IDは変えず、キャッシュを消す', () => {
  const { g, sheets, removed } = gasWithSheets();
  const before = JSON.stringify(sheets['メニュー'].data);
  const r = call(g, 'adminMenuSave', { create: false, item: base({ id: 'aroma60', name: 'Relax 改', min: '70', price: '７,５００円', desc: '新説明', show: false, order: 4 }) });
  assert.deepStrictEqual(r, { ok: true, id: 'aroma60' });
  const d = sheets['メニュー'].data;
  assert.deepStrictEqual(d[1], ['aroma60', 'Relax 改', '70', '7500', '新説明', 'aroma', 'aroma', '', 'OFF', '4']);
  assert.deepStrictEqual(d[2], JSON.parse(before)[2]);   // 他の行は変わらない
  assert.deepStrictEqual(d[3], JSON.parse(before)[3]);
  assert.strictEqual(d.length, 4);                       // 行は増えない
  assert.deepStrictEqual(removed, ['menu:v1']);
});

test('adminMenuSave(更新): 存在しないID・空IDは not_found、何も書かずキャッシュも消さない', () => {
  const { g, sheets, removed } = gasWithSheets();
  const before = JSON.stringify(sheets['メニュー'].data);
  assert.deepStrictEqual(call(g, 'adminMenuSave', { create: false, item: base({ id: 'nothing' }) }), { ok: false, error: 'not_found' });
  assert.deepStrictEqual(call(g, 'adminMenuSave', { create: false, item: base({ id: '' }) }), { ok: false, error: 'not_found' });
  assert.strictEqual(JSON.stringify(sheets['メニュー'].data), before);
  assert.deepStrictEqual(removed, []);
});

test('adminMenuSave(新規): IDが空なら自動採番して末尾の次の行に書く', () => {
  const { g, sheets, removed } = gasWithSheets();
  const r = call(g, 'adminMenuSave', { create: true, item: base({ name: '新メニュー', min: 50, price: 5000, cats: ['aroma', 'rec'], order: 10 }) });
  assert.deepStrictEqual(r, { ok: true, id: 'menu-1' });
  const d = sheets['メニュー'].data;
  assert.strictEqual(d.length, 5);
  assert.deepStrictEqual(d[4], ['menu-1', '新メニュー', '50', '5000', '', 'aroma,rec', 'aroma', '', 'ON', '10']);
  assert.deepStrictEqual(removed, ['menu:v1']);
  const r2 = call(g, 'adminMenuSave', { create: true, item: base({ name: '2つ目', price: null, order: 11 }) });
  assert.deepStrictEqual(r2, { ok: true, id: 'menu-2' });
});

test('adminMenuSave(新規): 重複IDと不正値は書き込まない', () => {
  const { g, sheets, removed } = gasWithSheets();
  const before = JSON.stringify(sheets['メニュー'].data);
  assert.deepStrictEqual(call(g, 'adminMenuSave', { create: true, item: base({ id: 'aroma60' }) }), { ok: false, error: 'duplicate_id', field: 'id' });
  assert.deepStrictEqual(call(g, 'adminMenuSave', { create: true, item: base({ price: -5 }) }), { ok: false, error: 'bad_field', field: 'price' });
  assert.strictEqual(JSON.stringify(sheets['メニュー'].data), before);
  assert.deepStrictEqual(removed, []);
});

test('adminOptionSave: 更新と新規(自動採番)', () => {
  const { g, sheets } = gasWithSheets();
  assert.deepStrictEqual(call(g, 'adminOptionSave', { create: false, item: { id: 'head', name: '頭ほぐし長め', min: 20, price: 2000, show: true, order: 1 } }), { ok: true, id: 'head' });
  assert.deepStrictEqual(sheets['オプション'].data[1], ['head', '頭ほぐし長め', '20', '2000', 'ON', '1']);
  assert.deepStrictEqual(call(g, 'adminOptionSave', { create: true, item: { id: '', name: 'フットバス', min: 0, price: 1000, show: false, order: 2 } }), { ok: true, id: 'opt-1' });
  assert.deepStrictEqual(sheets['オプション'].data[2], ['opt-1', 'フットバス', '0', '1000', 'OFF', '2']);
  assert.deepStrictEqual(call(g, 'adminOptionSave', { create: true, item: { id: '', name: 'x', min: 0, price: null, show: true, order: 3 } }), { ok: false, error: 'bad_field', field: 'price' });
});

test('メニュー管理のAPIはトークン無しだと auth で拒否される', () => {
  const { g } = gasWithSheets();
  for (const action of ['adminMenu', 'adminMenuSave', 'adminOptionSave']) {
    assert.deepStrictEqual(j(g.handleAction_({ action, create: true, item: {} })), { ok: false, error: 'auth' });
  }
});
