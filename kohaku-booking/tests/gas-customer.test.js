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

test('列定義: 予約28列・顧客15列で、追加は末尾', () => {
  const g = loadGas();
  assert.strictEqual(g.HEADERS.length, 28);
  assert.deepStrictEqual(j(g.HEADERS.slice(23)), ['当日リマインド送信日時', '流入元', '問い合わせID', 'クーポン', '割引額']);
  assert.strictEqual(g.CUSTOMER_HEADERS.length, 15);
  assert.deepStrictEqual(j(g.CUSTOMER_HEADERS.slice(10)), ['メモ', 'Instagram名', '流入元', '初回問い合わせ日', '問い合わせID']);
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

test('handleAction_: 顧客系アクションはトークン無しだと auth で拒否される', () => {
  const g = loadGas();
  g.CacheService = { getScriptCache: () => ({ get: () => null }) };   // adminAuth_ が参照する
  assert.deepStrictEqual(j(g.handleAction_({ action: 'adminCustomers' })), { ok: false, error: 'auth' });
  assert.deepStrictEqual(j(g.handleAction_({ action: 'adminCustomerUpdate', id: 'C000001' })), { ok: false, error: 'auth' });
});

test('lineUserUnreachable_: 個別の届かない理由だけ停止。403単独・429・5xxは停止しない', () => {
  const g = loadGas();
  assert.strictEqual(g.lineUserUnreachable_(400, '{"message":"The user hasn\'t added the LINE Official Account as a friend or has blocked"}'), true);
  assert.strictEqual(g.lineUserUnreachable_(403, '{"message":"Access to this API is not available for your account"}'), false);
  assert.strictEqual(g.lineUserUnreachable_(429, '{"message":"You have reached your monthly limit."}'), false);
  assert.strictEqual(g.lineUserUnreachable_(500, 'blocked upstream'), false);
  assert.strictEqual(g.lineUserUnreachable_(400, ''), false);
});
