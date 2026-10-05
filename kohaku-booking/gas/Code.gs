/**
 * 琥珀 予約API (Google Apps Script)
 *
 * 使い方:
 *  1. 予約管理用のスプレッドシートを作成 → 拡張機能 → Apps Script に、このファイルを貼り付け
 *  2. 下の CONFIG を編集(特に OWNER_EMAIL / CLOSED_WEEKDAYS)
 *  3. 関数 setup を一度実行(権限を承認 → 「予約」シートが作成されます)
 *  4. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *     実行ユーザー: 自分 / アクセスできるユーザー: 全員
 *  5. 発行された URL を index.html の CONFIG.GAS_URL に貼り付け
 *
 * ※ コードを変更したら「デプロイを管理」から新バージョンで更新してください。
 * ※ 管理画面(admin.html)を使うには、プロジェクトの設定 → スクリプト プロパティ に
 *    ADMIN_PASSWORD(管理画面のパスワード)を追加してください。
 */
const CONFIG = {
  CALENDAR_ID: '',            // 空 = このアカウントの既定カレンダー。専用カレンダー推奨(ID を入れる)
  SHEET_NAME: '予約',
  OWNER_EMAIL: '',            // 新規予約の通知先(空なら通知しない)
  SALON_NAME: '琥珀',
  CAPACITY: 1,                // 同時に受けられる予約数(index.html の CAPACITY と合わせる)
  BUFFER_MIN: 15,             // 前後の準備・片付け時間(index.html の BUFFER_MIN と合わせる)
  CLOSED_WEEKDAYS: [3],       // 定休曜日 0=日 … 6=土
  OPEN: '10:00',
  CLOSE: '20:00',
  MIN_ADVANCE_HOURS: 3,
  BLOCK_ALL_DAY_EVENTS: true, // 終日予定がある日は予約不可にする(臨時休業の登録に使えます)
  CANCEL_DEADLINE_HOURS: 24,  // マイページからキャンセルできるのは、来店の何時間前までか(仮)
  CUSTOMER_SHEET: '顧客',
  COUPON_SHEET: 'クーポン',
  MENU_SHEET: 'メニュー',
  OPTION_SHEET: 'オプション',
  SITE_URL: '',               // 予約サイト(index.html)の公開URL。メール内のリンクに使用
  REMIND_2D_HOUR: 18,         // 2日前リマインドの送信時刻(時)
  REMIND_0D_HOUR: 8           // 当日リマインドの送信時刻(時)
  // LINE関連の秘密情報は「スクリプト プロパティ」に保存: LINE_CHANNEL_ACCESS_TOKEN / LINE_LOGIN_CHANNEL_ID / LIFF_ID
};

/* =========================================================
 * データモデル(LINE連携・将来の拡張を見据えた項目)
 *
 * 【予約】シート … 1行 = 1予約。列の並びは変えず、追加は必ず末尾へ。
 *   予約ID          K + yyMMdd + 4桁。LINE通知・問い合わせの照合キー
 *   顧客ID          【顧客】シートの顧客IDと紐づく(C000001 形式)
 *   予約ステータス  STATUS の値(確定 / 来店済 / キャンセル)
 *   予約日時(ISO)  開始日時 例 2026-10-10T11:00:00+09:00(リマインド配信の判定に使用)
 *   流入経路        web(予約サイト) / admin(管理画面) / 将来 line など
 *   2日前リマインド送信日時 / 当日リマインド送信日時  送ったら記録(二重送信防止。日時変更時は空に戻す)
 *
 * 【顧客】シート … 1行 = 1顧客(メールアドレスで名寄せ)
 *   顧客ID / メール / お名前 / フリガナ / 電話
 *   LINE userId     LINE連携後に保存(Uから始まる33文字)。未連携なら空
 *   LINE連携日時 / LINE通知(許可/停止) / 登録日時 / 更新日時 / メモ
 * ========================================================= */
const HEADERS = ['予約ID','受付日時','予約ステータス','日付','開始','終了','メニュー','オプション','合計金額','所要分',
                 'お名前','フリガナ','電話','メール','初回/再来','ご要望','カレンダーEventID','メニューID',
                 '顧客ID','予約日時(ISO)','流入経路','2日前リマインド送信日時','更新日時','当日リマインド送信日時'];

const STATUS = { CONFIRMED: '確定', VISITED: '来店済', CANCELLED: 'キャンセル' };   // 追加する場合はここに足す

const CUSTOMER_HEADERS = ['顧客ID','メール','お名前','フリガナ','電話','LINE userId','LINE連携日時','LINE通知','登録日時','更新日時','メモ'];
const C = { ID:0, EMAIL:1, NAME:2, KANA:3, TEL:4, LINE_ID:5, LINE_AT:6, LINE_NOTIFY:7, CREATED:8, UPDATED:9, MEMO:10 };

/* ---------- 初期セットアップ ---------- */
function setup() {
  getSheet_();
  getCustomerSheet_();
  getCouponSheet_();
  getMenuSheet_();
  getOptionSheet_();
  getCalendar_();
  migrate_();
  Logger.log('OK: シートとカレンダーへのアクセスを確認しました');
}

/* ---------- 空き状況(GET) ---------- */
function doGet(e) {
  try {
    const p = e.parameter || {};
    if (p.action === 'availability') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.from) || !/^\d{4}-\d{2}-\d{2}$/.test(p.to)) return json_({ ok: false, error: 'bad_range' });
      return json_({ ok: true, busy: getBusy_(p.from, p.to) });
    }
    if (p.action === 'menu') {
      try { return json_(menuApi_(p.fresh === '1')); } catch (err) { console.error('menu failed: ' + err); return json_({ ok: false, error: 'menu_unavailable' }); }
    }
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function getBusy_(from, to) {
  const s = new Date(from + 'T00:00:00+09:00');
  const e = new Date(to + 'T23:59:59+09:00');
  // 予定のタイトル等は返さず、時間帯のみ返す(個人情報を公開しない)
  return getCalendar_().getEvents(s, e)
    .filter(ev => CONFIG.BLOCK_ALL_DAY_EVENTS || !ev.isAllDayEvent())
    .map(ev => ({ start: ev.getStartTime().toISOString(), end: ev.getEndTime().toISOString() }));
}

/* ---------- 予約登録(POST) ---------- */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const d = JSON.parse(e.postData.contents);
    if (d.action) return json_(handleAction_(d));                    // マイページ系の操作
    if (d.website) return json_({ ok: false, error: 'rejected' });   // ハニーポット

    const sheetMenu = loadMenu_();   // キャッシュを使わず、シートを直接読む
    const calc = calcBooking_(sheetMenu.menu, sheetMenu.options, d);
    if (!calc.ok) return json_({ ok: false, error: calc.error });
    d.menuName = calc.menuName; d.minutes = calc.minutes; d.total = calc.total; d.options = calc.optionNames;

    const err = validate_(d);
    if (err) return json_({ ok: false, error: err });

    const start = new Date(d.date + 'T' + d.time + ':00+09:00');
    const end = new Date(start.getTime() + d.minutes * 60000);
    const cal = getCalendar_();

    // 二重予約チェック(前後バッファを含む)
    const buf = CONFIG.BUFFER_MIN * 60000;
    const clash = cal.getEvents(new Date(start.getTime() - buf), new Date(end.getTime() + buf))
      .filter(ev => CONFIG.BLOCK_ALL_DAY_EVENTS || !ev.isAllDayEvent());
    if (clash.length >= CONFIG.CAPACITY) return json_({ ok: false, error: 'conflict' });

    const id = 'K' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyMMdd') + String(Math.floor(1000 + Math.random() * 9000));
    const opts = (d.options || []).join('、') || 'なし';
    const desc = [
      '予約ID: ' + id,
      'メニュー: ' + d.menuName,
      'オプション: ' + opts,
      '合計: ' + (d.total == null ? '当日ご案内' : d.total + '円'),
      'お名前: ' + d.name + '(' + d.kana + ')',
      '電話: ' + d.tel,
      'メール: ' + d.email,
      '区分: ' + d.visit,
      'ご要望: ' + (d.note || 'なし')
    ].join('\n');
    const ev = cal.createEvent('【予約】' + d.name + ' 様 / ' + d.menuName, start, end, { description: desc });

    const customerId = upsertCustomer_(d.email, d.name, d.kana, d.tel);
    appendReservation_({
      id: id, status: STATUS.CONFIRMED, date: d.date, time: d.time, end: Utilities.formatDate(end, 'Asia/Tokyo', 'HH:mm'),
      menuName: d.menuName, options: opts, total: d.total == null ? '当日ご案内' : d.total, minutes: d.minutes,
      name: d.name, kana: d.kana, tel: d.tel, email: d.email, visit: d.visit, note: d.note || '',
      eventId: ev.getId(), menuId: d.menuId || '', customerId: customerId, start: start, source: 'web'
    });
    notify_(d, id, start, end, opts);
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

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
  const s = String(v === undefined || v === null ? '' : v)
    .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/[,，\s¥￥円]/g, '');
  if (s === '') return null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;   // 1e3 や 0x10 は不可
}

/** メニューシートの値(2次元配列・見出し行を除く)→ メニュー配列。不正な行は除外してログに残す */
function parseMenuRows_(values) {
  const out = [];
  (values || []).forEach(function (v, i) {
    const id = String(v[0] || '').trim(), kind = String(v[7] || '').trim().toLowerCase();
    const min = numOrNull_(v[2]), price = numOrNull_(v[3]), order = numOrNull_(v[9]);
    const minOk = kind === 'omakase' ? (min === null || !isNaN(min)) : (min !== null && !isNaN(min) && min > 0);
    if (!id || !String(v[1] || '').trim() || !minOk || (price !== null && isNaN(price))) {
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
  if (d.optionIds === undefined && d.options !== undefined) return { ok: false, error: 'bad_menu' };   // 古い画面(optionIds無し)からの予約は拒否
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
function menuApi_(fresh) {
  const cache = CacheService.getScriptCache();
  const hit = fresh ? null : cache.get('menu:v1');   // fresh=1 はキャッシュを使わず再取得して上書き
  if (hit) return JSON.parse(hit);
  const m = loadMenu_(), res = Object.assign({ ok: true }, publicMenu_(m.menu, m.options));
  try { cache.put('menu:v1', JSON.stringify(res), 300); } catch (err) { /* サイズ超過などは無視 */ }
  return res;
}

/* ---------- 検証 ---------- */
function validate_(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) return 'bad_date';
  if (!/^\d{2}:\d{2}$/.test(d.time || '')) return 'bad_time';
  if (!(d.minutes >= 10 && d.minutes <= 300)) return 'bad_minutes';
  if (!d.menuName || !d.name || !d.kana) return 'missing_field';
  if (!/^0\d{9,10}$/.test(String(d.tel || '').replace(/[-\s\u3000]/g, ''))) return 'bad_tel';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email || '')) return 'bad_email';

  const start = new Date(d.date + 'T' + d.time + ':00+09:00');
  const end = new Date(start.getTime() + d.minutes * 60000);
  if (start.getTime() < Date.now() + CONFIG.MIN_ADVANCE_HOURS * 3600000) return 'too_soon';
  const wd = new Date(d.date + 'T00:00:00Z').getUTCDay();
  if (CONFIG.CLOSED_WEEKDAYS.indexOf(wd) >= 0) return 'closed_day';
  const endHHmm = Utilities.formatDate(end, 'Asia/Tokyo', 'HH:mm');
  if (d.time < CONFIG.OPEN || endHHmm > CONFIG.CLOSE || endHHmm < d.time) return 'out_of_hours';
  return '';
}

/* ---------- 通知(予約確認) ---------- */
function notify_(d, id, start, end, opts) {
  const endHHmm = Utilities.formatDate(end, 'Asia/Tokyo', 'HH:mm');
  notifyCustomer_(d.email, 'confirm', {
    id: id, date: d.date, time: d.time, end: endHHmm, menuName: d.menuName, options: opts, total: d.total,
    name: d.name, minutes: d.minutes, startMs: start.getTime()
  });
  const when = Utilities.formatDate(start, 'Asia/Tokyo', 'yyyy年M月d日 HH:mm') + '〜' + endHHmm;
  notifyOwner_('【新規予約】' + d.name + ' 様 ' + when,
    '予約番号: ' + id + '\n日時: ' + when + '\nメニュー: ' + d.menuName + '\nオプション: ' + opts +
    '\nお名前: ' + d.name + '(' + d.kana + ')\n電話: ' + d.tel + '\nメール: ' + d.email +
    '\n区分: ' + d.visit + '\nご要望: ' + (d.note || 'なし'));
}
function notifyOwner_(subject, body) {
  try { if (CONFIG.OWNER_EMAIL) MailApp.sendEmail(CONFIG.OWNER_EMAIL, subject, body); }
  catch (err) { console.error('owner mail failed: ' + err); }
}

/* ---------- ヘルパー ---------- */
function getCalendar_() {
  const cal = CONFIG.CALENDAR_ID ? CalendarApp.getCalendarById(CONFIG.CALENDAR_ID) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('calendar_not_found');
  return cal;
}
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#EADBC3');
    sh.setFrozenRows(1);
  }
  return sh;
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}


/* =========================================================
 * My Kohaku(マイページ)
 *  ログイン: ご予約時のメールアドレスに6桁の確認コードを送り、本人確認します。
 *  ※ MailApp の送信上限(無料アカウントは1日100通程度)に注意してください。
 * ========================================================= */
function handleAction_(d) {
  switch (d.action) {
    case 'sendCode':      return sendCode_(d);
    case 'verifyCode':    return verifyCode_(d);
    case 'logout':        CacheService.getScriptCache().remove('tok:' + (d.token || '')); return { ok: true };
    case 'me':            { const em = auth_(d); return em ? me_(em) : { ok: false, error: 'auth' }; }
    case 'cancel':        { const em = auth_(d); return em ? cancel_(em, d) : { ok: false, error: 'auth' }; }
    case 'updateProfile': { const em = auth_(d); return em ? updateProfile_(em, d) : { ok: false, error: 'auth' }; }
    case 'reschedule':    { const em = auth_(d); return em ? reschedule_(em, d) : { ok: false, error: 'auth' }; }
    case 'lineLinkCode':  { const em = auth_(d); return em ? lineLinkCode_(em) : { ok: false, error: 'auth' }; }
    case 'lineUnlink':    { const em = auth_(d); return em ? lineUnlink_(em) : { ok: false, error: 'auth' }; }
    case 'lineLink':      return lineLink_(d);
    case 'lineLogin':     return lineLogin_(d);
    case 'adminLogin':     return adminLogin_(d);
    case 'adminList':      return adminAuth_(d) ? adminList_(d) : { ok: false, error: 'auth' };
    case 'adminSetStatus': return adminAuth_(d) ? adminSetStatus_(d) : { ok: false, error: 'auth' };
    case 'adminCreate':    return adminAuth_(d) ? adminCreate_(d) : { ok: false, error: 'auth' };
  }
  return { ok: false, error: 'unknown_action' };
}

function normEmail_(v) { return String(v || '').trim().toLowerCase(); }

function sendCode_(d) {
  const email = normEmail_(d.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'bad_email' };
  const cache = CacheService.getScriptCache();
  // 予約実績のあるアドレスにだけ送信(登録有無は応答から分からないようにする)
  if (!cache.get('rl:' + email) && readReservations_(email).length > 0) {
    const code = String(100000 + (parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 900000));
    cache.put('code:' + email, code, 600);
    cache.put('try:' + email, '0', 600);
    cache.put('rl:' + email, '1', 60);
    try {
      MailApp.sendEmail({
        to: email, name: CONFIG.SALON_NAME,
        subject: '【' + CONFIG.SALON_NAME + '】My Kohaku 確認コード',
        body: '確認コード: ' + code + '\n\n10分以内に入力してください。\nこのメールに心当たりがない場合は、破棄してください。\n\n' + CONFIG.SALON_NAME
      });
    } catch (err) { console.error('code mail failed: ' + err); }
  }
  return { ok: true };
}

function verifyCode_(d) {
  const email = normEmail_(d.email), cache = CacheService.getScriptCache();
  const tries = Number(cache.get('try:' + email) || 0);
  if (tries >= 5) return { ok: false, error: 'locked' };
  const code = cache.get('code:' + email);
  if (!code || String(d.code || '').trim() !== code) {
    cache.put('try:' + email, String(tries + 1), 600);
    return { ok: false, error: 'bad_code' };
  }
  cache.remove('code:' + email);
  const token = Utilities.getUuid();
  cache.put('tok:' + token, email, 21600);   // 6時間
  return { ok: true, token: token };
}

function auth_(d) {
  return d.token ? CacheService.getScriptCache().get('tok:' + d.token) : null;
}

/* ----- 予約の読み出し ----- */
function dstr_(v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd') : String(v || ''); }
function tstr_(v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Tokyo', 'HH:mm') : String(v || ''); }

function readReservations_(email) {
  const sh = getSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const out = [];
  vals.forEach(function (v, i) {
    if (normEmail_(v[13]) !== email) return;
    const date = dstr_(v[3]), time = tstr_(v[4]);
    out.push({
      row: i + 2, id: String(v[0]), status: String(v[2]), date: date, time: time, end: tstr_(v[5]),
      menuName: String(v[6]), options: String(v[7]), total: v[8], minutes: Number(v[9]),
      name: String(v[10]), kana: String(v[11]), tel: String(v[12]), eventId: String(v[16] || ''), menuId: String(v[17] || ''), customerId: String(v[18] || ''),
      startMs: new Date(date + 'T' + time + ':00+09:00').getTime(),
      endMs: new Date(date + 'T' + tstr_(v[5]) + ':00+09:00').getTime()
    });
  });
  return out;
}

function toClient_(r, now) {
  return {
    id: r.id, status: r.status, date: r.date, time: r.time, end: r.end, menuId: r.menuId, menuName: r.menuName,
    options: r.options, total: (r.total === '' || isNaN(Number(r.total))) ? null : Number(r.total), minutes: r.minutes,
    canCancel: r.status === '確定' && (r.startMs - now) >= CONFIG.CANCEL_DEADLINE_HOURS * 3600000
  };
}

function me_(email) {
  const now = Date.now();
  const rows = readReservations_(email);
  const upcoming = rows.filter(function (r) { return r.status === '確定' && r.endMs >= now; })
                       .sort(function (a, b) { return a.startMs - b.startMs; });
  const history = rows.filter(function (r) { return !(r.status === '確定' && r.endMs >= now); })
                      .sort(function (a, b) { return b.startMs - a.startMs; });
  const latest = rows.slice().sort(function (a, b) { return b.startMs - a.startMs; })[0];
  const cust = findCustomer_(email);
  const profile = cust ? { customerId: cust.id, name: cust.name, kana: cust.kana, tel: cust.tel, email: email, lineLinked: !!cust.lineUserId }
                       : { customerId: '', name: latest ? latest.name : '', kana: latest ? latest.kana : '', tel: latest ? latest.tel : '', email: email, lineLinked: false };
  return {
    ok: true, profile: profile,
    upcoming: upcoming.map(function (r) { return toClient_(r, now); }),
    history: history.map(function (r) { return toClient_(r, now); }),
    coupons: coupons_(email),
    cancelDeadlineHours: CONFIG.CANCEL_DEADLINE_HOURS
  };
}

/* ----- キャンセル ----- */
function cancel_(email, d) {
  const now = Date.now();
  const r = readReservations_(email).filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'not_found' };
  if (r.status !== '確定') return { ok: false, error: 'not_active' };
  if (r.startMs - now < CONFIG.CANCEL_DEADLINE_HOURS * 3600000) return { ok: false, error: 'too_late' };
  try { const ev = getCalendar_().getEventById(r.eventId); if (ev) ev.deleteEvent(); } catch (err) { console.error('event delete failed: ' + err); }
  setStatusCell_(r.row, STATUS.CANCELLED);
  notifyCustomer_(email, 'cancelled', r);
  try {
    if (CONFIG.OWNER_EMAIL) MailApp.sendEmail(CONFIG.OWNER_EMAIL, '【キャンセル】' + r.name + ' 様 ' + r.date + ' ' + r.time,
      '予約番号: ' + r.id + '\nメニュー: ' + r.menuName + '\nお客様がマイページからキャンセルしました。');
  } catch (err) {}
  return { ok: true };
}

/* ----- 顧客 ----- */
function getCustomerSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CONFIG.CUSTOMER_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.CUSTOMER_SHEET);
    sh.getRange(1, 1, 1, CUSTOMER_HEADERS.length).setValues([CUSTOMER_HEADERS]).setFontWeight('bold').setBackground('#EADBC3');
    sh.setFrozenRows(1);
  }
  return sh;
}
function nowStr_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'); }

function customerFromRow_(v, i) {
  return { row: i + 2, id: String(v[C.ID]), email: normEmail_(v[C.EMAIL]), name: String(v[C.NAME]), kana: String(v[C.KANA]), tel: String(v[C.TEL]),
           lineUserId: String(v[C.LINE_ID] || ''), lineLinkedAt: String(v[C.LINE_AT] || ''), lineNotify: String(v[C.LINE_NOTIFY] || '') };
}
function allCustomers_() {
  const sh = getCustomerSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, CUSTOMER_HEADERS.length).getValues().map(customerFromRow_);
}
function findCustomer_(email) {
  email = normEmail_(email);
  return allCustomers_().filter(function (c) { return c.email === email; })[0] || null;
}
function nextCustomerId_() {
  let max = 0;
  allCustomers_().forEach(function (c) { const m = /^C(\d+)$/.exec(c.id); if (m) max = Math.max(max, Number(m[1])); });
  return 'C' + String(max + 1).padStart(6, '0');
}
/** メールアドレスで名寄せして顧客を登録/更新し、顧客IDを返す(LINE userId などの既存値は保持) */
function upsertCustomer_(email, name, kana, tel) {
  email = normEmail_(email);
  if (!email) return '';
  const sh = getCustomerSheet_(), c = findCustomer_(email);
  if (c) {
    sh.getRange(c.row, C.NAME + 1, 1, 3).setNumberFormat('@').setValues([[String(name), String(kana), String(tel)]]);
    sh.getRange(c.row, C.UPDATED + 1).setNumberFormat('@').setValue(nowStr_());
    return c.id;
  }
  const id = nextCustomerId_();
  const row = [id, email, name, kana, tel, '', '', '許可', nowStr_(), nowStr_(), ''];
  sh.getRange(sh.getLastRow() + 1, 1, 1, CUSTOMER_HEADERS.length).setNumberFormat('@').setValues([row.map(String)]);
  return id;
}

/* ----- LINE連携の土台(まだ画面からは呼びません) -----
 * 将来、LIFF / LINEログイン / Messaging API の Webhook で取得した userId を、顧客に紐づけるときに使います。
 *   linkLineUser_('C000001', 'Uxxxxxxxx...')  → 顧客IDに LINE userId を保存
 *   findCustomerByLineUserId_('Uxxxx...')     → Webhook受信時に顧客を特定
 * 通知対象は customersForLineNotify_() で取得できます。
 */
function linkLineUser_(customerId, lineUserId) {
  if (!/^U[0-9a-f]{32}$/.test(String(lineUserId || ''))) return { ok: false, error: 'bad_line_user_id' };
  const dup = findCustomerByLineUserId_(lineUserId);
  if (dup && dup.id !== customerId) return { ok: false, error: 'line_already_linked' };
  const c = allCustomers_().filter(function (x) { return x.id === customerId; })[0];
  if (!c) return { ok: false, error: 'not_found' };
  const sh = getCustomerSheet_();
  sh.getRange(c.row, C.LINE_ID + 1, 1, 3).setNumberFormat('@').setValues([[lineUserId, nowStr_(), c.lineNotify || '許可']]);
  sh.getRange(c.row, C.UPDATED + 1).setNumberFormat('@').setValue(nowStr_());
  return { ok: true };
}
function findCustomerByLineUserId_(lineUserId) {
  return allCustomers_().filter(function (c) { return c.lineUserId && c.lineUserId === lineUserId; })[0] || null;
}
function customersForLineNotify_() {
  return allCustomers_().filter(function (c) { return c.lineUserId && c.lineNotify !== '停止'; });
}

/* ----- 予約シートの書き込み共通処理 ----- */
function appendReservation_(f) {
  const row = [
    f.id, nowStr_(), f.status, f.date, f.time, f.end, f.menuName, f.options, f.total, f.minutes,
    f.name, f.kana, f.tel, f.email, f.visit, f.note, f.eventId, f.menuId,
    f.customerId || '', Utilities.formatDate(f.start, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX"), f.source || '', '', nowStr_(), ''
  ];
  const sh = getSheet_();
  sh.getRange(sh.getLastRow() + 1, 1, 1, HEADERS.length).setNumberFormat('@').setValues([row.map(function (x) { return x == null ? '' : String(x); })]);  // 文字列として保存(数式化・先頭0落ち防止)
}
function setStatusCell_(row, status) {
  const sh = getSheet_();
  sh.getRange(row, 3).setValue(status);
  sh.getRange(row, 23).setNumberFormat('@').setValue(nowStr_());   // 更新日時
}

/* ----- 既存データの移行(setup から自動実行。何度実行しても安全) ----- */
function migrate_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // 1) 予約シートの見出しを最新に
  const sh = getSheet_();
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#EADBC3');
  // 2) 旧レイアウトの顧客シート(A1 = 'メール')を新レイアウトへ
  const cs = getCustomerSheet_();
  if (cs.getLastRow() >= 1 && String(cs.getRange(1, 1).getValue()) === 'メール') {
    const old = cs.getLastRow() >= 2 ? cs.getRange(2, 1, cs.getLastRow() - 1, 5).getValues() : [];
    cs.clear();
    cs.getRange(1, 1, 1, CUSTOMER_HEADERS.length).setValues([CUSTOMER_HEADERS]).setFontWeight('bold').setBackground('#EADBC3');
    cs.setFrozenRows(1);
    const rows = old.map(function (v, i) {
      return ['C' + String(i + 1).padStart(6, '0'), normEmail_(v[0]), v[1], v[2], v[3], '', '', '許可', String(v[4] || nowStr_()), String(v[4] || nowStr_()), ''].map(String);
    });
    if (rows.length) cs.getRange(2, 1, rows.length, CUSTOMER_HEADERS.length).setNumberFormat('@').setValues(rows);
  }
  // 3) 既存の予約に 顧客ID / 予約日時(ISO) / 流入経路 を補完
  const last = sh.getLastRow();
  if (last >= 2) {
    const vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
    vals.forEach(function (v, i) {
      const r = i + 2, date = dstr_(v[3]), time = tstr_(v[4]);
      if (!v[18] && v[13]) {
        const id = upsertCustomer_(v[13], v[10], v[11], v[12]);
        sh.getRange(r, 19).setNumberFormat('@').setValue(id);
      }
      if (!v[19] && date && time) sh.getRange(r, 20).setNumberFormat('@').setValue(date + 'T' + time + ':00+09:00');
      if (!v[20]) sh.getRange(r, 21).setNumberFormat('@').setValue('web');
    });
  }
}
function updateProfile_(email, d) {
  const name = String(d.name || '').trim(), kana = String(d.kana || '').trim(), tel = String(d.tel || '').trim();
  if (!name || !kana) return { ok: false, error: 'missing_field' };
  if (!/^0\d{9,10}$/.test(tel.replace(/[-\s\u3000]/g, ''))) return { ok: false, error: 'bad_tel' };
  const id = upsertCustomer_(email, name, kana, tel);
  const c = findCustomer_(email);
  return { ok: true, profile: { customerId: id, name: name, kana: kana, tel: tel, email: email, lineLinked: !!(c && c.lineUserId) } };
}

/* ----- クーポン ----- */
function getCouponSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CONFIG.COUPON_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.COUPON_SHEET);
    sh.getRange(1, 1, 1, 7).setValues([['コード', '名称', '内容', '対象メール(空=全員)', '開始日', '期限', '状態(有効/無効/使用済)']])
      .setFontWeight('bold').setBackground('#EADBC3');
    sh.getRange(2, 1, 1, 7).setNumberFormat('@').setValues([['SAMPLE500', 'ご来店ありがとうクーポン', 'オプション1つサービス', '', '', '2026-12-31', '無効']]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function coupons_(email) {
  const sh = getCouponSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  return sh.getRange(2, 1, last - 1, 7).getValues().filter(function (v) {
    const target = normEmail_(v[3]), from = dstr_(v[4]), to = dstr_(v[5]);
    return String(v[6]).trim() === '有効' && (!target || target === email) && (!from || from <= today) && (!to || to >= today);
  }).map(function (v) {
    return { code: String(v[0]), name: String(v[1]), desc: String(v[2]), expire: dstr_(v[5]) };
  });
}


/* =========================================================
 * 管理画面(admin.html)
 *  パスワードは コード内ではなく「スクリプト プロパティ ADMIN_PASSWORD」に保存します。
 * ========================================================= */
function adminLogin_(d) {
  const pw = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!pw) return { ok: false, error: 'not_configured' };
  const cache = CacheService.getScriptCache();
  const tries = Number(cache.get('adm_try') || 0);
  if (tries >= 5) return { ok: false, error: 'locked' };
  if (String(d.password || '') !== pw) {
    cache.put('adm_try', String(tries + 1), 600);
    return { ok: false, error: 'bad_password' };
  }
  cache.remove('adm_try');
  const token = Utilities.getUuid();
  cache.put('adm:' + token, '1', 21600);   // 6時間
  return { ok: true, token: token };
}
function adminAuth_(d) {
  return d.token && CacheService.getScriptCache().get('adm:' + d.token) === '1';
}

function parseRow_(v, i) {
  return {
    row: i + 2, id: String(v[0]), status: String(v[2]), date: dstr_(v[3]), time: tstr_(v[4]), end: tstr_(v[5]),
    menuName: String(v[6]), options: String(v[7]),
    total: (v[8] === '' || isNaN(Number(v[8]))) ? null : Number(v[8]), minutes: Number(v[9]),
    name: String(v[10]), kana: String(v[11]), tel: String(v[12]), email: String(v[13]),
    visit: String(v[14]), note: String(v[15]), eventId: String(v[16] || ''), menuId: String(v[17] || ''),
    customerId: String(v[18] || ''), startIso: String(v[19] || ''), source: String(v[20] || ''), remindedAt: String(v[21] || ''), remindedTodayAt: String(v[23] || '')
  };
}
function allRows_() {
  const sh = getSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEADERS.length).getValues().map(parseRow_);
}

function adminList_(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(d.to || '')) return { ok: false, error: 'bad_range' };
  const linked = {};
  allCustomers_().forEach(function (c) { if (c.lineUserId) linked[c.email] = true; });
  const list = allRows_().filter(function (r) { return r.date >= d.from && r.date <= d.to; })
    .sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; })
    .map(function (r) { r.lineLinked = !!linked[normEmail_(r.email)]; delete r.row; delete r.eventId; return r; });
  return { ok: true, reservations: list };
}

function adminSetStatus_(d) {
  const allowed = ['確定', '来店済', 'キャンセル'];
  if (allowed.indexOf(d.status) < 0) return { ok: false, error: 'bad_status' };
  const r = allRows_().filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'not_found' };
  if (r.status === 'キャンセル') return { ok: false, error: 'already_cancelled' };
  if (d.status === 'キャンセル') {
    try { const ev = getCalendar_().getEventById(r.eventId); if (ev) ev.deleteEvent(); } catch (err) { console.error('event delete failed: ' + err); }
  }
  setStatusCell_(r.row, d.status);
  let notified = false;
  if (d.status === 'キャンセル' && d.notify !== false && r.email) {
    try {
      r.startMs = new Date(r.date + 'T' + r.time + ':00+09:00').getTime();
      notified = notifyCustomer_(r.email, 'cancelled', r);
    } catch (err) { console.error('cancel notify failed: ' + err); }
  }
  return { ok: true, notified: notified };
}

function adminCreate_(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '') || !/^\d{2}:\d{2}$/.test(d.time || '')) return { ok: false, error: 'bad_date' };
  if (!(d.minutes >= 10 && d.minutes <= 300)) return { ok: false, error: 'bad_minutes' };
  if (!d.menuName || !d.name) return { ok: false, error: 'missing_field' };
  const tel = String(d.tel || '').trim();
  if (tel && !/^0\d{9,10}$/.test(tel.replace(/[-\s\u3000]/g, ''))) return { ok: false, error: 'bad_tel' };
  const email = normEmail_(d.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'bad_email' };

  const start = new Date(d.date + 'T' + d.time + ':00+09:00');
  const end = new Date(start.getTime() + d.minutes * 60000);
  const cal = getCalendar_(), buf = CONFIG.BUFFER_MIN * 60000;
  if (!d.force) {
    const clash = cal.getEvents(new Date(start.getTime() - buf), new Date(end.getTime() + buf))
      .filter(function (ev) { return CONFIG.BLOCK_ALL_DAY_EVENTS || !ev.isAllDayEvent(); });
    if (clash.length >= CONFIG.CAPACITY) return { ok: false, error: 'conflict' };
  }
  const id = 'K' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyMMdd') + String(Math.floor(1000 + Math.random() * 9000));
  const total = (d.total === null || d.total === '' || d.total === undefined) ? null : Number(d.total);
  const note = ['(管理画面から登録)', String(d.note || '').trim()].filter(String).join('\n');
  const desc = ['予約ID: ' + id, 'メニュー: ' + d.menuName, '合計: ' + (total == null ? '当日ご案内' : total + '円'),
                'お名前: ' + d.name + (d.kana ? '(' + d.kana + ')' : ''), '電話: ' + tel, 'メール: ' + email, 'ご要望: ' + note].join('\n');
  const ev = cal.createEvent('【予約】' + d.name + ' 様 / ' + d.menuName, start, end, { description: desc });
  const customerId = email ? upsertCustomer_(email, d.name, d.kana || '', tel) : '';
  appendReservation_({
    id: id, status: STATUS.CONFIRMED, date: d.date, time: d.time, end: Utilities.formatDate(end, 'Asia/Tokyo', 'HH:mm'),
    menuName: d.menuName, options: 'なし', total: total == null ? '当日ご案内' : total, minutes: d.minutes,
    name: d.name, kana: d.kana || '', tel: tel, email: email, visit: d.visit || '', note: note,
    eventId: ev.getId(), menuId: d.menuId || '', customerId: customerId, start: start, source: 'admin'
  });
  if (email) notifyCustomer_(email, 'confirm', { id: id, date: d.date, time: d.time, end: Utilities.formatDate(end, 'Asia/Tokyo', 'HH:mm'),
    menuName: d.menuName, options: 'なし', total: total, name: d.name, minutes: d.minutes, startMs: start.getTime() });
  return { ok: true, id: id };
}


/* =========================================================
 * 予約の日時変更(マイページ / LINEから)
 *  メニュー・所要時間はそのまま、日時だけ変更できます(メニュー変更はお電話などで)。
 * ========================================================= */
function rulesError_(date, time, minutes) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) return 'bad_date';
  const start = new Date(date + 'T' + time + ':00+09:00'), end = new Date(start.getTime() + minutes * 60000);
  if (isNaN(start.getTime())) return 'bad_date';
  if (start.getTime() < Date.now() + CONFIG.MIN_ADVANCE_HOURS * 3600000) return 'too_soon';
  if (CONFIG.CLOSED_WEEKDAYS.indexOf(new Date(date + 'T00:00:00Z').getUTCDay()) >= 0) return 'closed_day';
  const endHHmm = Utilities.formatDate(end, 'Asia/Tokyo', 'HH:mm');
  if (time < CONFIG.OPEN || endHHmm > CONFIG.CLOSE || endHHmm < time) return 'out_of_hours';
  return '';
}

function reschedule_(email, d) {
  const r = readReservations_(email).filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'not_found' };
  if (r.status !== STATUS.CONFIRMED) return { ok: false, error: 'not_active' };
  if (r.startMs - Date.now() < CONFIG.CANCEL_DEADLINE_HOURS * 3600000) return { ok: false, error: 'too_late' };
  const err = rulesError_(d.date, d.time, r.minutes);
  if (err) return { ok: false, error: err };

  const start = new Date(d.date + 'T' + d.time + ':00+09:00'), end = new Date(start.getTime() + r.minutes * 60000);
  const cal = getCalendar_(), buf = CONFIG.BUFFER_MIN * 60000;
  const clash = cal.getEvents(new Date(start.getTime() - buf), new Date(end.getTime() + buf))
    .filter(function (ev) { return ev.getId() !== r.eventId && (CONFIG.BLOCK_ALL_DAY_EVENTS || !ev.isAllDayEvent()); });
  if (clash.length >= CONFIG.CAPACITY) return { ok: false, error: 'conflict' };

  let ev = null;
  try { ev = cal.getEventById(r.eventId); } catch (x) {}
  if (ev) ev.setTime(start, end);
  else cal.createEvent('【予約】' + r.name + ' 様 / ' + r.menuName, start, end, { description: '予約ID: ' + r.id });

  const sh = getSheet_(), endHHmm = Utilities.formatDate(end, 'Asia/Tokyo', 'HH:mm');
  sh.getRange(r.row, 4, 1, 3).setNumberFormat('@').setValues([[d.date, d.time, endHHmm]]);                              // 日付・開始・終了
  sh.getRange(r.row, 20).setNumberFormat('@').setValue(Utilities.formatDate(start, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX"));  // 予約日時(ISO)
  sh.getRange(r.row, 22, 1, 2).setNumberFormat('@').setValues([['', nowStr_()]]);                                        // 2日前リマインドを再送対象に / 更新日時
  sh.getRange(r.row, 24).setNumberFormat('@').setValue('');                                                              // 当日リマインドを再送対象に

  const nr = { id: r.id, date: d.date, time: d.time, end: endHHmm, menuName: r.menuName, options: r.options, total: r.total,
               name: r.name, minutes: r.minutes, startMs: start.getTime() };
  notifyCustomer_(email, 'changed', nr);
  notifyOwner_('【日時変更】' + r.name + ' 様 ' + d.date + ' ' + d.time,
    '予約番号: ' + r.id + '\n旧: ' + r.date + ' ' + r.time + '\n新: ' + d.date + ' ' + d.time + '\nメニュー: ' + r.menuName + '\nお客様がマイページから変更しました。');
  return { ok: true };
}

/* =========================================================
 * LINE連携 / 通知
 *  スクリプト プロパティ:
 *    LINE_CHANNEL_ACCESS_TOKEN … Messaging API(公式アカウント)のチャネルアクセストークン(長期)
 *    LINE_LOGIN_CHANNEL_ID     … LINEログインチャネルのチャネルID(IDトークン検証用)
 *    LIFF_ID                   … LIFFアプリのID(例 1234567890-AbCdEfGh)
 *  ※ 公式アカウントとLINEログインチャネルは同じプロバイダーに置くこと(userIdを一致させるため)
 * ========================================================= */
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function lineConfigured_() { return !!prop_('LINE_CHANNEL_ACCESS_TOKEN'); }
function issueToken_(email) {
  const t = Utilities.getUuid();
  CacheService.getScriptCache().put('tok:' + t, email, 21600);   // 6時間
  return t;
}

/* ----- 連携 ----- */
function verifyIdToken_(idToken) {
  if (!idToken || !prop_('LINE_LOGIN_CHANNEL_ID')) return null;
  const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post', payload: { id_token: idToken, client_id: prop_('LINE_LOGIN_CHANNEL_ID') }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) return null;
  return JSON.parse(res.getContentText()).sub || null;   // sub = LINE userId
}

/** メール確認済みのMy Kohakuセッションから、10分有効のワンタイム連携コードを発行 */
function lineLinkCode_(email) {
  const c = findCustomer_(email);
  if (!c) return { ok: false, error: 'no_customer' };
  const code = Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  CacheService.getScriptCache().put('link:' + code, c.id, 600);
  return { ok: true, code: code };
}

function lineLink_(d) {
  const userId = verifyIdToken_(d.idToken);
  if (!userId) return { ok: false, error: 'line_auth' };
  const cache = CacheService.getScriptCache(), code = String(d.code || '').toUpperCase();
  const customerId = code ? cache.get('link:' + code) : null;
  if (!customerId) return { ok: false, error: 'bad_link_code' };
  const r = linkLineUser_(customerId, userId);
  if (!r.ok) return r;
  cache.remove('link:' + code);
  const c = allCustomers_().filter(function (x) { return x.id === customerId; })[0];
  linePush_(c, [{ type: 'text', text: CONFIG.SALON_NAME + ' のLINE連携が完了しました。\nご予約の確認とリマインドを、こちらのLINEへお送りします。' }]);
  return { ok: true, token: issueToken_(c.email), email: c.email };
}

function lineLogin_(d) {
  const userId = verifyIdToken_(d.idToken);
  if (!userId) return { ok: false, error: 'line_auth' };
  const c = findCustomerByLineUserId_(userId);
  if (!c) return { ok: false, error: 'not_linked' };
  return { ok: true, token: issueToken_(c.email), email: c.email };
}

function lineUnlink_(email) {
  const c = findCustomer_(email);
  if (!c) return { ok: false, error: 'no_customer' };
  const sh = getCustomerSheet_();
  sh.getRange(c.row, C.LINE_ID + 1, 1, 2).setNumberFormat('@').setValues([['', '']]);
  sh.getRange(c.row, C.UPDATED + 1).setNumberFormat('@').setValue(nowStr_());
  return { ok: true };
}

/* ----- 送信 ----- */
function linePush_(c, messages) {
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + prop_('LINE_CHANNEL_ACCESS_TOKEN') },
    payload: JSON.stringify({ to: c.lineUserId, messages: messages })
  });
  const code = res.getResponseCode();
  if (code === 200) return true;
  const body = res.getContentText();
  console.error('LINE push failed ' + code + ' ' + body);
  // ブロック等で届かない場合は通知を停止(実運用で応答内容を確認して調整してください)
  if (code === 403 || /block|not a friend/i.test(body)) getCustomerSheet_().getRange(c.row, C.LINE_NOTIFY + 1).setValue('停止');
  return false;
}

function yenStr_(v) {
  return (v === '' || v == null || isNaN(Number(v))) ? '当日ご案内' : String(Number(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '円';
}
function fmtDateJa_(ds) {
  const p = ds.split('-'), w = ['日', '月', '火', '水', '木', '金', '土'][new Date(ds + 'T00:00:00Z').getUTCDay()];
  return Number(p[0]) + '年' + Number(p[1]) + '月' + Number(p[2]) + '日(' + w + ')';
}
function appUrl_(params, forLine) {
  const q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  if (forLine && prop_('LIFF_ID')) return 'https://liff.line.me/' + prop_('LIFF_ID') + (q ? '?' + q : '');
  return CONFIG.SITE_URL ? CONFIG.SITE_URL + (q ? (CONFIG.SITE_URL.indexOf('?') < 0 ? '?' : '&') + q : '') : '';
}

function buildMessage_(kind, r) {
  const T = {
    confirm:   { title: 'ご予約を承りました',           lead: 'この度はご予約ありがとうございます。' },
    remind2d:  { title: '2日後のご予約のご案内',         lead: 'ご予約の日が近づいてまいりました。' },
    remind0d:  { title: '本日のご予約のご案内',          lead: '本日のご来店をお待ちしております。' },
    changed:   { title: 'ご予約の日時を変更しました',    lead: '以下の内容に変更いたしました。' },
    cancelled: { title: 'ご予約をキャンセルしました',    lead: 'またのご利用をお待ちしております。' }
  }[kind];
  return {
    kind: kind, title: T.title, lead: T.lead, name: r.name, id: r.id,
    rows: [['予約番号', r.id], ['日時', fmtDateJa_(r.date) + ' ' + r.time + '〜' + r.end], ['メニュー', r.menuName],
           ['オプション', r.options || 'なし'], ['合計', yenStr_(r.total)]],
    hasLink: kind !== 'cancelled',
    canChange: kind !== 'cancelled' && (r.startMs - Date.now()) >= CONFIG.CANCEL_DEADLINE_HOURS * 3600000,
    subject: '【' + CONFIG.SALON_NAME + '】' + T.title + '(' + r.id + ')'
  };
}

function buildFlex_(m) {
  const body = m.rows.map(function (kv) {
    return { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
      { type: 'text', text: kv[0], color: '#8A7662', size: 'sm', flex: 2 },
      { type: 'text', text: String(kv[1]), wrap: true, size: 'sm', flex: 5 } ] };
  });
  body.unshift({ type: 'text', text: m.name + ' 様\n' + m.lead, wrap: true, size: 'sm', margin: 'none' });
  const bubble = {
    type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', backgroundColor: '#6E5238', paddingAll: '14px',
              contents: [{ type: 'text', text: CONFIG.SALON_NAME + '  ' + m.title, color: '#FFFFFF', weight: 'bold', size: 'md', wrap: true }] },
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: body }
  };
  const open = appUrl_({ page: 'my', id: m.id }, true);
  if (m.hasLink && open) {
    const buttons = [{ type: 'button', style: 'primary', color: '#6E5238', height: 'sm',
                       action: { type: 'uri', label: m.canChange ? '予約の確認・日時変更' : '予約内容を確認', uri: open } }];
    if (m.canChange) buttons.push({ type: 'button', style: 'secondary', height: 'sm',
                       action: { type: 'uri', label: 'キャンセルする', uri: appUrl_({ page: 'my', act: 'cancel', id: m.id }, true) } });
    bubble.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: buttons };
  }
  return { type: 'flex', altText: '【' + CONFIG.SALON_NAME + '】' + m.title, contents: bubble };
}

function sendMail_(email, m) {
  try {
    const url = m.hasLink ? appUrl_({ page: 'my', id: m.id }, false) : '';
    const lines = [m.name + ' 様', '', m.lead, ''].concat(m.rows.map(function (kv) { return kv[0] + ': ' + kv[1]; }));
    if (url) lines.push('', '予約内容の確認・日時変更・キャンセル:', url);
    lines.push('', m.canChange || !m.hasLink ? '' : 'ご来店が近いため、変更・キャンセルはお電話またはLINEにてご連絡ください。', '', CONFIG.SALON_NAME);
    MailApp.sendEmail({ to: email, name: CONFIG.SALON_NAME, subject: m.subject, body: lines.join('\n') });
    return true;
  } catch (err) { console.error('mail failed: ' + err); return false; }
}

/** LINE連携済みならLINE、そうでなければメールで送る。送れたら true */
function notifyCustomer_(email, kind, r) {
  email = normEmail_(email);
  if (!email) return false;
  const m = buildMessage_(kind, r), c = findCustomer_(email);
  if (c && c.lineUserId && c.lineNotify !== '停止' && lineConfigured_()) {
    try { if (linePush_(c, [buildFlex_(m)])) return true; } catch (err) { console.error('line failed: ' + err); }
  }
  return sendMail_(email, m);
}

/* ----- リマインド(時間トリガーで実行) ----- */
function remind2DaysBefore() { runReminders_(2, 'remind2d', 'remindedAt', 22); }
function remindToday()       { runReminders_(0, 'remind0d', 'remindedTodayAt', 24); }

function runReminders_(daysAhead, kind, sentField, sentCol) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const target = Utilities.formatDate(new Date(Date.now() + daysAhead * 86400000), 'Asia/Tokyo', 'yyyy-MM-dd');
    const sh = getSheet_(), now = Date.now();
    allRows_().filter(function (r) {
      return r.date === target && r.status === STATUS.CONFIRMED && !r[sentField] && r.email && new Date(r.date + 'T' + r.time + ':00+09:00').getTime() > now;
    }).forEach(function (r) {
      r.startMs = new Date(r.date + 'T' + r.time + ':00+09:00').getTime();
      if (notifyCustomer_(r.email, kind, r)) sh.getRange(r.row, sentCol).setNumberFormat('@').setValue(nowStr_());
    });
  } finally { lock.releaseLock(); }
}

/** 初回に一度だけ実行: 2日前(既定18時)と当日(既定8時)のリマインドを毎日自動実行します */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['remind2DaysBefore', 'remindToday'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('remind2DaysBefore').timeBased().everyDays(1).atHour(CONFIG.REMIND_2D_HOUR).inTimezone('Asia/Tokyo').create();
  ScriptApp.newTrigger('remindToday').timeBased().everyDays(1).atHour(CONFIG.REMIND_0D_HOUR).inTimezone('Asia/Tokyo').create();
}
