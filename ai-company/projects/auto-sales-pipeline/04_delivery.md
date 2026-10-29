# 納品書：auto-sales-pipeline（第1段階）— QA待ち

状態: **実装済み・独立QA未実施。** 運用開始前に qa-tester の受入判定と人間の確認が必要。

## 成果物

| ファイル | 役割 |
|---|---|
| `scripts/sales_pipeline.py` | URL正規化、重複排除、5分類、適格ゲート、結果記録、採用済み抽出、テンプレート検査（標準ライブラリのみ・通信なし） |
| `scripts/test_sales_pipeline.py` | 上記のダミーデータ検証（20件） |
| `.claude/skills/sales-pipeline/` | `/sales-pipeline [条件]` 調査→文案→保存→停止 |
| `.claude/skills/record-sales-outcome/` | `/record-sales-outcome <ID>` 営業結果の記録 |
| `.claude/skills/refresh-sales-template/` | `/refresh-sales-template <分類>` テンプレート差分案（承認制） |
| `templates/sales-pipeline/` | 探索条件の雛形と5分類の応募文部品テンプレート（公開可・プレースホルダーのみ） |
| `scripts/validate_scaffold.py` | 新スキル・テンプレートの検査を追加 |

## 引き継ぎ

1. `sales/private/config/search-profile.md` を `templates/sales-pipeline/search-profile.md` からコピーし、媒体・最低単価・除外条件・評価単位・AI再入力の承認範囲を**人間が**記入する（未確定のまま推測で動かさない）。
2. 種類別テンプレートを使い始める場合は `templates/sales-pipeline/application_<分類>.md` を `sales/private/templates/<分類>/application.md` にコピーする。
3. `python scripts/test_sales_pipeline.py` と `python scripts/validate_scaffold.py` を実行して確認する。
4. 必要なら `.claude/settings.json` の `allow` に `Read/Edit(./sales/private/{config,opportunities,templates,memory}/**)` を追加する（今回、権限設定は自動判定で変更を拒否されたため未適用。適用は人間が判断する）。

## 設計との差分

- 種類別テンプレートの初期版は、Git管理外の `sales/private/templates/` ではなく公開可能な `templates/sales-pipeline/` に置いた（実営業データを含まないため）。
- 第2段階（定期実行）は未着手。実行は手動のみ。
