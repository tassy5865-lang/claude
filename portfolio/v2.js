/* 自己紹介HP/v2 と同じ見せ方の補助演出。本文は演出なしでも読める。 */
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);

  /* 進捗バー */
  const progress = document.createElement('div');
  progress.className = 'progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.prepend(progress);

  /* ゴースト文字 */
  const ghosts = [];
  [['#works', 'Works'], ['#linkout', 'Profile'], ['#cta', 'Contact']].forEach(([sel, word]) => {
    const host = $(sel);
    if (!host) return;
    const g = document.createElement('span');
    g.className = 'ghost';
    g.setAttribute('aria-hidden', 'true');
    g.textContent = word;
    host.prepend(g);
    ghosts.push(g);
  });

  const nav = $('#nav');
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.setProperty('--p', max > 0 ? scrollY / max : 0);
    if (nav) nav.classList.toggle('scrolled', scrollY > 10);
    if (reduce) return;
    ghosts.forEach(g => {
      const r = g.parentElement.getBoundingClientRect();
      const k = (innerHeight - r.top) / (innerHeight + r.height);
      g.style.setProperty('--gx', `${(k - 0.5) * -80}px`);
    });
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  /* ヒーロー: 点で描いた波 */
  const hero = $('#hero');
  if (!hero) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'pwave';
  canvas.setAttribute('aria-hidden', 'true');
  hero.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const small = matchMedia('(max-width:860px)').matches;
  const COLS = small ? 40 : 84, ROWS = small ? 16 : 26;
  let w = 0, h = 0, on = true;
  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const draw = t => {
    ctx.clearRect(0, 0, w, h);
    for (let j = 0; j < ROWS; j++) {
      const d = j / (ROWS - 1);
      const rowY = h * 0.5 + d * d * h * 0.56;
      const spread = w * (0.7 + 1.5 * d);
      const amp = 6 + 26 * d;
      const r = 0.6 + 1.5 * d;
      for (let i = 0; i < COLS; i++) {
        const u = i / (COLS - 1) - 0.5;
        const k = Math.sin(i * 0.32 + t * 0.9 + j * 0.25) + Math.sin(j * 0.5 - t * 0.6 + i * 0.11);
        const x = w / 2 + u * spread;
        if (x < -4 || x > w + 4) continue;
        const a = (0.1 + 0.5 * d) * (0.55 + 0.225 * (k + 2));
        ctx.fillStyle = k > 1.25 ? `rgba(226,160,120,${a})` : `rgba(143,179,222,${a})`;
        ctx.beginPath();
        ctx.arc(x, rowY - k * amp, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  const loop = t => {
    if (!on) return;
    draw(t / 1000);
    requestAnimationFrame(loop);
  };
  size();
  addEventListener('resize', () => { size(); if (reduce) draw(0); });
  if (reduce) {
    draw(0);
  } else {
    new IntersectionObserver(([en]) => {
      const was = on; on = en.isIntersecting;
      if (on && !was) requestAnimationFrame(loop);
    }).observe(canvas);
    requestAnimationFrame(loop);
  }
})();
