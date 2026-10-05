# 琥珀 予約システム

アロマサロン「琥珀」の予約サイト。お客様向け予約フロー、My Kohaku(マイページ)、管理画面、LINE通知(確認・2日前・当日リマインド)。

- 開発者向けの詳細: [CLAUDE.md](CLAUDE.md)
- まず動きを見る: `index.html` / `admin.html` をブラウザで開く(`GAS_URL` が空ならデモ表示。管理画面のパスワードは `demo`、My Kohakuの確認コードは `123456`)

## 本番セットアップ(概要)
1. 予約管理用のGoogleスプレッドシートを作成 → 拡張機能 → Apps Script に `gas/Code.gs` を貼り付け(または clasp で反映)
2. `CONFIG`(通知先メール `OWNER_EMAIL`、`SITE_URL`、定休日など)を編集
3. スクリプト プロパティに `ADMIN_PASSWORD`(必須)、LINE連携を使う場合は `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_LOGIN_CHANNEL_ID` / `LIFF_ID` を追加
4. `setup` を実行(権限承認、シート作成)→ `installTriggers` を一度実行(リマインド)
5. デプロイ → ウェブアプリ(実行: 自分 / アクセス: 全員)→ 発行URLを `index.html` と `admin.html` の `CONFIG.GAS_URL` に設定
6. LINE連携: LINE Developers で、公式アカウントと同じプロバイダーに「LINEログイン」チャネルとLIFFアプリを作成(エンドポイント=`index.html` の公開URL、スコープ `openid`)。`index.html` の `CONFIG.LIFF_ID` を設定
7. `index.html` / `admin.html` を公開(GitHub Pagesなど)。管理画面は別URLで運用し、推測されにくくする

## テスト
```bash
npm install && npm test
```
