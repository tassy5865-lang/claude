# ai-company 不具合調査（2026-09-10）

結論: 通知先の誤選択、検証の誤判定、CSVの行番号などに修正箇所を確認。
根拠: スクリプト・設定・デモ要件の静的確認と、既存Nodeテストおよび合成入力による再現。
次アクション: 以下の優先度順に修正し、失敗経路を検証する。今回は調査のみで実装・設定は変更していない。

## 指摘

| 優先度 | 場所 | 問題・影響 | 修正方針 |
|---|---|---|---|
| 高 | scripts/notify-line.ps1:41–53 | mode が push 以外ならすべて broadcast に分岐する。例えば pus h などの誤設定でも全友だちへの送信になる。実設定は未読、送信は未実施。 | push / broadcast を明示的に検証し、不明値・欠落は送信前にエラーにする。 |
| 高 | scripts/validate_scaffold.py:86–94 | 公開ファイル検査で除外するのは sales/private と .git のみ。customer-data、secrets、projects配下のprivate、*.local.json も拡張子が一致すれば本文を読む。規程上の読取禁止領域や秘密設定まで検査対象になる。 | 公開対象を限定し、秘密・実データのディレクトリは探索時点で除外する。内容を読まずに検査できる項目と分離する。 |
| 中 | scripts/validate_scaffold.py:151–163 | git ls-files の終了コードを見ず stdout の空文字だけで合格にする。Gitがエラー終了しても private-sales-not-tracked がPASSになる。 | returncode を確認し、検査不能をPASSにしない。 |
| 中 | scripts/daily-run.ps1:42–56 / scripts/daily-run.md 手順2 | タスクの成否はClaude CLIの終了コードだけで決まる。プロンプトは整合性検証失敗を記録して後続処理に進む設計なので、検証失敗でもCLIが正常終了すればタスクは成功扱いになる。 | 必須検証をランナーから実行し、構造化した完了結果と検証結果を終了コードに反映する。 |
| 中 | scripts/register-daily-task.ps1:26–33 | powercfg の各終了コードを確認せず、エラー出力を捨てて「Wake timers enabled」と表示する。外部コマンドの非ゼロ終了をcatchだけでは捕捉できず、設定失敗を見逃す。 | 各実行直後に終了コードを確認し、失敗と成功を区別する。今回powercfgは実行していない。 |
| 中 | scripts/check-daily.ps1:2–8 | 取得エラーをSilentlyContinueで隠し、アクセス拒否も「Task not found」と表示する。今セッションで通常権限のタスク取得はアクセス拒否、昇格した取得は成功しており、実際に起きる条件。 | 未登録と権限不足・取得失敗を別々に表示する。 |
| 中 | projects/demo-csv-summary/src/index.html:34–40 | 空行除去後のindexを行番号に使う。item,amount\n\nA,abc は3行目が不正なのに「2行目」と表示する。要件の不正値行番号表示に不一致。 | 元の行番号を保持して空行を除外する。 |
| 低 | projects/demo-csv-summary/src/index.html:38–42 | 個々の金額は有限性検査するが合計は未検査。1e308を2行入れるとtotal=Infinityで正常結果になる。 | 加算後の有限性を検査して範囲超過を表示する。 |

## 実行した確認

- node scripts/test_demo_csv_summary.mjs: PASS（正常系、空入力、非数値、外部I/O検査）。
- 同じHTMLの関数をNode VMで実行し、合成入力で行番号ずれとInfinityを再現。
- PythonはこのセッションのPATH上で見つからず、validate_scaffold.pyの動的検証は未実施。
- 実データ、秘密設定、通知ログの本文は調査対象にしていない。LINE送信・日次処理起動・タスク再登録は未実施。

## 日次実行漏れの判定限界

タスク情報はLastRunTime=2026-09-08 19:02、LastTaskResult=0、NextRunTime=2026-09-11 06:00。登録用コードではStartWhenAvailable=true、WakeToRun=true、Interactiveログオンを指定している。ただし未実行の直接原因は未確定。実際の登録済み設定、タスク履歴、PCの電源・ログオン状態を照合する必要がある。LastTaskResult=0は9/8のプロセス終了結果であり、9/9・9/10の処理成功を意味しない。

---

## 対応状況（2026-09-10 修正実施）

結論: 指摘8件すべてコード修正。`node scripts/test_demo_csv_summary.mjs` と `python scripts/validate_scaffold.py` は PASS。PowerShell 4本は構文チェック（Parserエラー0・非ASCII 0）と主要分岐の動作確認済み。送信・タスク再登録・powercfg は未実行。

| 優先度 | 場所 | 対応 | 検証 |
|---|---|---|---|
| 高 | notify-line.ps1 | `mode` を `push`/`broadcast` に厳格検証（大小無視）。不明値・欠落は `exit 1` で送信前に停止。ヘッダーの仕様も追記。 | 7ケースの正規化・判定をPSで確認（`pus h`/空/未設定/`broadcastt` → 拒否） |
| 高 | validate_scaffold.py:public scan | `is_private_path()` を新設し、`.git`/`secrets`/`customer-data`/`node_modules`/`sales/private`/`projects/**/private/**`/`*.local.json`/`*.local.md`/`.env`/自身 を探索時点で除外。読取り不能ファイルは内容を読まず個別FAIL。 | 予測12ケースの述語ユニットテスト全一致。`RESULT: PASS` |
| 中 | validate_scaffold.py:git ls-files | `returncode != 0` を検査。git が非ゼロ終了なら「検査不能」として FAIL（空stdout=合格にしない）。 | `RESULT: PASS`（正常時） |
| 中 | daily-run.ps1 / daily-run.md 手順2・6 | ランナーが CLI 終了後に `validate_scaffold.py` を再実行し終了コードへ反映（FAIL→exit 3）。手順6で最終行に `DAILY-RUN-STATUS: OK`/`NEEDS-ATTENTION` を必須化。無し→exit 5、NEEDS-ATTENTION→exit 4、CLI非ゼロ→そのコード。ログ書き込みをUTF-8 BOMの単一経路に統一。 | スタブCLIで4分岐（OK=0／sentinel無=5／NEEDS-ATTENTION=4／CLI9=9）を実機確認。ログBOM=EF BB BF一貫 |
| 中 | register-daily-task.ps1 | powercfg 3コマンドを配列化し各実行直後に `$LASTEXITCODE` を検査。1つでも失敗なら「FAILED（要管理者）」を明示。 | 構文チェックのみ（powercfgは未実行） |
| 中 | check-daily.ps1 | `-ErrorAction Stop`＋catch で「未登録（ObjectNotFound）」「アクセス拒否」「その他」を別メッセージに分岐。成功時のみ Last/Next を表示。 | 存在しないタスク名で「NOT REGISTERED」分岐を確認。既存タスクの正常表示も確認 |
| 中 | demo-csv-summary/src/index.html | 空行を除外しても元の1始まり行番号を保持して採番。 | T-06（`項目,金額 / 空行 / A,abc` → 「3行目」）追加・PASS |
| 低 | demo-csv-summary/src/index.html | 各セルの有限性検査に加え、加算後の合計も `Number.isFinite` で検査。超過時はエラー表示。 | T-07（`1e308` ×2 → 範囲超過エラー）追加・PASS |

**副次修正**: 本セッションで `sales/private/leads.md` に追記した調査セクションが `### ` 見出しを使っており、`validate_scaffold.py` がリード案件レコードと誤認して25件FAILしていた。当該見出しを `#### ` に降格して解消（`validate_scaffold.py` 側の「`### ` は全てリードレコード」という前提は別途要検討）。

**未実施（人間マター）**: LINE送信テスト、`register-daily-task.ps1` の再実行、powercfg 実行、9/9・9/10 実行漏れの根本原因（電源・ログオン状態・タスク履歴の照合）。
