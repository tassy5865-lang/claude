const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const TODAY = '2026-10-11';
const j = o => JSON.parse(JSON.stringify(o));

// 予約シートの代わりに配列で持つ(1行目=見出し)
function fakeSheet(header) {
  const data = [header.slice()];
  return {
    data,
    getLastRow: () => data.length,
    getRange(r, c, nr, nc) {
      return {
        getValues: () => { const out = []; for (let i = 0; i < nr; i++) out.push((data[r - 1 + i] || []).slice(c - 1, c - 1 + nc)); return out; },
        setValues: vals => { vals.forEach((v, i) => { data[r - 1 + i] = v.slice(); }); },
        setNumberFormat: () => {}
      };
    },
    deleteRow: n => { data.splice(n - 1, 1); }
  };
}

function load() {
  const dir = path.join(__dirname, '..', 'gas');
  const src = fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8') + '\n' + fs.readFileSync(path.join(dir, 'TestSeed.gs'), 'utf8');
  const logs = [];
  const ctx = vm.createContext({
    console,
    Logger: { log: s => logs.push(String(s)) },
    Utilities: { formatDate: () => TODAY + 'T09:00:00' }
  });
  vm.runInContext(src + `
;this.__api = { HEADERS, STATUS, analyticsSummary_, parseRow_, seedAnalyticsTestData, clearAnalyticsTestData, setToday: t => { todayStr_ = () => t; }, setSheet: s => { getSheet_ = () => s; } };`, ctx);
  const g = ctx.__api;
  const sh = fakeSheet(g.HEADERS);
  g.setSheet(sh);
  g.setToday(TODAY);
  g.rows = () => sh.data.slice(1).map((v, i) => g.parseRow_(v, i));
  g.sh = sh; g.logs = logs;
  return g;
}

test('seedAnalyticsTestData: TESTA- の10行が入り、集計値が手順書の期待値と一致する', () => {
  const g = load();
  g.seedAnalyticsTestData();
  assert.strictEqual(g.sh.data.length, 11);
  assert.ok(g.sh.data.slice(1).every(v => String(v[0]).startsWith('TESTA-') && v.length === g.HEADERS.length));
  const rows = g.rows();

  const thisMonth = j(g.analyticsSummary_(rows, '2026-10-01', '2026-10-11', TODAY));
  assert.deepStrictEqual(thisMonth.summary, {
    sales: 26000, visits: 4, avgSpend: 8667, unpriced: 1,
    upcoming: { count: 1, amount: 7000 }, pending: 1, cancelled: 1, cancelRate: 1 / 7
  });
  assert.deepStrictEqual(thisMonth.byMenu.map(m => [m.name, m.visits, m.sales]), [
    ['疲労回復 アロマボディトリートメント', 1, 10000],
    ['満足 アロマボディトリートメント', 1, 9000],
    ['Relax アロマボディトリートメント', 1, 7000],
    ['おまかせ相談予約', 1, 0]
  ]);
  assert.deepStrictEqual(thisMonth.bySource.map(s => [s.key, s.visits, s.sales]), [
    ['admin', 1, 10000], ['instagram', 1, 9000], ['instagram_dm', 1, 7000], ['none', 1, 0]
  ]);
  assert.deepStrictEqual(thisMonth.visitType, {
    first: { visits: 1, sales: 7000 }, repeat: { visits: 2, sales: 19000 }, unknown: { visits: 1, sales: 0 }
  });

  const lastMonth = j(g.analyticsSummary_(rows, '2026-09-01', '2026-09-30', TODAY));
  assert.deepStrictEqual(lastMonth.summary, {
    sales: 16000, visits: 2, avgSpend: 8000, unpriced: 0,
    upcoming: { count: 0, amount: 0 }, pending: 0, cancelled: 0, cancelRate: 0
  });

  const three = j(g.analyticsSummary_(rows, '2026-08-01', '2026-10-11', TODAY));
  assert.strictEqual(three.series.unit, 'month');
  assert.deepStrictEqual(three.series.points.map(p => [p.key, p.sales, p.visits]), [
    ['2026-08', 11000, 1], ['2026-09', 16000, 2], ['2026-10', 26000, 4]
  ]);
  assert.deepStrictEqual([three.summary.sales, three.summary.visits, three.summary.avgSpend], [53000, 7, 8833]);
});

test('seedAnalyticsTestData: 二重実行しない / 月の1〜2日は実行しない', () => {
  const g = load();
  g.seedAnalyticsTestData();
  g.seedAnalyticsTestData();
  assert.strictEqual(g.sh.data.length, 11);
  assert.ok(g.logs.some(s => s.includes('clearAnalyticsTestData')));

  const g2 = load();
  g2.setToday('2026-10-02');
  g2.seedAnalyticsTestData();
  assert.strictEqual(g2.sh.data.length, 1);
});

test('clearAnalyticsTestData: TESTA- の行だけを消し、他の予約は残す', () => {
  const g = load();
  const real = new Array(g.HEADERS.length).fill('');
  real[0] = 'R-REAL-1'; real[2] = '確定'; real[3] = '2026-10-20';
  g.sh.data.push(real);
  g.seedAnalyticsTestData();
  g.sh.data.push(real.slice().map((x, i) => i === 0 ? 'R-REAL-2' : x));
  assert.strictEqual(g.sh.data.length, 13);
  g.clearAnalyticsTestData();
  assert.deepStrictEqual(g.sh.data.slice(1).map(v => v[0]), ['R-REAL-1', 'R-REAL-2']);
});
