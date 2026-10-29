---
name: build
description: 設計済み案件を実装し、独立QAと納品資料作成まで進める
argument-hint: <案件名>
disable-model-invocation: true
---

案件「$ARGUMENTS」を実装してください。

1. `projects/$ARGUMENTS/01_requirements.md` と `02_design.md` を読む。どちらかがなければ中止する。
2. 人間による実装承認と、必要なAI送信承認が記録されているか確認する。欠落時は中止する。
3. **developer** で `src/` に実装する。実データは読まずダミーデータだけを使う。
4. **qa-tester** で `03_test.md` を作成し、受入基準と強制差し戻し条件を検証する。
5. 通常の不合格はdeveloperへ戻して再テストする。最大2往復とし、3回目は人間へ判断を求める。
6. 強制差し戻し条件はリスク許容で解除せず、解除条件を満たすまで納品を止める。
7. 合格後、`templates/delivery_template.md` から `04_delivery.md` を作成する。
8. `python scripts/validate_scaffold.py` を実行する。失敗があれば完成扱いにしない。
9. 最後に判定、既知の制限、削減できる想定時間を報告する。
