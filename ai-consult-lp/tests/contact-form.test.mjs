// gas/contact-form.gs の受け口を、GASの部品を偽物に差し替えて動かすテスト。実行: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const rows = [];
  const mails = [];
  const store = new Map();
  const sandbox = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: () => ({ appendRow: (r) => rows.push(r), getParent: () => ({ getUrl: () => 'https://sheet' }) }),
      getUrl: () => 'https://sheet' }) },
    CacheService: { getScriptCache: () => ({ get: (k) => store.get(k) ?? null, put: (k, v) => store.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    Utilities: { formatDate: () => '2026102912' },
    MailApp: { sendEmail: (...a) => mails.push(a) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../gas/contact-form.gs', import.meta.url), 'utf8') + '\nthis.doPost = doPost;', sandbox);
  const post = (body) => JSON.parse(sandbox.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).t);
  return { post, rows, mails };
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
