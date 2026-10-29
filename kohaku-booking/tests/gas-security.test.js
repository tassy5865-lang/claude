const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

function loadGas() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const props = { ADMIN_PASSWORD: 'correct-horse' };
  const store = new Map();
  const ctx = vm.createContext({
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => store.get(k) ?? null, put: (k, v) => store.set(k, v), remove: k => store.delete(k) }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (s, k) => Array.from(crypto.createHmac('sha256', k).update(s).digest()),
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64url')
    }
  });
  vm.runInContext(src, ctx);
  return ctx;
}
const bad = (g, device) => g.adminLogin_({ password: 'nope', device });
const good = (g, device) => g.adminLogin_({ password: 'correct-horse', device });

test('管理画面: 正しいパスワードでトークンと端末の印が返る', () => {
  const g = loadGas();
  const r = good(g);
  assert.strictEqual(r.ok, true);
  assert.ok(r.token && /^[0-9a-f]{32}\.[\w-]+$/.test(r.device));
  assert.ok(g.adminAuth_({ token: r.token }));
  assert.strictEqual(good(g, r.device).device, r.device, '同じ端末なら印は変わらない');
});

test('管理画面: 見覚えのない端末は失敗5回でロック(正しいパスワードでも入れない)', () => {
  const g = loadGas();
  for (let i = 0; i < 5; i++) assert.strictEqual(bad(g).error, 'bad_password');
  assert.strictEqual(bad(g).error, 'locked');
  assert.strictEqual(good(g).error, 'locked');
});

test('管理画面: 外部の人がロックさせても、ログイン済みの端末は入れる', () => {
  const g = loadGas();
  const device = good(g).device;
  for (let i = 0; i < 6; i++) bad(g);                       // 外部の人が失敗を重ねる
  assert.strictEqual(good(g).error, 'locked');               // 見覚えのない端末は締め出される
  assert.strictEqual(good(g, device).ok, true);              // 店主の端末は入れる
});

test('管理画面: 端末の印があっても、その端末の失敗は5回でロック。偽の印は効かない', () => {
  const g = loadGas();
  const device = good(g).device;
  for (let i = 0; i < 5; i++) bad(g, device);
  assert.strictEqual(good(g, device).error, 'locked');
  const forged = 'a'.repeat(32) + '.' + 'x'.repeat(43);
  assert.strictEqual(g.adminDeviceId_(forged), '');
  assert.strictEqual(g.adminDeviceId_(device.replace(/\.[\w-]+$/, '.AAAA')), '');
  assert.strictEqual(g.adminDeviceId_(''), '');
});

test('safeEqual_: 同じ文字列だけ true(長さ違い・空も正しく判定)', () => {
  const g = loadGas();
  assert.strictEqual(g.safeEqual_('abc', 'abc'), true);
  assert.strictEqual(g.safeEqual_('abc', 'abd'), false);
  assert.strictEqual(g.safeEqual_('abc', 'abcd'), false);
  assert.strictEqual(g.safeEqual_('', 'a'), false);
  assert.strictEqual(g.safeEqual_('', ''), true);
});

test('入力の長さ上限: 長すぎる項目は too_long。通常の長さは通る', () => {
  const g = loadGas();
  const ok = { name: '山田 花子', kana: 'ヤマダ ハナコ', tel: '090-1234-5678', email: 'a@example.com', note: '肩こり', visit: 'first' };
  assert.strictEqual(g.tooLong_(ok), false);
  for (const [k, n] of [['name', 41], ['kana', 61], ['email', 201], ['note', 1001], ['tel', 21]]) {
    assert.strictEqual(g.tooLong_({ ...ok, [k]: 'あ'.repeat(n) }), true, k);
  }
  assert.strictEqual(g.tooLong_({ ...ok, note: 'あ'.repeat(1000) }), false);
  const base = { date: '2099-01-05', time: '10:00', minutes: 60, menuName: 'x' };
  assert.strictEqual(g.validate_({ ...base, ...ok, name: 'あ'.repeat(41) }), 'too_long');
});

test('マイページの更新も長さ上限を見る', () => {
  const g = loadGas();
  g.upsertCustomer_ = () => 'C000001'; g.findCustomer_ = () => null;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(g.updateProfile_('a@example.com', { name: 'あ'.repeat(41), kana: 'カナ', tel: '09012345678' }))), { ok: false, error: 'too_long' });
  assert.strictEqual(g.updateProfile_('a@example.com', { name: '山田', kana: 'ヤマダ', tel: '09012345678' }).ok, true);
});
