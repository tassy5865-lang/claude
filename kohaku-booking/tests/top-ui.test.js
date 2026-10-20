const test = require('node:test');
const assert = require('node:assert');
const { load, sleep } = require('./helpers');

test('トップ画面: 写真つきヒーローと「予約をはじめる」ボタン、左寄せロゴのヘッダー', () => {
  const { d, text } = load('index.html');
  const img = d.querySelector('.hero img');
  assert.ok(img && /images\/hero\.jpg$/.test(img.getAttribute('src')), 'ヒーロー写真');
  assert.ok(img.getAttribute('alt') !== null, 'alt属性');
  assert.match(text('.hero'), /香りに包まれ、.*ふっと力を抜いて、.*本来の自分に戻る時間。/);
  const btn = d.querySelector('.hero [data-act=start]');
  assert.ok(btn && /予約をはじめる/.test(btn.textContent));
  assert.ok(d.querySelector('.hd.is-top'), 'トップのヘッダーはロゴ左寄せ');
  assert.ok(d.querySelector('[data-act=cat][data-v=aroma]'), 'カテゴリ一覧は残る');
  assert.ok(d.querySelector('[data-act=my]'), 'My Kohaku の入口は残る');
});

test('トップ画面: 「予約をはじめる」でメニュー選択(はじめての方)に進み、他画面のヘッダーは通常', async () => {
  const { click, d, text } = load('index.html');
  click('.hero [data-act=start]'); await sleep(50);
  assert.ok(d.querySelector('.mlist'), 'メニュー一覧が出る');
  assert.strictEqual(d.querySelector('.tab[aria-selected=true]').dataset.v, 'first');
  assert.ok(!d.querySelector('.hd.is-top'));
  assert.match(text('.brand'), /琥珀/);
});
