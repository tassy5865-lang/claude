/* Opening: closed laptop → lid opens → camera moves into the screen.
   The real page (#page) is pinned onto the laptop screen with a matrix3d homography,
   so there is no second copy of the hero to swap in: at the end of the camera move the
   transform is the identity and the page is simply released. */
(() => {
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const GSAP_URL = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js';

const root = document.documentElement;
const page = document.getElementById('page');
const boot = document.getElementById('boot');
const mode = root.dataset.intro;

let done = false;
let cleanup = () => {};
const finish = () => {
  if (done) return;
  done = true;
  cleanup();
  document.getElementById('intro-gl')?.remove();
  document.getElementById('intro-skip')?.remove();
  if (page) page.style.transform = page.style.opacity = '';
  boot?.remove();
  root.classList.remove('intro-on');
};

/* maps the page rectangle onto four projected screen corners (TL, TR, BL, BR) */
const adj = m => [
  m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
  m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
  m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]];
const mul = (a, b) => {
  const c = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    c[3 * i + j] = a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j];
  }
  return c;
};
const basis = p => {
  const m = [p[0], p[2], p[4], p[1], p[3], p[5], 1, 1, 1];
  const a = adj(m);
  const v = [a[0] * p[6] + a[1] * p[7] + a[2], a[3] * p[6] + a[4] * p[7] + a[5], a[6] * p[6] + a[7] * p[7] + a[8]];
  return mul(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
};
const homography = (src, dst) => {
  const t = mul(basis(dst), adj(basis(src)));
  const k = t[8];
  for (let i = 0; i < 9; i++) t[i] /= k;
  return `matrix3d(${t[0]},${t[3]},0,${t[6]},${t[1]},${t[4]},0,${t[7]},0,0,1,0,${t[2]},${t[5]},0,1)`;
};

async function run() {
  if (!page) return finish();
  try { sessionStorage.setItem('v2intro', '1'); } catch (e) { /* private mode */ }
  history.scrollRestoration = 'manual';
  scrollTo(0, 0);

  const guard = setTimeout(finish, 3500);
  const [THREE, { gsap }] = await Promise.all([import(THREE_URL), import(GSAP_URL)]);
  clearTimeout(guard);
  if (done) return;
  if (!root.classList.contains('intro-on')) return finish();
  window.__introStarted = true;

  const short = mode === 'short';
  /* ?intro=keys : preview only. holds a close-up of the open laptop until Skip */
  const hold = mode === 'keys';
  const lite = matchMedia('(max-width:860px),(pointer:coarse)').matches;
  const rad = THREE.MathUtils.degToRad;

  const canvas = document.createElement('canvas');
  canvas.id = 'intro-gl';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, powerPreference: 'high-performance' });
  renderer.setPixelRatio(lite ? 1 : Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x05080d);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;

  const skip = document.createElement('button');
  skip.id = 'intro-skip';
  skip.type = 'button';
  skip.textContent = 'Skip';
  skip.setAttribute('aria-label', 'オープニングをスキップ');
  document.body.append(skip);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 80);

  /* studio reflections: a warm panel behind-left, a cool one front-right, a soft top */
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x020304);
  const panel = (hex, power, w, h, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(power), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    envScene.add(m);
  };
  panel(0xffc890, 7, 6, 3, -8, 2.5, -6);
  panel(0x9fc4ff, 9, 8, 4, 7, 5, 4);
  panel(0xffffff, 4.5, 10, 10, 0, 10, 0);
  panel(0x5d7fb3, 3, 14, 3, 0, 1.5, 9);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0.04);
  scene.environment = env.texture;

  /* laptop: the screen takes the viewport's aspect (within laptop-like limits) */
  const W = 3.4, TB = 0.075, TL = 0.04, GAP = 0.008, FEET = 0.012, YS = -0.003;
  const sw = W - 0.14;
  const sa = Math.min(1.85, Math.max(1.4, page.clientWidth / page.clientHeight));
  const sh = sw / sa;
  const D = sh + 0.19;
  const z0 = 0.12, zc = z0 + sh / 2;
  const OPEN = rad(105);

  const rrect = (w, h, r, y) => {
    const s = new THREE.Shape(), x = -w / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  };
  /* rounded slab with chamfered edges: width W, depth d (z from -(y+d) to -y), thickness t */
  const slab = (d, t, y) => {
    const b = 0.012;
    return new THREE.ExtrudeGeometry(rrect(W - 2 * b, d - 2 * b, 0.11, y + b), {
      depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: lite ? 2 : 4, curveSegments: lite ? 6 : 16,
    }).rotateX(-Math.PI / 2).translate(0, b, 0);
  };
  const flat = (w, d) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  const std = o => new THREE.MeshStandardMaterial(o);

  const shell = std({ color: 0x41464e, metalness: 0.9, roughness: 0.32 });
  const padMat = std({ color: 0x3a3f47, metalness: 0.9, roughness: 0.2 });
  const wellMat = std({ color: 0x07080a, metalness: 0.2, roughness: 0.7 });
  const keyMat = std({ color: 0x17191d, metalness: 0.1, roughness: 0.45 });
  const hingeMat = std({ color: 0x0c0d10, metalness: 0.6, roughness: 0.45 });
  const glass = std({ color: 0x030405, metalness: 0.4, roughness: 0.12 });
  const BLACK = new THREE.Color(0x010203), DEEP = new THREE.Color(0x0a1524), BRIGHT = new THREE.Color(0x9dbdea);
  const screenMat = new THREE.MeshBasicMaterial({ color: BLACK, toneMapped: false });

  const mark = document.createElement('canvas');
  mark.width = mark.height = 256;
  const mc = mark.getContext('2d');
  mc.fillStyle = '#000'; mc.fillRect(0, 0, 256, 256);
  mc.fillStyle = '#fff';
  mc.font = 'italic 190px "EB Garamond", Georgia, serif';
  mc.textAlign = 'center'; mc.textBaseline = 'middle';
  mc.fillText('N', 116, 136);
  mc.beginPath(); mc.arc(206, 186, 13, 0, Math.PI * 2); mc.fill();
  const logoMat = std({ color: 0xc9d1dc, metalness: 1, roughness: 0.16, alphaMap: new THREE.CanvasTexture(mark), transparent: true });

  /* keyboard: real layout, one rounded keycap per key, backlit legends on a texture */
  const KW = W - 0.62, U = KW / 14.5, KH = 0.006, KGAP = 0.028;
  const ones = n => Array(n).fill(1);
  /* JIS layout. A label is a word, or [main, shifted, kana] */
  const kana = (s, k) => [...s].map((c, i) => [c, '', k[i]]);
  const rows = [
    [0.6, Array(14).fill(14.5 / 14), ['esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', '']],
    [1, [...ones(13), 1.5], [['1', '!', 'ぬ'], ['2', '"', 'ふ'], ['3', '#', 'あ'], ['4', '$', 'う'], ['5', '%', 'え'], ['6', '&', 'お'], ['7', "'", 'や'],
      ['8', '(', 'ゆ'], ['9', ')', 'よ'], ['0', '', 'わ'], ['-', '=', 'ほ'], ['^', '~', 'へ'], ['¥', '|', 'ー'], 'delete']],
    [1, [1.5, ...ones(12)], ['tab', ...kana('QWERTYUIOP', 'たていすかんなにらせ'), ['@', '`', '゛'], ['[', '{', '゜']]],
    [1, [1.75, ...ones(12)], ['control', ...kana('ASDFGHJKL', 'ちとしはきくまのり'), [';', '+', 'れ'], [':', '*', 'け'], [']', '}', 'む']]],
    [1, [2.25, ...ones(11), 1.25], ['shift', ...kana('ZXCVBNM', 'つさそひこみも'), [',', '<', 'ね'], ['.', '>', 'る'], ['/', '?', 'め'], ['_', '', 'ろ'], 'shift']],
    [1, [1, 1, 1.25, 1.25, 3.5, 1.25, 1.25, 1], ['caps', 'option', 'command', '英数', '', 'かな', 'command', 'fn']],
  ];
  const KD = rows.reduce((a, r) => a + r[0], 0) * U;
  const kz0 = -D / 2 + 0.2;
  const keyList = [];
  let kz = kz0;
  {
    /* L-shaped return key spanning the QWERTY and home rows */
    const g = KGAP / 2, z2 = kz0 + 1.6 * U, z3 = z2 + U, xa = -KW / 2 + 13.5 * U, xb = xa + 0.25 * U, xr = KW / 2;
    const shape = new THREE.Shape([[xa + g, z2 + g], [xr - g, z2 + g], [xr - g, z3 + U - g], [xb + g, z3 + U - g], [xb + g, z3 - g], [xa + g, z3 - g]]
      .map(([x, z]) => new THREE.Vector2(x, -z)));
    keyList.push({ shape, x: (xb + xr) / 2, z: z3 + U / 2, w: 0.75 * U - KGAP, d: U - KGAP, label: 'return' });
  }
  rows.forEach(([h, ws, labels]) => {
    let x = -KW / 2;
    ws.forEach((w, i) => {
      keyList.push({ x: x + w * U / 2, z: kz + h * U / 2, w: w * U - KGAP, d: h * U - KGAP, label: labels[i] });
      x += w * U;
    });
    kz += h * U;
  });
  {
    /* inverted-T arrow cluster: half-height keys in the last three units of the bottom row */
    const ax = -KW / 2 + 11.5 * U, az = kz - U, aw = U - KGAP, hd = (U - KGAP - 0.012) / 2;
    const zt = az + KGAP / 2 + hd / 2, zb = az + U - KGAP / 2 - hd / 2;
    keyList.push(
      { x: ax + U * 0.5, z: zb, w: aw, d: hd, label: 'arrow-l' }, { x: ax + U * 1.5, z: zt, w: aw, d: hd, label: 'arrow-u' },
      { x: ax + U * 1.5, z: zb, w: aw, d: hd, label: 'arrow-d' }, { x: ax + U * 2.5, z: zb, w: aw, d: hd, label: 'arrow-r' },
    );
  }
  const CB = 0.0016;
  const capGeo = k => new THREE.ExtrudeGeometry(k.shape || rrect(k.w - 2 * CB, k.d - 2 * CB, 0.013, -k.d / 2 + CB), lite
    ? { depth: KH, bevelEnabled: false, curveSegments: 2 }
    : { depth: KH - 2 * CB, bevelEnabled: true, bevelThickness: CB, bevelSize: CB, bevelSegments: 2, curveSegments: 3 },
  ).rotateX(-Math.PI / 2).translate(k.shape ? 0 : k.x, TB + (lite ? 0 : CB), k.shape ? 0 : k.z);
  const merge = geos => {
    const out = new THREE.BufferGeometry();
    [['position', 3], ['normal', 3], ['uv', 2]].forEach(([name, size]) => {
      const arr = new Float32Array(geos.reduce((a, g) => a + g.attributes[name].array.length, 0));
      let off = 0;
      geos.forEach(g => { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; });
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    });
    geos.forEach(g => g.dispose());
    return out;
  };
  const keyGeo = merge(keyList.map(capGeo));

  const legends = document.createElement('canvas');
  const S = (lite ? 1024 : 2048) / KW, UP = U * S;
  legends.width = Math.round(KW * S); legends.height = Math.round(KD * S);
  const lg = legends.getContext('2d');
  const FONT = '"Helvetica Neue", Helvetica, Arial, "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif';
  lg.fillStyle = '#eaf1ff';
  lg.textBaseline = 'middle';
  keyList.forEach(k => {
    const t = k.label;
    if (!t) return;
    const cx = (k.x + KW / 2) * S, cy = (k.z - kz0) * S, kw = k.w * S, kd = k.d * S;
    if (typeof t === 'string' && t.startsWith('arrow-')) {
      const a = kd * 0.2;
      lg.save();
      lg.translate(cx, cy);
      lg.rotate({ u: 0, r: Math.PI / 2, d: Math.PI, l: -Math.PI / 2 }[t[6]]);
      lg.beginPath(); lg.moveTo(0, -a); lg.lineTo(a, a * 0.8); lg.lineTo(-a, a * 0.8); lg.closePath(); lg.fill();
      lg.restore();
      return;
    }
    lg.textAlign = 'center';
    if (Array.isArray(t)) {
      const [main, shifted, kn] = t;
      if (shifted) {
        lg.font = `500 ${UP * 0.19}px ${FONT}`;
        lg.fillText(shifted, cx - kw * 0.2, cy - kd * 0.2);
        lg.fillText(main, cx - kw * 0.2, cy + kd * 0.2);
      } else {
        lg.font = `500 ${UP * 0.27}px ${FONT}`;
        lg.fillText(main, cx - kw * 0.16, cy - kd * 0.06);
      }
      lg.font = `500 ${UP * 0.17}px ${FONT}`;
      lg.fillText(kn, cx + kw * 0.22, cy + kd * 0.2);
    } else {
      lg.font = `500 ${UP * 0.15}px ${FONT}`;
      if (/^(esc|F\d+|英数|かな)$/.test(t)) return void lg.fillText(t, cx, cy);
      const left = k.x < 0;
      lg.textAlign = left ? 'left' : 'right';
      lg.fillText(t, cx + (left ? -1 : 1) * (kw / 2 - UP * 0.1), cy + kd * 0.27);
    }
  });
  const legendTex = new THREE.CanvasTexture(legends);
  legendTex.colorSpace = THREE.SRGBColorSpace;
  legendTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const legendMat = new THREE.MeshBasicMaterial({ map: legendTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });

  const dots = document.createElement('canvas');
  dots.width = 96; dots.height = 512;
  const dc = dots.getContext('2d');
  dc.fillStyle = '#000'; dc.fillRect(0, 0, 96, 512);
  dc.fillStyle = '#fff';
  for (let r = 0; r < 32; r++) for (let q = 0; q < 6; q++) { dc.beginPath(); dc.arc(8 + q * 16, 8 + r * 16, 3.4, 0, Math.PI * 2); dc.fill(); }
  const dotTex = new THREE.CanvasTexture(dots);
  dotTex.anisotropy = legendTex.anisotropy;
  const spkMat = std({ color: 0x050608, metalness: 0.2, roughness: 0.8, alphaMap: dotTex, transparent: true });
  wellMat.emissive = new THREE.Color(0x5f86c0);
  wellMat.emissiveIntensity = 0;

  const mats = [shell, padMat, wellMat, keyMat, hingeMat, glass, logoMat, spkMat];
  const envBase = mats.map(m => (m === keyMat || m === wellMat ? 0.5 : 1));
  const padD = D - 0.2 - KD - 0.16, padZ = kz0 + KD + 0.07 + padD / 2;

  const baseGeo = slab(D, TB, -D / 2);
  const lidGeo = slab(D, TL, -D);
  const wellGeo = flat(KW + 0.05, KD + 0.05);
  const legendGeo = flat(KW, KD);
  const spkGeo = flat(0.12, KD * 0.78);
  const padGeo = flat(1.3, padD);
  const notchGeo = flat(0.46, 0.022);
  const hingeGeo = new THREE.CylinderGeometry(0.03, 0.03, W * 0.72, 20).rotateZ(Math.PI / 2);
  const bezelGeo = new THREE.ShapeGeometry(rrect(W - 0.03, D - 0.03, 0.1, 0.015), lite ? 6 : 16).rotateX(Math.PI / 2);
  const screenGeo = new THREE.PlaneGeometry(sw, sh).rotateX(Math.PI / 2);
  const logoGeo = flat(0.36, 0.36);
  const at = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

  const build = () => {
    const g = new THREE.Group();
    g.add(
      at(baseGeo, shell, 0, 0, 0),
      at(wellGeo, wellMat, 0, TB + 0.0006, kz0 + KD / 2),
      at(keyGeo, keyMat, 0, 0, 0),
      at(legendGeo, legendMat, 0, TB + KH + 0.0002, kz0 + KD / 2),
      at(spkGeo, spkMat, -KW / 2 - 0.155, TB + 0.0006, kz0 + KD / 2),
      at(spkGeo, spkMat, KW / 2 + 0.155, TB + 0.0006, kz0 + KD / 2),
      at(padGeo, padMat, 0, TB + 0.0006, padZ),
      at(notchGeo, hingeMat, 0, TB + 0.0006, D / 2 - 0.03),
      at(hingeGeo, hingeMat, 0, TB - 0.004, -D / 2 + 0.03),
    );
    const lid = new THREE.Group();
    lid.position.set(0, TB + GAP, -D / 2);
    lid.add(
      at(lidGeo, shell, 0, 0, 0),
      at(bezelGeo, glass, 0, -0.0015, 0),
      at(screenGeo, screenMat, 0, YS, zc),
      at(logoGeo, logoMat, 0, TL + 0.0006, D / 2),
    );
    g.add(lid);
    return { g, lid };
  };

  const { g: laptop, lid } = build();
  laptop.position.y = FEET;
  scene.add(laptop);
  const glow = new THREE.PointLight(0x8fb3de, 0, 7);
  glow.position.set(0, -0.9, zc);
  lid.add(glow);

  /* glossy floor: a mirrored copy of the laptop seen through a dark, slightly clear plane */
  let mirrorLid = null;
  if (!lite) {
    const m = build();
    m.g.scale.y = -1;
    m.g.position.y = -FEET;
    scene.add(m.g);
    mirrorLid = m.lid;
  }
  const radial = stops => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const c2 = cv.getContext('2d');
    const gr = c2.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(([p, col]) => gr.addColorStop(p, col));
    c2.fillStyle = gr; c2.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(cv);
  };
  const layer = (w, d, o, order, x, y, z) => {
    const m = at(flat(w, d), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, ...o }), x, y, z);
    m.renderOrder = order;
    scene.add(m);
    return m.material;
  };
  layer(80, 80, { color: 0x05080d, opacity: lite ? 1 : 0.8 }, 1, 0, 0, 0);
  layer(W + 0.7, D + 0.7, { map: radial([[0, 'rgba(0,0,0,.9)'], [0.62, 'rgba(0,0,0,.75)'], [1, 'rgba(0,0,0,0)']]) }, 2, 0, 0.001, 0);
  const coolPool = layer(16, 16, { map: radial([[0, 'rgba(143,179,222,.2)'], [0.5, 'rgba(143,179,222,.05)'], [1, 'rgba(143,179,222,0)']]), opacity: 0 }, 3, 0, 0.002, 0);
  const warmPool = layer(9, 9, { map: radial([[0, 'rgba(255,196,138,.26)'], [0.45, 'rgba(255,196,138,.07)'], [1, 'rgba(255,196,138,0)']]), opacity: 0 }, 3, -1.9, 0.002, -1.7);

  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x0a0d12, 0);
  const key = new THREE.DirectionalLight(0xcfe0ff, 0);
  key.position.set(3, 5, 4);
  const warm = new THREE.DirectionalLight(0xffc48a, 0);
  warm.position.set(-5, 2.2, -4);
  scene.add(hemi, key, warm);

  /* state driven by the timeline */
  const s = short
    ? { fade: 0, light: 1, open: 1, cam: 1, lit: 1, boot: 0, zoom: 0, out: 0 }
    : hold
      ? { fade: 1, light: 1, open: 1, cam: 1, lit: 1, boot: 0, zoom: 0, out: 0 }
      : { fade: 0, light: 0, open: 0, cam: 0, lit: 0, boot: 1, zoom: 0, out: 0 };

  let vw = 1, vh = 1, pw = sw, ph = sh, dist = 5.5;
  const layout = () => {
    vw = page.clientWidth; vh = page.clientHeight;
    renderer.setSize(vw, vh, false);
    const va = vw / vh;
    camera.aspect = va;
    if (va > sa) { pw = sw; ph = sw / va; } else { ph = sh; pw = sh * va; }
    dist = Math.max(5.5, (W * 0.62) / (Math.tan(rad(45) / 2) * va));
  };

  const v = () => new THREE.Vector3();
  const A = v(), B = v(), C = v(), pos = v(), tgt = v(), c = v(), n = v(), p = v();
  const TA = new THREE.Vector3(0, 0.12, 0), TBt = new THREE.Vector3(0, 0.85, -D / 2);
  const px = (x, z, out) => {
    p.set(x, YS, z);
    lid.localToWorld(p).project(camera);
    out.push((p.x + 1) / 2 * vw, (1 - p.y) / 2 * vh);
  };

  const frame = () => {
    if (done) return;
    lid.rotation.x = -OPEN * s.open;
    if (mirrorLid) mirrorLid.rotation.x = lid.rotation.x;
    laptop.updateMatrixWorld(true);
    c.set(0, YS, zc); lid.localToWorld(c);
    n.set(0, -1, 0).transformDirection(lid.matrixWorld);

    const k = dist / 5.5;
    A.set(-2.5 * k, 1.15 * k, 3.2 * k);
    B.set(0, 1.15, dist);
    C.copy(c).addScaledVector(n, (ph / 2) / Math.tan(rad(28) / 2));
    pos.lerpVectors(A, B, s.cam).lerp(C, s.zoom);
    tgt.lerpVectors(TA, TBt, s.cam).lerp(c, s.zoom);
    camera.fov = 45 - 17 * s.zoom;
    camera.position.copy(pos);
    camera.lookAt(tgt);
    if (hold) {
      camera.fov = 30;
      camera.position.set(0.5, 1.7, D / 2 + 1.9);
      camera.lookAt(0, 0.25, -0.1);
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    hemi.intensity = 0.7 * s.light;
    key.intensity = 2.6 * s.light;
    warm.intensity = 3 * s.light;
    const spill = s.lit * (1 - s.open);
    glow.intensity = 7 * s.lit + 16 * spill;
    legendMat.opacity = s.light * (0.4 + 0.6 * s.lit);
    wellMat.emissiveIntensity = 0.05 * s.lit;
    mats.forEach((m, i) =>{ m.envMapIntensity = envBase[i] * s.light; });
    coolPool.opacity = s.light * (0.35 + 0.65 * s.lit);
    warmPool.opacity = s.light;
    screenMat.color.copy(BLACK).lerp(DEEP, s.lit).lerp(BRIGHT, spill * 0.85);
    renderer.render(scene, camera);
    canvas.style.opacity = s.fade * (1 - s.out);

    /* the page is shown only once the screen faces the camera and the lid is mostly up */
    const facing = Math.min(1, Math.max(0, (n.dot(p.copy(pos).sub(c).normalize()) - 0.15) / 0.25));
    const shown = s.lit * facing * Math.min(1, Math.max(0, (s.open - 0.55) / 0.35));
    if (shown > 0.001) {
      const q = [];
      px(-pw / 2, zc + ph / 2, q); px(pw / 2, zc + ph / 2, q);
      px(-pw / 2, zc - ph / 2, q); px(pw / 2, zc - ph / 2, q);
      page.style.transform = homography([0, 0, vw, 0, 0, vh, vw, vh], q);
      page.style.opacity = shown;
    } else {
      page.style.opacity = 0;
    }
    if (boot) {
      boot.style.opacity = s.boot;
      boot.style.visibility = s.boot > 0.001 ? 'visible' : 'hidden';
    }
  };

  /* [property, start, duration, ease] */
  const plan = short
    ? { steps: [['fade', 0, 0.3, 'none'], ['zoom', 0.25, 1.05, 'power2.inOut'], ['out', 1.1, 0.5, 'power1.inOut']], hero: 0, end: 1.65 }
    : lite
      ? { steps: [['fade', 0, 0.3, 'none'], ['light', 0.1, 0.5, 'power1.out'], ['open', 0.4, 0.9, 'power3.inOut'], ['cam', 0.4, 0.9, 'power3.inOut'],
          ['lit', 0.55, 0.5, 'power2.out'], ['boot', 1.35, 0.35, 'power1.inOut'], ['zoom', 1.6, 0.9, 'power2.inOut'], ['out', 2.3, 0.5, 'power1.inOut']], hero: 1.35, end: 2.85 }
      : { steps: [['fade', 0, 0.5, 'none'], ['light', 0.5, 0.7, 'power1.out'], ['open', 1.2, 1.3, 'power3.inOut'], ['cam', 1.2, 1.3, 'power3.inOut'],
          ['lit', 1.4, 0.9, 'power2.out'], ['boot', 2.6, 0.9, 'power1.inOut'], ['zoom', 3.5, 1.8, 'power2.inOut'], ['out', 5.0, 0.8, 'power1.inOut']], hero: 2.6, end: 6.2 };

  const tl = gsap.timeline({ paused: hold });
  if (hold) root.classList.add('hero-go');
  plan.steps.forEach(([prop, at0, duration, ease]) => {
    tl.to(s, { [prop]: prop === 'boot' ? 0 : 1, duration, ease }, at0);
  });
  tl.add(() => root.classList.add('hero-go'), plan.hero);
  tl.add(finish, plan.end);

  const onKey = e => { if (e.key === 'Escape') finish(); };
  skip.addEventListener('click', finish);
  addEventListener('keydown', onKey);
  addEventListener('resize', layout);
  gsap.ticker.add(frame);
  cleanup = () => {
    tl.kill();
    gsap.ticker.remove(frame);
    removeEventListener('keydown', onKey);
    removeEventListener('resize', layout);
    [scene, envScene].forEach(sc => sc.traverse(o => {
      o.geometry?.dispose();
      if (o.material) { o.material.map?.dispose(); o.material.alphaMap?.dispose(); o.material.dispose(); }
    }));
    env.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  layout();
  frame();
}

if (mode) run().catch(finish);
})();
