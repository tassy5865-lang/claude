// ヒーローの「つながる網」とスクロール出現。
// 計算部分(nodeCount/createNodes/stepNodes/linksFor)は画面に依存しないので、テストから直接呼べる。
(function () {
  "use strict";

  const MIN_NODES = 14;
  const MAX_NODES = 44;
  const MAX_SPEED = 0.25; // 1フレームあたりの最大の速さ(px)
  const PULL_RADIUS = 140; // 指・マウスがこの距離以内なら点を引き寄せる
  const PULL_MAX = 0.6; // 1フレームで引き寄せる最大量(px)

  // 画面の広さに応じた点の数(面積の平方根に比例させ、スマホ約20・PC約40)
  function nodeCount(width, height) {
    const n = Math.round(0.04 * Math.sqrt(Math.max(0, width * height)));
    return Math.min(MAX_NODES, Math.max(MIN_NODES, n));
  }

  function createNodes(count, width, height, rand) {
    const nodes = [];
    for (let i = 0; i < count; i++) {
      nodes.push({
        x: rand() * width,
        y: rand() * height,
        vx: (rand() * 2 - 1) * MAX_SPEED,
        vy: (rand() * 2 - 1) * MAX_SPEED,
      });
    }
    return nodes;
  }

  function stepNodes(nodes, width, height, pointer) {
    for (const n of nodes) {
      if (pointer) {
        const dx = pointer.x - n.x;
        const dy = pointer.y - n.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < PULL_RADIUS) {
          const pull = Math.min(PULL_MAX, d * 0.01);
          n.x += (dx / d) * pull;
          n.y += (dy / d) * pull;
        }
      }
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > width) {
        n.vx = -n.vx;
        n.x = Math.min(width, Math.max(0, n.x));
      }
      if (n.y < 0 || n.y > height) {
        n.vy = -n.vy;
        n.y = Math.min(height, Math.max(0, n.y));
      }
    }
  }

  function linksFor(nodes, maxDist) {
    const links = [];
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
        if (d < maxDist) links.push({ a, b, alpha: 1 - d / maxDist });
      }
    }
    return links;
  }

  // ---- ヒーローの網を描く ----
  const LINK_DIST = 170;
  const VIOLET = [123, 92, 255];
  const CYAN = [34, 211, 238];
  function mix(t) {
    const k = Math.min(1, Math.max(0, t));
    return VIOLET.map((v, i) => Math.round(v + (CYAN[i] - v) * k)).join(",");
  }

  // canvas に網を描き、画面外・タブが裏のときは止める。reduce なら止まった1枚だけ描く
  function startNet(canvas, opts) {
    const reduce = !!(opts && opts.reduce);
    const hero = canvas.parentElement;
    const ctx = canvas.getContext && canvas.getContext("2d");
    const idle = { stop() {}, isRunning: () => false };
    if (!ctx || !hero) return idle;

    let w = 0;
    let h = 0;
    let nodes = [];
    let copy = null; // 見出し・本文の範囲(この下の線は弱める)
    let pointer = null;
    let running = false;
    let stopped = false;
    let onScreen = true;
    let rafId = 0;

    function resize() {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nodes = createNodes(nodeCount(w, h), w, h, Math.random);
      const box = canvas.getBoundingClientRect();
      const el = hero.querySelector(".hero-copy");
      const r = el && el.getBoundingClientRect();
      copy = r ? { left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top } : null;
    }

    function underCopy(x, y) {
      return !!copy && x >= copy.left && x <= copy.right && y >= copy.top && y <= copy.bottom;
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (const l of linksFor(nodes, LINK_DIST)) {
        const p = nodes[l.a];
        const q = nodes[l.b];
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        const alpha = l.alpha * 0.45 * (underCopy(mx, my) ? 0.5 : 1);
        ctx.strokeStyle = "rgba(" + mix(mx / w) + "," + alpha.toFixed(3) + ")";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      if (pointer) {
        for (const n of nodes) {
          const d = Math.hypot(n.x - pointer.x, n.y - pointer.y);
          if (d >= PULL_RADIUS) continue;
          ctx.strokeStyle = "rgba(" + mix(n.x / w) + "," + ((1 - d / PULL_RADIUS) * 0.5).toFixed(3) + ")";
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }
      }
      for (const n of nodes) {
        ctx.fillStyle = "rgba(" + mix(n.x / w) + ",0.8)";
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 120Hzなどの画面でも約60回/秒に抑える(動きの速さをそろえ、描画回数も増やさない)
    const MIN_FRAME_MS = 15;
    let last = -Infinity;
    function tick(t) {
      if (!running) return;
      rafId = window.requestAnimationFrame(tick);
      if (t - last < MIN_FRAME_MS) return;
      last = t;
      stepNodes(nodes, w, h, pointer);
      draw();
    }

    // 止まっている間は .hero に is-paused を付け、CSSの光(orb)も止める
    function setPaused(on) {
      if (hero.classList) hero.classList[on ? "add" : "remove"]("is-paused");
    }

    function start() {
      if (running || stopped || reduce || !onScreen || document.visibilityState === "hidden") return;
      running = true;
      setPaused(false);
      last = -Infinity;
      rafId = window.requestAnimationFrame(tick);
    }

    function pause() {
      running = false;
      setPaused(true);
      window.cancelAnimationFrame(rafId);
    }

    resize();
    draw();

    // 画面サイズが変わったら点を作り直す(スマホの回転など)
    const onResize = () => {
      resize();
      if (!running) draw();
    };
    let ro = null;
    if (typeof window.ResizeObserver === "function") {
      ro = new window.ResizeObserver(onResize);
      ro.observe(canvas);
    } else {
      window.addEventListener("resize", onResize);
    }

    if (reduce) return idle;

    hero.addEventListener("pointermove", (e) => {
      const box = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - box.left, y: e.clientY - box.top };
    }, { passive: true });
    hero.addEventListener("pointerleave", () => { pointer = null; }, { passive: true });

    let io = null;
    if (typeof window.IntersectionObserver === "function") {
      io = new window.IntersectionObserver((entries) => {
        onScreen = entries[entries.length - 1].isIntersecting;
        if (onScreen) start();
        else pause();
      });
      io.observe(hero);
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") pause();
      else start();
    });

    start();
    return {
      stop() {
        stopped = true;
        pause();
        if (io) io.disconnect();
        if (ro) ro.disconnect();
      },
      isRunning: () => running,
    };
  }

  // ---- スクロール出現 ----
  const REVEAL_TARGETS = ".section-head, .pain-item, .service-card, .combo-item, .case-feature, .case, .price-card, .scope, .about-body, .flow-step, .faq-item";
  const STAGGER_MS = 70;
  const STAGGER_MAX_MS = 280;

  // 画面に入った要素に is-in を付ける。使えない環境・動きを減らす設定では何もしない(最初から全部見える)
  function setupReveal(root, opts) {
    if ((opts && opts.reduce) || typeof window.IntersectionObserver !== "function") return false;
    const els = Array.prototype.slice.call(root.querySelectorAll(REVEAL_TARGETS));
    const seen = new Map(); // 親ごとの何番目か
    for (const el of els) {
      const i = seen.get(el.parentElement) || 0;
      seen.set(el.parentElement, i + 1);
      if (i > 0) el.style.animationDelay = Math.min(i * STAGGER_MS, STAGGER_MAX_MS) + "ms";
    }
    const io = new window.IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    root.documentElement.classList.add("js-motion");
    els.forEach((el) => io.observe(el));
    return true;
  }

  // 閲覧中に「動きを減らす」がオンになったら、網を止めて出現待ちの要素も全部見せる
  function watchReduce(mq, net, root) {
    if (!mq || typeof mq.addEventListener !== "function") return;
    mq.addEventListener("change", (e) => {
      if (!e.matches) return;
      if (net) net.stop();
      root.documentElement.classList.remove("js-motion");
    });
  }

  window.NexsistMotion = { nodeCount, createNodes, stepNodes, linksFor, startNet, setupReveal, watchReduce };

  document.addEventListener("DOMContentLoaded", () => {
    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const reduce = !!(mq && mq.matches);
    const canvas = document.querySelector(".hero-net");
    const net = canvas ? startNet(canvas, { reduce }) : null;
    setupReveal(document, { reduce });
    if (!reduce) watchReduce(mq, net, document);
  });
})();
