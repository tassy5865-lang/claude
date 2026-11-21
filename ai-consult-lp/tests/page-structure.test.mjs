// index.html の約束事(フォーム・CSP・外部読み込み・メタ情報・事実ベースの文言)を固定するテスト。
// 実行: node --test ai-consult-lp/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// 2026-11-20 時点の CSP(実行するインラインスクリプトはないので script-src から 'unsafe-inline' を外した)。変えるときはこのテストも意図して直す。
const CSP_CURRENT = "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self'; connect-src 'self' https://script.google.com https://script.googleusercontent.com";

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
  assert.deepEqual(srcs, ['main.js', 'motion.js']); // どちらも同じサイト内のファイル(外部スクリプトなし)
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
  assert.equal(svc.hasOfferCatalog.itemListElement.length, 5);
  assert.ok(ld['@graph'].some((n) => n['@type'] === 'Person' && n.name === '田代 裕貴'));
});

test('four services and works are present', () => {
  for (const s of ['ホームページ制作', '予約システム', 'LINE公式・Lステップ構築', 'Threads投稿の自動化構築', 'AIツール開発・業務自動化']) assert.ok(html.includes(s), s);
  assert.ok(html.includes('https://tassy5865-lang.github.io/kohaku-site/'));
  assert.ok(html.includes('https://tassy5865-lang.github.io/claude/kohaku-booking/index.html'));
  assert.ok(html.includes('本番'));
  for (const u of ['AI-OCR/index.html', '%E9%A2%A8%E8%A2%8B']) assert.ok(html.includes(u), u);
  // 営業AI社員のカードは掲載しない(2026-11-14 本人指示)
  assert.ok(!html.includes('営業AI社員') && !html.includes('%E5%96%B6%E6%A5%ADAI%E7%A4%BE%E5%93%A1'));
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

test('threads service keeps a human approval step', () => {
  const card = html.match(/<article class="glass service-card">(?:(?!<\/article>)[\s\S])*?Threads投稿の自動化構築[\s\S]*?<\/article>/);
  assert.ok(card, 'Threads card');
  assert.match(card[0], /承認/);
  assert.equal([...html.matchAll(/class="glass service-card"/g)].length, 5);
});

// codex 評価(2026-11-14)を受けた追加: 料金の考え方・本人紹介・FAQ・相談条件・個人情報
test('page answers pre-inquiry questions (pricing, about, faq)', () => {
  for (const id of ['pricing', 'about', 'faq']) assert.match(html, new RegExp(`<section id="${id}"`), id);
  assert.match(html, /<a class="nav-item" href="#pricing">/);
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
  assert.match(text, /ご相談・お見積もりは無料/);
  assert.match(text, /費用が変わる/);
  assert.match(text, /別途/);               // 外部サービス利用料・保守などの扱い
  assert.match(text, /臨床工学技士/);       // 本人紹介
  assert.ok((html.match(/<details/g) || []).length >= 4, 'faq items');
});

test('contact form states conditions and handles personal data', () => {
  const form = html.match(/<form id="contact-form"[\s\S]*?<\/form>/)[0];
  assert.equal((form.match(/必須/g) || []).length >= 3, true, '必須 marks');
  assert.match(form, /placeholder="[^"]+"/);
  assert.match(html, /2営業日以内/);
  assert.match(html, /個人情報/);
  assert.match(html, /機密/);
  assert.match(form, /aria-live="polite"|role="status"/);
});

test('tool screenshots are labeled as sample data', () => {
  for (const f of ['assets/work-ocr.png', 'assets/work-filedata.png']) assert.ok(html.includes(`src="${f}"`), f);
  const caps = [...html.matchAll(/<figcaption>([^<]*)<\/figcaption>/g)].map((m) => m[1]);
  assert.ok(caps.filter((c) => /サンプル|架空/.test(c)).length >= 2, caps.join(' | '));
});

test('form cannot leak input into the URL without JavaScript', () => {
  const form = html.match(/<form id="contact-form"[^>]*>/)[0];
  assert.match(form, /method="post"/);
  assert.match(html, /<button type="submit" class="btn btn-primary" disabled>/);
  assert.match(html, /<noscript>[\s\S]*LINE[\s\S]*<\/noscript>/);
});

test('privacy notice covers both LINE and the form', () => {
  const block = html.match(/<div class="privacy"[\s\S]*?<\/div>/);
  assert.ok(block, 'shared privacy block');
  assert.match(block[0], /LINE/);
  assert.match(block[0], /フォーム/);
  assert.match(block[0], /削除/);
});

// ---- codex 3回目の指摘 + 運営者の決定(2026-11-14: 公開と操作説明までが標準、差し替え・機能追加は別見積もり) ----
test('after-delivery scope is stated plainly', () => {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
  assert.match(text, /公開と操作説明まで/);
  assert.match(text, /文章や画像の差し替え/);
  assert.match(text, /機能の追加/);
  assert.match(text, /別途お見積もり/);
  assert.doesNotMatch(text, /運用まで伴走|設計から運用まで/);
});

test('privacy notice is linked from the hero, LINE and the form', () => {
  assert.ok((html.match(/href="#privacy"/g) || []).length >= 3);
  assert.match(html.match(/<section id="hero"[\s\S]*?<\/section>/)[0], /href="#privacy"/);
  assert.match(html.match(/<div class="glass contact-line">[\s\S]*?<\/div>/)[0], /href="#privacy"/);
  assert.match(html.match(/<form id="contact-form"[\s\S]*?<\/form>/)[0], /href="#privacy"/);
});

test('each pain points to a matching service', () => {
  const pains = [...html.matchAll(/<li class="glass pain-item">[\s\S]*?<\/li>/g)].map((m) => m[0]);
  assert.equal(pains.length, 4);
  assert.ok(pains.every((p) => /class="pain-to"/.test(p)));
});

test('kohaku case explains the problem, scope and design choice', () => {
  const kohaku = html.match(/<article class="case-feature">[\s\S]*?<\/article>/)[0];
  for (const w of ['相談時の課題', '担当範囲', '設計の工夫', '現在']) assert.ok(kohaku.includes(w), w);
});

test('tool screenshots open at full size', () => {
  for (const f of ['assets/work-ocr.png', 'assets/work-filedata.png']) assert.match(html, new RegExp(`<a href="${f}"[^>]*><img src="${f}"`));
});

// codex 4回目の指摘: Threads は「構築」と分かる名前に、納品後に誰が操作するかも明記。琥珀の画像は切り抜かない
test('threads is named as a build service and says who operates it', () => {
  assert.doesNotMatch(html, /Threads自動運用/);
  const card = html.match(/<article class="glass service-card">(?:(?!<\/article>)[\s\S])*?Threads投稿の自動化構築[\s\S]*?<\/article>/)[0];
  assert.match(card, /納品後/);
});

test('kohaku screenshot is not cropped to the text height', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const rule = css.match(/\.case-media img \{[^}]*\}/)[0];
  assert.doesNotMatch(rule, /object-fit:\s*cover/);
});

// 2026-11-15 本人確認: Lステップ事例は琥珀と同じお店。別事例として並べない(実績の水増しに見える)
test('the Lステップ work is part of the 琥珀 case, not a separate case', () => {
  assert.doesNotMatch(html, /CASE 02/);
  assert.doesNotMatch(html, /事業者名は伏せ/);
  const kohaku = html.slice(html.indexOf('class="case-feature"'), html.indexOf('class="case-grid"'));
  assert.match(kohaku, /Lステップ/);
  assert.match(kohaku, /LINEのメッセージで予約/);
  assert.match(kohaku, /本番切替の前/); // 自作の予約システムが稼働中と誤解させない
});

// codex 6回目の残り(2026-11-20): ページ内リンク・狭い画面の目次・琥珀の重複・依頼の組み合わせ例
test('in-page links update the URL and move focus to the target', () => {
  const js = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  assert.match(js, /history\.pushState\(null, "", hash\)/);
  assert.match(js, /setAttribute\("tabindex", "-1"\)/);
  assert.match(js, /event\.metaKey \|\| event\.ctrlKey/); // 新しいタブで開く操作は邪魔しない
});

test('pricing link stays in the header on narrow phones', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.nav-item\[href="#pricing"\]\s*\{\s*display:\s*none/);
});

test('kohaku case does not repeat the same facts in the story and the list', () => {
  const kohaku = html.slice(html.indexOf('class="case-feature"'), html.indexOf('class="case-grid"'));
  const text = kohaku.replace(/<[^>]+>/g, ' ');
  assert.equal((text.match(/LINEのメッセージで予約|LINEのメッセージで受付/g) || []).length, 1);
  assert.equal((text.match(/地図のクリック/g) || []).length, 1);
});

test('services show example combinations of requests', () => {
  const services = html.match(/<section id="services"[\s\S]*?<\/section>/)[0];
  const items = [...services.matchAll(/class="glass combo-item"/g)];
  assert.ok(items.length >= 3);
  assert.match(services, /ご依頼の組み合わせ例/);
  assert.doesNotMatch(services.match(/class="combo"[\s\S]*$/)[0], /円/); // 料金は載せない方針
});

// ---- 2026-11-21 ヒーローアニメーション(案B) ----
test('hero has a decorative network canvas', () => {
  const hero = html.match(/<section id="hero"[\s\S]*?<\/section>/)[0];
  assert.match(hero, /<canvas class="hero-net" aria-hidden="true"><\/canvas>/);
  assert.match(html, /<script src="motion.js" defer><\/script>/);
});

test('hero canvas never blocks touch scrolling', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const rule = css.match(/\.hero-net \{[^}]*\}/);
  assert.ok(rule, '.hero-net rule');
  assert.match(rule[0], /pointer-events:\s*none/);
});

test('hero text entrance is CSS-only and ends visible', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /@keyframes hero-in/);
  assert.match(css, /\.giant-stack \.giant \{[^}]*animation:[^}]*hero-in[^}]*both/);
  // 日本語の見出し・ボタンは最初から見せ、位置だけ動かす(読める・押せるまで待たせない、LCPも遅らせない)
  assert.match(css, /\.hero-copy > \* \{[^}]*animation:[^}]*hero-rise/);
  const rise = css.match(/@keyframes hero-rise \{[\s\S]*?\}\s*\}/);
  assert.ok(rise, 'hero-rise keyframes');
  assert.doesNotMatch(rise[0], /opacity/);
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*\*, \*::before, \*::after \{ animation: none !important/);
});

test('content is hidden only under js-motion', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const rules = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); // アニメーション定義とコメントは除く
  const hiding = [...rules.matchAll(/([^{}]+)\{[^}]*opacity:\s*0[;\s]/g)].map((m) => m[1].trim());
  assert.ok(hiding.length > 0, 'reveal rule exists');
  for (const rule of hiding) for (const sel of rule.split(',')) assert.match(sel.trim(), /^\.js-motion /, sel);
  // 対象: 各セクションの見出しとカード(ヒーロー以外)
  assert.match(css, /\.js-motion \.service-card/);
  assert.match(css, /\.is-in/);
});

// 最終レビュー(2026-11-21): まだ出現していない要素でも、フォーカス時・印刷時は見える
test('unrevealed content becomes visible on keyboard focus', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const i = css.indexOf('.js-motion :not(.is-in):focus-within');
  assert.ok(i > 0, 'focus-within rule');
  assert.match(css.slice(i), /^[^{]*\{[^}]*opacity:\s*1/);
  assert.ok(i > css.lastIndexOf(':not(.is-in) { opacity: 0; }'), 'comes after the hiding rule');
});

test('unrevealed content is printed', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /@media print\s*\{\s*\.js-motion :not\(\.is-in\)\s*\{[^}]*opacity:\s*1 !important/);
});

test('orbs pause with the network, and the contact area is never hidden', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.hero\.is-paused \.orb \{[^}]*animation-play-state:\s*paused/);
  assert.doesNotMatch(css, /contact-grid > :not\(\.is-in\)/);
  const js = readFileSync(new URL('../motion.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /contact-grid/);
});

test('a focused element mid-reveal is shown immediately', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.js-motion \.is-in:focus-within \{[^}]*animation:\s*none/);
});
