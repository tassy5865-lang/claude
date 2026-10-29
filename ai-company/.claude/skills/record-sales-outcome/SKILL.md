---
name: record-sales-outcome
description: 人間が採用した営業文と送信・返信・受注の結果を、案件の outcome.md に対話形式で記録する
argument-hint: <案件ID>
disable-model-invocation: true
---

案件ID: $ARGUMENTS

1. `python scripts/sales_pipeline.py outcome-init $ARGUMENTS` で雛形を用意する（既存の記録は上書きされない）。
2. 人間に1項目ずつ聞いて `outcome.md` に書く: 採用した案、最終編集後の文章、送信日、結果（返信なし/返信あり/商談/受注/失注）、失注理由・所感、確認者・確認日。
3. 次の2つは **人間が明示的に「済」と言った場合だけ** 変更する。AIが推測で「済」にしない。
   - 根拠確認: 使った実績が `evidence.md` で確認済みかつ記載可
   - 公開範囲確認: テンプレート化して使い回してよい
4. 最終編集後の文章に連絡先・URLが残っていれば、保存前に指摘して消してもらう。
5. 外部サイトから返信や結果を自動取得しない。送信もしない。
