# 自己紹介HP

田代裕貴さん(臨床工学技士 / AI・DXコンサル)の自己紹介・プロフィールサイト。ビルド不要の静的ランディングページ。

## 構成

- `index.html` — 公開用のメインページ。本文はSEO・耐障害性を考慮して静的HTMLで記述
- `styles.css` — レイアウト、配色、レスポンシブ、フォーカス表示
- `main.js` — ナビゲーション、LINE QR表示
- `assets/work-*.png` — 代表実績3件の静止プレビュー（公開ツールの画面。CSV解析はデモデータ）
- `assets/profile-mark.svg` — 顔写真へ差し替え可能な仮プロフィール画像
- `assets/social-card.png` — OGP・SNS共有用画像（1200×630）。実際に配信するのはこのPNG（SVGはTwitter/Facebook/LINE等でOGP画像として表示されないため）
- `assets/social-card.svg` — 上記PNGの元デザイン（参考用。配信はしていない）
- `assets/build-og-card.py` — `social-card.png`の生成スクリプト。`python assets/build-og-card.py assets/social-card.png`で再生成（要Pillow、Windowsフォント）
- `index_4.html` — 旧URL互換用。アクセス時に`index.html`へ移動

`index.html`の`<head>`にJSON-LD構造化データ（`ProfilePage` / `WebSite` / `Person` / `FAQPage`の`@graph`）を埋め込み済み。プロフィール文・FAQ・公開ツールを変更したら、対応するJSON-LDの記述も合わせて更新する。

## 編集方法

文章やカードは`index.html`を編集する。デザインは`styles.css`、動作は`main.js`に分離している。JavaScriptが無効でも本文とリンクは閲覧できる。

### セクション構成

| セクションID | 内容 |
|---|---|
| `#top` | 名前・強み・制作実績と相談への導線 |
| `#profile` | 現場経験と仕事への姿勢を紹介 |
| `#works` | 代表実績3件の課題・機能・静止画像とツールへのリンク |
| `#services` | 対応範囲、研修、料金の考え方 |
| `#flow` | ご相談から納品までの進め方（5ステップ） |
| `#scope` | 対応できること・対応していないこと |
| `#faq` | よくある質問 |
| `#contact` | メール、LINE、QRコード |

旧 `#results`・`#cases` は `#works`、旧 `#issues` は `#services` 内のアンカーとして維持。重複する事例は実績カードへ統合済み。本文は最初から表示し、スクロールアニメーションによる非表示は使わない。

## 注意点

- メールとLINEは実際の連絡先に設定済み。
- 「公式LINEを開く」と「QRコードを表示」は別操作にしている。
- 顔写真を掲載する場合は`assets/profile-mark.svg`を写真へ置換し、`index.html`内の拡張子と代替テキストも更新する。
- 実測していない時間、未確認の研修人数、許諾のない利用者コメントは掲載しない。
- プレビュー画像の更新時は個人情報や実データを入力・撮影しない。埋め込みではなく静止画像と外部リンクを使う。
- 制作実績ポートフォリオ（`claude/portfolio/`、正規URL `https://tassy5865-lang.github.io/claude/portfolio/`）と相互リンクしている。ヘッダーの「ポートフォリオ ↗」、`#works`末尾のCTA、フッター「制作実績一覧」、Person構造化データ`sameAs`の4か所。URLは末尾スラッシュ形（`index.html`を付けない）で統一する。ポートフォリオ側のヘッダーには「プロフィール ↗」でこのサイトへのリンクがある。
