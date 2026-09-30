(() => {
  /* one heartbeat traced from 心電図.mp4 (P-QRS-T), baseline 0, R peak 1 */
  const ECG = [-0.012,-0.011,-0.009,-0.009,-0.009,-0.01,-0.011,-0.009,-0.009,-0.009,-0.008,-0.005,-0.005,-0.005,-0.005,-0.004,-0.001,0,0.005,0.012,0.025,0.043,0.05,0.06,0.073,0.081,0.086,0.09,0.103,0.111,0.118,0.124,0.124,0.126,0.129,0.124,0.121,0.116,0.112,0.101,0.101,0.099,0.089,0.074,0.061,0.051,0.036,0.024,0.019,0.012,0.005,0.001,-0.002,-0.004,-0.003,-0.005,-0.005,-0.005,-0.005,-0.005,-0.005,-0.006,-0.009,-0.009,-0.009,-0.01,-0.012,-0.014,-0.024,-0.047,-0.065,-0.085,-0.098,-0.108,-0.121,-0.126,-0.04,0.209,0.346,0.456,0.601,0.706,0.851,0.929,0.992,1,0.99,0.932,0.746,0.518,0.21,-0.227,-0.225,-0.2,-0.172,-0.15,-0.125,-0.09,-0.056,-0.046,-0.03,-0.017,-0.015,-0.013,-0.013,-0.011,-0.009,-0.01,-0.012,-0.011,-0.009,-0.009,-0.009,-0.01,-0.012,-0.012,-0.011,-0.009,-0.009,-0.01,-0.012,-0.012,-0.012,-0.012,-0.011,-0.008,-0.005,-0.004,-0.001,-0,0.005,0.01,0.012,0.019,0.023,0.029,0.035,0.043,0.053,0.065,0.071,0.073,0.078,0.081,0.086,0.09,0.103,0.111,0.118,0.131,0.151,0.162,0.164,0.169,0.171,0.179,0.189,0.204,0.219,0.234,0.249,0.26,0.262,0.27,0.277,0.285,0.29,0.295,0.305,0.305,0.305,0.305,0.305,0.303,0.296,0.288,0.283,0.281,0.273,0.268,0.265,0.258,0.252,0.25,0.243,0.233,0.218,0.207,0.2,0.184,0.18,0.167,0.162,0.157,0.14,0.115,0.091,0.081,0.064,0.041,0.022,0.009,-0.001,-0.003,-0.006,-0.008,-0.006,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.008,-0.007,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009,-0.009];

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* header / progress / ghost drift / timeline rail */
  const header = $('#header');
  const progress = $('#progress');
  const ghosts = $$('.ghost');
  const timeline = $('.timeline');
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const y = scrollY;
    header.classList.toggle('scrolled', y > 10);
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.setProperty('--p', max > 0 ? y / max : 0);
    if (reduce) return;
    ghosts.forEach(g => {
      const r = g.parentElement.getBoundingClientRect();
      const k = (innerHeight - r.top) / (innerHeight + r.height);
      g.style.setProperty('--gx', `${(k - 0.5) * -80}px`);
    });
    if (timeline) {
      const r = timeline.getBoundingClientRect();
      const k = Math.min(1, Math.max(0, (innerHeight * 0.75 - r.top) / r.height));
      timeline.style.setProperty('--tp', k);
    }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  /* mobile menu */
  const btn = $('#menu-btn');
  const nav = $('#nav');
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? '閉じる' : 'メニュー';
  });
  nav.addEventListener('click', e => {
    if (e.target.closest('a') && nav.classList.contains('open')) btn.click();
  });

  /* entry effects (content is never hidden) */
  const risers = $$('.work, .services article, .flow li, .gate-body, .cta-inner > *, .info, .scope-lists > div, .notes li, .faq details');
  const markers = $$('.eyebrow, .section-title, .cta h2, .gate h2, .flow, .timeline li');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    risers.forEach((el, i) => {
      el.classList.add('rise');
      el.style.transitionDelay = `${(i % 3) * 90}ms`;
      io.observe(el);
    });
    markers.forEach(el => io.observe(el));
  } else {
    markers.forEach(el => el.classList.add('in'));
  }

  /* hero: particle wave (a dotted surface seen in perspective) */
  const pwave = $('#pwave');
  if (pwave) {
    const ctx = pwave.getContext('2d');
    const small = matchMedia('(max-width:860px)').matches;
    const COLS = small ? 40 : 84, ROWS = small ? 16 : 26;
    let w = 0, h = 0, on = true;
    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = pwave.clientWidth; h = pwave.clientHeight;
      pwave.width = w * dpr; pwave.height = h * dpr;
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
      }).observe(pwave);
      requestAnimationFrame(loop);
    }
  }

  /* waveform canvases (monitor-style sweep) */
  const wave = (canvas, opts) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, x = 0, last = null, on = true;
    const buf = [];
    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buf.length = 0; x = 0; last = null;
    };
    const shape = p => {
      const f = (((p % 1) + 1) % 1) * ECG.length;
      const i = Math.floor(f);
      const a = ECG[i], b = ECG[(i + 1) % ECG.length];
      return a + (b - a) * (f - i);
    };
    const drawStatic = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = opts.color; ctx.lineWidth = opts.width;
      ctx.beginPath();
      for (let px = 0; px <= w; px += 2) {
        const y = h * 0.72 - shape(px / opts.period) * h * 0.56;
        px ? ctx.lineTo(px, y) : ctx.moveTo(px, y);
      }
      ctx.stroke();
    };
    let prevT = null;
    const frame = t => {
      if (!on) { prevT = null; return; }
      const dt = prevT === null ? 16.7 : Math.min(t - prevT, 250);
      prevT = t;
      const steps = Math.max(1, Math.round(dt / 16.7 * opts.speed));
      for (let s = 0; s < steps; s++) {
        const y = h * 0.72 - shape(x / opts.period) * h * 0.56;
        buf[x % w] = y;
        x++;
      }
      ctx.clearRect(0, 0, w, h);
      const head = x % w;
      ctx.lineWidth = opts.width;
      ctx.strokeStyle = opts.color;
      ctx.beginPath();
      let started = false;
      for (let px = 0; px < w; px++) {
        if (buf[px] === undefined || (px > head && px < head + 36)) { started = false; continue; }
        started ? ctx.lineTo(px, buf[px]) : (ctx.moveTo(px, buf[px]), started = true);
      }
      ctx.stroke();
      ctx.fillStyle = opts.dot;
      ctx.beginPath();
      ctx.arc(head, buf[head - 1] ?? h * 0.72, 3, 0, Math.PI * 2);
      ctx.fill();
      requestAnimationFrame(frame);
    };
    size();
    addEventListener('resize', () => { size(); if (reduce) drawStatic(); });
    if (reduce) return drawStatic();
    new IntersectionObserver(([en]) => {
      const was = on; on = en.isIntersecting;
      if (on && !was) requestAnimationFrame(frame);
    }).observe(canvas);
    requestAnimationFrame(frame);
  };
  wave($('#cta-wave'), { color: 'rgba(143,179,222,.35)', dot: '#8fb3de', width: 1.2, period: 320, speed: 2 });
})();
