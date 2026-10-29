# テスト記録：auto-sales-pipeline（第1段階）

結論: 開発者による自己テストは合格。**独立QA（qa-tester / opus）は未実施のため、納品可とは判定しない。**
根拠: `python scripts/test_sales_pipeline.py` 20件 OK。`validate_scaffold.py` の新規25項目 PASS（ダミー非公開ファイルを置いたコピーで実行）。
次アクション: qa-tester による独立レビューと、実媒体を使わない手動ドライラン。

## 自動テスト（ダミーデータのみ・ネットワーク不使用）

| 受入基準 / QA観点 | テスト | 結果 |
|---|---|---|
| URL正規化後の重複判定 | `test_equivalent_urls_collapse` / `test_same_url_does_not_multiply` | PASS |
| 同じ入力で案件フォルダーが増殖しない | `test_same_url_does_not_multiply` | PASS |
| 5分類と `other` へのフォールバック | `ClassifyTest`（同点・該当なし・英語語境界） | PASS |
| 直接URL未取得/募集終了/状態不明/取得日時なしで文案不可 | `test_ineligible_cases_*` / `test_missing_url_*` | PASS |
| 募集が後から終了したら文案不可に変わる | `test_closing_a_listing_blocks_later_proposals` | PASS |
| 再実行で既存記録を壊さない | `test_rerun_never_overwrites_existing_research` / `test_outcome_init_does_not_overwrite` | PASS |
| 索引が破損していても黙って作り直さない | `test_corrupt_index_is_not_silently_replaced` | PASS |
| `draft`・未確認の営業結果はテンプレート材料にならない | `OutcomeTest` | PASS |
| 固有情報（URL・連絡先・固有数値）の混入検出 | `LintTest` + 5分類の同梱テンプレートに適用 | PASS |
| 自動送信処理が存在しない | `test_script_has_no_network_or_send_capability`（通信・送信系モジュールをimportしない） | PASS |
| スキルが手動起動限定・テンプレート更新が承認制 | `validate_scaffold.py` | PASS |

## 未検証（正直な範囲）

- 実媒体の検索、LLMによる原文要約・営業文2案の品質: 未実施（スキルは文書で、挙動は実行して初めて確認できる）
- `sales/private/` がGit追跡されないこと: `.gitignore` で除外済みだが、この環境では `sales/private/` が無く `validate_scaffold.py` を本番構成で通せていない
- `sales/private/leads.md` との整合（`### ` 見出し規則）: 実ファイルが無く未確認
- Windows上の `python` コマンド実行: 未確認（スクリプトは標準ライブラリのみ）

## 受入基準との対応

| 基準 | 状態 |
|---|---|
| 検証済み3件以内で調査記録と営業文2案 | スキル手順で規定。実行検証は未実施 |
| 不適格案件に文案を作らない | コードで強制（`can-propose`）・PASS |
| 重複しない | PASS |
| 5分類いずれかへ保存 | PASS |
| 使用実績IDと根拠を各文案に記録 | スキル手順で規定。実行検証は未実施 |
| `採用済み`のみテンプレート候補 | コードで強制（`list-approved`）・PASS |
| テンプレートに固有情報が残らない | lint PASS（人間の目視確認も前提） |
| 応募・外部送信なし、人間確認で停止 | コード上に送信処理なし・PASS |
