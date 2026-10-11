const test = require('node:test');
const assert = require('node:assert');
const { load, sleep } = require('./helpers');

const open = async () => {
  const t = load('admin.html');
  t.type('#pw', 'demo'); t.click('[data-act=login]'); await sleep(1000);
  t.click('[data-act=section][data-v=analytics]'); await sleep(700);
  return t;
};
const num = s => Number(String(s).replace(/[^\d.-]/g, ''));
const expected = (w, from, to) => JSON.parse(w.eval(`JSON.stringify((() => {
  const v = demo.filter(r => r.status === '来店済' && r.date >= '${from}' && r.date <= '${to}');
  return {visits: v.length, sales: v.reduce((s, r) => s + (r.total || 0), 0)};
})())`));

test('分析: 初期表示(今月)のサマリーが予約データの来店済の件数・合計と一致する', async () => {
  const { w, d, errors } = await open();
  const today = w.eval('TODAY');
  const e = expected(w, today.slice(0, 8) + '01', today);
  assert.ok(d.querySelector('#ana-summary'), 'サマリーが出る');
  assert.strictEqual(num(d.querySelector('#ana-visits').textContent), e.visits);
  assert.strictEqual(num(d.querySelector('#ana-sales').textContent), e.sales);
  assert.doesNotMatch(d.querySelector('main').textContent, /NaN|Infinity|undefined/);
  assert.deepStrictEqual(errors, []);
});

test('分析: 期間チップで先月・直近3か月・今年に切り替わり、数値が一致する', async () => {
  const { w, d, click, errors } = await open();
  const today = w.eval('TODAY');
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  const pad = n => String(n).padStart(2, '0');
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  click('[data-act=anaperiod][data-v=last]'); await sleep(700);
  let e = expected(w, `${py}-${pad(pm)}-01`, `${py}-${pad(pm)}-${pad(lastDay)}`);
  assert.strictEqual(num(d.querySelector('#ana-visits').textContent), e.visits);
  assert.strictEqual(d.querySelector('[data-act=anaperiod][data-v=last]').getAttribute('aria-pressed'), 'true');

  click('[data-act=anaperiod][data-v=q]'); await sleep(700);
  let qy = y, qm = m - 2; if (qm < 1) { qm += 12; qy--; }
  e = expected(w, `${qy}-${pad(qm)}-01`, today);
  assert.strictEqual(num(d.querySelector('#ana-visits').textContent), e.visits);
  assert.ok(d.querySelector('.abars'), '推移の棒グラフが出る');

  click('[data-act=anaperiod][data-v=year]'); await sleep(700);
  e = expected(w, `${y}-01-01`, today);
  assert.strictEqual(num(d.querySelector('#ana-sales').textContent), e.sales);
  assert.deepStrictEqual(errors, []);
});

test('分析: 期間指定。該当なしは「予約はありません」、逆順・400日超はエラー表示', async () => {
  const { d, click, type, text, errors } = await open();
  type('#ana-from', '2000-01-01'); type('#ana-to', '2000-01-31');
  click('[data-act=anacustom]'); await sleep(700);
  assert.match(text('main'), /この期間の予約はありません/);
  assert.doesNotMatch(d.querySelector('main').textContent, /NaN|Infinity/);
  assert.match(d.querySelector('#ana-visits').textContent, /0/);

  type('#ana-from', '2026-10-31'); type('#ana-to', '2026-10-01');
  click('[data-act=anacustom]'); await sleep(700);
  assert.match(text('main'), /期間は400日以内で、開始日から終了日の順に指定してください/);

  type('#ana-from', '2024-01-01'); type('#ana-to', '2026-01-01');
  click('[data-act=anacustom]'); await sleep(700);
  assert.match(text('main'), /期間は400日以内で/);
  assert.deepStrictEqual(errors, []);
});

test('分析: 過去日付の確定は「未処理」として注意表示し、売上に入れない', async () => {
  const { w, d, click, type, text, errors } = await open();
  // 過去の来店済を1件「確定」に戻し、その日から今日までを期間指定で表示する
  const date = w.eval(`(() => { const r = demo.find(x => x.status === '来店済' && x.date < TODAY); r.status = '確定'; return r.date; })()`);
  const today = w.eval('TODAY');
  type('#ana-from', date); type('#ana-to', today);
  click('[data-act=anacustom]'); await sleep(700);
  assert.match(text('main'), /来店済になっていません/);
  const e = expected(w, date, today);                                   // 確定に戻した1件は来店済ではないので含まれない
  assert.strictEqual(num(d.querySelector('#ana-visits').textContent), e.visits);
  assert.strictEqual(num(d.querySelector('#ana-sales').textContent), e.sales);
  assert.deepStrictEqual(errors, []);
});

test('分析: メニュー名・流入元の HTML をエスケープする', async () => {
  const { w, d, click, type, errors } = await open();
  const from = w.eval(`(() => { const r = demo.find(x => x.status === '来店済'); r.menuName = '<img src=x onerror=window.__pwned=1>'; r.refSource = '<b>x</b>'; return r.date; })()`);
  type('#ana-from', from); type('#ana-to', w.eval('TODAY'));
  click('[data-act=anacustom]'); await sleep(700);
  assert.strictEqual(w.__pwned, undefined);
  assert.strictEqual(d.querySelector('main img'), null);
  assert.ok(d.body.textContent.includes('<img src=x'), 'メニュー名が文字としてそのまま表示される');
  assert.ok(d.body.textContent.includes('<b>x</b>'), '流入元キーも文字としてそのまま表示される');
  assert.deepStrictEqual(errors, []);
});

test('分析: ナビに「分析」があり、画面が切り替わる', async () => {
  const { d } = await open();
  assert.ok(d.querySelector('.side [data-act=section][data-v=analytics]'));
  assert.strictEqual(d.querySelector('.side [data-v=analytics]').getAttribute('aria-selected'), 'true');
});
