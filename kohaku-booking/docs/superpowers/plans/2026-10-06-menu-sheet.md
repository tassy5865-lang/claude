# メニュー管理シート化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** メニュー・オプションを Google スプレッドシート(`メニュー` / `オプション`)で管理し、予約時の料金・所要分を GAS 側で再計算する。

**Architecture:** GAS に純粋関数(`parseMenuRows_` / `parseOptionRows_` / `calcBooking_`)とシート入出力を足し、`GET ?action=menu` で公開する。`index.html` / `admin.html` は起動時に取得し、失敗時・デモ時は埋め込みの予備配列を使う。`doPost` は `menuId` + `optionIds` から料金・所要分・名前をシートの値で決める。

**Tech Stack:** バニラJS単一HTML、Google Apps Script、`node --test` + jsdom、Node `vm`(Code.gs の純粋関数テスト用)。

**Spec:** `docs/superpowers/specs/2026-10-06-menu-sheet-design.md`

## Global Constraints

- 作業フォルダは `kohaku-booking/`。**このフォルダは git 未追跡。`git add -A` / `git add .` は禁止**(OneDrive 同期の事故防止)。コミットはユーザーが依頼した場合のみ、対象パスを明示する。
- フロントは**依存なしのバニラJS単一HTML**。ビルド工程を入れない。
- ユーザー入力・シート由来の文字列は必ず `esc()` で描画する(`index.html` / `admin.html` 既存関数)。
- 新しい API エラーは `{ok:false,error:'snake_case'}`、日本語は `index.html` の `errMsg` に追加。
- スプレッドシートの**既存列の並び替え・削除は禁止**。新規シートの列追加は末尾のみ。
- `menuId` は一度決めたら変えない(既存予約・「同じメニューで予約」が参照)。
- 全セルは文字列書式 `'@'` で保存し、読み出し時に数値へ変換する。
- 公開 API(`menu`)は個人情報を返さない。`doPost` の再計算はキャッシュを使わずシートを直接読む。
- 管理画面 `adminCreate_` の手入力(料金・所要分)は**変更しない**。
- GAS の実機(シート・カレンダー・LINE)は未確認。完了報告では「未確認」と明記する。
- コメント・UI文言は日本語。

## Review Focus

1. シートの料金セルが数値でない/空 → その行を除外(メニュー)。空料金は `null`(当日案内)として扱う。→ Task 1 のテスト
2. `optionIds` に未知ID・非表示ID・重複が来る → `bad_menu`(重複は除去せず拒否ではなく、1回だけ数える)。→ Task 1 のテスト
3. クライアントが `total`/`minutes`/`menuName` を改ざんして送る → 無視され、サーバー計算値が使われる。→ Task 1 のテスト(`calcBooking_` は d.total を見ない)
4. `omakase` の `minutes` が 60/90/120 以外 → `bad_minutes`。→ Task 1 のテスト
5. `menu` 取得失敗/遅延中にお客様が操作 → 予備配列で動作し、読み込み中表示が出る。→ Task 3 のテスト

---

## File Structure

| ファイル | 責務 |
|---|---|
| `gas/Code.gs` | 純粋関数(パース・計算)、シート入出力、`menu` API、`doPost` 統合、`setup` の初期データ |
| `index.html` | 予備配列の更新、`loadMenu()`、読み込み中表示、送信ペイロード変更、`bad_menu` 処理 |
| `admin.html` | 予備配列の更新、`loadMenu()`(予約追加のプルダウン用) |
| `tests/gas-menu.test.js`(新規) | Code.gs を `vm` で読み込み、純粋関数を単体テスト |
| `tests/menu-front.test.js`(新規) | 予備配列と GAS 初期データの一致、`menu` API スタブでの描画、失敗時フォールバック、ペイロード |
| `tests/booking.test.js` / `admin.test.js` | 既存。デモモードで通り続けること |
| `CLAUDE.md` | 構成・データモデル・未実装リストの更新 |

---

### Task 1: GAS の純粋関数(初期データ・パース・再計算)

**Files:**
- Modify: `gas/Code.gs`(定数と関数を `/* ---------- 検証 ---------- */` の直前に追加)
- Create: `tests/gas-menu.test.js`

**Interfaces:**
- Produces:
  - `SEED_MENU`: `Array<[id,name,min,price,desc,cats,g,kind,show,order]>`(全て文字列/数値。`price` は数値、空は `''`)
  - `SEED_OPTIONS`: `Array<[id,name,min,price,show,order]>`
  - `MENU_HEADERS`, `OPTION_HEADERS`: 見出し配列
  - `parseMenuRows_(values)` → `Array<{id,name,min:number,price:number|null,desc,cats:string[],g,kind,show:boolean,order:number}>`(不正行は除外)
  - `parseOptionRows_(values)` → `Array<{id,name,min:number,price:number,show:boolean,order:number}>`
  - `calcBooking_(menu, options, d)` → `{ok:true, menuName, minutes:number, total:number|null, optionNames:string[]}` | `{ok:false, error:'bad_menu'|'bad_minutes'}`。`menu`/`options` は `parse*` の結果(全行)。`d.menuId`, `d.optionIds`(配列、省略可), `d.minutes`(omakase のみ参照)
  - `publicMenu_(menu, options)` → `{menu:[…], options:[…]}`(show=true のみ、order 昇順、`show` を除く)

- [ ] **Step 1: テストの土台と失敗するテストを書く**

`tests/gas-menu.test.js` を新規作成:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

// Code.gs を Node の vm で読み込む(Apps Script の関数宣言はコンテキストのグローバルになる)
function loadGas() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const ctx = vm.createContext({ console });
  vm.runInContext(src + '\n;this.__consts = { SEED_MENU, SEED_OPTIONS, MENU_HEADERS, OPTION_HEADERS };', ctx);
  return { ...ctx, ...ctx.__consts };
}

test('parseMenuRows_: 数値でない行は除外し、空の料金は null、cats は配列', () => {
  const g = loadGas();
  const rows = g.parseMenuRows_([
    ['a1', 'テストA', '60', '7000', '説明', 'aroma, first', 'aroma', '', 'ON', '1'],
    ['a2', '料金が壊れている', '60', 'abc', '', 'aroma', 'aroma', '', 'ON', '2'],
    ['a3', '所要分が壊れている', 'x', '1000', '', 'aroma', 'aroma', '', 'ON', '3'],
    ['',   'IDなし', '60', '1000', '', 'aroma', 'aroma', '', 'ON', '4'],
    ['a5', '当日案内', '', '', '', 'omakase', 'omakase', 'omakase', 'ON', '5'],
    ['a6', '非表示', '40', '3000', '', 'steam', 'steam', '', 'OFF', '6']
  ]);
  assert.deepStrictEqual(rows.map(r => r.id), ['a1', 'a5', 'a6']);
  assert.strictEqual(rows[0].min, 60);
  assert.strictEqual(rows[0].price, 7000);
  assert.deepStrictEqual(rows[0].cats, ['aroma', 'first']);
  assert.strictEqual(rows[1].price, null);
  assert.strictEqual(rows[2].show, false);
});

test('publicMenu_: 表示=ON のみ・並び順・show を含まない', () => {
  const g = loadGas();
  const menu = g.parseMenuRows_([
    ['b', 'B', '40', '2000', '', 'steam', 'steam', '', 'ON', '2'],
    ['a', 'A', '40', '1000', '', 'steam', 'steam', '', 'ON', '1'],
    ['c', 'C', '40', '3000', '', 'steam', 'steam', '', 'OFF', '3']
  ]);
  const opts = g.parseOptionRows_([['o1', 'O1', '10', '1500', 'ON', '1'], ['o2', 'O2', '0', '1000', 'OFF', '2']]);
  const pub = g.publicMenu_(menu, opts);
  assert.deepStrictEqual(pub.menu.map(m => m.id), ['a', 'b']);
  assert.deepStrictEqual(pub.options.map(o => o.id), ['o1']);
  assert.ok(!('show' in pub.menu[0]));
});

const MENU = [
  ['m60', 'Relax', '60', '7000', '', 'aroma', 'aroma', '', 'ON', '1'],
  ['pair', 'ペア蒸し', '40', '6000', '', 'pair', 'pair', 'pair', 'ON', '2'],
  ['omk', 'おまかせ', '', '', '', 'omakase', 'omakase', 'omakase', 'ON', '3'],
  ['off', '非表示', '40', '3000', '', 'steam', 'steam', '', 'OFF', '4']
];
const OPTS = [['head', '頭ほぐし', '10', '1500', 'ON', '1'], ['bath', 'フットバス', '0', '1000', 'ON', '2'], ['x', '非表示', '10', '500', 'OFF', '3']];
const calc = (g, d) => g.calcBooking_(g.parseMenuRows_(MENU), g.parseOptionRows_(OPTS), d);

test('calcBooking_: メニュー+オプションの料金・所要分・名前をシートの値で決める', () => {
  const g = loadGas();
  const r = calc(g, { menuId: 'm60', optionIds: ['head', 'bath'], total: 1, minutes: 5, menuName: '改ざん' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), { ok: true, menuName: 'Relax', minutes: 70, total: 9500, optionNames: ['頭ほぐし', 'フットバス'] });
});

test('calcBooking_: ペアはオプション料金が2名分で、名前に(2名分)が付く', () => {
  const g = loadGas();
  const r = calc(g, { menuId: 'pair', optionIds: ['head'] });
  assert.strictEqual(r.total, 6000 + 1500 * 2);
  assert.deepStrictEqual(Array.from(r.optionNames), ['頭ほぐし(2名分)']);
});

test('calcBooking_: おまかせは料金null、minutes は 60/90/120 のみ', () => {
  const g = loadGas();
  assert.strictEqual(calc(g, { menuId: 'omk', minutes: 90 }).total, null);
  assert.strictEqual(calc(g, { menuId: 'omk', minutes: 90 }).minutes, 90);
  assert.strictEqual(calc(g, { menuId: 'omk', minutes: 75 }).error, 'bad_minutes');
  assert.strictEqual(calc(g, { menuId: 'omk' }).error, 'bad_minutes');
});

test('calcBooking_: 未知・非表示のメニュー/オプションは bad_menu、重複オプションは1回だけ数える', () => {
  const g = loadGas();
  assert.strictEqual(calc(g, { menuId: 'nope' }).error, 'bad_menu');
  assert.strictEqual(calc(g, { menuId: 'off' }).error, 'bad_menu');
  assert.strictEqual(calc(g, { menuId: 'm60', optionIds: ['x'] }).error, 'bad_menu');
  assert.strictEqual(calc(g, { menuId: 'm60', optionIds: ['zzz'] }).error, 'bad_menu');
  assert.strictEqual(calc(g, { menuId: 'm60', optionIds: ['head', 'head'] }).total, 7000 + 1500);
  assert.strictEqual(calc(g, { menuId: 'm60', optionIds: 'head' }).error, 'bad_menu');   // 配列でない
});

test('初期データ: ID が一意で、見出し数と列数が合い、全行がパースを通る', () => {
  const g = loadGas();
  const ids = g.SEED_MENU.map(r => r[0]);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(g.SEED_MENU.every(r => r.length === g.MENU_HEADERS.length));
  assert.ok(g.SEED_OPTIONS.every(r => r.length === g.OPTION_HEADERS.length));
  assert.strictEqual(g.parseMenuRows_(g.SEED_MENU.map(r => r.map(String))).length, g.SEED_MENU.length);
  assert.strictEqual(g.parseOptionRows_(g.SEED_OPTIONS.map(r => r.map(String))).length, g.SEED_OPTIONS.length);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/gas-menu.test.js`
Expected: FAIL(`SEED_MENU is not defined` など)

- [ ] **Step 3: 実装を `gas/Code.gs` に追加**

`/* ---------- 検証 ---------- */` の直前に次を追加:

```js
/* =========================================================
 * メニュー管理(スプレッドシート)
 *  【メニュー】シート … 1行=1メニュー。列の追加は末尾のみ。メニューIDは一度決めたら変えない。
 *  【オプション】シート … 1行=1オプション。
 *  料金の空欄=当日ご案内。表示=OFF の行は予約サイトに出ない(削除の代わりに使う)。
 * ========================================================= */
const MENU_HEADERS = ['メニューID','名前','所要分','料金','説明','カテゴリ(カンマ区切り)','グループ','種別(空/pair/omakase)','表示(ON/OFF)','並び順'];
const OPTION_HEADERS = ['オプションID','名前','所要分','料金','表示(ON/OFF)','並び順'];
const OMAKASE_MINS = [60, 90, 120];

// 初期データ(メニュー表が正)。index.html / admin.html の予備配列と同じ内容にすること(tests/menu-front.test.js が検査)
const SEED_MENU = [
  ['first100',  'アロマボディトリートメント × まこも蒸し(初回限定)', 100, 10000, '体質診断チェック付き / 通常 ¥12,000', 'first', 'steam', '', 'ON', 1],
  ['aroma60',   'Relax アロマボディトリートメント', 60,  7000,  'やさしい香りと心地よいタッチで',   'aroma,first', 'aroma', '', 'ON', 2],
  ['aroma80',   '満足 アロマボディトリートメント',  80,  9000,  'たっぷりの時間で全身をゆるめる', 'aroma',       'aroma', '', 'ON', 3],
  ['aroma100',  '疲労回復 アロマボディトリートメント', 100, 11000, '溜まった疲れをほどき、巡りのよい体へ', 'aroma,rec', 'aroma', '', 'ON', 4],
  ['f-light',   'ローズフェイシャル A', 40, 5600,  'フェイシャル30分(シートパック付き)+ 頭ほぐし10分', 'facial,first', 'facial', '', 'ON', 5],
  ['f-relax',   'ローズフェイシャル B', 65, 8100,  'フェイシャル30分(シートパック付き)+ 頭ほぐし35分(上衣に着替えます)', 'facial,rec', 'facial', '', 'ON', 6],
  ['f-onkatsu', 'ローズフェイシャル C', 70, 11600, 'フェイシャル30分(シートパック付き)+ 頭ほぐし10分 + よもぎ蒸し', 'facial', 'facial', '', 'ON', 7],
  ['f-premium', 'ローズフェイシャル D', 95, 14100, 'フェイシャル30分(シートパック付き)+ 頭ほぐし35分 + よもぎ蒸し', 'facial,rec', 'facial', '', 'ON', 8],
  ['set90',     'Relax アロマボディトリートメント + よもぎ蒸し', 90,  10000, 'アロマボディ + よもぎ蒸し', 'steam,rec', 'steam', '', 'ON', 9],
  ['set110',    '満足 アロマボディトリートメント + よもぎ蒸し',  110, 12000, 'アロマボディ + よもぎ蒸し', 'steam',     'steam', '', 'ON', 10],
  ['set130',    '疲労回復 アロマボディトリートメント + よもぎ蒸し', 130, 14000, 'アロマボディ + よもぎ蒸し', 'steam',  'steam', '', 'ON', 11],
  ['course110', '全身満たされる110分コース', 110, 13000, 'ボディ50分 + ローズフェイシャル + よもぎ蒸し(おすすめ)', 'steam,rec', 'steam', '', 'ON', 12],
  ['course140', '全身満たされる140分コース', 140, 18600, 'ボディ80分 + ローズフェイシャル + まこも蒸し',             'steam',     'steam', '', 'ON', 13],
  ['p-yomogi',      'ペア よもぎ蒸し(2名分)',                  40, 6000,  '大切な人と一緒に',        'pair', 'pair', 'pair', 'ON', 14],
  ['p-makomo',      'ペア まこも蒸し(2名分)',                  40, 12000, '大切な人と一緒に',        'pair', 'pair', 'pair', 'ON', 15],
  ['p-yomogi-foot', 'ペア よもぎ蒸し + フットまたは頭ほぐし30分(2名分)', 70, 12000, '蒸しのあとに足と頭を癒す', 'pair', 'pair', 'pair', 'ON', 16],
  ['p-makomo-foot', 'ペア まこも蒸し + フットまたは頭ほぐし30分(2名分)', 70, 18000, '蒸しのあとに足と頭を癒す', 'pair', 'pair', 'pair', 'ON', 17],
  ['omakase',   'おまかせ相談予約', 60, '', 'セラピストに相談して、その日の内容を決めるコースです。', 'omakase', 'omakase', 'omakase', 'ON', 18],
  ['yomogi',    'よもぎ蒸し', 40, 3000, 'じんわり芯から温まる', 'steam,first', 'steam', '', 'OFF', 19],
  ['makomo',    'まこも蒸し', 40, 6000, '深い温まりと発汗',     'steam',       'steam', '', 'OFF', 20]
];
const SEED_OPTIONS = [
  ['head',  '頭ほぐし',       10, 1500, 'ON', 1],
  ['foot',  'フット',         10, 1500, 'ON', 2],
  ['hand',  'ハンド',         10, 1500, 'ON', 3],
  ['stone', 'ホットストーン', 0,  2000, 'ON', 4],
  ['bath',  'フットバス',     0,  1000, 'ON', 5]
];

function numOrNull_(v) {
  const s = String(v === undefined || v === null ? '' : v).replace(/[,\s¥円]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return isFinite(n) && n >= 0 ? n : NaN;
}

/** メニューシートの値(2次元配列・見出し行を除く)→ メニュー配列。不正な行は除外してログに残す */
function parseMenuRows_(values) {
  const out = [];
  (values || []).forEach(function (v, i) {
    const id = String(v[0] || '').trim(), kind = String(v[7] || '').trim();
    const min = numOrNull_(v[2]), price = numOrNull_(v[3]), order = numOrNull_(v[9]);
    const minOk = kind === 'omakase' ? (min === null || !isNaN(min)) : (min !== null && !isNaN(min) && min > 0);
    if (!id || !String(v[1] || '').trim() || !minOk || isNaN(price)) {
      console.error('menu row skipped: ' + (i + 2) + '行目'); return;
    }
    out.push({
      id: id, name: String(v[1]).trim(), min: min || 0, price: price, desc: String(v[4] || '').trim(),
      cats: String(v[5] || '').split(',').map(function (s) { return s.trim(); }).filter(String),
      g: String(v[6] || '').trim(), kind: kind, show: String(v[8] || '').trim().toUpperCase() === 'ON', order: order === null || isNaN(order) ? 9999 : order
    });
  });
  return out;
}

function parseOptionRows_(values) {
  const out = [];
  (values || []).forEach(function (v, i) {
    const id = String(v[0] || '').trim(), min = numOrNull_(v[2]), price = numOrNull_(v[3]), order = numOrNull_(v[5]);
    if (!id || !String(v[1] || '').trim() || min === null || isNaN(min) || price === null || isNaN(price)) {
      console.error('option row skipped: ' + (i + 2) + '行目'); return;
    }
    out.push({ id: id, name: String(v[1]).trim(), min: min, price: price,
               show: String(v[4] || '').trim().toUpperCase() === 'ON', order: order === null || isNaN(order) ? 9999 : order });
  });
  return out;
}

function byOrder_(a, b) { return a.order - b.order; }

/** 公開用: 表示=ON のみ、並び順で、show を除いて返す */
function publicMenu_(menu, options) {
  const strip = function (x) { const c = {}; Object.keys(x).forEach(function (k) { if (k !== 'show') c[k] = x[k]; }); return c; };
  return {
    menu: menu.filter(function (m) { return m.show; }).sort(byOrder_).map(strip),
    options: options.filter(function (o) { return o.show; }).sort(byOrder_).map(strip)
  };
}

/** 予約の料金・所要分・名前をシートの値で決める(クライアントの total/minutes/menuName は見ない) */
function calcBooking_(menu, options, d) {
  const m = menu.filter(function (x) { return x.id === d.menuId && x.show; })[0];
  if (!m) return { ok: false, error: 'bad_menu' };
  const ids = d.optionIds === undefined ? [] : d.optionIds;
  if (!Array.isArray(ids)) return { ok: false, error: 'bad_menu' };
  const seen = {}, chosen = [];
  for (let i = 0; i < ids.length; i++) {
    const o = options.filter(function (x) { return x.id === ids[i] && x.show; })[0];
    if (!o) return { ok: false, error: 'bad_menu' };
    if (!seen[o.id]) { seen[o.id] = true; chosen.push(o); }
  }
  const mult = m.kind === 'pair' ? 2 : 1;
  let minutes = m.min;
  if (m.kind === 'omakase') {
    if (OMAKASE_MINS.indexOf(Number(d.minutes)) < 0) return { ok: false, error: 'bad_minutes' };
    minutes = Number(d.minutes);
  }
  chosen.forEach(function (o) { minutes += o.min; });
  const total = m.price === null ? null : m.price + chosen.reduce(function (a, o) { return a + o.price; }, 0) * mult;
  return { ok: true, menuName: m.name, minutes: minutes, total: total,
           optionNames: chosen.map(function (o) { return o.name + (mult > 1 ? '(2名分)' : ''); }) };
}

```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/gas-menu.test.js` → すべて PASS。続けて `npm run check:gas` → `syntax OK`。

(`omakase` の `min` は `parseMenuRows_` で `min||0` になる。omakase は `calcBooking_` で `d.minutes` を使うため問題ない。)

---

### Task 2: GAS のシート入出力・`menu` API・`doPost` 統合

**Files:**
- Modify: `gas/Code.gs`(`setup`、`doGet`、`doPost`、シート取得関数)
- Modify: `tests/gas-menu.test.js`(統合のテストを追記)

**Interfaces:**
- Consumes: Task 1 の `SEED_*`, `parse*`, `publicMenu_`, `calcBooking_`
- Produces:
  - `getMenuSheet_()` / `getOptionSheet_()`: シートが無ければ作成、`lastRow < 2` なら初期データを書く
  - `loadMenu_()` → `{menu, options}`(全行・キャッシュなし)
  - `menuApi_()` → `{ok:true, menu, options}`(`CacheService` 5分)
  - `GET ?action=menu`
  - `doPost`: ペイロード `menuId`, `optionIds`, `minutes`(omakase のみ)

- [ ] **Step 1: 失敗するテストを書く**(`doPost` と `doGet` をスタブ環境で呼ぶ)

`tests/gas-menu.test.js` に追記:

```js
// doGet / doPost をスタブ(シート・カレンダー・ロック・キャッシュ)で動かす
function loadGasWithStubs({ menuRows, optionRows }) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const created = [];
  const sheetOf = rows => ({ getLastRow: () => rows.length + 1, getRange: () => ({ getValues: () => rows }) });
  const cache = {};
  const ctx = vm.createContext({
    console,
    ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {}, tryLock: () => true }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    Utilities: { formatDate: (d, tz, f) => f === 'HH:mm' ? '12:00' : '260101', },
    CalendarApp: {},
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => n === 'メニュー' ? sheetOf(menuRows) : n === 'オプション' ? sheetOf(optionRows) : null }) }
  });
  vm.runInContext(src, ctx);
  ctx.__created = created;
  return ctx;
}
const parse = out => JSON.parse(out.s);

test('menu API: 表示ONの行だけを返す(個人情報なし)', () => {
  const g = loadGasWithStubs({
    menuRows: [['a', 'A', '40', '1000', '', 'steam', 'steam', '', 'ON', '1'], ['b', 'B', '40', '2000', '', 'steam', 'steam', '', 'OFF', '2']],
    optionRows: [['o', 'O', '10', '1500', 'ON', '1']]
  });
  const r = parse(g.doGet({ parameter: { action: 'menu' } }));
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.menu.map(m => m.id), ['a']);
  assert.deepStrictEqual(r.options.map(o => o.id), ['o']);
});

test('menu API: シートが読めなければ menu_unavailable', () => {
  const g = loadGasWithStubs({ menuRows: [], optionRows: [] });
  g.loadMenu_ = () => { throw new Error('boom'); };
  assert.strictEqual(parse(g.doGet({ parameter: { action: 'menu' } })).error, 'menu_unavailable');
});

test('doPost: 未知の menuId は bad_menu(クライアントの料金は信用しない)', () => {
  const g = loadGasWithStubs({
    menuRows: [['a', 'A', '40', '1000', '', 'steam', 'steam', '', 'ON', '1']],
    optionRows: []
  });
  const body = { date: '2099-01-05', time: '10:00', menuId: 'zzz', menuName: '安く見せる', total: 1, minutes: 40, name: 'x', kana: 'ｘ', tel: '09012345678', email: 'a@b.jp', visit: '初回' };
  const r = parse(g.doPost({ postData: { contents: JSON.stringify(body) } }));
  assert.strictEqual(r.error, 'bad_menu');
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/gas-menu.test.js`
Expected: 新規3件が FAIL(`loadMenu_` 未定義、`unknown_action` など)

- [ ] **Step 3: 実装**

`CONFIG` に追加(`COUPON_SHEET` の次の行):

```js
  MENU_SHEET: 'メニュー',
  OPTION_SHEET: 'オプション',
```

`gas/Code.gs` の `Task 1` で追加したブロックの直後にシート入出力を追加:

```js
function getSeededSheet_(name, headers, seed) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#EADBC3');
    sh.setFrozenRows(1);
  }
  if (sh.getLastRow() < 2) {   // 空のときだけ初期データを書く(既存の編集は上書きしない)
    sh.getRange(2, 1, seed.length, headers.length).setNumberFormat('@').setValues(seed.map(function (r) { return r.map(String); }));
  }
  return sh;
}
function getMenuSheet_()   { return getSeededSheet_(CONFIG.MENU_SHEET, MENU_HEADERS, SEED_MENU); }
function getOptionSheet_() { return getSeededSheet_(CONFIG.OPTION_SHEET, OPTION_HEADERS, SEED_OPTIONS); }

function readRows_(sh, cols) {
  const last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, cols).getValues();
}
/** シートを直接読む(キャッシュなし)。予約時の再計算に使う */
function loadMenu_() {
  return {
    menu: parseMenuRows_(readRows_(getMenuSheet_(), MENU_HEADERS.length)),
    options: parseOptionRows_(readRows_(getOptionSheet_(), OPTION_HEADERS.length))
  };
}
/** 公開API用。5分キャッシュ(シート編集の反映は最大5分遅れる) */
function menuApi_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('menu:v1');
  if (hit) return JSON.parse(hit);
  const m = loadMenu_(), res = Object.assign({ ok: true }, publicMenu_(m.menu, m.options));
  try { cache.put('menu:v1', JSON.stringify(res), 300); } catch (err) { /* 100KB超などは無視 */ }
  return res;
}
```

`setup()` に追加(`getCouponSheet_();` の次):

```js
  getMenuSheet_();
  getOptionSheet_();
```

`doGet` の `unknown_action` の直前に追加:

```js
    if (p.action === 'menu') {
      try { return json_(menuApi_()); } catch (err) { console.error('menu failed: ' + err); return json_({ ok: false, error: 'menu_unavailable' }); }
    }
```

`doPost` の `const err = validate_(d);` の**直前**に追加(クライアント値を上書きしてから既存の検証に渡す):

```js
    const sheetMenu = loadMenu_();   // キャッシュを使わず、シートを直接読む
    const calc = calcBooking_(sheetMenu.menu, sheetMenu.options, d);
    if (!calc.ok) return json_({ ok: false, error: calc.error });
    d.menuName = calc.menuName; d.minutes = calc.minutes; d.total = calc.total; d.options = calc.optionNames;

```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/gas-menu.test.js` → PASS。`npm run check:gas` → `syntax OK`。

---

### Task 3: index.html(予備配列・取得・読み込み中・送信)

**Files:**
- Modify: `index.html`(`MENU`/`OPTIONS` 定義 237-266 行付近、`errMsg`、`submit()`、`menu()` ビュー、`bootstrap()`)
- Create: `tests/menu-front.test.js`

**Interfaces:**
- Consumes: Task 2 の `GET ?action=menu` → `{ok:true, menu:[{id,name,min,price,desc,cats,g,kind,order}], options:[{id,name,min,price,order}]}`、`doPost` の `menuId`/`optionIds`/`minutes`、`bad_menu`
- Produces: `loadMenu()`(index.html 内、`MENU`/`OPTIONS` を差し替えて `render()`)、`MENU_LOADING`

- [ ] **Step 1: 失敗するテストを書く**

`tests/menu-front.test.js` を新規作成:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { load, sleep } = require('./helpers');

const norm = m => ({ id: m.id, name: m.name, min: m.min, price: m.price, desc: m.desc, cats: m.cats, g: m.g, kind: m.kind || '' });

test('予備配列(index.html)は GAS の初期データ(表示ON)と一致する', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const ctx = vm.createContext({ console });
  vm.runInContext(src + '\n;this.__s = { SEED_MENU, SEED_OPTIONS };', ctx);
  const pub = ctx.publicMenu_(ctx.parseMenuRows_(ctx.__s.SEED_MENU.map(r => r.map(String))), ctx.parseOptionRows_(ctx.__s.SEED_OPTIONS.map(r => r.map(String))));
  const { w } = load('index.html');
  const fm = w.eval('JSON.stringify(MENU)');
  assert.deepStrictEqual(JSON.parse(fm).map(norm), JSON.parse(JSON.stringify(pub.menu)).map(norm));
  const fo = JSON.parse(w.eval('JSON.stringify(OPTIONS)'));
  assert.deepStrictEqual(fo.map(o => [o.id, o.name, o.min, o.price]), pub.options.map(o => [o.id, o.name, o.min, o.price]));
});

test('menu API の内容でメニュー一覧が描画される / 読み込み中表示が出る', async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const { click, text } = load('index.html', {
    replace: [["GAS_URL: '',", "GAS_URL: 'https://gas.test/exec',"]],
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
    replace: [["GAS_URL: '',", "GAS_URL: 'https://gas.test/exec',"]],
    beforeParse(w) { w.fetch = async () => { throw new Error('offline'); }; }
  });
  await sleep(100);
  click('[data-act=cat][data-v=aroma]');
  assert.match(text(), /Relax アロマボディトリートメント/);
  assert.doesNotMatch(text(), /メニューを読み込み中/);
});

test('送信ペイロードは menuId と optionIds を送り、total/menuName/options は送らない', async () => {
  let posted = null;
  const { click, type, d } = load('index.html', {
    replace: [["GAS_URL: '',", "GAS_URL: 'https://gas.test/exec',"]],
    beforeParse(w) {
      w.fetch = async (u, opt) => {
        if (String(u).includes('action=menu')) return { json: async () => ({ ok: false, error: 'menu_unavailable' }) };
        if (String(u).includes('action=availability')) return { json: async () => ({ ok: true, busy: [] }) };
        posted = JSON.parse(opt.body); return { json: async () => ({ ok: true, id: 'K1' }) };
      };
    }
  });
  await sleep(100);
  click('[data-act=cat][data-v=aroma]');
  click('[data-act=pick][data-v=aroma60]');
  click('input[data-f=opt][value=head]');
  click('[data-act=next]'); await sleep(300);
  [...d.querySelectorAll('.day.ok')][0].click();
  [...d.querySelectorAll('.slot:not(:disabled)')][0].click();
  click('[data-act=next]');
  type('[data-k=name]', '山田 花子'); type('[data-k=kana]', 'ヤマダ ハナコ');
  type('[data-k=tel]', '090-1234-5678'); type('[data-k=email]', 'hanako@example.com');
  click('[data-act=next]');
  click('[data-act=submit]'); await sleep(300);
  assert.ok(posted, '送信された');
  assert.strictEqual(posted.menuId, 'aroma60');
  assert.deepStrictEqual(posted.optionIds, ['head']);
  assert.ok(!('total' in posted) && !('menuName' in posted) && !('options' in posted) && !('minutes' in posted));
});

test('bad_menu が返ったら案内を出し、送信中のままにしない', async () => {
  const { click, type, text, d } = load('index.html', {
    replace: [["GAS_URL: '',", "GAS_URL: 'https://gas.test/exec',"]],
    beforeParse(w) {
      w.fetch = async (u, opt) => {
        if (String(u).includes('action=menu')) return { json: async () => ({ ok: false, error: 'menu_unavailable' }) };
        if (String(u).includes('action=availability')) return { json: async () => ({ ok: true, busy: [] }) };
        return { json: async () => ({ ok: false, error: 'bad_menu' }) };
      };
    }
  });
  await sleep(100);
  click('[data-act=cat][data-v=aroma]'); click('[data-act=pick][data-v=aroma60]');
  click('[data-act=next]'); await sleep(300);
  [...d.querySelectorAll('.day.ok')][0].click(); [...d.querySelectorAll('.slot:not(:disabled)')][0].click();
  click('[data-act=next]');
  type('[data-k=name]', '山田 花子'); type('[data-k=kana]', 'ヤマダ ハナコ');
  type('[data-k=tel]', '090-1234-5678'); type('[data-k=email]', 'hanako@example.com');
  click('[data-act=next]'); click('[data-act=submit]'); await sleep(300);
  assert.match(text(), /現在ご予約いただけません/);
  assert.ok(d.querySelector('[data-act=submit]') && !d.querySelector('[data-act=submit]').disabled);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/menu-front.test.js`
Expected: FAIL(予備配列の不一致、`メニューを読み込み中` が無い、など)

- [ ] **Step 3: 実装**

(a) `index.html` の `const MENU = [...]` と `const OPTIONS = [...]` を、`let` にして内容を **`SEED_MENU` の表示ON行・並び順どおり**に置き換える。1行の形式は既存と同じ(`kind` は空なら省略可)。`tbd` と、その説明コメント(236行)は削除する。**表示=OFF の `yomogi` / `makomo` は予備配列に入れない。**

```js
// 予備: GAS の menu API が使えないとき(デモ・取得失敗)に使う。内容は gas/Code.gs の SEED_MENU(表示ON)と同じにすること
let MENU = [
  {id:'first100', name:'アロマボディトリートメント × まこも蒸し(初回限定)', min:100, price:10000, desc:'体質診断チェック付き / 通常 ¥12,000', cats:['first'], g:'steam'},
  {id:'aroma60',  name:'Relax アロマボディトリートメント', min:60,  price:7000,  desc:'やさしい香りと心地よいタッチで',   cats:['aroma','first'], g:'aroma'},
  {id:'aroma80',  name:'満足 アロマボディトリートメント',  min:80,  price:9000,  desc:'たっぷりの時間で全身をゆるめる', cats:['aroma'],         g:'aroma'},
  {id:'aroma100', name:'疲労回復 アロマボディトリートメント', min:100, price:11000, desc:'溜まった疲れをほどき、巡りのよい体へ', cats:['aroma','rec'], g:'aroma'},
  {id:'f-light',  name:'ローズフェイシャル A', min:40, price:5600,  desc:'フェイシャル30分(シートパック付き)+ 頭ほぐし10分', cats:['facial','first'], g:'facial'},
  {id:'f-relax',  name:'ローズフェイシャル B', min:65, price:8100,  desc:'フェイシャル30分(シートパック付き)+ 頭ほぐし35分(上衣に着替えます)', cats:['facial','rec'], g:'facial'},
  {id:'f-onkatsu',name:'ローズフェイシャル C', min:70, price:11600, desc:'フェイシャル30分(シートパック付き)+ 頭ほぐし10分 + よもぎ蒸し', cats:['facial'], g:'facial'},
  {id:'f-premium',name:'ローズフェイシャル D', min:95, price:14100, desc:'フェイシャル30分(シートパック付き)+ 頭ほぐし35分 + よもぎ蒸し', cats:['facial','rec'], g:'facial'},
  {id:'set90',    name:'Relax アロマボディトリートメント + よもぎ蒸し', min:90,  price:10000, desc:'アロマボディ + よもぎ蒸し', cats:['steam','rec'], g:'steam'},
  {id:'set110',   name:'満足 アロマボディトリートメント + よもぎ蒸し',  min:110, price:12000, desc:'アロマボディ + よもぎ蒸し', cats:['steam'],       g:'steam'},
  {id:'set130',   name:'疲労回復 アロマボディトリートメント + よもぎ蒸し', min:130, price:14000, desc:'アロマボディ + よもぎ蒸し', cats:['steam'],    g:'steam'},
  {id:'course110',name:'全身満たされる110分コース', min:110, price:13000, desc:'ボディ50分 + ローズフェイシャル + よもぎ蒸し(おすすめ)', cats:['steam','rec'], g:'steam'},
  {id:'course140',name:'全身満たされる140分コース', min:140, price:18600, desc:'ボディ80分 + ローズフェイシャル + まこも蒸し',             cats:['steam'],       g:'steam'},
  {id:'p-yomogi',      name:'ペア よもぎ蒸し(2名分)',                  min:40, price:6000,  desc:'大切な人と一緒に',        cats:['pair'], g:'pair', kind:'pair'},
  {id:'p-makomo',      name:'ペア まこも蒸し(2名分)',                  min:40, price:12000, desc:'大切な人と一緒に',        cats:['pair'], g:'pair', kind:'pair'},
  {id:'p-yomogi-foot', name:'ペア よもぎ蒸し + フットまたは頭ほぐし30分(2名分)', min:70, price:12000, desc:'蒸しのあとに足と頭を癒す', cats:['pair'], g:'pair', kind:'pair'},
  {id:'p-makomo-foot', name:'ペア まこも蒸し + フットまたは頭ほぐし30分(2名分)', min:70, price:18000, desc:'蒸しのあとに足と頭を癒す', cats:['pair'], g:'pair', kind:'pair'},
  {id:'omakase', name:'おまかせ相談予約', min:60, price:null, desc:'セラピストに相談して、その日の内容を決めるコースです。', cats:['omakase'], g:'omakase', kind:'omakase'}
];
let OPTIONS = [
  {id:'head', name:'頭ほぐし',   min:10, price:1500},
  {id:'foot', name:'フット',     min:10, price:1500},
  {id:'hand', name:'ハンド',     min:10, price:1500},
  {id:'stone',name:'ホットストーン', min:0, price:2000},
  {id:'bath', name:'フットバス', min:0,  price:1000}
];
```

(b) `OMAKASE_MINS` の行の直後に取得処理を追加:

```js
let MENU_LOADING = !!CONFIG.GAS_URL;
/** スプレッドシートのメニューを取得して差し替える。失敗時は予備配列のまま */
async function loadMenu(){
  if(!CONFIG.GAS_URL){ MENU_LOADING = false; return; }
  try{
    const r = await fetch(`${CONFIG.GAS_URL}?action=menu`);
    const j = await r.json();
    if(j.ok && Array.isArray(j.menu) && j.menu.length){ MENU = j.menu; OPTIONS = Array.isArray(j.options) ? j.options : []; }
  }catch(e){ /* 予備配列で続行 */ }
  MENU_LOADING = false; render();
}
```

(c) `menu()` ビューの先頭(`const cat = CATS.find(...)` の前)に追加:

```js
    if(MENU_LOADING) return `<p class="note" style="text-align:center;padding:40px 0">メニューを読み込み中…</p>`;
```

(d) `errMsg` に追加(`const errMsg = c => ({` の直後):

```js
bad_menu:'選んだメニューは現在ご予約いただけません。メニューを選び直してください', 
```

(e) `submit()` のペイロードを置き換え:

```js
  const payload = {
    date:S.date, time:S.time, menuId:m.id, optionIds:S.opts.slice(),
    ...(m.kind==='omakase' ? {minutes:S.omakase.mins} : {}),
    name:i.name.trim(), kana:i.kana.trim(), tel:i.tel.trim(), email:i.email.trim(),
    visit:i.visit==='first' ? '初回' : '再来', note:notes, website:i.website
  };
```

そして `if(j.error === 'conflict'){ … }` の直後に追加:

```js
        if(j.error === 'bad_menu'){
          S.submitting = false; S.banner = errMsg('bad_menu'); MENU_LOADING = true; loadMenu(); render(); return;
        }
```

(`S.menu` / `S.opts` は「戻る」でメニューを選び直す前提で残す。`loadMenu()` で最新メニューに差し替わる。)

(f) `bootstrap()` の先頭(`const link = ...` の前)に追加:

```js
  loadMenu();
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: 既存4件 + 管理画面の通知テスト + 新規すべて PASS。特に `booking.test.js`(デモの予約フロー)と LIFF のテストが通ること。

---

### Task 4: admin.html と CLAUDE.md

**Files:**
- Modify: `admin.html`(`MENU` 定義 130-135 行、`render()` 直前の起動処理)
- Modify: `tests/menu-front.test.js`(admin のテスト追記)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `GET ?action=menu` の `menu`(`id,name,min,price`)
- Produces: admin の `MENU: Array<{name,min,price,label}>`(`newForm` / `create` / プルダウンが参照する形は変えない)

- [ ] **Step 1: 失敗するテストを書く**

`tests/menu-front.test.js` に追記:

```js
test('admin: 予備配列は index.html の表示ON(おまかせを除く)と同じメニュー・料金', () => {
  const idx = load('index.html').w;
  const adm = load('admin.html').w;
  const im = JSON.parse(idx.eval('JSON.stringify(MENU)')).filter(m => m.kind !== 'omakase');
  const am = JSON.parse(adm.eval('JSON.stringify(MENU)'));
  assert.deepStrictEqual(am.map(m => [m.name, m.min, m.price]), im.map(m => [m.name, m.min, m.price]));
});

test('admin: menu API の内容が予約追加のメニュー選択に出る', async () => {
  const { click, type, d } = load('admin.html', {
    replace: [["GAS_URL:'',", "GAS_URL:'https://gas.test/exec',"]],
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/menu-front.test.js`
Expected: admin の2件が FAIL

- [ ] **Step 3: 実装**

(a) `admin.html` の `const MENU = [...].map(...)` を `let` にし、`index.html` の表示ONメニューから**おまかせを除いた**順序・名前・分・料金に置き換える(名前の `label` は `${name} ${min}分` のまま):

```js
// 予備: menu API が使えないとき(デモ・取得失敗)用。index.html の予備配列と同じ内容(おまかせを除く)
let MENU = [
  ['アロマボディトリートメント × まこも蒸し(初回限定)',100,10000],
  ['Relax アロマボディトリートメント',60,7000],['満足 アロマボディトリートメント',80,9000],['疲労回復 アロマボディトリートメント',100,11000],
  ['ローズフェイシャル A',40,5600],['ローズフェイシャル B',65,8100],['ローズフェイシャル C',70,11600],['ローズフェイシャル D',95,14100],
  ['Relax アロマボディトリートメント + よもぎ蒸し',90,10000],['満足 アロマボディトリートメント + よもぎ蒸し',110,12000],['疲労回復 アロマボディトリートメント + よもぎ蒸し',130,14000],
  ['全身満たされる110分コース',110,13000],['全身満たされる140分コース',140,18600],
  ['ペア よもぎ蒸し(2名分)',40,6000],['ペア まこも蒸し(2名分)',40,12000],
  ['ペア よもぎ蒸し + フットまたは頭ほぐし30分(2名分)',70,12000],['ペア まこも蒸し + フットまたは頭ほぐし30分(2名分)',70,18000]
].map(([name,min,price]) => ({name,min,price,label:`${name} ${min}分`}));
```

(b) `api()` 関数の直前に追加:

```js
/** スプレッドシートのメニューを取得。失敗時は予備配列のまま(おまかせは管理画面では選べない) */
async function loadMenu(){
  if(!CONFIG.GAS_URL) return;
  try{
    const r = await fetch(`${CONFIG.GAS_URL}?action=menu`);
    const j = await r.json();
    if(j.ok && Array.isArray(j.menu)){
      const list = j.menu.filter(m => m.kind !== 'omakase').map(m => ({name:m.name, min:m.min, price:m.price, label:`${m.name} ${m.min}分`}));
      if(list.length){ MENU = list; if(A.form && A.form.menuIdx !== 'x'){ A.form.menuIdx = '0'; A.form.minutes = MENU[0].min; A.form.total = MENU[0].price; } render(); }
    }
  }catch(e){ /* 予備配列で続行 */ }
}
```

(c) ファイル末尾の `render();`(`</script>` の直前)を次に置き換え:

```js
render();
loadMenu();
```

(d) `CLAUDE.md` を更新:
- 「ファイル構成」の `docs/` 行の下に `docs/superpowers/` の説明を追記。
- 「API」に `GET ?action=menu`(認証なし、表示ONのみ)を追記し、`POST`(予約登録)の説明を「`menuId`+`optionIds`(+omakaseのみ`minutes`)を受け取り、料金・所要分・名前はサーバーがシートから決める。エラー `bad_menu` / `bad_minutes`」に変更。
- 「データモデル」に `メニュー`(10列)・`オプション`(6列)シートを追記(列は `MENU_HEADERS` / `OPTION_HEADERS`、メニューIDは変更禁止、表示=OFF で非表示)。
- 「設定の置き場所」の「メニュー/オプションは…コピーがある」の行を、「メニューの正は `メニュー`/`オプション`シート。`index.html`/`admin.html` の予備配列は `SEED_MENU`(表示ON)と同じ内容に保つ(`tests/menu-front.test.js` が検査)」に置換。
- 「未実装」1番から「メニュー管理」を削除し、「実装済み」に追記。
- 「開発コマンド」の注意に「GASを更新したら `setup` を再実行(メニュー/オプションシートが作られる)。**GAS を先にデプロイしてから** index.html を公開する(順序が逆だと予約が `bad_menu` になる)」を追記。
- 「仮置きの値」を更新: ペアの所要分70(確認済み)、単品蒸しは表示OFF、初回限定は `first100`。

- [ ] **Step 4: 全体の確認**

Run: `npm test` → すべて PASS。`npm run check:gas` → `syntax OK`。

実機確認の案内(自動化しない): テスト用スプレッドシートで `setup` を実行 → `メニュー`/`オプション`シートができること → `…/exec?action=menu` が JSON を返すこと → 料金セルを編集して5分後に反映されること → 予約サイトから予約して、予約シートの金額がシートの値と一致すること。

---

## Self-Review

- **Spec coverage:** シート2つ(Task 1/2)、`menu` API+5分キャッシュ(Task 2)、`setup` の初期データ冪等(Task 2 `getSeededSheet_`)、予備配列とデモ(Task 3/4)、再計算と `bad_menu`/`bad_minutes`(Task 1/2/3)、`adminCreate_` 不変(Global Constraints)、初期データ表(Task 1 `SEED_MENU`、`first100` 含む)、単品蒸し OFF(Task 1)、CLAUDE.md 更新(Task 4)。
- **Placeholder scan:** なし(CLAUDE.md の更新項目は変更内容を具体的に列挙)。
- **Type consistency:** `parseMenuRows_` の出力キー `{id,name,min,price,desc,cats,g,kind,show,order}` を `publicMenu_` / `calcBooking_` / フロントが同名で使う。API の `menu` は `show` を除いた同形。`optionIds`(配列)・`minutes`(omakaseのみ)は Task 2/3 で一致。
- **Review Focus:** 5項目とも Task 1(1〜4)・Task 3(5)にテストあり。
- **デプロイ順序の注意:** GAS を先に更新・`setup` 再実行 → その後フロント公開。逆順だと旧GASが新ペイロード(`total` 無し)を受けて壊れる。
