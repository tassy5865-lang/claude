// main.js の「送信結果 → 画面表示」の判定を確かめるテスト。
// 受け口(GAS)の返事を読んで、受付できた時だけ「送信しました」と入力消去をする。
// 実行: node --test ai-consult-lp/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

function load() {
  const sandbox = { document: { addEventListener() {} }, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.NexsistForm;
}

test('main.js exposes describeResult', () => {
  const f = load();
  assert.equal(typeof f?.describeResult, 'function');
});

test('only an ok:true reply counts as received and clears the form', () => {
  const { describeResult } = load();
  const r = describeResult({ type: 'response', body: { ok: true } });
  assert.equal(r.ok, true);
  assert.equal(r.clear, true);
  assert.match(r.text, /受け付けました/);
  assert.match(r.text, /2営業日/);
});

test('field errors keep the input and point to the field', () => {
  const { describeResult } = load();
  const email = describeResult({ type: 'response', body: { ok: false, error: 'bad_email' } });
  assert.equal(email.ok, false);
  assert.equal(email.clear, false);
  assert.equal(email.field, 'email');
  assert.match(email.text, /メールアドレス/);
  const missing = describeResult({ type: 'response', body: { ok: false, error: 'missing_field' } });
  assert.equal(missing.clear, false);
  assert.match(missing.text, /入力/);
  // 不足している欄へ案内する(相談内容が空なら相談内容の欄)
  const noMsg = describeResult({ type: 'response', body: { ok: false, error: 'missing_field', field: 'message' } });
  assert.equal(noMsg.field, 'message');
  const tooLong = describeResult({ type: 'response', body: { ok: false, error: 'too_long', field: 'message' } });
  assert.equal(tooLong.clear, false);
  assert.equal(tooLong.field, 'message');
  assert.match(tooLong.text, /長すぎ/);
});

test('busy (rate limit) asks to wait or use LINE, keeps input', () => {
  const { describeResult } = load();
  const r = describeResult({ type: 'response', body: { ok: false, error: 'busy' } });
  assert.equal(r.ok, false);
  assert.equal(r.clear, false);
  assert.match(r.text, /時間をおいて/);
  assert.match(r.text, /LINE/);
});

test('network error, timeout and unreadable reply never claim success', () => {
  const { describeResult } = load();
  for (const type of ['network', 'timeout', 'unreadable']) {
    const r = describeResult({ type });
    assert.equal(r.ok, false, type);
    assert.equal(r.clear, false, type);
    assert.doesNotMatch(r.text, /受け付けました|送信しました/, type);
    assert.match(r.text, /LINE/, type);
  }
  const unknown = describeResult({ type: 'response', body: { ok: false, error: 'something_new' } });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.clear, false);
});

test('submit handler reads the reply instead of no-cors and guards double submit', () => {
  assert.doesNotMatch(src, /no-cors/);
  assert.match(src, /\.json\(\)/);
  assert.match(src, /AbortController/);
  assert.match(src, /\.disabled\s*=\s*true/);
  assert.match(src, /\.disabled\s*=\s*false/);
});

// ---- 送信ハンドラーを実際に動かすテスト(2026-11-14 codex 指摘) ----
function harness(fetchImpl, storage = new Map()) {
  const listeners = {};
  const fields = { name: '山田', email: 'a@example.com', message: '相談です', website: '' };
  const focusLog = [];
  const button = { disabled: true };
  const status = { textContent: '', dataset: {} };
  let resets = 0;
  const elements = Object.fromEntries(Object.keys(fields).map((k) => [k, { readOnly: false, focus: () => focusLog.push(k) }]));
  const form = {
    elements,
    _attrs: {},
    querySelector: (sel) => (sel.includes('submit') ? button : null),
    addEventListener: (type, fn) => { listeners['form:' + type] = fn; },
    setAttribute(k, v) { this._attrs[k] = v; },
    removeAttribute(k) { delete this._attrs[k]; },
    reset: () => { resets++; },
  };
  const sent = [];
  const sandbox = {
    console, setTimeout, clearTimeout, AbortController, JSON,
    crypto: { randomUUID: () => `uuid-${Math.random().toString(36).slice(2, 14).padEnd(12, '0')}` },
    FormData: class { constructor() {} get(k) { return fields[k]; } },
    fetch: async (url, opts) => { sent.push(JSON.parse(opts.body)); return fetchImpl(sent.length); },
    document: {
      addEventListener: (type, fn) => { listeners['doc:' + type] = fn; },
      querySelectorAll: () => [],
      getElementById: (id) => (id === 'contact-form' ? form : id === 'form-status' ? status : null),
    },
    matchMedia: () => ({ matches: false }),
    addEventListener: (type, fn) => { listeners['win:' + type] = fn; },
    sessionStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  listeners['doc:DOMContentLoaded']();
  const submit = () => listeners['form:submit']({ preventDefault() {} });
  return { button, status, form, fields, elements, sent, focusLog, submit, storage, get resets() { return resets; } };
}
const reply = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

test('button starts disabled in HTML and is enabled once the handler is ready', () => {
  const h = harness(() => reply({ ok: true }));
  assert.equal(h.button.disabled, false);
});

test('success clears the form; failure keeps it and re-enables the button', async () => {
  const good = harness(() => reply({ ok: true }));
  await good.submit();
  assert.equal(good.resets, 1);
  assert.equal(good.status.dataset.state, 'success');
  assert.equal(good.button.disabled, false);

  const bad = harness(() => reply({ ok: false, error: 'bad_email' }));
  await bad.submit();
  assert.equal(bad.resets, 0);
  assert.equal(bad.status.dataset.state, 'error');
  assert.deepEqual(bad.focusLog, ['email']);
  assert.equal(bad.button.disabled, false);
});

test('an HTTP error is not treated as success even if the body says ok', async () => {
  const h = harness(() => reply({ ok: true }, false, 500));
  await h.submit();
  assert.equal(h.resets, 0);
  assert.equal(h.status.dataset.state, 'error');
});

test('unreadable reply and network failure keep the input', async () => {
  const unreadable = harness(() => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }));
  await unreadable.submit();
  assert.equal(unreadable.resets, 0);
  const network = harness(() => { throw new TypeError('Failed to fetch'); });
  await network.submit();
  assert.equal(network.resets, 0);
  assert.match(network.status.textContent, /受け付けられている可能性/);
});

test('a resend after a failure reuses the same request id; a new message gets a new one', async () => {
  let n = 0;
  const h = harness(() => { n++; if (n === 1) throw new TypeError('Failed to fetch'); return reply({ ok: true }); });
  await h.submit();
  await h.submit();
  assert.equal(h.sent.length, 2);
  assert.ok(/^[A-Za-z0-9-]{8,64}$/.test(h.sent[0].requestId));
  assert.equal(h.sent[0].requestId, h.sent[1].requestId);
  h.fields.message = '別の相談です';
  await h.submit();
  assert.notEqual(h.sent[2].requestId, h.sent[1].requestId);
});

// ---- codex 3回目の指摘 ----
test('inputs are read-only while sending and editable again afterwards', async () => {
  let release;
  const h = harness(() => new Promise((r) => { release = () => r(reply({ ok: true })); }));
  const pending = h.submit();
  await new Promise((r) => setTimeout(r, 0));
  for (const k of ['name', 'email', 'message']) assert.equal(h.elements[k].readOnly, true, k);
  release();
  await pending;
  for (const k of ['name', 'email', 'message']) assert.equal(h.elements[k].readOnly, false, k);
});

test('the request id survives a page reload for the same content', async () => {
  const storage = new Map();
  const first = harness(() => { throw new TypeError('Failed to fetch'); }, storage);
  await first.submit();
  const reloaded = harness(() => reply({ ok: true }), storage);
  await reloaded.submit();
  assert.equal(reloaded.sent[0].requestId, first.sent[0].requestId);
  assert.equal(storage.size, 0); // 受付できたら保存していたIDを消す
});

test('resend guidance does not over-promise', () => {
  const { describeResult } = load();
  for (const type of ['network', 'timeout']) {
    const t = describeResult({ type }).text;
    assert.doesNotMatch(t, /二重には登録されません/);
    assert.match(t, /同じ送信として/);
  }
});

// codex 7回目(2026-11-20): 空白だけの入力は送らず、その欄へ案内する
test('blank-only message is not sent and focuses the message field', async () => {
  const h = harness(() => reply({ ok: true }));
  h.fields.message = '   ';
  await h.submit();
  assert.equal(h.sent.length, 0);
  assert.deepEqual(h.focusLog, ['message']);
  assert.match(h.status.textContent, /相談内容/);
  assert.equal(h.button.disabled, false);
});
