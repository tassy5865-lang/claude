# 琥珀(こはく)サイト

姫路の女性専用・完全予約制サロン「琥珀」の公開用ホームページ。ビルド不要の静的サイト。

## 構成
- `index.html` — 本文は静的HTML。`<head>` に JSON-LD(HealthAndBeautyBusiness)。住所・説明を変えたら JSON-LD も更新する
- `styles.css` / `main.js` — 見た目と補助動作(ナビ開閉・固定CTA・フェード)。JSなしでも全文が読める
- `images/` — `owner-steam.jpg`、`herbs.jpg`、`og-image.png`。`tools/prepare_images.py` で元画像から再生成できる(要Pillow)
- `tools/check_site.py` — 料金・リンク・必須文言・alt・JSON-LD の検査。変更後は `python tools/check_site.py`

## ルール
- 料金・メニューは `アロマサロン琥珀　メニュー.png`(店主のメニュー表)を正とする(2026-10-04に予約サイト基準から変更。予約サイトの表示とは差がある)。変更したら `check_site.py` の `PRICES`・`ROWS` と `index.html` の両方を直す
- 屋号の表記は「琥珀(こはく)」。商標 ® を付ける語は仕様どおり
- 電話番号・口コミ・効能の断定は載せない。お客様の顔や背中が写る写真は、本人の掲載許可がない限り使わない
- 元画像(日本語ファイル名のスクリーンショット・メニュー画像)はこのフォルダに残す。削除・リネームは OneDrive 同期の事故を避けるため git で行う
- 設計書: `docs/superpowers/specs/2026-10-03-kohaku-salon-site-design.md`

## 公開前に未確認のこと
- 店主・田代真弓さんの掲載了承(note記事の内容を含む)
- 元の1枚目の写真(施術中・背中が写る)は掲載許可が未確認のため使っていない
- 料金が税込か、ペア蒸しが2名分か(表記を足すか)
- 公開URLが決まったら、`canonical`・`og:url`・`og:image`(絶対URL)を `index.html` に、`url` を JSON-LD に追加
