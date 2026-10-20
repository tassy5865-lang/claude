const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

function loadGas() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const ctx = vm.createContext({ console });
  vm.runInContext(src + '\n;this.__c = { MENU_HEADERS, OPTION_HEADERS, MENU_CATS, MENU_GROUPS, MENU_KINDS };', ctx);
  return Object.assign(ctx, ctx.__c);
}
const j = o => JSON.parse(JSON.stringify(o));
const okItem = (o = {}) => Object.assign({ id: '', name: 'テスト', min: 60, price: 7000, desc: '', cats: ['aroma'], g: 'aroma', kind: '', show: true, order: 5 }, o);
const okOpt = (o = {}) => Object.assign({ id: '', name: '頭ほぐし', min: 10, price: 1500, show: true, order: 1 }, o);
const bad = f => ({ error: 'bad_field', field: f });

test('定数: カテゴリ・グループ・種別の許可値', () => {
  const g = loadGas();
  assert.deepStrictEqual(j(g.MENU_CATS), ['first', 'rec', 'aroma', 'facial', 'steam', 'pair', 'omakase']);
  assert.deepStrictEqual(j(g.MENU_GROUPS), ['aroma', 'facial', 'steam', 'pair', 'omakase']);
  assert.deepStrictEqual(j(g.MENU_KINDS), ['', 'pair', 'omakase']);
});

test('intOrNull_: 全角・カンマ・円記号を許し、小数・負数・文字は NaN', () => {
  const g = loadGas();
  assert.strictEqual(g.intOrNull_('７,０００円'), 7000);
  assert.strictEqual(g.intOrNull_(' 60 '), 60);
  assert.strictEqual(g.intOrNull_(''), null);
  assert.strictEqual(g.intOrNull_(null), null);
  assert.ok(Number.isNaN(g.intOrNull_('12.5')));
  assert.ok(Number.isNaN(g.intOrNull_('-1')));
  assert.ok(Number.isNaN(g.intOrNull_('abc')));
});

test('validateMenuItem_: 正常値は空文字', () => {
  const g = loadGas();
  assert.strictEqual(g.validateMenuItem_(okItem(), true, []), '');
  assert.strictEqual(g.validateMenuItem_(okItem({ id: 'my-menu_1' }), true, ['a']), '');
  assert.strictEqual(g.validateMenuItem_(okItem({ price: null }), false, []), '');   // 料金空=当日案内
  assert.strictEqual(g.validateMenuItem_(okItem({ price: '７,０００円', min: '60' }), false, []), '');
});

test('validateMenuItem_: 名前・説明・ID', () => {
  const g = loadGas();
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ name: '' }), true, [])), bad('name'));
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ name: '   ' }), true, [])), bad('name'));
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ name: 'あ'.repeat(61) }), true, [])), bad('name'));
  assert.strictEqual(g.validateMenuItem_(okItem({ name: 'あ'.repeat(60) }), true, []), '');
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ desc: 'あ'.repeat(201) }), true, [])), bad('desc'));
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ id: 'a b' }), true, [])), bad('id'));
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ id: '日本語' }), true, [])), bad('id'));
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ id: 'a'.repeat(41) }), true, [])), bad('id'));
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ id: 'aroma60' }), true, ['aroma60'])), { error: 'duplicate_id', field: 'id' });
  // 更新時は id を検証しない(検索キーとして使うだけ)
  assert.strictEqual(g.validateMenuItem_(okItem({ id: 'aroma60' }), false, ['aroma60']), '');
});

test('validateMenuItem_: 所要分・料金の境界値', () => {
  const g = loadGas();
  const v = o => j(g.validateMenuItem_(okItem(o), true, []));
  assert.deepStrictEqual(v({ min: 9 }), bad('min'));
  assert.strictEqual(v({ min: 10 }), '');
  assert.strictEqual(v({ min: 300 }), '');
  assert.deepStrictEqual(v({ min: 301 }), bad('min'));
  assert.deepStrictEqual(v({ min: null }), bad('min'));
  assert.deepStrictEqual(v({ min: '' }), bad('min'));
  assert.deepStrictEqual(v({ min: '12.5' }), bad('min'));
  assert.strictEqual(v({ price: 0 }), '');
  assert.strictEqual(v({ price: 1000000 }), '');
  assert.deepStrictEqual(v({ price: 1000001 }), bad('price'));
  assert.deepStrictEqual(v({ price: -1 }), bad('price'));
  assert.deepStrictEqual(v({ price: '12.5' }), bad('price'));
  assert.deepStrictEqual(v({ price: 'abc' }), bad('price'));
});

test('validateMenuItem_: おまかせは所要分が空/0でもよいが、300超は不可', () => {
  const g = loadGas();
  const v = o => j(g.validateMenuItem_(okItem(Object.assign({ kind: 'omakase', cats: ['omakase'], g: 'omakase', price: null }, o)), true, []));
  assert.strictEqual(v({ min: null }), '');
  assert.strictEqual(v({ min: '' }), '');
  assert.strictEqual(v({ min: 0 }), '');
  assert.deepStrictEqual(v({ min: 301 }), bad('min'));
  assert.deepStrictEqual(v({ min: -5 }), bad('min'));
});

test('validateMenuItem_: 種別・カテゴリ・グループ・表示・並び順', () => {
  const g = loadGas();
  const v = o => j(g.validateMenuItem_(okItem(o), true, []));
  assert.deepStrictEqual(v({ kind: 'bulk' }), bad('kind'));
  assert.strictEqual(v({ kind: 'pair' }), '');
  assert.deepStrictEqual(v({ cats: [] }), bad('cats'));
  assert.deepStrictEqual(v({ cats: 'aroma' }), bad('cats'));
  assert.deepStrictEqual(v({ cats: ['aroma', 'unknown'] }), bad('cats'));
  assert.deepStrictEqual(v({ g: 'sauna' }), bad('g'));
  assert.deepStrictEqual(v({ show: 'ON' }), bad('show'));
  assert.deepStrictEqual(v({ order: null }), bad('order'));
  assert.deepStrictEqual(v({ order: -1 }), bad('order'));
  assert.deepStrictEqual(v({ order: 10000 }), bad('order'));
  assert.strictEqual(v({ order: 0 }), '');
  assert.strictEqual(v({ order: '9999' }), '');
});

test('validateOptionItem_: 料金は必須、所要分は0〜300', () => {
  const g = loadGas();
  const v = (o, create = true, ids = []) => j(g.validateOptionItem_(okOpt(o), create, ids));
  assert.strictEqual(v({}), '');
  assert.strictEqual(v({ min: 0 }), '');
  assert.deepStrictEqual(v({ min: 301 }), bad('min'));
  assert.deepStrictEqual(v({ min: null }), bad('min'));
  assert.deepStrictEqual(v({ price: null }), bad('price'));
  assert.deepStrictEqual(v({ price: -1 }), bad('price'));
  assert.deepStrictEqual(v({ name: '' }), bad('name'));
  assert.deepStrictEqual(v({ show: 1 }), bad('show'));
  assert.deepStrictEqual(v({ order: 'x' }), bad('order'));
  assert.deepStrictEqual(v({ id: 'head' }, true, ['head']), { error: 'duplicate_id', field: 'id' });
  assert.deepStrictEqual(v({ id: 'a b' }, true, []), bad('id'));
});

test('menuRowFromItem_: 全て文字列で、MENU_HEADERS の並びになる', () => {
  const g = loadGas();
  const row = j(g.menuRowFromItem_({ id: 'm1', name: ' テスト ', min: '60', price: null, desc: ' 説明 ', cats: ['aroma', 'first'], g: 'aroma', kind: 'pair', show: false, order: '3' }));
  assert.deepStrictEqual(row, ['m1', 'テスト', '60', '', '説明', 'aroma,first', 'aroma', 'pair', 'OFF', '3']);
  assert.strictEqual(row.length, g.MENU_HEADERS.length);
  const omk = j(g.menuRowFromItem_({ id: 'omakase', name: 'おまかせ', min: null, price: null, desc: '', cats: ['omakase'], g: 'omakase', kind: 'omakase', show: true, order: 99 }));
  assert.deepStrictEqual(omk, ['omakase', 'おまかせ', '', '', '', 'omakase', 'omakase', 'omakase', 'ON', '99']);
  const yen = j(g.menuRowFromItem_({ id: 'x', name: 'x', min: 60, price: '７,０００円', desc: '', cats: ['aroma'], g: 'aroma', kind: '', show: true, order: 1 }));
  assert.strictEqual(yen[3], '7000');
  assert.ok(yen.every(c => typeof c === 'string'));
});

test('optionRowFromItem_: OPTION_HEADERS の並びになる', () => {
  const g = loadGas();
  const row = j(g.optionRowFromItem_({ id: 'head', name: ' 頭ほぐし ', min: 10, price: '1,500', show: true, order: 1 }));
  assert.deepStrictEqual(row, ['head', '頭ほぐし', '10', '1500', 'ON', '1', '']);
  assert.strictEqual(row.length, g.OPTION_HEADERS.length);
  const limited = j(g.optionRowFromItem_({ id: 'kucha', name: 'クチャパック', min: 0, price: 1000, show: true, order: 3, menus: ['total120', 'f-rose50'] }));
  assert.strictEqual(limited[6], 'total120,f-rose50');
});

test('validateOptionItem_: 対象メニューは配列でID形式のものだけ', () => {
  const g = loadGas();
  const base = { id: 'x', name: 'x', min: 0, price: 100, show: true, order: 1 };
  assert.strictEqual(g.validateOptionItem_(Object.assign({ menus: ['total120'] }, base), true, []), '');
  assert.strictEqual(g.validateOptionItem_(base, true, []), '', 'menus 省略は全メニュー共通');
  assert.strictEqual(g.validateOptionItem_(Object.assign({ menus: 'total120' }, base), true, []).field, 'menus');
  assert.strictEqual(g.validateOptionItem_(Object.assign({ menus: ['<b>'] }, base), true, []).field, 'menus');
});

test('parseOptionRows_ / calcBooking_: 対象メニューのあるオプションは、そのメニューでだけ選べる', () => {
  const g = loadGas();
  const menu = g.parseMenuRows_([['m1', 'A', '60', '5000', '', 'aroma', 'aroma', '', 'ON', '1'], ['m2', 'B', '60', '5000', '', 'aroma', 'aroma', '', 'ON', '2']]);
  const options = g.parseOptionRows_([['o-all', '共通', '0', '100', 'ON', '1', ''], ['o-m1', 'm1専用', '10', '1000', 'ON', '2', 'm1, m3']]);
  assert.deepStrictEqual(j(options.map(o => o.menus)), [[], ['m1', 'm3']]);
  const ok = j(g.calcBooking_(menu, options, { menuId: 'm1', optionIds: ['o-all', 'o-m1'] }));
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.total, 6100);
  assert.strictEqual(ok.minutes, 70);
  assert.strictEqual(j(g.calcBooking_(menu, options, { menuId: 'm2', optionIds: ['o-m1'] })).error, 'bad_menu');
  assert.strictEqual(j(g.calcBooking_(menu, options, { menuId: 'm2', optionIds: ['o-all'] })).ok, true);
});

test('nextItemId_: 既存IDの数値部の最大+1(数字を含まないIDが混ざっても落ちない)', () => {
  const g = loadGas();
  assert.strictEqual(g.nextItemId_('menu', []), 'menu-1');
  assert.strictEqual(g.nextItemId_('menu', ['menu-3', 'menu-10', 'aroma60', 'menu-x', 'xmenu-99']), 'menu-11');
  assert.strictEqual(g.nextItemId_('opt', ['head', 'bath']), 'opt-1');
  assert.strictEqual(g.nextItemId_('opt', ['opt-2']), 'opt-3');
});
