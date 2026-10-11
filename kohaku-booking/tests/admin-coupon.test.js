const test = require('node:test');
const assert = require('node:assert');
const { load, sleep } = require('./helpers');

const loginCoupon = async () => {
  const t = load('admin.html');
  t.type('#pw', 'demo'); t.click('[data-act=login]'); await sleep(1000);
  t.click('[data-act=section][data-v=coupon]'); await sleep(700);
  return t;
};
const rows = d => [...d.querySelectorAll('#cpn-list .item')].map(x => x.textContent.replace(/\s+/g, ' '));

test('管理画面: クーポン一覧に状態バッジ・割引内容・利用数が出る(デモ)', async () => {
  const { d, errors } = await loginCoupon();
  const r = rows(d);
  assert.ok(r.length >= 4);
  assert.ok(r.some(t => t.includes('WELCOME500') && t.includes('500円OFF') && t.includes('有効')));
  assert.ok(r.some(t => t.includes('AUTUMN10') && t.includes('10%OFF')));
  assert.ok(r.some(t => t.includes('期限切れ')));
  assert.ok(r.some(t => t.includes('割引未設定')));
  assert.deepStrictEqual(errors, []);
});

test('管理画面: クーポンの発行(コード空で自動生成)・検証エラー', async () => {
  const { click, type, text, d, errors } = await loginCoupon();
  click('[data-act=cpnnew]'); await sleep(50);
  click('[data-act=cpnsave]'); await sleep(700);
  assert.match(text('.sheet'), /名称は1〜60文字/);
  type('#c-name', 'テスト割引');
  type('#c-type', '金額'); type('#c-value', '0');
  click('[data-act=cpnsave]'); await sleep(700);
  assert.match(text('.sheet'), /割引値は/);
  type('#c-value', '１,０００円');
  type('#c-to', '2026-12-31');
  click('[data-act=cpnsave]'); await sleep(700);
  assert.match(text(), /発行しました/);
  const row = rows(d).find(t => t.includes('テスト割引'));
  assert.ok(row && /CP-[A-Z2-9]{6}/.test(row) && row.includes('1,000円OFF'));
  assert.deepStrictEqual(errors, []);
});

test('管理画面: 既存の編集(コードは変更不可)・無効化', async () => {
  const { click, type, text, d, errors } = await loginCoupon();
  const first = [...d.querySelectorAll('#cpn-list .item')].find(x => x.textContent.includes('WELCOME500'));
  first.click(); await sleep(50);
  assert.ok(d.querySelector('#c-code').readOnly, '既存のコードは編集できない');
  type('#c-name', '名前を変えたクーポン');
  type('#c-status', '無効');
  click('[data-act=cpnsave]'); await sleep(700);
  assert.match(text(), /保存しました/);
  const row = rows(d).find(t => t.includes('WELCOME500'));
  assert.ok(row.includes('名前を変えたクーポン') && row.includes('無効'));
  assert.deepStrictEqual(errors, []);
});

test('管理画面: クーポン名のHTMLエスケープ', async () => {
  const { w, click, type, text, d, errors } = await loginCoupon();
  click('[data-act=cpnnew]'); await sleep(50);
  type('#c-name', '<img src=x onerror=window.__pwned=1>');
  click('[data-act=cpnsave]'); await sleep(700);
  assert.match(text(), /発行しました/);
  assert.strictEqual(w.__pwned, undefined);
  assert.strictEqual(d.querySelector('#cpn-list img'), null);
  assert.deepStrictEqual(errors, []);
});

test('管理画面: 予約詳細にクーポンの行が出る', async () => {
  const t = load('admin.html');
  t.type('#pw', 'demo'); t.click('[data-act=login]'); await sleep(1000);
  t.w.eval(`const r = Object.values(A.data).flat()[0]; r.couponCode = 'CP-AAA111'; r.couponDiscount = 500; A.sheet = r.id; render();`);
  assert.match(t.text('.sheet'), /CP-AAA111/);
  assert.match(t.text('.sheet'), /−¥500/);
});
