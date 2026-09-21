# AIコンサル事業LP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 田代裕貴のAIコンサル事業（業務自動化ツール開発支援＋AI活用伴走コンサル）を売り込む、静的HTML/CSS/JSの単体ランディングページを `ai-consult-lp/` に新規作成する。

**Architecture:** ビルド不要の静的サイト。`index.html` に8セクション（ヘッダー／ヒーロー／課題提起／サービス2本柱／実績事例／導入の流れ／お問い合わせ／フッター）を積み、`styles.css` でダーク×ネオン配色のレイアウトを組み、`main.js` でスムーススクロールと問い合わせフォームのGAS送信を実装する。既存サイト（自己紹介HP・ポートフォリオ）と同じファイル構成パターンを踏襲する。

**Tech Stack:** 素のHTML5 / CSS3（CSS変数・Grid・Flexbox） / Vanilla JS（fetchのみ、フレームワークなし）。バックエンドはGoogle Apps Script Web App（doPost）。

**Spec:** `docs/superpowers/specs/2026-09-18-ai-consult-lp-design.md`

## Global Constraints

- 静的HTML/CSS/JSのみ、ビルドステップ不要（spec: 技術構成）
- ダーク基調配色: チャコール〜濃紺ベース(#0d0e1a系)、アクセントは紫(#6c64eb系)〜シアン(#6bcce6系)のグラデーション（spec: ビジュアル方向性）
- 見出しはグロテスクサンス系Webフォント(Inter等)、日本語本文は游ゴシック/Noto Sans JP系フォントスタック（spec: ビジュアル方向性）
- ヒーローはfirst viewport(~100svh)内に完結。セクション間は80〜160pxの一定リズム、横方向は中央寄せ＋左右パディングで本文が端に付かない（spec: ビジュアル方向性）
- 実績セクションはAI-OCR／営業AI社員／風袋管理データツール「FileData」を実名で紹介（spec: 実績・事例）
- お問い合わせはLINE公式(lin.ee/5SAPZeC)誘導＋GAS Web App宛のフォーム送信の両方（spec: お問い合わせ導線）
- フッターに自己紹介HP・ポートフォリオへの相互リンクを設置（spec: フッター／ヘッダー）
- 料金の具体的な金額は載せない、「まずは相談」導線のみ（spec: 未決定事項）

---

## File Structure

```
ai-consult-lp/
  CLAUDE.md            # プロジェクト概要（既存サイト群の慣習を踏襲）
  index.html           # 1ページ完結、全8セクション
  styles.css           # CSS変数・グローバルレイアウト・全セクションのスタイル
  main.js              # スムーススクロール・フォーム送信・モバイルナビ開閉
  assets/
    profile-qr.png      # 自己紹介HP/assets/profile-qr.png をコピー（LINE公式QR）
  gas/
    contact-form.gs      # GAS Web App（doPost）ソース。デプロイ手順込みのコメント付き
```

---

## Task 1: プロジェクト雛形とHTML骨格

**Files:**
- Create: `ai-consult-lp/CLAUDE.md`
- Create: `ai-consult-lp/index.html`
- Create: `ai-consult-lp/styles.css`
- Create: `ai-consult-lp/main.js`

**Interfaces:**
- Produces: `index.html` の `<head>` に `<link rel="stylesheet" href="styles.css">` と `<script src="main.js" defer></script>`。以降の全タスクはこの `index.html` に `<section id="...">` を追記していく。
- Produces: `styles.css` 冒頭に `:root { --bg: #0d0e1a; --bg-elevated: #14162a; --text: #f4f4f8; --text-muted: #a9acc4; --accent-violet: #6c64eb; --accent-cyan: #6bcce6; --accent-gradient: linear-gradient(135deg, var(--accent-violet), var(--accent-cyan)); --space-section: clamp(72px, 10vw, 140px); --max-width: 1120px; }` を定義。以降のタスクはこの変数を使う。

- [ ] **Step 1: ディレクトリと空ファイルを作成**

```bash
mkdir -p ai-consult-lp/assets ai-consult-lp/gas
touch ai-consult-lp/index.html ai-consult-lp/styles.css ai-consult-lp/main.js
```

- [ ] **Step 2: `CLAUDE.md` を作成**

```markdown
# AIコンサル事業LP

田代裕貴の個人AIコンサル事業（業務自動化・AIツール開発支援／AI活用伴走コンサル）を売り込む単体ランディングページ。

## 概要
- 静的HTML/CSS/JS、ビルド不要
- 自己紹介HP・ポートフォリオとは独立したサイト。統合するかは公開後に判断
- デザイン: ダーク×紫〜シアンのネオングラデーション（Leonardo.ai/Runway.ml系を参照）
- 実績セクションはAI-OCR／営業AI社員／風袋管理データツール(FileData)を実名で紹介

## 構成
- `index.html` — 1ページ完結（ヘッダー/ヒーロー/課題提起/サービス/実績/流れ/お問い合わせ/フッター）
- `styles.css` — グローバルスタイル
- `main.js` — スムーススクロール・フォーム送信・モバイルナビ
- `assets/profile-qr.png` — LINE公式QR（自己紹介HPから流用）
- `gas/contact-form.gs` — 問い合わせフォーム受信用GAS Web Appソース

## 状態
- 実装中（2026-09-18〜）

## 参照
- 設計スペック: `docs/superpowers/specs/2026-09-18-ai-consult-lp-design.md`
```

- [ ] **Step 3: `index.html` の骨格を書く**

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI活用の導入・伴走支援 | 田代裕貴</title>
  <meta name="description" content="業務自動化・AIツール開発の導入支援と、AI活用の伴走コンサルを個人で提供しています。">
  <link rel="stylesheet" href="styles.css">
  <script src="main.js" defer></script>
</head>
<body>
  <header class="site-header">
    <div class="wrap header-inner">
      <a class="logo" href="#top">AIコンサル / 田代裕貴</a>
      <nav class="nav">
        <a href="#services">サービス</a>
        <a href="#works">実績</a>
        <a href="#flow">流れ</a>
        <a href="#contact">お問い合わせ</a>
      </nav>
    </div>
  </header>

  <main id="top">
    <!-- 以降のタスクでセクションを追加 -->
  </main>

  <footer class="site-footer">
    <div class="wrap">
      <p>&copy; 2026 田代裕貴</p>
    </div>
  </footer>
</body>
</html>
```

- [ ] **Step 4: `styles.css` にCSS変数とリセットを書く**

```css
:root {
  --bg: #0d0e1a;
  --bg-elevated: #14162a;
  --text: #f4f4f8;
  --text-muted: #a9acc4;
  --accent-violet: #6c64eb;
  --accent-cyan: #6bcce6;
  --accent-gradient: linear-gradient(135deg, var(--accent-violet), var(--accent-cyan));
  --space-section: clamp(72px, 10vw, 140px);
  --max-width: 1120px;
  --font-en: "Inter", "Segoe UI", sans-serif;
  --font-jp: "Noto Sans JP", "Yu Gothic", "游ゴシック", sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-jp);
  line-height: 1.7;
}

.wrap {
  max-width: var(--max-width);
  margin-inline: auto;
  padding-inline: 24px;
}

a { color: inherit; }

.site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: rgba(13, 14, 26, 0.85);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
}

.nav { display: flex; gap: 24px; }

.site-footer {
  padding-block: 48px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
}
```

- [ ] **Step 5: `main.js` に空のイベント初期化だけ書く**

```javascript
document.addEventListener("DOMContentLoaded", () => {
  // 以降のタスクでナビ開閉・スムーススクロール・フォーム送信を追加
});
```

- [ ] **Step 6: ブラウザで骨格が表示されることを確認**

`mcp__claude-in-chrome__navigate` で `file:///<絶対パス>/ai-consult-lp/index.html` を開き、ヘッダー（ロゴ＋ナビ）とダーク背景が表示されていることをスクリーンショットで確認する。

- [ ] **Step 7: コミット**

```bash
git add ai-consult-lp/
git commit -m "Scaffold AI consulting LP project structure"
```

---

## Task 2: ヒーローセクション

**Files:**
- Modify: `ai-consult-lp/index.html`（`<main>` 内に `<section id="hero">` を追加）
- Modify: `ai-consult-lp/styles.css`（`.hero` 関連スタイルを追記）

**Interfaces:**
- Consumes: Task 1 で定義した `--accent-gradient` `--space-section` `--max-width` などのCSS変数
- Produces: `.btn-primary`（LINE誘導CTAで使う共通ボタンクラス）と `.btn-secondary`（副CTA）を定義。以降のセクションのCTAボタンもこのクラスを使う。

- [ ] **Step 1: `index.html` にヒーローセクションを追加**

```html
<section id="hero" class="hero">
  <div class="wrap hero-inner">
    <p class="eyebrow">AI導入・活用支援</p>
    <h1>AIを「使える武器」に変える、<br>個人事業主のためのAI伴走者。</h1>
    <p class="hero-sub">
      業務自動化ツールの開発から、AI活用の社内定着まで。
      中小企業・個人事業の現場に合わせて、無理なく続けられるAI活用を一緒につくります。
    </p>
    <div class="hero-cta">
      <a class="btn-primary" href="https://lin.ee/5SAPZeC" target="_blank" rel="noopener">LINEで相談する</a>
      <a class="btn-secondary" href="#contact">フォームで問い合わせる</a>
    </div>
  </div>
</section>
```

- [ ] **Step 2: `styles.css` にヒーローとボタンのスタイルを追加**

```css
.hero {
  min-height: 100svh;
  display: flex;
  align-items: center;
  background:
    radial-gradient(circle at 20% 20%, rgba(108, 100, 235, 0.25), transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(107, 204, 230, 0.2), transparent 50%),
    var(--bg);
}

.hero-inner { padding-block: 96px; }

.eyebrow {
  font-family: var(--font-en);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-cyan);
  font-size: 0.85rem;
  margin-bottom: 16px;
}

.hero h1 {
  font-family: var(--font-en), var(--font-jp);
  font-size: clamp(2rem, 5vw, 3.25rem);
  line-height: 1.3;
  margin: 0 0 24px;
}

.hero-sub {
  color: var(--text-muted);
  max-width: 560px;
  margin-bottom: 32px;
}

.hero-cta { display: flex; gap: 16px; flex-wrap: wrap; }

.btn-primary,
.btn-secondary {
  display: inline-block;
  padding: 14px 28px;
  border-radius: 999px;
  font-weight: 600;
  text-decoration: none;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.btn-primary {
  background: var(--accent-gradient);
  color: #0d0e1a;
}

.btn-secondary {
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: var(--text);
}

.btn-primary:hover,
.btn-secondary:hover { transform: translateY(-2px); }
```

- [ ] **Step 3: ブラウザでfirst viewport内に収まっているか確認**

`mcp__claude-in-chrome__navigate` で `index.html` を再読み込みし、`resize_window` でPC幅(1280x800前後)にした状態でスクロールなしにヒーロー全体（ナビ・見出し・CTA）が見えることをスクリーンショットで確認する。

- [ ] **Step 4: コミット**

```bash
git add ai-consult-lp/index.html ai-consult-lp/styles.css
git commit -m "Add hero section to AI consulting LP"
```

---

## Task 3: 課題提起セクション

**Files:**
- Modify: `ai-consult-lp/index.html`（`<section id="pain-points">` を追加）
- Modify: `ai-consult-lp/styles.css`（`.pain-points` 関連スタイルを追記）

**Interfaces:**
- Consumes: Task 1 の `--space-section`、`.wrap` レイアウト
- Produces: `.section-title`（以降の全セクション見出しで共通利用するクラス）、`.card-grid` / `.card`（カード型レイアウトの共通クラス。Task 4以降でも再利用）

- [ ] **Step 1: `index.html` に課題提起セクションを追加**

```html
<section id="pain-points" class="pain-points">
  <div class="wrap">
    <h2 class="section-title">こんな悩み、抱えていませんか？</h2>
    <div class="card-grid">
      <div class="card">
        <h3>AIを使いたいが何から始めればいいか分からない</h3>
        <p>ツールは知っていても、自社の業務のどこに当てはめればいいか判断できない。</p>
      </div>
      <div class="card">
        <h3>ツールを入れても現場に定着しない</h3>
        <p>導入したはいいが、一部の人しか使わず、結局元のやり方に戻ってしまう。</p>
      </div>
      <div class="card">
        <h3>相談できる相手が社内にいない</h3>
        <p>情報は溢れているが、自社の状況を踏まえて相談できる相手がいない。</p>
      </div>
      <div class="card">
        <h3>外注する予算感・進め方が分からない</h3>
        <p>開発会社に頼むには大げさ、自作するには時間がない、という中間の悩み。</p>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: `styles.css` に共通見出し・カードグリッド・課題提起セクションのスタイルを追加**

```css
section { padding-block: var(--space-section); }

.section-title {
  font-family: var(--font-en), var(--font-jp);
  font-size: clamp(1.5rem, 3vw, 2.25rem);
  margin: 0 0 48px;
  text-align: center;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 24px;
}

.card {
  background: var(--bg-elevated);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 24px;
}

.card h3 {
  margin: 0 0 12px;
  font-size: 1.05rem;
}

.card p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.95rem;
}
```

- [ ] **Step 3: ブラウザでカードが4枚グリッド表示されることを確認**

`navigate` で再読み込みし、PC幅・スマホ幅(375px)の両方でカードが崩れずに表示されることをスクリーンショットで確認する。

- [ ] **Step 4: コミット**

```bash
git add ai-consult-lp/index.html ai-consult-lp/styles.css
git commit -m "Add pain points section to AI consulting LP"
```

---

## Task 4: サービス2本柱セクション

**Files:**
- Modify: `ai-consult-lp/index.html`（`<section id="services">` を追加）
- Modify: `ai-consult-lp/styles.css`（`.services` 関連スタイルを追記）

**Interfaces:**
- Consumes: Task 3 の `.section-title`、Task 1 の `--accent-gradient`

- [ ] **Step 1: `index.html` にサービスセクションを追加**

```html
<section id="services" class="services">
  <div class="wrap">
    <h2 class="section-title">提供するサービス</h2>
    <div class="service-grid">
      <div class="service-item">
        <span class="service-index">01</span>
        <h3>AIツール開発・業務自動化導入支援</h3>
        <p>
          帳票OCRや営業リサーチなど、現場の反復作業をAIで自動化するツールを設計・開発します。
          既存の業務フローを崩さず、使い続けられる形で導入することを重視しています。
        </p>
      </div>
      <div class="service-item">
        <span class="service-index">02</span>
        <h3>AI活用コンサル・伴走支援</h3>
        <p>
          「何から手をつけるか」の整理から、社内での使い方の定着まで並走します。
          単発の提案で終わらせず、実際に現場で使われる状態まで一緒に作ります。
        </p>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: `styles.css` にサービスセクションのスタイルを追加**

```css
.service-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 32px;
}

.service-item {
  padding: 32px;
  border-radius: 20px;
  background: linear-gradient(180deg, var(--bg-elevated), var(--bg));
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.service-index {
  display: inline-block;
  font-family: var(--font-en);
  font-size: 0.85rem;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--accent-gradient);
  color: #0d0e1a;
  margin-bottom: 16px;
}

.service-item h3 { margin: 0 0 12px; }
.service-item p { margin: 0; color: var(--text-muted); }
```

- [ ] **Step 3: ブラウザで2カラム表示を確認**

`navigate` で再読み込みし、PC幅で2カラム、375px幅で1カラムに折り返ることをスクリーンショットで確認する。

- [ ] **Step 4: コミット**

```bash
git add ai-consult-lp/index.html ai-consult-lp/styles.css
git commit -m "Add services section to AI consulting LP"
```

---

## Task 5: 実績・事例セクション

**Files:**
- Modify: `ai-consult-lp/index.html`（`<section id="works">` を追加）
- Modify: `ai-consult-lp/styles.css`（`.works` 関連スタイルを追記）

**Interfaces:**
- Consumes: Task 3 の `.section-title` `.card-grid` `.card`

- [ ] **Step 1: `index.html` に実績セクションを追加**

```html
<section id="works" class="works">
  <div class="wrap">
    <h2 class="section-title">導入・開発実績</h2>
    <div class="card-grid">
      <div class="card">
        <h3>AI-OCR（帳票OCR × Excel連携ツール）</h3>
        <p><strong>課題:</strong> 紙の帳票データを手入力でExcelに転記しており、時間もミスも多かった。</p>
        <p><strong>アプローチ:</strong> React + Gemini APIで指定領域だけを読み取るOCRツールを開発し、Excelへのマッピングまで自動化。</p>
        <p><strong>成果:</strong> 転記作業の大幅な時間短縮と入力ミスの削減を実現。</p>
      </div>
      <div class="card">
        <h3>営業AI社員（個別リサーチ＋提案文生成）</h3>
        <p><strong>課題:</strong> 営業先ごとの下調べや提案文の作成に時間がかかり、営業活動の量が増やせなかった。</p>
        <p><strong>アプローチ:</strong> Web検索を活用した個別リサーチと、テンプレート保存・再利用機能を持つAIツールを構築。</p>
        <p><strong>成果:</strong> 提案文作成の工数を圧縮し、営業アプローチの母数を増やせる体制に。</p>
      </div>
      <div class="card">
        <h3>風袋管理データツール「FileData」</h3>
        <p><strong>課題:</strong> 現場ごとに異なる風袋管理データをバラバラに管理しており、集計に手間がかかっていた。</p>
        <p><strong>アプローチ:</strong> 複数データベースに対応した風袋管理ツールを開発し、現場の運用フローに合わせて機能を拡張。</p>
        <p><strong>成果:</strong> 現場担当者が一つのツールでデータ管理を完結できる状態を実現。</p>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: `styles.css` に実績カード内の強調テキストのスタイルを追加**

```css
.works .card p { margin: 0 0 8px; }
.works .card p:last-child { margin-bottom: 0; }
.works .card strong { color: var(--text); }
```

- [ ] **Step 3: ブラウザで3件の事例カードが表示されることを確認**

`navigate` で再読み込みし、3枚のカードに課題・アプローチ・成果がそれぞれ表示されていることをスクリーンショットで確認する。

- [ ] **Step 4: コミット**

```bash
git add ai-consult-lp/index.html ai-consult-lp/styles.css
git commit -m "Add case studies section to AI consulting LP"
```

---

## Task 6: 導入の流れセクション

**Files:**
- Modify: `ai-consult-lp/index.html`（`<section id="flow">` を追加）
- Modify: `ai-consult-lp/styles.css`（`.flow` 関連スタイルを追記）

**Interfaces:**
- Consumes: Task 3 の `.section-title`、Task 1 の `--accent-gradient`

- [ ] **Step 1: `index.html` に導入の流れセクションを追加**

```html
<section id="flow" class="flow">
  <div class="wrap">
    <h2 class="section-title">導入の流れ</h2>
    <ol class="flow-steps">
      <li>
        <span class="flow-num">1</span>
        <h3>ヒアリング</h3>
        <p>現状の業務フローと課題感を、LINEまたはフォームからの相談を起点にお伺いします。</p>
      </li>
      <li>
        <span class="flow-num">2</span>
        <h3>提案</h3>
        <p>自動化すべき範囲とコンサルで伴走すべき範囲を切り分け、進め方を具体的に提案します。</p>
      </li>
      <li>
        <span class="flow-num">3</span>
        <h3>開発・伴走</h3>
        <p>ツール開発、または定着までの伴走支援を実施。途中経過はこまめに共有します。</p>
      </li>
      <li>
        <span class="flow-num">4</span>
        <h3>運用</h3>
        <p>現場で使われ続ける状態まで確認し、必要に応じて改善サイクルを回します。</p>
      </li>
    </ol>
  </div>
</section>
```

- [ ] **Step 2: `styles.css` に導入の流れのスタイルを追加**

```css
.flow-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
}

.flow-steps li {
  position: relative;
  padding: 24px;
  border-radius: 16px;
  background: var(--bg-elevated);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.flow-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent-gradient);
  color: #0d0e1a;
  font-weight: 700;
  margin-bottom: 16px;
}

.flow-steps h3 { margin: 0 0 8px; }
.flow-steps p { margin: 0; color: var(--text-muted); font-size: 0.95rem; }
```

- [ ] **Step 3: ブラウザで4ステップが横並び/縦並びで表示されることを確認**

`navigate` で再読み込みし、PC幅で4カラム、375px幅で1カラムに折り返ることをスクリーンショットで確認する。

- [ ] **Step 4: コミット**

```bash
git add ai-consult-lp/index.html ai-consult-lp/styles.css
git commit -m "Add process flow section to AI consulting LP"
```

---

## Task 7: お問い合わせセクション（LINE + フォームUI）

**Files:**
- Modify: `ai-consult-lp/index.html`（`<section id="contact">` を追加）
- Modify: `ai-consult-lp/styles.css`（`.contact` 関連スタイルを追記）
- Create: `ai-consult-lp/assets/profile-qr.png`（`自己紹介HP/assets/profile-qr.png` をコピー）

**Interfaces:**
- Consumes: Task 3 の `.section-title`、Task 2 の `.btn-primary`
- Produces: `<form id="contact-form">` に `name="name"` `name="email"` `name="message"` の入力欄と `id="form-status"` の結果表示要素。Task 8のJSがこのDOM構造を前提に実装される。

- [ ] **Step 1: 既存のLINE公式QR画像をコピー**

```bash
cp "自己紹介HP/assets/profile-qr.png" "ai-consult-lp/assets/profile-qr.png"
```

- [ ] **Step 2: `index.html` にお問い合わせセクションを追加**

```html
<section id="contact" class="contact">
  <div class="wrap contact-inner">
    <h2 class="section-title">お問い合わせ</h2>
    <div class="contact-grid">
      <div class="contact-line">
        <h3>LINEで相談する</h3>
        <p>まずは気軽に、LINEで今の状況を教えてください。</p>
        <a class="btn-primary" href="https://lin.ee/5SAPZeC" target="_blank" rel="noopener">LINE公式アカウントを開く</a>
        <img class="qr" src="assets/profile-qr.png" alt="LINE公式アカウントQRコード" width="140" height="140">
      </div>
      <form id="contact-form" class="contact-form">
        <h3>フォームで相談する</h3>
        <label>
          お名前
          <input type="text" name="name" required>
        </label>
        <label>
          メールアドレス
          <input type="email" name="email" required>
        </label>
        <label>
          相談内容
          <textarea name="message" rows="4" required></textarea>
        </label>
        <button type="submit" class="btn-primary">送信する</button>
        <p id="form-status" role="status"></p>
      </form>
    </div>
  </div>
</section>
```

- [ ] **Step 3: `styles.css` にお問い合わせセクションのスタイルを追加**

```css
.contact-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 40px;
  align-items: start;
}

.contact-line .qr {
  display: block;
  margin-top: 24px;
  border-radius: 12px;
}

.contact-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.contact-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.contact-form input,
.contact-form textarea {
  background: var(--bg-elevated);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--text);
  font-family: inherit;
  font-size: 1rem;
}

.contact-form button { align-self: flex-start; border: none; cursor: pointer; }

#form-status { font-size: 0.9rem; color: var(--text-muted); min-height: 1.2em; }
```

- [ ] **Step 4: ブラウザでLINEブロックとフォームが並んで表示されることを確認**

`navigate` で再読み込みし、QR画像が表示されること・フォーム入力欄が崩れずに表示されることをスクリーンショットで確認する。

- [ ] **Step 5: コミット**

```bash
git add ai-consult-lp/index.html ai-consult-lp/styles.css ai-consult-lp/assets/profile-qr.png
git commit -m "Add contact section with LINE CTA and form UI"
```

---

## Task 8: フォーム送信JS・スムーススクロール・GAS Web Appソース

**Files:**
- Modify: `ai-consult-lp/main.js`
- Create: `ai-consult-lp/gas/contact-form.gs`

**Interfaces:**
- Consumes: Task 7 の `#contact-form`（`name` / `email` / `message` フィールド）と `#form-status`
- Produces: `main.js` に `GAS_ENDPOINT` 定数（デプロイ後にURLを差し替える箇所として明示）

- [ ] **Step 1: `main.js` にスムーススクロールとフォーム送信処理を追加**

```javascript
document.addEventListener("DOMContentLoaded", () => {
  // ヘッダー内リンクのスムーススクロール
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.getAttribute("href");
      const target = document.querySelector(targetId);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth" });
    });
  });

  // 問い合わせフォーム送信
  const GAS_ENDPOINT = "https://script.google.com/macros/s/REPLACE_WITH_DEPLOYMENT_ID/exec";
  const form = document.getElementById("contact-form");
  const status = document.getElementById("form-status");

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "送信中...";

      const formData = new FormData(form);
      const payload = {
        name: formData.get("name"),
        email: formData.get("email"),
        message: formData.get("message"),
      };

      try {
        await fetch(GAS_ENDPOINT, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        });
        status.textContent = "送信しました。ご連絡ありがとうございます。";
        form.reset();
      } catch (error) {
        status.textContent = "送信に失敗しました。お手数ですがLINEからご連絡ください。";
      }
    });
  }
});
```

- [ ] **Step 2: `gas/contact-form.gs` にWeb Appソースとデプロイ手順コメントを書く**

```javascript
/**
 * AIコンサルLPの問い合わせフォームを受信するGAS Web App。
 *
 * デプロイ手順:
 * 1. https://script.google.com/ で新規プロジェクトを作成し、このファイルの内容を貼り付ける
 * 2. スプレッドシートを新規作成し、そのIDを SPREADSHEET_ID に設定する
 * 3. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」を選択
 * 4. 「実行するユーザー」= 自分、「アクセスできるユーザー」= 全員、でデプロイ
 * 5. 発行されたウェブアプリURLを ai-consult-lp/main.js の GAS_ENDPOINT に設定する
 */

const SPREADSHEET_ID = "REPLACE_WITH_SPREADSHEET_ID";
const SHEET_NAME = "お問い合わせ";

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME)
    || SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet(SHEET_NAME);

  sheet.appendRow([
    new Date(),
    data.name || "",
    data.email || "",
    data.message || "",
  ]);

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 3: ブラウザでスムーススクロールを確認**

`navigate` で再読み込みし、ヘッダーの「サービス」「実績」「流れ」「お問い合わせ」リンクをクリックして該当セクションへスムーススクロールすることを確認する（`mcp__claude-in-chrome__computer` でクリック操作）。

- [ ] **Step 4: フォーム送信のUI動作を確認（実送信はエンドポイント未設定のため対象外）**

`navigate` で再読み込みし、フォームに仮の値を入力して送信ボタンを押し、`#form-status` に「送信中...」→成功または失敗メッセージが表示されることを確認する（`mode: "no-cors"` のため実際の到達は確認できないが、UIの状態遷移は確認できる）。`read_console_messages` でJSエラーが出ていないことも確認する。

- [ ] **Step 5: コミット**

```bash
git add ai-consult-lp/main.js ai-consult-lp/gas/contact-form.gs
git commit -m "Add form submission JS and GAS web app backend"
```

---

## Task 9: フッターと相互リンク、全体通し確認

**Files:**
- Modify: `ai-consult-lp/index.html`（`<footer>` の内容を更新）
- Modify: `ai-consult-lp/styles.css`（`.footer-links` を追記）

**Interfaces:**
- Consumes: Task 1〜8で作成した全セクション

- [ ] **Step 1: `index.html` のフッターを相互リンク入りに更新**

```html
<footer class="site-footer">
  <div class="wrap footer-inner">
    <p>&copy; 2026 田代裕貴</p>
    <nav class="footer-links">
      <a href="../自己紹介HP/index.html">自己紹介</a>
      <a href="../portfolio/index.html">制作実績</a>
      <a href="https://lin.ee/5SAPZeC" target="_blank" rel="noopener">LINE公式</a>
    </nav>
  </div>
</footer>
```

- [ ] **Step 2: `styles.css` にフッターリンクのスタイルを追加**

```css
.footer-inner {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.footer-links { display: flex; gap: 16px; }
.footer-links a { color: var(--text-muted); text-decoration: none; }
.footer-links a:hover { color: var(--text); }
```

- [ ] **Step 3: 全体を通しでブラウザ確認**

`navigate` で `index.html` を開き、PC幅(1280px)とスマホ幅(375px)の両方で先頭から末尾までスクロールしながらスクリーンショットを取り、セクション間の余白（80〜160px）が保たれていること、テキストが横にはみ出していないこと、フッターの相互リンク（自己紹介HP・ポートフォリオ・LINE）が正しいパスになっていることを確認する。`read_console_messages` でJSエラーがないことも最終確認する。

- [ ] **Step 4: コミット**

```bash
git add ai-consult-lp/index.html ai-consult-lp/styles.css
git commit -m "Add footer cross-links and finalize AI consulting LP layout"
```
