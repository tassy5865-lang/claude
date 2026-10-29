---
name: propose
description: 検証済み案件に対する短い応募文2案とヒアリング・見積を作成する
argument-hint: <案件名>
disable-model-invocation: true
---

案件「$ARGUMENTS」への提案一式を作ってください。

1. `sales/private/leads.md` から該当案件を読む。
2. 募集詳細URLを開き、募集状態と条件を再確認して最終確認日時を更新する。URL未取得、募集終了、確認不能、または応募候補不可なら作成を止める。
3. `DATA_HANDLING.md` と `sales/private/evidence.md` を確認する。確認済み・公開可の実績だけを使用する。
4. **sales-writer** で250〜400字の応募文を方向性違いで2案作る。
5. **account-exec** で10問以内のヒアリング項目と松竹梅の概算見積を作る。
6. 出力先は `sales/private/proposals/` とする。連絡先は `[送信時に人間が入力]` のままにする。
7. 人間が選べる形で提示し、応募・送信はしない。
