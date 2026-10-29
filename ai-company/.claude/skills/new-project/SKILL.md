---
name: new-project
description: 新規案件の要件定義と設計を作成し、人間の承認前で停止する
argument-hint: <案件名>
disable-model-invocation: true
---

新規案件「$ARGUMENTS」を立ち上げてください。

1. 案件名が空、パス文字を含む、または既存案件と衝突する場合は作成せず確認する。
2. `DATA_HANDLING.md` を読み、Claude Codeでの読取り自体を外部AI送信として評価する。
3. `projects/$ARGUMENTS/` を作成する。
4. **pm-planner** に `templates/requirements_template.md` と `templates/design_template.md` を使わせ、`01_requirements.md` と `02_design.md` を作成させる。
5. 不明点は推測せず、人間へ1〜2問ずつ確認する。
6. データ分類、保存先、AI送信承認、保持・削除、秘密情報、バックアップが未確定なら設計完了扱いにしない。
7. 設計が固まったらタスク一覧を提示し、人間の承認を待つ。承認前に実装しない。
