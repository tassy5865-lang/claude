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
- `main.js` — スムーススクロール・フォーム送信（GAS_ENDPOINT未設定時はLINE誘導メッセージを表示）
- `assets/profile-qr.png` — LINE公式QR（自己紹介HPから流用）
- `assets/social-card.png` — OGP画像(1200x630)。`assets/build-og-card.py` で再生成（`python build-og-card.py social-card.png`、Pillow+Windows日本語フォント使用）
- `gas/contact-form.gs` — 問い合わせフォーム受信用GAS Web Appソース

## 状態
- 全8セクション実装済み・PC/スマホ幅で表示確認済み（2026-09-20）
- GAS Web Appデプロイ済み・`main.js` の `GAS_ENDPOINT` 設定済み・実送信テスト済み（2026-09-20）
- 実績セクションは事実ベースに修正済み（自作ツールの「こんな課題に/できること」＋公開中ツールへのリンク。成果の数値・導入事例的な表現は載せない）（2026-09-20）
- OGP/Twitterカード・canonical・JSON-LD(WebPage/ProfessionalService/Person)・Webフォント(Inter/Noto Sans JP)設定済み（2026-09-20）。canonicalとog:imageは公開予定URL `https://tassy5865-lang.github.io/claude/ai-consult-lp/` を前提（push後に到達を要確認）
- 未対応: 公開(push)、自己紹介HP・ポートフォリオからのリンク追加

## 参照
- 設計スペック: `docs/superpowers/specs/2026-09-18-ai-consult-lp-design.md`
