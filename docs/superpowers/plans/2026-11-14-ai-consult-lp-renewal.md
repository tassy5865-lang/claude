# ai-consult-lp リニューアル（Nexsist）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ai-consult-lp/` を屋号 Nexsist のサービスサイト（WEB・LINE・AI）に作り直し、自己紹介HP・ポートフォリオ側のリンク表記も揃えて公開する。

**Architecture:** 静的 HTML/CSS/JS のまま、`index.html` と `styles.css` を全面的に書き換える。`main.js` のフォーム送信と GAS は変更しない。ページ構造の約束事（フォームの id/name、CSP、外部読み込み、メタ情報、事実ベースの文言）は Node の静的テストで固定する。見た目は Chrome（claude-in-chrome）で PC 幅とスマホ幅のスクリーンショットを撮って確認する。

**Tech Stack:** HTML / CSS / vanilla JS、Node `node:test`（依存なし）、Python + Pillow（OGP画像）、claude-in-chrome（目視確認）

**Spec:** `docs/superpowers/specs/2026-11-14-ai-consult-lp-renewal-design.md`（たたき台は `docs/superpowers/specs/2026-11-14-ai-consult-lp-renewal-mockup-v1.html`）

## Global Constraints

- 作業は**最新 `origin/main` から作る worktree**（scratchpad 配下、ブランチ `feature/nexsist-lp-renewal`）で行う。本体の作業ツリー（`feature/line-reservation`、未push作業あり）には触らない。`git add -A` 禁止、パスを指定してコミットする（OneDrive 同期対策）。
- 静的 HTML/CSS/JS、ビルド不要。ファイル構成 `index.html`/`styles.css`/`main.js`/`assets/` を維持。
- `main.js` と `gas/contact-form.gs` は変更しない。フォームは `id="contact-form"`、`id="form-status"`、`name="name"`（maxlength 40）、`name="email"`（maxlength 200）、`name="message"`（maxlength 2000）、ハニーポット `name="website"`（`.hp-field`、`tabindex="-1"`）を維持。
- CSP meta は今の文字列から変えない。外部は Google Fonts と GAS のみ。外部 `<script src>` を足さない。画像は `assets/` に置く。
- Webフォントは Inter と Noto Sans JP のみ（Inter は 800/900 の追加可）。
- 料金は載せない。成果の数値（「%」「倍」「時間短縮」「導入社数」等）は書かない。Lステップの相手先名は出さない。LINEトーク内予約は載せない。予約システムは「本番切替前」と分かるように書く。
- サイト名 **Nexsist**。運営者 田代裕貴の名前はフッターと JSON-LD に残す。canonical は `https://tassy5865-lang.github.io/claude/ai-consult-lp/` のまま。
- スマホ幅（375px）で横スクロールなし。アニメーションは `prefers-reduced-motion: reduce` で止める。大英字（WEB./LINE./AI./SERVICE/WORKS）は `aria-hidden="true"` の装飾にし、意味のある見出しは日本語テキストで持つ。
- 配色の基調：背景 `#06061a` 前後、紫 `#7b5cff` 系、水色 `#22d3ee` 系。
- `portfolio/index.html` は CRLF。
- 参考サイトの見出しをなぞらず、オリジナルの文言にする。

## Review Focus

1. **スマホ幅での大英字のはみ出し**：375px で「WEB. LINE. AI.」が横スクロールを生まないこと → Task 2 で `document.documentElement.scrollWidth <= innerWidth` を Chrome で確認。
2. **新デザインで送信が壊れる**：マークアップ変更でフォームの id/name/ハニーポットが変わり、GAS が弾く → Task 1 の静的テスト `form contract is unchanged` で固定。
3. **事実ベース方針違反の文言混入**：コピー調整で数値実績や料金が入る → Task 1 のテスト `no outcome numbers or prices` で固定。
4. **CSP 違反で表示が崩れる**（外部画像・外部スクリプト・インライン外の新ドメイン）→ Task 1 のテスト `csp and external resources unchanged` と Task 2 のコンソール確認。
5. **相互リンクの表記漏れ**：自己紹介HP/ポートフォリオに「AI導入・伴走支援」「AI導入支援」が残る（過去のお知らせ1件を除く）→ Task 5 のテスト `cross-site labels use Nexsist`。

---

### Task 0: worktree の用意と設計書のコミット

**Files:**
- Create: `docs/superpowers/specs/2026-11-14-ai-consult-lp-renewal-design.md`、`...-mockup-v1.html`、`docs/superpowers/plans/2026-11-14-ai-consult-lp-renewal.md`（本体作業ツリーからコピー）

- [ ] **Step 1:** `git fetch origin main` → `git worktree add -b feature/nexsist-lp-renewal <scratchpad>/wt-nexsist origin/main`
- [ ] **Step 2:** 上の3ファイルを本体作業ツリーから worktree の同じパスへコピー。
- [ ] **Step 3:** `node --test ai-consult-lp/tests/` が既存のまま PASS することを確認。
- [ ] **Step 4:** 3ファイルだけ `git add` してコミット「docs: Nexsist LP リニューアルの設計と計画」。

### Task 1: ページ構造テストと index.html の書き換え

**Files:**
- Create: `ai-consult-lp/tests/page-structure.test.mjs`
- Modify: `ai-consult-lp/index.html`（全面）

**Interfaces:**
- Produces: セクション id `#top`（main）、`#hero`、`#pain`（残す場合）、`#services`、`#works`、`#flow`、`#contact`。装飾英字は `class="giant"` + `aria-hidden="true"`。サービスカード `.service-card`（4枚）、実績 `.case-feature`（琥珀）・`.case`（小カード）。光の玉 `.orb`。Task 2 はこれらのクラスにスタイルを当てる。
- 琥珀スクショのパス `assets/work-kohaku.png`（Task 3 で用意。Task 1 時点では portfolio からのコピーで可）。

- [ ] **Step 1: 失敗するテストを書く**（`readFileSync` で `index.html` を文字列として読み、正規表現で検査。依存なし）

```js
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
  assert.ok(html.includes(CSP_CURRENT)); // 現行 index.html 5行目の content 値をそのまま定数に
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(srcs, ['main.js']);
  const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(imgs.every(s => s.startsWith('assets/')));
});
test('brand and meta are Nexsist', () => {
  assert.match(html, /<title>[^<]*Nexsist[^<]*<\/title>/);
  assert.match(html, /og:site_name" content="Nexsist"/);
  assert.match(html, /rel="canonical" href="https:\/\/tassy5865-lang\.github\.io\/claude\/ai-consult-lp\/"/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const svc = ld['@graph'].find(n => n['@type'] === 'ProfessionalService');
  assert.equal(svc.name, 'Nexsist');
  assert.equal(svc.hasOfferCatalog.itemListElement.length, 4);
  assert.ok(ld['@graph'].some(n => n['@type'] === 'Person' && n.name === '田代 裕貴'));
});
test('four services and works are present', () => {
  for (const s of ['ホームページ制作', '予約システム', 'LINE公式・Lステップ構築', 'AIツール開発・業務自動化']) assert.ok(html.includes(s), s);
  assert.ok(html.includes('https://tassy5865-lang.github.io/kohaku-site/'));
  assert.ok(html.includes('https://tassy5865-lang.github.io/claude/kohaku-booking/index.html'));
  assert.ok(html.includes('本番'));          // 予約は本番切替前と明記
  for (const u of ['AI-OCR/index.html', '%E5%96%B6%E6%A5%ADAI%E7%A4%BE%E5%93%A1', '%E9%A2%A8%E8%A2%8B']) assert.ok(html.includes(u), u);
});
test('no outcome numbers or prices', () => {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
  assert.doesNotMatch(text, /\d+\s*(%|％|倍|万円|円|社|件)/);
  assert.doesNotMatch(text, /時間短縮|売上アップ|導入実績\d/);
});
test('giant display words are decorative', () => {
  const giants = [...html.matchAll(/<[^>]+class="[^"]*\bgiant\b[^"]*"[^>]*>/g)].map(m => m[0]);
  assert.ok(giants.length >= 3);
  assert.ok(giants.every(t => t.includes('aria-hidden="true"')));
});
```

- [ ] **Step 2:** `node --test ai-consult-lp/tests/page-structure.test.mjs` → FAIL（brand/services/giant が未実装）を確認。
- [ ] **Step 3: `index.html` を書き換える。** 構成と文言は spec §4 のとおり。ヘッダー（NEXSIST・サービス/実績/流れ/相談する）→ ヒーロー（`.giant` WEB./LINE./AI. と、h1「お店の集客と予約を、まるごと仕組みに。」、サブ、CTA 2つ、`.orb` 2つ）→ 悩み（お店向け4枚、作り手判断で省略可）→ SERVICE（4枚＋「作って終わりにせず、運用まで伴走します」）→ WORKS（琥珀の大カード：サイト公開中リンク・管理画面・GA4／予約システム「開発済み・本番切替前」デモリンク／LINE連携は確認メールから連携する仕組み。Lステップ小カード匿名。自作ツール3つの小カード）→ FLOW（4ステップ流用）→ CONTACT（今のマークアップの属性をそのまま）→ フッター（© 2026 Nexsist／運営：田代裕貴、リンク3本）。`<head>` の title/description/OGP/Twitter/JSON-LD を Nexsist と4サービスに更新（`og:image` のパスは同じ）。琥珀画像は `<img src="assets/work-kohaku.png" width height alt loading="lazy">`。
- [ ] **Step 4:** `node --test ai-consult-lp/tests/` → 全 PASS（既存の contact-form テストも）。
- [ ] **Step 5:** `ai-consult-lp/index.html`、`ai-consult-lp/tests/page-structure.test.mjs`、`ai-consult-lp/assets/work-kohaku.png` をコミット「ai-consult-lp: Nexsist 向けにページ構成と文言を刷新」。

### Task 2: styles.css の全面刷新（A×C）

**Files:**
- Modify: `ai-consult-lp/styles.css`（全面）、`ai-consult-lp/index.html`（Google Fonts の URL で Inter に 800;900 を追加するだけ）

**Interfaces:**
- Consumes: Task 1 のクラス／id。

- [ ] **Step 1:** たたき台 `mockup-v1.html` のインライン style を元に、`:root` のトークン（`--bg`、`--violet`、`--cyan`、`--text`、`--muted`、`--glass`、`--line`）を定義してスタイルを書く。`.giant` は `font-size: clamp(56px, 13vw, 168px)` 前後、縁取りは `-webkit-text-stroke`、`AI.` はグラデ塗り。`.orb` はぼかした放射グラデ（`pointer-events:none`）。ガラスカードは `background: rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.12); backdrop-filter: blur(8px)`。`.hp-field` は今と同じく画面外に隠す。フォーカスリングを見えるようにする。`@media (prefers-reduced-motion: reduce)` で animation/transition を止める。
- [ ] **Step 2:** worktree の `ai-consult-lp/` で `python -m http.server 8765` を起動（バックグラウンド）し、Chrome で `http://localhost:8765/` を開く。1440px と 375px でスクリーンショットを撮り、各セクションを目視する。
- [ ] **Step 3:** 375px で `javascript_tool` を使い、`document.documentElement.scrollWidth <= window.innerWidth` が `true` になることを確認する。コンソールに CSP 違反とエラーがないことも見る。
- [ ] **Step 4:** スクリーンショットをユーザーに見せて、OK をもらう（ここが「A×C で良いか、別々に作り直すか」の判断点。NG なら止めて相談）。
- [ ] **Step 5:** `node --test ai-consult-lp/tests/` → PASS。`styles.css` と `index.html` をコミット「ai-consult-lp: A×C のダーク×ネオン×大英字デザイン」。

### Task 3: 琥珀スクリーンショットの撮り直し

**Files:**
- Modify: `ai-consult-lp/assets/work-kohaku.png`

- [ ] **Step 1:** Chrome で `https://tassy5865-lang.github.io/kohaku-site/` を 1280×800 で開き、`portfolio/assets/work-kohaku.png` と見比べる。違いがあれば、トップ画面を撮り直す（オープニング動画はスキップかページ再訪後に。`save_to_disk`）。
- [ ] **Step 2:** 幅 1200px 程度に縮めて `assets/work-kohaku.png` に保存する。1ファイル 300KB 以下を目安にする（Pillow で縮小・最適化）。
- [ ] **Step 3:** ローカル表示で WORKS の大カードに収まることを確認してコミットする（変更なしなら、このタスクはコミットなしで完了）。

### Task 4: OGP 画像の作り直し

**Files:**
- Modify: `ai-consult-lp/assets/build-og-card.py`、`ai-consult-lp/assets/social-card.png`

- [ ] **Step 1:** `build-og-card.py` の文言を Nexsist に変える：上段の小見出し「WEB × LINE × AI」、大見出し「お店の集客と予約を、/まるごと仕組みに。」、下段「HP制作・予約システム・LINE/Lステップ・AIツール」、署名「Nexsist ／ 田代 裕貴」。配色は新トークン（背景 `#06061a`、紫・水色の光）。
- [ ] **Step 2:** `cd ai-consult-lp/assets && python build-og-card.py social-card.png` → 1200×630 の PNG ができる。Read で画像を開き、文字切れがないことを目視する。
- [ ] **Step 3:** 2ファイルをコミット「ai-consult-lp: OGP画像を Nexsist 版に」。

### Task 5: 相互リンク表記の更新

**Files:**
- Modify: `自己紹介HP/v2/index.html`（153・271付近に1行追加・325）、`自己紹介HP/index.html`（93・168）、`portfolio/index.html`（`SITE.works.cards` の LP カード 273–297、`SITE.contact.ctas` 3件目、`SITE.footer.links` 4件目）
- Create: `ai-consult-lp/tests/cross-links.test.mjs`

- [ ] **Step 1: 失敗するテスト**

```js
const files = ['../../自己紹介HP/v2/index.html', '../../自己紹介HP/index.html', '../../portfolio/index.html'];
test('cross-site labels use Nexsist', () => {
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    const links = [...src.matchAll(/ai-consult-lp\/"[^>]*>([^<]*)/g)].map(m => m[1]);
    const labels = [...src.matchAll(/"label":\s*"([^"]*)",\s*"href":\s*"https:\/\/tassy5865-lang\.github\.io\/claude\/ai-consult-lp\/"/g)].map(m => m[1]);
    for (const l of [...links, ...labels]) {
      if (l.includes('案内ページを公開しました')) continue; // 2026.09 のお知らせは過去記録として残す
      assert.ok(l.includes('Nexsist'), `${f}: ${l}`);
    }
  }
});
test('portfolio LP card is renamed', () => {
  const p = readFileSync(new URL('../../portfolio/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(p, /AI導入・伴走支援LP/);
  assert.match(p, /"title":\s*"Nexsist[^"]*"/);
});
test('v2 news has the renewal entry', () => {
  const v2 = readFileSync(new URL('../../自己紹介HP/v2/index.html', import.meta.url), 'utf8');
  assert.match(v2, /<time>2026\.11<\/time>[\s\S]{0,200}Nexsist/);
});
```

- [ ] **Step 2:** `node --test ai-consult-lp/tests/cross-links.test.mjs` → FAIL を確認。
- [ ] **Step 3:** spec §8 の表のとおりに書き換える。ポートフォリオの LP カードは title「Nexsist｜HP・予約・LINE・AI の相談窓口」、text/before/after/background/usage/imageAlt/imageCaption/summary/challenge/benefit を新LPの内容に書き換える（事実ベース、数値なし）。`verified`/`verifiedDate` は Task 6 で撮り直したあとに更新するので、ここでは触らない。CRLF を保つ。
- [ ] **Step 4:** `node --test ai-consult-lp/tests/` → 全 PASS。`git diff --stat` で 3 ファイル＋テストだけが変わっていることを確認する。
- [ ] **Step 5:** 4ファイルをコミット「自己紹介HP・ポートフォリオ: LPへのリンク表記を Nexsist に」。

### Task 6: 公開・本番確認・後片付け

**Files:**
- Modify: `portfolio/assets/work-ai-consult.png`、`portfolio/index.html`（LP カードの `verified`/`verifiedDate`）、`ai-consult-lp/CLAUDE.md`

- [ ] **Step 1: セキュリティ点検**（本人ルール）：差分を見て、秘密情報・XSS（`innerHTML` を追加していないか）・CSP・外部依存・個人情報（メールアドレス等を新たに出していないか）を確認し、確認済み／未確認を分けてメモする。
- [ ] **Step 2:** `ai-consult-lp/CLAUDE.md` を更新する（Nexsist 化、新しい構成、テスト2本、OGP 文言、2026-11-14 の状態）。コミットする。
- [ ] **Step 3:** ユーザーに push と PR 作成の了承を取る → `git push -u origin feature/nexsist-lp-renewal` → `gh pr create`（本文の末尾に attribution）→ ユーザーの了承後に squash merge → リモートブランチを削除する。
- [ ] **Step 4:** `gh api repos/tassy5865-lang/claude/pages/builds/latest` で build が `built` になるのを待つ。Chrome で本番 LP（PC/375px）、自己紹介HP v2、旧版、ポートフォリオを開き、表記とリンクを確認する。`assets/social-card.png` の本番 URL が 200 を返すことを確認する。
- [ ] **Step 5:** 本番 LP のフォームから `[TEST]` 送信を1件行い、スプレッドシートとメールへの到達をユーザーに確認してもらう（テスト行は本人が削除）。
- [ ] **Step 6:** 本番 LP を 1280×800 で撮影して `portfolio/assets/work-ai-consult.png` を差し替え、LP カードの `verified` 文言と `verifiedDate: "2026-11-14"` を更新する。小さな PR で公開する（ユーザーの了承後に merge）。
- [ ] **Step 7:** worktree を削除し、メモリ `project_ai_consult_lp.md` を更新する。ユーザーに、確認済み／未確認を分けて報告する。
