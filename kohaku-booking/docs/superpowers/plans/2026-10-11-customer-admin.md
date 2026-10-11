# 顧客管理 + 予約リンク + 管理画面サイドバー化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 予約リンク(流入元・問い合わせID・メニュー指定)を予約と顧客に記録し、管理画面に「顧客」「予約リンク」画面とサイドバー/下タブのナビを追加する。

**Architecture:** GAS(`gas/Code.gs`)にテスト可能な純関数(`cleanRef_` / `refFillPlan_` / `customerStats_` / `validateCustomerUpdate_`)を置き、シート入出力は薄い配線に留める。フロントは依存なしのバニラJS単一HTML(`index.html` / `admin.html`)のまま、既存の `render()` + イベント委譲パターンに画面を足す。

**Tech Stack:** Google Apps Script、バニラJS(単一HTML)、`node --test` + jsdom、Node `vm`(GASの純関数テスト)

**Spec:** `docs/superpowers/specs/2026-10-11-customer-admin-design.md`

## Global Constraints
- 列の追加は**末尾のみ**。既存列の並び替え・削除は禁止(コードが列番号で参照している)
- 予約シート: 24 → 26列(`流入元`, `問い合わせID` を末尾へ)。内部名は `refSource` / `inquiryId`(既存の `source`=web/admin と衝突させない)
- 顧客シート: 11 → 15列(`Instagram名`, `流入元`, `初回問い合わせ日`, `問い合わせID` を末尾へ)
- 流入元の許可値は `instagram_dm / instagram / line / web / other` の5つ固定。問い合わせIDは `^[A-Za-z0-9_-]{1,32}$`
- フロントは依存なしのバニラJS単一HTML。ビルド工程を入れない。外部読み込みは Google Fonts と LIFF SDK のみ
- ユーザー入力は必ず `esc()` を通して描画。URL生成は `URLSearchParams` / `encodeURIComponent`
- セルは `'@'` 書式の文字列で保存(数式注入・先頭0落ち防止)
- 新しいAPIは `handleAction_` に case を足し、管理系は必ずトークン必須。エラーは `{ok:false,error:'snake_case'}`、日本語は各HTMLの `errMsg` に追加
- デザイントークン: cream `#F6EFE3` / paper `#FFFCF7` / sand `#EADBC3` / caramel `#B58553` / brown `#6E5238` / ink `#33261C` / moss `#44593F` / danger `#A5473A`
- スマホ優先。タップ領域44px以上、`aria-label`、フォーカスリング、`prefers-reduced-motion` を維持
- コミットは**対象パスを明示**(`git add -A` 禁止。OneDrive同期の都合)。コミットメッセージ末尾に `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- 作業ディレクトリは `kohaku-booking/`。テストは `npm test`、GAS構文は `npm run check:gas`

## Review Focus
1. **`setup` 未実行の旧シートで予約が失敗しない**: 列数が足りないシートでも書き込みで落ちない(→ Task 1 `ensureColumns_` のテスト)
2. **手入力した流入元・Instagram名を、後続の予約が上書きしない**(→ Task 1 `refFillPlan_` のテスト)
3. **顧客IDが空の古い予約と、同じメールの別顧客**が履歴に混ざらない(→ Task 1 `customerStats_` のテスト)
4. **`source` / `inquiry` / `menu` に不正値**(`<script>`、33文字超、未知の流入元、存在しないメニューID)を入れても無視されて通常どおり予約できる(→ Task 1 `cleanRef_`、Task 3 `parseRef`)
5. **検索欄に1文字入力するたびに入力フォーカスが飛ばない**(→ Task 5 のテスト)

## 事前条件
このプランの着手前に、未コミットの前回作業(営業日機能 `admin.html` / `gas/Code.gs` / `tests/admin.test.js`、設計書 `docs/superpowers/specs/2026-10-11-customer-admin-design.md`、本計画書)をユーザーの了承のうえコミットしておく。以降のタスクはその上に積む。

---

## File Structure
| ファイル | 役割 | 変更 |
|---|---|---|
| `gas/Code.gs` | データモデル定数・純関数・API配線 | Task 1, 2 |
| `index.html` | 予約リンクのパラメータ解釈・メニュー事前選択・payload | Task 3 |
| `admin.html` | ナビ(サイドバー/下タブ)・顧客画面・リンク発行ツール | Task 4, 5, 6 |
| `tests/gas-customer.test.js` | GAS純関数のテスト(新規) | Task 1 |
| `tests/ref-link.test.js` | 予約サイト側パラメータのテスト(新規) | Task 3 |
| `tests/admin.test.js` | 管理画面のテスト追加 | Task 4, 5, 6 |
| `CLAUDE.md` / `docs/deploy-checklist.md` | ドキュメント | Task 7 |

---

### Task 1: GAS データモデルと純関数

**Files:**
- Modify: `gas/Code.gs`(冒頭のコメント・`HEADERS` / `CUSTOMER_HEADERS` / `C` 定数、`getSheet_` / `getCustomerSheet_`、`parseRow_`、`customerFromRow_`、純関数の追加)
- Create: `tests/gas-customer.test.js`

**Interfaces:**
- Produces(Task 2 が使う):
  - `REF_SOURCES: string[]`
  - `cleanRef_(source, inquiry) → {source: string, inquiry: string}`(無効値は空文字)
  - `refFillPlan_(c, ref, today) → {refSource?, inquiryId?, inquiryDate?}`(空欄だけを埋める計画。`c` は `{refSource, inquiryId, inquiryDate}` を持つ顧客か `{}`)
  - `customerStats_(customers, rows, today) → customer[]`(出力の形は設計書5章)
  - `validateCustomerUpdate_(d) → ''|'not_found'|'bad_source'|'bad_date'|'too_long'`
  - `ensureColumns_(sh, n)`(シートの列数が n 未満なら末尾に足す)
  - `C.INSTAGRAM=11, C.REF_SOURCE=12, C.INQUIRY_DATE=13, C.INQUIRY_ID=14`
  - `parseRow_` の戻り値に `refSource`, `inquiryId`
  - `customerFromRow_` の戻り値に `memo`, `instagram`, `refSource`, `inquiryDate`, `inquiryId`

- [ ] **Step 1: 失敗するテストを書く**

`tests/gas-customer.test.js` を新規作成:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

function loadGas() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const ctx = vm.createContext({ console });
  vm.runInContext(src + '\n;this.__c = { HEADERS, CUSTOMER_HEADERS, C, REF_SOURCES };', ctx);
  return Object.assign(ctx, ctx.__c);   // ctx 自体を返す(const の定数も見える。スタブも足せる)
}
const j = o => JSON.parse(JSON.stringify(o));

test('列定義: 予約26列・顧客15列で、追加は末尾', () => {
  const g = loadGas();
  assert.strictEqual(g.HEADERS.length, 26);
  assert.deepStrictEqual(g.HEADERS.slice(23), ['当日リマインド送信日時', '流入元', '問い合わせID']);
  assert.strictEqual(g.CUSTOMER_HEADERS.length, 15);
  assert.deepStrictEqual(g.CUSTOMER_HEADERS.slice(10), ['メモ', 'Instagram名', '流入元', '初回問い合わせ日', '問い合わせID']);
  assert.deepStrictEqual(j(g.C), { ID:0, EMAIL:1, NAME:2, KANA:3, TEL:4, LINE_ID:5, LINE_AT:6, LINE_NOTIFY:7, CREATED:8, UPDATED:9, MEMO:10,
    INSTAGRAM:11, REF_SOURCE:12, INQUIRY_DATE:13, INQUIRY_ID:14 });
});

test('cleanRef_: 許可値だけを通し、不正値は空にする', () => {
  const g = loadGas();
  assert.deepStrictEqual(j(g.cleanRef_('instagram_dm', 'IG-00125')), { source: 'instagram_dm', inquiry: 'IG-00125' });
  assert.deepStrictEqual(j(g.cleanRef_('twitter', 'IG 1')), { source: '', inquiry: '' });
  assert.deepStrictEqual(j(g.cleanRef_('<script>', '<script>alert(1)</script>')), { source: '', inquiry: '' });
  assert.strictEqual(g.cleanRef_('line', 'a'.repeat(33)).inquiry, '');
  assert.strictEqual(g.cleanRef_('line', 'a'.repeat(32)).inquiry, 'a'.repeat(32));
  assert.deepStrictEqual(j(g.cleanRef_(undefined, null)), { source: '', inquiry: '' });
});

test('parseRow_: 流入元・問い合わせID を読む(26列未満の行でも落ちない)', () => {
  const g = loadGas();
  const v = new Array(26).fill('');
  v[0] = 'K1'; v[2] = '確定'; v[3] = '2026-10-20'; v[4] = '10:00'; v[5] = '11:00'; v[24] = 'instagram_dm'; v[25] = 'IG-1';
  const r = g.parseRow_(v, 0);
  assert.strictEqual(r.refSource, 'instagram_dm');
  assert.strictEqual(r.inquiryId, 'IG-1');
  const old = g.parseRow_(v.slice(0, 24), 0);
  assert.strictEqual(old.refSource, '');
  assert.strictEqual(old.inquiryId, '');
});

test('customerFromRow_: 追加4列とメモを読む(旧11列の行でも落ちない)', () => {
  const g = loadGas();
  const v = ['C000001', 'a@example.com', '山田 花子', 'ヤマダ ハナコ', '09012345678', '', '', '許可', 'x', 'y', '肩こり',
    '@hana87', 'instagram_dm', '2026-10-04', 'IG-1'];
  const c = g.customerFromRow_(v, 0);
  assert.deepStrictEqual([c.memo, c.instagram, c.refSource, c.inquiryDate, c.inquiryId], ['肩こり', '@hana87', 'instagram_dm', '2026-10-04', 'IG-1']);
  const old = g.customerFromRow_(v.slice(0, 11), 0);
  assert.deepStrictEqual([old.instagram, old.refSource, old.inquiryDate, old.inquiryId], ['', '', '', '']);
});

test('refFillPlan_: 空欄だけを埋め、手入力済みの値は上書きしない', () => {
  const g = loadGas();
  const ref = { source: 'instagram', inquiry: 'IG-9' };
  assert.deepStrictEqual(j(g.refFillPlan_({}, ref, '2026-10-11')), { refSource: 'instagram', inquiryId: 'IG-9', inquiryDate: '2026-10-11' });
  const manual = { refSource: 'line', inquiryId: 'IG-1', inquiryDate: '2026-09-01' };
  assert.deepStrictEqual(j(g.refFillPlan_(manual, ref, '2026-10-11')), {});
  assert.deepStrictEqual(j(g.refFillPlan_({ refSource: 'line' }, ref, '2026-10-11')), { inquiryId: 'IG-9', inquiryDate: '2026-10-11' });
  // 問い合わせIDが無ければ初回問い合わせ日は入れない
  assert.deepStrictEqual(j(g.refFillPlan_({}, { source: 'web', inquiry: '' }, '2026-10-11')), { refSource: 'web' });
  assert.deepStrictEqual(j(g.refFillPlan_({}, { source: '', inquiry: '' }, '2026-10-11')), {});
});

test('customerStats_: 来店回数・最終来店・次回予約・履歴を顧客ID(無ければメール)で集計する', () => {
  const g = loadGas();
  const cust = [
    { id: 'C000001', email: 'a@example.com', name: '山田', kana: 'ヤマダ', tel: '1', lineUserId: 'Uxx', instagram: '@a', refSource: 'line', inquiryDate: '', inquiryId: '', memo: 'm' },
    { id: 'C000002', email: 'b@example.com', name: '佐藤', kana: 'サトウ', tel: '2', lineUserId: '', instagram: '', refSource: '', inquiryDate: '', inquiryId: '', memo: '' }
  ];
  const row = (o) => Object.assign({ status: '確定', date: '2026-10-01', time: '10:00', menuName: 'Relax', customerId: '', email: '' }, o);
  const rows = [
    row({ customerId: 'C000001', status: '来店済', date: '2026-09-01' }),
    row({ customerId: 'C000001', status: '来店済', date: '2026-09-20', time: '14:00' }),
    row({ customerId: 'C000001', status: 'キャンセル', date: '2026-09-25' }),
    row({ customerId: 'C000001', status: '確定', date: '2026-10-20', time: '11:00' }),
    row({ customerId: 'C000001', status: '確定', date: '2026-10-15', time: '09:00' }),
    row({ customerId: '', email: 'B@Example.com', status: '来店済', date: '2026-08-10' }),   // 顧客IDなし → メールで紐づく
    row({ customerId: 'C000099', email: 'a@example.com', status: '来店済', date: '2026-10-02' })  // 別の顧客ID → メールが同じでも混ぜない
  ];
  const out = j(g.customerStats_(cust, rows, '2026-10-11'));
  const a = out[0], b = out[1];
  assert.strictEqual(a.visits, 2);
  assert.strictEqual(a.reservations, 4);              // キャンセルを除く
  assert.strictEqual(a.lastVisit, '2026-09-20');
  assert.strictEqual(a.next, '2026-10-15 09:00');
  assert.strictEqual(a.lineLinked, true);
  assert.strictEqual(a.history.length, 5);            // キャンセルも履歴には残る
  assert.strictEqual(a.history[0].date, '2026-10-20'); // 新しい順
  assert.strictEqual(a.memo, 'm');
  assert.strictEqual(b.visits, 1);
  assert.strictEqual(b.lastVisit, '2026-08-10');
  assert.strictEqual(b.next, '');
  assert.strictEqual(b.lineLinked, false);
});

test('validateCustomerUpdate_: 入力値の検証', () => {
  const g = loadGas();
  const ok = { id: 'C000001', refSource: 'line', inquiryDate: '2026-10-04', instagram: '@a', memo: 'm' };
  assert.strictEqual(g.validateCustomerUpdate_(ok), '');
  assert.strictEqual(g.validateCustomerUpdate_({ ...ok, id: '' }), 'not_found');
  assert.strictEqual(g.validateCustomerUpdate_({ ...ok, refSource: 'tiktok' }), 'bad_source');
  assert.strictEqual(g.validateCustomerUpdate_({ ...ok, refSource: '' }), '');
  assert.strictEqual(g.validateCustomerUpdate_({ ...ok, inquiryDate: '2026/10/04' }), 'bad_date');
  assert.strictEqual(g.validateCustomerUpdate_({ ...ok, inquiryDate: '2026-02-31' }), 'bad_date');
  assert.strictEqual(g.validateCustomerUpdate_({ ...ok, inquiryDate: '' }), '');
  assert.strictEqual(g.validateCustomerUpdate_({ ...ok, instagram: 'a'.repeat(101) }), 'too_long');
  assert.strictEqual(g.validateCustomerUpdate_({ ...ok, memo: 'a'.repeat(1001) }), 'too_long');
  assert.strictEqual(g.validateCustomerUpdate_({ ...ok, memo: '=HYPERLINK("http://x","y")' }), '');   // 保存時に文字列化する(式にはならない)
});

test('ensureColumns_: 列が足りないときだけ末尾に足す', () => {
  const g = loadGas();
  const calls = [];
  const sh = n => ({ getMaxColumns: () => n, insertColumnsAfter: (a, b) => calls.push([a, b]) });
  g.ensureColumns_(sh(11), 15);
  g.ensureColumns_(sh(26), 26);
  g.ensureColumns_(sh(30), 26);
  assert.deepStrictEqual(calls, [[11, 4]]);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tests/gas-customer.test.js` (または `node --test tests/gas-customer.test.js`)
Expected: FAIL(`HEADERS.length` が 24、`cleanRef_` が未定義など)

- [ ] **Step 3: 実装する(`gas/Code.gs`)**

3-1. 冒頭コメント(データモデル)に追記:
```js
 *   流入元 / 問い合わせID  予約リンク(?source=…&inquiry=…)から。予約の末尾2列。顧客側は「空のときだけ」埋める
```
(予約の説明の `流入経路` の行の下)と、顧客の説明に `Instagram名 / 流入元 / 初回問い合わせ日 / 問い合わせID  手入力または予約リンクから` を追加。

3-2. 定数を置き換える:
```js
const HEADERS = ['予約ID','受付日時','予約ステータス','日付','開始','終了','メニュー','オプション','合計金額','所要分',
                 'お名前','フリガナ','電話','メール','初回/再来','ご要望','カレンダーEventID','メニューID',
                 '顧客ID','予約日時(ISO)','流入経路','2日前リマインド送信日時','更新日時','当日リマインド送信日時',
                 '流入元','問い合わせID'];
```
```js
const CUSTOMER_HEADERS = ['顧客ID','メール','お名前','フリガナ','電話','LINE userId','LINE連携日時','LINE通知','登録日時','更新日時','メモ',
                          'Instagram名','流入元','初回問い合わせ日','問い合わせID'];
const C = { ID:0, EMAIL:1, NAME:2, KANA:3, TEL:4, LINE_ID:5, LINE_AT:6, LINE_NOTIFY:7, CREATED:8, UPDATED:9, MEMO:10,
            INSTAGRAM:11, REF_SOURCE:12, INQUIRY_DATE:13, INQUIRY_ID:14 };
const REF_SOURCES = ['instagram_dm', 'instagram', 'line', 'web', 'other'];   // 予約サイト・管理画面と同じ5種類
```

3-3. `getSheet_` / `getCustomerSheet_` の `return sh;` の直前に追加(`setup` 未実行の旧シートでも書き込みで落ちないように):
```js
  ensureColumns_(sh, HEADERS.length);          // getSheet_ 側
```
```js
  ensureColumns_(sh, CUSTOMER_HEADERS.length); // getCustomerSheet_ 側
```
そして純関数群を `nowStr_` の直後に追加:
```js
/** シートの列数が n 未満なら末尾に足す(書き込み範囲がシートの外に出て落ちるのを防ぐ) */
function ensureColumns_(sh, n) {
  const have = sh.getMaxColumns();
  if (have < n) sh.insertColumnsAfter(have, n - have);
}

/** 予約リンクのパラメータを検証して返す。無効な値は空文字(クライアントの値は信用しない) */
function cleanRef_(source, inquiry) {
  const s = String(source == null ? '' : source).trim();
  const q = String(inquiry == null ? '' : inquiry).trim();
  return {
    source: REF_SOURCES.indexOf(s) >= 0 ? s : '',
    inquiry: /^[A-Za-z0-9_-]{1,32}$/.test(q) ? q : ''
  };
}

/** 顧客の空欄だけを埋める計画。手入力済みの値は上書きしない */
function refFillPlan_(c, ref, today) {
  const plan = {};
  if (!c.refSource && ref.source) plan.refSource = ref.source;
  if (!c.inquiryId && ref.inquiry) plan.inquiryId = ref.inquiry;
  if (!c.inquiryDate && ref.inquiry) plan.inquiryDate = today;
  return plan;
}

/** 顧客ごとの来店回数・最終来店・次回予約・履歴を計算する(保存はしない) */
function customerStats_(customers, rows, today) {
  const byTime = function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; };
  return customers.map(function (c) {
    const mine = rows.filter(function (r) {
      return r.customerId ? r.customerId === c.id : (!!c.email && normEmail_(r.email) === c.email);
    });
    const visited = mine.filter(function (r) { return r.status === STATUS.VISITED; });
    const upcoming = mine.filter(function (r) { return r.status === STATUS.CONFIRMED && r.date >= today; }).sort(byTime);
    let last = '';
    visited.forEach(function (r) { if (r.date > last) last = r.date; });
    return {
      id: c.id, name: c.name, kana: c.kana, tel: c.tel, email: c.email,
      instagram: c.instagram || '', refSource: c.refSource || '', inquiryDate: c.inquiryDate || '', inquiryId: c.inquiryId || '',
      lineLinked: !!c.lineUserId, memo: c.memo || '',
      visits: visited.length,
      reservations: mine.filter(function (r) { return r.status !== STATUS.CANCELLED; }).length,
      lastVisit: last,
      next: upcoming.length ? upcoming[0].date + ' ' + upcoming[0].time : '',
      history: mine.slice().sort(byTime).reverse().map(function (r) {
        return { date: r.date, time: r.time, menuName: r.menuName, status: r.status };
      })
    };
  });
}

/** 管理画面からの顧客情報更新の入力検証。問題なければ空文字 */
function validateCustomerUpdate_(d) {
  if (!d.id) return 'not_found';
  const src = String(d.refSource || '');
  if (src && REF_SOURCES.indexOf(src) < 0) return 'bad_source';
  const dt = String(d.inquiryDate || '');
  if (dt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dt)) return 'bad_date';
    const t = new Date(dt + 'T00:00:00Z');
    if (isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== dt) return 'bad_date';
  }
  if (String(d.instagram || '').length > 100 || String(d.memo || '').length > 1000) return 'too_long';
  return '';
}
```

3-4. `parseRow_` の最後のプロパティの後ろに追加(`remindedTodayAt` の行を `,` で閉じて):
```js
    ..., remindedTodayAt: String(v[23] || ''),
    refSource: String(v[24] || ''), inquiryId: String(v[25] || '')
```

3-5. `customerFromRow_` を置き換え:
```js
function customerFromRow_(v, i) {
  return { row: i + 2, id: String(v[C.ID]), email: normEmail_(v[C.EMAIL]), name: String(v[C.NAME]), kana: String(v[C.KANA]), tel: String(v[C.TEL]),
           lineUserId: String(v[C.LINE_ID] || ''), lineLinkedAt: String(v[C.LINE_AT] || ''), lineNotify: String(v[C.LINE_NOTIFY] || ''),
           memo: String(v[C.MEMO] || ''), instagram: String(v[C.INSTAGRAM] || ''), refSource: String(v[C.REF_SOURCE] || ''),
           inquiryDate: dstr_(v[C.INQUIRY_DATE]), inquiryId: String(v[C.INQUIRY_ID] || '') };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/gas-customer.test.js && npm test && npm run check:gas`
Expected: 新規テスト全て PASS、既存テストも全て PASS(`tests/gas-menu.test.js` など)、`syntax OK`

- [ ] **Step 5: コミット**
```bash
git add gas/Code.gs tests/gas-customer.test.js
git commit -m "kohaku-booking: 顧客・予約の列定義と流入元まわりの純関数を追加"
```

---

### Task 2: GAS API の配線(予約時の記録・移行・顧客API)

**Files:**
- Modify: `gas/Code.gs`(`doPost`、`upsertCustomer_`、`appendReservation_`、`migrate_`、`handleAction_`、`adminCustomers_` / `adminCustomerUpdate_` を追加)

**Interfaces:**
- Consumes: Task 1 の `cleanRef_` / `refFillPlan_` / `customerStats_` / `validateCustomerUpdate_` / `C.*` / `allRows_` / `allCustomers_`
- Produces:
  - `upsertCustomer_(email, name, kana, tel, ref)`(`ref = {source, inquiry}`、省略可)
  - `appendReservation_(f)` が `f.refSource`, `f.inquiryId` を書く
  - POST `{action:'adminCustomers', token}` → `{ok:true, customers:[…]}`
  - POST `{action:'adminCustomerUpdate', token, id, instagram, refSource, inquiryDate, memo}` → `{ok:true}` / `{ok:false,error}`

- [ ] **Step 1: 失敗するテストを書く**

`tests/gas-customer.test.js` に追記(配線の存在をvmで確認。シート入出力そのものは実機確認):
```js
test('handleAction_: 顧客系アクションはトークン無しだと auth で拒否される', () => {
  const g = loadGas();
  g.CacheService = { getScriptCache: () => ({ get: () => null }) };   // adminAuth_ が参照する
  assert.deepStrictEqual(j(g.handleAction_({ action: 'adminCustomers' })), { ok: false, error: 'auth' });
  assert.deepStrictEqual(j(g.handleAction_({ action: 'adminCustomerUpdate', id: 'C000001' })), { ok: false, error: 'auth' });
});
```
注: `loadGas()` は ctx 自体を返すので、`g.CacheService = …` でグローバルのスタブを足せる(Task 1 で定義済み)。

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/gas-customer.test.js`
Expected: FAIL(`adminCustomers` が `unknown_action` を返す)

- [ ] **Step 3: 実装する**

3-1. `handleAction_` の `adminSetClosed` の行の下に追加:
```js
    case 'adminCustomers':      return adminAuth_(d) ? adminCustomers_(d) : { ok: false, error: 'auth' };
    case 'adminCustomerUpdate': return adminAuth_(d) ? adminCustomerUpdate_(d) : { ok: false, error: 'auth' };
```

3-2. `doPost` の予約登録部分(`const customerId = upsertCustomer_(...)` と `appendReservation_({...})`)を置き換え:
```js
    const ref = cleanRef_(d.source, d.inquiry);   // 予約リンクの流入元・問い合わせID(無効なら空)
    const customerId = upsertCustomer_(d.email, d.name, d.kana, d.tel, ref);
    appendReservation_({
      id: id, status: STATUS.CONFIRMED, date: d.date, time: d.time, end: Utilities.formatDate(end, 'Asia/Tokyo', 'HH:mm'),
      menuName: d.menuName, options: opts, total: d.total == null ? '当日ご案内' : d.total, minutes: d.minutes,
      name: d.name, kana: d.kana, tel: d.tel, email: d.email, visit: d.visit, note: d.note || '',
      eventId: ev.getId(), menuId: d.menuId || '', customerId: customerId, start: start, source: 'web',
      refSource: ref.source, inquiryId: ref.inquiry
    });
```
(`adminCreate_` の `appendReservation_` 呼び出しは変更しない。`refSource` / `inquiryId` は未指定=空になる。)

3-3. `appendReservation_` の行配列の末尾を変更:
```js
    f.customerId || '', Utilities.formatDate(f.start, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX"), f.source || '', '', nowStr_(), '',
    f.refSource || '', f.inquiryId || ''
```

3-4. `upsertCustomer_` を置き換え:
```js
/** メールアドレスで名寄せして顧客を登録/更新し、顧客IDを返す(LINE userId などの既存値は保持)。
 *  ref は予約リンクの流入元・問い合わせID。顧客側の空欄だけを埋め、手入力済みの値は上書きしない */
function upsertCustomer_(email, name, kana, tel, ref) {
  email = normEmail_(email);
  if (!email) return '';
  ref = ref || { source: '', inquiry: '' };
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const sh = getCustomerSheet_(), c = findCustomer_(email);
  if (c) {
    sh.getRange(c.row, C.NAME + 1, 1, 3).setNumberFormat('@').setValues([[String(name), String(kana), String(tel)]]);
    const plan = refFillPlan_(c, ref, today);
    if (plan.refSource) sh.getRange(c.row, C.REF_SOURCE + 1).setNumberFormat('@').setValue(plan.refSource);
    if (plan.inquiryDate) sh.getRange(c.row, C.INQUIRY_DATE + 1).setNumberFormat('@').setValue(plan.inquiryDate);
    if (plan.inquiryId) sh.getRange(c.row, C.INQUIRY_ID + 1).setNumberFormat('@').setValue(plan.inquiryId);
    sh.getRange(c.row, C.UPDATED + 1).setNumberFormat('@').setValue(nowStr_());
    return c.id;
  }
  const plan = refFillPlan_({}, ref, today);
  const id = nextCustomerId_();
  const row = [id, email, name, kana, tel, '', '', '許可', nowStr_(), nowStr_(), '',
               '', plan.refSource || '', plan.inquiryDate || '', plan.inquiryId || ''];
  sh.getRange(sh.getLastRow() + 1, 1, 1, CUSTOMER_HEADERS.length).setNumberFormat('@').setValues([row.map(String)]);
  return id;
}
```

3-5. `migrate_` の修正。(a) 旧レイアウト変換の行を15列に揃える: `.map(String)` の直前の配列を
```js
      return ['C' + String(i + 1).padStart(6, '0'), normEmail_(v[0]), v[1], v[2], v[3], '', '', '許可', String(v[4] || nowStr_()), String(v[4] || nowStr_()), '',
              '', '', '', ''].map(String);
```
に。(b) 旧レイアウト変換の `if` ブロックの**後ろ**(「3) 既存の予約に…」の前)に、顧客シートの見出しを常に最新にする処理を追加:
```js
  // 2.5) 顧客シートの見出しを最新に(列追加後の setup 再実行で、足りない見出しが入る)
  cs.getRange(1, 1, 1, CUSTOMER_HEADERS.length).setValues([CUSTOMER_HEADERS]).setFontWeight('bold').setBackground('#EADBC3');
```

3-6. API関数を `adminCreate_` の下に追加:
```js
/* ---------- 顧客(管理画面) ---------- */
function adminCustomers_() {
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  return { ok: true, customers: customerStats_(allCustomers_(), allRows_(), today) };
}

function adminCustomerUpdate_(d) {
  const err = validateCustomerUpdate_(d);
  if (err) return { ok: false, error: err };
  const c = allCustomers_().filter(function (x) { return x.id === d.id; })[0];
  if (!c) return { ok: false, error: 'not_found' };
  const sh = getCustomerSheet_();
  // メモ〜問い合わせID は連続した5列。問い合わせIDは画面から変更しないので現在値を書き戻す
  sh.getRange(c.row, C.MEMO + 1, 1, 5).setNumberFormat('@').setValues([[
    String(d.memo || ''), String(d.instagram || ''), String(d.refSource || ''), String(d.inquiryDate || ''), c.inquiryId
  ]]);
  sh.getRange(c.row, C.UPDATED + 1).setNumberFormat('@').setValue(nowStr_());
  return { ok: true };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test && npm run check:gas`
Expected: 全て PASS、`syntax OK`

- [ ] **Step 5: コミット**
```bash
git add gas/Code.gs tests/gas-customer.test.js
git commit -m "kohaku-booking: 予約時の流入元記録・顧客一覧/更新APIを追加"
```

---

### Task 3: 予約サイトのパラメータ解釈(`index.html`)

**Files:**
- Modify: `index.html`(`fresh()` 周辺、`loadMenu`、`submit`)
- Create: `tests/ref-link.test.js`

**Interfaces:**
- Consumes: なし(GAS の `source` / `inquiry` payload 名は Task 2 と一致させる)
- Produces: `S.ref = {source, inquiry, menu}`、`parseRef(search) → {source, inquiry, menu}`、`applyRefMenu()`、予約 payload の `source` / `inquiry`(値があるときのみ)

- [ ] **Step 1: 失敗するテストを書く**

`tests/ref-link.test.js` を新規作成:
```js
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/ref-link.test.js`
Expected: FAIL(`S.ref` が undefined)

- [ ] **Step 3: 実装する(`index.html`)**

3-1. `fresh()` の直前(「状態」コメントの前)に追加:
```js
/* ---------- 予約リンクのパラメータ(?source=…&inquiry=…&menu=…) ---------- */
const REF_SOURCES = ['instagram_dm','instagram','line','web','other'];
const REF_KEY = 'kohaku_ref';
const cleanRef = o => ({
  source: REF_SOURCES.includes(o && o.source) ? o.source : '',
  inquiry: /^[A-Za-z0-9_-]{1,32}$/.test((o && o.inquiry) || '') ? o.inquiry : '',
  menu: /^[A-Za-z0-9_-]{1,40}$/.test((o && o.menu) || '') ? o.menu : ''
});
/** URLの検索部(LIFF経由なら liff.state の中身も)から、有効な値だけを取り出す */
function parseRef(search){
  const q = new URLSearchParams(search);
  const st = q.get('liff.state');
  if(st){ new URLSearchParams(st.replace(/^[^?]*\?/, '')).forEach((v, k) => { if(!q.has(k)) q.set(k, v); }); }
  return cleanRef({source:q.get('source'), inquiry:q.get('inquiry'), menu:q.get('menu')});
}
/** 今回のURLに値があればそれを記憶し(LIFFログインの再読込・リロード対策)、無ければ記憶から復元する */
function loadRef(){
  const r = parseRef(location.search);
  if(r.source || r.inquiry || r.menu){ try{ sessionStorage.setItem(REF_KEY, JSON.stringify(r)); }catch(e){} return r; }
  try{ const j = JSON.parse(sessionStorage.getItem(REF_KEY) || 'null'); if(j) return {...cleanRef(j), menu:''}; }catch(e){}
  return {source:'', inquiry:'', menu:''};
}
```

3-2. `fresh()` に2項目を追加し、`let S = fresh();` の直後に記憶の読み込みを足す:
```js
const fresh = () => ({
  screen:'top', cat:'first', menu:null, opts:[], omakase:{mins:60, concerns:[]},
  y:TY, m:TM-1, date:null, time:null, busy:null, loading:false, availErr:false,
  info:{name:'', kana:'', tel:'', email:'', visit:'first', note:'', website:''},
  errors:{}, banner:'', submitting:false, result:null,
  ref:{source:'', inquiry:'', menu:''}, refMenuDone:false
});
let S = fresh();
S.ref = loadRef();   // 予約リンクから来たときだけ値が入る。予約完了後の fresh() では引き継がない
```

3-3. `loadMenu` の直前に `applyRefMenu` を追加し、`loadMenu` 内の2箇所から呼ぶ:
```js
/** 予約リンクの menu= を、メニュー一覧が確定した後に一度だけ反映する(一致しなければ何もしない) */
function applyRefMenu(){
  const id = S.ref && S.ref.menu;
  if(!id || S.refMenuDone || S.screen !== 'top' || MENU_LOADING) return;
  S.refMenuDone = true;
  const m = MENU.find(x => x.id === id);
  if(!m) return;
  S.menu = m; S.opts = []; S.date = null; S.time = null;
  if(m.cats && m.cats[0]) S.cat = m.cats[0];
  go('detail');
}
```
`loadMenu` の先頭行を `if(!CONFIG.GAS_URL){ MENU_LOADING = false; applyRefMenu(); return; }` に、`MENU_LOADING = false;` の次の行に `applyRefMenu();` を追加(その後の既存の `if([...].includes(S.screen)) render();` はそのまま)。

3-4. `submit()` の payload に追加(`website:i.website` の行を `,` で閉じて続ける):
```js
    visit:i.visit==='first' ? '初回' : '再来', note:notes, website:i.website,
    ...(S.ref.source ? {source:S.ref.source} : {}), ...(S.ref.inquiry ? {inquiry:S.ref.inquiry} : {})
```
さらに、成功後の `S.submitting = false; history.replaceState({screen:'done'}, ''); ...` の行の**前**に記憶の消去を追加:
```js
    try{ sessionStorage.removeItem(REF_KEY); }catch(e){}   // 予約が済んだら流入元の記憶は使わない
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: 全て PASS(`tests/booking.test.js` などの既存フローも通る)

- [ ] **Step 5: コミット**
```bash
git add index.html tests/ref-link.test.js
git commit -m "kohaku-booking: 予約リンクのパラメータ(流入元・問い合わせID・メニュー指定)を受け取り送信"
```

---

### Task 4: 管理画面のナビ(サイドバー / 下タブ)

**Files:**
- Modify: `admin.html`(CSS、`A` 状態、`render()`、`click` ハンドラ、`logout`)
- Modify: `tests/admin.test.js`

**Interfaces:**
- Consumes: なし
- Produces(Task 5・6 が使う):
  - `A.section: 'reserve'|'customers'|'links'`
  - `NAV: [key, label][]`(新しい画面はここに足す)
  - `VIEWS: {[key]: () => string}`(新しい画面はここに足す)
  - クリック `data-act="section" data-v="<key>"`

- [ ] **Step 1: 失敗するテストを書く**

`tests/admin.test.js` に追記:
```js
test('管理画面: ナビ(サイドバー/下タブ)があり、予約セクションにだけ「予約追加」ボタンが出る', async () => {
  const { click, type, d, errors } = load('admin.html');
  type('#pw', 'demo'); click('[data-act=login]'); await sleep(1000);
  assert.ok(d.querySelector('.side [data-act=section][data-v=reserve]'), 'サイドバー');
  assert.ok(d.querySelector('.bnav [data-act=section][data-v=reserve]'), '下タブ');
  assert.strictEqual(d.querySelector('.side [data-v=reserve]').getAttribute('aria-selected'), 'true');
  assert.ok(d.querySelector('.fab'), '予約セクションでは予約追加ボタンが出る');
  assert.deepStrictEqual(errors, []);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/admin.test.js`
Expected: FAIL(`.side` が無い)

- [ ] **Step 3: 実装する(`admin.html`)**

3-1. CSS: `.fab{...}` の `bottom:calc(18px + env(safe-area-inset-bottom,0px))` を `bottom:calc(70px + env(safe-area-inset-bottom,0px))` に変更し、`main{flex:1;padding-bottom:96px}` を `main{flex:1;padding-bottom:150px}` に変更。`@media (prefers-reduced-motion...)` の行の**前**に追加:
```css
/* nav: スマホ=下タブ / PC=左サイドバー */
.shell{flex:1;display:flex;min-width:0}
.content{flex:1;min-width:0;display:flex;flex-direction:column}
.side{display:none}
.bnav{position:fixed;left:0;right:0;bottom:0;z-index:8;display:flex;background:var(--paper);border-top:1px solid var(--line);padding-bottom:env(safe-area-inset-bottom,0px)}
.bnav button{flex:1;min-height:52px;border:0;border-top:3px solid transparent;background:none;font-size:13.5px;color:var(--muted)}
.bnav button[aria-selected=true]{color:var(--brown);font-weight:700;border-top-color:var(--caramel)}
@media(min-width:900px){
  .side{display:block;flex:none;width:208px;background:var(--ink);padding:18px 0}
  .side button{display:block;width:100%;min-height:48px;text-align:left;border:0;border-left:4px solid transparent;background:none;color:#E9DCC8;padding:12px 22px;font-size:15px}
  .side button[aria-selected=true]{background:rgba(255,255,255,.08);color:#fff;font-weight:700;border-left-color:var(--caramel)}
  .bnav{display:none}
  .wrap{max-width:900px}
  main{padding-bottom:40px}
  .fab{right:24px;bottom:24px}
}
```

3-2. 状態に `section` を追加(`token:'', screen:'today',` の後ろ): `section:'reserve',`。`logout()` の初期化行に `A.section = 'reserve';` を足す。

3-3. `render()` の直前に追加:
```js
/** ナビの項目と画面。新しい画面はここに足す(key → 表示名 / key → 描画関数) */
const NAV = [['reserve','予約']];
const VIEWS = { reserve: () => A.screen === 'today' ? todayView() : calView() };
const navBtns = () => NAV.map(([k,l]) => `<button role="tab" aria-selected="${A.section===k}" data-act="section" data-v="${k}">${l}</button>`).join('');
```

3-4. `render()` の `app.innerHTML = ...` を置き換え:
```js
  app.innerHTML = `
    ${CONFIG.GAS_URL ? '' : '<div class="demo">デモ表示中:データは保存されません</div>'}
    <header class="top"><div class="wrap"><div><b>${CONFIG.SALON}</b><small>管理</small></div><button data-act="logout">ログアウト</button></div></header>
    <div class="shell">
      <aside class="side" role="tablist" aria-label="メニュー">${navBtns()}</aside>
      <div class="content">
        ${A.section==='reserve' ? `<nav class="tabs"><div class="wrap" role="tablist">
          <button role="tab" aria-selected="${A.screen==='today'}" data-act="screen" data-v="today">今日の予約</button>
          <button role="tab" aria-selected="${A.screen==='cal'}" data-act="screen" data-v="cal">カレンダー</button></div></nav>` : ''}
        <main><div class="wrap">${(VIEWS[A.section] || VIEWS.reserve)()}</div></main>
      </div>
    </div>
    <nav class="bnav" role="tablist" aria-label="メニュー">${navBtns()}</nav>
    ${A.section==='reserve' ? '<button class="fab" data-act="new">＋ 予約追加</button>' : ''}
    ${A.form ? formHTML() : A.sheet ? sheetHTML() : ''}`;
```

3-5. クリックハンドラの `case 'screen':` の下に追加:
```js
    case 'section': A.section = v; A.sheet = null; A.form = null; A.ok = ''; A.msg = ''; render(); break;
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: 全て PASS(既存の管理画面テストの `[data-act=screen][data-v=cal]` / `.item` / `.cell` も引き続き動く)

- [ ] **Step 5: コミット**
```bash
git add admin.html tests/admin.test.js
git commit -m "kohaku-booking: 管理画面にサイドバー/下タブのナビを追加"
```

---

### Task 5: 管理画面「顧客」

**Files:**
- Modify: `admin.html`(CSS、デモバックエンド、状態、`errMsg`、`reload` / `logout`、画面・シート、アクション、入力ハンドラ)
- Modify: `tests/admin.test.js`

**Interfaces:**
- Consumes: Task 4 の `NAV` / `VIEWS` / `A.section`、Task 2 の API(`adminCustomers` / `adminCustomerUpdate`)
- Produces: `SRC_LABEL`(流入元の表示名。Task 6 も使う)、`A.cust`(顧客配列)、`customersView()`

- [ ] **Step 1: 失敗するテストを書く**

`tests/admin.test.js` に追記:
```js
test('管理画面: 顧客一覧 → 検索 → 流入元で絞り込み → 詳細 → 編集保存(デモ表示)', async () => {
  const { click, type, text, d, errors } = load('admin.html');
  type('#pw', 'demo'); click('[data-act=login]'); await sleep(1000);
  click('[data-act=section][data-v=customers]'); await sleep(700);
  const items = () => [...d.querySelectorAll('#cust-list .item')];
  const total = items().length;
  assert.ok(total >= 5, '顧客が一覧に出る');

  // 検索: 入力してもフォーカスされた入力欄が作り直されない(1文字ごとに入力が途切れない)
  const q = d.querySelector('#cust-q');
  type('#cust-q', '田中'); await sleep(50);
  assert.strictEqual(d.querySelector('#cust-q'), q, '検索欄が再描画で置き換わらない');
  assert.ok(items().length >= 1 && items().length < total);
  assert.ok(items().every(x => /田中/.test(x.textContent)));
  type('#cust-q', ''); await sleep(50);
  assert.strictEqual(items().length, total);

  // 流入元の絞り込み
  type('#cust-src', 'line'); await sleep(50);
  assert.ok(items().length >= 1 && items().length < total);
  assert.ok(items().every(x => x.querySelector('.tag').textContent === 'LINE'), '先頭のタグ=流入元がLINE');
  type('#cust-src', ''); await sleep(50);

  // 詳細 → 編集 → 保存
  click('#cust-list .item'); await sleep(50);
  assert.match(text('.sheet'), /予約履歴/);
  type('#c-instagram', '@tanaka_test');
  type('#c-src', 'instagram_dm');
  type('#c-idate', '2026-10-04');
  type('#c-memo', '肩こり相談 =HYPERLINK("x")');
  click('[data-act=custsave]'); await sleep(700);
  assert.match(text(), /顧客情報を保存しました/);
  click('#cust-list .item'); await sleep(50);
  assert.strictEqual(d.querySelector('#c-instagram').value, '@tanaka_test');
  assert.strictEqual(d.querySelector('#c-memo').value, '肩こり相談 =HYPERLINK("x")');
  assert.deepStrictEqual(errors, []);
});

test('管理画面: 顧客の詳細は HTML をエスケープして表示する', async () => {
  const { w, click, type, d, errors } = load('admin.html');
  type('#pw', 'demo'); click('[data-act=login]'); await sleep(1000);
  click('[data-act=section][data-v=customers]'); await sleep(700);
  click('#cust-list .item'); await sleep(50);
  type('#c-memo', '<img src=x onerror=window.__pwned=1>');
  click('[data-act=custsave]'); await sleep(700);
  click('#cust-list .item'); await sleep(50);
  assert.strictEqual(w.__pwned, undefined);
  assert.strictEqual(d.querySelector('.sheet img'), null);
  assert.deepStrictEqual(errors, []);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/admin.test.js`
Expected: FAIL(`[data-v=customers]` が無い)

- [ ] **Step 3: 実装する(`admin.html`)**

3-1. CSS(`@media (prefers-reduced-motion...)` の前)に追加:
```css
/* customers */
.cfilter{display:grid;grid-template-columns:1fr auto;gap:8px;padding:14px 16px 0}
.cfilter input,.cfilter select{min-height:44px;padding:8px 12px;border:1px solid var(--line);border-radius:6px;background:#fff;font-size:16px}
.hist{list-style:none;margin:0;padding:0}
.hist li{padding:8px 0;border-bottom:1px solid var(--line);font-size:14px}
```

3-2. デモバックエンド。`/** スプレッドシートのメニューを取得。` の前の `const demoClosed = ...` の下に追加:
```js
const demoCustFields = new Map();   // 顧客ID → 手入力項目(デモ表示は画面内のメモリのみ)
/** デモ予約から顧客一覧を作る(GAS の customerStats_ と同じ集計) */
function demoCustomers(){
  const srcs = ['instagram_dm','instagram','line','web'], byId = new Map();
  demo.forEach(r => { if(r.customerId && !byId.has(r.customerId)) byId.set(r.customerId, r); });
  const byTime = (a,b) => (a.date+a.time) < (b.date+b.time) ? -1 : 1;
  return [...byId.values()].map((r, i) => {
    if(!demoCustFields.has(r.customerId)) demoCustFields.set(r.customerId, {instagram: i % 2 === 0 ? '@guest'+(i+1) : '', refSource: srcs[i % srcs.length], inquiryDate:'', inquiryId:'', memo:''});
    const mine = demo.filter(x => x.customerId === r.customerId);
    const visited = mine.filter(x => x.status === '来店済');
    const upcoming = mine.filter(x => x.status === '確定' && x.date >= TODAY).sort(byTime);
    return {id:r.customerId, name:r.name, kana:r.kana, tel:r.tel, email:r.email, ...demoCustFields.get(r.customerId),
      lineLinked:r.lineLinked, visits:visited.length, reservations:mine.filter(x => x.status !== 'キャンセル').length,
      lastVisit: visited.reduce((m,x) => x.date > m ? x.date : m, ''),
      next: upcoming[0] ? upcoming[0].date + ' ' + upcoming[0].time : '',
      history: mine.slice().sort(byTime).reverse().map(x => ({date:x.date, time:x.time, menuName:x.menuName, status:x.status}))};
  });
}
```
`api()` のデモ分岐の `case 'adminCreate': {...}` の後ろに追加:
```js
    case 'adminCustomers': return {ok:true, customers:demoCustomers()};
    case 'adminCustomerUpdate': {
      if(!demoCustFields.has(extra.id)) return {ok:false, error:'not_found'};
      if(String(extra.instagram||'').length > 100 || String(extra.memo||'').length > 1000) return {ok:false, error:'too_long'};
      demoCustFields.set(extra.id, {...demoCustFields.get(extra.id), instagram:extra.instagram||'', refSource:extra.refSource||'', inquiryDate:extra.inquiryDate||'', memo:extra.memo||''});
      return {ok:true};
    }
```

3-3. 状態と文言。`A` に追加: `cust:null, custLoading:false, custFailed:false, custQ:'', custSrc:'', custSel:null, custForm:null,`。`errMsg` のマップに `bad_source:'流入元が正しくありません', too_long:'入力が長すぎます(Instagram名は100文字、メモは1000文字まで)',` を追加。`reload()` に `A.cust = null; A.custFailed = false;` を追加。`logout()` の初期化に `A.cust = null; A.custFailed = false; A.custSel = null; A.custForm = null;` を追加。

3-4. 画面。Task 4 で追加した `NAV` / `VIEWS` / `navBtns` の**直後**(`render()` の直前)に追加(末尾の `VIEWS.customers = …` / `NAV.push(…)` が定義より後ろになるようにする):
```js
const SRC_LABEL = {instagram_dm:'Instagram DM', instagram:'Instagram', line:'LINE', web:'予約サイト', other:'電話・その他'};
function ensureCustomers(){
  if(A.cust || A.custLoading || A.custFailed) return;
  A.custLoading = true;
  api('adminCustomers').then(j => {
    if(!j.ok){ if(j.error === 'auth'){ logout(true); return; } throw new Error(j.error); }
    A.cust = j.customers;
  }).catch(() => { A.custFailed = true; }).finally(() => { A.custLoading = false; render(); });
}
function custFiltered(){
  const q = A.custQ.trim().toLowerCase(), src = A.custSrc;
  return (A.cust || []).filter(c => (!src || c.refSource === src) &&
      (!q || [c.name, c.kana, c.tel, c.instagram, c.id, c.email].some(v => String(v || '').toLowerCase().includes(q))))
    .sort((a,b) => (b.lastVisit || '').localeCompare(a.lastVisit || '') || a.id.localeCompare(b.id));
}
function custRowHTML(c){
  return `<li><button class="item" data-act="cust" data-v="${esc(c.id)}"><span class="b">
    <span class="n">${esc(c.name)} 様${c.refSource ? `<span class="tag">${esc(SRC_LABEL[c.refSource] || c.refSource)}</span>` : ''}${c.lineLinked ? '<span class="tag new">LINE連携</span>' : ''}</span>
    <span class="m" style="display:block">${c.visits}回来店${c.lastVisit ? ' / 最終 ' + esc(c.lastVisit) : ''}${c.next ? ' / 次回 ' + esc(c.next) : ''}</span></span></button></li>`;
}
function custListHTML(){
  const l = custFiltered();
  return l.length ? `<ul class="list">${l.map(custRowHTML).join('')}</ul>` : '<p class="empty">該当するお客様はいません。</p>';
}
function customersView(){
  ensureCustomers();
  if(A.custFailed) return `<div class="err" role="alert">顧客を取得できませんでした。</div><div style="padding:12px 16px"><button class="btn ghost" data-act="reload">もう一度読み込む</button></div>`;
  if(!A.cust) return '<p class="loading">読み込み中…</p>';
  const opts = Object.keys(SRC_LABEL).map(k => `<option value="${k}" ${A.custSrc===k?'selected':''}>${SRC_LABEL[k]}</option>`).join('');
  return `<div class="cfilter"><input type="search" id="cust-q" data-f="custq" value="${esc(A.custQ)}" placeholder="名前・電話・Instagram名・顧客IDで検索" aria-label="顧客を検索">
      <select id="cust-src" data-f="custsrc" aria-label="流入元で絞り込む"><option value="">すべて</option>${opts}</select></div>
    ${A.ok ? `<div class="ok" role="status">${esc(A.ok)}</div>` : ''}
    <div class="sub">お客様 ${A.cust.length}名</div><div id="cust-list">${custListHTML()}</div>`;
}
function custSheetHTML(){
  const c = (A.cust || []).find(x => x.id === A.custSel), f = A.custForm;
  if(!c || !f) return '';
  const tel = String(c.tel || '').replace(/[^\d+]/g, '');
  const hist = c.history.length ? c.history.map(h => `<li>${esc(fmtDate(h.date))} ${esc(h.time)}　${esc(h.menuName)}<span class="tag ${h.status==='キャンセル'?'x':h.status==='来店済'?'ok':''}">${esc(h.status)}</span></li>`).join('') : '<li>予約履歴はありません</li>';
  const opts = Object.keys(SRC_LABEL).map(k => `<option value="${k}" ${f.refSource===k?'selected':''}>${SRC_LABEL[k]}</option>`).join('');
  return `<div class="back" data-act="close"><div class="sheet" role="dialog" aria-modal="true" aria-label="顧客の詳細" data-stop="1">
    <h2>${esc(c.name)} 様</h2><div class="sm">${esc(c.kana)}　顧客ID ${esc(c.id)}</div>
    <dl class="dl">
      <div><dt>電話</dt><dd>${c.tel ? `<a href="tel:${tel}">${esc(c.tel)}</a>` : '—'}</dd></div>
      <div><dt>メール</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</dd></div>
      <div><dt>LINE</dt><dd>${c.lineLinked ? '連携済み' : '未連携'}</dd></div>
      <div><dt>来店</dt><dd>${c.visits}回 / 予約${c.reservations}件${c.lastVisit ? '<br>最終来店 ' + esc(c.lastVisit) : ''}${c.next ? '<br>次回予約 ' + esc(c.next) : ''}</dd></div>
      <div><dt>問い合わせID</dt><dd>${esc(c.inquiryId || '—')}</dd></div>
    </dl>
    <h3 class="sub" style="padding:0 0 4px;font-size:16px">予約履歴</h3><ul class="hist">${hist}</ul>
    <div style="height:14px"></div>
    <div class="f"><label for="c-instagram">Instagram名</label><input id="c-instagram" data-f="cform" data-k="instagram" value="${esc(f.instagram)}" maxlength="100"></div>
    <div class="row2">
      <div class="f"><label for="c-src">流入元</label><select id="c-src" data-f="cform" data-k="refSource"><option value="">未設定</option>${opts}</select></div>
      <div class="f"><label for="c-idate">初回問い合わせ日</label><input id="c-idate" type="date" data-f="cform" data-k="inquiryDate" value="${esc(f.inquiryDate)}"></div>
    </div>
    <div class="f"><label for="c-memo">メモ(DM対応の記録など)</label><textarea id="c-memo" data-f="cform" data-k="memo" maxlength="1000">${esc(f.memo)}</textarea></div>
    ${A.msg ? `<div class="err" role="alert" style="margin:0 0 10px">${esc(A.msg)}</div>` : ''}
    <div class="acts"><button class="btn" data-act="custsave" ${A.busy?'disabled':''}>${A.busy?'保存中…':'保存する'}</button><button class="btn ghost" data-act="close">閉じる</button></div>
  </div></div>`;
}
VIEWS.customers = customersView;
NAV.push(['customers','顧客']);
```
3-5. `render()` のシート描画行を `${A.form ? formHTML() : A.sheet ? sheetHTML() : A.custSel ? custSheetHTML() : ''}` に変更。

3-6. アクション。`setClosed` の下に追加:
```js
async function custSave(){
  const f = A.custForm;
  A.busy = true; A.msg = ''; render();
  try{
    const v = {instagram:f.instagram.trim(), refSource:f.refSource, inquiryDate:f.inquiryDate, memo:f.memo.trim()};
    const j = await api('adminCustomerUpdate', {id:A.custSel, ...v});
    if(!j.ok){ if(j.error === 'auth'){ logout(true); return; } throw new Error(j.error); }
    Object.assign(A.cust.find(x => x.id === A.custSel), v);
    A.custSel = null; A.custForm = null; A.ok = '顧客情報を保存しました。';
  } catch(e){ A.msg = errMsg(e.message); }
  A.busy = false; render();
}
const refreshCustList = () => { const el = document.getElementById('cust-list'); if(el) el.innerHTML = custListHTML(); };
```
クリックハンドラに追加:
```js
    case 'cust': { const c = A.cust.find(x => x.id === v); if(!c) break; A.custSel = v; A.custForm = {instagram:c.instagram, refSource:c.refSource, inquiryDate:c.inquiryDate, memo:c.memo}; A.msg = ''; A.ok = ''; render(); break; }
    case 'custsave': custSave(); break;
```
`case 'close':` の行を `case 'close': A.sheet = null; A.form = null; A.custSel = null; A.custForm = null; A.msg = ''; render(); break;` に変更。Escapeキーのリスナーも同様に `A.custSel` を閉じる条件・処理へ拡張:
```js
document.addEventListener('keydown', e => { if(e.key === 'Escape' && (A.sheet || A.form || A.custSel)){ A.sheet = null; A.form = null; A.custSel = null; A.custForm = null; A.msg = ''; render(); } });
```
入力ハンドラ(`app.addEventListener('input', ...)`)に追加(検索は一覧だけを書き換え、入力欄を作り直さない):
```js
  else if(f === 'custq'){ A.custQ = t.value; refreshCustList(); }
  else if(f === 'custsrc'){ A.custSrc = t.value; refreshCustList(); }
  else if(f === 'cform'){ A.custForm[t.dataset.k] = t.value; }
```
(既存の `if(f === 'pw') ... else if(f === 'form') ...` の連鎖に `else if` で連ねる。)

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: 全て PASS

- [ ] **Step 5: コミット**
```bash
git add admin.html tests/admin.test.js
git commit -m "kohaku-booking: 管理画面に顧客一覧・詳細・編集を追加"
```

---

### Task 6: 管理画面「予約リンク」発行ツール

**Files:**
- Modify: `admin.html`(`CONFIG.SITE_URL`、`MENU` 予備配列に `id`、`loadMenu` に `id`、画面・アクション)
- Modify: `tests/admin.test.js`

**Interfaces:**
- Consumes: Task 4 の `NAV` / `VIEWS`、Task 5 の `SRC_LABEL`
- Produces: `buildBookingLink(base, {source, inquiry, menu}) → string`、`MENU[].id`

- [ ] **Step 1: 失敗するテストを書く**

`tests/admin.test.js` に追記(ファイル先頭の `require` に `fs` / `path` / `vm` が無ければ追加):
```js
test('管理画面: 予約リンク発行(流入元・問い合わせID・メニューからURLを作る)', async () => {
  const { click, type, d, errors } = load('admin.html');
  type('#pw', 'demo'); click('[data-act=login]'); await sleep(1000);
  click('[data-act=section][data-v=links]'); await sleep(100);
  const url = () => d.querySelector('#l-url').value;
  assert.strictEqual(url(), 'https://example.test/index.html?source=instagram_dm');
  type('#l-inquiry', 'IG-00125');
  type('#l-menu', 'aroma60');
  assert.strictEqual(url(), 'https://example.test/index.html?source=instagram_dm&inquiry=IG-00125&menu=aroma60');
  type('#l-source', 'line');
  assert.match(url(), /source=line/);
  // 問い合わせIDが不正なら発行しない
  type('#l-inquiry', 'あ b&c');
  assert.strictEqual(url(), '');
  assert.match(d.querySelector('#link-out').textContent, /英数字/);
  // コピー(clipboard が使えない環境では選択して案内する)
  type('#l-inquiry', 'IG-1');
  click('[data-act=copylink]'); await sleep(50);
  assert.match(d.querySelector('#link-out').textContent, /コピー/);
  assert.deepStrictEqual(errors, []);
});

test('管理画面: メニューの予備配列は GAS の初期データ(表示ON・おまかせ除く)と同じID・並び', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const ctx = vm.createContext({ console });
  vm.runInContext(src + '\n;this.__s = { SEED_MENU };', ctx);
  const ids = ctx.__s.SEED_MENU.filter(r => r[8] === 'ON' && r[7] !== 'omakase').map(r => r[0]);
  const { w } = load('admin.html');
  assert.deepStrictEqual(JSON.parse(w.eval('JSON.stringify(MENU.map(m => m.id))')), ids);
});
```
ファイル先頭に不足していれば追加: `const fs = require('fs'); const path = require('path'); const vm = require('node:vm');`

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/admin.test.js`
Expected: FAIL(`[data-v=links]` が無い、`MENU[].id` が undefined)

- [ ] **Step 3: 実装する(`admin.html`)**

3-1. `CONFIG` に追加: `SITE_URL:''`(コメント: 予約サイト(index.html)のURL。空なら同じフォルダの index.html)。例:
```js
const CONFIG = { GAS_URL:'', SITE_URL:'', SALON:'琥珀', OPEN:'10:00', CLOSE:'20:00', STEP_MIN:30, CLOSED_WEEKDAYS:[3] };
```

3-2. `MENU` 予備配列に `id` を持たせる。`let MENU = [` の配列を、`gas/Code.gs` の `SEED_MENU`(表示ON・おまかせ除く)と同じ順序で、各行の先頭にIDを足す形に置き換え、`.map` を変更:
```js
let MENU = [
  ['first100','アロマボディトリートメント × まこも蒸し(初回限定)',100,10000],
  ['aroma60','Relax アロマボディトリートメント',60,7000],['aroma80','満足 アロマボディトリートメント',80,9000],['aroma100','疲労回復 アロマボディトリートメント',100,11000],
  ['f-light','ローズフェイシャル A',40,5600],['f-relax','ローズフェイシャル B',65,8100],['f-onkatsu','ローズフェイシャル C',70,11600],['f-premium','ローズフェイシャル D',95,14100],
  ['set90','Relax アロマボディトリートメント + よもぎ蒸し',90,10000],['set110','満足 アロマボディトリートメント + よもぎ蒸し',110,12000],['set130','疲労回復 アロマボディトリートメント + よもぎ蒸し',130,14000],
  ['course110','全身満たされる110分コース',110,13000],['course140','全身満たされる140分コース',140,18600],
  ['p-yomogi','ペア よもぎ蒸し(2名分)',40,6000],['p-makomo','ペア まこも蒸し(2名分)',40,12000],
  ['p-yomogi-foot','ペア よもぎ蒸し + フットまたは頭ほぐし30分(2名分)',70,12000],['p-makomo-foot','ペア まこも蒸し + フットまたは頭ほぐし30分(2名分)',70,18000]
].map(([id,name,min,price]) => ({id,name,min,price,label:`${name} ${min}分`}));
```
`loadMenu` の `list` のマッピングに `id:m.id` を追加: `.map(m => ({id:m.id, name:m.name, min:m.min, price:m.price, label:\`${m.name} ${m.min}分\`}))`。

3-3. 画面とアクション。Task 5 で追加したブロック末尾の `NAV.push(['customers','顧客']);` の**直後**(`render()` の直前)に追加:
```js
/* ---------- 予約リンク発行 ---------- */
const INQ_RE = /^[A-Za-z0-9_-]{1,32}$/;
A.link = {source:'instagram_dm', inquiry:'', menu:''};
function buildBookingLink(base, f){
  const u = new URL(base, location.href);
  u.search = ''; u.hash = '';
  if(f.source) u.searchParams.set('source', f.source);
  if(f.inquiry) u.searchParams.set('inquiry', f.inquiry);
  if(f.menu) u.searchParams.set('menu', f.menu);
  return u.toString();
}
function linkOutHTML(){
  const f = A.link, bad = f.inquiry && !INQ_RE.test(f.inquiry);
  const url = bad ? '' : buildBookingLink(CONFIG.SITE_URL || 'index.html', f);
  return `${bad ? '<div class="err" role="alert" style="margin:0 0 10px">問い合わせIDは英数字・ハイフン・アンダースコアで32文字以内にしてください。</div>' : ''}
    <div class="f"><label for="l-url">予約リンク(お客様に送るURL)</label><input id="l-url" readonly value="${esc(url)}"></div>
    ${A.ok ? `<div class="ok" role="status" style="margin:0 0 10px">${esc(A.ok)}</div>` : ''}
    <button class="btn" data-act="copylink" ${url ? '' : 'disabled'}>リンクをコピー</button>`;
}
function linksView(){
  const f = A.link;
  const src = Object.keys(SRC_LABEL).map(k => `<option value="${k}" ${f.source===k?'selected':''}>${SRC_LABEL[k]}</option>`).join('');
  const menus = MENU.filter(m => m.id).map(m => `<option value="${esc(m.id)}" ${f.menu===m.id?'selected':''}>${esc(m.label)}</option>`).join('');
  return `<div style="padding:16px">
    <h2 class="sub" style="padding:0 0 4px">予約リンクを作る</h2>
    <p class="sm" style="color:var(--muted);margin:0 0 14px">DMなどでお客様に送るリンクです。開くとメニューが選択済みになり、ご予約と顧客に流入元・問い合わせIDが記録されます。</p>
    <div class="f"><label for="l-source">流入元</label><select id="l-source" data-f="link" data-k="source">${src}</select></div>
    <div class="f"><label for="l-inquiry">問い合わせID(任意)</label><input id="l-inquiry" data-f="link" data-k="inquiry" value="${esc(f.inquiry)}" placeholder="例: IG-00125" maxlength="40" autocomplete="off"></div>
    <div class="f"><label for="l-menu">メニュー(任意)</label><select id="l-menu" data-f="link" data-k="menu"><option value="">指定しない</option>${menus}</select></div>
    <div id="link-out">${linkOutHTML()}</div></div>`;
}
const refreshLink = () => { const el = document.getElementById('link-out'); if(el) el.innerHTML = linkOutHTML(); };
async function copyLink(){
  const el = document.getElementById('l-url');
  if(!el || !el.value) return;
  try{ await navigator.clipboard.writeText(el.value); A.ok = 'リンクをコピーしました。'; }
  catch(e){ el.focus(); el.select(); A.ok = 'リンクを選択しました。コピーしてお使いください。'; }
  refreshLink();
}
VIEWS.links = linksView;
NAV.push(['links','予約リンク']);
```
入力ハンドラの連鎖に追加: `else if(f === 'link'){ A.link[t.dataset.k] = t.value; A.ok = ''; refreshLink(); }`。クリックハンドラに追加: `case 'copylink': copyLink(); break;`。

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test && npm run check:gas`
Expected: 全て PASS

- [ ] **Step 5: コミット**
```bash
git add admin.html tests/admin.test.js
git commit -m "kohaku-booking: 管理画面に予約リンク発行ツールを追加"
```

---

### Task 7: ドキュメントと全体確認

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/deploy-checklist.md`

- [ ] **Step 1: `CLAUDE.md` を更新**
  - 「ファイル構成」表の `tests/` 行を「jsdomによるフロントのスモークテスト + GAS純関数のテスト(vm)」に
  - 「API」: `POST {action}` の管理に `adminSetClosed` / `adminCustomers` / `adminCustomerUpdate` を追記。`adminList` は `closures` を返す旨と、予約応答の `refSource` / `inquiryId`
  - 「データモデル」: 予約を26列(末尾に `流入元`, `問い合わせID`)、顧客を15列(末尾に `Instagram名`, `流入元`, `初回問い合わせ日`, `問い合わせID`)に更新。「顧客の空欄だけを予約リンクで埋め、手入力は上書きしない」を明記
  - 「設定の置き場所」: `admin.html` の `CONFIG.SITE_URL`(予約リンクのベースURL)を追加
  - 「実装済み / 未実装」: 実装済みに「営業日(臨時休業)/顧客一覧・編集/予約リンク発行・流入元記録」を追加。未実装1番から「営業日」「顧客一覧」を外す(残りは クーポン管理 / 売上分析 / メニュー設定 / スタッフ管理)
  - 「公開の順序」: 列追加があるので `setup` 再実行が必要な旨を追記

- [ ] **Step 2: `docs/deploy-checklist.md` の確認表に行を追記**(12行目の後ろ。番号は続き)

| 13 | `setup` を再実行 | `予約`シートが26列、`顧客`シートが15列になる(見出しも入る) |
| 14 | `…/index.html?source=instagram_dm&inquiry=IG-TEST1&menu=aroma60` を開いて予約を1件通す | 詳細画面から始まる。`予約`の末尾2列に `instagram_dm` / `IG-TEST1`、`顧客`に流入元・問い合わせID・初回問い合わせ日が入る |
| 15 | 同じメールで `?source=line` 付きでもう1件予約 | 顧客の流入元が `instagram_dm` のまま(上書きされない) |
| 16 | 管理画面: 顧客 → 検索 → 詳細で Instagram名・メモを編集 → 保存 | `顧客`シートに反映。`メモ` に `=` で始まる文字を入れても式にならない |
| 17 | 管理画面: 予約リンク → 流入元・問い合わせID・メニューを選ぶ | URLが生成され、開くとメニュー選択済みで始まる |
| 18 | 管理画面: カレンダーで臨時休業を登録/解除 | カレンダーに終日予定 `【臨時休業】` が作られ/消え、予約サイトでその日が選べなくなる/戻る |
| 19 | (LINE使用時)LIFFのURLに `?source=line` を付けて開く | `liff.state` 経由でも流入元が記録される |

- [ ] **Step 3: 全体確認**

Run: `npm test && npm run check:gas`
Expected: 全て PASS、`gas/Code.gs: syntax OK`

PCとスマホ幅の見た目は、`npx serve .` で `admin.html` を開いて確認する(`GAS_URL` が空のデモ表示。パスワード `demo`)。
- 900px以上: 左に紺(ink)のサイドバー、右にコンテンツ
- 900px未満: 下タブ、予約追加ボタンが下タブの上に出る
- 顧客: 検索・流入元絞り込み・詳細・編集
- 予約リンク: URL生成・コピー

- [ ] **Step 4: コミット**
```bash
git add CLAUDE.md docs/deploy-checklist.md
git commit -m "kohaku-booking: 顧客管理・予約リンクの仕様と実機確認項目をドキュメントに反映"
```

---

## Self-Review(計画書の自己点検結果)
- **Spec coverage**: 3章(パラメータ)=Task 3 / 4章(データモデル)=Task 1・2 / 5章(API)=Task 2 / 6章(管理画面: ナビ=Task 4、顧客=Task 5、リンク発行=Task 6) / 7章(エラー・セキュリティ)=Task 1・5・6のテスト・`errMsg` / 8章(テスト・チェックリスト)=各Task + Task 7 / 9章(公開順序)=Task 7。
- **型・名前の整合**: `refSource` / `inquiryId` / `inquiryDate` / `instagram` は GAS・デモ・画面で統一。API入力名は `refSource`(画面→GAS)、予約payloadは `source` / `inquiry`(予約サイト→GAS、GAS内で `refSource` / `inquiryId` に変換)。
- **既知の限界**: シート入出力(`upsertCustomer_` の書き込み、`migrate_`、`ensureColumns_` の実シート挙動)は vm のユニットテストでは検証できず、Task 7 のチェックリスト13〜16で実機確認する。
