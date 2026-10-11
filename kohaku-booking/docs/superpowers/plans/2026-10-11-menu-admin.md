# メニュー・料金設定(管理画面から編集) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理画面からメニュー・オプションの編集と新規追加ができ、保存すると予約サイトへ即反映される。

**Architecture:** GAS に検証・行組み立て・採番の純関数と、シート1行を書く保存関数(`saveItem_`)を足し、管理系API 3本(`adminMenu` / `adminMenuSave` / `adminOptionSave`)で公開する。`メニュー`/`オプション`シートが引き続き正。管理画面は既存の `NAV`/`VIEWS` パターンに「メニュー」画面を足す。

**Tech Stack:** Google Apps Script、バニラJS(単一HTML)、`node --test` + jsdom、Node `vm`(GASの純関数・保存処理のテスト)

**Spec:** `docs/superpowers/specs/2026-10-11-menu-admin-design.md`(前提: `docs/superpowers/specs/2026-10-06-menu-sheet-design.md`)

## Global Constraints
- シートの列定義(`MENU_HEADERS` 10列 / `OPTION_HEADERS` 6列)は変えない。列の追加・並び替え・削除は禁止
- メニューID・オプションIDは作成後に変更しない。削除機能は作らない(やめるものは表示=OFF)
- 書き込みはすべて `setNumberFormat('@')` の文字列で行う(数式注入・先頭0落ち防止)
- 管理系APIは `adminAuth_` 必須。入力検証は GAS 側で必ず行う(クライアント検証は補助)
- 検証違反は `{ok:false, error:'bad_field', field:'<項目名>'}`、ID重複は `{ok:false, error:'duplicate_id', field:'id'}`、対象なしは `not_found`
- カテゴリの許可値は `first, rec, aroma, facial, steam, pair, omakase`、グループは `aroma, facial, steam, pair, omakase`、種別は `''` / `pair` / `omakase`
- 保存後は `CacheService.getScriptCache().remove('menu:v1')` で公開APIのキャッシュを消す
- フロントは依存なしのバニラJS単一HTML。ユーザー入力は必ず `esc()` で描画
- デザイントークン: cream `#F6EFE3` / paper `#FFFCF7` / sand `#EADBC3` / caramel `#B58553` / brown `#6E5238` / ink `#33261C` / moss `#44593F` / danger `#A5473A`
- コミットは**対象パスを明示**(`git add -A` 禁止)。メッセージ末尾に `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- 作業ディレクトリは `kohaku-booking/`。テストは `npm test`、GAS構文は `npm run check:gas`
- vm で読んだ GAS の配列/オブジェクトは別レルム。テストでは `JSON.parse(JSON.stringify(x))` か `Array.from` を通してから `deepStrictEqual` する

## Review Focus
1. **保存で他の行を壊さない**: 更新は指定IDの行だけ、新規は末尾の次行だけに書く(→ Task 2 のフェイクシートのテスト)
2. **IDは書き換わらない**: 更新時に `item.id` と違う値を送っても、別の行を更新したりIDが変わったりしない(→ Task 2)
3. **全角数字・カンマ・円記号の料金入力**(`７,０００円` など)が正しく数値になり、負数・小数・1,000,001は拒否される(→ Task 1)
4. **「おまかせ」で所要分が空/0でも保存できる**。通常メニューでは空を拒否する(→ Task 1)
5. **名前に `<img onerror=…>` を入れても画面で実行されない**(→ Task 3)

## 事前条件
着手前に、未コミットの設計書 `docs/superpowers/specs/2026-10-11-menu-admin-design.md` と本計画書をコミットしておく。

---

## File Structure
| ファイル | 役割 | 変更 |
|---|---|---|
| `gas/Code.gs` | 検証・行組み立て・採番(純関数)、保存・取得・API配線 | Task 1, 2 |
| `admin.html` | 「メニュー」画面(一覧・編集シート・新規追加)、デモバックエンド | Task 3 |
| `tests/gas-menu-admin.test.js` | GASの純関数・保存処理のテスト(新規) | Task 1, 2 |
| `tests/admin.test.js` | 管理画面のテスト追加 | Task 3 |
| `CLAUDE.md` / `docs/deploy-checklist.md` | ドキュメント | Task 4 |

---

### Task 1: GAS 検証・行組み立て・採番の純関数

**Files:**
- Modify: `gas/Code.gs`(`menuApi_` の直後あたりに追加)
- Create: `tests/gas-menu-admin.test.js`

**Interfaces:**
- Consumes: 既存の `numOrNull_`(全角数字・カンマ・円記号を除去して数値/null/NaN を返す)
- Produces(Task 2 が使う):
  - 定数 `MENU_CATS`, `MENU_GROUPS`, `MENU_KINDS`
  - `intOrNull_(v) → number|null|NaN`(整数のみ許可。空は `null`、不正は `NaN`)
  - `validateMenuItem_(item, create, ids) → ''|{error, field}`
  - `validateOptionItem_(item, create, ids) → ''|{error, field}`
  - `menuRowFromItem_(item) → string[10]` / `optionRowFromItem_(item) → string[6]`
  - `nextItemId_(prefix, ids) → string`

- [ ] **Step 1: 失敗するテストを書く**

`tests/gas-menu-admin.test.js` を新規作成:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

function loadGas() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const ctx = vm.createContext({ console });
  vm.runInContext(src + '\n;this.__c = { MENU_HEADERS, OPTION_HEADERS, MENU_CATS, MENU_GROUPS, MENU_KINDS };', ctx);
  return Object.assign(ctx, ctx.__c);
}
const j = o => JSON.parse(JSON.stringify(o));
const okItem = (o = {}) => Object.assign({ id: '', name: 'テスト', min: 60, price: 7000, desc: '', cats: ['aroma'], g: 'aroma', kind: '', show: true, order: 5 }, o);
const okOpt = (o = {}) => Object.assign({ id: '', name: '頭ほぐし', min: 10, price: 1500, show: true, order: 1 }, o);
const bad = f => ({ error: 'bad_field', field: f });

test('定数: カテゴリ・グループ・種別の許可値', () => {
  const g = loadGas();
  assert.deepStrictEqual(j(g.MENU_CATS), ['first', 'rec', 'aroma', 'facial', 'steam', 'pair', 'omakase']);
  assert.deepStrictEqual(j(g.MENU_GROUPS), ['aroma', 'facial', 'steam', 'pair', 'omakase']);
  assert.deepStrictEqual(j(g.MENU_KINDS), ['', 'pair', 'omakase']);
});

test('intOrNull_: 全角・カンマ・円記号を許し、小数・負数・文字は NaN', () => {
  const g = loadGas();
  assert.strictEqual(g.intOrNull_('７,０００円'), 7000);
  assert.strictEqual(g.intOrNull_(' 60 '), 60);
  assert.strictEqual(g.intOrNull_(''), null);
  assert.strictEqual(g.intOrNull_(null), null);
  assert.ok(Number.isNaN(g.intOrNull_('12.5')));
  assert.ok(Number.isNaN(g.intOrNull_('-1')));
  assert.ok(Number.isNaN(g.intOrNull_('abc')));
});

test('validateMenuItem_: 正常値は空文字', () => {
  const g = loadGas();
  assert.strictEqual(g.validateMenuItem_(okItem(), true, []), '');
  assert.strictEqual(g.validateMenuItem_(okItem({ id: 'my-menu_1' }), true, ['a']), '');
  assert.strictEqual(g.validateMenuItem_(okItem({ price: null }), false, []), '');   // 料金空=当日案内
  assert.strictEqual(g.validateMenuItem_(okItem({ price: '７,０００円', min: '60' }), false, []), '');
});

test('validateMenuItem_: 名前・説明・ID', () => {
  const g = loadGas();
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ name: '' }), true, [])), bad('name'));
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ name: '   ' }), true, [])), bad('name'));
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ name: 'あ'.repeat(61) }), true, [])), bad('name'));
  assert.strictEqual(g.validateMenuItem_(okItem({ name: 'あ'.repeat(60) }), true, []), '');
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ desc: 'あ'.repeat(201) }), true, [])), bad('desc'));
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ id: 'a b' }), true, [])), bad('id'));
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ id: '日本語' }), true, [])), bad('id'));
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ id: 'a'.repeat(41) }), true, [])), bad('id'));
  assert.deepStrictEqual(j(g.validateMenuItem_(okItem({ id: 'aroma60' }), true, ['aroma60'])), { error: 'duplicate_id', field: 'id' });
  // 更新時は id を検証しない(検索キーとして使うだけ)
  assert.strictEqual(g.validateMenuItem_(okItem({ id: 'aroma60' }), false, ['aroma60']), '');
});

test('validateMenuItem_: 所要分・料金の境界値', () => {
  const g = loadGas();
  const v = o => j(g.validateMenuItem_(okItem(o), true, []));
  assert.deepStrictEqual(v({ min: 9 }), bad('min'));
  assert.strictEqual(v({ min: 10 }), '');
  assert.strictEqual(v({ min: 300 }), '');
  assert.deepStrictEqual(v({ min: 301 }), bad('min'));
  assert.deepStrictEqual(v({ min: null }), bad('min'));
  assert.deepStrictEqual(v({ min: '' }), bad('min'));
  assert.deepStrictEqual(v({ min: '12.5' }), bad('min'));
  assert.strictEqual(v({ price: 0 }), '');
  assert.strictEqual(v({ price: 1000000 }), '');
  assert.deepStrictEqual(v({ price: 1000001 }), bad('price'));
  assert.deepStrictEqual(v({ price: -1 }), bad('price'));
  assert.deepStrictEqual(v({ price: '12.5' }), bad('price'));
  assert.deepStrictEqual(v({ price: 'abc' }), bad('price'));
});

test('validateMenuItem_: おまかせは所要分が空/0でもよいが、300超は不可', () => {
  const g = loadGas();
  const v = o => j(g.validateMenuItem_(okItem(Object.assign({ kind: 'omakase', cats: ['omakase'], g: 'omakase', price: null }, o)), true, []));
  assert.strictEqual(v({ min: null }), '');
  assert.strictEqual(v({ min: '' }), '');
  assert.strictEqual(v({ min: 0 }), '');
  assert.deepStrictEqual(v({ min: 301 }), bad('min'));
  assert.deepStrictEqual(v({ min: -5 }), bad('min'));
});

test('validateMenuItem_: 種別・カテゴリ・グループ・表示・並び順', () => {
  const g = loadGas();
  const v = o => j(g.validateMenuItem_(okItem(o), true, []));
  assert.deepStrictEqual(v({ kind: 'bulk' }), bad('kind'));
  assert.strictEqual(v({ kind: 'pair' }), '');
  assert.deepStrictEqual(v({ cats: [] }), bad('cats'));
  assert.deepStrictEqual(v({ cats: 'aroma' }), bad('cats'));
  assert.deepStrictEqual(v({ cats: ['aroma', 'unknown'] }), bad('cats'));
  assert.deepStrictEqual(v({ g: 'sauna' }), bad('g'));
  assert.deepStrictEqual(v({ show: 'ON' }), bad('show'));
  assert.deepStrictEqual(v({ order: null }), bad('order'));
  assert.deepStrictEqual(v({ order: -1 }), bad('order'));
  assert.deepStrictEqual(v({ order: 10000 }), bad('order'));
  assert.strictEqual(v({ order: 0 }), '');
  assert.strictEqual(v({ order: '9999' }), '');
});

test('validateOptionItem_: 料金は必須、所要分は0〜300', () => {
  const g = loadGas();
  const v = (o, create = true, ids = []) => j(g.validateOptionItem_(okOpt(o), create, ids));
  assert.strictEqual(v({}), '');
  assert.strictEqual(v({ min: 0 }), '');
  assert.deepStrictEqual(v({ min: 301 }), bad('min'));
  assert.deepStrictEqual(v({ min: null }), bad('min'));
  assert.deepStrictEqual(v({ price: null }), bad('price'));
  assert.deepStrictEqual(v({ price: -1 }), bad('price'));
  assert.deepStrictEqual(v({ name: '' }), bad('name'));
  assert.deepStrictEqual(v({ show: 1 }), bad('show'));
  assert.deepStrictEqual(v({ order: 'x' }), bad('order'));
  assert.deepStrictEqual(v({ id: 'head' }, true, ['head']), { error: 'duplicate_id', field: 'id' });
  assert.deepStrictEqual(v({ id: 'a b' }, true, []), bad('id'));
});

test('menuRowFromItem_: 全て文字列で、MENU_HEADERS の並びになる', () => {
  const g = loadGas();
  const row = j(g.menuRowFromItem_({ id: 'm1', name: ' テスト ', min: '60', price: null, desc: ' 説明 ', cats: ['aroma', 'first'], g: 'aroma', kind: 'pair', show: false, order: '3' }));
  assert.deepStrictEqual(row, ['m1', 'テスト', '60', '', '説明', 'aroma,first', 'aroma', 'pair', 'OFF', '3']);
  assert.strictEqual(row.length, g.MENU_HEADERS.length);
  const omk = j(g.menuRowFromItem_({ id: 'omakase', name: 'おまかせ', min: null, price: null, desc: '', cats: ['omakase'], g: 'omakase', kind: 'omakase', show: true, order: 99 }));
  assert.deepStrictEqual(omk, ['omakase', 'おまかせ', '', '', '', 'omakase', 'omakase', 'omakase', 'ON', '99']);
  const yen = j(g.menuRowFromItem_({ id: 'x', name: 'x', min: 60, price: '７,０００円', desc: '', cats: ['aroma'], g: 'aroma', kind: '', show: true, order: 1 }));
  assert.strictEqual(yen[3], '7000');
  assert.ok(yen.every(c => typeof c === 'string'));
});

test('optionRowFromItem_: OPTION_HEADERS の並びになる', () => {
  const g = loadGas();
  const row = j(g.optionRowFromItem_({ id: 'head', name: ' 頭ほぐし ', min: 10, price: '1,500', show: true, order: 1 }));
  assert.deepStrictEqual(row, ['head', '頭ほぐし', '10', '1500', 'ON', '1']);
  assert.strictEqual(row.length, g.OPTION_HEADERS.length);
});

test('nextItemId_: 既存IDの数値部の最大+1(数字を含まないIDが混ざっても落ちない)', () => {
  const g = loadGas();
  assert.strictEqual(g.nextItemId_('menu', []), 'menu-1');
  assert.strictEqual(g.nextItemId_('menu', ['menu-3', 'menu-10', 'aroma60', 'menu-x', 'xmenu-99']), 'menu-11');
  assert.strictEqual(g.nextItemId_('opt', ['head', 'bath']), 'opt-1');
  assert.strictEqual(g.nextItemId_('opt', ['opt-2']), 'opt-3');
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/gas-menu-admin.test.js`
Expected: FAIL(`MENU_CATS` が未定義でファイル全体のロードに失敗する)

- [ ] **Step 3: 実装する(`gas/Code.gs`)**

`menuApi_` の定義の直後(`/* ---------- 検証 ---------- */` の前)に追加:
```js
/* =========================================================
 * メニュー・料金設定(管理画面から編集)
 *  シート(メニュー/オプション)が正。管理画面は行を読み書きするだけ。IDは作成後に変更しない・削除しない。
 * ========================================================= */
const MENU_CATS = ['first', 'rec', 'aroma', 'facial', 'steam', 'pair', 'omakase'];   // index.html の CATS と同じ
const MENU_GROUPS = ['aroma', 'facial', 'steam', 'pair', 'omakase'];
const MENU_KINDS = ['', 'pair', 'omakase'];

/** 整数だけを許す数値化(全角・カンマ・円記号は numOrNull_ が除去)。空は null、不正は NaN */
function intOrNull_(v) {
  const n = numOrNull_(v);
  if (n === null || isNaN(n)) return n;
  return Math.floor(n) === n ? n : NaN;
}

function fieldErr_(field) { return { error: 'bad_field', field: field }; }
function strOf_(v) { return String(v === undefined || v === null ? '' : v); }

/** ID・名前の共通検証。問題なければ null */
function validateCommon_(item, create, ids) {
  const id = strOf_(item.id).trim();
  if (create) {
    if (id && !/^[A-Za-z0-9_-]{1,40}$/.test(id)) return fieldErr_('id');
    if (id && ids.indexOf(id) >= 0) return { error: 'duplicate_id', field: 'id' };
  }
  const name = strOf_(item.name).trim();
  if (name.length < 1 || name.length > 60) return fieldErr_('name');
  if (typeof item.show !== 'boolean') return fieldErr_('show');
  const order = intOrNull_(item.order);
  if (order === null || isNaN(order) || order > 9999) return fieldErr_('order');
  return null;
}

/** メニュー1件の検証。問題なければ ''、あれば {error, field}。ids は既存のメニューID一覧(create時の重複検査用) */
function validateMenuItem_(item, create, ids) {
  item = item || {};
  const common = validateCommon_(item, create, ids || []);
  if (common) return common;
  if (strOf_(item.desc).length > 200) return fieldErr_('desc');
  const kind = strOf_(item.kind);
  if (MENU_KINDS.indexOf(kind) < 0) return fieldErr_('kind');
  const min = intOrNull_(item.min);
  if (kind === 'omakase') {
    if (min !== null && (isNaN(min) || min > 300)) return fieldErr_('min');
  } else if (min === null || isNaN(min) || min < 10 || min > 300) {
    return fieldErr_('min');
  }
  const price = intOrNull_(item.price);
  if (price !== null && (isNaN(price) || price > 1000000)) return fieldErr_('price');
  const cats = item.cats;
  if (!Array.isArray(cats) || cats.length === 0 || cats.some(function (c) { return MENU_CATS.indexOf(c) < 0; })) return fieldErr_('cats');
  if (MENU_GROUPS.indexOf(strOf_(item.g)) < 0) return fieldErr_('g');
  return '';
}

/** オプション1件の検証(料金は必須、所要分は0〜300) */
function validateOptionItem_(item, create, ids) {
  item = item || {};
  const common = validateCommon_(item, create, ids || []);
  if (common) return common;
  const min = intOrNull_(item.min);
  if (min === null || isNaN(min) || min > 300) return fieldErr_('min');
  const price = intOrNull_(item.price);
  if (price === null || isNaN(price) || price > 1000000) return fieldErr_('price');
  return '';
}

/** 検証済みの item → メニューシートの1行(MENU_HEADERS の並び、全て文字列) */
function menuRowFromItem_(item) {
  const min = intOrNull_(item.min), price = intOrNull_(item.price);
  return [strOf_(item.id), strOf_(item.name).trim(), min === null ? '' : String(min), price === null ? '' : String(price),
          strOf_(item.desc).trim(), item.cats.join(','), strOf_(item.g), strOf_(item.kind), item.show ? 'ON' : 'OFF', String(intOrNull_(item.order))];
}
/** 検証済みの item → オプションシートの1行(OPTION_HEADERS の並び、全て文字列) */
function optionRowFromItem_(item) {
  return [strOf_(item.id), strOf_(item.name).trim(), String(intOrNull_(item.min)), String(intOrNull_(item.price)),
          item.show ? 'ON' : 'OFF', String(intOrNull_(item.order))];
}

/** 既存IDの「<prefix>-数字」の最大+1 で新しいIDを作る */
function nextItemId_(prefix, ids) {
  const re = new RegExp('^' + prefix + '-(\\d+)$');
  let max = 0;
  (ids || []).forEach(function (id) { const m = re.exec(String(id)); if (m) max = Math.max(max, Number(m[1])); });
  return prefix + '-' + (max + 1);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/gas-menu-admin.test.js && npm test && npm run check:gas`
Expected: 新規テスト全て PASS、既存も全て PASS、`syntax OK`

- [ ] **Step 5: コミット**
```bash
git add gas/Code.gs tests/gas-menu-admin.test.js
git commit -m "kohaku-booking: メニュー編集の検証・行組み立て・採番の純関数を追加"
```

---

### Task 2: GAS 取得・保存・API配線

**Files:**
- Modify: `gas/Code.gs`(Task 1 のブロックの直後に関数を追加、`handleAction_` に case を追加)
- Modify: `tests/gas-menu-admin.test.js`

**Interfaces:**
- Consumes: Task 1 の全関数・定数、既存の `loadMenu_` / `getMenuSheet_` / `getOptionSheet_` / `byOrder_` / `adminAuth_`
- Produces:
  - `adminMenu_() → {ok, menu, options, cats, groups, kinds}`
  - `saveItem_(kind, d) → {ok:true,id}|{ok:false,error,field?}`(`kind` は `'menu'` / `'option'`、`d={item, create}`)
  - `handleAction_` の `adminMenu` / `adminMenuSave` / `adminOptionSave`

- [ ] **Step 1: 失敗するテストを書く**

`tests/gas-menu-admin.test.js` に追記:
```js
/* ----- 保存処理: フェイクのシート/キャッシュで書き込み位置とキャッシュ消去を確かめる ----- */
function fakeSheet(headers, rows) {
  const data = [headers.slice()].concat(rows.map(r => r.slice()));
  return {
    data,
    getLastRow: () => data.length,
    getRange(r, c, nr, nc) {
      const rng = {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) out.push((data[r - 1 + i] || []).slice(c - 1, c - 1 + nc));
          return out;
        },
        setValues(v) {
          for (let i = 0; i < v.length; i++) {
            data[r - 1 + i] = data[r - 1 + i] || [];
            for (let k = 0; k < v[i].length; k++) data[r - 1 + i][c - 1 + k] = v[i][k];
          }
          return rng;
        },
        setNumberFormat() { return rng; }
      };
      return rng;
    }
  };
}
const MENU_ROWS = [
  ['aroma60', 'Relax', '60', '7000', '説明A', 'aroma,first', 'aroma', '', 'ON', '2'],
  ['hidden1', '非表示', '40', '3000', '', 'steam', 'steam', '', 'OFF', '9'],
  ['pair1', 'ペア', '40', '6000', '', 'pair', 'pair', 'pair', 'ON', '1']
];
const OPT_ROWS = [['head', '頭ほぐし', '10', '1500', 'ON', '1']];
function gasWithSheets() {
  const g = loadGas();
  const sheets = { 'メニュー': fakeSheet(g.MENU_HEADERS, MENU_ROWS), 'オプション': fakeSheet(g.OPTION_HEADERS, OPT_ROWS) };
  const removed = [];
  g.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] }) };
  g.CacheService = { getScriptCache: () => ({ get: k => (k === 'adm:tok' ? '1' : null), remove: k => removed.push(k), put() {} }) };
  return { g, sheets, removed };
}
const call = (g, action, extra) => j(g.handleAction_(Object.assign({ action, token: 'tok' }, extra)));

test('adminMenu: 表示OFFも含めて並び順で返し、選択肢も返す', () => {
  const { g } = gasWithSheets();
  const r = call(g, 'adminMenu');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.menu.map(m => m.id), ['pair1', 'aroma60', 'hidden1']);
  assert.strictEqual(r.menu.find(m => m.id === 'hidden1').show, false);
  assert.deepStrictEqual(r.options.map(o => o.id), ['head']);
  assert.deepStrictEqual(r.cats, ['first', 'rec', 'aroma', 'facial', 'steam', 'pair', 'omakase']);
  assert.deepStrictEqual(r.groups, ['aroma', 'facial', 'steam', 'pair', 'omakase']);
  assert.deepStrictEqual(r.kinds, ['', 'pair', 'omakase']);
});

test('adminMenuSave(更新): 指定IDの行だけを書き換え、IDは変えず、キャッシュを消す', () => {
  const { g, sheets, removed } = gasWithSheets();
  const before = JSON.stringify(sheets['メニュー'].data);
  const r = call(g, 'adminMenuSave', { create: false, item: { id: 'aroma60', name: 'Relax 改', min: '70', price: '７,５００円', desc: '新説明', cats: ['aroma'], g: 'aroma', kind: '', show: false, order: 4 } });
  assert.deepStrictEqual(r, { ok: true, id: 'aroma60' });
  const d = sheets['メニュー'].data;
  assert.deepStrictEqual(d[1], ['aroma60', 'Relax 改', '70', '7500', '新説明', 'aroma', 'aroma', '', 'OFF', '4']);
  assert.deepStrictEqual(d[2], JSON.parse(before)[2]);   // 他の行は変わらない
  assert.deepStrictEqual(d[3], JSON.parse(before)[3]);
  assert.strictEqual(d.length, 4);                       // 行は増えない
  assert.deepStrictEqual(removed, ['menu:v1']);
});

test('adminMenuSave(更新): 存在しないIDは not_found、何も書かずキャッシュも消さない', () => {
  const { g, sheets, removed } = gasWithSheets();
  const before = JSON.stringify(sheets['メニュー'].data);
  const r = call(g, 'adminMenuSave', { create: false, item: { id: 'nothing', name: 'x', min: 60, price: 1, desc: '', cats: ['aroma'], g: 'aroma', kind: '', show: true, order: 1 } });
  assert.deepStrictEqual(r, { ok: false, error: 'not_found' });
  assert.strictEqual(JSON.stringify(sheets['メニュー'].data), before);
  assert.deepStrictEqual(removed, []);
  const r2 = call(g, 'adminMenuSave', { create: false, item: { id: '', name: 'x', min: 60, price: 1, desc: '', cats: ['aroma'], g: 'aroma', kind: '', show: true, order: 1 } });
  assert.deepStrictEqual(r2, { ok: false, error: 'not_found' });
});

test('adminMenuSave(新規): IDが空なら自動採番して末尾の次の行に書く', () => {
  const { g, sheets, removed } = gasWithSheets();
  const r = call(g, 'adminMenuSave', { create: true, item: { id: '', name: '新メニュー', min: 50, price: 5000, desc: '', cats: ['aroma', 'rec'], g: 'aroma', kind: '', show: true, order: 10 } });
  assert.deepStrictEqual(r, { ok: true, id: 'menu-1' });
  const d = sheets['メニュー'].data;
  assert.strictEqual(d.length, 5);
  assert.deepStrictEqual(d[4], ['menu-1', '新メニュー', '50', '5000', '', 'aroma,rec', 'aroma', '', 'ON', '10']);
  assert.deepStrictEqual(removed, ['menu:v1']);
  const r2 = call(g, 'adminMenuSave', { create: true, item: { id: '', name: '2つ目', min: 50, price: null, desc: '', cats: ['aroma'], g: 'aroma', kind: '', show: true, order: 11 } });
  assert.deepStrictEqual(r2, { ok: true, id: 'menu-2' });
});

test('adminMenuSave(新規): 重複IDと不正値は書き込まない', () => {
  const { g, sheets, removed } = gasWithSheets();
  const before = JSON.stringify(sheets['メニュー'].data);
  const item = { id: 'aroma60', name: 'x', min: 60, price: 1, desc: '', cats: ['aroma'], g: 'aroma', kind: '', show: true, order: 1 };
  assert.deepStrictEqual(call(g, 'adminMenuSave', { create: true, item }), { ok: false, error: 'duplicate_id', field: 'id' });
  assert.deepStrictEqual(call(g, 'adminMenuSave', { create: true, item: Object.assign({}, item, { id: '', price: -5 }) }), { ok: false, error: 'bad_field', field: 'price' });
  assert.strictEqual(JSON.stringify(sheets['メニュー'].data), before);
  assert.deepStrictEqual(removed, []);
});

test('adminOptionSave: 更新と新規(自動採番)', () => {
  const { g, sheets } = gasWithSheets();
  assert.deepStrictEqual(call(g, 'adminOptionSave', { create: false, item: { id: 'head', name: '頭ほぐし長め', min: 20, price: 2000, show: true, order: 1 } }), { ok: true, id: 'head' });
  assert.deepStrictEqual(sheets['オプション'].data[1], ['head', '頭ほぐし長め', '20', '2000', 'ON', '1']);
  assert.deepStrictEqual(call(g, 'adminOptionSave', { create: true, item: { id: '', name: 'フットバス', min: 0, price: 1000, show: false, order: 2 } }), { ok: true, id: 'opt-1' });
  assert.deepStrictEqual(sheets['オプション'].data[2], ['opt-1', 'フットバス', '0', '1000', 'OFF', '2']);
  assert.deepStrictEqual(call(g, 'adminOptionSave', { create: true, item: { id: '', name: 'x', min: 0, price: null, show: true, order: 3 } }), { ok: false, error: 'bad_field', field: 'price' });
});

test('メニュー管理のAPIはトークン無しだと auth で拒否される', () => {
  const { g } = gasWithSheets();
  for (const action of ['adminMenu', 'adminMenuSave', 'adminOptionSave']) {
    assert.deepStrictEqual(j(g.handleAction_({ action, create: true, item: {} })), { ok: false, error: 'auth' });
  }
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/gas-menu-admin.test.js`
Expected: Task 1 のテストは PASS、追加分は FAIL(`unknown_action`)

- [ ] **Step 3: 実装する(`gas/Code.gs`)**

3-1. Task 1 のブロック(`nextItemId_` の後ろ)に追加:
```js
/** 管理画面用の一覧。表示OFFも含め、キャッシュを使わずシートを直接読む */
function adminMenu_() {
  const m = loadMenu_();
  return { ok: true, menu: m.menu.slice().sort(byOrder_), options: m.options.slice().sort(byOrder_),
           cats: MENU_CATS, groups: MENU_GROUPS, kinds: MENU_KINDS };
}

/** メニュー/オプション1件を保存する。kind は 'menu' | 'option'、d = {item, create}。IDは書き換えない */
function saveItem_(kind, d) {
  const isMenu = kind === 'menu', item = d.item || {}, create = d.create === true;
  const sh = isMenu ? getMenuSheet_() : getOptionSheet_();
  const width = isMenu ? MENU_HEADERS.length : OPTION_HEADERS.length;
  const last = sh.getLastRow();
  const ids = last < 2 ? [] : sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); });
  const err = isMenu ? validateMenuItem_(item, create, ids) : validateOptionItem_(item, create, ids);
  if (err) return { ok: false, error: err.error, field: err.field };
  let id = strOf_(item.id).trim(), target;
  if (create) {
    if (!id) id = nextItemId_(isMenu ? 'menu' : 'opt', ids);
    target = last + 1;
  } else {
    const at = id ? ids.indexOf(id) : -1;
    if (at < 0) return { ok: false, error: 'not_found' };
    target = at + 2;
  }
  const cells = (isMenu ? menuRowFromItem_ : optionRowFromItem_)(Object.assign({}, item, { id: id }));
  sh.getRange(target, 1, 1, width).setNumberFormat('@').setValues([cells]);
  CacheService.getScriptCache().remove('menu:v1');   // 予約サイトへ即反映
  return { ok: true, id: id };
}
```
(`last < 2` のとき `create` の `target = last + 1` は見出しの次行=2行目になる。シートが空でも `getSeededSheet_` が初期データを入れるため通常は発生しない。)

3-2. `handleAction_` の `adminCustomerUpdate` の行の下に追加:
```js
    case 'adminMenu':       return adminAuth_(d) ? adminMenu_() : { ok: false, error: 'auth' };
    case 'adminMenuSave':   return adminAuth_(d) ? saveItem_('menu', d) : { ok: false, error: 'auth' };
    case 'adminOptionSave': return adminAuth_(d) ? saveItem_('option', d) : { ok: false, error: 'auth' };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test && npm run check:gas`
Expected: 全て PASS、`syntax OK`

- [ ] **Step 5: コミット**
```bash
git add gas/Code.gs tests/gas-menu-admin.test.js
git commit -m "kohaku-booking: メニュー・オプションの取得/保存APIを追加(保存後に公開キャッシュを消去)"
```

---

### Task 3: 管理画面「メニュー」

**Files:**
- Modify: `admin.html`(CSS、デモバックエンド、状態、画面、アクション、ハンドラ)
- Modify: `tests/admin.test.js`

**Interfaces:**
- Consumes: Task 2 の API(`adminMenu` / `adminMenuSave` / `adminOptionSave`)、既存の `NAV` / `VIEWS` / `esc` / `yen` / `api` / `render` / `logout` / `errMsg` / `loadMenu` / `A.busy` / `A.ok` / `A.msg`
- Produces: `A.menuAdm`(状態)、`menuAdminView()`、`menuSheetHTML()`、`menuSave()`

- [ ] **Step 1: 失敗するテストを書く**

`tests/admin.test.js` に追記:
```js
const loginMenu = async () => {
  const t = load('admin.html');
  t.type('#pw', 'demo'); t.click('[data-act=login]'); await sleep(1000);
  t.click('[data-act=section][data-v=menu]'); await sleep(700);
  return t;
};
const itemTexts = d => [...d.querySelectorAll('#menu-list .item')].map(x => x.textContent.replace(/\s+/g, ' '));

test('管理画面: メニュー一覧 → 編集 → 保存すると一覧に反映される(デモ表示)', async () => {
  const { click, type, text, d, errors } = await loginMenu();
  assert.ok(itemTexts(d).length >= 10, 'メニューが一覧に出る');
  click('#menu-list .item'); await sleep(50);
  assert.ok(d.querySelector('.sheet #m-name'), '編集シートが開く');
  assert.ok(d.querySelector('#m-id').readOnly || d.querySelector('#m-id').disabled, '既存のIDは編集できない');
  type('#m-name', '名前を変えたメニュー');
  type('#m-price', '７,５００円');
  click('[data-act=menusave]'); await sleep(700);
  assert.match(text(), /保存しました/);
  assert.ok(itemTexts(d).some(t => t.includes('名前を変えたメニュー') && t.includes('¥7,500')));
  assert.deepStrictEqual(errors, []);
});

test('管理画面: メニューの新規追加(ID空で自動採番)・検証エラーの表示', async () => {
  const { click, type, text, d, errors } = await loginMenu();
  click('[data-act=menunew]'); await sleep(50);
  // 名前が空のまま保存 → エラー
  click('[data-act=menusave]'); await sleep(700);
  assert.match(text('.sheet'), /名前は1〜60文字/);
  // 料金が負数 → エラー
  type('#m-name', 'テストメニュー'); type('#m-min', '50'); type('#m-price', '-1');
  d.querySelector('[data-k=cats][data-v=aroma]').click();
  click('[data-act=menusave]'); await sleep(700);
  assert.match(text('.sheet'), /料金は0〜1,000,000/);
  // 正しい値で保存
  type('#m-price', '5000');
  click('[data-act=menusave]'); await sleep(700);
  assert.match(text(), /追加しました/);
  const row = [...d.querySelectorAll('#menu-list .item')].find(x => x.textContent.includes('テストメニュー'));
  assert.ok(row, '一覧に追加される');
  row.click(); await sleep(50);
  assert.strictEqual(d.querySelector('#m-id').value, 'menu-1');
  assert.deepStrictEqual(errors, []);
});

test('管理画面: 表示を外すと一覧で「非表示」になる / おまかせは所要分が空でも保存できる', async () => {
  const { click, type, text, d, errors } = await loginMenu();
  click('#menu-list .item'); await sleep(50);
  d.querySelector('#m-show').click();
  click('[data-act=menusave]'); await sleep(700);
  assert.ok(itemTexts(d).some(t => t.includes('非表示')));
  const omk = [...d.querySelectorAll('#menu-list .item')].find(x => x.textContent.includes('おまかせ'));
  omk.click(); await sleep(50);
  type('#m-min', '');
  click('[data-act=menusave]'); await sleep(700);
  assert.match(text(), /保存しました/);
  assert.deepStrictEqual(errors, []);
});

test('管理画面: オプションの切替・編集と、名前のHTMLエスケープ', async () => {
  const { w, click, type, text, d, errors } = await loginMenu();
  click('[data-act=menutab][data-v=options]'); await sleep(50);
  assert.ok(itemTexts(d).some(t => t.includes('頭ほぐし')));
  click('#menu-list .item'); await sleep(50);
  assert.strictEqual(d.querySelector('#m-cats'), null, 'オプションにカテゴリは無い');
  type('#m-name', '<img src=x onerror=window.__pwned=1>');
  click('[data-act=menusave]'); await sleep(700);
  assert.match(text(), /保存しました/);
  assert.strictEqual(w.__pwned, undefined);
  assert.strictEqual(d.querySelector('#menu-list img'), null);
  assert.ok(itemTexts(d).some(t => t.includes('<img src=x')));
  assert.deepStrictEqual(errors, []);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/admin.test.js`
Expected: FAIL(`[data-v=menu]` が無い)

- [ ] **Step 3: 実装する(`admin.html`)**

3-1. CSS: `.hist li{...}` の行の下に追加:
```css
.chip[aria-pressed=true]{background:var(--brown);color:#fff;border-color:var(--brown)}
.mrow{display:flex;gap:8px;align-items:center;padding:14px 16px 0}
.chkline{display:inline-flex;align-items:center;gap:6px;margin:0 14px 6px 0;font-size:14px}
```

3-2. デモバックエンド。`const demoCustFields = new Map();` の行の**前**に追加:
```js
/** デモ表示のメニュー管理(画面内のメモリのみ。予備配列から作る) */
const demoMenuAdm = (() => {
  const menu = MENU.map((m, i) => ({id:m.id, name:m.name, min:m.min, price:m.price, desc:'', cats:['aroma'], g:'aroma', kind:'', show:true, order:i+1}));
  menu.push({id:'omakase', name:'おまかせ相談予約', min:0, price:null, desc:'', cats:['omakase'], g:'omakase', kind:'omakase', show:true, order:menu.length+1});
  const options = [{id:'head', name:'頭ほぐし', min:10, price:1500, show:true, order:1}, {id:'bath', name:'フットバス', min:0, price:1000, show:true, order:2}];
  return {menu, options};
})();
/** GAS の saveItem_ と同じ規則の簡易版(デモ用) */
function demoMenuSave(kind, extra){
  const isMenu = kind === 'menu', store = isMenu ? demoMenuAdm.menu : demoMenuAdm.options, it = extra.item || {};
  const bad = f => ({ok:false, error:'bad_field', field:f});
  // 全角数字・カンマ・円記号を許す(GAS の numOrNull_ / intOrNull_ と同じ規則)
  const intOf = v => {
    if(v === null || v === undefined) return null;
    const t = String(v).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[,，\s¥￥円]/g, '');
    return t === '' ? null : (/^\d+$/.test(t) ? Number(t) : NaN);
  };
  const name = String(it.name || '').trim();
  if(name.length < 1 || name.length > 60) return bad('name');
  const price = intOf(it.price);
  if(price !== null && (isNaN(price) || price > 1000000)) return bad('price');
  if(!isMenu && price === null) return bad('price');
  const min = intOf(it.min), omk = isMenu && it.kind === 'omakase';
  if(!(omk && min === null) && !(min !== null && !isNaN(min) && min >= (isMenu && !omk ? 10 : 0) && min <= 300)) return bad('min');
  if(isMenu && (!Array.isArray(it.cats) || !it.cats.length)) return bad('cats');
  const order = intOf(it.order);
  if(order === null || isNaN(order) || order > 9999) return bad('order');
  const vals = {name, min, price, show:!!it.show, order, ...(isMenu ? {desc:String(it.desc || ''), cats:it.cats.slice(), g:it.g, kind:it.kind || ''} : {})};
  if(extra.create){
    let id = String(it.id || '').trim();
    if(id && !/^[A-Za-z0-9_-]{1,40}$/.test(id)) return bad('id');
    if(id && store.some(x => x.id === id)) return {ok:false, error:'duplicate_id', field:'id'};
    if(!id){
      const p = isMenu ? 'menu' : 'opt', re = new RegExp('^' + p + '-(\\d+)$');
      id = p + '-' + (store.reduce((m, x) => { const r = re.exec(x.id); return r ? Math.max(m, +r[1]) : m; }, 0) + 1);
    }
    store.push({id, ...vals});
    return {ok:true, id};
  }
  const cur = store.find(x => x.id === it.id);
  if(!cur) return {ok:false, error:'not_found'};
  Object.assign(cur, vals);
  return {ok:true, id:cur.id};
}
```
`api()` のデモ分岐の `case 'adminCustomers': ...` の行の上に追加:
```js
    case 'adminMenu': return {ok:true, menu:demoMenuAdm.menu.map(x => ({...x})).sort((a,b) => a.order - b.order),
      options:demoMenuAdm.options.map(x => ({...x})).sort((a,b) => a.order - b.order),
      cats:Object.keys(CAT_LABEL), groups:Object.keys(GROUP_LABEL), kinds:['','pair','omakase']};
    case 'adminMenuSave': return demoMenuSave('menu', extra);
    case 'adminOptionSave': return demoMenuSave('option', extra);
```

3-3. 画面。`NAV.push(['links','予約リンク']);` の**直後**(`render()` の直前)に追加:
```js
/* ---------- メニュー・料金設定 ---------- */
const CAT_LABEL = {first:'はじめての方', rec:'おすすめ', aroma:'アロマ', facial:'フェイシャル', steam:'蒸し', pair:'ペア', omakase:'おまかせ'};
const GROUP_LABEL = {aroma:'アロマ', facial:'フェイシャル', steam:'蒸し', pair:'ペア', omakase:'おまかせ'};
const KIND_LABEL = {'':'通常', pair:'ペア(オプション料金が2名分)', omakase:'おまかせ(料金・時間は当日相談)'};
const FIELD_MSG = {
  id:'IDは英数字・ハイフン・アンダースコアで40文字以内にしてください',
  name:'名前は1〜60文字で入力してください', desc:'説明は200文字以内にしてください',
  min:'所要分は10〜300分の整数で入力してください(オプションは0〜300、おまかせは空欄可)',
  price:'料金は0〜1,000,000の整数で入力してください(メニューは空欄=当日案内、オプションは必須)',
  kind:'種別が正しくありません', cats:'カテゴリを1つ以上選んでください', g:'グループが正しくありません',
  show:'表示の指定が正しくありません', order:'並び順は0〜9999の整数で入力してください'
};
function newMenuAdm(){ return {data:null, loading:false, failed:false, tab:'menu', sel:null, form:null, isNew:false, origKind:'', errs:{}}; }
A.menuAdm = newMenuAdm();
const menuErrMsg = e => {
  if(e && e.error === 'bad_field') return FIELD_MSG[e.field] || '入力内容を確認してください';
  if(e && e.error === 'duplicate_id') return '同じIDが既にあります。別のIDにするか、空欄にしてください';
  if(e && e.error === 'not_found') return '対象が見つかりません。再読み込みしてください';
  return errMsg((e && (e.error || e.message)) || '');
};
function ensureMenuAdm(){
  const M = A.menuAdm;
  if(M.data || M.loading || M.failed) return;
  M.loading = true;
  api('adminMenu').then(j => {
    if(!j.ok){ if(j.error === 'auth'){ logout(true); return; } throw new Error(j.error); }
    M.data = {menu:j.menu, options:j.options};
  }).catch(() => { M.failed = true; }).finally(() => { M.loading = false; render(); });
}
function menuRowHTML(it){
  const isMenu = A.menuAdm.tab === 'menu';
  const time = isMenu && it.kind === 'omakase' && !it.min ? '時間は相談' : it.min + '分';
  return `<li><button class="item ${it.show ? '' : 'x'}" data-act="menuedit" data-v="${esc(it.id)}"><span class="b">
    <span class="n">${esc(it.name)}${it.show ? '' : '<span class="tag x">非表示</span>'}${it.kind === 'pair' ? '<span class="tag">ペア</span>' : ''}${it.kind === 'omakase' ? '<span class="tag">おまかせ</span>' : ''}</span>
    <span class="m" style="display:block">${time} / ${it.price == null ? '当日案内' : yen(it.price)} / 並び順 ${it.order}</span></span></button></li>`;
}
function menuAdminView(){
  ensureMenuAdm();
  const M = A.menuAdm;
  if(M.failed) return `<div class="err" role="alert">メニューを取得できませんでした。</div><div style="padding:12px 16px"><button class="btn ghost" data-act="menureload">もう一度読み込む</button></div>`;
  if(!M.data) return '<p class="loading">読み込み中…</p>';
  const isMenu = M.tab === 'menu', list = isMenu ? M.data.menu : M.data.options;
  return `<div class="mrow"><button class="chip" aria-pressed="${isMenu}" data-act="menutab" data-v="menu">メニュー</button>
      <button class="chip" aria-pressed="${!isMenu}" data-act="menutab" data-v="options">オプション</button><span style="flex:1"></span>
      <button class="btn" style="width:auto;padding:8px 16px" data-act="menunew">＋ 追加</button></div>
    ${A.ok ? `<div class="ok" role="status">${esc(A.ok)}</div>` : ''}
    <div class="sub">${isMenu ? 'メニュー' : 'オプション'} ${list.length}件</div>
    <div id="menu-list">${list.length ? `<ul class="list">${list.map(menuRowHTML).join('')}</ul>` : '<p class="empty">まだありません。</p>'}</div>`;
}
function menuSheetHTML(){
  const M = A.menuAdm, f = M.form;
  if(!f) return '';
  const isMenu = M.tab === 'menu';
  const fld = (k, label, type = 'text', extra = '') => `<div class="f"><label for="m-${k}">${label}</label><input id="m-${k}" type="${type}" data-f="mform" data-k="${k}" value="${esc(f[k])}" ${extra}></div>`;
  const cats = Object.keys(CAT_LABEL).map(c => `<label class="chkline"><input type="checkbox" data-f="mform" data-k="cats" data-v="${c}" ${f.cats.includes(c) ? 'checked' : ''}> ${CAT_LABEL[c]}</label>`).join('');
  const groups = Object.keys(GROUP_LABEL).map(g => `<option value="${g}" ${f.g === g ? 'selected' : ''}>${GROUP_LABEL[g]}</option>`).join('');
  const kinds = Object.keys(KIND_LABEL).map(k => `<option value="${k}" ${f.kind === k ? 'selected' : ''}>${KIND_LABEL[k]}</option>`).join('');
  return `<div class="back" data-act="close"><div class="sheet" role="dialog" aria-modal="true" aria-label="${isMenu ? 'メニュー' : 'オプション'}の編集" data-stop="1">
    <h2>${M.isNew ? (isMenu ? 'メニューを追加' : 'オプションを追加') : (isMenu ? 'メニューを編集' : 'オプションを編集')}</h2>
    <div style="height:10px"></div>
    <div class="f"><label for="m-id">ID${M.isNew ? '(任意・英数字。空なら自動)' : '(変更できません)'}</label>
      <input id="m-id" data-f="mform" data-k="id" value="${esc(f.id)}" ${M.isNew ? '' : 'readonly'} maxlength="40" autocomplete="off"></div>
    ${fld('name', '名前')}
    <div class="row2">${fld('price', '料金(円)' + (isMenu ? ' 空欄=当日案内' : ''), 'text', 'inputmode="numeric"')}${fld('min', '所要分', 'text', 'inputmode="numeric"')}</div>
    ${isMenu ? `<div class="f"><label for="m-desc">説明</label><textarea id="m-desc" data-f="mform" data-k="desc" maxlength="200">${esc(f.desc)}</textarea></div>
      <div class="f"><label>カテゴリ</label><div>${cats}</div></div>
      <div class="row2"><div class="f"><label for="m-g">グループ(サムネの色)</label><select id="m-g" data-f="mform" data-k="g">${groups}</select></div>
        <div class="f"><label for="m-kind">種別</label><select id="m-kind" data-f="mform" data-k="kind">${kinds}</select></div></div>
      ${!M.isNew && f.kind !== M.origKind ? '<p class="sm" style="color:var(--danger);margin:0 0 10px">種別を変更すると、料金・所要分の計算方法が変わります。</p>' : ''}` : ''}
    <div class="row2">${fld('order', '並び順(小さいほど上)', 'text', 'inputmode="numeric"')}
      <div class="f"><label>表示</label><label class="chkline" style="margin-top:8px"><input id="m-show" type="checkbox" data-f="mform" data-k="show" ${f.show ? 'checked' : ''}> 予約サイトに表示する</label></div></div>
    ${A.msg ? `<div class="err" role="alert" style="margin:0 0 10px">${esc(A.msg)}</div>` : ''}
    <div class="acts"><button class="btn" data-act="menusave" ${A.busy ? 'disabled' : ''}>${A.busy ? '保存中…' : '保存する'}</button><button class="btn ghost" data-act="close">閉じる</button></div>
  </div></div>`;
}
const menuFormOf = (it, isMenu) => ({id:it.id, name:it.name, price:it.price == null ? '' : String(it.price), min:it.min == null ? '' : String(it.min),
  order:String(it.order), show:!!it.show, desc:it.desc || '', cats:(it.cats || []).slice(), g:it.g || 'aroma', kind:it.kind || ''});
async function menuSave(){
  const M = A.menuAdm, f = M.form, isMenu = M.tab === 'menu';
  const num = v => String(v).trim() === '' ? null : String(v).trim();
  const item = {id:f.id.trim(), name:f.name, min:num(f.min), price:num(f.price), show:!!f.show, order:num(f.order),
    ...(isMenu ? {desc:f.desc, cats:f.cats.slice(), g:f.g, kind:f.kind} : {})};
  A.busy = true; A.msg = ''; render();
  try{
    const j = await api(isMenu ? 'adminMenuSave' : 'adminOptionSave', {item, create:M.isNew});
    if(!j.ok){ if(j.error === 'auth'){ logout(true); return; } throw j; }
    A.ok = M.isNew ? '追加しました。' : '保存しました。予約サイトにも反映されます。';
    M.sel = null; M.form = null; M.isNew = false; M.data = null;   // 一覧を取り直す
    loadMenu();                                                    // 予約追加・リンク発行で使うメニュー一覧も更新
  } catch(e){ A.msg = menuErrMsg(e); }
  A.busy = false; render();
}
VIEWS.menu = menuAdminView;
NAV.push(['menu','メニュー']);
```

3-4. `render()` のシート描画行を `${A.form ? formHTML() : A.sheet ? sheetHTML() : A.custSel ? custSheetHTML() : A.menuAdm.sel ? menuSheetHTML() : ''}` に変更する(現行は `...A.custSel ? custSheetHTML() : ''`)。

3-5. `logout()` の初期化行(`... A.cust = null; A.custFailed = false; A.custSel = null; A.custForm = null;`)の末尾に `A.menuAdm = newMenuAdm();` を追加。

3-6. クリックハンドラ(`case 'copylink': copyLink(); break;` の下)に追加:
```js
    case 'menutab': A.menuAdm.tab = v; A.ok = ''; render(); break;
    case 'menunew': {
      const M = A.menuAdm, list = M.tab === 'menu' ? M.data.menu : M.data.options;
      const next = list.reduce((m, x) => Math.max(m, x.order === 9999 ? 0 : x.order), 0) + 1;
      M.isNew = true; M.sel = '__new'; M.origKind = '';
      M.form = {id:'', name:'', price:'', min:M.tab === 'menu' ? '60' : '0', order:String(next), show:true, desc:'', cats:[], g:'aroma', kind:''};
      A.msg = ''; A.ok = ''; render(); break;
    }
    case 'menuedit': {
      const M = A.menuAdm, list = M.tab === 'menu' ? M.data.menu : M.data.options, it = list.find(x => x.id === v);
      if(!it) break;
      M.isNew = false; M.sel = v; M.origKind = it.kind || ''; M.form = menuFormOf(it, M.tab === 'menu');
      A.msg = ''; A.ok = ''; render(); break;
    }
    case 'menusave': menuSave(); break;
    case 'menureload': A.menuAdm.failed = false; render(); break;
```
`case 'close':` の行に `A.menuAdm.sel = null; A.menuAdm.form = null;` を追加し、Escapeキーのリスナーも `(A.sheet || A.form || A.custSel || A.menuAdm.sel)` を条件に `A.menuAdm.sel = null; A.menuAdm.form = null;` を足す。

3-7. 入力ハンドラ(`else if(f === 'link'){ ... }` の下)に追加:
```js
  else if(f === 'mform'){
    const F = A.menuAdm.form, k = t.dataset.k;
    if(k === 'cats'){ const c = t.dataset.v; F.cats = t.checked ? [...new Set([...F.cats, c])] : F.cats.filter(x => x !== c); }
    else if(k === 'show') F.show = t.checked;
    else if(k === 'kind'){ F.kind = t.value; render(); }
    else F[k] = t.value;
  }
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: 全て PASS

- [ ] **Step 5: コミット**
```bash
git add admin.html tests/admin.test.js
git commit -m "kohaku-booking: 管理画面にメニュー・オプションの編集/追加画面を追加"
```

---

### Task 4: ドキュメントと全体確認

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/deploy-checklist.md`

- [ ] **Step 1: `CLAUDE.md` を更新**
  - 「API」の管理一覧に `adminMenu` / `adminMenuSave` / `adminOptionSave` を追記(メニュー・オプションの編集。保存後に `menu:v1` キャッシュを消すので予約サイトへ即反映)
  - 「データモデル」のメニュー/オプションの項に「管理画面の『メニュー』画面から編集・新規追加できる(IDは作成後変更不可。削除はせず表示=OFF)」を追記
  - 「設定の置き場所」の「メニュー/オプションの正は…シート(オーナーが直接編集。反映は最大5分遅れ)」を「シート。管理画面から編集した場合は即反映、シートを直接編集した場合は最大5分遅れ」に更新
  - 「実装済み / 未実装」: 実装済みに「メニュー・料金設定(管理画面)」を追加し、未実装1番から「メニュー・料金設定」を外す(残り: クーポン管理 / 売上・来店分析 / スタッフ管理)

- [ ] **Step 2: `docs/deploy-checklist.md` の確認表の末尾(19行目の後ろ)に行を追記**

| 20 | 管理画面: メニュー → 既存メニューの料金を変えて保存 | 予約サイトのメニュー一覧にすぐ反映される(5分待たない)。`メニュー`シートの該当セルだけが変わり、他の行・ID列は変わらない |
| 21 | 管理画面: メニューの「＋ 追加」(ID空) | `メニュー`シート末尾に `menu-1` で追加され、書式は文字列のまま。予約サイトに出る |
| 22 | 追加したメニューを表示OFFにして保存 | 予約サイトから消える。管理画面の一覧には「非表示」で残る |
| 23 | 既存と同じIDで追加 / 料金に `-1` を入力 | それぞれ「同じIDが既にあります」「料金は0〜…」と表示され、シートは変わらない |
| 24 | 管理画面: オプションの編集と追加 | `オプション`シートに反映され、予約サイトのオプション欄に出る |

- [ ] **Step 3: 全体確認**

Run: `npm test && npm run check:gas`
Expected: 全て PASS、`gas/Code.gs: syntax OK`

`python -m http.server` で `admin.html` を開き(デモ表示、パスワード `demo`)、PC幅とスマホ幅で「メニュー」画面の一覧・編集シート・新規追加の見た目を確認する。

- [ ] **Step 4: コミット**
```bash
git add CLAUDE.md docs/deploy-checklist.md
git commit -m "kohaku-booking: メニュー・料金設定の仕様と実機確認項目をドキュメントに反映"
```

---

## Self-Review(計画書の自己点検結果)
- **Spec coverage**: 3.1 API=Task 2 / 3.2 保存の挙動(create・update・ID不変・文字列・キャッシュ消去)=Task 2 / 3.3 入力検証=Task 1 / 3.4 純関数=Task 1 / 4 管理画面=Task 3 / 5 安全性=Task 1・2・3のテスト / 7 テスト=各Task / 8 公開順序=Task 4(チェックリスト)。
- **名前の整合**: `validateMenuItem_` / `validateOptionItem_` / `menuRowFromItem_` / `optionRowFromItem_` / `nextItemId_` / `saveItem_` / `adminMenu_`、エラー形 `{ok:false,error,field}`、`CAT_LABEL` / `GROUP_LABEL` / `KIND_LABEL` は全タスクで統一。
- **既知の限界**: シート書き込み・キャッシュ消去の実機動作は Task 2 のフェイクシートでの位置検証までで、本物の `SpreadsheetApp` / `CacheService` は Task 4 のチェックリスト20〜24で確認する。
