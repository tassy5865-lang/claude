const test = require('node:test');
const assert = require('node:assert');
const { load, sleep } = require('./helpers');

test('管理画面: キャンセル時の通知チェック(デモ表示)', async () => {
  const { click, type, text, d, errors } = load('admin.html');
  type('#pw', 'demo'); click('[data-act=login]'); await sleep(1000);

  // 確定の予約を開く → 通知チェックは初期ON
  const open = () => {
    const items = [...d.querySelectorAll('.item')];
    const it = items.find(x => !/キャンセル|来店済/.test(x.textContent));
    assert.ok(it, '確定の予約が見つかりません');
    it.click();
  };
  open();
  const nb = d.querySelector('#a-notify');
  assert.ok(nb && nb.checked, '通知チェックが初期ONで表示される');
  click('.sheet [data-v=キャンセル]'); await sleep(900);
  assert.match(text(), /予約をキャンセルしました。.お客様に通知しました/);

  // 通知OFFならメッセージに通知文言が出ない
  await sleep(300);
  open();
  d.querySelector('#a-notify').checked = false;
  click('.sheet [data-v=キャンセル]'); await sleep(900);
  assert.match(text(), /予約をキャンセルしました。/);
  assert.doesNotMatch(text(), /お客様に通知しました/);
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
