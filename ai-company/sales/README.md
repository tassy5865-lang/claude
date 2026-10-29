# 営業データの保存ルール

## 公開可能

- `examples/`: 匿名化済みの応募文・見積サンプル
- このREADME

## 非公開

- `private/leads.md`: 実案件の調査記録
- `private/proposals/`: 実案件向けの未送信提案
- `private/evidence.md`: 実績の根拠と公開可否
- `private/*.local.md`: 個人の連絡先など。Claude読取禁止

`private/` は `.gitignore` でGit管理から除外します。ただし、Claudeで処理できるのは公開情報・社内情報のうち承認された内容だけです。顧客の機密情報や要配慮情報はここではなく、Claude読取禁止の `customer-data/` または案件内 `private/` に保存してください。

応募文には個人連絡先を書かず、`[送信時に人間が入力]` とします。人間が募集サイトへ貼り付ける直前にローカル情報を差し込みます。
