# 売上・来店分析 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理画面に「分析」画面を追加し、期間を選んで売上(実績)・来店数・客単価・見込み・キャンセル率・前期間比・推移・メニュー別・流入元別・新規/再来を確認できるようにする。

**Architecture:** 集計は GAS の純関数 `analyticsSummary_(rows, from, to, today)` に切り出し、読み取り専用の管理API `adminAnalytics` で公開する(個人情報は返さない)。管理画面は既存の `NAV` / `VIEWS` に「分析」を足し、棒グラフは外部ライブラリなしでCSSの幅/高さで描く。デモ表示は `demo` 予約から画面内で同じ定義の集計を行う。

**Tech Stack:** Google Apps Script、バニラJS(単一HTML)、`node --test` + jsdom、Node `vm`(GASの純関数テスト)

**Spec:** `docs/superpowers/specs/2026-10-11-analytics-design.md`

## Global Constraints
- **シートの列・既存データは変更しない**(読み取り専用の集計。`setup` の再実行は不要)
- 売上(実績)= 状態 `来店済` の予約の `合計金額`(割引後)の合計。金額 `null`(当日案内)は売上・客単価の分母に含めず `unpriced` に数える。`確定` / `キャンセル` は売上に入れない
- 集計の単位は予約の**日付**。期間は `from`〜`to` を両端含む(JSTの日付文字列)。今日(`today`)の `確定` は見込み、今日より前の `確定` は未処理
- キャンセル率 = キャンセル ÷(来店済 + 確定 + キャンセル)。分母0は `null`。客単価 = 売上 ÷ 金額あり来店数(四捨五入の整数)、0件は `null`。前期間比は前期間が0なら「—」
- 前期間 = `from` の前日を終端とする同じ日数の期間。日付の加減算は UTC の日付文字列で行う(タイムゾーンずれを避ける)
- 推移: 期間が62日以内なら `day`、超えれば `month`。期間内の全ての日/月をデータが無くてもゼロで埋める(月別は端の月も含める)
- 期間の検証: 両方が実在する `YYYY-MM-DD`、`from <= to`、400日以内。違反は `{ok:false, error:'bad_range'}`
- `byMenu` は売上降順 → 来店数降順 → 名前昇順。`bySource` は売上降順 → 来店数降順 → キー昇順。流入元キーは `instagram_dm / instagram / line / web / other`(`refSource`)、空なら受付経路 `admin` →`admin`、それ以外→`none`。件数0のキーは返さない
- `visitType`: 予約時の自己申告 `初回`→`first` / `再来`→`repeat` / それ以外→`unknown`(来店済のみ)
- 管理系APIは `adminAuth_` 必須。個人情報(名前・連絡先)は返さない。画面は `esc()` で描画、金額は `yen()`、`null` や0除算は「—」(NaN/Infinity を画面に出さない)
- フロントは依存なしのバニラJS単一HTML。デザイントークン: cream `#F6EFE3` / paper `#FFFCF7` / sand `#EADBC3` / caramel `#B58553` / brown `#6E5238` / ink `#33261C` / moss `#44593F` / danger `#A5473A`
- コミットは**対象パスを明示**(`git add -A` 禁止)。メッセージ末尾に `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- 作業ディレクトリは `kohaku-booking/`。テストは `npm test`、GAS構文は `npm run check:gas`
- vm で読んだ GAS の配列/オブジェクトは別レルム。テストでは `JSON.parse(JSON.stringify(x))` か `Array.from` を通してから `deepStrictEqual` する。bash のヒアドキュメントは引用符で壊れることがあるので、追記・置換スクリプトは Write ツールでファイルに書いて実行する(Python は `r"""..."""` を使う)

## Review Focus
1. **来店済だけが売上に入る**: 確定・キャンセルが混ざらない。金額 `null` の来店が合計を壊さない(NaN にならない)(→ Task 1)
2. **期間・日付の境界**: `from` / `to` の当日を含み前後日を含まない。今日の確定は見込み、昨日の確定は未処理。月またぎ・年またぎの前期間(→ Task 1)
3. **日別/月別の切替境界とゼロ埋め**: 62日は日別、63日は月別。期間の端の月も出る(→ Task 1)
4. **0除算の表示**: 客単価・キャンセル率・前期間比が、データ無しの期間で NaN / Infinity / 「¥NaN」を画面に出さない(→ Task 1・2)
5. **メニュー名・流入元の HTML エスケープと期間の不正入力**(逆順・400日超・空)(→ Task 1・2)

## 事前条件
着手前に、未コミットの設計書 `docs/superpowers/specs/2026-10-11-analytics-design.md` と本計画書をコミットしておく。

---

## File Structure
| ファイル | 役割 | 変更 |
|---|---|---|
| `gas/Code.gs` | 期間ヘルパー・集計の純関数・`adminAnalytics` API | Task 1 |
| `admin.html` | 「分析」画面(期間・サマリー・推移・内訳)とデモ集計 | Task 2 |
| `tests/gas-analytics.test.js` | GASの集計・期間検証・API配線のテスト(新規) | Task 1 |
| `tests/admin-analytics.test.js` | 管理画面の分析画面のテスト(新規) | Task 2 |
| `CLAUDE.md` / `docs/deploy-checklist.md` | ドキュメント | Task 3 |

---

### Task 1: GAS 集計の純関数と `adminAnalytics` API

**Files:**
- Modify: `gas/Code.gs`(`adminCouponSave_` の後ろに追加、`handleAction_` に case を追加)
- Create: `tests/gas-analytics.test.js`

**Interfaces:**
- Consumes: 既存の `STATUS` / `isRealDate_`(クーポンブロック)/ `allRows_` / `todayStr_` / `adminAuth_`
- Produces(Task 2 のデモが同じ形を再現する):
  - `addDaysStr_(ds, n) → 'YYYY-MM-DD'`、`daysBetween_(from, to) → number`(両端を含む日数)
  - `prevRange_(from, to) → {from, to}`
  - `validateAnalyticsRange_(from, to) → ''|'bad_range'`
  - `analyticsSummary_(rows, from, to, today) → {summary, prev, series, byMenu, bySource, visitType}`
  - `adminAnalytics_(d) → {ok:true, from, to, today, summary, prev, series, byMenu, bySource, visitType} | {ok:false, error:'bad_range'}`
  - `handleAction_` の `adminAnalytics`
  - 戻り値の形:
    ```
    summary:{ sales, visits, avgSpend, unpriced, upcoming:{count, amount}, pending, cancelled, cancelRate }
    prev:{ from, to, sales, visits }
    series:{ unit:'day'|'month', points:[{key, sales, visits}] }
    byMenu:[{name, visits, sales}]
    bySource:[{key, visits, sales}]
    visitType:{ first:{visits,sales}, repeat:{visits,sales}, unknown:{visits,sales} }
    ```

- [ ] **Step 1: 失敗するテストを書く**

`tests/gas-analytics.test.js` を新規作成:
```js
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/gas-analytics.test.js`
Expected: FAIL(`addDaysStr_` などが未定義)

- [ ] **Step 3: 実装する(`gas/Code.gs`)**

`adminCouponSave_` の定義の**直後**に追加:
```js
/* =========================================================
 * 売上・来店分析(管理画面)
 *  予約シートを集計するだけ(読み取り専用・個人情報は返さない)。
 *  売上=状態「来店済」の合計金額(割引後)。確定は見込み、過去日付の確定は未処理。
 * ========================================================= */

/** 'YYYY-MM-DD' に n 日足す(UTCの日付として計算。タイムゾーンずれを避ける) */
function addDaysStr_(ds, n) {
  return new Date(new Date(ds + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
}
/** from〜to の日数(両端を含む) */
function daysBetween_(from, to) {
  return Math.round((new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86400000) + 1;
}
/** 直前の同じ長さの期間 */
function prevRange_(from, to) {
  const n = daysBetween_(from, to);
  return { from: addDaysStr_(from, -n), to: addDaysStr_(from, -1) };
}
/** 期間の検証: 実在する日付・from<=to・400日以内。問題なければ '' */
function validateAnalyticsRange_(from, to) {
  if (!isRealDate_(strOf_(from)) || !isRealDate_(strOf_(to))) return 'bad_range';
  if (from > to || daysBetween_(from, to) > 400) return 'bad_range';
  return '';
}
function monthKeys_(from, to) {
  const out = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push(y + '-' + (m < 10 ? '0' : '') + m);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** 期間内の来店済の売上・来店数だけ(前期間の比較用) */
function visitedTotals_(rows, from, to) {
  let sales = 0, visits = 0;
  rows.forEach(function (r) {
    if (r.status === STATUS.VISITED && r.date >= from && r.date <= to) { visits++; sales += r.total || 0; }
  });
  return { sales: sales, visits: visits };
}

/** 集計(純関数)。rows は parseRow_ の結果、today は JST の 'YYYY-MM-DD' */
function analyticsSummary_(rows, from, to, today) {
  const mine = rows.filter(function (r) { return r.date >= from && r.date <= to; });
  const visited = mine.filter(function (r) { return r.status === STATUS.VISITED; });
  const priced = visited.filter(function (r) { return r.total !== null && r.total !== undefined; });
  const sales = priced.reduce(function (s, r) { return s + r.total; }, 0);
  const confirmed = mine.filter(function (r) { return r.status === STATUS.CONFIRMED; });
  const upcomingRows = confirmed.filter(function (r) { return r.date >= today; });
  const cancelled = mine.filter(function (r) { return r.status === STATUS.CANCELLED; }).length;
  const denom = visited.length + confirmed.length + cancelled;

  const unit = daysBetween_(from, to) <= 62 ? 'day' : 'month';
  const keys = [];
  if (unit === 'day') { for (let i = 0, n = daysBetween_(from, to); i < n; i++) keys.push(addDaysStr_(from, i)); }
  else { monthKeys_(from, to).forEach(function (k) { keys.push(k); }); }
  const pts = {};
  keys.forEach(function (k) { pts[k] = { key: k, sales: 0, visits: 0 }; });
  visited.forEach(function (r) {
    const p = pts[unit === 'day' ? r.date : r.date.slice(0, 7)];
    p.visits++; p.sales += r.total || 0;
  });

  const group = function (keyOf) {
    const map = {}, order = [];
    visited.forEach(function (r) {
      const k = keyOf(r);
      if (!map[k]) { map[k] = { key: k, visits: 0, sales: 0 }; order.push(k); }
      map[k].visits++; map[k].sales += r.total || 0;
    });
    return order.map(function (k) { return map[k]; });
  };
  const bySales = function (a, b) { return (b.sales - a.sales) || (b.visits - a.visits); };
  const byMenu = group(function (r) { return r.menuName; }).sort(function (a, b) {
    return bySales(a, b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  }).map(function (o) { return { name: o.key, visits: o.visits, sales: o.sales }; });
  const bySource = group(function (r) { return r.refSource || (r.source === 'admin' ? 'admin' : 'none'); }).sort(function (a, b) {
    return bySales(a, b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  });
  const visitType = { first: { visits: 0, sales: 0 }, repeat: { visits: 0, sales: 0 }, unknown: { visits: 0, sales: 0 } };
  visited.forEach(function (r) {
    const o = visitType[r.visit === '初回' ? 'first' : r.visit === '再来' ? 'repeat' : 'unknown'];
    o.visits++; o.sales += r.total || 0;
  });

  const pr = prevRange_(from, to), pt = visitedTotals_(rows, pr.from, pr.to);
  return {
    summary: {
      sales: sales, visits: visited.length,
      avgSpend: priced.length ? Math.round(sales / priced.length) : null,
      unpriced: visited.length - priced.length,
      upcoming: { count: upcomingRows.length, amount: upcomingRows.reduce(function (s, r) { return s + (r.total || 0); }, 0) },
      pending: confirmed.length - upcomingRows.length,
      cancelled: cancelled,
      cancelRate: denom ? cancelled / denom : null
    },
    prev: { from: pr.from, to: pr.to, sales: pt.sales, visits: pt.visits },
    series: { unit: unit, points: keys.map(function (k) { return pts[k]; }) },
    byMenu: byMenu, bySource: bySource, visitType: visitType
  };
}

function adminAnalytics_(d) {
  const err = validateAnalyticsRange_(d.from, d.to);
  if (err) return { ok: false, error: err };
  const res = analyticsSummary_(allRows_(), d.from, d.to, todayStr_());
  return Object.assign({ ok: true, from: d.from, to: d.to, today: todayStr_() }, res);
}
```
`handleAction_` の `case 'adminCouponSave':` の行の下に追加:
```js
    case 'adminAnalytics':  return adminAuth_(d) ? adminAnalytics_(d) : { ok: false, error: 'auth' };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/gas-analytics.test.js && npm test && npm run check:gas`
Expected: 新規テスト全て PASS、既存も全て PASS、`syntax OK`

- [ ] **Step 5: コミット**
```bash
git add gas/Code.gs tests/gas-analytics.test.js
git commit -m "kohaku-booking: 売上・来店分析の集計(純関数)と adminAnalytics API を追加"
```

---

### Task 2: 管理画面「分析」

**Files:**
- Modify: `admin.html`(CSS、デモ集計、状態・画面・ハンドラ、`logout`)
- Create: `tests/admin-analytics.test.js`

**Interfaces:**
- Consumes: Task 1 の `adminAnalytics`(上記の戻り値の形)、既存の `NAV` / `VIEWS` / `esc` / `yen` / `api` / `render` / `logout` / `demo` / `TODAY` / `addDays` / `pad` / `daysIn` / `SRC_LABEL` / `A`
- Produces: `A.ana`(状態)、`anaView()`、`anaRange(key)`、`demoAnalytics(from, to)`

- [ ] **Step 1: 失敗するテストを書く**

`tests/admin-analytics.test.js` を新規作成:
```js
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
  assert.doesNotMatch(d.body.textContent, /NaN|Infinity|undefined/);
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
  assert.doesNotMatch(d.body.textContent, /NaN|Infinity/);
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/admin-analytics.test.js`
Expected: FAIL(`[data-v=analytics]` が無い)

- [ ] **Step 3: 実装する(`admin.html`)**

3-1. CSS: `.tag.st-expired,...` の行の下に追加:
```css
/* analytics */
.arange{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 16px 0}
.arange input{min-height:40px;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:#fff;font-size:15px}
.arange .btn{width:auto;padding:8px 16px}
.anote{margin:12px 16px 0;padding:10px 14px;border-radius:6px;background:#FFF4E0;color:var(--brown);font-size:13.5px}
.abars{display:flex;align-items:flex-end;gap:2px;height:120px;padding:0 16px;margin-top:8px}
.abar{flex:1;height:100%;display:flex;align-items:flex-end}
.abar i{display:block;width:100%;background:var(--caramel);border-radius:2px 2px 0 0;min-height:1px}
.aaxis{display:flex;justify-content:space-between;padding:4px 16px 0;font-size:12px;color:var(--muted)}
.arow{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--line);font-size:14px}
.arow .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.arow .bar{height:10px;background:var(--sand);border-radius:99px;overflow:hidden}
.arow .bar i{display:block;height:100%;background:var(--caramel)}
.arow .v{text-align:right;color:var(--muted);font-size:13px;white-space:nowrap}
.stat small + b + small{margin-top:2px}
```

3-2. デモ集計。`const demoCoupons = [` の行の**前**に追加:
```js
/** デモ表示の分析(demo 予約から画面内で集計。GAS の analyticsSummary_ と同じ定義) */
function demoAnalytics(from, to){
  const dayN = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5) + 1;
  const okDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T00:00:00Z'));
  if(!okDate(from) || !okDate(to) || from > to || dayN(from, to) > 400) return {ok:false, error:'bad_range'};
  const totals = (a, b) => { const v = demo.filter(r => r.status === '来店済' && r.date >= a && r.date <= b); return {sales:v.reduce((s, r) => s + (r.total || 0), 0), visits:v.length}; };
  const mine = demo.filter(r => r.date >= from && r.date <= to);
  const visited = mine.filter(r => r.status === '来店済'), priced = visited.filter(r => r.total != null);
  const sales = priced.reduce((s, r) => s + r.total, 0);
  const conf = mine.filter(r => r.status === '確定'), upc = conf.filter(r => r.date >= TODAY);
  const cancelled = mine.filter(r => r.status === 'キャンセル').length, denom = visited.length + conf.length + cancelled;
  const n = dayN(from, to), unit = n <= 62 ? 'day' : 'month', keys = [];
  if(unit === 'day'){ for(let i = 0; i < n; i++) keys.push(addDays(from, i)); }
  else { let y = +from.slice(0, 4), m = +from.slice(5, 7); const ey = +to.slice(0, 4), em = +to.slice(5, 7); while(y < ey || (y === ey && m <= em)){ keys.push(`${y}-${pad(m)}`); if(++m > 12){ m = 1; y++; } } }
  const pts = Object.fromEntries(keys.map(k => [k, {key:k, sales:0, visits:0}]));
  visited.forEach(r => { const p = pts[unit === 'day' ? r.date : r.date.slice(0, 7)]; p.visits++; p.sales += r.total || 0; });
  const group = keyOf => { const g = new Map(); visited.forEach(r => { const k = keyOf(r), o = g.get(k) || {key:k, visits:0, sales:0}; o.visits++; o.sales += r.total || 0; g.set(k, o); }); return [...g.values()]; };
  const cmp = (a, b) => (b.sales - a.sales) || (b.visits - a.visits) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const byMenu = group(r => r.menuName).sort(cmp).map(o => ({name:o.key, visits:o.visits, sales:o.sales}));
  const bySource = group(r => r.refSource || (r.source === 'admin' ? 'admin' : 'none')).sort(cmp);
  const vt = {first:{visits:0, sales:0}, repeat:{visits:0, sales:0}, unknown:{visits:0, sales:0}};
  visited.forEach(r => { const o = vt[r.visit === '初回' ? 'first' : r.visit === '再来' ? 'repeat' : 'unknown']; o.visits++; o.sales += r.total || 0; });
  const pr = {from:addDays(from, -n), to:addDays(from, -1)};
  return {ok:true, from, to, today:TODAY,
    summary:{sales, visits:visited.length, avgSpend:priced.length ? Math.round(sales / priced.length) : null, unpriced:visited.length - priced.length,
      upcoming:{count:upc.length, amount:upc.reduce((s, r) => s + (r.total || 0), 0)}, pending:conf.length - upc.length, cancelled, cancelRate:denom ? cancelled / denom : null},
    prev:{...pr, ...totals(pr.from, pr.to)}, series:{unit, points:keys.map(k => pts[k])}, byMenu, bySource, visitType:vt};
}
```
`api()` のデモ分岐(`case 'adminCoupons': ...` の行の上)に追加:
```js
    case 'adminAnalytics': return demoAnalytics(extra.from, extra.to);
```

3-3. 画面。`NAV.push(['coupon','クーポン']);` の**直後**に追加:
```js
/* ---------- 売上・来店分析 ---------- */
const ANA_SRC = {...SRC_LABEL, admin:'管理画面から登録(電話など)', none:'流入元の記録なし'};
const ANA_PERIODS = [['month','今月'], ['last','先月'], ['q','直近3か月'], ['year','今年']];
function newAna(){ return {period:'month', from:'', to:'', cfrom:'', cto:'', data:null, loading:false, failed:false, err:''}; }
A.ana = newAna();
/** 期間チップ → {from, to}(JSTの今日 TODAY を基準にする) */
function anaRange(key){
  const y = +TODAY.slice(0, 4), m = +TODAY.slice(5, 7);
  const first = (yy, mm) => `${yy}-${pad(mm)}-01`;
  if(key === 'month') return {from:first(y, m), to:TODAY};
  if(key === 'last'){ const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; return {from:first(py, pm), to:`${py}-${pad(pm)}-${pad(daysIn(py, pm - 1))}`}; }
  if(key === 'q'){ let yy = y, mm = m - 2; if(mm < 1){ mm += 12; yy--; } return {from:first(yy, mm), to:TODAY}; }
  return {from:`${y}-01-01`, to:TODAY};   // 'year'
}
function ensureAna(){
  const N = A.ana;
  if(N.data || N.loading || N.failed) return;
  if(!N.from){ const r = anaRange(N.period); N.from = r.from; N.to = r.to; }
  N.loading = true;
  const key = N.from + '~' + N.to;
  api('adminAnalytics', {from:N.from, to:N.to}).then(j => {
    if(!j.ok){ if(j.error === 'auth'){ logout(true); return; } throw new Error(j.error); }
    if(key === A.ana.from + '~' + A.ana.to) N.data = j;   // 期間が切り替わっていたら捨てる(次の描画で取り直す)
  }).catch(e => { N.failed = true; N.err = e && e.message; }).finally(() => { N.loading = false; render(); });
}
const pctText = v => v == null ? '—' : (Math.round(v * 1000) / 10) + '%';
const deltaText = (cur, prev) => prev ? ((cur >= prev ? '+' : '') + (Math.round((cur - prev) / prev * 1000) / 10) + '%') : '—';
function anaRowsHTML(list, labelOf){
  if(!list.length) return '<p class="empty" style="padding:14px">該当はありません。</p>';
  const max = Math.max(1, ...list.map(o => o.sales));
  return list.map(o => `<div class="arow"><span class="nm">${esc(labelOf(o))}</span><span class="bar"><i style="width:${Math.round(o.sales / max * 100)}%"></i></span>
    <span class="v">${yen(o.sales)} / ${o.visits}件</span></div>`).join('');
}
function anaView(){
  ensureAna();
  const N = A.ana;
  const chips = ANA_PERIODS.map(([k, l]) => `<button class="chip" aria-pressed="${N.period === k}" data-act="anaperiod" data-v="${k}">${l}</button>`).join('');
  const head = `<div class="mrow" style="flex-wrap:wrap">${chips}</div>
    <div class="arange"><input type="date" id="ana-from" data-f="ana" data-k="cfrom" value="${esc(N.cfrom || N.from)}" aria-label="開始日">〜
      <input type="date" id="ana-to" data-f="ana" data-k="cto" value="${esc(N.cto || N.to)}" aria-label="終了日">
      <button class="btn ghost" data-act="anacustom" aria-pressed="${N.period === 'custom'}">この期間を表示</button></div>`;
  if(N.failed){
    const msg = N.err === 'bad_range' ? '期間は400日以内で、開始日から終了日の順に指定してください。' : '分析を取得できませんでした。';
    return head + `<div class="err" role="alert">${esc(msg)}</div><div style="padding:12px 16px"><button class="btn ghost" data-act="anareload">もう一度読み込む</button></div>`;
  }
  if(!N.data) return head + '<p class="loading">読み込み中…</p>';
  const r = N.data, s = r.summary, p = r.prev;
  const none = s.visits + s.upcoming.count + s.pending + s.cancelled === 0;
  const notes = (s.pending > 0 ? `<div class="anote">過去の予約のうち ${s.pending}件が「来店済」になっていません(売上に含まれていません)。「今日の予約」などで状態を更新してください。</div>` : '')
    + (s.unpriced > 0 ? `<div class="anote">金額が未定の来店が ${s.unpriced}件あります(売上・客単価には含まれていません)。</div>` : '');
  const cards = `<div class="stats" id="ana-summary">
    <div class="stat"><small>売上(実績)</small><b id="ana-sales">${yen(s.sales)}</b><small>前期間比 ${deltaText(s.sales, p.sales)}</small></div>
    <div class="stat"><small>来店数</small><b id="ana-visits">${s.visits}件</b><small>前期間比 ${deltaText(s.visits, p.visits)}</small></div>
    <div class="stat"><small>客単価</small><b>${s.avgSpend == null ? '—' : yen(s.avgSpend)}</b></div>
    <div class="stat"><small>見込み(今後の確定)</small><b>${yen(s.upcoming.amount)}</b><small>${s.upcoming.count}件</small></div>
    <div class="stat"><small>キャンセル率</small><b>${pctText(s.cancelRate)}</b><small>${s.cancelled}件</small></div></div>`;
  if(none) return head + cards + '<p class="empty">この期間の予約はありません。</p>';
  const pts = r.series.points, max = Math.max(1, ...pts.map(q => q.sales));
  const chart = `<div class="sub">売上の推移(${r.series.unit === 'day' ? '日別' : '月別'})</div>
    <div class="abars" role="img" aria-label="売上の推移">${pts.map(q => `<div class="abar" title="${esc(q.key)} ${yen(q.sales)}"><i style="height:${Math.round(q.sales / max * 100)}%"></i></div>`).join('')}</div>
    <div class="aaxis"><span>${esc(pts[0].key)}</span><span>${esc(pts[pts.length - 1].key)}</span></div>`;
  const vt = r.visitType;
  const visitRows = [['first', '初回'], ['repeat', '再来'], ['unknown', '不明']].map(([k, l]) => ({name:l, visits:vt[k].visits, sales:vt[k].sales}));
  return head + cards + notes + chart
    + `<div class="sub">メニュー別</div>${anaRowsHTML(r.byMenu, o => o.name)}`
    + `<div class="sub">流入元別</div>${anaRowsHTML(r.bySource, o => ANA_SRC[o.key] || o.key)}`
    + `<div class="sub">新規 / 再来(お客様の申告ベース)</div>${anaRowsHTML(visitRows, o => o.name)}`;
}
VIEWS.analytics = anaView;
NAV.push(['analytics','分析']);
```

3-4. `logout()` の初期化行(`... A.menuAdm = newMenuAdm(); A.cpn = newCpn();`)の末尾に `A.ana = newAna();` を追加。

3-5. クリックハンドラ(`case 'cpnreload': ...` の下)に追加:
```js
    case 'anaperiod': { const r = anaRange(v), N = A.ana; N.period = v; N.from = r.from; N.to = r.to; N.cfrom = ''; N.cto = ''; N.data = null; N.failed = false; render(); break; }
    case 'anacustom': {
      const N = A.ana, f = N.cfrom || N.from, t = N.cto || N.to;
      N.period = 'custom'; N.from = f; N.to = t; N.data = null; N.failed = false; render(); break;
    }
    case 'anareload': A.ana.failed = false; render(); break;
```

3-6. 入力ハンドラ(`else if(f === 'cform2'){ ... }` の下)に追加(入力中は再描画しない):
```js
  else if(f === 'ana'){ A.ana[t.dataset.k] = t.value; }
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: 全て PASS

- [ ] **Step 5: コミット**
```bash
git add admin.html tests/admin-analytics.test.js
git commit -m "kohaku-booking: 管理画面に売上・来店分析の画面を追加"
```

---

### Task 3: ドキュメントと全体確認

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/deploy-checklist.md`

- [ ] **Step 1: `CLAUDE.md` を更新**
  - 「API」の管理一覧に `adminAnalytics`(期間 `{from,to}` の集計。売上=来店済の割引後金額、見込み・未処理・金額未定・キャンセル率・前期間比、推移(62日以内は日別・超は月別)、メニュー別・流入元別・新規/再来。読み取り専用で個人情報なし。期間は400日以内、違反は `bad_range`)を追記
  - 「実装済み / 未実装」: 実装済みに「売上・来店分析(管理画面「分析」)」を追加し、未実装の「売上・来店分析」を外す(残り: スタッフ管理)
  - 「設計上の判断」に追記: 売上は「来店済」の予約だけを実績とする(確定は見込み・過去日付の確定は未処理として可視化)/ 新規・再来は予約時の自己申告 / 流入元は予約リンクから来た予約のみ
  - 既存の記述(顧客・メニュー・クーポン・予約リンク)は削除・変更しない

- [ ] **Step 2: `docs/deploy-checklist.md` の確認表の末尾(33行目の後ろ)に行を追記**

| 34 | 管理画面: 分析 → 今月 | サマリーの来店数・売上が、`予約`シートの今月分の「来店済」の件数・合計金額(割引後)と一致する |
| 35 | 期間を「先月」「直近3か月」「今年」に切り替える | 数値と推移が変わる。直近3か月・今年は月別の棒グラフになる |
| 36 | 過去日付の予約を「確定」のままにして今月を表示 | 「来店済になっていません」の注意が出て、売上には入らない |
| 37 | 金額が「当日案内」のメニューを「来店済」にする | 「金額が未定の来店」の注意が出て、売上・客単価には入らない |
| 38 | 期間指定で開始日と終了日を逆にする / 401日以上にする | 「期間は400日以内で、開始日から終了日の順に…」と表示される |

- [ ] **Step 3: 全体確認**

Run: `npm test && npm run check:gas`
Expected: 全て PASS、`gas/Code.gs: syntax OK`

`python -m http.server` で `admin.html` を開き(デモ表示、パスワード `demo`)、PC幅・スマホ幅で「分析」画面の期間切替・サマリーカード・棒グラフ・内訳の見た目を確認する。

- [ ] **Step 4: コミット**
```bash
git add CLAUDE.md docs/deploy-checklist.md
git commit -m "kohaku-booking: 売上・来店分析の仕様と実機確認項目をドキュメントに反映"
```

---

## Self-Review(計画書の自己点検結果)
- **Spec coverage**: 3章(指標の定義)=Task 1 / 4章(API・期間検証・series/byMenu/bySource/visitType)=Task 1 / 5章(画面)=Task 2 / 6章(安全性)=Task 1・2 / 7章(限界)=Task 3 / 8章(テスト)=Task 1・2 / 9章(公開順序)=Task 3(チェックリスト)。
- **名前の整合**: `analyticsSummary_` / `prevRange_` / `validateAnalyticsRange_` / `adminAnalytics`、戻り値のキー(`summary` / `prev` / `series` / `byMenu` / `bySource` / `visitType`)、デモの `demoAnalytics` は GAS と同じ形・同じ定義。
- **既知の限界**: シートの実データ・実際の `Utilities.formatDate`(JST)は実機でのみ確認できる。Task 3 のチェックリスト34〜38で確認する。
