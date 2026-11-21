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

  window.NexsistMotion = { nodeCount, createNodes, stepNodes, linksFor };
})();
