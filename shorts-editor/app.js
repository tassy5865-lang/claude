/* TateCut — ブラウザだけで動く動画編集スタジオ */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const cv = $('#cv'), ctx = cv.getContext('2d');
let W = 1080, H = 1920;
const FONTS = {
  gothic: ['ゴシック', '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Noto Sans CJK JP","Yu Gothic","Meiryo",sans-serif'],
  mincho: ['明朝', '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP","Noto Serif CJK JP",serif'],
  maru: ['丸ゴシック', '"Hiragino Maru Gothic ProN","Kosugi Maru","Yu Gothic",sans-serif'],
  impact: ['インパクト', 'Impact,"Arial Black","Hiragino Sans",sans-serif'],
};
const DEF = { x: 0, y: 0, scale: 100, rot: 0, opacity: 100, vol: 100, speed: 1, cropL: 0, cropR: 0, cropT: 0, cropB: 0, radius: 0, blur: 0,
  b: 100, c: 100, s: 100, hue: 0, fadeIn: 0, fadeOut: 0, tinType: 'none', toutType: 'none', tinDur: 0.4, toutDur: 0.4, fit: 'cover', blend: 'source-over',
  size: 84, strokeW: 0.2, stroke: '#000000', color: '#ffffff', bg: '#000000', bgA: 0, font: 'gothic', solid: '#1f6feb' };
const KF = ['x', 'y', 'scale', 'rot', 'opacity', 'vol'];
const TEXT_PRESETS = {
  stroke: ['白文字＋黒フチ', { color: '#ffffff', stroke: '#000000', strokeW: 0.2, bgA: 0 }],
  pop: ['黄色ポップ', { color: '#ffe14a', stroke: '#000000', strokeW: 0.22, bgA: 0 }],
  box: ['カラー帯', { color: '#ffffff', strokeW: 0, bg: '#ff7a59', bgA: 1 }],
  dark: ['黒帯', { color: '#ffffff', strokeW: 0, bg: '#000000', bgA: 0.72 }],
  title: ['タイトル', { color: '#111111', strokeW: 0, bg: '#ffffff', bgA: 1, size: 96, y: -34 }],
};
let uidN = 1;
const uid = () => 'c' + (uidN++);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const g = (c, k) => c[k] ?? DEF[k];

const state = {
  media: [],
  seq: { w: 1080, h: 1920, fps: 30 },
  tracks: [{ id: 'v3', type: 'v', name: 'V3' }, { id: 'v2', type: 'v', name: 'V2' }, { id: 'v1', type: 'v', name: 'V1' }, { id: 'a1', type: 'a', name: 'A1' }, { id: 'a2', type: 'a', name: 'A2' }],
  clips: [], markers: [], inPt: null, outPt: null,
  grade: { brightness: 100, contrast: 100, saturate: 100, warmth: 0, tint: 0, vignette: 0 },
  t: 0, playing: false, sel: null, pps: 60, tool: 'select', snap: true,
};
const mediaById = id => state.media.find(m => m.id === id);
const trackById = id => state.tracks.find(t => t.id === id);
const clipsOn = id => state.clips.filter(c => c.trackId === id).sort((a, b) => a.start - b.start);
const textClips = () => state.clips.filter(c => c.kind === 'text').sort((a, b) => a.start - b.start);
const mainClips = () => clipsOn('v1');
const totalDur = () => state.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);
const totalMain = () => mainClips().reduce((m, c) => Math.max(m, c.start + c.dur), 0);
const selClip = () => state.clips.find(c => c.id === state.sel);
const lt = c => clamp(state.t - c.start, 0, c.dur);
let dirty = true;

/* ---------- キーフレーム ---------- */
function val(c, k, t) {
  const a = c.kf && c.kf[k];
  if (!a || !a.length) return g(c, k);
  if (t <= a[0].t) return a[0].v;
  for (let i = 1; i < a.length; i++) if (t <= a[i].t) { const p = a[i - 1]; return p.v + (a[i].v - p.v) * (t - p.t) / (a[i].t - p.t || 1); }
  return a[a.length - 1].v;
}
const kfAt = (c, k, t) => (c.kf && c.kf[k] || []).findIndex(p => Math.abs(p.t - t) < 0.04);
function setProp(c, k, v) {
  if (KF.includes(k) && c.kf && c.kf[k] && c.kf[k].length) {
    const t = lt(c), i = kfAt(c, k, t);
    if (i >= 0) c.kf[k][i].v = v; else { c.kf[k].push({ t, v }); c.kf[k].sort((a, b) => a.t - b.t); }
  } else c[k] = v;
}
function toggleKf(c, k) {
  commit(); c.kf = c.kf || {}; const a = c.kf[k] = c.kf[k] || [], t = lt(c), i = kfAt(c, k, t);
  if (i >= 0) { const v = a[i].v; a.splice(i, 1); if (!a.length) { delete c.kf[k]; c[k] = v; } }
  else { a.push({ t, v: val(c, k, t) }); a.sort((x, y) => x.t - y.t); }
  refresh();
}
function shiftKf(c, d) { if (c.kf) for (const a of Object.values(c.kf)) for (const p of a) p.t += d; }

/* ---------- 履歴・保存 ---------- */
const hist = { undo: [], redo: [] };
const snap = () => JSON.stringify({ clips: state.clips, grade: state.grade, tracks: state.tracks, markers: state.markers, seq: state.seq, inPt: state.inPt, outPt: state.outPt });
function commit() { hist.undo.push(snap()); if (hist.undo.length > 80) hist.undo.shift(); hist.redo = []; }
function restore(s) { Object.assign(state, JSON.parse(s)); applySeq(); refresh(); }
function undo() { if (!hist.undo.length) return; hist.redo.push(snap()); restore(hist.undo.pop()); }
function redo() { if (!hist.redo.length) return; hist.undo.push(snap()); restore(hist.redo.pop()); }
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('tatecut', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function dbSet(k, v) { const d = await idb(); return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function dbGet(k) { const d = await idb(); return new Promise((res, rej) => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
let saveTimer, ready = false;
function saveSoon() {
  if (!ready) return; clearTimeout(saveTimer);
  saveTimer = setTimeout(() => dbSet('project', { json: snap(), uidN }).then(() => $('#saveStatus').textContent = `自動保存済み ${new Date().toTimeString().slice(0, 8)}（このブラウザ内）`).catch(() => {}), 600);
}
const saveMedia = () => dbSet('media', state.media.map(m => ({ id: m.id, name: m.name, file: m.file })))
  .catch(() => { $('#saveStatus').textContent = '素材を保存できませんでした（容量不足の可能性）。次回は読み込み直しが必要です。'; });

/* ---------- ログ ---------- */
function log(msg, err) {
  const d = document.createElement('div'); if (err) d.className = 'err';
  d.innerHTML = `<b>${new Date().toTimeString().slice(0, 8)}</b>`; d.append(msg);
  $('#log').append(d); $('#log').scrollTop = 1e9;
}

/* ---------- 音声 ---------- */
let actx, master, adest, analyser;
function audio(resume) {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); adest = actx.createMediaStreamDestination(); analyser = actx.createAnalyser(); analyser.fftSize = 1024;
    master.connect(actx.destination); master.connect(adest); master.connect(analyser);
  }
  if (resume && actx.state === 'suspended') actx.resume();
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
async function addFiles(files, restoreIds) {
  audio(!restoreIds);
  for (const [i, f] of files.entries()) {
    const type = f.type.startsWith('video') ? 'video' : f.type.startsWith('image') ? 'image' : f.type.startsWith('audio') ? 'audio' : null;
    if (!type) { log(`${f.name}: 対応していない種類です`, true); continue; }
    const m = { id: restoreIds ? restoreIds[i] : 'm' + (uidN++), name: f.name, type, file: f, url: URL.createObjectURL(f), els: {} };
    try {
      if (type === 'image') {
        m.probe = new Image(); m.probe.src = m.url; await m.probe.decode();
        m.w = m.probe.naturalWidth; m.h = m.probe.naturalHeight; m.duration = Infinity;
      } else {
        if (type === 'video') {
          const el = document.createElement('video'); el.src = m.url; el.muted = true; el.preload = 'auto'; el.playsInline = true;
          $('#pool').append(el); m.probe = el;
          await once(el, 'loadedmetadata'); if (el.readyState < 2) await once(el, 'loadeddata');
          m.w = el.videoWidth; m.h = el.videoHeight; m.duration = isFinite(el.duration) ? el.duration : 0;
        }
        try { analyse(m, await actx.decodeAudioData(await f.arrayBuffer())); if (!m.duration) m.duration = m.pcm.duration; }
        catch (e) { if (type === 'audio') throw new Error('音声を読み込めません'); }
      }
    } catch (e) { log(`${f.name}: ${e.message}`, true); continue; }
    state.media.push(m);
    if (!restoreIds) {
      log(`素材を読み込み: ${f.name}`);
      if (type === 'video' && !mainClips().length) addClip(m, 'main');
    }
  }
  renderMedia(); refresh(); if (!restoreIds) saveMedia();
}
function getEl(m, c) {
  const key = c.trackId + ':' + (par.get(c.id) || 0);
  if (!m.els[key]) {
    const el = document.createElement(m.type === 'video' && c.kind === 'video' ? 'video' : 'audio');
    el.src = m.url; el.preload = 'auto'; el.playsInline = true; $('#pool').append(el);
    el.addEventListener('seeked', () => dirty = true);
    audio(); el._gain = actx.createGain(); actx.createMediaElementSource(el).connect(el._gain); el._gain.connect(master);
    m.els[key] = el;
  }
  return m.els[key];
}
function addTrack(type) {
  const n = state.tracks.filter(t => t.type === type).length + 1, tr = { id: type + Date.now().toString(36) + n, type, name: type.toUpperCase() + n };
  if (type === 'v') state.tracks.unshift(tr); else state.tracks.push(tr);
  return tr;
}
const isFree = (trId, s, d, skip) => !state.clips.some(c => c !== skip && c.trackId === trId && c.start < s + d - 1e-4 && c.start + c.dur > s + 1e-4);
function freeTrack(type, s, d, cands) {
  return cands.find(t => t.type === type && !t.lock && isFree(t.id, s, d)) || addTrack(type);
}
function newClip(kind, trackId, start, dur, extra) { const c = { id: uid(), kind, trackId, start, dur, ...extra }; state.clips.push(c); state.sel = c.id; return c; }
function addClip(m, where) {
  commit();
  const vt = state.tracks.filter(t => t.type === 'v').reverse(), at = state.tracks.filter(t => t.type === 'a');
  if (m.type === 'audio') {
    const s = clipsOn('a1').length ? state.t : 0, d = m.duration;
    newClip('audio', freeTrack('a', s, d, at).id, s, d, { mediaId: m.id, in: 0, vol: clipsOn('a1').length ? 100 : 30 });
  } else {
    const d = m.type === 'image' ? 3 : m.duration;
    if (where === 'main') newClip(m.type, 'v1', totalMain(), d, { mediaId: m.id, in: 0 });
    else newClip(m.type, freeTrack('v', state.t, Math.min(d, 3), vt.slice(1)).id, state.t, Math.min(d, 3), { mediaId: m.id, in: 0, fit: 'contain', scale: 84, y: -22, radius: 36, tinType: 'fade', toutType: 'fade', tinDur: 0.2, toutDur: 0.2, muted: true });
  }
  refresh();
}
function renderMedia() {
  const box = $('#mediaList'); box.innerHTML = '';
  for (const m of state.media) {
    const card = document.createElement('div'); card.className = 'media-card';
    if (m.type === 'audio') card.innerHTML = '<div class="aud">♪</div>';
    else {
      const th = document.createElement('canvas'); th.width = 320; th.height = 200;
      const k = th.getContext('2d'), s = Math.max(320 / m.w, 200 / m.h);
      k.drawImage(m.probe, (320 - m.w * s) / 2, (200 - m.h * s) / 2, m.w * s, m.h * s); card.append(th);
    }
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = m.name; card.append(nm);
    const acts = document.createElement('div'); acts.className = 'acts';
    for (const [w, label] of m.type === 'audio' ? [['a', '＋音声トラック']] : [['main', '＋V1末尾'], ['over', '＋重ねる']]) {
      const b = document.createElement('button'); b.textContent = label; b.onclick = () => addClip(m, w); acts.append(b);
    }
    card.append(acts); box.append(card);
  }
}

/* ---------- 描画 ---------- */
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function wrap(text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const ch of para) { if (line && ctx.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch; }
    out.push(line);
  }
  return out;
}
function drawTextBody(c) {
  const size = g(c, 'size'), lh = size * 1.3;
  ctx.font = `900 ${size}px ${FONTS[g(c, 'font')][1]}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const lines = wrap(c.text, W * 0.88), bgA = g(c, 'bgA'), sw = g(c, 'strokeW'), a0 = ctx.globalAlpha;
  lines.forEach((ln, i) => {
    const y = (i - (lines.length - 1) / 2) * lh, w = ctx.measureText(ln).width;
    if (bgA > 0 && ln) { ctx.globalAlpha = a0 * bgA; ctx.fillStyle = g(c, 'bg'); rrect(-w / 2 - size * .32, y - lh / 2 + 2, w + size * .64, lh - 4, size * .2); ctx.fill(); ctx.globalAlpha = a0; }
    if (c.shadow) { ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = size * .18; ctx.shadowOffsetY = size * .07; }
    if (sw > 0) { ctx.strokeStyle = g(c, 'stroke'); ctx.lineWidth = size * sw; ctx.strokeText(ln, 0, y + size * .04); }
    ctx.fillStyle = g(c, 'color'); ctx.fillText(ln, 0, y + size * .04);
    ctx.shadowColor = 'transparent';
  });
}
function drawClip(c, t) {
  const l = t - c.start, end = c.dur - l, G = state.grade;
  let a = val(c, 'opacity', l) / 100, sc = val(c, 'scale', l) / 100, ox = val(c, 'x', l) / 100 * W, oy = val(c, 'y', l) / 100 * H, blur = g(c, 'blur'), wipe = 1;
  for (const [type, k] of [[g(c, 'tinType'), clamp(l / g(c, 'tinDur'), 0, 1)], [g(c, 'toutType'), clamp(end / g(c, 'toutDur'), 0, 1)]]) {
    if (type === 'none' || k >= 1) continue;
    const e = 1 - (1 - k) * (1 - k);
    if (type === 'fade') a *= k;
    else if (type === 'slideL') ox += (1 - e) * W;
    else if (type === 'slideR') ox -= (1 - e) * W;
    else if (type === 'slideU') oy += (1 - e) * H;
    else if (type === 'zoom') { sc *= 0.7 + 0.3 * e; a *= k; }
    else if (type === 'blur') { blur += (1 - k) * 30; a *= k; }
    else if (type === 'wipe') wipe = Math.min(wipe, k);
  }
  ctx.save();
  ctx.globalAlpha = clamp(a, 0, 1); ctx.globalCompositeOperation = g(c, 'blend');
  if (wipe < 1) { ctx.beginPath(); ctx.rect(0, 0, W * wipe, H); ctx.clip(); }
  ctx.translate(W / 2 + ox, H / 2 + oy); ctx.rotate(val(c, 'rot', l) * Math.PI / 180); ctx.scale(sc * (c.flip ? -1 : 1), sc);
  const f = [];
  if (c.kind !== 'text') f.push(`brightness(${G.brightness * g(c, 'b') / 100}%)`, `contrast(${G.contrast * g(c, 'c') / 100}%)`, `saturate(${G.saturate * g(c, 's') / 100}%)`);
  if (g(c, 'hue')) f.push(`hue-rotate(${g(c, 'hue')}deg)`);
  if (blur) f.push(`blur(${blur}px)`);
  if (f.length) ctx.filter = f.join(' ');
  if (c.kind === 'text') drawTextBody(c);
  else if (c.kind === 'solid') { ctx.fillStyle = g(c, 'solid'); rrect(-W / 2, -H / 2, W, H, g(c, 'radius')); ctx.fill(); }
  else {
    const m = mediaById(c.mediaId);
    if (m) {
      const src = m.type === 'image' ? m.probe : getEl(m, c);
      const base = g(c, 'fit') === 'contain' ? Math.min(W / m.w, H / m.h) : Math.max(W / m.w, H / m.h);
      const sx = m.w * g(c, 'cropL') / 100, sy = m.h * g(c, 'cropT') / 100;
      const sw = Math.max(1, m.w - sx - m.w * g(c, 'cropR') / 100), sh = Math.max(1, m.h - sy - m.h * g(c, 'cropB') / 100);
      const dx = (sx - m.w / 2) * base, dy = (sy - m.h / 2) * base;
      if (g(c, 'radius')) { rrect(dx, dy, sw * base, sh * base, g(c, 'radius')); ctx.clip(); }
      if (m.type === 'image' || src.readyState >= 2) ctx.drawImage(src, sx, sy, sw, sh, dx, dy, sw * base, sh * base);
    }
  }
  ctx.restore();
}
function render(t) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const vt = state.tracks.filter(tr => tr.type === 'v' && !tr.off).reverse(), late = [];
  for (const tr of vt) for (const c of state.clips) {
    if (c.trackId !== tr.id || t < c.start || t >= c.start + c.dur) continue;
    if (c.kind === 'text') late.push(c); else drawClip(c, t);
  }
  const G = state.grade;
  for (const [v, pos, neg] of [[G.warmth, '#ff9a2e', '#2e8bff'], [G.tint, '#ff3ea5', '#35d04f']]) if (v) {
    ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = Math.abs(v) / 100; ctx.fillStyle = v > 0 ? pos : neg; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  if (G.vignette) {
    const R = Math.hypot(W, H) / 2, gr = ctx.createRadialGradient(W / 2, H / 2, R * .45, W / 2, H / 2, R);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${G.vignette / 100})`); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  for (const c of late) drawClip(c, t);
  if (!state.clips.length) { ctx.fillStyle = '#8e96a8'; ctx.font = `600 ${W / 24}px ${FONTS.gothic[1]}`; ctx.textAlign = 'center'; ctx.fillText('「素材」から動画を読み込んでください', W / 2, H / 2); }
}
function fitCanvas() {
  const r = cv.parentElement.getBoundingClientRect(), s = Math.min(r.width / W, r.height / H);
  cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px';
}
function applySeq() {
  W = state.seq.w; H = state.seq.h; if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  $('#seqSize').value = `${W}x${H}`; $('#seqFps').value = state.seq.fps; fitCanvas(); dirty = true;
}
new ResizeObserver(fitCanvas).observe(cv.parentElement);

/* ---------- 再生エンジン ---------- */
let last = 0, rec = null, onExportEnd = null, playEnd = null, lastUiT = -1, scopeAt = 0;
const par = new Map();
function reindex() { par.clear(); for (const tr of state.tracks) clipsOn(tr.id).forEach((c, i) => par.set(c.id, i % 2)); }
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const t = state.t, used = new Set(); let stalled = false;
  const playable = state.clips.filter(c => (c.kind === 'video' || c.kind === 'audio') && !trackById(c.trackId).off && mediaById(c.mediaId));
  for (const c of playable) {
    if (t < c.start || t >= c.start + c.dur) continue;
    const el = getEl(mediaById(c.mediaId), c), sp = g(c, 'speed'), want = c.in + (t - c.start) * sp, l = t - c.start;
    used.add(el);
    if (el.playbackRate !== sp) el.playbackRate = sp;
    if (Math.abs(el.currentTime - want) > (state.playing ? 0.25 * Math.max(1, sp) : 0.03)) { try { el.currentTime = want; } catch (e) {} }
    if (state.playing && el.paused) el.play().catch(() => {});
    const fi = g(c, 'fadeIn'), fo = g(c, 'fadeOut');
    el._gain.gain.value = c.muted ? 0 : val(c, 'vol', l) / 100 * (fi ? clamp(l / fi, 0, 1) : 1) * (fo ? clamp((c.dur - l) / fo, 0, 1) : 1);
    if (c.kind === 'video' && (el.seeking || el.readyState < 2)) stalled = true;
  }
  for (const c of playable) {  // 次のクリップを先読み
    if (c.start <= t || c.start - t > 1.5) continue;
    const el = getEl(mediaById(c.mediaId), c);
    if (!used.has(el)) { used.add(el); if (!el.paused) el.pause(); if (Math.abs(el.currentTime - c.in) > 0.05 && !el.seeking) { try { el.currentTime = c.in; } catch (e) {} } }
  }
  for (const m of state.media) for (const el of Object.values(m.els)) if ((!used.has(el) || !state.playing) && !el.paused) el.pause();
  if (rec) { if (stalled && rec.state === 'recording') rec.pause(); else if (!stalled && rec.state === 'paused') rec.resume(); }
  if (state.playing || dirty) { render(state.t); dirty = false; }
  if (state.playing && !stalled) {
    state.t += dt; const end = playEnd ?? totalDur();
    if (state.t >= end) { state.t = end; setPlaying(false); if (onExportEnd) onExportEnd(); }
    updatePlayhead(true);
  }
  if (state.t !== lastUiT) { lastUiT = state.t; syncKfUI(); }
  drawMeter();
  if (now - scopeAt > 300 && $('[data-pane=color]').classList.contains('on')) { scopeAt = now; drawScope(); }
  requestAnimationFrame(tick);
}
function setPlaying(p) {
  if (p && !state.clips.length) return;
  if (p) { audio(true); if (state.t >= (playEnd ?? totalDur()) - 0.05) state.t = 0; }
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
const mbuf = new Float32Array(1024), mctx = $('#meter').getContext('2d');
function drawMeter() {
  let pk = 0;
  if (analyser && state.playing) { analyser.getFloatTimeDomainData(mbuf); for (const v of mbuf) { const a = Math.abs(v); if (a > pk) pk = a; } }
  const w = clamp((20 * Math.log10(pk || 1e-4) + 48) / 48, 0, 1) * 60;
  mctx.clearRect(0, 0, 60, 14); mctx.fillStyle = pk > 0.98 ? '#ff6b6b' : w > 48 ? '#f2b84b' : '#5fcf8a'; mctx.fillRect(0, 0, w, 14);
}
const sc2 = document.createElement('canvas'); sc2.width = 72; sc2.height = 72; const sctx = sc2.getContext('2d', { willReadFrequently: true });
function drawScope() {
  sctx.drawImage(cv, 0, 0, 72, 72);
  const d = sctx.getImageData(0, 0, 72, 72).data, hs = [0, 1, 2].map(() => new Float32Array(64)), k = $('#scope').getContext('2d');
  for (let i = 0; i < d.length; i += 4) for (let ch = 0; ch < 3; ch++) hs[ch][d[i + ch] >> 2]++;
  k.clearRect(0, 0, 340, 110); k.globalCompositeOperation = 'lighter';
  hs.forEach((h, ch) => {
    const max = Math.max(...h.slice(1, 63), 1);
    k.fillStyle = ['#e5484d', '#3fb950', '#4c8dff'][ch]; k.beginPath(); k.moveTo(0, 110);
    h.forEach((v, i) => k.lineTo(i / 63 * 340, 110 - Math.min(1, v / max) * 104)); k.lineTo(340, 110); k.fill();
  });
  k.globalCompositeOperation = 'source-over';
}

/* ---------- タイムライン ---------- */
function label(c) {
  if (c.kind === 'text') return c.text.replace(/\n/g, ' ');
  if (c.kind === 'solid') return 'カラーマット';
  const m = mediaById(c.mediaId), sp = g(c, 'speed');
  return (m ? m.name : '（素材なし）') + (sp !== 1 ? ` ${sp}x` : '');
}
function renderTimeline() {
  const pps = state.pps, total = Math.max(totalDur(), 8);
  $('#tlInner').style.width = (total * pps + 300) + 'px';
  const ruler = $('#ruler'); ruler.innerHTML = '';
  const step = [0.5, 1, 2, 5, 10, 30, 60].find(s => s * pps >= 56) || 120;
  for (let s = 0; s <= total + 300 / pps; s += step) { const sp = document.createElement('span'); sp.style.left = s * pps + 'px'; sp.textContent = fmt(s).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1'); ruler.append(sp); }
  if (state.inPt !== null || state.outPt !== null) {
    const a = state.inPt ?? 0, b = state.outPt ?? totalDur(), io = document.createElement('div');
    io.className = 'io'; io.style.left = a * pps + 'px'; io.style.width = Math.max(2, (b - a) * pps) + 'px'; ruler.append(io);
  }
  for (const mk of state.markers) { const d = document.createElement('div'); d.className = 'mk'; d.style.left = mk * pps + 'px'; ruler.append(d); }
  const head = $('#tlHead'), rows = $('#rows'); head.innerHTML = ''; rows.innerHTML = '';
  for (const tr of state.tracks) {
    const th = document.createElement('div'); th.className = 'th' + (tr.type === 'a' ? ' audio' : '');
    th.innerHTML = `<b>${tr.name}</b><button data-act="off" class="${tr.off ? 'on' : ''}" title="${tr.type === 'v' ? '表示/非表示' : 'ミュート'}">${tr.type === 'v' ? '👁' : '🔊'}</button><button data-act="lock" class="${tr.lock ? 'on' : ''}" title="ロック">🔒</button>`;
    th.onclick = e => { const a = e.target.dataset.act; if (!a) return; commit(); tr[a] = !tr[a]; refresh(); };
    head.append(th);
    const row = document.createElement('div'); row.className = 'track' + (tr.type === 'a' ? ' audio' : '') + (tr.off ? ' off' : ''); row.dataset.track = tr.id;
    for (const c of clipsOn(tr.id)) row.append(clipEl(c, pps));
    rows.append(row);
  }
  updatePlayhead();
}
function clipEl(c, pps) {
  const d = document.createElement('div'); d.className = `clip k-${c.kind}` + (c.id === state.sel ? ' sel' : '');
  d.dataset.id = c.id; d.style.left = c.start * pps + 'px'; d.style.width = Math.max(4, c.dur * pps - 1) + 'px';
  const m = mediaById(c.mediaId);
  if (m && m.peaks && !c.muted) {
    const w = clamp(Math.round(c.dur * pps), 1, 4000), k = document.createElement('canvas'), sp = g(c, 'speed'); k.width = w; k.height = 32;
    const q = k.getContext('2d'); q.fillStyle = '#0b1020';
    for (let x = 0; x < w; x++) {
      const i0 = Math.floor((c.in + x / w * c.dur * sp) * 100), i1 = Math.max(i0 + 1, Math.floor((c.in + (x + 1) / w * c.dur * sp) * 100));
      let pk = 0; for (let i = i0; i < i1 && i < m.peaks.length; i++) if (m.peaks[i] > pk) pk = m.peaks[i];
      const h = Math.max(1, pk * 30); q.fillRect(x, 16 - h / 2, 1, h);
    }
    d.append(k);
  }
  for (const [type, dur, cls] of [[g(c, 'tinType'), g(c, 'tinDur'), 'tr'], [g(c, 'toutType'), g(c, 'toutDur'), 'tr out']]) if (type !== 'none') {
    const s = document.createElement('span'); s.className = cls; s.style.width = Math.min(dur, c.dur) * pps + 'px'; s.style[cls === 'tr' ? 'left' : 'right'] = 0; d.append(s);
  }
  const i = document.createElement('i'); i.textContent = label(c); d.append(i);
  for (const t of new Set(Object.values(c.kf || {}).flat().map(p => p.t))) if (t >= 0 && t <= c.dur) { const s = document.createElement('span'); s.className = 'kd'; s.style.left = t * pps + 'px'; d.append(s); }
  for (const side of ['l', 'r']) { const h = document.createElement('span'); h.className = 'h ' + side; h.dataset.side = side; d.append(h); }
  return d;
}
function tlTime(e) { const r = $('#tlInner').getBoundingClientRect(); return Math.max(0, (e.clientX - r.left) / state.pps); }
function snapT(t, skip) {
  if (!state.snap) return t;
  let best = t, bd = 8 / state.pps;
  for (const p of [0, state.t, ...state.markers, ...state.clips.filter(c => c !== skip).flatMap(c => [c.start, c.start + c.dur])]) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
  return best;
}
function trimLeft(o, d) { o.start += d; o.dur -= d; if (o.mediaId) o.in += d * g(o, 'speed'); shiftKf(o, -d); }
function cloneClip(c) { const n = JSON.parse(JSON.stringify(c)); n.id = uid(); state.clips.push(n); return n; }
function overwrite(c) {  // 重なった部分は上書き
  const s = c.start, e = s + c.dur;
  for (const o of state.clips.filter(o => o !== c && o.trackId === c.trackId)) {
    const os = o.start, oe = os + o.dur;
    if (oe <= s + 1e-4 || os >= e - 1e-4) continue;
    if (os >= s && oe <= e) o.dur = 0;
    else if (os < s && oe > e) { const n = cloneClip(o); trimLeft(n, e - os); o.dur = s - os; }
    else if (os < s) o.dur = s - os;
    else trimLeft(o, e - os);
  }
  state.clips = state.clips.filter(o => o.dur > 0.03);
}
$('#tlInner').addEventListener('pointerdown', e => {
  const cl = e.target.closest('.clip');
  if (!cl) {
    if (e.pointerType === 'touch' && !e.target.closest('.ruler')) return;  // タッチ時は横スクロールを優先
    seek(snapT(tlTime(e))); if (!e.target.closest('.ruler')) select(null);
    const mv = ev => seek(tlTime(ev));
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); return;
  }
  e.preventDefault();
  const c = state.clips.find(x => x.id === cl.dataset.id);
  if (trackById(c.trackId).lock) return;
  if (state.tool === 'razor') { splitAt(snapT(tlTime(e), c), [c]); return; }
  const side = e.target.dataset.side, before = snap(), o = { start: c.start, dur: c.dur, in: c.in, track: c.trackId }, x0 = e.clientX, m = mediaById(c.mediaId);
  const sp = g(c, 'speed'), maxDur = m && isFinite(m.duration) ? m.duration : Infinity, type = trackById(c.trackId).type;
  let moved = false; select(c.id);
  const mv = ev => {
    const d = (ev.clientX - x0) / state.pps; if (Math.abs(ev.clientX - x0) > 3 || Math.abs(ev.clientY - e.clientY) > 12) moved = true; if (!moved) return;
    if (side === 'l') {
      let dd = snapT(o.start + d, c) - o.start;
      dd = clamp(dd, Math.max(-o.start, m && isFinite(maxDur) ? -o.in / sp : -Infinity), o.dur - 0.1);
      c.start = o.start + dd; c.dur = o.dur - dd; if (m) c.in = o.in + dd * sp;
    } else if (side === 'r') c.dur = clamp(snapT(o.start + o.dur + d, c) - o.start, 0.1, (maxDur - c.in) / sp);
    else {
      let ns = Math.max(0, o.start + d); const s1 = snapT(ns, c);
      if (s1 !== ns) ns = s1; else { const e1 = snapT(ns + c.dur, c); if (e1 !== ns + c.dur) ns = Math.max(0, e1 - c.dur); }
      c.start = ns;
      const row = $$('.track').find(r => { const b = r.getBoundingClientRect(); return ev.clientY >= b.top && ev.clientY < b.bottom; });
      const tr = row && trackById(row.dataset.track);
      if (tr && tr.type === type && !tr.lock && tr.id !== c.trackId) { c.trackId = tr.id; row.append(cl); }
    }
    cl.style.left = c.start * state.pps + 'px'; cl.style.width = c.dur * state.pps + 'px'; dirty = true;
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    if (!moved) return;
    if (side === 'l') shiftKf(c, o.start - c.start);
    overwrite(c); hist.undo.push(before); hist.redo = []; refresh();
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});
function select(id) { state.sel = id; $$('.clip').forEach(d => d.classList.toggle('sel', d.dataset.id === id)); renderInspector(); }

/* ---------- 編集操作 ---------- */
function splitAt(t, targets) {
  targets = targets.filter(c => t > c.start + 0.03 && t < c.start + c.dur - 0.03 && !trackById(c.trackId).lock);
  if (!targets.length) return;
  commit();
  for (const c of targets) {
    const n = cloneClip(c); trimLeft(n, t - c.start); c.dur = t - c.start;
    c.toutType = 'none'; c.fadeOut = 0; n.tinType = 'none'; n.fadeIn = 0;
  }
  refresh();
}
function split() { const s = selClip(), t = state.t; splitAt(t, s && t > s.start && t < s.start + s.dur ? [s] : state.clips.slice()); }
function del(ripple) {
  const c = selClip(); if (!c || trackById(c.trackId).lock) return;
  commit(); state.clips = state.clips.filter(x => x !== c);
  if (ripple) {
    const end = c.start + c.dur;
    for (const x of state.clips) if (x.start >= end - 0.01 && !trackById(x.trackId).lock) x.start -= c.dur;
    state.markers = state.markers.map(m => m >= end ? m - c.dur : m);
  }
  state.sel = null; refresh(); seek(state.t);
}
let clipboard = null;
function copy() { const c = selClip(); if (c) clipboard = JSON.stringify(c); }
function paste() {
  if (!clipboard) return; commit();
  const n = JSON.parse(clipboard); n.id = uid(); n.start = state.t; delete n.auto;
  if (!trackById(n.trackId) || trackById(n.trackId).lock) n.trackId = freeTrack(n.kind === 'audio' ? 'a' : 'v', n.start, n.dur, state.tracks).id;
  state.clips.push(n); overwrite(n); state.sel = n.id; refresh();
}
function toggleMarker() {
  commit(); const i = state.markers.findIndex(m => Math.abs(m - state.t) < 0.05);
  if (i >= 0) state.markers.splice(i, 1); else state.markers.push(state.t);
  renderTimeline(); saveSoon();
}
function detachAudio(c) {
  const m = mediaById(c.mediaId); if (!m || !m.pcm) return;
  commit(); c.muted = true;
  const tr = freeTrack('a', c.start, c.dur, state.tracks);
  state.clips.push({ id: uid(), kind: 'audio', trackId: tr.id, mediaId: m.id, start: c.start, dur: c.dur, in: c.in, speed: g(c, 'speed'), vol: g(c, 'vol') });
  refresh();
}

/* ---------- 無音カット ---------- */
function speechSegs(m, o) {
  const th = 10 ** (o.th / 20), r = m.rms, segs = []; let s = -1;
  for (let i = 0; i <= r.length; i++) {
    const loud = i < r.length && r[i] > th;
    if (loud && s < 0) s = i; else if (!loud && s >= 0) { segs.push([s / 100, i / 100]); s = -1; }
  }
  const merged = [];
  for (const q of segs) { const p = merged[merged.length - 1]; if (p && q[0] - p[1] < o.sil) p[1] = q[1]; else merged.push([...q]); }
  const out = [];
  for (const q of merged) {
    if (q[1] - q[0] < 0.12) continue;
    const a = Math.max(0, q[0] - o.pad), b = Math.min(m.duration, q[1] + o.pad), p = out[out.length - 1];
    if (p && a <= p[1]) p[1] = b; else out.push([a, b]);
  }
  return out;
}
function autoCut() {
  const src = mainClips(), before = totalMain(), o = { th: +$('#sTh').value, sil: +$('#sSil').value, pad: +$('#sPad').value }, next = [];
  if (!src.some(c => c.kind === 'video' && mediaById(c.mediaId)?.rms)) { log('無音カット: V1に音声付きの動画がありません', true); return false; }
  commit();
  for (const c of src) {
    const m = mediaById(c.mediaId), sp = g(c, 'speed');
    if (c.kind !== 'video' || !m || !m.rms) { next.push(c); continue; }
    for (const [a, b] of speechSegs(m, o)) {
      const s = Math.max(a, c.in), e = Math.min(b, c.in + c.dur * sp);
      if (e - s > 0.1) next.push({ ...c, kf: undefined, tinType: 'none', toutType: 'none', id: uid(), in: s, dur: (e - s) / sp });
    }
  }
  if (!next.length) { hist.undo.pop(); log('無音カット: 音声が検出されませんでした。しきい値を下げてください', true); return false; }
  state.clips = state.clips.filter(c => c.trackId !== 'v1').concat(next);
  let t = 0; for (const c of next) { c.start = t; t += c.dur; }
  state.sel = null; refresh(); seek(Math.min(state.t, t));
  log(`無音カット: ${src.length}→${next.length}クリップ、${(before - t).toFixed(1)}秒短縮（${fmt(before)}→${fmt(t)}）`);
  return true;
}

/* ---------- テロップ ---------- */
function pieces(text, max) {
  text = text.replace(/\s+/g, ' ').trim(); if (!text) return [];
  const words = window.Intl && Intl.Segmenter ? [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(text)].map(s => s.segment) : [...text];
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
const capStyle = () => ({ y: 22, size: 84, ...TEXT_PRESETS[$('#capPreset').value][1], preset: $('#capPreset').value });
function putCaptions(list) {
  state.clips = state.clips.filter(c => !(c.kind === 'text' && c.auto));
  const st = capStyle(), top = state.tracks.find(t => t.type === 'v' && !t.lock) || addTrack('v');
  list.sort((a, b) => a.start - b.start);
  list.forEach((p, i) => {
    const end = Math.min(p.end, list[i + 1] ? list[i + 1].start : Infinity);
    if (end - p.start > 0.08) state.clips.push({ id: uid(), kind: 'text', trackId: top.id, auto: true, text: p.text, start: p.start, dur: end - p.start, tinType: 'zoom', tinDur: 0.12, ...st });
  });
}
function mapSpan(mediaId, s, e) {  // 素材時間 → タイムライン時間
  let a = null, b = null;
  for (const c of mainClips()) {
    if (c.mediaId !== mediaId) continue;
    const sp = g(c, 'speed'), os = Math.max(s, c.in), oe = Math.min(e, c.in + c.dur * sp);
    if (oe - os <= 0.02) continue;
    if (a === null) a = c.start + (os - c.in) / sp; b = c.start + (oe - c.in) / sp;
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
  const max = +$('#sMax').value, total = totalMain() || totalDur();
  const ps = $('#script').value.split('\n').flatMap(l => pieces(l, max));
  if (!ps.length || !total) { log('台本テロップ: 台本とV1の動画が必要です', true); return; }
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
    worker.onerror = e => { worker = null; rej(new Error(e.message || 'モデルの読み込みに失敗しました（ネット接続を確認してください）')); };
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
  const targets = [...new Set(mainClips().map(c => c.mediaId))].map(mediaById).filter(m => m && m.pcm);
  if (!targets.length) { log('文字起こし: V1に音声付きの動画がありません', true); return false; }
  $('#btnAsr').disabled = true;
  try {
    for (const m of targets) { log(`文字起こし開始: ${m.name}`); m.transcript = await transcribeMedia(m); log(`文字起こし完了: ${m.transcript.length}区間`); }
    log(`テロップを${captionsFromTranscripts()}枚配置`); return true;
  } catch (e) { log('文字起こし失敗: ' + e.message, true); return false; }
  finally { $('#btnAsr').disabled = false; }
}

/* ---------- カラー ---------- */
const GRADE_DEF = { brightness: ['露光量', 50, 150], contrast: ['コントラスト', 50, 150], saturate: ['彩度', 0, 200], warmth: ['色温度', -50, 50], tint: ['色かぶり補正', -50, 50], vignette: ['ビネット', 0, 80] };
const GRADE_PRESETS = {
  'ナチュラル': { brightness: 100, contrast: 100, saturate: 100, warmth: 0, tint: 0, vignette: 0 },
  'シネマ': { brightness: 98, contrast: 114, saturate: 92, warmth: 10, tint: 0, vignette: 32 },
  'ビビッド': { brightness: 103, contrast: 108, saturate: 135, warmth: 4, tint: 0, vignette: 0 },
  '夜景': { brightness: 94, contrast: 122, saturate: 118, warmth: -18, tint: 6, vignette: 44 },
  'フィルム': { brightness: 102, contrast: 94, saturate: 84, warmth: 14, tint: -4, vignette: 24 },
  'モノクロ': { brightness: 100, contrast: 118, saturate: 0, warmth: 0, tint: 0, vignette: 20 },
};
function renderGrade() {
  const box = $('#gradeSliders'); box.innerHTML = '';
  for (const [k, [name, min, max]] of Object.entries(GRADE_DEF)) {
    const l = document.createElement('label'); l.className = 'row';
    l.innerHTML = `${name} <output>${state.grade[k] ?? 0}</output><input type="range" min="${min}" max="${max}" value="${state.grade[k] ?? 0}">`;
    const inp = $('input', l);
    inp.addEventListener('pointerdown', commit);
    inp.oninput = () => { state.grade[k] = +inp.value; $('output', l).textContent = inp.value; dirty = true; saveSoon(); };
    box.append(l);
  }
}
for (const name of Object.keys(GRADE_PRESETS)) {
  const b = document.createElement('button'); b.textContent = name;
  b.onclick = () => { commit(); state.grade = { ...GRADE_PRESETS[name] }; refresh(); };
  $('#gradePresets').append(b);
}

/* ---------- クリップ設定（エフェクトコントロール） ---------- */
const TRANS = [['none', 'なし'], ['fade', 'フェード（ディゾルブ）'], ['slideL', 'スライド（右から）'], ['slideR', 'スライド（左から）'], ['slideU', 'スライド（下から）'], ['zoom', 'ズーム'], ['wipe', 'ワイプ'], ['blur', 'ぼかし']];
const BLENDS = [['source-over', '通常'], ['screen', 'スクリーン'], ['multiply', '乗算'], ['overlay', 'オーバーレイ'], ['lighter', '加算'], ['darken', '比較（暗）'], ['lighten', '比較（明）'], ['difference', '差の絶対値']];
function renderInspector() {
  const box = $('#inspector'), c = selClip();
  if (!c) { box.innerHTML = '<p class="hint">タイムラインのクリップを選ぶと、位置・スケール・速度・トランジション・色・音量などをここで編集できます。<br>◆ を押すと再生位置にキーフレームを打てます。プレビュー上のドラッグでも位置を動かせます。</p>'; return; }
  const F = [], l = lt(c);
  const R = (k, name, min, max, step, kf) => {
    const v = kf ? +val(c, k, l).toFixed(2) : g(c, k), has = kf && c.kf && c.kf[k] && c.kf[k].length;
    F.push(`<label class="row${kf ? ' kf' : ''}">${name} <output>${v}</output><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v}">${kf ? `<button class="kfb${has ? ' has' : ''}" data-kf="${k}" title="キーフレーム">◆</button>` : ''}</label>`);
  };
  const S = (k, name, opts) => F.push(`<label class="row">${name}<select data-k="${k}">${opts.map(([v, n]) => `<option value="${v}"${g(c, k) === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`);
  const C = (k, name) => F.push(`<label class="row">${name}<input type="color" data-k="${k}" value="${g(c, k)}"></label>`);
  const H = t => F.push(`<h3>${t}</h3>`), G2 = f => { F.push('<div class="grid2">'); f(); F.push('</div>'); };
  const visual = c.kind !== 'audio', media = c.kind === 'video' || c.kind === 'image';
  if (c.kind === 'text') {
    H('テキスト'); F.push(`<label class="row">文字<textarea data-k="text" rows="2"></textarea></label>`);
    F.push(`<div class="chips">${Object.entries(TEXT_PRESETS).map(([k, [n]]) => `<button data-preset="${k}">${n}</button>`).join('')}</div>`);
    S('font', 'フォント', Object.entries(FONTS).map(([k, [n]]) => [k, n])); R('size', '大きさ', 30, 220, 2);
    G2(() => { C('color', '文字色'); C('stroke', 'フチの色'); }); R('strokeW', 'フチの太さ', 0, 0.4, 0.01);
    G2(() => { C('bg', '帯の色'); R('bgA', '帯の濃さ', 0, 1, 0.01); });
    F.push(`<label class="check"><input type="checkbox" data-k="shadow"${c.shadow ? ' checked' : ''}> ドロップシャドウ</label>`);
  }
  if (c.kind === 'solid') { H('カラーマット'); C('solid', '色'); }
  if (visual) {
    H('モーション'); R('x', '位置 X', -100, 100, 0.5, 1); R('y', '位置 Y', -100, 100, 0.5, 1); R('scale', 'スケール', 10, 400, 1, 1); R('rot', '回転', -180, 180, 1, 1);
    H('不透明度'); R('opacity', '不透明度', 0, 100, 1, 1); S('blend', '描画モード', BLENDS);
  }
  if (media) {
    S('fit', 'フレームへの合わせ方', [['cover', '画面を埋める'], ['contain', '全体を収める']]);
    F.push(`<label class="check"><input type="checkbox" data-k="flip"${c.flip ? ' checked' : ''}> 左右反転</label>`);
    H('クロップ'); G2(() => { R('cropL', '左', 0, 90, 1); R('cropR', '右', 0, 90, 1); R('cropT', '上', 0, 90, 1); R('cropB', '下', 0, 90, 1); }); R('radius', '角丸', 0, 200, 2);
  }
  if (c.kind === 'video' || c.kind === 'audio') { H('速度'); R('speed', '速度（倍）', 0.25, 4, 0.05); }
  if (visual) {
    H('トランジション'); G2(() => { S('tinType', '開始', TRANS); R('tinDur', '長さ（秒）', 0.05, 2, 0.05); S('toutType', '終了', TRANS); R('toutDur', '長さ（秒）', 0.05, 2, 0.05); });
    H('エフェクト'); if (c.kind !== 'text') { R('b', '明るさ', 0, 200, 1); R('c', 'コントラスト', 0, 200, 1); R('s', '彩度', 0, 200, 1); }
    R('hue', '色相', -180, 180, 1); R('blur', 'ブラー', 0, 40, 0.5);
  }
  if (c.kind === 'video' || c.kind === 'audio') {
    H('オーディオ'); R('vol', '音量（%）', 0, 200, 1, 1); G2(() => { R('fadeIn', 'フェードイン（秒）', 0, 5, 0.1); R('fadeOut', 'フェードアウト（秒）', 0, 5, 0.1); });
    F.push(`<label class="check"><input type="checkbox" data-k="muted"${c.muted ? ' checked' : ''}> ミュート</label>`);
    if (c.kind === 'video') F.push('<button data-do="detach">音声を別トラックに分離</button>');
  }
  F.push('<h3>クリップ</h3><div class="btnrow"><button data-do="dup">複製</button><button data-do="reset">設定をリセット</button></div>');
  box.innerHTML = F.join('');
  const ta = $('textarea[data-k=text]', box); if (ta) ta.value = c.text;
  for (const inp of $$('[data-k]', box)) {
    const k = inp.dataset.k, isR = inp.type === 'range', isC = inp.type === 'checkbox';
    inp.addEventListener(isR ? 'pointerdown' : isC ? 'click' : 'focus', commit);
    inp.addEventListener('input', () => {
      const v = isC ? inp.checked : isR ? +inp.value : inp.value;
      if (k === 'speed') { const span = c.dur * g(c, 'speed'); c.speed = v; c.dur = span / v; } else setProp(c, k, v);
      const o = inp.parentElement.querySelector('output'); if (o) o.textContent = inp.value;
      dirty = true; saveSoon();
      if (k === 'text') { const i = $(`.clip[data-id="${c.id}"] i`); if (i) i.textContent = label(c); }
    });
    inp.addEventListener('change', () => { if (KF.includes(k) || /^t(in|out)|speed|muted/.test(k)) { if (k === 'speed') overwrite(c); renderTimeline(); syncKfUI(); } });
  }
  for (const b of $$('[data-kf]', box)) b.onclick = e => { e.preventDefault(); toggleKf(c, b.dataset.kf); };
  for (const b of $$('[data-preset]', box)) b.onclick = () => { commit(); Object.assign(c, TEXT_PRESETS[b.dataset.preset][1]); refresh(); };
  for (const b of $$('[data-do]', box)) b.onclick = () => {
    const a = b.dataset.do;
    if (a === 'detach') detachAudio(c);
    else if (a === 'dup') { commit(); const n = cloneClip(c); n.start = c.start + c.dur; overwrite(n); state.sel = n.id; refresh(); }
    else { commit(); for (const k of Object.keys(DEF)) if (!['size', 'color', 'stroke', 'strokeW', 'bg', 'bgA', 'font', 'solid'].includes(k)) delete c[k]; delete c.kf; delete c.flip; refresh(); }
  };
  syncKfUI();
}
function syncKfUI() {  // キーフレーム付きの値を再生位置に追従
  const c = selClip(); if (!c) return; const l = lt(c);
  for (const b of $$('#inspector [data-kf]')) {
    const k = b.dataset.kf, has = c.kf && c.kf[k] && c.kf[k].length;
    b.classList.toggle('at', !!has && kfAt(c, k, l) >= 0);
    if (has) { const inp = $(`#inspector [data-k="${k}"]`); if (document.activeElement !== inp) { const v = +val(c, k, l).toFixed(2); inp.value = v; inp.parentElement.querySelector('output').textContent = v; } }
  }
}
/* プレビュー上のドラッグで位置を動かす */
cv.addEventListener('pointerdown', e => {
  const c = selClip(); if (!c || c.kind === 'audio' || state.playing) return;
  const r = cv.getBoundingClientRect(), l = lt(c), x0 = val(c, 'x', l), y0 = val(c, 'y', l), before = snap(); let moved = false;
  const mv = ev => {
    moved = true; setProp(c, 'x', +(x0 + (ev.clientX - e.clientX) / r.width * 100).toFixed(1)); setProp(c, 'y', +(y0 + (ev.clientY - e.clientY) / r.height * 100).toFixed(1));
    dirty = true; for (const k of ['x', 'y']) { const inp = $(`#inspector [data-k="${k}"]`); if (inp) { inp.value = val(c, k, l); inp.parentElement.querySelector('output').textContent = val(c, k, l); } }
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) { hist.undo.push(before); hist.redo = []; refresh(); } };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});

/* ---------- 投稿文 ---------- */
const LIMITS = { ig: [2200, 30], tt: [2200, 30], yt: [100, 15], x: [140, 5] };
function countPost() {
  const v = $('#postText').value, [max, maxTag] = LIMITS[$('#platform').value], tags = (v.match(/[#＃][^\s#＃]+/g) || []).length;
  const len = [...v].length, el = $('#postCount');
  el.textContent = `${len} / ${max}文字　ハッシュタグ ${tags} / ${maxTag}`;
  el.classList.toggle('over', len > max || tags > maxTag);
  try { localStorage.setItem('tatecut.post', v); } catch (e) {}
}
function keywords() {
  const manual = $('#postKeys').value.split(/[,、\s]+/).filter(Boolean);
  const text = textClips().map(c => c.text).join(' '), freq = new Map();
  if (window.Intl && Intl.Segmenter) for (const s of new Intl.Segmenter('ja', { granularity: 'word' }).segment(text)) {
    const w = s.segment;
    if (s.isWordLike && w.length >= 2 && /[一-龠ァ-ヶA-Za-z]/.test(w) && !/^[ぁ-ん]+$/.test(w)) freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...new Set([...manual, ...[...freq].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).map(x => x[0])])];
}
function draftPost() {
  const caps = textClips().map(c => c.text.replace(/\n/g, ''));
  if (!caps.length) { log('投稿文: 先にテロップを作成してください', true); return false; }
  const p = $('#platform').value, tags = keywords().slice(0, p === 'x' ? 3 : 8).map(k => '#' + k).join(' ');
  const srcText = state.media.flatMap(m => (m.transcript || []).map(c => c.text)).join('') || $('#script').value;
  const sentences = srcText.split(/\n|(?<=[。！？!?])/).map(s => s.trim().replace(/。$/, '')).filter(Boolean);
  const hook = sentences.length > 1 ? sentences[0] : caps[0];
  const lines = (sentences.length > 1 ? sentences.slice(1) : caps.slice(1)).slice(0, 5);
  let out;
  if (p === 'yt') out = `${hook} ${tags.split(' ').slice(0, 2).join(' ')}`.slice(0, 100);
  else if (p === 'x') out = `${hook}\n\n${lines.slice(0, 2).join('\n')}\n\n${tags}`;
  else out = `${hook}\n\n${lines.map(s => '・' + s).join('\n')}\n\n保存してあとで見返してね。\n感想はコメントで教えてください。\n\n${tags}`;
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
  let a = 0, b = totalDur();
  if ($('#expRange').value === 'io') { a = state.inPt ?? 0; b = Math.min(b, state.outPt ?? b); }
  if (b - a < 0.1) { st.textContent = '書き出す範囲がありません。'; return; }
  audio(true); setPlaying(false); seek(a);
  $('#btnExport').disabled = true;
  await new Promise(r => setTimeout(r, 500));
  const stream = cv.captureStream(state.seq.fps);
  adest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const chunks = []; rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: +$('#expRate').value * 1e6 });
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const timer = setInterval(() => st.textContent = `書き出し中… ${Math.round((state.t - a) / (b - a) * 100)}%`, 300);
  const done = new Promise(r => rec.onstop = r);
  onExportEnd = () => { onExportEnd = null; setTimeout(() => rec.state !== 'inactive' && rec.stop(), 150); };
  playEnd = b; rec.start(500); state.t = a; setPlaying(true); state.t = a;
  await done; clearInterval(timer); rec = null; playEnd = null; stream.getVideoTracks().forEach(t => t.stop());
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  download(new Blob(chunks, { type: mime.split(';')[0] }), `tatecut-${Date.now()}.${ext}`);
  st.textContent = `書き出し完了（${ext.toUpperCase()}・${W}×${H}）`; $('#btnExport').disabled = false; log('動画を書き出しました');
}

/* ---------- おまかせ編集 ---------- */
async function autoEdit() {
  showTab('auto');
  if (!mainClips().length) { log('おまかせ編集: 先に「素材」から動画を読み込んでください', true); return; }
  $('#btnAuto').disabled = true; setPlaying(false);
  log('── おまかせ編集を開始 ──');
  if ($('#aCut').checked) autoCut();
  if ($('#aAsr').checked) { if (!await transcribeAll()) log('→ テロップは「台本から流し込み」でも作成できます'); }
  if ($('#aZoom').checked) { commit(); mainClips().forEach((c, i) => c.scale = i % 2 ? 114 : 100); log('パンチズーム: カットごとに交互に適用'); }
  if ($('#aGrade').checked) { commit(); state.grade = { ...GRADE_PRESETS['シネマ'] }; log('カラー補正: シネマ'); }
  if ($('#aPost').checked && textClips().length) draftPost();
  refresh(); seek(0);
  log('── 完了。再生して確認してください ──');
  $('#btnAuto').disabled = false;
}

/* ---------- UI 配線 ---------- */
function refresh() { reindex(); renderTimeline(); renderInspector(); renderGrade(); dirty = true; saveSoon(); }
function showTab(name) {
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  $$('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === name));
}
function setTool(t) { state.tool = t; $$('#tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); document.body.classList.toggle('razor', t === 'razor'); }
function setSnap(v) { state.snap = v; $('#btnSnap').classList.toggle('on', v); }
function setZoom(v) { state.pps = clamp(v, 4, 240); $('#sZoom').value = state.pps; renderTimeline(); }
function setIO(k) { commit(); if (k) state[k] = state.t; else state.inPt = state.outPt = null; if (state.inPt !== null && state.outPt !== null && state.outPt <= state.inPt) state[k === 'inPt' ? 'outPt' : 'inPt'] = null; if (k) $('#expRange').value = 'io'; renderTimeline(); saveSoon(); }
$('#tabs').onclick = e => e.target.dataset.tab && showTab(e.target.dataset.tab);
$('#tools').onclick = e => { const b = e.target.closest('button'); if (b) setTool(b.dataset.tool); };
$('#btnSnap').onclick = () => setSnap(!state.snap);
$('#file').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
const drop = $('#drop');
addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
addEventListener('dragleave', () => drop.classList.remove('over'));
addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
$('#btnPlay').onclick = () => setPlaying(!state.playing);
$('#btnStart').onclick = () => seek(0);
$('#btnSplit').onclick = split; $('#btnDel').onclick = () => del(false); $('#btnRipple').onclick = () => del(true);
$('#btnMarker').onclick = toggleMarker;
$('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
$('#btnAuto').onclick = autoEdit; $('#btnCut').onclick = autoCut;
$('#btnAsr').onclick = () => { showTab('auto'); transcribeAll(); };
$('#btnScript').onclick = captionsFromScript;
$('#btnCapAll').onclick = () => { commit(); const st = capStyle(); textClips().forEach(c => Object.assign(c, st)); refresh(); };
$('#btnAddText').onclick = () => {
  commit(); const tr = freeTrack('v', state.t, 3, state.tracks);
  newClip('text', tr.id, state.t, 3, { text: 'テキスト', ...capStyle(), y: 0 }); refresh(); showTab('clip');
};
$('#btnAddSolid').onclick = () => { commit(); newClip('solid', 'v1', totalMain(), 3, {}); seek(totalMain() - 3); refresh(); showTab('clip'); };
$('#btnAddV').onclick = () => { commit(); addTrack('v'); refresh(); };
$('#btnAddA').onclick = () => { commit(); addTrack('a'); refresh(); };
$('#btnFit').onclick = () => setZoom(($('#tlScroll').clientWidth - 40) / Math.max(totalDur(), 1));
$('#sZoom').oninput = e => setZoom(+e.target.value);
$('#btnDraft').onclick = draftPost; $('#btnTags').onclick = tidyTags;
$('#btnCopy').onclick = async () => { try { await navigator.clipboard.writeText($('#postText').value); $('#btnCopy').textContent = 'コピーしました'; } catch (e) { $('#postText').select(); document.execCommand('copy'); } setTimeout(() => $('#btnCopy').textContent = 'コピー', 1500); };
$('#postText').oninput = countPost; $('#platform').onchange = countPost;
$('#seqSize').onchange = e => { commit(); const [w, h] = e.target.value.split('x').map(Number); state.seq.w = w; state.seq.h = h; applySeq(); saveSoon(); };
$('#seqFps').onchange = e => { commit(); state.seq.fps = +e.target.value; saveSoon(); };
$('#btnIn').onclick = () => setIO('inPt'); $('#btnOut').onclick = () => setIO('outPt'); $('#btnIoClear').onclick = () => setIO(null);
$('#btnExport').onclick = exportVideo;
$('#btnFrame').onclick = () => { render(state.t); cv.toBlob(b => download(b, `tatecut-frame-${Date.now()}.png`), 'image/png'); };
$('#btnNew').onclick = async () => { if (!confirm('読み込んだ素材と編集内容をすべて消去します。よろしいですか？')) return; ready = false; try { await dbSet('project', null); await dbSet('media', []); } catch (e) {} location.reload(); };
for (const [k, [n]] of Object.entries(TEXT_PRESETS)) $('#capPreset').add(new Option(n, k));
const bindOut = (s, o, f) => { const u = () => $(o).textContent = f($(s).value); $(s).addEventListener('input', u); u(); };
bindOut('#sTh', '#oTh', v => v + ' dB'); bindOut('#sSil', '#oSil', v => (+v).toFixed(2) + ' 秒');
bindOut('#sPad', '#oPad', v => (+v).toFixed(2) + ' 秒'); bindOut('#sMax', '#oMax', v => v + ' 文字');
addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey, fr = 1 / state.seq.fps;
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!state.playing); }
  else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && k === 'k') { e.preventDefault(); split(); }
  else if (mod && k === 'c') copy();
  else if (mod && k === 'v') paste();
  else if (mod) return;
  else if (k === 'v') setTool('select'); else if (k === 'c') setTool('razor'); else if (k === 's') setSnap(!state.snap);
  else if (k === 'm') toggleMarker(); else if (k === 'i') setIO('inPt'); else if (k === 'o') setIO('outPt');
  else if (k === 'l') setPlaying(true); else if (k === 'k') setPlaying(false);
  else if (k === 'delete' || k === 'backspace') del(e.shiftKey);
  else if (k === 'arrowleft') seek(state.t - (e.shiftKey ? 1 : fr)); else if (k === 'arrowright') seek(state.t + (e.shiftKey ? 1 : fr));
  else if (k === 'home') seek(0); else if (k === 'end') seek(totalDur());
  else if (k === '+' || k === ';') setZoom(state.pps * 1.3); else if (k === '-') setZoom(state.pps / 1.3);
});
(async function init() {
  try { $('#postText').value = localStorage.getItem('tatecut.post') || ''; } catch (e) {}
  if (innerWidth < 820) state.pps = 40;
  applySeq(); countPost(); refresh(); requestAnimationFrame(t => { last = t; tick(t); });
  try {
    const ms = await dbGet('media'), p = await dbGet('project');
    if (ms && ms.length && p) {
      await addFiles(ms.map(x => x.file), ms.map(x => x.id));
      uidN = Math.max(uidN, p.uidN || 1); restore(p.json); log(`前回のプロジェクトを復元（素材${state.media.length}件）`);
    }
  } catch (e) {}
  ready = true; $('#sZoom').value = state.pps;
})();
window.__tatecut = { state, seek, setPlaying, autoCut, captionsFromScript, exportVideo, addFiles, val, toggleKf, setProp, refresh, split, del };
