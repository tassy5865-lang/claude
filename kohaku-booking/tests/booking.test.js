const test = require('node:test');
const assert = require('node:assert');
const { load, sleep } = require('./helpers');

test('お客様側: 予約フロー(メニュー選択 → 予約完了)とMy Kohaku(デモ表示)', async () => {
  const { click, type, text, d, errors } = load('index.html');

  // 予約フロー
  click('[data-act=cat][data-v=aroma]');
  click('[data-act=pick][data-v=aroma60]');
  click('input[data-f=opt][value=head]');
  assert.match(text('.bar'), /¥8,500/, 'オプション込みの合計金額');
  click('[data-act=next]'); await sleep(700);
  [...d.querySelectorAll('.day.ok')][0].click();
  [...d.querySelectorAll('.slot:not(:disabled)')][0].click();
  click('[data-act=next]');
  type('[data-k=name]', '山田 花子'); type('[data-k=kana]', 'ヤマダ ハナコ');
  type('[data-k=tel]', '090-1234-5678'); type('[data-k=email]', 'hanako@example.com');
  click('[data-act=next]');
  assert.match(text(), /山田 花子 様/);
  click('[data-act=submit]'); await sleep(1200);
  assert.match(text(), /ご予約ありがとうございます/);
  click('[data-act=reset]');

  // My Kohaku(デモの確認コードは 123456)
  click('[data-act=my]');
  type('#mk-email', 'hanako@example.com'); click('[data-act=sendcode]'); await sleep(600);
  type('#mk-code', '000000'); click('[data-act=verify]'); await sleep(600);
  assert.match(text(), /コードが違います/);
  type('#mk-code', '123456'); click('[data-act=verify]'); await sleep(1200);
  assert.match(text(), /山田 花子 様/);
  click('[data-act=cancelbk]'); await sleep(1200);
  click('[data-act=tab][data-v=history]');
  assert.match(text(), /キャンセル/);
  click('[data-act=tab][data-v=profile]');
  type('#pf-name', '山田 花代'); click('[data-act=saveprof]'); await sleep(800);
  assert.match(text(), /登録情報を更新しました/);
  assert.deepStrictEqual(errors, []);
});

test('お客様側: LINEから開いた予約の日時変更(デモ表示)', async () => {
  const { click, type, text, d, errors } = load('index.html', { url: 'https://example.test/?page=my&id=K2610040001&act=change' });
  await sleep(300);
  type('#mk-email', 'hanako@example.com'); click('[data-act=sendcode]'); await sleep(600);
  type('#mk-code', '123456'); click('[data-act=verify]'); await sleep(1500);
  await sleep(900);
  assert.match(text(), /日時の変更/);
  [...d.querySelectorAll('.day.ok')][2].click();
  [...d.querySelectorAll('.slot:not(:disabled)')][1].click();
  click('[data-act=rs-submit]'); await sleep(1800);
  assert.match(text(), /日時を変更しました/);
  assert.deepStrictEqual(errors.filter(e => !/scrollTo/.test(e)), []);
});

test('お客様側: LIFFでのLINE連携(連携コード付きで開いた場合)', async () => {
  const calls = [];
  const { text } = load('index.html', {
    url: 'https://example.test/?link=ABCD1234',
    replace: [["GAS_URL: '',", "GAS_URL: 'https://gas.test/exec',"], ["LIFF_ID: '',", "LIFF_ID: '1234-abcd',"]],
    beforeParse(w) {
      w.liff = { init: async () => {}, isLoggedIn: () => true, getIDToken: () => 'IDTOKEN' };
      const o = w.Node.prototype.appendChild;
      w.Node.prototype.appendChild = function (el) { if (el && el.tagName === 'SCRIPT' && el.src) { setTimeout(() => el.onload && el.onload(), 0); return el; } return o.call(this, el); };
      w.fetch = async (u, opt) => {
        const b = JSON.parse(opt.body); calls.push(b.action);
        const R = x => ({ json: async () => x });
        if (b.action === 'lineLink') return R({ ok: true, token: 'T', email: 'a@b.jp' });
        if (b.action === 'me') return R({ ok: true, profile: { name: '山田 花子', kana: 'ヤマダ', tel: '09012345678', email: 'a@b.jp', lineLinked: true }, upcoming: [], history: [], coupons: [], cancelDeadlineHours: 24 });
        return R({ ok: false, error: 'x' });
      };
    }
  });
  await sleep(900);
  assert.deepStrictEqual(calls, ['lineLink', 'me']);
  assert.match(text(), /LINE連携が完了しました/);
});
