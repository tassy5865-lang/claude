const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

function loadGas() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const ctx = vm.createContext({ console });
  vm.runInContext(src + '\n;this.__c = { HEADERS, CONFIG };', ctx);
  return Object.assign(ctx, ctx.__c);
}
const j = o => JSON.parse(JSON.stringify(o));
const TODAY = '2026-10-11';
const row = (o = {}) => Object.assign({ status: '来店済', date: '2026-10-05', total: 7000, menuName: 'Relax', refSource: '', source: 'web', visit: '再来' }, o);
const sum = (g, rows, from = '2026-10-01', to = '2026-10-31', today = TODAY) => j(g.analyticsSummary_(rows, from, to, today));

test('日付ヘルパー: addDaysStr_ / daysBetween_ / prevRange_(月またぎ・年またぎ・1日)', () => {
  const g = loadGas();
  assert.strictEqual(g.addDaysStr_('2026-10-01', -1), '2026-09-30');
  assert.strictEqual(g.addDaysStr_('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(g.addDaysStr_('2024-02-28', 1), '2024-02-29');
  assert.strictEqual(g.daysBetween_('2026-10-01', '2026-10-31'), 31);
  assert.strictEqual(g.daysBetween_('2026-10-11', '2026-10-11'), 1);
  assert.deepStrictEqual(j(g.prevRange_('2026-10-01', '2026-10-31')), { from: '2026-08-31', to: '2026-09-30' });
  assert.deepStrictEqual(j(g.prevRange_('2026-10-11', '2026-10-11')), { from: '2026-10-10', to: '2026-10-10' });
  assert.deepStrictEqual(j(g.prevRange_('2026-01-01', '2026-01-31')), { from: '2025-12-01', to: '2025-12-31' });
});

test('validateAnalyticsRange_: 実在する日付・順序・400日以内', () => {
  const g = loadGas();
  assert.strictEqual(g.validateAnalyticsRange_('2026-10-01', '2026-10-31'), '');
  assert.strictEqual(g.validateAnalyticsRange_('2026-10-11', '2026-10-11'), '');
  assert.strictEqual(g.validateAnalyticsRange_('2026-10-31', '2026-10-01'), 'bad_range');
  assert.strictEqual(g.validateAnalyticsRange_('2026-02-31', '2026-03-05'), 'bad_range');
  assert.strictEqual(g.validateAnalyticsRange_('2026/10/01', '2026-10-31'), 'bad_range');
  assert.strictEqual(g.validateAnalyticsRange_('', '2026-10-31'), 'bad_range');
  assert.strictEqual(g.validateAnalyticsRange_(undefined, undefined), 'bad_range');
  assert.strictEqual(g.validateAnalyticsRange_('2025-01-01', '2026-02-04'), '');          // ちょうど400日
  assert.strictEqual(g.validateAnalyticsRange_('2025-01-01', '2026-02-05'), 'bad_range'); // 401日
});

test('analyticsSummary_: 来店済だけが売上。確定・キャンセル・金額nullの扱い', () => {
  const g = loadGas();
  const rows = [
    row({ date: '2026-10-05', total: 7000 }),
    row({ date: '2026-10-10', total: 9000 }),
    row({ date: '2026-10-20', status: '確定', total: 6000 }),      // 今日(10-11)より後 → 見込み
    row({ date: '2026-10-08', status: '確定', total: 5000 }),      // 今日より前の確定 → 未処理
    row({ date: '2026-10-06', status: 'キャンセル', total: 4000 }),
    row({ date: '2026-10-07', total: null })                        // 来店済・金額未定
  ];
  const s = sum(g, rows).summary;
  assert.strictEqual(s.sales, 16000);
  assert.strictEqual(s.visits, 3);
  assert.strictEqual(s.avgSpend, 8000);                             // 16000 / 金額ありの2件
  assert.strictEqual(s.unpriced, 1);
  assert.deepStrictEqual(s.upcoming, { count: 1, amount: 6000 });
  assert.strictEqual(s.pending, 1);
  assert.strictEqual(s.cancelled, 1);
  assert.ok(Math.abs(s.cancelRate - 1 / 6) < 1e-9);                 // 1 /(来店済3 + 確定2 + キャンセル1)
});

test('analyticsSummary_: 割引後の合計金額(total)を使う', () => {
  const g = loadGas();
  const s = sum(g, [row({ total: 6500, couponCode: 'CP-X', couponDiscount: 500 })]).summary;
  assert.strictEqual(s.sales, 6500);
});

test('analyticsSummary_: 期間の境界日(from/to を含み、前日・翌日は含まない)', () => {
  const g = loadGas();
  const rows = ['2026-09-30', '2026-10-01', '2026-10-31', '2026-11-01'].map(d => row({ date: d, total: 1000 }));
  const r = sum(g, rows);
  assert.strictEqual(r.summary.visits, 2);
  assert.strictEqual(r.summary.sales, 2000);
});

test('analyticsSummary_: 今日の確定は見込み、昨日の確定は未処理', () => {
  const g = loadGas();
  const s = sum(g, [row({ status: '確定', date: TODAY, total: 3000 }), row({ status: '確定', date: '2026-10-10', total: 2000 })]).summary;
  assert.deepStrictEqual(s.upcoming, { count: 1, amount: 3000 });
  assert.strictEqual(s.pending, 1);
});

test('analyticsSummary_: 見込みの金額は null を含めない', () => {
  const g = loadGas();
  const s = sum(g, [row({ status: '確定', date: '2026-10-20', total: null }), row({ status: '確定', date: '2026-10-21', total: 4000 })]).summary;
  assert.deepStrictEqual(s.upcoming, { count: 2, amount: 4000 });
});

test('analyticsSummary_: 空の行リストは全てゼロ・null・空配列(NaNを出さない)', () => {
  const g = loadGas();
  const r = sum(g, []);
  assert.deepStrictEqual(r.summary, { sales: 0, visits: 0, avgSpend: null, unpriced: 0, upcoming: { count: 0, amount: 0 }, pending: 0, cancelled: 0, cancelRate: null });
  assert.deepStrictEqual(r.prev, { from: '2026-08-31', to: '2026-09-30', sales: 0, visits: 0 });
  assert.deepStrictEqual(r.byMenu, []);
  assert.deepStrictEqual(r.bySource, []);
  assert.deepStrictEqual(r.visitType, { first: { visits: 0, sales: 0 }, repeat: { visits: 0, sales: 0 }, unknown: { visits: 0, sales: 0 } });
  assert.strictEqual(r.series.unit, 'day');
  assert.strictEqual(r.series.points.length, 31);
  assert.ok(r.series.points.every(p => p.sales === 0 && p.visits === 0));
});

test('analyticsSummary_: 前期間の売上・来店数', () => {
  const g = loadGas();
  const rows = [row({ date: '2026-09-15', total: 3000 }), row({ date: '2026-09-20', total: 2000 }), row({ date: '2026-10-05', total: 7000 }), row({ date: '2026-08-30', total: 9999 })];
  const r = sum(g, rows);                                           // 前期間 = 2026-08-31 〜 2026-09-30
  assert.deepStrictEqual(r.prev, { from: '2026-08-31', to: '2026-09-30', sales: 5000, visits: 2 });
});

test('analyticsSummary_: 推移は期間内の全ての日をゼロで埋める(日別)', () => {
  const g = loadGas();
  const r = sum(g, [row({ date: '2026-10-02', total: 1000 }), row({ date: '2026-10-02', total: 500 })], '2026-10-01', '2026-10-03');
  assert.strictEqual(r.series.unit, 'day');
  assert.deepStrictEqual(r.series.points, [
    { key: '2026-10-01', sales: 0, visits: 0 }, { key: '2026-10-02', sales: 1500, visits: 2 }, { key: '2026-10-03', sales: 0, visits: 0 }]);
});

test('analyticsSummary_: 62日までは日別、63日からは月別(端の月も出る)', () => {
  const g = loadGas();
  assert.strictEqual(sum(g, [], '2026-08-01', '2026-10-01').series.unit, 'day');        // 62日
  const m = sum(g, [row({ date: '2026-08-20', total: 100 }), row({ date: '2026-10-02', total: 300 })], '2026-08-01', '2026-10-02');   // 63日
  assert.strictEqual(m.series.unit, 'month');
  assert.deepStrictEqual(m.series.points, [
    { key: '2026-08', sales: 100, visits: 1 }, { key: '2026-09', sales: 0, visits: 0 }, { key: '2026-10', sales: 300, visits: 1 }]);
  const y = sum(g, [], '2026-11-15', '2027-02-10');                                     // 年またぎ
  assert.deepStrictEqual(y.series.points.map(p => p.key), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('analyticsSummary_: メニュー別は売上降順→来店数降順→名前昇順', () => {
  const g = loadGas();
  const rows = [
    row({ menuName: 'B', total: 5000 }), row({ menuName: 'A', total: 5000 }),              // 同額・同数 → 名前順
    row({ menuName: 'C', total: 12000 }),
    row({ menuName: 'D', total: 2500 }), row({ menuName: 'D', total: 2500 }),              // 同額で来店数が多い → B/A より前
    row({ menuName: 'E', status: '確定', total: 99999 })                                    // 確定は含めない
  ];
  assert.deepStrictEqual(sum(g, rows).byMenu.map(m => [m.name, m.visits, m.sales]),
    [['C', 1, 12000], ['D', 2, 5000], ['A', 1, 5000], ['B', 1, 5000]]);
});

test('analyticsSummary_: 流入元別(admin / none / 各流入元)。件数0は出さず、売上降順', () => {
  const g = loadGas();
  const rows = [
    row({ refSource: 'instagram_dm', total: 8000 }), row({ refSource: 'instagram_dm', total: 2000 }),
    row({ refSource: '', source: 'admin', total: 3000 }),
    row({ refSource: '', source: 'web', total: 1000 }),
    row({ refSource: 'line', total: 12000 })
  ];
  assert.deepStrictEqual(sum(g, rows).bySource.map(s => [s.key, s.visits, s.sales]),
    [['line', 1, 12000], ['instagram_dm', 2, 10000], ['admin', 1, 3000], ['none', 1, 1000]]);
});

test('analyticsSummary_: 新規/再来(自己申告)。それ以外は unknown', () => {
  const g = loadGas();
  const rows = [row({ visit: '初回', total: 7000 }), row({ visit: '再来', total: 5000 }), row({ visit: '再来', total: 4000 }), row({ visit: '', total: 1000 })];
  assert.deepStrictEqual(sum(g, rows).visitType, {
    first: { visits: 1, sales: 7000 }, repeat: { visits: 2, sales: 9000 }, unknown: { visits: 1, sales: 1000 } });
});

/* ----- API の配線(フェイクシート) ----- */
function fakeSheet(headers, rows) {
  const data = [headers.slice()].concat(rows.map(r => r.slice()));
  return {
    data, getLastRow: () => data.length, getLastColumn: () => headers.length, getMaxColumns: () => 100, insertColumnsAfter() {},
    getRange(r, c, nr, nc) {
      return { getValues() { const out = []; for (let i = 0; i < nr; i++) out.push((data[r - 1 + i] || []).slice(c - 1, c - 1 + nc)); return out; } };
    }
  };
}
function resRow(o) {
  const v = new Array(28).fill('');
  v[0] = o.id; v[2] = o.status; v[3] = o.date; v[4] = '10:00'; v[5] = '11:00'; v[6] = o.menu || 'Relax'; v[8] = o.total; v[13] = 'secret@example.com';
  v[10] = '秘密 太郎'; v[12] = '09012345678'; v[14] = o.visit || '再来'; v[24] = o.ref || '';
  return v;
}
function gasWithRows(rows) {
  const g = loadGas();
  const sheets = { [g.CONFIG.SHEET_NAME]: fakeSheet(g.HEADERS, rows) };
  g.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] }) };
  g.CacheService = { getScriptCache: () => ({ get: k => (k === 'adm:tok' ? '1' : null), put() {}, remove() {} }) };
  g.Utilities = { formatDate: () => TODAY };
  return g;
}
const call = (g, extra) => j(g.handleAction_(Object.assign({ action: 'adminAnalytics', token: 'tok' }, extra)));

test('adminAnalytics: 予約シートを集計して返し、個人情報は含まない', () => {
  const g = gasWithRows([
    resRow({ id: 'K1', status: '来店済', date: '2026-10-05', total: '7000', ref: 'line' }),
    resRow({ id: 'K2', status: '確定', date: '2026-10-20', total: '9000' }),
    resRow({ id: 'K3', status: 'キャンセル', date: '2026-10-06', total: '5000' })
  ]);
  const r = call(g, { from: '2026-10-01', to: '2026-10-31' });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual([r.from, r.to, r.today], ['2026-10-01', '2026-10-31', TODAY]);
  assert.strictEqual(r.summary.sales, 7000);
  assert.strictEqual(r.summary.visits, 1);
  assert.deepStrictEqual(r.summary.upcoming, { count: 1, amount: 9000 });
  assert.deepStrictEqual(r.bySource.map(s => s.key), ['line']);
  const text = JSON.stringify(r);
  assert.ok(!text.includes('secret@example.com') && !text.includes('秘密') && !text.includes('09012345678'), '個人情報を返さない');
});

test('adminAnalytics: 期間が不正なら bad_range、トークン無しは auth', () => {
  const g = gasWithRows([]);
  assert.deepStrictEqual(call(g, { from: '2026-10-31', to: '2026-10-01' }), { ok: false, error: 'bad_range' });
  assert.deepStrictEqual(call(g, { from: '2025-01-01', to: '2026-02-05' }), { ok: false, error: 'bad_range' });
  assert.deepStrictEqual(call(g, {}), { ok: false, error: 'bad_range' });
  assert.deepStrictEqual(j(g.handleAction_({ action: 'adminAnalytics', from: '2026-10-01', to: '2026-10-31' })), { ok: false, error: 'auth' });
});
