/* =========================================================
 * 分析画面の実機確認用テストデータ(テスト環境専用・本番では貼らない)
 *
 *  使い方(Apps Script エディタ):
 *   1. このファイルを「TestSeed.gs」という名前のファイルとして追加(Code.gs はそのまま)
 *   2. seedAnalyticsTestData を実行 → 予約シートに ID が「TESTA-」で始まる10行が入る
 *   3. 管理画面の「分析」で確認(手順書: docs/analytics-live-check.md)
 *   4. 終わったら clearAnalyticsTestData を実行 → TESTA- の行だけ消える
 *
 *  カレンダー予定・メール・LINE は一切作らない/送らない(シートに行を足すだけ)。
 *  日付は実行日を基準に決める。実行日が月の1〜2日だと「今月」に昨日が入らないため実行しない。
 * ========================================================= */
const TESTA_PREFIX = 'TESTA-';

function seedAnalyticsTestData() {
  const today = todayStr_();
  if (Number(today.slice(8, 10)) < 3) {
    Logger.log('月の3日以降に実行してください(今日=' + today + ')');
    return;
  }
  const sh = getSheet_();
  const last = sh.getLastRow();
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).indexOf(TESTA_PREFIX) === 0) {
        Logger.log('すでにテストデータがあります。先に clearAnalyticsTestData を実行してください');
        return;
      }
    }
  }

  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const pad = function (n) { return (n < 10 ? '0' : '') + n; };
  const monthStart = function (back) {          // back か月前の1日
    let yy = y, mm = m - back;
    while (mm < 1) { mm += 12; yy--; }
    return yy + '-' + pad(mm) + '-01';
  };
  const M = monthStart(0), L = monthStart(1), P = monthStart(2);
  const yesterday = addDaysStr_(today, -1);

  const menus = {
    aroma60:  ['Relax アロマボディトリートメント', 60,  'aroma60'],
    aroma80:  ['満足 アロマボディトリートメント', 80,  'aroma80'],
    aroma100: ['疲労回復 アロマボディトリートメント', 100, 'aroma100'],
    omakase:  ['おまかせ相談予約', 60, 'omakase']
  };
  // [番号, 日付, 状態, メニュー, 合計金額('' =当日案内), 初回/再来, 流入元, 受付経路, クーポン, 割引額]
  const rows = [
    [1,  M,                    STATUS.VISITED,   menus.aroma60,  7000,  '初回', 'instagram_dm', 'web',   '',        0],
    [2,  addDaysStr_(M, 1),    STATUS.VISITED,   menus.aroma80,  9000,  '再来', 'instagram',    'web',   '',        0],
    [3,  addDaysStr_(M, 1),    STATUS.VISITED,   menus.aroma100, 10000, '再来', '',             'admin', 'CP-TEST', 1000],
    [4,  M,                    STATUS.VISITED,   menus.omakase,  '',    '',     '',             'web',   '',        0],
    [5,  yesterday,            STATUS.CONFIRMED, menus.aroma60,  7000,  '再来', '',             'web',   '',        0],
    [6,  today,                STATUS.CONFIRMED, menus.aroma60,  7000,  '初回', '',             'web',   '',        0],
    [7,  M,                    STATUS.CANCELLED, menus.aroma60,  7000,  '再来', '',             'web',   '',        0],
    [8,  addDaysStr_(L, 4),    STATUS.VISITED,   menus.aroma60,  7000,  '再来', 'instagram_dm', 'web',   '',        0],
    [9,  addDaysStr_(L, 5),    STATUS.VISITED,   menus.aroma80,  9000,  '初回', 'line',         'web',   '',        0],
    [10, addDaysStr_(P, 9),    STATUS.VISITED,   menus.aroma100, 11000, '再来', '',             'web',   '',        0]
  ];

  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss");
  const values = rows.map(function (r) {
    const id = TESTA_PREFIX + pad(r[0]), menu = r[3];
    const v = new Array(HEADERS.length).fill('');
    v[0] = id; v[1] = now; v[2] = r[2]; v[3] = r[1]; v[4] = '10:00'; v[5] = '11:00';
    v[6] = menu[0]; v[7] = ''; v[8] = r[4] === '' ? '' : String(r[4]); v[9] = String(menu[1]);
    v[10] = 'テスト 分析' + pad(r[0]); v[11] = 'テスト'; v[12] = '09000000000';
    v[13] = 'analytics-test+' + pad(r[0]) + '@example.com'; v[14] = r[5]; v[15] = '分析の実機確認用(clearAnalyticsTestData で削除)';
    v[17] = menu[2]; v[19] = r[1] + 'T10:00:00+09:00'; v[20] = r[7]; v[22] = now;
    v[24] = r[6]; v[26] = r[8]; v[27] = r[9] ? String(r[9]) : '';
    return v.map(String);
  });

  const start = Math.max(sh.getLastRow(), 1) + 1;
  const range = sh.getRange(start, 1, values.length, HEADERS.length);
  range.setNumberFormat('@');                    // 日付や数値が自動変換されないように文字列で保存
  range.setValues(values);
  Logger.log('テスト予約を ' + values.length + ' 行追加しました(今月=' + M + ' / 先月=' + L + ' / 2か月前=' + P + ' / 今日=' + today + ')');
}

function clearAnalyticsTestData() {
  const sh = getSheet_(), last = sh.getLastRow();
  if (last < 2) { Logger.log('削除対象はありません'); return; }
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  let n = 0;
  for (let i = ids.length - 1; i >= 0; i--) {     // 下から消して行番号のずれを防ぐ
    if (String(ids[i][0]).indexOf(TESTA_PREFIX) === 0) { sh.deleteRow(i + 2); n++; }
  }
  Logger.log('テスト予約を ' + n + ' 行削除しました');
}
