const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

function loadGas() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const ctx = vm.createContext({ console });
  vm.runInContext(src + '\n;this.__c = { HEADERS, COUPON_HEADERS, COUPON_TYPES, COUPON_STATUSES };', ctx);
  return Object.assign(ctx, ctx.__c);
}
const j = o => JSON.parse(JSON.stringify(o));
const TODAY = '2026-10-11';
const cp = (o = {}) => Object.assign({ code: 'CP-TEST', name: 'テスト', desc: '', target: '', from: '', to: '', status: '有効', type: '金額', value: 500 }, o);
const used = (o = {}) => Object.assign({ couponCode: 'CP-TEST', email: 'a@example.com', status: '確定' }, o);
const apply = (g, c, rows, o = {}) => j(g.couponApply_([c], rows, o.code !== undefined ? o.code : 'CP-TEST', o.email !== undefined ? o.email : 'a@example.com', o.total === undefined ? 7000 : o.total, TODAY));

test('列定義: 予約28列・クーポン9列で、追加は末尾', () => {
  const g = loadGas();
  assert.strictEqual(g.HEADERS.length, 28);
  assert.deepStrictEqual(j(g.HEADERS.slice(24)), ['流入元', '問い合わせID', 'クーポン', '割引額']);
  assert.strictEqual(g.COUPON_HEADERS.length, 9);
  assert.deepStrictEqual(j(g.COUPON_HEADERS.slice(7)), ['割引種別(金額/割合)', '割引値']);
  assert.deepStrictEqual(j(g.COUPON_TYPES), ['', '金額', '割合']);
  assert.deepStrictEqual(j(g.COUPON_STATUSES), ['有効', '無効', '使用済']);
});

test('parseRow_: クーポン・割引額を読む(28列未満の行でも落ちない)', () => {
  const g = loadGas();
  const v = new Array(28).fill('');
  v[0] = 'K1'; v[2] = '確定'; v[3] = '2026-10-20'; v[4] = '10:00'; v[5] = '11:00'; v[26] = 'CP-ABC123'; v[27] = '500';
  const r = g.parseRow_(v, 0);
  assert.strictEqual(r.couponCode, 'CP-ABC123');
  assert.strictEqual(r.couponDiscount, 500);
  const old = g.parseRow_(v.slice(0, 26), 0);
  assert.strictEqual(old.couponCode, '');
  assert.strictEqual(old.couponDiscount, 0);
});

test('normCouponCode_: 全角→半角・空白除去・大文字化', () => {
  const g = loadGas();
  assert.strictEqual(g.normCouponCode_(' ａｂｃ－１２３ '), 'ABC-123');
  assert.strictEqual(g.normCouponCode_('cp-abc123'), 'CP-ABC123');
  assert.strictEqual(g.normCouponCode_(null), '');
  assert.strictEqual(g.normCouponCode_(undefined), '');
});

test('parseCouponRows_: 旧7列の行は割引未設定、コード空の行は除外、値は整数化', () => {
  const g = loadGas();
  const rows = j(g.parseCouponRows_([
    ['welcome500', 'ご来店ありがとう', 'オプション1つサービス', 'A@Example.com', '', '2026-12-31', '有効'],
    ['CP-NEW', '新規', '', '', '2026-10-01', '2026-10-31', '有効', '金額', '１,０００'],
    ['', '空コード', '', '', '', '', '有効', '金額', '500'],
    ['CP-BAD', '不正種別', '', '', '', '', '有効', 'xx', '10'],
    ['CP-PCT', '割合', '', '', '', '', '無効', '割合', '10']
  ]));
  assert.deepStrictEqual(rows.map(r => r.code), ['WELCOME500', 'CP-NEW', 'CP-BAD', 'CP-PCT']);
  assert.deepStrictEqual([rows[0].type, rows[0].value, rows[0].target], ['', null, 'a@example.com']);
  assert.deepStrictEqual([rows[1].type, rows[1].value, rows[1].from, rows[1].to], ['金額', 1000, '2026-10-01', '2026-10-31']);
  assert.strictEqual(rows[2].type, '');
  assert.strictEqual(rows[3].status, '無効');
  assert.strictEqual(rows[0].row, 2);
});

test('couponDiscountText_ / couponConfigured_', () => {
  const g = loadGas();
  assert.strictEqual(g.couponDiscountText_(cp({ type: '金額', value: 1000 })), '1,000円OFF');
  assert.strictEqual(g.couponDiscountText_(cp({ type: '割合', value: 10 })), '10%OFF');
  assert.strictEqual(g.couponDiscountText_(cp({ type: '', value: null })), '');
  assert.strictEqual(g.couponConfigured_(cp()), true);
  assert.strictEqual(g.couponConfigured_(cp({ type: '' })), false);
  assert.strictEqual(g.couponConfigured_(cp({ type: '割合', value: 101 })), false);
  assert.strictEqual(g.couponConfigured_(cp({ type: '割合', value: 100 })), true);
  assert.strictEqual(g.couponConfigured_(cp({ type: '金額', value: 0 })), false);
  assert.strictEqual(g.couponConfigured_(cp({ type: '金額', value: null })), false);
});

test('couponApply_: 金額OFF・割合・上限・切り捨て', () => {
  const g = loadGas();
  assert.deepStrictEqual(apply(g, cp(), []), { ok: true, code: 'CP-TEST', name: 'テスト', discount: 500, total: 6500 });
  assert.deepStrictEqual(apply(g, cp({ value: 10000 }), []).total, 0);            // 合計を超える金額OFFは合計まで
  assert.strictEqual(apply(g, cp({ value: 10000 }), []).discount, 7000);
  assert.strictEqual(apply(g, cp({ type: '割合', value: 10 }), [], { total: 7550 }).discount, 755);
  const odd = apply(g, cp({ type: '割合', value: 10 }), [], { total: 7555 });
  assert.deepStrictEqual([odd.discount, odd.total], [755, 6800]);                  // 755.5 → 755(切り捨て)
  const full = apply(g, cp({ type: '割合', value: 100 }), []);
  assert.deepStrictEqual([full.discount, full.total], [7000, 0]);
  assert.strictEqual(apply(g, cp(), [], { total: 0 }).total, 0);                   // 合計0でも負にならない
});

test('couponApply_: 適用できない料金・割引未設定は coupon_not_applicable', () => {
  const g = loadGas();
  assert.deepStrictEqual(apply(g, cp(), [], { total: null }), { ok: false, error: 'coupon_not_applicable' });
  assert.deepStrictEqual(apply(g, cp({ type: '', value: null }), []), { ok: false, error: 'coupon_not_applicable' });
  assert.deepStrictEqual(apply(g, cp({ type: '割合', value: 101 }), []), { ok: false, error: 'coupon_not_applicable' });
});

test('couponApply_: 存在しない・無効・期間外・対象外は全て bad_coupon(区別しない)', () => {
  const g = loadGas();
  const bad = { ok: false, error: 'bad_coupon' };
  assert.deepStrictEqual(apply(g, cp(), [], { code: 'NOPE-1' }), bad);
  assert.deepStrictEqual(apply(g, cp({ status: '無効' }), []), bad);
  assert.deepStrictEqual(apply(g, cp({ status: '使用済' }), []), bad);
  assert.deepStrictEqual(apply(g, cp({ from: '2026-10-12' }), []), bad);
  assert.deepStrictEqual(apply(g, cp({ to: '2026-10-10' }), []), bad);
  assert.deepStrictEqual(apply(g, cp({ target: 'b@example.com' }), []), bad);
  assert.deepStrictEqual(apply(g, cp(), [], { code: 'x' }), bad);                  // 形式不正
  assert.deepStrictEqual(apply(g, cp(), [], { code: '' }), bad);
});

test('couponApply_: 境界の日付・対象メール・コードの正規化', () => {
  const g = loadGas();
  assert.strictEqual(apply(g, cp({ from: TODAY }), []).ok, true);
  assert.strictEqual(apply(g, cp({ to: TODAY }), []).ok, true);
  assert.strictEqual(apply(g, cp({ target: 'a@example.com' }), [], { email: ' A@Example.COM ' }).ok, true);
  assert.strictEqual(apply(g, cp(), [], { code: ' ｃｐ-ｔｅｓｔ ' }).ok, true);
});

test('couponApply_: 同じメールで2回目は coupon_used。キャンセルで復活、別メールは使える', () => {
  const g = loadGas();
  assert.deepStrictEqual(apply(g, cp(), [used()]), { ok: false, error: 'coupon_used' });
  assert.deepStrictEqual(apply(g, cp(), [used({ email: 'A@Example.com' })]), { ok: false, error: 'coupon_used' });
  assert.strictEqual(apply(g, cp(), [used({ status: 'キャンセル' })]).ok, true);
  assert.strictEqual(apply(g, cp(), [used({ email: 'b@example.com' })]).ok, true);
  assert.strictEqual(apply(g, cp(), [used({ couponCode: 'CP-OTHER' })]).ok, true);
  assert.strictEqual(apply(g, cp(), [used({ status: '来店済' })]).ok, false);
});

test('couponState_', () => {
  const g = loadGas();
  assert.strictEqual(g.couponState_(cp(), TODAY), 'active');
  assert.strictEqual(g.couponState_(cp({ status: '無効' }), TODAY), 'disabled');
  assert.strictEqual(g.couponState_(cp({ status: '使用済' }), TODAY), 'disabled');
  assert.strictEqual(g.couponState_(cp({ type: '', value: null }), TODAY), 'unset');
  assert.strictEqual(g.couponState_(cp({ to: '2026-10-10' }), TODAY), 'expired');
  assert.strictEqual(g.couponState_(cp({ from: '2026-10-12' }), TODAY), 'upcoming');
});

const okItem = (o = {}) => Object.assign({ code: '', name: '秋のクーポン', desc: '', target: '', from: '', to: '', status: '有効', type: '金額', value: 500 }, o);
const bad = f => ({ error: 'bad_field', field: f });

test('validateCouponItem_: コード・名称・説明・対象メール', () => {
  const g = loadGas();
  const v = (o, create = true, codes = []) => j(g.validateCouponItem_(okItem(o), create, codes));
  assert.strictEqual(v({}), '');
  assert.strictEqual(v({ code: 'cp-abc123' }), '');
  assert.deepStrictEqual(v({ code: 'ab' }), bad('code'));
  assert.deepStrictEqual(v({ code: 'A'.repeat(21) }), bad('code'));
  assert.deepStrictEqual(v({ code: 'a b' }), bad('code'));
  assert.deepStrictEqual(v({ code: 'CP-ABC123' }, true, ['CP-ABC123']), { error: 'duplicate_code', field: 'code' });
  assert.deepStrictEqual(v({ code: 'cp-abc123' }, true, ['CP-ABC123']), { error: 'duplicate_code', field: 'code' });
  assert.strictEqual(v({ code: 'CP-ABC123' }, false, ['CP-ABC123']), '');           // 更新では重複検査しない
  assert.deepStrictEqual(v({ name: '' }), bad('name'));
  assert.deepStrictEqual(v({ name: 'あ'.repeat(61) }), bad('name'));
  assert.deepStrictEqual(v({ desc: 'あ'.repeat(201) }), bad('desc'));
  assert.strictEqual(v({ target: 'A@Example.com' }), '');
  assert.deepStrictEqual(v({ target: 'not-an-email' }), bad('target'));
});

test('validateCouponItem_: 期間・状態・割引種別と値', () => {
  const g = loadGas();
  const v = o => j(g.validateCouponItem_(okItem(o), true, []));
  assert.strictEqual(v({ from: '2026-10-01', to: '2026-10-31' }), '');
  assert.strictEqual(v({ from: '2026-10-31', to: '2026-10-31' }), '');
  assert.deepStrictEqual(v({ from: '2026-11-01', to: '2026-10-31' }), bad('to'));
  assert.deepStrictEqual(v({ from: '2026/10/01' }), bad('from'));
  assert.deepStrictEqual(v({ to: '2026-02-31' }), bad('to'));
  assert.deepStrictEqual(v({ status: '停止' }), bad('status'));
  assert.deepStrictEqual(v({ type: '円' }), bad('type'));
  assert.strictEqual(v({ type: '', value: '' }), '');                                // 割引未設定として保存できる
  assert.deepStrictEqual(v({ type: '金額', value: 0 }), bad('value'));
  assert.deepStrictEqual(v({ type: '金額', value: 1000001 }), bad('value'));
  assert.strictEqual(v({ type: '金額', value: '１,０００円' }), '');
  assert.deepStrictEqual(v({ type: '金額', value: '' }), bad('value'));
  assert.deepStrictEqual(v({ type: '割合', value: 0 }), bad('value'));
  assert.strictEqual(v({ type: '割合', value: 100 }), '');
  assert.deepStrictEqual(v({ type: '割合', value: 101 }), bad('value'));
  assert.deepStrictEqual(v({ type: '割合', value: '12.5' }), bad('value'));
});

test('couponRowFromItem_: COUPON_HEADERS の並びの文字列。種別なしなら値は空', () => {
  const g = loadGas();
  const row = j(g.couponRowFromItem_({ code: 'cp-abc123', name: ' 名前 ', desc: ' 説明 ', target: 'A@Example.com', from: '2026-10-01', to: '2026-10-31', status: '有効', type: '割合', value: '10' }));
  assert.deepStrictEqual(row, ['CP-ABC123', '名前', '説明', 'a@example.com', '2026-10-01', '2026-10-31', '有効', '割合', '10']);
  assert.strictEqual(row.length, g.COUPON_HEADERS.length);
  const none = j(g.couponRowFromItem_({ code: 'CP-X', name: 'x', desc: '', target: '', from: '', to: '', status: '無効', type: '', value: 500 }));
  assert.deepStrictEqual(none.slice(7), ['', '']);
});

test('newCouponCode_: CP- + 6文字。既存と重複しない', () => {
  const g = loadGas();
  let n = 0;
  const rnd = () => (n++ < 6 ? 0 : 0.5);
  assert.strictEqual(g.newCouponCode_([], () => 0), 'CP-AAAAAA');
  const second = g.newCouponCode_(['CP-AAAAAA'], rnd);
  assert.notStrictEqual(second, 'CP-AAAAAA');
  assert.match(second, /^CP-[A-Z2-9]{6}$/);
  assert.match(g.newCouponCode_([]), /^CP-[A-Z2-9]{6}$/);
});

test('couponThrottled_: メール別10回・全体100回を超えたら制限', () => {
  const g = loadGas();
  const store = {};
  const cache = { get: k => (k in store ? store[k] : null), put: (k, v) => { store[k] = v; } };
  for (let i = 1; i <= 10; i++) assert.strictEqual(g.couponThrottled_(cache, 'a@example.com'), false, i + '回目');
  assert.strictEqual(g.couponThrottled_(cache, 'a@example.com'), true, '11回目');
  assert.strictEqual(g.couponThrottled_(cache, 'A@Example.com'), true, '正規化して同じメール');
  assert.strictEqual(g.couponThrottled_(cache, 'b@example.com'), false, '別メールは別枠');
  const all = {};
  const c2 = { get: k => (k in all ? all[k] : null), put: (k, v) => { all[k] = v; } };
  let blocked = 0;
  for (let i = 0; i < 120; i++) if (g.couponThrottled_(c2, 'u' + i + '@example.com')) blocked++;
  assert.strictEqual(blocked, 20, '全体100回を超えた分');
});
