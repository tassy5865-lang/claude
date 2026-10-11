const test = require('node:test');
const assert = require('node:assert');
const { load, sleep } = require('./helpers');

const GAS = 'https://gas.test/exec';
const withGas = [["GAS_URL: '',", `GAS_URL: '${GAS}',`]];

// 確認画面までの状態を直接つくる(既存テスト ref-link.test.js と同じ方式)
function toConfirm(w, extra = '') {
  w.eval(`S.menu = MENU.find(m => m.id === 'aroma60'); S.opts = []; S.date = '2099-01-05'; S.time = '10:00';
    Object.assign(S.info, {name:'テスト 太郎', kana:'てすと たろう', tel:'09012345678', email:'a@example.com'}); S.screen = 'confirm'; ${extra} render();`);
}

test('確認画面: コードを適用すると割引と割引後の合計が出て、外すと戻る(デモ)', async () => {
  const { w, click, type, text, d, errors } = load('index.html');
  await sleep(30);
  toConfirm(w);
  assert.ok(d.querySelector('#cp-code'), 'コード入力欄がある');
  assert.match(text('#app'), /¥7,000/);
  type('#cp-code', 'welcome500');
  click('[data-act=cpapply]'); await sleep(700);
  assert.match(text('#app'), /−¥500/);
  assert.match(text('#app'), /¥6,500/);
  assert.strictEqual(d.querySelector('#cp-code'), null);
  click('[data-act=cpoff]'); await sleep(30);
  assert.match(text('#app'), /¥7,000/);
  assert.ok(d.querySelector('#cp-code'));
  // 割合
  type('#cp-code', 'AUTUMN10');
  click('[data-act=cpapply]'); await sleep(700);
  assert.match(text('#app'), /−¥700/);
  assert.match(text('#app'), /¥6,300/);
  assert.deepStrictEqual(errors, []);
});

test('確認画面: 無効なコードはエラー文言を表示し、空欄は入力を促す', async () => {
  const { w, click, type, text, errors } = load('index.html');
  await sleep(30);
  toConfirm(w);
  click('[data-act=cpapply]'); await sleep(30);
  assert.match(text('#app'), /クーポンコードを入力してください/);
  type('#cp-code', 'NOPE-123');
  click('[data-act=cpapply]'); await sleep(700);
  assert.match(text('#app'), /このクーポンコードはご利用いただけません/);
  assert.strictEqual(w.eval('S.coupon'), null);
  assert.deepStrictEqual(errors, []);
});

test('確認画面: メニュー・オプション・メールを変えると、適用済みの割引は自動で外れる', async () => {
  const { w, click, type, text, d } = load('index.html');
  await sleep(30);
  toConfirm(w);
  type('#cp-code', 'WELCOME500'); click('[data-act=cpapply]'); await sleep(700);
  assert.match(text('#app'), /−¥500/);
  w.eval("S.opts = ['head']; render();");
  assert.doesNotMatch(text('#app'), /−¥500/);
  assert.ok(d.querySelector('#cp-code'));
  w.eval("S.opts = []; render();");                       // 元に戻しても、自動で復活はしない(再度の適用が必要)
  assert.doesNotMatch(text('#app'), /−¥500/);
  type('#cp-code', 'WELCOME500'); click('[data-act=cpapply]'); await sleep(700);
  w.eval("S.info.email = 'other@example.com'; render();");
  assert.doesNotMatch(text('#app'), /−¥500/);
});

test('当日案内のメニューにはコード欄を出さない', async () => {
  const { w, d } = load('index.html');
  await sleep(30);
  w.eval(`S.menu = MENU.find(m => m.kind === 'omakase'); S.opts = []; S.omakase.mins = 60; S.date = '2099-01-05'; S.time = '10:00';
    Object.assign(S.info, {name:'テスト', kana:'てすと', tel:'09012345678', email:'a@example.com'}); S.screen = 'confirm'; render();`);
  assert.strictEqual(d.querySelector('#cp-code'), null);
});

async function submitWith(replyOnPost) {
  const bodies = [];
  const { w, click, type, text, d } = load('index.html', {
    replace: withGas,
    beforeParse(w) {
      w.fetch = async (u, opt) => {
        if (opt && opt.method === 'POST') {
          const b = JSON.parse(opt.body); bodies.push(b);
          if (b.action === 'couponCheck') return { json: async () => ({ ok: true, name: 'サーバー側の名前', discount: 500, total: 6500 }) };
          return { json: async () => replyOnPost };
        }
        return { json: async () => ({ ok: false }) };   // menu / availability は予備配列のまま
      };
    }
  });
  await sleep(50);
  toConfirm(w);
  type('#cp-code', 'CP-AAA111'); click('[data-act=cpapply]'); await sleep(100);
  await w.eval('submit()');
  return { bodies, w, text };
}

test('予約の送信 payload に couponCode が入る(適用中のみ)', async () => {
  const { bodies } = await submitWith({ ok: true, id: 'K2610110001' });
  const book = bodies.find(b => !b.action);
  assert.strictEqual(book.couponCode, 'CP-AAA111');
  assert.ok(!('couponTotal' in book) && !('discount' in book), 'クライアントの割引額は送らない');
  const chk = bodies.find(b => b.action === 'couponCheck');
  assert.deepStrictEqual([chk.code, chk.email, chk.menuId], ['CP-AAA111', 'a@example.com', 'aroma60']);
});

test('確定時にクーポンが無効になっていたら、適用を外して理由を表示する(予約は成功扱いにしない)', async () => {
  const { w, text } = await submitWith({ ok: false, error: 'coupon_used' });
  assert.match(text('#app'), /既にご利用済みです/);
  assert.strictEqual(w.eval('S.coupon'), null);
  assert.strictEqual(w.eval('S.screen'), 'confirm');
  assert.strictEqual(w.eval('S.result'), null);
});

test('クーポンを使わない通常の予約 payload には couponCode が無い', async () => {
  const bodies = [];
  const { w } = load('index.html', {
    replace: withGas,
    beforeParse(w) {
      w.fetch = async (u, opt) => {
        if (opt && opt.method === 'POST') { bodies.push(JSON.parse(opt.body)); return { json: async () => ({ ok: true, id: 'K1' }) }; }
        return { json: async () => ({ ok: false }) };
      };
    }
  });
  await sleep(50);
  toConfirm(w);
  await w.eval('submit()');
  assert.ok(!('couponCode' in bodies[0]));
});

test('応答待ちの間に内容を変えたら、古い割引は破棄される(応答は適用しない)', async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const { w, click, type, text, d } = load('index.html', {
    replace: withGas,
    beforeParse(w) {
      w.fetch = async (u, opt) => {
        if (opt && opt.method === 'POST') {
          const b = JSON.parse(opt.body);
          if (b.action === 'couponCheck') {
            await gate;
            return { json: async () => ({ ok: true, name: '古い計算', discount: 500, total: 6500 }) };
          }
          return { json: async () => ({ ok: true, id: 'K1' }) };
        }
        return { json: async () => ({ ok: false }) };
      };
    }
  });
  await sleep(50);
  toConfirm(w);
  type('#cp-code', 'CP-AAA111'); click('[data-act=cpapply]'); await sleep(30);
  w.eval("S.opts = ['head']; render();");      // 応答前にオプションを変える
  release(); await sleep(50);
  assert.strictEqual(w.eval('S.coupon'), null);
  assert.doesNotMatch(text('#app'), /−¥500/);
  assert.strictEqual(w.eval('S.couponBusy'), false);
  assert.ok(d.querySelector('#cp-code'));
});

test('応答待ちの間に何も変えなければ、通常どおり適用される', async () => {
  const { w, click, type, text } = load('index.html', {
    replace: withGas,
    beforeParse(w) {
      w.fetch = async (u, opt) => {
        if (opt && opt.method === 'POST') {
          await sleep(30);
          return { json: async () => ({ ok: true, name: 'サーバー側の名前', discount: 500, total: 6500 }) };
        }
        return { json: async () => ({ ok: false }) };
      };
    }
  });
  await sleep(50);
  toConfirm(w);
  type('#cp-code', 'CP-AAA111'); click('[data-act=cpapply]'); await sleep(150);
  assert.match(text('#app'), /−¥500/);
  assert.match(text('#app'), /¥6,500/);
});
