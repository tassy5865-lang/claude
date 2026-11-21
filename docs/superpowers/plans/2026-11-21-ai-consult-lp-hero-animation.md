# Nexsist LP ヒーローアニメーション Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ヒーローに「点と線がつながる網」の動く背景、見出し文字の登場、各セクションのスクロール出現を追加する。

**Architecture:** 新規 `ai-consult-lp/motion.js` に、DOMに依存しない計算部分(`window.NexsistMotion` に公開、node の vm でテスト)と、canvas描画・停止制御・スクロール出現の配線を置く。文字の登場は CSS のみ。スクロール出現は motion.js が `<html>` に `js-motion` クラスを付けたときだけ隠す。

**Tech Stack:** 素の HTML/CSS/JavaScript(ビルドなし)、Canvas 2D、IntersectionObserver、`node --test`。

**Spec:** `docs/superpowers/specs/2026-11-21-ai-consult-lp-hero-animation-design.md`

## Global Constraints

- 外部ライブラリ・WebGL・音は使わない。CSP(`script-src 'self'`)は変更しない
- `prefers-reduced-motion: reduce` では網は静止画1枚、反応・文字の登場・スクロール出現なし
- JavaScriptが動かない環境でも本文・カードはすべて見える
- 色は既存トークン(`--violet: #7b5cff` / `--cyan: #22d3ee`)の紫→水色
- 描画倍率(devicePixelRatio)は最大2
- 既存の orb(漂う光)は残す
- テスト実行: `node --test ai-consult-lp/tests/*.test.mjs`(ディレクトリ指定は不可)
- ファイルは CRLF。Edit ツールで編集する

## Review Focus

- スマホの回転・ウィンドウサイズ変更 → canvas が引き伸ばされず、点を作り直す(Task 1 のテスト `nodeCount` と Task 2 の ResizeObserver 確認)
- 「動きを減らす」設定 → requestAnimationFrame のループが始まらない(Task 2 のテスト)
- IntersectionObserver が無いブラウザ → `js-motion` を付けず、全部見える(Task 3 のテスト)
- タブを裏に回す/ヒーローが画面外 → 描画ループが止まる(Task 2 のテスト)
- スマホで網の上を指でなぞってもページのスクロールが妨げられない(canvas は `pointer-events: none`、リスナーは `passive: true`。Task 2 のテスト)

---

### Task 1: 網の計算部分(DOM非依存)

**Files:**
- Create: `ai-consult-lp/motion.js`
- Test: `ai-consult-lp/tests/motion.test.mjs`

**Interfaces:**
- Produces(`window.NexsistMotion`):
  - `nodeCount(width: number, height: number): number` — 面積に比例、最小14・最大44(375×700 で約20、1280×800 で約40)
  - `createNodes(count: number, width: number, height: number, rand: () => number): Node[]` — `Node = {x, y, vx, vy}`、速さは各軸 ±0.25px/フレーム以内
  - `stepNodes(nodes: Node[], width: number, height: number, pointer: {x, y} | null): void` — 位置を進め、端で跳ね返す。pointer から 140px 以内の点を pointer へ少し引き寄せる(1フレームの移動は最大 0.6px)
  - `linksFor(nodes: Node[], maxDist: number): {a: number, b: number, alpha: number}[]` — 距離 < maxDist の組。`alpha = 1 - d / maxDist`

- [ ] **Step 1: テストを書く** `motion.test.mjs` は form-ui.test.mjs と同じく `vm` で motion.js を実行する(sandbox に `window` / `document.addEventListener` のみ用意し、DOMContentLoaded は呼ばない)。テスト:
  - `nodeCount scales with area and stays within 14..44`: `nodeCount(375,700)` が 16〜24、`nodeCount(1280,800)` が 36〜44、`nodeCount(100,100) === 14`、`nodeCount(4000,3000) === 44`
  - `createNodes keeps nodes inside and slow`: 固定乱数で 40 個、全点が 0≤x≤w, 0≤y≤h、|vx|,|vy| ≤ 0.25
  - `stepNodes bounces at edges`: x=w-0.1, vx=+0.2 の点が1回で x≤w かつ vx<0
  - `stepNodes pulls nodes toward the pointer a little`: pointer から 100px の点が近づき、移動量 ≤ 0.6 + |v|
  - `linksFor returns pairs closer than maxDist with fading alpha`: (0,0),(50,0),(300,0) と maxDist 120 → 1組、alpha ≈ 0.583
- [ ] **Step 2: 失敗を確認** `node --test ai-consult-lp/tests/*.test.mjs` → motion.test.mjs が「NexsistMotion is undefined」で失敗
- [ ] **Step 3: 実装** 上記4関数を motion.js に書き `window.NexsistMotion` に公開(Task 2 の配線はまだ書かない)
- [ ] **Step 4: 全テスト合格を確認**(既存73件＋新規)
- [ ] **Step 5: コミット** `ai-consult-lp: 網アニメーションの計算部分(motion.js)とテスト`

### Task 2: ヒーローの canvas と描画・停止制御、文字の登場

**Files:**
- Modify: `ai-consult-lp/index.html`(`<script src="motion.js" defer>` を main.js の次に、hero の orb の後に `<canvas class="hero-net" aria-hidden="true"></canvas>`)
- Modify: `ai-consult-lp/motion.js`(DOMContentLoaded での配線)
- Modify: `ai-consult-lp/styles.css`(`.hero-net`、文字の登場)
- Test: `ai-consult-lp/tests/motion.test.mjs`, `ai-consult-lp/tests/page-structure.test.mjs`

**Interfaces:**
- Consumes: Task 1 の4関数
- Produces: `window.NexsistMotion.startNet(canvas: HTMLCanvasElement, opts: {reduce: boolean}): {stop(): void, isRunning(): boolean}`

- [ ] **Step 1: テストを書く**
  - page-structure: `hero has a decorative network canvas` — `<canvas class="hero-net" aria-hidden="true">` が `<section id="hero"` 内にある、`<script src="motion.js" defer></script>` がある
  - page-structure: `hero canvas never blocks touch scrolling` — styles.css の `.hero-net` に `pointer-events: none`
  - page-structure: `hero text entrance is CSS-only and ends visible` — `@keyframes hero-in` があり、`.giant-stack .giant` と `.hero-copy > *` に `animation` 指定、`animation-fill-mode` が `both`(終了時は通常表示)。既存の reduced-motion 一括停止ルールが残っている
  - motion.test: `reduced motion draws one still frame and never loops` — canvas/2Dコンテキスト/requestAnimationFrame をモックし、`startNet(canvas,{reduce:true})` で rAF 呼び出し 0 回、描画(`stroke` または `arc`)1回以上、`isRunning() === false`
  - motion.test: `loop pauses when hidden and resumes when visible` — `reduce:false` で開始→ IntersectionObserver モックに isIntersecting:false を送ると `isRunning() === false`、true で再開。`document.visibilityState='hidden'` + visibilitychange でも停止
  - motion.test: `pointer listeners are passive` — hero への `pointermove` 登録の options に `passive: true`
- [ ] **Step 2: 失敗を確認**
- [ ] **Step 3: 実装**
  - `startNet`: canvas の表示サイズ×`min(devicePixelRatio,2)` でバッファ設定、`nodeCount`→`createNodes`。毎フレーム `stepNodes`→線(`linksFor` maxDist 130、線の色は点のx位置で紫→水色、不透明度 `alpha*0.35`)→点(半径1.6、不透明度0.8)。ヒーロー左半分(文字の下)は線の不透明度を0.5倍。pointer は hero の `pointermove`/`pointerleave`(passive)。IntersectionObserver と visibilitychange で停止/再開。ResizeObserver(無ければ resize)でサイズ変更時に点を作り直す。`reduce` なら1フレームだけ描いて終了
  - DOMContentLoaded: `.hero-net` があり 2Dコンテキストが取れたら `startNet(canvas,{reduce: matchMedia('(prefers-reduced-motion: reduce)').matches})`
  - CSS: `.hero-net { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:0 }`(本文は既存どおり前面。必要なら `.hero-inner{position:relative; z-index:1}`)。`@keyframes hero-in { from {opacity:0; transform:translateY(18px)} to {opacity:1; transform:none} }`、`.giant-stack .giant` に 0.7s・遅延 0/0.12/0.24s、`.hero-copy > *` に 0.6s・遅延 0.35s から 0.08s 刻み、`animation-fill-mode: both`
- [ ] **Step 4: 全テスト合格を確認**
- [ ] **Step 5: Chrome で確認**(ローカル `python -m http.server`): PC幅で網が動き、マウスに反応、文字が順に出る。ヒーローを画面外へスクロールすると描画が止まる(`isRunning`)。コンソールエラーなし
- [ ] **Step 6: コミット** `ai-consult-lp: ヒーローに動く網の背景と文字の登場`

### Task 3: スクロール出現

**Files:**
- Modify: `ai-consult-lp/motion.js`, `ai-consult-lp/styles.css`
- Test: `ai-consult-lp/tests/motion.test.mjs`, `ai-consult-lp/tests/page-structure.test.mjs`

**Interfaces:**
- Produces: `window.NexsistMotion.setupReveal(root: Document, opts: {reduce: boolean}): boolean` — 有効にしたら true。対象は `.section-head, .pain-item, .service-card, .combo-item, .case-feature, .case, .price-card, .scope, .about-body, .flow-step, .faq-item, .contact-grid > *`(ヒーロー以外)

- [ ] **Step 1: テストを書く**
  - motion.test: `reveal is skipped without IntersectionObserver` — IO なしで `setupReveal` が false、`documentElement` に `js-motion` が付かない
  - motion.test: `reveal is skipped for reduced motion` — `reduce:true` で false、クラスなし
  - motion.test: `revealed elements stay revealed` — IO モックで交差を通知すると対象に `is-in` が付き、その要素は `unobserve` される
  - page-structure: `content is hidden only under js-motion` — styles.css で非表示(`opacity: 0`)にするセレクタがすべて `.js-motion` で始まる
- [ ] **Step 2: 失敗を確認**
- [ ] **Step 3: 実装** — `setupReveal`: 条件を満たせば `<html>` に `js-motion`、対象を observe(`rootMargin: '0px 0px -8% 0px'`)。交差したら `is-in` を付けて unobserve。同じ親の兄弟には 70ms 刻み(最大 280ms)の `transition-delay` を style で付ける。読み込み時点で画面内の要素もすぐ `is-in` になる(IO の初回通知で処理)。CSS: 対象セレクタそれぞれに `.js-motion` を前置し(例 `.js-motion .service-card`) `opacity:0; transform:translateY(20px)`、`.is-in` で `opacity:1; transform:none; transition: opacity .6s, transform .6s`。DOMContentLoaded で呼ぶ
- [ ] **Step 4: 全テスト合格を確認**
- [ ] **Step 5: Chrome で確認**: スクロールで各カードが順に出る。ページ内リンク(#pricing 等)で飛んだ先も表示される。375px・320px で横スクロールなし。「動きを減らす」をエミュレートした状態(CSS メディア)で全部最初から見える
- [ ] **Step 6: コミット** `ai-consult-lp: セクションのスクロール出現`

### Task 4: 仕上げ・評価・公開

**Files:**
- Modify: `ai-consult-lp/CLAUDE.md`(motion.js の役割を1〜2行)、`docs/ai-consult-lp-codex-review-2026-11-14.md`(8回目の記録)

- [ ] **Step 1:** スマホ幅でフレーム落ちがないか Chrome の Performance 相当で目視(rAF 1フレームの処理時間を `performance.now()` で計測し 4ms 未満を目安)
- [ ] **Step 2:** codex 評価 `codex exec -m gpt-6.1-sol -s read-only -C <worktree> -o <out> - < prompt.md`。【高】【中】があれば直してテスト
- [ ] **Step 3:** セキュリティ確認(秘密情報・CSP・外部読み込みに変化なし)
- [ ] **Step 4:** コミット → push → PR → squash merge → 本番で motion.js と canvas の反映を確認
