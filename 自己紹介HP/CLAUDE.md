# 自己紹介HP

田代裕貴さん(臨床工学技士 / AI・DXコンサル)の自己紹介・プロフィールサイト。単一HTMLファイルのランディングページ。

## 構成

- `index_4.html` — サイト全体(HTML/CSS/JS込みの単一ファイル)

## 編集方法

このテンプレートは **`SITE` オブジェクト(script内、"ここから下のSITEオブジェクトだけを書き換えれば〜"というコメント以降)だけを編集する** ことを前提に作られている。HTML構造・CSS・描画ロジック(`SITE`定義より下の部分)は基本的に触らない。

テキスト・見出し・リンク・カードの中身などはすべて `SITE` オブジェクトのプロパティに入っており、`document.getElementById(...).innerHTML = \`...\`` のテンプレートリテラルで描画される。

### セクション構成(`SITE`のキーとページ内セクションの対応)

| SITEキー | セクションID | 内容 |
|---|---|---|
| `meta` | `<title>` | ページタイトル |
| `nav` | `#nav` | ナビゲーションバー(名前・肩書き・CTAボタン) |
| `hero` | `#hero` | ファーストビュー(見出し・リード文・CTA・統計) |
| `values` | `#values` | こだわり・価値観カード |
| `philosophy` | `#philosophy` | アプローチ・フロー・引用 |
| `beforeAfter` | `#beforeafter` | 実績に基づくBefore/After比較 |
| `impact` | `#impact` | 効果測定(体感ベースの概算・定性表現) |
| `usecases` | `#usecases` | 想定活用シーン(業種は名言しない) |
| `focus` | `#focus` | 取り組んでいること一覧 |
| `process` | `#process` | 3ステップの進め方 |
| `record` | `#record` | 今取り組んでいること(タグフィルター付きカード) |
| `profile` | `#profile-sec` | プロフィール詳細(経歴・サイドステータス) |
| `note` | `#whynow` | 補足メッセージ |
| `contact` | `#cta` | お問い合わせ |
| `footer` | `<footer>` | フッター(リンク・コピーライト) |

## 注意点

- `contact.ctas`(Email/公式LINE)と`footer.links`(Email/公式LINEの2件のみ)は実際のアドレス/URLに設定済み(`nexsist88@gmail.com` / `https://lin.ee/WNdDlGb`)。X(Twitter)/Noteは実URL未提供のためfooter.linksから削除済み。
- CTAセクションの公式LINEボタンはクリックでQRコード(`LINE_QR_DATA_URI`、data URI埋め込み)をトグル表示する。ボタン自体はlin.eeへのリンクとしても機能する。
- 画像は `profile.avatarImage` にURLを入れると背景画像として表示される(現状は空でグラデーションアバター)。
- レスポンシブは `@media (max-width:860px)` 以下で対応済み。
