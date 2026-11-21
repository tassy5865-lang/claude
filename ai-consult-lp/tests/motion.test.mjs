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

// ---- Task 2: 描画と停止の制御(ブラウザの部品はモック) ----
function netHarness({ visibility = 'visible' } = {}) {
  const calls = { raf: 0, arc: 0, stroke: 0 };
  const rafQueue = [];
  const docListeners = {};
  const heroListeners = {};
  const ios = [];
  const ctx = new Proxy({}, {
    get: (t, k) => {
      if (k === 'arc') return () => { calls.arc++; };
      if (k === 'stroke') return () => { calls.stroke++; };
      if (k in t) return t[k];
      return () => {};
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const rect = { left: 0, top: 0, right: 1200, bottom: 700, width: 1200, height: 700 };
  const hero = {
    classList: classList(),
    addEventListener: (type, fn, opts) => { heroListeners[type] = { fn, opts }; },
    querySelector: () => ({ getBoundingClientRect: () => ({ left: 650, top: 200, right: 1150, bottom: 600 }) }),
    getBoundingClientRect: () => rect,
  };
  const canvas = { parentElement: hero, clientWidth: 1200, clientHeight: 700, width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => rect };
  const doc = {
    visibilityState: visibility,
    addEventListener: (type, fn) => { (docListeners[type] ||= []).push(fn); },
  };
  const sb = load({
    document: doc,
    devicePixelRatio: 3,
    requestAnimationFrame: (fn) => { calls.raf++; rafQueue.push(fn); return calls.raf; },
    cancelAnimationFrame: () => { rafQueue.length = 0; },
    IntersectionObserver: class { constructor(cb) { this.cb = cb; ios.push(this); } observe() {} unobserve() {} disconnect() {} },
    addEventListener() {},
  });
  let clock = 0;
  const frame = (dt = 17) => { clock += dt; const fns = rafQueue.splice(0); fns.forEach((f) => f(clock)); };
  return { M: sb.NexsistMotion, canvas, hero, heroListeners, docListeners, ios, calls, frame, doc };
}

test('reduced motion draws one still frame and never loops', () => {
  const h = netHarness();
  const net = h.M.startNet(h.canvas, { reduce: true });
  assert.equal(h.calls.raf, 0);
  assert.ok(h.calls.arc + h.calls.stroke > 0, 'drew something');
  assert.equal(net.isRunning(), false);
  assert.equal(h.heroListeners.pointermove, undefined); // 反応もしない
});

test('canvas buffer is capped at 2x pixel ratio', () => {
  const h = netHarness();
  h.M.startNet(h.canvas, { reduce: true });
  assert.equal(h.canvas.width, 2400);
  assert.equal(h.canvas.height, 1400);
});

test('loop pauses when hidden and resumes when visible', () => {
  const h = netHarness();
  const net = h.M.startNet(h.canvas, { reduce: false });
  assert.equal(net.isRunning(), true);
  h.frame();
  assert.ok(h.calls.raf >= 2, 'keeps requesting frames');
  const io = h.ios[0];
  io.cb([{ isIntersecting: false }]);
  assert.equal(net.isRunning(), false);
  const before = h.calls.raf;
  h.frame();
  assert.equal(h.calls.raf, before, 'no frames while off-screen');
  io.cb([{ isIntersecting: true }]);
  assert.equal(net.isRunning(), true);
  h.doc.visibilityState = 'hidden';
  h.docListeners.visibilitychange.forEach((f) => f());
  assert.equal(net.isRunning(), false);
  h.doc.visibilityState = 'visible';
  h.docListeners.visibilitychange.forEach((f) => f());
  assert.equal(net.isRunning(), true);
  net.stop();
  assert.equal(net.isRunning(), false);
});

test('pointer listeners are passive', () => {
  const h = netHarness();
  h.M.startNet(h.canvas, { reduce: false });
  assert.equal(h.heroListeners.pointermove.opts.passive, true);
  assert.equal(h.heroListeners.pointerleave.opts.passive, true);
});

// ---- Task 3: スクロール出現 ----
function classList() {
  const s = new Set();
  return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) };
}
function revealHarness({ withIO = true } = {}) {
  const parent = {};
  const els = [0, 1, 2, 3, 4, 5].map(() => ({ classList: classList(), style: {}, parentElement: parent }));
  const root = { documentElement: { classList: classList() }, querySelectorAll: () => els };
  const ios = [];
  const extra = withIO
    ? { IntersectionObserver: class { constructor(cb, opts) { this.cb = cb; this.opts = opts; this.watched = new Set(); ios.push(this); } observe(el) { this.watched.add(el); } unobserve(el) { this.watched.delete(el); } disconnect() {} } }
    : {};
  const M = load(extra).NexsistMotion;
  return { M, root, els, ios };
}

test('reveal is skipped without IntersectionObserver', () => {
  const h = revealHarness({ withIO: false });
  assert.equal(h.M.setupReveal(h.root, { reduce: false }), false);
  assert.equal(h.root.documentElement.classList.contains('js-motion'), false);
});

test('reveal is skipped for reduced motion', () => {
  const h = revealHarness();
  assert.equal(h.M.setupReveal(h.root, { reduce: true }), false);
  assert.equal(h.root.documentElement.classList.contains('js-motion'), false);
  assert.equal(h.ios.length, 0);
});

test('revealed elements stay revealed', () => {
  const h = revealHarness();
  assert.equal(h.M.setupReveal(h.root, { reduce: false }), true);
  assert.equal(h.root.documentElement.classList.contains('js-motion'), true);
  const io = h.ios[0];
  assert.equal(io.watched.size, 6);
  io.cb([{ target: h.els[0], isIntersecting: true }, { target: h.els[1], isIntersecting: false }]);
  assert.equal(h.els[0].classList.contains('is-in'), true);
  assert.equal(h.els[1].classList.contains('is-in'), false);
  assert.equal(io.watched.has(h.els[0]), false, 'unobserved after reveal');
  assert.equal(io.watched.has(h.els[1]), true);
});

test('siblings get a short stagger capped at 280ms', () => {
  const h = revealHarness();
  h.M.setupReveal(h.root, { reduce: false });
  const delays = h.els.map((e) => parseInt(e.style.animationDelay || '0', 10));
  assert.deepEqual(delays, [0, 70, 140, 210, 280, 280]);
});

// ---- 最終レビュー・codex 8回目(2026-11-21) ----
test('hero is marked paused while the loop is stopped (orbs pause too)', () => {
  const h = netHarness();
  const net = h.M.startNet(h.canvas, { reduce: false });
  assert.equal(h.hero.classList.contains('is-paused'), false);
  h.ios[0].cb([{ isIntersecting: false }]);
  assert.equal(h.hero.classList.contains('is-paused'), true);
  h.ios[0].cb([{ isIntersecting: true }]);
  assert.equal(h.hero.classList.contains('is-paused'), false);
  net.stop();
  assert.equal(h.hero.classList.contains('is-paused'), true);
});

test('drawing is capped near 60fps on fast displays', () => {
  const h = netHarness();
  h.M.startNet(h.canvas, { reduce: false });
  h.frame(17);
  const drawn = h.calls.arc;
  h.frame(8); // 120Hz の次のフレーム(8ms後)は描かない
  assert.equal(h.calls.arc, drawn, 'skipped');
  h.frame(9); // 合計17ms後は描く
  assert.ok(h.calls.arc > drawn, 'drew again');
});

test('turning on reduced motion mid-visit stops the net and shows all content', () => {
  const h = netHarness();
  const net = h.M.startNet(h.canvas, { reduce: false });
  const root = { documentElement: { classList: classList() } };
  root.documentElement.classList.add('js-motion');
  let onChange = null;
  const mq = { matches: false, addEventListener: (type, fn) => { if (type === 'change') onChange = fn; } };
  h.M.watchReduce(mq, net, root);
  assert.equal(net.isRunning(), true);
  onChange({ matches: true });
  assert.equal(net.isRunning(), false);
  assert.equal(root.documentElement.classList.contains('js-motion'), false);
});
