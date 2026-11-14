# Nexsist サービスサイト（旧 AIコンサルLP）

屋号 **Nexsist**（運営：田代裕貴）のサービスサイト。ホームページ制作・予約システム・LINE公式／Lステップ構築・AIツール開発を、お店・小規模事業者向けに案内する単体ページ。フォルダ名と公開URL（`https://tassy5865-lang.github.io/claude/ai-consult-lp/`）は旧名のまま。

## 概要
- 静的HTML/CSS/JS、ビルド不要
- デザイン（2026-11-14 リニューアル）: ダーク(#06061a)×紫(#7b5cff)〜水色(#22d3ee)の光＋半透明カード＋大きな英字（WEB. LINE. AI.／SERVICE／WORKS…）。設計 `docs/superpowers/specs/2026-11-14-ai-consult-lp-renewal-design.md`、たたき台 `...-mockup-v1.html`
- 大英字は装飾（`.giant`＋`aria-hidden="true"`）。縁取りは可変フォントの輪郭の重なりを隠すため `color: var(--bg); paint-order: stroke fill` で描く
- 料金は載せない（「まずは相談」）

## 構成
- `index.html` — ヘッダー/ヒーロー/悩み/サービス(4)/実績/流れ/相談/フッター
- `styles.css` — 全スタイル（`:root` のトークン）
- `main.js` — スムーススクロール・フォーム送信（変更しない）
- `assets/work-kohaku.png` — 琥珀サイトのトップ画面（2026-11-14 撮影、1200×504）
- `assets/profile-qr.png` — LINE公式QR
- `assets/social-card.png` — OGP画像(1200×630)。`assets/build-og-card.py` で再生成（`python build-og-card.py social-card.png`、Pillow＋Windowsの Yu Gothic／Arial Black）
- `tests/` — `node --test ai-consult-lp/tests/*.test.mjs`（このNodeではディレクトリ指定 `tests/` は動かない）
  - `contact-form.test.mjs` — GAS受け口（ハニーポット `website`・入力長上限・先頭 `=+-@` 無害化・回数制限）
  - `page-structure.test.mjs` — フォームの id/name/maxlength、CSP 文字列、外部スクリプトなし・画像は `assets/` のみ、Nexsist のメタ/JSON-LD、4サービスと実績リンク、**数値の成果・料金を書いていないこと**、大英字が `aria-hidden`
  - `cross-links.test.mjs` — 自己紹介HP（v2・旧版）とポートフォリオから LP へのリンク表記が Nexsist（2026.09 のお知らせ1件は過去記録として除外）
- `gas/contact-form.gs` — 問い合わせ受信用GAS（スプレッドシート追記＋通知メール。修正したらGASに貼り直し→`testNotify`→「デプロイを管理」で新バージョン。2026-10-29 の防御強化は 2026-11-14 にデプロイ済み）

## 実績欄の方針（事実ベース）
- 成果の数値（%・倍・時間短縮・件数など）は書かない。テストで検出する
- 琥珀：公式サイトは公開中。予約システムは「開発済み・本番切替前」（デモは `GAS_URL` 空で実データにつながらない）。LINE連携は「確認メールのリンクから連携」のみ（テスト環境で確認済み）。LINEトーク内予約は載せない
- Lステップ連携：事業者名は伏せる。具体的な機能は聞いていないので書かない
- 店名・スクリーンショットの掲載は本人了承済み（2026-11-14）

## 状態
- 2026-11-14 Nexsist としてリニューアル（PC/375px 表示、コンソールエラーなしを確認）
