const test = require('node:test');
const assert = require('node:assert');
const { load, sleep } = require('./helpers');

test('管理画面: キャンセル時の通知チェック(デモ表示)', async () => {
  const { click, type, text, d, errors } = load('admin.html');
  type('#pw', 'demo'); click('[data-act=login]'); await sleep(1000);

  // 確定の予約を開く → 通知チェックは初期ON
  const findItem = () => [...d.querySelectorAll('.item')].find(x => !/キャンセル|来店済/.test(x.textContent));
  // 夜間に実行すると今日の予約は全て来店済になる。1日に確定が1件しか無い日もあるため、
  // 開いている日に確定の予約が無ければ、出るまで翌日以降の日付を順に開く
  const open = async () => {
    if (!findItem()) {
      click('[data-act=screen][data-v=cal]'); await sleep(300);
      const cells = [...d.querySelectorAll('.cell[data-act=sel]')];
      const from = cells.findIndex(c => c.classList.contains('today'));
      for (const c of cells.slice(from + 1)) { c.click(); await sleep(100); if (findItem()) break; }
    }
    const it = findItem();
    assert.ok(it, '確定の予約が見つかりません');
    it.click();
  };
  await open();
  const nb = d.querySelector('#a-notify');
  assert.ok(nb && nb.checked, '通知チェックが初期ONで表示される');
  click('.sheet [data-v=キャンセル]'); await sleep(900);
  assert.match(text(), /予約をキャンセルしました。.お客様に通知しました/);

  // 通知OFFならメッセージに通知文言が出ない
  await sleep(300);
  await open();
  d.querySelector('#a-notify').checked = false;
  click('.sheet [data-v=キャンセル]'); await sleep(900);
  assert.match(text(), /予約をキャンセルしました。/);
  assert.doesNotMatch(text(), /お客様に通知しました/);
  assert.deepStrictEqual(errors, []);
});

test('管理画面: 臨時休業の登録と解除(デモ表示)', async () => {
  const { click, type, text, d, errors } = load('admin.html');
  type('#pw', 'demo'); click('[data-act=login]'); await sleep(1000);
  click('[data-act=screen][data-v=cal]'); await sleep(500);

  // 定休日(水曜)にはボタンが出ず、「定休日です」と表示される
  const cells = () => [...d.querySelectorAll('.cell[data-act=sel]')];
  const dow = c => new Date(c.dataset.v + 'T00:00:00Z').getUTCDay();
  const todayIdx = cells().findIndex(c => c.classList.contains('today'));
  let future = cells().slice(todayIdx + 1);
  if (future.length < 8) {   // 月末は翌月へ(水曜と他の曜日が両方入る長さが要る)
    click('[data-act=month][data-v="1"]'); await sleep(500);
    future = cells();
  }
  future.find(c => dow(c) === 3).click(); await sleep(100);
  assert.match(text(), /定休日です/);
  assert.strictEqual(d.querySelector('[data-act=closure]'), null);

  // 定休日でない翌日以降の日を臨時休業にする
  const target = future.find(c => dow(c) !== 3).dataset.v;
  d.querySelector(`.cell[data-v="${target}"]`).click(); await sleep(100);
  assert.match(d.querySelector('[data-act=closure]').textContent, /臨時休業にする/);
  click('[data-act=closure]'); await sleep(900);
  assert.match(text(), /臨時休業にしました/);
  assert.ok(d.querySelector(`.cell[data-v="${target}"]`).classList.contains('closed'), 'カレンダーに休業の印が付く');
  assert.match(text(), /この日は臨時休業です/);

  // 解除
  assert.match(d.querySelector('[data-act=closure]').textContent, /解除する/);
  click('[data-act=closure]'); await sleep(900);
  assert.match(text(), /臨時休業を解除しました/);
  assert.ok(!d.querySelector(`.cell[data-v="${target}"]`).classList.contains('closed'));
  assert.deepStrictEqual(errors, []);
});

test('管理画面: ログイン → 今日の予約 → 詳細/状態変更 → カレンダー → 予約追加(デモ表示)', async () => {
  const { click, type, text, d, errors } = load('admin.html');
  type('#pw', 'wrong'); click('[data-act=login]'); await sleep(500);
  assert.match(text('#app'), /パスワードが違います/);
  type('#pw', 'demo'); click('[data-act=login]'); await sleep(1000);
  assert.match(text(), /予約/);

  click('.item');
  assert.match(text('.sheet'), /予約番号/);
  click('.sheet [data-act=status]'); await sleep(900);
  assert.match(text(), /更新しました/);

  click('[data-act=screen][data-v=cal]'); await sleep(500);
  assert.ok(d.querySelectorAll('.cell').length >= 28);

  click('[data-act=new]');
  type('#a-name', '新規 太郎');
  type('#a-date', new Date(Date.now() + 9 * 3600e3 + 3 * 864e5).toISOString().slice(0, 10));
  click('[data-act=create]'); await sleep(900);
  assert.match(text(), /ご予約を登録しました/);

  click('[data-act=logout]');
  assert.match(text('#app'), /パスワード/);
  assert.deepStrictEqual(errors, []);
});

test('管理画面: ナビ(サイドバー/下タブ)があり、予約セクションにだけ「予約追加」ボタンが出る', async () => {
  const { click, type, d, errors } = load('admin.html');
  type('#pw', 'demo'); click('[data-act=login]'); await sleep(1000);
  assert.ok(d.querySelector('.side [data-act=section][data-v=reserve]'), 'サイドバー');
  assert.ok(d.querySelector('.bnav [data-act=section][data-v=reserve]'), '下タブ');
  assert.strictEqual(d.querySelector('.side [data-v=reserve]').getAttribute('aria-selected'), 'true');
  assert.ok(d.querySelector('.fab'), '予約セクションでは予約追加ボタンが出る');
  assert.deepStrictEqual(errors, []);
});

test('管理画面: 顧客一覧 → 検索 → 流入元で絞り込み → 詳細 → 編集保存(デモ表示)', async () => {
  const { click, type, text, d, errors } = load('admin.html');
  type('#pw', 'demo'); click('[data-act=login]'); await sleep(1000);
  click('[data-act=section][data-v=customers]'); await sleep(700);
  const items = () => [...d.querySelectorAll('#cust-list .item')];
  const total = items().length;
  assert.ok(total >= 5, '顧客が一覧に出る');

  // 検索: 入力してもフォーカスされた入力欄が作り直されない(1文字ごとに入力が途切れない)
  const q = d.querySelector('#cust-q');
  type('#cust-q', '田中'); await sleep(50);
  assert.strictEqual(d.querySelector('#cust-q'), q, '検索欄が再描画で置き換わらない');
  assert.ok(items().length >= 1 && items().length < total);
  assert.ok(items().every(x => /田中/.test(x.textContent)));
  type('#cust-q', ''); await sleep(50);
  assert.strictEqual(items().length, total);

  // 流入元の絞り込み
  type('#cust-src', 'line'); await sleep(50);
  assert.ok(items().length >= 1 && items().length < total);
  assert.ok(items().every(x => x.querySelector('.tag').textContent === 'LINE'), '先頭のタグ=流入元がLINE');
  type('#cust-src', ''); await sleep(50);

  // 詳細 → 編集 → 保存
  click('#cust-list .item'); await sleep(50);
  assert.match(text('.sheet'), /予約履歴/);
  type('#c-instagram', '@tanaka_test');
  type('#c-src', 'instagram_dm');
  type('#c-idate', '2026-10-04');
  type('#c-memo', '肩こり相談 =HYPERLINK("x")');
  click('[data-act=custsave]'); await sleep(700);
  assert.match(text(), /顧客情報を保存しました/);
  click('#cust-list .item'); await sleep(50);
  assert.strictEqual(d.querySelector('#c-instagram').value, '@tanaka_test');
  assert.strictEqual(d.querySelector('#c-memo').value, '肩こり相談 =HYPERLINK("x")');
  assert.deepStrictEqual(errors, []);
});

test('管理画面: 顧客の詳細は HTML をエスケープして表示する', async () => {
  const { w, click, type, d, errors } = load('admin.html');
  type('#pw', 'demo'); click('[data-act=login]'); await sleep(1000);
  click('[data-act=section][data-v=customers]'); await sleep(700);
  click('#cust-list .item'); await sleep(50);
  type('#c-memo', '<img src=x onerror=window.__pwned=1>');
  click('[data-act=custsave]'); await sleep(700);
  click('#cust-list .item'); await sleep(50);
  assert.strictEqual(w.__pwned, undefined);
  assert.strictEqual(d.querySelector('.sheet img'), null);
  assert.deepStrictEqual(errors, []);
});
