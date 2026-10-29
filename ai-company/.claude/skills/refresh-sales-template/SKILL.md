---
name: refresh-sales-template
description: 採用済みかつ根拠・公開範囲確認済みの営業結果だけから、種類別テンプレートの変更案を作る（承認前は書き換えない）
argument-hint: <分類: gas-automation|single-html|web-lp|ai-training|other>
disable-model-invocation: true
---

分類: $ARGUMENTS

1. `python scripts/sales_pipeline.py list-approved $ARGUMENTS` を実行する。出力された `outcome.md` **だけ**を読む。他の案件・`draft` の `proposal.md` は読まない。
2. 該当が0件なら「更新材料なし」と報告して終了する。1件だけの成功を普遍的ルールにしない。結果（返信・商談・受注）と結びつけて傾向を述べる。
3. 現行テンプレート（`sales/private/templates/$ARGUMENTS/application.md`、無ければ `templates/sales-pipeline/application_$ARGUMENTS.md`）に対する **差分案** を作る。案件名・顧客名・URL・連絡先・価格・納期・固有数値はプレースホルダーに置き換え、元案件IDだけを記録する。
4. 差分案を一時ファイルに書き、`python scripts/sales_pipeline.py lint-template <ファイル>` が `OK` になることを確認する。
5. 差分を人間に提示して停止する。**承認を得るまで既存テンプレートを書き換えない。**
