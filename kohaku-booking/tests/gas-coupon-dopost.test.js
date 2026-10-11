// doPost(予約確定)の金額経路: クーポン再判定 → 割引後の合計・クーポン列の保存。無効なら予定も行も作らない
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

const COUPON_ROWS = [
  ['CP-AAA111', '500円OFF', '', '', '', '2099-12-31', '有効', '金額', '500'],
  ['CP-OLD', '期限切れ', '', '', '', '2026-01-01', '有効', '金額', '100']
];
const MENU_ROWS = [['aroma60', 'Relax', '60', '7000', '', 'aroma', 'aroma', '', 'ON', '1']];

const pad = n => String(n).padStart(2, '0');
// JST の各パターンだけを返す最小の formatDate
function formatDate(d, tz, pat) {
  const t = new Date(d.getTime() + 9 * 3600000);
  const Y = t.getUTCFullYear(), M = pad(t.getUTCMonth() + 1), D = pad(t.getUTCDate()), h = pad(t.getUTCHours()), m = pad(t.getUTCMinutes()), s = pad(t.getUTCSeconds());
  if (pat === 'HH:mm') return h + ':' + m;
  if (pat === 'yyyy-MM-dd') return Y + '-' + M + '-' + D;
  if (pat === 'yyMMdd') return String(Y).slice(2) + M + D;
  if (pat === 'yyyy-MM-dd HH:mm:ss') return Y + '-' + M + '-' + D + ' ' + h + ':' + m + ':' + s;
  if (pat.indexOf('XXX') >= 0) return Y + '-' + M + '-' + D + 'T' + h + ':' + m + ':' + s + '+09:00';
  return Y + '-' + M + '-' + D + ' ' + h + ':' + m;
}

function setup() {
  const g = loadGas();
  const cfg = g.CONFIG;
  const sheets = {
    [cfg.SHEET_NAME]: fakeSheet(g.HEADERS, []),
    [cfg.COUPON_SHEET]: fakeSheet(g.COUPON_HEADERS, COUPON_ROWS),
    [cfg.MENU_SHEET]: fakeSheet(g.MENU_HEADERS, MENU_ROWS),
    [cfg.OPTION_SHEET]: fakeSheet(g.OPTION_HEADERS, [['head', '頭ほぐし', '10', '1500', 'ON', '1']])
  };
  const rec = { locks: [], created: [], mails: [] };
  g.LockService = { getScriptLock: () => ({ waitLock() { rec.locks.push('wait'); }, releaseLock() { rec.locks.push('release'); } }) };
  g.CalendarApp = {
    getDefaultCalendar: () => ({
      getEvents: () => [],
      createEvent: (...a) => { rec.created.push(a); return { getId: () => 'EV1' }; }
    }),
    getCalendarById: () => g.CalendarApp.getDefaultCalendar()
  };
  g.MailApp = { sendEmail: (...a) => rec.mails.push(a) };
  g.Utilities = { formatDate };
  g.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] }) };
  const store = {};
  g.CacheService = { getScriptCache: () => ({ get: k => (k in store ? store[k] : null), put: (k, v) => { store[k] = v; }, remove: k => { delete store[k]; } }) };
  g.ContentService = {
    MimeType: { JSON: 'json' },
    createTextOutput: s => ({ getContent: () => s, setMimeType() { return this; } })
  };
  // 顧客シート・通知は本筋ではないので置き換える(クーポン判定・料金再計算・予約行の書き込みは本物が動く)
  g.upsertCustomer_ = () => 'C000001';
  g.notify_ = () => {};
  return { g, sheets, cfg, rec };
}

// 2099年の、定休日ではない日を選ぶ
function openDate(g) {
  for (let day = 5; day < 12; day++) {
    const ds = '2099-01-' + pad(day);
    if (g.CONFIG.CLOSED_WEEKDAYS.indexOf(new Date(ds + 'T00:00:00Z').getUTCDay()) < 0) return ds;
  }
  throw new Error('no open day');
}
const payload = (date, extra) => Object.assign({
  menuId: 'aroma60', optionIds: [], date, time: '10:00',
  name: 'テスト 太郎', kana: 'てすと たろう', tel: '09012345678', email: 'a@example.com', visit: '初めて', note: ''
}, extra);
const post = (g, p) => JSON.parse(g.doPost({ postData: { contents: JSON.stringify(p) } }).getContent());

test('doPost: 有効なクーポンなら割引後の合計とクーポン列を保存し、予定を1件作る', () => {
  const { g, sheets, cfg, rec } = setup();
  const res = post(g, payload(openDate(g), { couponCode: 'cp-aaa111' }));
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  const sh = sheets[cfg.SHEET_NAME];
  assert.strictEqual(sh.data.length, 2, '予約行が1件');
  const row = sh.data[1], H = g.HEADERS;
  assert.strictEqual(row[H.indexOf('合計金額')], '6500');
  assert.strictEqual(row[H.indexOf('クーポン')], 'CP-AAA111');
  assert.strictEqual(row[H.indexOf('割引額')], '500');
  assert.strictEqual(rec.created.length, 1);
  assert.match(rec.created[0][3].description, /クーポン CP-AAA111 −500円/);
  assert.deepStrictEqual(rec.locks, ['wait', 'release'], 'ロック内で処理して解放');
});

test('doPost: 無効なクーポンは bad_coupon。予定も予約行も作らない', () => {
  const { g, sheets, cfg, rec } = setup();
  const d = openDate(g);
  for (const code of ['NOPE-123', 'CP-OLD']) {
    assert.deepStrictEqual(j(post(g, payload(d, { couponCode: code }))), { ok: false, error: 'bad_coupon' }, code);
  }
  assert.strictEqual(rec.created.length, 0, 'createEvent が呼ばれない');
  assert.strictEqual(sheets[cfg.SHEET_NAME].data.length, 1, '予約行が増えない');
  assert.deepStrictEqual(rec.locks, ['wait', 'release', 'wait', 'release']);
});

test('doPost: 同じメールで使用済みのコードは確定時に coupon_used(ロック内の再判定)', () => {
  const { g, sheets, cfg, rec } = setup();
  const d = openDate(g);
  assert.strictEqual(post(g, payload(d, { couponCode: 'CP-AAA111' })).ok, true);
  const again = post(g, payload(d, { couponCode: 'CP-AAA111', time: '14:00' }));
  assert.deepStrictEqual(j(again), { ok: false, error: 'coupon_used' });
  assert.strictEqual(rec.created.length, 1);
  assert.strictEqual(sheets[cfg.SHEET_NAME].data.length, 2);
});

test('doPost: couponCode が無ければ合計はそのまま、クーポン列は空', () => {
  const { g, sheets, cfg, rec } = setup();
  const res = post(g, payload(openDate(g)));
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  const row = sheets[cfg.SHEET_NAME].data[1], H = g.HEADERS;
  assert.strictEqual(row[H.indexOf('合計金額')], '7000');
  assert.strictEqual(row[H.indexOf('クーポン')], '');
  assert.strictEqual(row[H.indexOf('割引額')], '');
  assert.strictEqual(rec.created.length, 1);
});
