// gas/contact-form.gs の受け口を、GASの部品を偽物に差し替えて動かすテスト。実行: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(opts = {}) {
  const header = ['受信日時', 'お名前', 'メールアドレス', '相談内容']; // 既存シート(旧4列)を再現
  const rows = []; // 2行目以降(データ行)。シートの n 行目 = rows[n - 2]
  const mails = [];
  const events = [];
  const store = new Map();
  const props = new Map();
  const clock = { hour: '2026102912' };
  const mailer = { fail: !!opts.mailFails, onSend: null };
  const owner = { email: opts.noRecipient ? '' : 'owner@example.com' };
  const triggers = [];
  const rowAt = (n) => (n === 1 ? header : rows[n - 2]);
  const sheet = {
    appendRow: (r) => { events.push('append'); rows.push([...r]); },
    getLastRow: () => rows.length + 1,
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => rowAt(r + i)?.[c - 1 + j] ?? '')),
      setValue: (v) => { rowAt(r)[c - 1] = v; },
      setValues: (vals) => vals.forEach((vr, i) => vr.forEach((v, j) => { rowAt(r + i)[c - 1 + j] = v; })),
    }),
    getParent: () => ({ getUrl: () => 'https://sheet' }),
  };
  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, getUrl: () => 'https://sheet' }),
      flush: () => events.push('flush'),
    },
    CacheService: { getScriptCache: () => ({
      get: (k) => store.get(k) ?? null,
      put: (k, v, ttl) => {
        if (ttl > 21600) throw new Error('Exception: Invalid argument: expirationInSeconds');
        if (opts.cacheFails && k.startsWith('req:')) throw new Error('cache down');
        store.set(k, v);
      },
    }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => { props.set(k, String(v)); },
      getKeys: () => [...props.keys()],
      deleteProperty: (k) => { props.delete(k); },
    }) },
    LockService: { getScriptLock: () => ({
      waitLock() { if (opts.lockFails) throw new Error('Lock timeout'); events.push('lock'); },
      tryLock() { if (opts.lockFails) return false; events.push('lock'); return true; },
      releaseLock() { events.push('release'); },
    }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    Utilities: { formatDate: () => clock.hour },
    MailApp: { sendEmail: (...a) => {
      if (mailer.fail) throw new Error('mail quota');
      events.push('mail'); mails.push(a);
      if (mailer.onSend) { const f = mailer.onSend; mailer.onSend = null; f(); }
    } },
    Session: { getEffectiveUser: () => ({ getEmail: () => owner.email }) },
    ScriptApp: {
      getProjectTriggers: () => triggers,
      newTrigger: (fn) => { const t = { fn, getHandlerFunction: () => fn }; return { timeBased: () => ({ everyHours: (h) => ({ create: () => { t.hours = h; triggers.push(t); return t; } }) }) }; },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../gas/contact-form.gs', import.meta.url), 'utf8') + '\nthis.doPost = doPost;', sandbox);
  const post = (body) => JSON.parse(sandbox.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).t);
  return { post, rows, mails, props, clock, store, events, header, mailer, sandbox, triggers };
}
const ok = { name: '山田', email: 'a@example.com', message: 'こんにちは' };

test('normal submission is stored and notified', () => {
  const { post, rows, mails } = load();
  assert.deepEqual(post(ok), { ok: true });
  assert.equal(rows.length, 1);
  assert.equal(mails.length, 1);
});

test('honeypot filled: pretends success but stores nothing', () => {
  const { post, rows, mails } = load();
  assert.deepEqual(post({ ...ok, website: 'http://spam' }), { ok: true });
  assert.equal(rows.length + mails.length, 0);
});

test('spreadsheet formulas are neutralised', () => {
  const { post, rows } = load();
  post({ ...ok, name: '=HYPERLINK("http://x")', message: '+1+1' });
  assert.equal(rows[0][1][0], "'");
  assert.equal(rows[0][3][0], "'");
});

test('over-long input is cut; bad input is rejected', () => {
  const { post, rows } = load();
  post({ ...ok, message: 'あ'.repeat(5000) });
  assert.equal(rows[0][3].length, 2000);
  assert.equal(post('not json').error, 'bad_request');
  assert.equal(post({ ...ok, email: 'nope' }).error, 'bad_email');
  assert.equal(post({ ...ok, name: '  ' }).error, 'missing_field');
});

test('same email is limited per hour; nothing more is stored or mailed', () => {
  const { post, rows, mails } = load();
  for (let i = 0; i < 3; i++) assert.equal(post(ok).ok, true);
  assert.equal(post(ok).error, 'busy');
  assert.equal(rows.length, 3);
  assert.equal(mails.length, 3);
});

test('overall hourly cap protects the daily mail quota', () => {
  const { post, mails } = load();
  let accepted = 0;
  for (let i = 0; i < 40; i++) if (post({ ...ok, email: `u${i}@example.com` }).ok) accepted++;
  assert.equal(accepted, 20);
  assert.equal(mails.length, 20);
});

// 2026-11-14 codex 指摘: CacheService の有効期限は最大 21600 秒。日次の上限はスクリプトプロパティで数える
test('daily cap is counted in script properties and resets the next day', () => {
  const { post, props, clock } = load();
  let accepted = 0;
  for (let h = 0; h < 4; h++) {
    clock.hour = '202611140' + h;
    for (let i = 0; i < 20; i++) if (post({ ...ok, email: `d${h}-${i}@example.com` }).ok) accepted++;
  }
  assert.equal(accepted, 60);
  assert.equal(props.get('daycount:20261114'), '60');
  clock.hour = '2026111500';
  assert.equal(post({ ...ok, email: 'next@example.com' }).ok, true);
  assert.equal(props.has('daycount:20261114'), false); // 前日のカウンタは片付ける
});

test('a resent request id is stored and mailed only once', () => {
  const { post, rows, mails } = load();
  const first = post({ ...ok, requestId: 'req-1234abcd' });
  const again = post({ ...ok, requestId: 'req-1234abcd' });
  assert.equal(first.ok, true);
  assert.equal(again.ok, true);
  assert.equal(again.duplicate, true);
  assert.equal(rows.length, 1);
  assert.equal(mails.length, 1);
  assert.equal(post({ ...ok, requestId: 'req-9999zzzz' }).ok, true);
  assert.equal(rows.length, 2);
});

test('malformed request ids are ignored, not trusted', () => {
  const { post, rows } = load();
  post({ ...ok, requestId: '<script>' });
  post({ ...ok, requestId: '<script>' });
  assert.equal(rows.length, 2);
});

// 2026-11-14 codex 3回目の指摘: 重複防止をキャッシュ頼みにしない・通知失敗を拾う・ロックの持ち方
test('a resent request id is still detected after the cache is cleared', () => {
  const { post, rows, store } = load();
  assert.equal(post({ ...ok, requestId: 'req-keep-0001' }).ok, true);
  store.clear(); // キャッシュは期限前にも消えることがある
  const again = post({ ...ok, requestId: 'req-keep-0001' });
  assert.equal(again.ok, true);
  assert.equal(again.duplicate, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][4], 'req-keep-0001');
});

test('old sheets get the request id and notification columns', () => {
  const { post, header } = load();
  post(ok);
  assert.equal(header[4], '受付ID');
  assert.equal(header[5], '通知');
});

test('lock is released before the notification mail is sent', () => {
  const { post, events } = load();
  post(ok);
  const i = (e) => events.indexOf(e);
  assert.ok(i('append') > i('lock'));
  assert.ok(i('release') > i('append'));
  assert.ok(i('mail') > i('release'), events.join(','));
});

test('lock timeout returns a JSON busy reply and stores nothing', () => {
  const { post, rows } = load({ lockFails: true });
  assert.deepEqual(post(ok), { ok: false, error: 'busy' });
  assert.equal(rows.length, 0);
});

test('a failed notification is marked and can be resent later', () => {
  const { post, rows, mails, mailer, sandbox } = load({ mailFails: true });
  assert.equal(post(ok).ok, true); // 保存できていれば受付は成功
  assert.equal(rows[0][5], '失敗');
  mailer.fail = false;
  sandbox.resendFailedNotifications();
  assert.equal(mails.length, 1);
  assert.equal(rows[0][5], '送信済');
  sandbox.resendFailedNotifications(); // 送信済みは再送しない
  assert.equal(mails.length, 1);
});

// ---- codex 4回目の指摘: 通知の状態管理(未送信→送信中→送信済/失敗)と回収 ----
const minutesAgo = (m) => new Date(Date.now() - m * 60000);

test('a cache failure after saving does not stop the notification', () => {
  const { post, rows, mails } = load({ cacheFails: true });
  assert.equal(post({ ...ok, requestId: 'req-cache-0001' }).ok, true);
  assert.equal(mails.length, 1);
  assert.equal(rows[0][5], '送信済');
});

test('a missing recipient is recorded as failed, never as sent', () => {
  const { post, rows, mails } = load({ noRecipient: true });
  assert.equal(post(ok).ok, true);
  assert.equal(mails.length, 0);
  assert.equal(rows[0][5], '失敗');
});

test('stale 未送信 rows are recovered by the resend job; fresh ones are left alone', () => {
  const { post, rows, mails, sandbox } = load();
  post(ok);
  post({ ...ok, email: 'b@example.com' });
  mails.length = 0;
  rows[0][5] = '未送信'; rows[0][0] = minutesAgo(30); // 保存後に止まった行
  rows[1][5] = '未送信'; rows[1][0] = minutesAgo(1);  // 送信処理の最中かもしれない行
  sandbox.resendFailedNotifications();
  assert.equal(mails.length, 1);
  assert.equal(rows[0][5], '送信済');
  assert.equal(rows[1][5], '未送信');
});

test('the resend job claims rows so an overlapping run does not mail them twice', () => {
  const { post, rows, mails, mailer, sandbox } = load();
  post(ok);
  mails.length = 0;
  rows[0][5] = '失敗';
  mailer.onSend = () => sandbox.resendFailedNotifications(); // 1通目の送信中に、もう1つの実行が始まる
  sandbox.resendFailedNotifications();
  assert.equal(mails.length, 1);
  assert.equal(rows[0][5], '送信済');
});

test('the resend job caps rows per run and gives up after the attempt limit', () => {
  const { post, rows, mails, mailer, sandbox, clock } = load();
  for (let i = 0; i < 15; i++) { clock.hour = '20261114' + String(i).padStart(2, '0'); post({ ...ok, email: `c${i}@example.com` }); }
  mails.length = 0;
  rows.forEach((r) => { r[5] = '失敗'; });
  mailer.fail = true;
  sandbox.resendFailedNotifications();
  assert.equal(rows.filter((r) => Number(r[6]) === 1).length, 10); // 1回の実行で10件まで
  for (let k = 0; k < 10; k++) { clock.hour = `202612${String(k + 1).padStart(2, '0')}00`; rows.forEach((r) => { r[7] = minutesAgo(120); }); sandbox.resendFailedNotifications(); } // 日を進めて送信枠を戻す
  assert.ok(rows.every((r) => Number(r[6]) <= 5), 'attempt limit');
  assert.ok(rows.every((r) => r[5] === '要手動対応'), rows.map((r) => r[5]).join(','));
  assert.ok(rows.every((r) => r[8] === 'mail quota')); // 最後の失敗理由が残る
});

test('duplicate detection checks the whole request id column', () => {
  const { post, rows, store } = load();
  post({ ...ok, requestId: 'req-old-00001' });
  for (let i = 0; i < 600; i++) rows.push([new Date(), 'x', 'x@example.com', 'x', `req-fill-${i}`, '送信済', 0, '']);
  store.clear();
  const again = post({ ...ok, requestId: 'req-old-00001' });
  assert.equal(again.duplicate, true);
  assert.equal(rows.length, 601);
});

test('installResendTrigger adds one hourly trigger and is safe to run twice', () => {
  const { sandbox, triggers } = load();
  sandbox.installResendTrigger();
  sandbox.installResendTrigger();
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0].fn, 'resendFailedNotifications');
  assert.equal(triggers[0].hours, 1);
});

// ---- codex 5回目の指摘: 送信枠を初回と再送で共通に・上限に達した行は「要手動対応」 ----
test('new notifications and resends share one daily mail budget (80)', () => {
  const { post, rows, mails, props, sandbox, clock } = load();
  clock.hour = '2026111509';
  for (let h = 0; h < 3; h++) { // 60件受付(1日の受付上限) → 60通
    clock.hour = '202611150' + h;
    for (let i = 0; i < 20; i++) post({ ...ok, email: `n${h}-${i}@example.com` });
  }
  assert.equal(mails.length, 60);
  for (let i = 0; i < 30; i++) rows.push([minutesAgo(60), 'x', `f${i}@example.com`, 'x', '', '失敗', 1, minutesAgo(60), 'mail quota']);
  for (let k = 0; k < 3; k++) sandbox.resendFailedNotifications();
  assert.equal(mails.length, 80); // 合算で80通まで
  assert.equal(props.get('mailcount:20261115'), '80');
  const waiting = rows.filter((r) => r[5] === '失敗');
  assert.equal(waiting.length, 10);
  assert.ok(waiting.every((r) => Number(r[6]) === 1), '枠待ちでは再送回数を使わない');
  clock.hour = '2026111600'; // 翌日は枠が戻る
  sandbox.resendFailedNotifications();
  assert.equal(mails.length, 90);
});

test('a submission over the mail budget is saved and mailed later by the resend job', () => {
  const { post, rows, mails, props, sandbox, clock } = load();
  clock.hour = '2026111510';
  props.set('mailcount:20261115', '80'); // 今日の送信枠を使い切った状態
  assert.deepEqual(post(ok), { ok: true });
  assert.equal(mails.length, 0);
  assert.equal(rows[0][5], '未送信');
  assert.ok(rows[0][8].includes('送信枠'));
  rows[0][0] = minutesAgo(30);
  sandbox.resendFailedNotifications();
  assert.equal(mails.length, 0); // 同じ日のうちは送らない
  assert.equal(Number(rows[0][6]), 0);
  clock.hour = '2026111600';
  sandbox.resendFailedNotifications();
  assert.equal(mails.length, 1);
  assert.equal(rows[0][5], '送信済');
});

test('a 5th attempt that stopped midway becomes 要手動対応, not 送信中 forever', () => {
  const { post, rows, mails, sandbox } = load();
  post(ok);
  mails.length = 0;
  rows[0][5] = '送信中'; rows[0][6] = 5; rows[0][7] = minutesAgo(60);
  sandbox.resendFailedNotifications();
  assert.equal(mails.length, 0);
  assert.equal(rows[0][5], '要手動対応');
  assert.ok(rows[0][8].includes('止まりました'));
  sandbox.resendFailedNotifications(); // 要手動対応の行には触らない
  assert.equal(mails.length, 0);
  assert.equal(rows[0][5], '要手動対応');
});

test('the first failure reason is recorded', () => {
  const { post, rows, header } = load({ mailFails: true });
  post(ok);
  assert.equal(header[8], '失敗理由');
  assert.equal(rows[0][5], '失敗');
  assert.equal(rows[0][8], 'mail quota');
});
