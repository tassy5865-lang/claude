const test = require('node:test');
const assert = require('node:assert');
const { load, sleep } = require('./helpers');

const loginMenu = async () => {
  const t = load('admin.html');
  t.type('#pw', 'demo'); t.click('[data-act=login]'); await sleep(1000);
  t.click('[data-act=section][data-v=menu]'); await sleep(700);
  return t;
};
const itemTexts = d => [...d.querySelectorAll('#menu-list .item')].map(x => x.textContent.replace(/\s+/g, ' '));

test('管理画面: メニュー一覧 → 編集 → 保存すると一覧に反映される(デモ表示)', async () => {
  const { click, type, text, d, errors } = await loginMenu();
  assert.ok(itemTexts(d).length >= 10, 'メニューが一覧に出る');
  click('#menu-list .item'); await sleep(50);
  assert.ok(d.querySelector('.sheet #m-name'), '編集シートが開く');
  assert.ok(d.querySelector('#m-id').readOnly || d.querySelector('#m-id').disabled, '既存のIDは編集できない');
  type('#m-name', '名前を変えたメニュー');
  type('#m-price', '７,５００円');
  click('[data-act=menusave]'); await sleep(700);
  assert.match(text(), /保存しました/);
  assert.ok(itemTexts(d).some(t => t.includes('名前を変えたメニュー') && t.includes('¥7,500')));
  assert.deepStrictEqual(errors, []);
});

test('管理画面: メニューの新規追加(ID空で自動採番)・検証エラーの表示', async () => {
  const { click, type, text, d, errors } = await loginMenu();
  click('[data-act=menunew]'); await sleep(50);
  // 名前が空のまま保存 → エラー
  click('[data-act=menusave]'); await sleep(700);
  assert.match(text('.sheet'), /名前は1〜60文字/);
  // 料金が負数 → エラー
  type('#m-name', 'テストメニュー'); type('#m-min', '50'); type('#m-price', '-1');
  d.querySelector('[data-k=cats][data-v=aroma]').click();
  click('[data-act=menusave]'); await sleep(700);
  assert.match(text('.sheet'), /料金は0〜1,000,000/);
  // 正しい値で保存
  type('#m-price', '5000');
  click('[data-act=menusave]'); await sleep(700);
  assert.match(text(), /追加しました/);
  const row = [...d.querySelectorAll('#menu-list .item')].find(x => x.textContent.includes('テストメニュー'));
  assert.ok(row, '一覧に追加される');
  row.click(); await sleep(50);
  assert.strictEqual(d.querySelector('#m-id').value, 'menu-1');
  assert.deepStrictEqual(errors, []);
});

test('管理画面: 表示を外すと一覧で「非表示」になる / おまかせは所要分が空でも保存できる', async () => {
  const { click, type, text, d, errors } = await loginMenu();
  click('#menu-list .item'); await sleep(50);
  d.querySelector('#m-show').click();
  click('[data-act=menusave]'); await sleep(700);
  assert.ok(itemTexts(d).some(t => t.includes('非表示')));
  const omk = [...d.querySelectorAll('#menu-list .item')].find(x => x.textContent.includes('おまかせ'));
  omk.click(); await sleep(50);
  type('#m-min', '');
  click('[data-act=menusave]'); await sleep(700);
  assert.match(text(), /保存しました/);
  assert.deepStrictEqual(errors, []);
});

test('管理画面: オプションの切替・編集と、名前のHTMLエスケープ', async () => {
  const { w, click, type, text, d, errors } = await loginMenu();
  click('[data-act=menutab][data-v=options]'); await sleep(50);
  assert.ok(itemTexts(d).some(t => t.includes('毛穴洗浄クチャパック')));
  click('#menu-list .item'); await sleep(50);
  assert.strictEqual(d.querySelector('[data-k=cats]'), null, 'オプションにカテゴリは無い');
  type('#m-name', '<img src=x onerror=window.__pwned=1>');
  click('[data-act=menusave]'); await sleep(700);
  assert.match(text(), /保存しました/);
  assert.strictEqual(w.__pwned, undefined);
  assert.strictEqual(d.querySelector('#menu-list img'), null);
  assert.ok(itemTexts(d).some(t => t.includes('<img src=x')));
  assert.deepStrictEqual(errors, []);
});
