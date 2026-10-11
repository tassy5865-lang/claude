const test = require('node:test');
const assert = require('node:assert');
const { load, sleep } = require('./helpers');

const GAS = 'https://gas.test/exec';
const withGas = [["GAS_URL: '',", `GAS_URL: '${GAS}',`]];
const at = qs => ({ url: 'https://example.test/' + qs });
const ref = w => JSON.parse(w.eval('JSON.stringify(S.ref)'));

test('有効な source / inquiry / menu が S.ref に入り、メニュー選択済みの詳細画面から始まる', async () => {
  const { w, text } = load('index.html', at('?source=instagram_dm&inquiry=IG-00125&menu=aroma60'));
  await sleep(50);
  assert.deepStrictEqual(ref(w), { source: 'instagram_dm', inquiry: 'IG-00125', menu: 'aroma60' });
  assert.strictEqual(w.eval('S.screen'), 'detail');
  assert.match(text('#app'), /Relax/);
});

test('不正な値は無視され、通常のトップから始まる', async () => {
  const bad = '?source=twitter&inquiry=' + encodeURIComponent('<script>alert(1)</script>') + '&menu=' + encodeURIComponent('<b>');
  const { w, errors } = load('index.html', at(bad));
  await sleep(50);
  assert.deepStrictEqual(ref(w), { source: '', inquiry: '', menu: '' });
  assert.strictEqual(w.eval('S.screen'), 'top');
  assert.deepStrictEqual(errors, []);
});

test('存在しないメニューIDは無視され、source だけ記録される', async () => {
  const { w } = load('index.html', at('?source=line&menu=nothing'));
  await sleep(50);
  assert.strictEqual(w.eval('S.screen'), 'top');
  assert.strictEqual(ref(w).source, 'line');
});

test('33文字以上の問い合わせIDは無視される', async () => {
  const { w } = load('index.html', at('?source=line&inquiry=' + 'a'.repeat(33)));
  assert.strictEqual(ref(w).inquiry, '');
});

test('LIFF経由(liff.state)でも解釈される', async () => {
  const { w } = load('index.html', at('?liff.state=' + encodeURIComponent('?source=line&inquiry=L-1&menu=aroma80')));
  await sleep(50);
  assert.deepStrictEqual(ref(w), { source: 'line', inquiry: 'L-1', menu: 'aroma80' });
  assert.strictEqual(w.eval('S.screen'), 'detail');
});

async function submitWith(qs) {
  const bodies = [];
  const { w } = load('index.html', {
    ...at(qs), replace: withGas,
    beforeParse(w) {
      w.fetch = async (u, opt) => {
        if (opt && opt.method === 'POST') { bodies.push(JSON.parse(opt.body)); return { json: async () => ({ ok: true, id: 'K2610110001' }) }; }
        return { json: async () => ({ ok: false }) };   // menu / availability は予備配列のまま
      };
    }
  });
  await sleep(50);
  w.eval(`S.menu = MENU.find(m => m.id === 'aroma60'); S.date = '2099-01-05'; S.time = '10:00';
          Object.assign(S.info, {name:'テスト 太郎', kana:'てすと たろう', tel:'09012345678', email:'a@example.com'}); S.screen = 'confirm';`);
  await w.eval('submit()');
  return { bodies, w };
}

test('予約の送信 payload に source / inquiry が入り、送信後は記憶が消える', async () => {
  const { bodies, w } = await submitWith('?source=instagram_dm&inquiry=IG-1&menu=aroma60');
  assert.strictEqual(bodies.length, 1);
  assert.strictEqual(bodies[0].source, 'instagram_dm');
  assert.strictEqual(bodies[0].inquiry, 'IG-1');
  assert.strictEqual(bodies[0].menuId, 'aroma60');
  assert.strictEqual(w.sessionStorage.getItem('kohaku_ref'), null);
});

test('パラメータが無いときは payload に source / inquiry を付けない', async () => {
  const { bodies } = await submitWith('');
  assert.strictEqual(bodies.length, 1);
  assert.ok(!('source' in bodies[0]));
  assert.ok(!('inquiry' in bodies[0]));
});
