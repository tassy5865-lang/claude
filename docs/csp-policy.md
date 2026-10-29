# 公開ページのCSP(2026-10-29)

GitHub Pages は HTTP ヘッダーを設定できないため、各ページの `<head>` に `<meta http-equiv="Content-Security-Policy">` と `<meta name="referrer" content="strict-origin-when-cross-origin">` を入れている(`<meta charset>` の直後)。

共通の方針: `default-src 'self'` / `object-src 'none'` / `base-uri 'self'` / `form-action 'self'` / スクリプトは自分自身+必要な外部だけ。インラインのスクリプト・スタイルが多いため `'unsafe-inline'` は許可(それでも「知らない外部サイトのスクリプト読み込み」「知らない宛先への送信」は止まる)。`frame-ancestors` は meta では効かないため入れていない。

| ページ | 追加で許可している外部 |
|---|---|
| kohaku-booking / -test の index | スクリプト: static.line-scdn.net(LIFF)。通信: script.google.com・script.googleusercontent.com(GAS)、*.line.me・*.line-scdn.net・*.line-apps.com。フレーム: *.line.me |
| kohaku-booking / -test の admin | 通信: GAS のみ |
| ai-consult-lp | 通信: GAS のみ |
| 自己紹介HP/v2 | スクリプト: cdn.jsdelivr.net(three.js・GSAP) |
| AI-OCR | スクリプト: unpkg.com・cdnjs.cloudflare.com・cdn.sheetjs.com と `'unsafe-eval'`(ブラウザ内Babel)。通信: generativelanguage.googleapis.com・GAS・cdnjs。ワーカー: blob:・cdnjs |
| kohaku-site(別リポ) | スクリプト: www.googletagmanager.com。通信: *.google-analytics.com・*.analytics.google.com・*.googletagmanager.com |
| そのほか(portfolio・自己紹介HP・透析系・風袋管理) | 追加なし(自分自身+Googleフォントのみ) |

画像は `https:` を許可(外部の画像を使うため)。フォントは fonts.googleapis.com / fonts.gstatic.com。

## 外部サービスを足すとき
そのページの CSP に許可先を足さないと、ブラウザが読み込みを止める。足したら、ページを開いて動作を確認する(違反は `securitypolicyviolation` イベントで検出できる)。

## 確認していないこと
- LINEアプリ内でのLIFFログイン(実機)。通信先は `*.line.me` 系で許可しているが、LINE側が別ドメインを使う場合は止まる。LINEから予約サイトを開いて確認すること。
- AI-OCR の実際のGemini呼び出し(APIキーが必要)。GAS連携(Webhook)も未確認。
