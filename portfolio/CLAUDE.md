# portfolio

田代裕貴さん(臨床工学技士 / AI・DXコンサル)の制作実績ポートフォリオ。単一HTMLファイルのランディングページ。

参考にしたサイト: https://sasukewebjob-ai.github.io/portfolio/ (Before→After形式の実績カード、タグ絞り込み、プロフィール導線という構成を踏襲)

## 構成

- `index.html` — サイト全体(HTML/CSS/JS込みの単一ファイル)

## 編集方法

`自己紹介HP/index_4.html` と同じ設計思想: **`SITE` オブジェクト(script内)だけを書き換える**ことを前提にしている。HTML構造・CSS・描画ロジックは基本的に触らない。

### セクション構成(`SITE`のキーとページ内セクションの対応)

| SITEキー | セクションID | 内容 |
|---|---|---|
| `meta` | `<title>` | ページタイトル |
| `nav` | `#nav` | ナビゲーションバー |
| `hero` | `#hero` | ファーストビュー(見出し・リード文・CTA・統計) |
| `pain` | `#pain` | 困りごと(課題提起)カード |
| `works` | `#works` | 制作実績一覧(タグ絞り込み付きカード、`href`は各ツールの公開URL) |
| `linkout` | `#linkout` | プロフィールページへの導線カード |
| `contact` | `#cta` | お問い合わせ |
| `footer` | `<footer>` | フッター |

## 注意点

- 実績を追加する場合は `SITE.works.cards` に `{ tag, status, title, text, tech, href, before, after, useCases }` を追加するだけでよい。`tag` は絞り込みボタンとして自動生成される。
- 各カードの「詳しく見る」ボタンから、Before/After・活用シーン(`useCases`)を表示するモーダル(`#work-modal`)が開く。参考サイト(https://sasukewebjob-ai.github.io/portfolio/ )のモーダル構造(単一モーダルをクリックのたびに`openModal`で内容だけ差し替える方式)を踏襲しているが、見出し文言・タブ構成は独自に作成。
- 配色は `自己紹介HP` と統一(ネイビー×スカイブルー、CSS変数は同じ命名: `--gold`=ネイビー, `--gold-soft`=スカイブルー)。
- `contact.linkHref` と `footer.links` のメールアドレスは `自己紹介HP` 同様 `hello@example.com` のプレースホルダーのまま(未対応)。
- `linkout.cardLinkHref` と `footer.links` の「プロフィール」リンクは `自己紹介HP` の公開URLを直接指しており、プロフィール本文はそちらに一本化して重複を避けている。
