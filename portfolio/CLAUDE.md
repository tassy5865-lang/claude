# portfolio

田代裕貴さん(臨床工学技士 / AI・DXコンサル)の制作実績ポートフォリオ。単一HTMLファイルのランディングページ。

参考にしたサイト: https://sasukewebjob-ai.github.io/portfolio/ (Before→After形式の実績カード、タグ絞り込み、プロフィール導線という構成を踏襲)

## 構成

- `index.html` — サイト全体(HTML/CSS/JS込みの単一ファイル)
- `assets/line-official-qr.png` — 公式LINEの友だち追加用QR画像

## 編集方法

**`SITE` オブジェクト(script内)だけを書き換える**ことを前提にしている。HTML構造・CSS・描画ロジックは基本的に触らない。（`自己紹介HP` は2026-08-30にマルチファイル構成へ移行済みで、この単一ファイル+`SITE`方式を採用しているのはこのポートフォリオのみ。）

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
- ヒーローの公開実績数は `SITE.hero.stats` の `num:"auto"` により、`SITE.works.cards.length` から自動表示される。
- 各カードの「詳しく見る」ボタンから、Before/After・活用シーン(`useCases`)を表示するモーダル(`#work-modal`)が開く。参考サイト(https://sasukewebjob-ai.github.io/portfolio/ )のモーダル構造(単一モーダルをクリックのたびに`openModal`で内容だけ差し替える方式)を踏襲しているが、見出し文言・タブ構成は独自に作成。
- 配色は `自己紹介HP` と統一(ネイビー×スカイブルー、CSS変数は同じ命名: `--gold`=ネイビー, `--gold-soft`=スカイブルー)。
- `contact.ctas` と `footer.links` は Email(`nexsist88@gmail.com`)と公式LINE(`https://lin.ee/5SAPZeC`、旧`https://lin.ee/WNdDlGb`から2026-08-30に更新。LINE公式アカウント`@103lwyiq`)の2本立て。`contact.ctas`は配列で、1件目が塗りつぶしボタン(`.btn-primary`)、2件目以降が枠線ボタン(`.btn-line`)として自動描画される(`i===0`判定、`.hero-ctas`クラスを流用)。連絡導線を増やす場合はこの配列に追加するだけでよい。
- CONTACTセクションでは「公式LINE」リンクと「QRコードを表示」ボタンを分離している。`contact.ctas`の該当エントリに`showQrOnClick:true`を付けるとQR表示ボタンが追加される。QR本体は`assets/line-official-qr.png`、参照先は`LINE_QR_IMAGE_PATH`で管理する。LINEのURLを変更する場合はPNGも差し替える(`contact.qr.caption`はキャプション文言のみ`SITE`側で編集可能)。
- `#hero` の背景はグラデーションに加え、ノードネットワーク調のSVG(インラインdata URI、グロー用`<filter>`込み)を重ねている。ノード座標を変える場合はCSS内の`#hero{ background-image: ... }`を直接編集する(`SITE`オブジェクトの対象外)。
- `nav.profileHref` / `linkout.cardLinkHref` / `footer.links` の「プロフィール」リンクは `自己紹介HP` の正規URL `https://tassy5865-lang.github.io/claude/%E8%87%AA%E5%B7%B1%E7%B4%B9%E4%BB%8BHP/`（旧 `index_4.html` は使わない）を指しており、プロフィール本文はそちらに一本化して重複を避けている。ヘッダーの `プロフィール ↗`（`nav.profileLabel`/`Href`、別タブ）と `自己紹介HP` 側ヘッダーの `ポートフォリオ ↗` で相互リンクしている。`<head>` の Person 構造化データ `sameAs` も同URL。
- `SITE`の文字列は描画時にエスケープされる。装飾を許可する項目は`sanitizeRichHTML`を通し、`b`、`br`、`span.role-accent`のみを残す。リンクは`https:`、`mailto:`、ページ内アンカーのみ許可する。
- SEO用のdescription、canonical、OGP、Twitter Card、Person構造化データは`<head>`に直接定義している。公開URLや肩書きを変更した場合は`SITE`だけでなく、これらのメタ情報も更新する。
- Webフォントへの外部通信を避けるため、フォントはOS標準の日本語フォントスタックを使用する。
