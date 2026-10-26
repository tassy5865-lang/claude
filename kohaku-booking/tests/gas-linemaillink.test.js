const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

function loadGas(customers) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const props = {};
  const ctx = vm.createContext({
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (s, k) => Array.from(crypto.createHmac('sha256', k).update(s).digest()),
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64url')
    }
  });
  vm.runInContext(src, ctx);
  ctx.allCustomers_ = () => customers;
  ctx.findCustomer_ = e => customers.filter(c => c.email === e)[0] || null;
  return { g: ctx, props };
}

test('メール連携トークン: 発行したものは未連携の顧客に有効', () => {
  const { g } = loadGas([{ id: 'C000001', email: 'a@example.com', lineUserId: '' }]);
  assert.strictEqual(g.verifyMailLinkToken_(g.mailLinkToken_('C000001')), 'C000001');
});

test('メール連携トークン: 改ざん・期限切れ・連携済み・形式不正は無効', () => {
  const cs = [{ id: 'C000001', email: 'a@example.com', lineUserId: '' }, { id: 'C000002', email: 'b@example.com', lineUserId: 'U' + 'a'.repeat(32) }];
  const { g } = loadGas(cs);
  const t = g.mailLinkToken_('C000001').split('.');
  assert.strictEqual(g.verifyMailLinkToken_(['C000002', t[1], t[2]].join('.')), null);   // 他人のIDに差し替え
  assert.strictEqual(g.verifyMailLinkToken_([t[0], Number(t[1]) + 1, t[2]].join('.')), null);   // 期限の延長
  const old = 'C000001.' + (Date.now() - 1000);
  assert.strictEqual(g.verifyMailLinkToken_(old + '.' + g.linkSign_(old)), null);   // 期限切れ
  assert.strictEqual(g.verifyMailLinkToken_(g.mailLinkToken_('C000002')), null);   // 連携済みは使えない
  assert.strictEqual(g.verifyMailLinkToken_('ABCD1234'), null);
  assert.strictEqual(g.verifyMailLinkToken_(''), null);
});

test('lineLinkMailUrl_: LINE未設定・連携済みなら空、未連携ならLIFFのlink付きURL', () => {
  const cs = [{ id: 'C000001', email: 'a@example.com', lineUserId: '' }, { id: 'C000002', email: 'b@example.com', lineUserId: 'Uxx' }];
  const { g, props } = loadGas(cs);
  assert.strictEqual(g.lineLinkMailUrl_('a@example.com'), '');
  props.LINE_CHANNEL_ACCESS_TOKEN = 't'; props.LIFF_ID = '123-abc';
  const u = g.lineLinkMailUrl_('a@example.com');
  assert.ok(u.startsWith('https://liff.line.me/123-abc?link=C000001.'), u);
  assert.strictEqual(g.lineLinkMailUrl_('b@example.com'), '');
  assert.strictEqual(g.lineLinkMailUrl_('nobody@example.com'), '');
});
