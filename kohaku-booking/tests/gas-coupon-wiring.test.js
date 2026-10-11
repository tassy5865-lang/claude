const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

function loadGas() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const ctx = vm.createContext({ console });
  vm.runInContext(src + '\n;this.__c = { HEADERS, COUPON_HEADERS, MENU_HEADERS, OPTION_HEADERS, CONFIG };', ctx);
  return Object.assign(ctx, ctx.__c);
}
const j = o => JSON.parse(JSON.stringify(o));

function fakeSheet(headers, rows) {
  const data = [headers.slice()].concat(rows.map(r => r.slice()));
  return {
    data,
    getLastRow: () => data.length,
    getLastColumn: () => headers.length,
    getMaxColumns: () => 100,
    insertColumnsAfter() {},
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
        setValue(v) { data[r - 1] = data[r - 1] || []; data[r - 1][c - 1] = v; return rng; },
        setNumberFormat() { return rng; }
      };
      return rng;
    }
  };
}
// 予約(24列分の最小の行): ID, 受付, 状態, 日付, 開始, 終了, メニュー, オプション, 合計, 所要, 名前, カナ, 電話, メール
const resRow = (o) => {
  const v = new Array(28).fill('');
  v[0] = o.id; v[2] = o.status || '確定'; v[3] = '2026-10-20'; v[4] = '10:00'; v[5] = '11:00'; v[13] = o.email;
  v[26] = o.code || ''; v[27] = o.discount || '';
  return v;
};
const COUPON_ROWS = [
  ['CP-AAA111', '500円OFF', '', '', '', '2026-12-31', '有効', '金額', '500'],
  ['CP-PCT10', '10%OFF', '', '', '', '', '有効', '割合', '10'],
  ['CP-OLD', '期限切れ', '', '', '', '2026-01-01', '有効', '金額', '100'],
  ['CP-NOSET', '未設定', '表示のみ', '', '', '', '有効', '', ''],
  ['CP-ONLYME', '個別', '', 'me@example.com', '', '', '有効', '金額', '300']
];
const MENU_ROWS = [['aroma60', 'Relax', '60', '7000', '', 'aroma', 'aroma', '', 'ON', '1'], ['omk', 'おまかせ', '', '', '', 'omakase', 'omakase', 'omakase', 'ON', '2']];
function gasWithSheets(resRows = []) {
  const g = loadGas();
  const cfg = g.CONFIG;
  const sheets = {
    [cfg.SHEET_NAME]: fakeSheet(g.HEADERS, resRows),
    [cfg.COUPON_SHEET]: fakeSheet(g.COUPON_HEADERS, COUPON_ROWS),
    [cfg.MENU_SHEET]: fakeSheet(g.MENU_HEADERS, MENU_ROWS),
    [cfg.OPTION_SHEET]: fakeSheet(g.OPTION_HEADERS, [['head', '頭ほぐし', '10', '1500', 'ON', '1']])
  };
  const store = {};
  g.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] }) };
  g.CacheService = { getScriptCache: () => ({
    get: k => (k === 'adm:tok' ? '1' : (k in store ? store[k] : null)), put: (k, v) => { store[k] = v; }, remove: k => { delete store[k]; } }) };
  g.Utilities = { formatDate: () => '2026-10-11' };
  return { g, sheets, cfg };
}
const call = (g, action, extra) => j(g.handleAction_(Object.assign({ action, token: 'tok' }, extra)));

test('applyBookingCoupon_: コード無しは合計そのまま、有効なら割引、無効ならエラー', () => {
  const { g } = gasWithSheets();
  assert.deepStrictEqual(j(g.applyBookingCoupon_({ email: 'a@example.com' }, 7000)), { ok: true, code: '', discount: 0, total: 7000 });
  assert.deepStrictEqual(j(g.applyBookingCoupon_({ email: 'a@example.com', couponCode: '' }, 7000)), { ok: true, code: '', discount: 0, total: 7000 });
  assert.deepStrictEqual(j(g.applyBookingCoupon_({ email: 'a@example.com', couponCode: 'cp-aaa111' }, 7000)),
    { ok: true, code: 'CP-AAA111', name: '500円OFF', discount: 500, total: 6500 });
  assert.deepStrictEqual(j(g.applyBookingCoupon_({ email: 'a@example.com', couponCode: 'CP-OLD' }, 7000)), { ok: false, error: 'bad_coupon' });
  assert.deepStrictEqual(j(g.applyBookingCoupon_({ email: 'a@example.com', couponCode: 'CP-ONLYME' }, 7000)), { ok: false, error: 'bad_coupon' });
  assert.strictEqual(g.applyBookingCoupon_({ email: 'me@example.com', couponCode: 'CP-ONLYME' }, 7000).ok, true);
  assert.deepStrictEqual(j(g.applyBookingCoupon_({ email: 'a@example.com', couponCode: 'CP-AAA111' }, null)), { ok: false, error: 'coupon_not_applicable' });
});

test('applyBookingCoupon_: 同じメールの2回目は coupon_used、キャンセル後は再び使える', () => {
  const rows = [resRow({ id: 'K1', email: 'a@example.com', code: 'CP-AAA111', discount: '500' })];
  const { g } = gasWithSheets(rows);
  assert.deepStrictEqual(j(g.applyBookingCoupon_({ email: 'a@example.com', couponCode: 'CP-AAA111' }, 7000)), { ok: false, error: 'coupon_used' });
  const { g: g2 } = gasWithSheets([resRow({ id: 'K1', email: 'a@example.com', code: 'CP-AAA111', discount: '500', status: 'キャンセル' })]);
  assert.strictEqual(g2.applyBookingCoupon_({ email: 'a@example.com', couponCode: 'CP-AAA111' }, 7000).ok, true);
});

test('appendReservation_: クーポン・割引額が28列の末尾に書かれる', () => {
  const { g, sheets, cfg } = gasWithSheets();
  g.appendReservation_({ id: 'K9', status: '確定', date: '2026-10-20', time: '10:00', end: '11:00', menuName: 'Relax', options: 'なし', total: 6500, minutes: 60,
    name: 'テスト', kana: 'てすと', tel: '09012345678', email: 'a@example.com', visit: '初回', note: '', eventId: 'ev', menuId: 'aroma60',
    customerId: 'C000001', start: new Date(0), source: 'web', couponCode: 'CP-AAA111', couponDiscount: 500 });
  const row = sheets[cfg.SHEET_NAME].data[1];
  assert.strictEqual(row.length, 28);
  assert.deepStrictEqual([row[8], row[26], row[27]], ['6500', 'CP-AAA111', '500']);
});

test('couponCheck: 割引後の合計を返す。予約は作らない', () => {
  const { g, sheets, cfg } = gasWithSheets();
  const r = call(g, 'couponCheck', { code: 'cp-aaa111', email: 'a@example.com', menuId: 'aroma60', optionIds: ['head'] });
  assert.deepStrictEqual(r, { ok: true, name: '500円OFF', discount: 500, total: 8500 - 500 });
  assert.strictEqual(sheets[cfg.SHEET_NAME].data.length, 1);                       // 見出しのみ(予約は増えない)
  assert.deepStrictEqual(call(g, 'couponCheck', { code: 'NOPE', email: 'a@example.com', menuId: 'aroma60', optionIds: [] }), { ok: false, error: 'bad_coupon' });
  assert.deepStrictEqual(call(g, 'couponCheck', { code: 'CP-AAA111', email: 'x', menuId: 'aroma60', optionIds: [] }), { ok: false, error: 'bad_email' });
  assert.deepStrictEqual(call(g, 'couponCheck', { code: 'CP-AAA111', email: 'a@example.com', menuId: 'nothing', optionIds: [] }), { ok: false, error: 'bad_menu' });
  assert.deepStrictEqual(call(g, 'couponCheck', { code: 'CP-AAA111', email: 'a@example.com', menuId: 'omk', optionIds: [], minutes: 60 }), { ok: false, error: 'coupon_not_applicable' });
});

test('couponCheck: メール別10回を超えると locked', () => {
  const { g } = gasWithSheets();
  const one = () => call(g, 'couponCheck', { code: 'NOPE', email: 'spam@example.com', menuId: 'aroma60', optionIds: [] });
  for (let i = 0; i < 10; i++) assert.strictEqual(one().error, 'bad_coupon');
  assert.deepStrictEqual(one(), { ok: false, error: 'locked' });
  assert.strictEqual(call(g, 'couponCheck', { code: 'NOPE', email: 'other@example.com', menuId: 'aroma60', optionIds: [] }).error, 'bad_coupon');
});

test('coupons_(email): 使用可能なものだけ。そのメールが使用済みのコードは出さず、割引の表示文を付ける', () => {
  const { g } = gasWithSheets([resRow({ id: 'K1', email: 'me@example.com', code: 'CP-AAA111', discount: '500' })]);
  const mine = j(g.coupons_('me@example.com'));
  assert.deepStrictEqual(mine.map(c => c.code).sort(), ['CP-NOSET', 'CP-ONLYME', 'CP-PCT10']);
  assert.strictEqual(mine.find(c => c.code === 'CP-PCT10').discount, '10%OFF');
  assert.strictEqual(mine.find(c => c.code === 'CP-NOSET').discount, '');
  const other = j(g.coupons_('other@example.com'));
  assert.deepStrictEqual(other.map(c => c.code).sort(), ['CP-AAA111', 'CP-NOSET', 'CP-PCT10']);   // 他人の個別クーポンは出ない
});

test('adminCoupons: 利用数(非キャンセル)・状態・割引表示を返す', () => {
  const rows = [resRow({ id: 'K1', email: 'a@example.com', code: 'CP-AAA111' }), resRow({ id: 'K2', email: 'b@example.com', code: 'CP-AAA111' }),
    resRow({ id: 'K3', email: 'c@example.com', code: 'CP-AAA111', status: 'キャンセル' })];
  const { g } = gasWithSheets(rows);
  const r = call(g, 'adminCoupons');
  assert.strictEqual(r.ok, true);
  const by = c => r.coupons.find(x => x.code === c);
  assert.strictEqual(by('CP-AAA111').used, 2);
  assert.strictEqual(by('CP-AAA111').state, 'active');
  assert.strictEqual(by('CP-AAA111').discountText, '500円OFF');
  assert.strictEqual(by('CP-OLD').state, 'expired');
  assert.strictEqual(by('CP-NOSET').state, 'unset');
  assert.strictEqual(by('CP-PCT10').used, 0);
});

test('adminCouponSave(新規): コード空なら自動生成して末尾の次の行に書く。重複・不正は書かない', () => {
  const { g, sheets, cfg } = gasWithSheets();
  const item = { code: '', name: '新クーポン', desc: '説明', target: '', from: '', to: '2026-12-31', status: '有効', type: '割合', value: '15' };
  const r = call(g, 'adminCouponSave', { create: true, item });
  assert.strictEqual(r.ok, true);
  assert.match(r.code, /^CP-[A-Z2-9]{6}$/);
  const d = sheets[cfg.COUPON_SHEET].data;
  assert.strictEqual(d.length, 7);
  assert.deepStrictEqual(d[6], [r.code, '新クーポン', '説明', '', '', '2026-12-31', '有効', '割合', '15']);
  const before = JSON.stringify(d);
  assert.deepStrictEqual(call(g, 'adminCouponSave', { create: true, item: Object.assign({}, item, { code: 'cp-aaa111' }) }), { ok: false, error: 'duplicate_code', field: 'code' });
  assert.deepStrictEqual(call(g, 'adminCouponSave', { create: true, item: Object.assign({}, item, { type: '金額', value: 0 }) }), { ok: false, error: 'bad_field', field: 'value' });
  assert.strictEqual(JSON.stringify(sheets[cfg.COUPON_SHEET].data), before);
});

test('adminCouponSave(更新): そのコードの行だけ書き換え、コードは変えない。無ければ not_found', () => {
  const { g, sheets, cfg } = gasWithSheets();
  const before = JSON.stringify(sheets[cfg.COUPON_SHEET].data);
  const r = call(g, 'adminCouponSave', { create: false, item: { code: 'cp-pct10', name: '10%OFF 改', desc: '新', target: 'X@Example.com', from: '', to: '', status: '無効', type: '割合', value: 20 } });
  assert.deepStrictEqual(r, { ok: true, code: 'CP-PCT10' });
  const d = sheets[cfg.COUPON_SHEET].data;
  assert.deepStrictEqual(d[2], ['CP-PCT10', '10%OFF 改', '新', 'x@example.com', '', '', '無効', '割合', '20']);
  assert.deepStrictEqual(d[1], JSON.parse(before)[1]);                                // 他の行は変わらない
  assert.strictEqual(d.length, 6);
  assert.deepStrictEqual(call(g, 'adminCouponSave', { create: false, item: { code: 'NOPE-1', name: 'x', desc: '', target: '', from: '', to: '', status: '有効', type: '', value: '' } }), { ok: false, error: 'not_found' });
});

test('クーポンのAPIは、管理系はトークン無しで auth 拒否。couponCheck は認証不要', () => {
  const { g } = gasWithSheets();
  for (const action of ['adminCoupons', 'adminCouponSave']) {
    assert.deepStrictEqual(j(g.handleAction_({ action, create: true, item: {} })), { ok: false, error: 'auth' });
  }
  const r = j(g.handleAction_({ action: 'couponCheck', code: 'CP-AAA111', email: 'a@example.com', menuId: 'aroma60', optionIds: [] }));
  assert.strictEqual(r.ok, true);
});
