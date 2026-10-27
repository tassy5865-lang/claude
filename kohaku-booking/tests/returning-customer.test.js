const test = require('node:test');
const assert = require('node:assert');
const { load, sleep } = require('./helpers');

// 日時の選択まで進める(メニュー選択 → 日時)
async function pickDate({ click, d }) {
  await sleep(100);
  click('[data-act=cat][data-v=facial]');
  click('[data-act=pick][data-v=f-rose50]');
  click('[data-act=next]'); await sleep(700);
  [...d.querySelectorAll('.day.ok')][0].click();
  [...d.querySelectorAll('.slot:not(:disabled)')][0].click();
}

test('2回目以降: ログイン済みなら日時のあとお客様情報を省いて確認画面へ(再来・ご要望は任意入力)', async () => {
  const h = load('index.html', { beforeParse(w) { w.sessionStorage.setItem('kohaku_token', 'T'); w.sessionStorage.setItem('kohaku_email', 'hanako@example.com'); } });
  const { click, text, d } = h;
  await pickDate(h);
  click('[data-act=next]'); await sleep(800);
  assert.match(text(), /ご予約内容/, '入力画面を飛ばして確認画面');
  assert.match(text(), /山田 花子 様/);
  assert.match(text(), /再来/);
  assert.ok(d.querySelector('textarea[data-k=note]'), 'ご要望の入力欄がある');
  assert.ok(d.querySelector('[data-act=edit][data-v=info]'), '変更リンクがある');
  click('[data-act=submit]'); await sleep(1200);
  assert.match(text(), /ご予約ありがとうございます/);
});

test('2回目以降: 登録情報に空があれば入力画面に進み、入れ済みの値は埋まっている', async () => {
  const h = load('index.html', { beforeParse(w) { w.sessionStorage.setItem('kohaku_token', 'T'); } });
  const { click, text, d } = h;
  // デモの登録情報は完全なので「変更」リンクから入力画面へ
  await pickDate(h);
  click('[data-act=next]'); await sleep(800);
  click('[data-act=edit][data-v=info]');
  assert.match(text(), /お客様情報/);
  assert.equal(d.querySelector('[data-k=name]').value, '山田 花子');
});

test('未ログインの初回: 従来どおり入力画面。メール確認のログインで入力を省いて確認画面へ戻る', async () => {
  const h = load('index.html', { url: 'https://example.test/' });
  const { click, type, text, d } = h;
  await pickDate(h);
  click('[data-act=next]'); await sleep(300);
  assert.match(text(), /お客様情報/);
  assert.equal(d.querySelector('[data-k=name]').value, '');
  // デモ表示(GAS_URL空)ではログイン案内は出さない。GASありのときだけ出ることは下で確認
  assert.ok(!d.querySelector('[data-act=booklogin]'));
});

test('未ログインでGASありなら、入力画面にメール確認のログイン案内が出る', async () => {
  const h = load('index.html', {
    replace: [["GAS_URL: '',", "GAS_URL: 'https://gas.test/exec',"]],
    beforeParse(w) {
      w.fetch = async (u, opt) => {
        const R = x => ({ json: async () => x });
        if (opt && opt.body) {
          const b = JSON.parse(opt.body);
          if (b.action === 'sendCode') return R({ ok: true });
          if (b.action === 'verifyCode') return R({ ok: true, token: 'T' });
          if (b.action === 'me') return R({ ok: true, profile: { name: '山田 花子', kana: 'ヤマダ ハナコ', tel: '09012345678', email: 'hanako@example.com', lineLinked: false }, upcoming: [], history: [], coupons: [], cancelDeadlineHours: 24 });
        }
        if (/action=menu/.test(u)) return R({ ok: false, error: 'menu_unavailable' });
        return R({ ok: true, busy: [] });
      };
    }
  });
  const { click, type, text, d } = h;
  await pickDate(h);
  click('[data-act=next]'); await sleep(300);
  assert.ok(d.querySelector('[data-act=booklogin]'));
  click('[data-act=booklogin]');
  type('#mk-email', 'hanako@example.com'); click('[data-act=sendcode]'); await sleep(300);
  type('#mk-code', '123456'); click('[data-act=verify]'); await sleep(500);
  assert.match(text(), /ご予約内容/, 'ログイン後は予約の続きの確認画面へ');
  assert.match(text(), /山田 花子 様/);
});

// LINEアプリ内で予約サイトを開いたときの動き
function liffLoad(url) {
  const calls = [];
  const h = load('index.html', {
    url,
    replace: [["GAS_URL: '',", "GAS_URL: 'https://gas.test/exec',"], ["LIFF_ID: '',", "LIFF_ID: '1234-abcd',"]],
    beforeParse(w) {
      w.liff = { init: async () => {}, isLoggedIn: () => true, getIDToken: () => 'IDTOKEN' };
      const o = w.Node.prototype.appendChild;
      w.Node.prototype.appendChild = function (el) { if (el && el.tagName === 'SCRIPT' && el.src) { setTimeout(() => el.onload && el.onload(), 0); return el; } return o.call(this, el); };
      w.fetch = async (u, opt) => {
        const R = x => ({ json: async () => x });
        if (opt && opt.body) {
          const b = JSON.parse(opt.body); calls.push(b.action);
          if (b.action === 'lineLogin') return R({ ok: true, token: 'T', email: 'a@b.jp' });
          if (b.action === 'me') return R({ ok: true, profile: { name: '山田 花子', kana: 'ヤマダ', tel: '09012345678', email: 'a@b.jp', lineLinked: true }, upcoming: [], history: [], coupons: [], cancelDeadlineHours: 24 });
        }
        return R({ ok: false, error: 'x' });
      };
    }
  });
  return { ...h, calls };
}

test('LINE内で予約サイトを開いただけならMy Kohakuへ移らず、ログイン状態だけ保つ', async () => {
  const { calls, text, d, w } = liffLoad('https://example.test/?liff.state=' + encodeURIComponent('?source=line'));
  await sleep(600);
  assert.deepStrictEqual(calls, ['lineLogin']);
  assert.ok(!d.querySelector('.mk-name'), 'My Kohakuの画面ではない');
  assert.ok(d.querySelector('[data-act=start]'), 'トップのまま');
  assert.equal(w.sessionStorage.getItem('kohaku_token'), 'T');
});

test('カードのボタン(page=my / liff.state内のid)ならMy Kohakuへ入る', async () => {
  const a = liffLoad('https://example.test/?liff.state=' + encodeURIComponent('?page=my'));
  await sleep(700);
  assert.deepStrictEqual(a.calls, ['lineLogin', 'me']);
  const b = liffLoad('https://example.test/?liff.state=' + encodeURIComponent('?page=my&act=view&id=K1'));
  await sleep(700);
  assert.deepStrictEqual(b.calls.slice(0, 2), ['lineLogin', 'me']);
});
