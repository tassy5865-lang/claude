---
name: maintenance-check
description: 納品済み案件の定期点検を行い、点検報告を作成する
argument-hint: <案件名>
disable-model-invocation: true
---

案件「$ARGUMENTS」の定期点検をしてください。

1. `projects/$ARGUMENTS/04_delivery.md` を読む。なければ中止する（納品が完了していない）。
2. `02_design.md`、`03_test.md`、`projects/$ARGUMENTS/05_maintenance/` の最新の報告を読む。
3. **maintainer** で点検する。読むだけの確認を先に行う。
4. フォームのテスト送信、テスト予約、テスト配信など本番へ書き込む確認は、人間の承認が記録されている場合だけ行う。なければ「未実施」と記録する。
5. 結果を `projects/$ARGUMENTS/05_maintenance/<YYYY-MM-DD>.md` に書く。確認していない項目を ✅ にしない。
6. ❌ があれば、再現手順と影響範囲を添えて人間に報告する。修正する場合は **developer** → **qa-tester** の順に回し、maintainer は直さない。
7. 公開文面が変わっていた場合は **compliance-checker** に回す。
8. 最後に、結論、前回からの変化、次回の点検で見る点を報告する。顧客への送付はしない。
