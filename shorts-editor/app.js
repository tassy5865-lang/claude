/* TateCut — 縦型ショート編集スタジオ（ブラウザだけで動作） */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const W = 1080, H = 1920;
const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Noto Sans CJK JP","Yu Gothic","Meiryo",sans-serif';
const cv = $('#cv'), ctx = cv.getContext('2d');
let uidN = 1;
const uid = () => 'c' + (uidN++);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

const state = {
  media: [],            // {id,name,type,url,el,elB,duration,w,h,gain,peaks,rms,transcript}
  clips: [],            // {id,track,mediaId,start,dur,in,...}
  grade: { brightness: 100, contrast: 100, saturate: 100, warmth: 0, vignette: 0 },
  t: 0, playing: false, sel: null, pps: 60,
};
const mediaById = id => state.media.find(m => m.id === id);
const clipsOf = tr => state.clips.filter(c => c.track === tr).sort((a, b) => a.start - b.start);
const totalDur = () => state.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);
const selClip = () => state.clips.find(c => c.id === state.sel);
let dirty = true;

/* ---------- 履歴 ---------- */
const hist = { undo: [], redo: [] };
const snap = () => JSON.stringify({ clips: state.clips, grade: state.grade });
function commit() { hist.undo.push(snap()); if (hist.undo.length > 80) hist.undo.shift(); hist.redo = []; }
function restore(s) { const o = JSON.parse(s); state.clips = o.clips; state.grade = o.grade; refresh(); }
function undo() { if (!hist.undo.length) return; hist.redo.push(snap()); restore(hist.undo.pop()); }
function redo() { if (!hist.redo.length) return; hist.undo.push(snap()); restore(hist.redo.pop()); }

/* ---------- ログ ---------- */
function log(msg, err) {
  const d = document.createElement('div');
  if (err) d.className = 'err';
  d.innerHTML = `<b>${new Date().toTimeString().slice(0, 8)}</b>`;
  d.append(msg);
  $('#log').append(d); $('#log').scrollTop = 1e9;
}

/* ---------- 音声 ---------- */
let actx, master, adest;
function audio() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); adest = actx.createMediaStreamDestination();
    master.connect(actx.destination); master.connect(adest);
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function analyse(m, buf) {
  const ch = buf.getChannelData(0), hop = Math.floor(buf.sampleRate / 100), n = Math.floor(ch.length / hop);
  m.peaks = new Float32Array(n); m.rms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let pk = 0, sq = 0;
    for (let j = i * hop, e = j + hop; j < e; j++) { const v = ch[j]; sq += v * v; const a = v < 0 ? -v : v; if (a > pk) pk = a; }
    m.peaks[i] = pk; m.rms[i] = Math.sqrt(sq / hop);
  }
  m.pcm = buf;
}

/* ---------- 素材 ---------- */
const once = (el, ev) => new Promise((res, rej) => { el.addEventListener(ev, res, { once: true }); el.addEventListener('error', () => rej(new Error('読み込めない形式です')), { once: true }); });
async function addFiles(files) {
  audio();
  for (const f of files) {
    const type = f.type.startsWith('video') ? 'video' : f.type.startsWith('image') ? 'image' : f.type.startsWith('audio') ? 'audio' : null;
    if (!type) { log(`${f.name}: 対応していない種類です`, true); continue; }
    const m = { id: 'm' + (uidN++), name: f.name, type, url: URL.createObjectURL(f) };
    try {
      if (type === 'image') {
        m.el = new Image(); m.el.src = m.url; await m.el.decode();
        m.w = m.el.naturalWidth; m.h = m.el.naturalHeight; m.duration = Infinity;
      } else {
        const el = document.createElement(type); el.src = m.url; el.preload = 'auto'; el.playsInline = true;
        $('#pool').append(el); m.el = el;
        await once(el, 'loadedmetadata');
        if (type === 'video') {
          m.w = el.videoWidth; m.h = el.videoHeight;
          if (el.readyState < 2) await once(el, 'loadeddata');
          el.addEventListener('seeked', () => dirty = true);
        }
        m.duration = isFinite(el.duration) ? el.duration : 0;
        m.gain = actx.createGain(); actx.createMediaElementSource(el).connect(m.gain); m.gain.connect(master);
        try { analyse(m, await actx.decodeAudioData(await f.arrayBuffer())); if (!m.duration) m.duration = m.pcm.duration; }
        catch (e) { if (type === 'audio') throw e; }  // 音声トラックなしの動画
      }
    } catch (e) { log(`${f.name}: ${e.message}`, true); continue; }
    state.media.push(m);
    log(`素材を追加: ${f.name}`);
    if (type === 'video' && !clipsOf('a').length) addClip(m, 'a');
    if (type === 'audio' && !clipsOf('music').length) addClip(m, 'music');
  }
  renderMedia(); refresh();
}
function elB(m) {  // 差し込み用の無音コピー
  if (!m.elB) { const v = document.createElement('video'); v.src = m.url; v.muted = true; v.playsInline = true; v.preload = 'auto'; $('#pool').append(v); v.addEventListener('seeked', () => dirty = true); m.elB = v; }
  return m.elB;
}
function addClip(m, track) {
  commit();
  const c = { id: uid(), track, mediaId: m.id, in: 0, scale: 1, x: 0, y: 0, fx: 'none', vol: 1, b: 100, c: 100, s: 100 };
  c.dur = m.type === 'image' ? 3 : m.duration;
  if (track === 'a') c.start = totalA();
  else if (track === 'music') { c.start = 0; c.vol = 0.25; if (totalA()) c.dur = Math.min(c.dur, totalA()); }
  else { c.start = state.t; c.dur = Math.min(c.dur, 3); c.mode = 'inset'; }
  state.clips.push(c); state.sel = c.id; refresh();
}
const totalA = () => clipsOf('a').reduce((m, c) => Math.max(m, c.start + c.dur), 0);
function renderMedia() {
  const box = $('#mediaList'); box.innerHTML = '';
  for (const m of state.media) {
    const card = document.createElement('div'); card.className = 'media-card';
    if (m.type === 'audio') card.innerHTML = '<div class="aud">♪</div>';
    else {
      const th = document.createElement('canvas'); th.width = 320; th.height = 200;
      const g = th.getContext('2d'), s = Math.max(320 / m.w, 200 / m.h);
      const draw = () => g.drawImage(m.el, (320 - m.w * s) / 2, (200 - m.h * s) / 2, m.w * s, m.h * s);
      draw(); if (m.type === 'video') m.el.addEventListener('seeked', draw, { once: true });
      card.append(th);
    }
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = m.name; card.append(nm);
    const acts = document.createElement('div'); acts.className = 'acts';
    const tracks = m.type === 'audio' ? [['music', '＋音楽']] : [['a', '＋メイン'], ['b', '＋差し込み']];
    for (const [tr, label] of tracks) { const b = document.createElement('button'); b.textContent = label; b.onclick = () => addClip(m, tr); acts.append(b); }
    card.append(acts); box.append(card);
  }
}

/* ---------- 描画 ---------- */
function gradeFilter(c) {
  const g = state.grade;
  return `brightness(${g.brightness * (c.b ?? 100) / 100}%) contrast(${g.contrast * (c.c ?? 100) / 100}%) saturate(${g.saturate * (c.s ?? 100) / 100}%)`;
}
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function drawCover(src, sw, sh, c, extra, R, radius) {
  const s = Math.max(R.w / sw, R.h / sh) * (c.scale || 1) * extra, dw = sw * s, dh = sh * s;
  ctx.save(); rrect(R.x, R.y, R.w, R.h, radius || 0); ctx.clip();
  ctx.filter = gradeFilter(c);
  ctx.drawImage(src, R.x + (R.w - dw) / 2 + (c.x || 0) * R.w, R.y + (R.h - dh) / 2 + (c.y || 0) * R.h, dw, dh);
  ctx.restore();
}
const srcOf = (c, m) => m.type === 'image' ? m.el : (c.track === 'b' ? elB(m) : m.el);
const fxScale = (c, t) => c.fx === 'punch' ? 1.14 : c.fx === 'slow' ? 1 + 0.08 * clamp((t - c.start) / c.dur, 0, 1) : 1;
function wrap(text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const ch of para) { if (line && ctx.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch; }
    out.push(line);
  }
  return out;
}
function drawText(c, t) {
  const k = clamp((t - c.start) / 0.12, 0, 1), ease = 1 - (1 - k) * (1 - k);
  const size = c.size || 80, lh = size * 1.3;
  ctx.save();
  ctx.font = `900 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const lines = wrap(c.text, W * 0.86), cy = (c.y ?? 0.72) * H;
  ctx.translate(W / 2, cy); ctx.scale(0.86 + 0.14 * ease, 0.86 + 0.14 * ease); ctx.globalAlpha = ease;
  lines.forEach((ln, i) => {
    const y = (i - (lines.length - 1) / 2) * lh, w = ctx.measureText(ln).width;
    const p = c.preset || 'stroke', col = c.color;
    if (p === 'box' || p === 'dark' || p === 'title') {
      ctx.fillStyle = p === 'box' ? (col || '#ff7a59') : p === 'dark' ? 'rgba(0,0,0,.72)' : '#fff';
      rrect(-w / 2 - size * .32, y - lh / 2 + 2, w + size * .64, lh - 4, size * .2); ctx.fill();
      ctx.fillStyle = p === 'title' ? (col || '#111') : '#fff';
    } else {
      ctx.strokeStyle = '#000'; ctx.lineWidth = size * .2; ctx.strokeText(ln, 0, y);
      ctx.fillStyle = col || (p === 'pop' ? '#ffe14a' : '#fff');
    }
    ctx.fillText(ln, 0, y + size * .04);
  });
  ctx.restore();
}
function render(t) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const full = { x: 0, y: 0, w: W, h: H };
  for (const c of state.clips) {
    if (c.track !== 'a' || t < c.start || t >= c.start + c.dur) continue;
    const m = mediaById(c.mediaId); if (m) drawCover(srcOf(c, m), m.w, m.h, c, fxScale(c, t), full);
  }
  for (const c of clipsOf('b')) {
    if (t < c.start || t >= c.start + c.dur) continue;
    const m = mediaById(c.mediaId); if (!m) continue;
    const a = clamp(Math.min(t - c.start, c.start + c.dur - t) / 0.15, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    if (c.mode === 'full') drawCover(srcOf(c, m), m.w, m.h, c, fxScale(c, t), full);
    else {
      const R = { x: W * .08, y: H * .09 + (1 - a) * 40, w: W * .84, h: W * .84 * .66 };
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 40; ctx.fillStyle = '#fff';
      rrect(R.x - 8, R.y - 8, R.w + 16, R.h + 16, 44); ctx.fill(); ctx.shadowBlur = 0;
      drawCover(srcOf(c, m), m.w, m.h, c, fxScale(c, t), R, 36);
    }
    ctx.restore();
  }
  const g = state.grade;
  if (g.warmth) {
    ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = Math.abs(g.warmth) / 100;
    ctx.fillStyle = g.warmth > 0 ? '#ff9a2e' : '#2e8bff'; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  if (g.vignette) {
    const gr = ctx.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .62);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${g.vignette / 100})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  for (const c of state.clips) if (c.track === 'text' && t >= c.start && t < c.start + c.dur) drawText(c, t);
  if (!state.clips.length) {
    ctx.fillStyle = '#8e96a8'; ctx.font = `600 46px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('「素材」から動画を追加してください', W / 2, H / 2);
  }
}

/* ---------- 再生エンジン ---------- */
let last = 0, rec = null, onExportEnd = null;
function syncEl(el, want, tol) {
  if (Math.abs(el.currentTime - want) > tol) { try { el.currentTime = want; } catch (e) {} }
  if (state.playing && el.paused) el.play().catch(() => {});
}
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const t = state.t, used = new Set();
  let stalled = false;
  for (const c of state.clips) {
    if (c.track === 'text' || t < c.start || t >= c.start + c.dur) continue;
    const m = mediaById(c.mediaId); if (!m || m.type === 'image') continue;
    const el = c.track === 'b' ? elB(m) : m.el;
    used.add(el);
    syncEl(el, c.in + (t - c.start), state.playing ? 0.25 : 0.03);
    if (c.track !== 'b' && m.gain) m.gain.gain.value = c.vol ?? 1;
    if (c.track === 'a' && (el.seeking || el.readyState < 2)) stalled = true;
  }
  for (const m of state.media) for (const el of [m.el, m.elB]) if (el && el.pause && !used.has(el) && !el.paused) el.pause();
  if (!state.playing) for (const el of used) if (!el.paused) el.pause();
  if (rec) { if (stalled && rec.state === 'recording') rec.pause(); else if (!stalled && rec.state === 'paused') rec.resume(); }
  if (state.playing || dirty) { render(state.t); dirty = false; }
  if (state.playing && !stalled) {
    state.t += dt;
    if (state.t >= totalDur()) { state.t = totalDur(); setPlaying(false); if (onExportEnd) onExportEnd(); }
    updatePlayhead(true);
  }
  requestAnimationFrame(tick);
}
function setPlaying(p) {
  if (p && !state.clips.length) return;
  if (p) { audio(); if (state.t >= totalDur() - 0.05) state.t = 0; }
  state.playing = p; $('#btnPlay').textContent = p ? '⏸' : '▶'; dirty = true;
}
function seek(t) { state.t = clamp(t, 0, Math.max(0, totalDur())); dirty = true; updatePlayhead(); }
function updatePlayhead(follow) {
  const x = state.t * state.pps;
  $('#playhead').style.transform = `translateX(${x}px)`;
  $('#tc').textContent = `${fmt(state.t)} / ${fmt(totalDur())}`;
  const sc = $('#tlScroll');
  if (follow && (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 40)) sc.scrollLeft = x - 40;
}

/* ---------- タイムライン ---------- */
function repackA() { let t = 0; for (const c of clipsOf('a')) { c.start = t; t += c.dur; } }
function label(c) {
  if (c.track === 'text') return c.text.replace(/\n/g, ' ');
  const m = mediaById(c.mediaId); return (c.fx === 'punch' ? '⤢ ' : '') + (m ? m.name : '');
}
function renderTimeline() {
  const pps = state.pps, total = Math.max(totalDur(), 8);
  $('#tlInner').style.width = (total * pps + 240) + 'px';
  const ruler = $('#ruler'); ruler.innerHTML = '';
  const step = pps >= 90 ? 0.5 : pps >= 40 ? 1 : pps >= 20 ? 2 : 5;
  for (let s = 0; s <= total + 2; s += step) { const sp = document.createElement('span'); sp.style.left = s * pps + 'px'; sp.textContent = fmt(s).replace(/\.0$/, ''); ruler.append(sp); }
  for (const row of $$('.track')) {
    row.innerHTML = '';
    for (const c of clipsOf(row.dataset.track)) {
      const d = document.createElement('div'); d.className = 'clip' + (c.id === state.sel ? ' sel' : '');
      d.dataset.id = c.id; d.style.left = c.start * pps + 'px'; d.style.width = Math.max(4, c.dur * pps - 1) + 'px';
      const m = mediaById(c.mediaId);
      if (m && m.peaks) {
        const w = Math.max(1, Math.min(4000, Math.round(c.dur * pps))), k = document.createElement('canvas'); k.width = w; k.height = 32;
        const g = k.getContext('2d'); g.fillStyle = '#0b1020';
        for (let x = 0; x < w; x++) {
          const i0 = Math.floor((c.in + x / w * c.dur) * 100), i1 = Math.max(i0 + 1, Math.floor((c.in + (x + 1) / w * c.dur) * 100));
          let pk = 0; for (let i = i0; i < i1 && i < m.peaks.length; i++) if (m.peaks[i] > pk) pk = m.peaks[i];
          const h = Math.max(1, pk * 30); g.fillRect(x, 16 - h / 2, 1, h);
        }
        d.append(k);
      }
      const i = document.createElement('i'); i.textContent = label(c); d.append(i);
      for (const side of ['l', 'r']) { const h = document.createElement('span'); h.className = 'h ' + side; h.dataset.side = side; d.append(h); }
      row.append(d);
    }
  }
  updatePlayhead();
}
function tlTime(e) { const r = $('#tlInner').getBoundingClientRect(); return Math.max(0, (e.clientX - r.left) / state.pps); }
$('#tlInner').addEventListener('pointerdown', e => {
  const cl = e.target.closest('.clip');
  if (!cl) {
    seek(tlTime(e)); if (!e.target.closest('.ruler')) select(null);
    const mv = ev => seek(tlTime(ev));
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); return;
  }
  e.preventDefault();
  const c = state.clips.find(x => x.id === cl.dataset.id), side = e.target.dataset.side;
  const before = snap(), o = { start: c.start, dur: c.dur, in: c.in }, x0 = e.clientX, m = mediaById(c.mediaId);
  const maxDur = m && isFinite(m.duration) ? m.duration : Infinity;
  let moved = false; select(c.id);
  const mv = ev => {
    const d = (ev.clientX - x0) / state.pps; if (Math.abs(ev.clientX - x0) > 3) moved = true; if (!moved) return;
    if (side === 'l') {
      const lo = m ? -o.in : -o.start, dd = clamp(d, c.track === 'a' ? lo : Math.max(lo, -o.start), o.dur - 0.1);
      c.dur = o.dur - dd; if (m) c.in = o.in + dd; if (c.track !== 'a') c.start = o.start + dd;
    } else if (side === 'r') c.dur = clamp(o.dur + d, 0.1, maxDur - c.in);
    else c.start = Math.max(0, o.start + d);
    cl.style.left = c.start * state.pps + 'px'; cl.style.width = c.dur * state.pps + 'px'; dirty = true;
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    if (!moved) return;
    if (c.track === 'a') { if (!side) c.start += (c.start > o.start ? c.dur : 0) * 0.5; repackA(); }
    hist.undo.push(before); hist.redo = []; refresh();
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});
function select(id) { state.sel = id; $$('.clip').forEach(d => d.classList.toggle('sel', d.dataset.id === id)); renderInspector(); }
function split() {
  const t = state.t, hit = state.clips.filter(c => t > c.start + 0.05 && t < c.start + c.dur - 0.05);
  const targets = selClip() && hit.includes(selClip()) ? [selClip()] : hit.filter(c => c.track === 'a');
  if (!targets.length) return;
  commit();
  for (const c of targets) {
    const n = { ...c, id: uid(), start: t, dur: c.start + c.dur - t };
    if (c.mediaId) n.in = c.in + (t - c.start);
    c.dur = t - c.start; state.clips.push(n);
  }
  refresh();
}
function del() {
  const c = selClip(); if (!c) return;
  commit(); state.clips = state.clips.filter(x => x !== c);
  if (c.track === 'a') {  // 後ろを詰める
    for (const x of state.clips) if (x.track !== 'a' && x.start >= c.start + c.dur - 0.01) x.start -= c.dur;
    repackA();
  }
  state.sel = null; refresh(); seek(state.t);
}

/* ---------- 無音カット ---------- */
function speechSegs(m, o) {
  const th = 10 ** (o.th / 20), r = m.rms, segs = [];
  let s = -1;
  for (let i = 0; i <= r.length; i++) {
    const loud = i < r.length && r[i] > th;
    if (loud && s < 0) s = i; else if (!loud && s >= 0) { segs.push([s / 100, i / 100]); s = -1; }
  }
  const merged = [];
  for (const g of segs) { const p = merged[merged.length - 1]; if (p && g[0] - p[1] < o.sil) p[1] = g[1]; else merged.push([...g]); }
  const out = [];
  for (const g of merged) {
    if (g[1] - g[0] < 0.12) continue;
    const a = Math.max(0, g[0] - o.pad), b = Math.min(m.duration, g[1] + o.pad), p = out[out.length - 1];
    if (p && a <= p[1]) p[1] = b; else out.push([a, b]);
  }
  return out;
}
function cutOpts() { return { th: +$('#sTh').value, sil: +$('#sSil').value, pad: +$('#sPad').value }; }
function autoCut() {
  const src = clipsOf('a'), before = totalA(), o = cutOpts(), next = [];
  if (!src.some(c => mediaById(c.mediaId)?.rms)) { log('無音カット: 音声付きのメイン動画がありません', true); return false; }
  commit();
  for (const c of src) {
    const m = mediaById(c.mediaId);
    if (!m || !m.rms) { next.push(c); continue; }
    for (const [a, b] of speechSegs(m, o)) {
      const s = Math.max(a, c.in), e = Math.min(b, c.in + c.dur);
      if (e - s > 0.1) next.push({ ...c, id: uid(), in: s, dur: e - s });
    }
  }
  if (!next.length) { hist.undo.pop(); log('無音カット: 音声が検出されませんでした。しきい値を下げてください', true); return false; }
  state.clips = state.clips.filter(c => c.track !== 'a').concat(next);
  let t = 0; for (const c of next) { c.start = t; t += c.dur; }
  state.sel = null; refresh(); seek(Math.min(state.t, t));
  log(`無音カット: ${src.length}→${next.length}クリップ、${(before - t).toFixed(1)}秒短縮（${fmt(before)}→${fmt(t)}）`);
  return true;
}

/* ---------- テロップ ---------- */
function pieces(text, max) {
  text = text.replace(/\s+/g, ' ').trim(); if (!text) return [];
  let words;
  if (window.Intl && Intl.Segmenter) words = [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(text)].map(s => s.segment);
  else words = [...text];
  const out = []; let cur = '';
  const push = () => { const s = cur.trim().replace(/[、。,.]+$/, ''); if (s) out.push(s); cur = ''; };
  for (const w of words) {
    if (/^[、。！？!?,.]+$/.test(w)) { cur += w; if (/[。！？!?]/.test(w) || cur.length >= max * 0.6) push(); continue; }
    if (cur && (cur + w).trim().length > max) push();
    cur += w;
    while (cur.length > max) { const rest = cur.slice(max); cur = cur.slice(0, max); push(); cur = rest; }
  }
  push(); return out;
}
function capStyle() { const p = $('#capPreset').value; return { preset: p, size: p === 'title' ? 96 : 84, y: p === 'title' ? 0.16 : 0.72 }; }
function putCaptions(list) {  // list: [{text,start,end}] タイムライン時間
  state.clips = state.clips.filter(c => !(c.track === 'text' && c.auto));
  const st = capStyle();
  list.sort((a, b) => a.start - b.start);
  list.forEach((p, i) => {
    const end = Math.min(p.end, list[i + 1] ? list[i + 1].start : Infinity);
    if (end - p.start > 0.08) state.clips.push({ id: uid(), track: 'text', auto: true, text: p.text, start: p.start, dur: end - p.start, ...st });
  });
}
function mapSpan(mediaId, s, e) {  // 素材時間 → タイムライン時間
  let a = null, b = null;
  for (const c of clipsOf('a')) {
    if (c.mediaId !== mediaId) continue;
    const os = Math.max(s, c.in), oe = Math.min(e, c.in + c.dur);
    if (oe - os <= 0.02) continue;
    if (a === null) a = c.start + os - c.in; b = c.start + oe - c.in;
  }
  return a === null ? null : [a, b];
}
function captionsFromTranscripts() {
  const max = +$('#sMax').value, list = [];
  for (const m of state.media) for (const ch of m.transcript || []) {
    const ps = pieces(ch.text, max), n = ps.reduce((s, p) => s + p.length, 0); let acc = 0;
    for (const p of ps) {
      const s = ch.s + (ch.e - ch.s) * acc / n; acc += p.length; const e = ch.s + (ch.e - ch.s) * acc / n;
      const span = mapSpan(m.id, s, e); if (span) list.push({ text: p, start: span[0], end: span[1] });
    }
  }
  if (!list.length) return 0;
  commit(); putCaptions(list); refresh(); return list.length;
}
function captionsFromScript() {
  const max = +$('#sMax').value, total = totalA();
  const ps = $('#script').value.split('\n').flatMap(l => pieces(l, max));
  if (!ps.length || !total) { log('台本テロップ: 台本とメイン動画が必要です', true); return; }
  const n = ps.reduce((s, p) => s + p.length, 0); let acc = 0;
  const list = ps.map(p => { const s = total * acc / n; acc += p.length; return { text: p, start: s, end: total * acc / n }; });
  commit(); putCaptions(list); refresh(); log(`台本テロップ: ${list.length}枚を配置`);
}

/* 文字起こし（Whisper をブラウザ内で実行。音声は外部に送らない） */
const WORKER_SRC = `
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
let asr, cur;
self.onmessage = async (e) => {
  const { audio, model, language } = e.data;
  try {
    if (cur !== model) {
      asr = await pipeline('automatic-speech-recognition', model, { progress_callback: p => { if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, pct: p.progress }); } });
      cur = model;
    }
    self.postMessage({ type: 'status', text: '音声を解析中…' });
    const out = await asr(audio, { language, task: 'transcribe', return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
    self.postMessage({ type: 'result', chunks: out.chunks || [] });
  } catch (err) { self.postMessage({ type: 'error', message: String(err && err.message || err) }); }
};`;
let worker;
async function resample16k(buf) {
  const off = new OfflineAudioContext(1, Math.ceil(buf.duration * 16000), 16000), src = off.createBufferSource();
  src.buffer = buf; src.connect(off.destination); src.start();
  return (await off.startRendering()).getChannelData(0);
}
function transcribeMedia(m) {
  return new Promise(async (res, rej) => {
    if (!worker) worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })), { type: 'module' });
    let lastPct = -20;
    worker.onerror = e => rej(new Error(e.message || 'モデルの読み込みに失敗しました（ネット接続を確認してください）'));
    worker.onmessage = e => {
      const d = e.data;
      if (d.type === 'progress') { if (d.pct - lastPct >= 20 || d.pct < lastPct) { lastPct = d.pct; log(`モデル取得中 ${d.file} ${Math.round(d.pct)}%`); } }
      else if (d.type === 'status') log(d.text);
      else if (d.type === 'error') rej(new Error(d.message));
      else res(d.chunks.filter(c => c.text.trim()).map(c => ({ text: c.text.trim(), s: c.timestamp[0] ?? 0, e: c.timestamp[1] ?? m.duration })));
    };
    const audio16 = await resample16k(m.pcm);
    worker.postMessage({ audio: audio16, model: $('#asrModel').value, language: $('#asrLang').value }, [audio16.buffer]);
  });
}
async function transcribeAll() {
  const ids = [...new Set(clipsOf('a').map(c => c.mediaId))], targets = ids.map(mediaById).filter(m => m && m.pcm);
  if (!targets.length) { log('文字起こし: 音声付きのメイン動画がありません', true); return false; }
  $('#btnAsr').disabled = true;
  try {
    for (const m of targets) { log(`文字起こし開始: ${m.name}`); m.transcript = await transcribeMedia(m); log(`文字起こし完了: ${m.transcript.length}区間`); }
    log(`テロップを${captionsFromTranscripts()}枚配置`); return true;
  } catch (e) { log('文字起こし失敗: ' + e.message, true); return false; }
  finally { $('#btnAsr').disabled = false; }
}

/* ---------- カラー ---------- */
const GRADE_DEF = { brightness: ['明るさ', 50, 150], contrast: ['コントラスト', 50, 150], saturate: ['彩度', 0, 200], warmth: ['色温度', -50, 50], vignette: ['周辺減光', 0, 80] };
const GRADE_PRESETS = {
  'ナチュラル': { brightness: 100, contrast: 100, saturate: 100, warmth: 0, vignette: 0 },
  'シネマ': { brightness: 98, contrast: 114, saturate: 92, warmth: 10, vignette: 32 },
  'ビビッド': { brightness: 103, contrast: 108, saturate: 135, warmth: 4, vignette: 0 },
  '夜景': { brightness: 94, contrast: 122, saturate: 118, warmth: -18, vignette: 44 },
  'モノクロ': { brightness: 100, contrast: 118, saturate: 0, warmth: 0, vignette: 20 },
};
function renderGrade() {
  const box = $('#gradeSliders'); box.innerHTML = '';
  for (const [k, [name, min, max]] of Object.entries(GRADE_DEF)) {
    const l = document.createElement('label'); l.className = 'row';
    l.innerHTML = `${name} <output>${state.grade[k]}</output><input type="range" min="${min}" max="${max}" value="${state.grade[k]}">`;
    const inp = $('input', l);
    inp.addEventListener('pointerdown', commit);
    inp.oninput = () => { state.grade[k] = +inp.value; $('output', l).textContent = inp.value; dirty = true; };
    box.append(l);
  }
}
for (const name of Object.keys(GRADE_PRESETS)) {
  const b = document.createElement('button'); b.textContent = name;
  b.onclick = () => { commit(); state.grade = { ...GRADE_PRESETS[name] }; refresh(); };
  $('#gradePresets').append(b);
}

/* ---------- インスペクタ ---------- */
function renderInspector() {
  const box = $('#inspector'), c = selClip();
  if (!c) { box.innerHTML = '<p class="hint">タイムラインのクリップを選ぶと、ここで編集できます。</p>'; return; }
  const F = [];
  const range = (k, name, min, max, step, def) => F.push(`<label class="row">${name} <output>${c[k] ?? def}</output><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${c[k] ?? def}"></label>`);
  const sel = (k, name, opts) => F.push(`<label class="row">${name}<select data-k="${k}">${opts.map(([v, n]) => `<option value="${v}"${c[k] === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`);
  if (c.track === 'text') {
    F.push(`<label class="row">文字<textarea data-k="text" rows="2"></textarea></label>`);
    sel('preset', 'スタイル', [['stroke', '白文字＋黒フチ'], ['pop', '黄色ポップ'], ['box', 'カラー帯'], ['dark', '黒帯'], ['title', 'タイトル']]);
    range('size', '大きさ', 40, 160, 2, 84); range('y', '縦位置', 0.05, 0.95, 0.01, 0.72);
    F.push(`<label class="row">色<input type="color" data-k="color" value="${c.color || '#ffffff'}" style="height:34px;padding:2px"></label>`);
  } else if (c.track === 'music') range('vol', '音量', 0, 1, 0.01, 0.25);
  else {
    const m = mediaById(c.mediaId);
    if (c.track === 'b') sel('mode', '表示', [['inset', 'カード（上部に差し込み）'], ['full', '全画面']]);
    sel('fx', '動き', [['none', 'なし'], ['punch', 'パンチズーム'], ['slow', 'ゆっくりズーム']]);
    range('scale', '拡大', 1, 3, 0.01, 1); range('x', '左右', -0.5, 0.5, 0.01, 0); range('y', '上下', -0.5, 0.5, 0.01, 0);
    range('b', '明るさ', 50, 150, 1, 100); range('c', 'コントラスト', 50, 150, 1, 100); range('s', '彩度', 0, 200, 1, 100);
    if (c.track === 'a' && m && m.type === 'video') range('vol', '音量', 0, 1, 0.01, 1);
  }
  box.innerHTML = F.join('');
  const ta = $('textarea[data-k=text]', box); if (ta) ta.value = c.text;
  for (const inp of $$('[data-k]', box)) {
    const k = inp.dataset.k;
    inp.addEventListener(inp.type === 'range' ? 'pointerdown' : 'focus', commit);
    inp.addEventListener('input', () => {
      c[k] = inp.type === 'range' ? +inp.value : inp.value;
      const o = inp.parentElement.querySelector('output'); if (o) o.textContent = inp.value;
      dirty = true;
      if (k === 'text' || k === 'fx') { const i = $(`.clip[data-id="${c.id}"] i`); if (i) i.textContent = label(c); }
    });
  }
}

/* ---------- 投稿文 ---------- */
const LIMITS = { ig: [2200, 30, 'Instagram'], tt: [2200, 30, 'TikTok'], yt: [100, 15, 'YouTube（タイトル）'], x: [140, 5, 'X'] };
function countPost() {
  const v = $('#postText').value, [max, maxTag] = LIMITS[$('#platform').value], tags = (v.match(/[#＃][^\s#＃]+/g) || []).length;
  const len = [...v].length, el = $('#postCount');
  el.textContent = `${len} / ${max}文字　ハッシュタグ ${tags} / ${maxTag}`;
  el.classList.toggle('over', len > max || tags > maxTag);
  try { localStorage.setItem('tatecut.post', v); } catch (e) {}
}
function keywords() {
  const manual = $('#postKeys').value.split(/[,、\s]+/).filter(Boolean);
  const text = clipsOf('text').map(c => c.text).join(' '), freq = new Map();
  if (window.Intl && Intl.Segmenter) for (const s of new Intl.Segmenter('ja', { granularity: 'word' }).segment(text)) {
    const w = s.segment;
    if (s.isWordLike && w.length >= 2 && /[一-龠ァ-ヶA-Za-z]/.test(w) && !/^[ぁ-ん]+$/.test(w)) freq.set(w, (freq.get(w) || 0) + 1);
  }
  const auto = [...freq].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).map(x => x[0]);
  return [...new Set([...manual, ...auto])];
}
function draftPost() {
  const caps = clipsOf('text').map(c => c.text.replace(/\n/g, ''));
  if (!caps.length) { log('投稿文: 先にテロップを作成してください', true); return false; }
  const p = $('#platform').value, tags = keywords().slice(0, p === 'x' ? 3 : 8).map(k => '#' + k).join(' ');
  const srcText = state.media.flatMap(m => (m.transcript || []).map(c => c.text)).join('') || $('#script').value;
  const sentences = srcText.split(/\n|(?<=[。！？!?])/).map(s => s.trim().replace(/。$/, '')).filter(Boolean);
  const hook = sentences.length > 1 ? sentences[0] : caps[0];
  const lines = (sentences.length > 1 ? sentences.slice(1) : caps.slice(1)).slice(0, 5);
  let out;
  if (p === 'yt') out = `${hook} ${tags.split(' ').slice(0, 2).join(' ')}`.slice(0, 100);
  else if (p === 'x') out = `${hook}\n\n${lines.slice(0, 2).join('\n')}\n\n${tags}`;
  else out = `${hook}\n\n${lines.map(l => '・' + l).join('\n')}\n\n保存してあとで見返してね。\n感想はコメントで教えてください。\n\n${tags}`;
  $('#postText').value = out; countPost(); log('投稿文の下書きを作成'); return true;
}
function tidyTags() {
  const ta = $('#postText'), found = ta.value.match(/[#＃][^\s#＃]+/g) || [];
  const all = [...new Set([...found.map(t => t.replace('＃', '#')), ...$('#postKeys').value.split(/[,、\s]+/).filter(Boolean).map(k => '#' + k.replace(/^[#＃]/, ''))])];
  const body = ta.value.replace(/[#＃][^\s#＃]+/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  ta.value = body + (all.length ? '\n\n' + all.slice(0, LIMITS[$('#platform').value][1]).join(' ') : ''); countPost();
}

/* ---------- 書き出し ---------- */
function pickMime() {
  for (const t of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  return null;
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.textContent = `⬇ ${name}（${(blob.size / 1e6).toFixed(1)}MB）`;
  a.style.cssText = 'display:block;margin-top:8px;color:#4fd1c5';
  $('#downloads').prepend(a); a.click();
}
async function exportVideo() {
  const mime = pickMime(), st = $('#exportStatus');
  if (!mime || !cv.captureStream) { st.textContent = 'このブラウザは動画の書き出しに対応していません。Chrome か Safari の最新版をお使いください。'; return; }
  if (!totalDur()) { st.textContent = '書き出すクリップがありません。'; return; }
  audio(); setPlaying(false); seek(0);
  $('#btnExport').disabled = true;
  await new Promise(r => setTimeout(r, 400));
  const stream = cv.captureStream(30);
  adest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const chunks = []; rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const timer = setInterval(() => st.textContent = `書き出し中… ${Math.round(state.t / totalDur() * 100)}%`, 300);
  const done = new Promise(r => rec.onstop = r);
  onExportEnd = () => { onExportEnd = null; setTimeout(() => rec.state !== 'inactive' && rec.stop(), 150); };
  rec.start(500); setPlaying(true);
  await done; clearInterval(timer); rec = null; stream.getVideoTracks().forEach(t => t.stop());
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  download(new Blob(chunks, { type: mime.split(';')[0] }), `tatecut-${Date.now()}.${ext}`);
  st.textContent = `書き出し完了（${ext.toUpperCase()}）`; $('#btnExport').disabled = false; log('動画を書き出しました');
}

/* ---------- おまかせ編集 ---------- */
async function autoEdit() {
  showTab('auto');
  if (!clipsOf('a').length) { log('おまかせ編集: 先に「素材」から動画を追加してください', true); return; }
  $('#btnAuto').disabled = true; setPlaying(false);
  log('── おまかせ編集を開始 ──');
  if ($('#aCut').checked) autoCut();
  if ($('#aAsr').checked) { if (!await transcribeAll()) log('→ テロップは「台本から流し込み」でも作成できます'); }
  if ($('#aZoom').checked) { commit(); clipsOf('a').forEach((c, i) => c.fx = i % 2 ? 'punch' : 'none'); log('パンチズーム: カットごとに交互に適用'); }
  if ($('#aGrade').checked) { commit(); state.grade = { ...GRADE_PRESETS['シネマ'] }; log('カラー補正: シネマ'); }
  if ($('#aPost').checked && clipsOf('text').length) draftPost();
  refresh(); seek(0);
  log('── 完了。再生して確認してください ──');
  $('#btnAuto').disabled = false;
}

/* ---------- UI 配線 ---------- */
function refresh() { renderTimeline(); renderInspector(); renderGrade(); dirty = true; }
function showTab(name) {
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  $$('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === name));
}
$('#tabs').onclick = e => e.target.dataset.tab && showTab(e.target.dataset.tab);
$('#file').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
const drop = $('#drop');
addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
addEventListener('dragleave', () => drop.classList.remove('over'));
addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
$('#btnPlay').onclick = () => setPlaying(!state.playing);
$('#btnStart').onclick = () => seek(0);
$('#btnSplit').onclick = split; $('#btnDel').onclick = del;
$('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
$('#btnAuto').onclick = autoEdit; $('#btnCut').onclick = autoCut;
$('#btnAsr').onclick = () => { showTab('auto'); transcribeAll(); };
$('#btnScript').onclick = captionsFromScript;
$('#btnCapAll').onclick = () => { commit(); const st = capStyle(); clipsOf('text').forEach(c => Object.assign(c, st)); refresh(); };
$('#btnAddText').onclick = () => {
  commit(); const c = { id: uid(), track: 'text', text: 'テロップ', start: state.t, dur: 2, ...capStyle() };
  state.clips.push(c); state.sel = c.id; refresh(); showTab('adjust');
};
$('#btnDraft').onclick = draftPost; $('#btnTags').onclick = tidyTags;
$('#btnCopy').onclick = async () => { try { await navigator.clipboard.writeText($('#postText').value); $('#btnCopy').textContent = 'コピーしました'; } catch (e) { $('#postText').select(); document.execCommand('copy'); } setTimeout(() => $('#btnCopy').textContent = 'コピー', 1500); };
$('#postText').oninput = countPost; $('#platform').onchange = countPost;
$('#btnExport').onclick = exportVideo;
$('#btnFrame').onclick = () => { render(state.t); cv.toBlob(b => download(b, `tatecut-frame-${Date.now()}.png`), 'image/png'); };
$('#sZoom').oninput = e => { state.pps = +e.target.value; renderTimeline(); };
const bindOut = (s, o, f) => { const u = () => $(o).textContent = f($(s).value); $(s).addEventListener('input', u); u(); };
bindOut('#sTh', '#oTh', v => v + ' dB'); bindOut('#sSil', '#oSil', v => (+v).toFixed(2) + ' 秒');
bindOut('#sPad', '#oPad', v => (+v).toFixed(2) + ' 秒'); bindOut('#sMax', '#oMax', v => v + ' 文字');
addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!state.playing); }
  else if (e.key === 's' || e.key === 'S') split();
  else if (e.key === 'Delete' || e.key === 'Backspace') del();
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (e.key === 'ArrowLeft') seek(state.t - (e.shiftKey ? 1 : 1 / 30));
  else if (e.key === 'ArrowRight') seek(state.t + (e.shiftKey ? 1 : 1 / 30));
});
try { $('#postText').value = localStorage.getItem('tatecut.post') || ''; } catch (e) {}
if (innerWidth < 820) state.pps = 40;
countPost(); refresh(); requestAnimationFrame(t => { last = t; tick(t); });
window.__tatecut = { state, seek, setPlaying, autoCut, captionsFromScript, exportVideo, addFiles };
