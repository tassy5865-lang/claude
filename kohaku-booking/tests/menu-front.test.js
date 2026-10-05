const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { load, sleep } = require('./helpers');

const norm = m => ({ id: m.id, name: m.name, min: m.min, price: m.price, desc: m.desc, cats: Array.from(m.cats), g: m.g, kind: m.kind || '' });
const GAS = 'https://gas.test/exec';
const withGas = [["GAS_URL: '',", `GAS_URL: '${GAS}',`]];

test('予備配列(index.html)は GAS の初期データ(表示ON)と一致する', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const ctx = vm.createContext({ console });
  vm.runInContext(src + '\n;this.__s = { SEED_MENU, SEED_OPTIONS };', ctx);
  const pub = JSON.parse(JSON.stringify(ctx.publicMenu_(ctx.parseMenuRows_(ctx.__s.SEED_MENU.map(r => r.map(String))), ctx.parseOptionRows_(ctx.__s.SEED_OPTIONS.map(r => r.map(String))))));
  const { w } = load('index.html');
  const fm = JSON.parse(w.eval('JSON.stringify(MENU)'));
  assert.deepStrictEqual(fm.map(norm), pub.menu.map(norm));
  const fo = JSON.parse(w.eval('JSON.stringify(OPTIONS)'));
  assert.deepStrictEqual(fo.map(o => [o.id, o.name, o.min, o.price]), pub.options.map(o => [o.id, o.name, o.min, o.price]));
});

test('menu API の内容でメニュー一覧が描画される / 読み込み中表示が出る', async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const { click, text } = load('index.html', {
    replace: withGas,
    beforeParse(w) {
      w.fetch = async (u) => {
        if (String(u).includes('action=menu')) {
          await gate;
          return { json: async () => ({ ok: true,
            menu: [{ id: 'sheet1', name: 'シートから来たメニュー', min: 50, price: 4321, desc: 'テスト', cats: ['aroma'], g: 'aroma', kind: '', order: 1 }],
            options: [{ id: 'o1', name: 'シートのオプション', min: 10, price: 700, order: 1 }] }) };
        }
        return { json: async () => ({ ok: true, busy: [] }) };
      };
    }
  });
  click('[data-act=cat][data-v=aroma]');
  assert.match(text(), /メニューを読み込み中/);
  release(); await sleep(100);
  assert.match(text(), /シートから来たメニュー/);
  assert.match(text(), /¥4,321/);
});

test('menu API が失敗したら予備配列で動く', async () => {
  const { click, text } = load('index.html', {
    replace: withGas,
    beforeParse(w) { w.fetch = async () => { throw new Error('offline'); }; }
  });
  await sleep(100);
  click('[data-act=cat][data-v=aroma]');
  assert.match(text(), /Relax アロマボディトリートメント/);
  assert.doesNotMatch(text(), /メニューを読み込み中/);
});

// 予約を最後(送信)まで進めるヘルパー
async function bookUntilSubmit({ click, type, d }, { opt = false } = {}) {
  await sleep(100);
  click('[data-act=cat][data-v=aroma]');
  click('[data-act=pick][data-v=aroma60]');
  if (opt) click('input[data-f=opt][value=head]');
  click('[data-act=next]'); await sleep(300);
  [...d.querySelectorAll('.day.ok')][0].click();
  [...d.querySelectorAll('.slot:not(:disabled)')][0].click();
  click('[data-act=next]');
  type('[data-k=name]', '山田 花子'); type('[data-k=kana]', 'ヤマダ ハナコ');
  type('[data-k=tel]', '090-1234-5678'); type('[data-k=email]', 'hanako@example.com');
  click('[data-act=next]');
  click('[data-act=submit]'); await sleep(300);
}
const stubFetch = onPost => w => {
  w.fetch = async (u, opt) => {
    if (String(u).includes('action=menu')) return { json: async () => ({ ok: false, error: 'menu_unavailable' }) };
    if (String(u).includes('action=availability')) return { json: async () => ({ ok: true, busy: [] }) };
    return { json: async () => onPost(JSON.parse(opt.body)) };
  };
};

test('送信ペイロードは menuId と optionIds を送り、total/menuName/options/minutes は送らない', async () => {
  let posted = null;
  const t = load('index.html', { replace: withGas, beforeParse: stubFetch(b => { posted = b; return { ok: true, id: 'K1' }; }) });
  await bookUntilSubmit(t, { opt: true });
  assert.ok(posted, '送信された');
  assert.strictEqual(posted.menuId, 'aroma60');
  assert.deepStrictEqual(posted.optionIds, ['head']);
  assert.ok(!('total' in posted) && !('menuName' in posted) && !('options' in posted) && !('minutes' in posted));
});

test('bad_menu が返ったら案内を出し、送信中のままにしない', async () => {
  const t = load('index.html', { replace: withGas, beforeParse: stubFetch(() => ({ ok: false, error: 'bad_menu' })) });
  await bookUntilSubmit(t);
  assert.match(t.text(), /現在ご予約いただけません/);
  const btn = t.d.querySelector('[data-act=submit]');
  assert.ok(btn && !btn.disabled);
});

test('admin: 予備配列は index.html の表示ON(おまかせを除く)と同じメニュー・料金', () => {
  const idx = load('index.html').w;
  const adm = load('admin.html').w;
  const im = JSON.parse(idx.eval('JSON.stringify(MENU)')).filter(m => m.kind !== 'omakase');
  const am = JSON.parse(adm.eval('JSON.stringify(MENU)'));
  assert.deepStrictEqual(am.map(m => [m.name, m.min, m.price]), im.map(m => [m.name, m.min, m.price]));
});

test('admin: menu API の内容が予約追加のメニュー選択に出る', async () => {
  const { click, type, d } = load('admin.html', {
    replace: [["GAS_URL:'',", `GAS_URL:'${GAS}',`]],
    beforeParse(w) {
      w.fetch = async (u, opt) => {
        if (String(u).includes('action=menu')) return { json: async () => ({ ok: true, menu: [
          { id: 's1', name: 'シートのメニュー', min: 50, price: 4321, kind: '', order: 1 },
          { id: 'omakase', name: 'おまかせ', min: 60, price: null, kind: 'omakase', order: 2 }], options: [] }) };
        const b = JSON.parse(opt.body);
        if (b.action === 'adminLogin') return { json: async () => ({ ok: true, token: 'T' }) };
        return { json: async () => ({ ok: true, reservations: [] }) };
      };
    }
  });
  await sleep(100);
  type('#pw', 'x'); click('[data-act=login]'); await sleep(300);
  click('[data-act=new]');
  const opts = [...d.querySelectorAll('#a-menu option')].map(o => o.textContent);
  assert.ok(opts.some(t => /シートのメニュー/.test(t)));
  assert.ok(!opts.some(t => /おまかせ/.test(t)), 'おまかせ(料金・時間が未確定)は管理画面の選択肢から除く');
});

test('最終レビュー: メニュー差し替え後、消えたオプションを持っていてもクラッシュせず、価格は新しい値になる', async () => {
  const t = load('index.html', {
    replace: withGas,
    beforeParse(w) {
      w.fetch = async (u) => ({ json: async () => String(u).includes('action=menu')
        ? { ok: true, menu: [{ id: 'aroma60', name: 'Relax', min: 60, price: 8000, desc: '', cats: ['aroma'], g: 'aroma', kind: '', order: 1 }], options: [{ id: 'head', name: '頭ほぐし', min: 10, price: 1500, order: 1 }] }
        : { ok: true, busy: [] } });
    }
  });
  await sleep(100);
  t.w.eval("S.menu = MENU.find(m => m.id === 'aroma60'); S.opts = ['foot']; S.screen = 'detail'");
  await t.w.eval('loadMenu()');
  assert.deepStrictEqual(JSON.parse(t.w.eval('JSON.stringify(S.opts)')), []);
  assert.strictEqual(t.w.eval('S.menu.price'), 8000);
  assert.deepStrictEqual(t.errors.filter(e => !/scrollTo/.test(e)), []);
});

test('最終レビュー: 表示ONが0件なら予備配列に戻さず空にする', async () => {
  const t = load('index.html', {
    replace: withGas,
    beforeParse(w) { w.fetch = async (u) => ({ json: async () => String(u).includes('action=menu') ? { ok: true, menu: [], options: [] } : { ok: true, busy: [] } }); }
  });
  await sleep(100);
  assert.strictEqual(t.w.eval('MENU.length'), 0);
});

test('最終レビュー: menu が応答しなくても8秒で予備配列に落ちる', async () => {
  const t = load('index.html', {
    replace: [...withGas, ['const MENU_TIMEOUT_MS = 8000;', 'const MENU_TIMEOUT_MS = 50;']],
    beforeParse(w) { w.fetch = () => new Promise(() => {}); }
  });
  await sleep(300);
  assert.strictEqual(t.w.eval('MENU_LOADING'), false);
  assert.ok(t.w.eval('MENU.length') > 0);
});

test('最終レビュー: bad_menu のあとの再取得は fresh=1(キャッシュ回避)', async () => {
  const urls = [];
  const t = load('index.html', {
    replace: withGas,
    beforeParse(w) {
      w.fetch = async (u, opt) => {
        urls.push(String(u));
        if (String(u).includes('action=menu')) return { json: async () => ({ ok: false, error: 'menu_unavailable' }) };
        if (String(u).includes('action=availability')) return { json: async () => ({ ok: true, busy: [] }) };
        return { json: async () => ({ ok: false, error: 'bad_menu' }) };
      };
    }
  });
  await bookUntilSubmit(t);
  await sleep(100);
  assert.ok(urls.some(u => u.includes('action=menu') && u.includes('fresh=1')));
});
