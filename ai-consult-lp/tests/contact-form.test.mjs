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
  const mailer = { fail: !!opts.mailFails };
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
      put: (k, v, ttl) => { if (ttl > 21600) throw new Error('Exception: Invalid argument: expirationInSeconds'); store.set(k, v); },
    }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => { props.set(k, String(v)); },
      getKeys: () => [...props.keys()],
      deleteProperty: (k) => { props.delete(k); },
    }) },
    LockService: { getScriptLock: () => ({
      waitLock() { if (opts.lockFails) throw new Error('Lock timeout'); events.push('lock'); },
      releaseLock() { events.push('release'); },
    }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    Utilities: { formatDate: () => clock.hour },
    MailApp: { sendEmail: (...a) => { if (mailer.fail) throw new Error('mail quota'); events.push('mail'); mails.push(a); } },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../gas/contact-form.gs', import.meta.url), 'utf8') + '\nthis.doPost = doPost;', sandbox);
  const post = (body) => JSON.parse(sandbox.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).t);
  return { post, rows, mails, props, clock, store, events, header, mailer, sandbox };
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
