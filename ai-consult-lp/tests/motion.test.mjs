// motion.js(ヒーローの網・スクロール出現)のテスト。
// 実行: node --test ai-consult-lp/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../motion.js', import.meta.url), 'utf8');

// motion.js を読み込む。extra でブラウザの部品(モック)を足せる。DOMContentLoaded は呼ばない
function load(extra = {}) {
  const sandbox = {
    console, Math, JSON,
    document: { addEventListener() {} },
    ...extra,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox;
}

// 再現できる乱数
function seeded(seed = 1) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

test('nodeCount scales with area and stays within 14..44', () => {
  const { nodeCount } = load().NexsistMotion;
  const phone = nodeCount(375, 700);
  const pc = nodeCount(1280, 800);
  assert.ok(phone >= 16 && phone <= 24, `phone ${phone}`);
  assert.ok(pc >= 36 && pc <= 44, `pc ${pc}`);
  assert.equal(nodeCount(100, 100), 14);
  assert.equal(nodeCount(4000, 3000), 44);
});

test('createNodes keeps nodes inside and slow', () => {
  const { createNodes } = load().NexsistMotion;
  const nodes = createNodes(40, 800, 600, seeded(7));
  assert.equal(nodes.length, 40);
  for (const n of nodes) {
    assert.ok(n.x >= 0 && n.x <= 800 && n.y >= 0 && n.y <= 600);
    assert.ok(Math.abs(n.vx) <= 0.25 && Math.abs(n.vy) <= 0.25);
  }
});

test('stepNodes bounces at edges', () => {
  const { stepNodes } = load().NexsistMotion;
  const n = { x: 799.9, y: 300, vx: 0.2, vy: 0 };
  stepNodes([n], 800, 600, null);
  assert.ok(n.x <= 800, `x ${n.x}`);
  assert.ok(n.vx < 0);
});

test('stepNodes pulls nodes toward the pointer a little', () => {
  const { stepNodes } = load().NexsistMotion;
  const n = { x: 300, y: 300, vx: 0, vy: 0 };
  const pointer = { x: 400, y: 300 };
  const before = Math.hypot(pointer.x - n.x, pointer.y - n.y);
  stepNodes([n], 800, 600, pointer);
  const after = Math.hypot(pointer.x - n.x, pointer.y - n.y);
  assert.ok(after < before, 'moved closer');
  assert.ok(before - after <= 0.6 + 1e-9, `moved ${before - after}`);
  // 遠い点は引き寄せない
  const far = { x: 10, y: 10, vx: 0, vy: 0 };
  stepNodes([far], 800, 600, pointer);
  assert.deepEqual([far.x, far.y], [10, 10]);
});

test('linksFor returns pairs closer than maxDist with fading alpha', () => {
  const { linksFor } = load().NexsistMotion;
  const links = linksFor([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 300, y: 0 }], 120);
  assert.equal(links.length, 1);
  assert.equal(links[0].a, 0);
  assert.equal(links[0].b, 1);
  assert.ok(Math.abs(links[0].alpha - (1 - 50 / 120)) < 1e-9);
});
