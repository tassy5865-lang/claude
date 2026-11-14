// index.html の約束事(フォーム・CSP・外部読み込み・メタ情報・事実ベースの文言)を固定するテスト。
// 実行: node --test ai-consult-lp/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// 2026-11-14 時点の CSP。変えるときはこのテストも意図して直す。
const CSP_CURRENT = "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self'; connect-src 'self' https://script.google.com https://script.googleusercontent.com";

test('form contract is unchanged', () => {
  assert.match(html, /<form id="contact-form"/);
  assert.match(html, /id="form-status"/);
  assert.match(html, /name="name"[^>]*maxlength="40"|maxlength="40"[^>]*name="name"/);
  assert.match(html, /name="email"[^>]*maxlength="200"|maxlength="200"[^>]*name="email"/);
  assert.match(html, /name="message"[^>]*maxlength="2000"|maxlength="2000"[^>]*name="message"/);
  assert.match(html, /class="hp-field"[\s\S]*?name="website"[^>]*tabindex="-1"/);
  assert.match(html, /<script src="main.js" defer><\/script>/);
});

test('csp and external resources unchanged', () => {
  assert.ok(html.includes(CSP_CURRENT));
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(srcs, ['main.js']);
  const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(imgs.length > 0);
  assert.ok(imgs.every((s) => s.startsWith('assets/')), imgs.join(','));
});

test('brand and meta are Nexsist', () => {
  assert.match(html, /<title>[^<]*Nexsist[^<]*<\/title>/);
  assert.match(html, /og:site_name" content="Nexsist"/);
  assert.match(html, /rel="canonical" href="https:\/\/tassy5865-lang\.github\.io\/claude\/ai-consult-lp\/"/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const svc = ld['@graph'].find((n) => n['@type'] === 'ProfessionalService');
  assert.equal(svc.name, 'Nexsist');
  assert.equal(svc.hasOfferCatalog.itemListElement.length, 4);
  assert.ok(ld['@graph'].some((n) => n['@type'] === 'Person' && n.name === '田代 裕貴'));
});

test('four services and works are present', () => {
  for (const s of ['ホームページ制作', '予約システム', 'LINE公式・Lステップ構築', 'AIツール開発・業務自動化']) assert.ok(html.includes(s), s);
  assert.ok(html.includes('https://tassy5865-lang.github.io/kohaku-site/'));
  assert.ok(html.includes('https://tassy5865-lang.github.io/claude/kohaku-booking/index.html'));
  assert.ok(html.includes('本番'));
  for (const u of ['AI-OCR/index.html', '%E5%96%B6%E6%A5%ADAI%E7%A4%BE%E5%93%A1', '%E9%A2%A8%E8%A2%8B']) assert.ok(html.includes(u), u);
});

test('no outcome numbers or prices', () => {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
  assert.doesNotMatch(text, /\d+\s*(%|％|倍|万円|円|社|件)/);
  assert.doesNotMatch(text, /時間短縮|売上アップ|導入実績\d/);
});

test('giant display words are decorative', () => {
  const giants = [...html.matchAll(/<[^>]+class="[^"]*\bgiant\b[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.ok(giants.length >= 3);
  assert.ok(giants.every((t) => t.includes('aria-hidden="true"')));
});

test('skip link moves focus to main content', () => {
  assert.match(html, /<a class="skip-link" href="#main">/);
  assert.match(html, /id="main"[^>]*tabindex="-1"|tabindex="-1"[^>]*id="main"/);
  const js = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  assert.match(js, /target\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
});

test('copy only states verified facts (review 2026-11-14)', () => {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
  assert.doesNotMatch(text, /お客様のご希望/);                 // 匿名は本人判断
  assert.doesNotMatch(text, /実際に作って公開しているもの/);     // Lステップ・予約デモは公開物ではない
  assert.match(text, /予約システムとのLINE連携（開発・テスト済み）/);
  assert.doesNotMatch(html, /alt="[^"]*ご予約ボタン/);           // 画像に予約ボタンは写っていない
});

test('in-page scroll respects prefers-reduced-motion', () => {
  const js = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  assert.match(js, /matchMedia\(\s*["']\(prefers-reduced-motion: reduce\)["']\s*\)/);
  assert.doesNotMatch(js, /scrollIntoView\(\{\s*behavior:\s*"smooth"\s*\}\)/); // 常に smooth にしない
});
