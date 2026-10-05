// jsdom でフロントエンド(index.html / admin.html)を読み込むための共通ヘルパー
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/<link[^>]*>/g, '');

function load(file, { url = 'https://example.test/', replace = [], beforeParse } = {}) {
  let html = read(file);
  for (const [a, b] of replace) html = html.replace(a, b);
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url, pretendToBeVisual: true,
    beforeParse(w) { w.scrollTo = () => {}; w.confirm = () => true; if (beforeParse) beforeParse(w); }
  });
  const w = dom.window, d = w.document;
  const errors = [];
  w.addEventListener('error', e => errors.push(e.message));
  const click = sel => { const el = d.querySelector(sel); if (!el) throw new Error('要素が見つかりません: ' + sel); el.click(); };
  const type = (sel, v) => { const el = d.querySelector(sel); if (!el) throw new Error('要素が見つかりません: ' + sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const text = (sel = 'main') => d.querySelector(sel).textContent.replace(/\s+/g, ' ');
  return { w, d, click, type, text, errors };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports = { load, sleep };
