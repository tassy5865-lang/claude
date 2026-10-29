# Nexsist.cs — Claude Code 用「AI社員」スキャフォールド

業務効率化・DXツール開発会社を Claude Code 上で運用するための雛形です。

データ・秘密情報を扱う前に [DATA_HANDLING.md](DATA_HANDLING.md) を確認してください。

## 導入手順
1. このフォルダを作業ディレクトリに展開する（既存プロジェクトなら `.claude/` と `CLAUDE.md` をコピー）
2. そのディレクトリで `claude` を起動
3. `/agents` で6名が認識されているか確認
4. `python scripts/validate_scaffold.py` を実行し、全検査が `PASS` になることを確認

## AI社員（6名）
| 役割 | エージェント | 担当 |
|---|---|---|
| PM | `pm-planner` | ヒアリング整理 → 要件定義 → 設計 → タスク分解 |
| 開発 | `developer` | GAS / 単一HTMLツール / Web・LP の実装 |
| QA | `qa-tester` | テスト設計・実行・受入判定（差し戻し権限あり） |
| リサーチ | `deal-scout` | 案件探索・確度評価・地雷検知 |
| ライター | `sales-writer` | 応募文・提案文・LPコピー（2案出し） |
| 営業 | `account-exec` | ヒアリング設計・見積(松竹梅)・契約前チェック |

## コマンド
| コマンド | 動き |
|---|---|
| `/new-project 案件名` | pm-planner が要件定義＋設計まで |
| `/build 案件名` | developer 実装 → qa-tester 検証 → 納品書作成 |
| `/find-deals 条件` | deal-scout が案件リサーチ → leads.md |
| `/propose 案件名` | sales-writer + account-exec で提案一式 |

コマンドは現行推奨形式の `.claude/skills/<コマンド名>/SKILL.md` で管理しています。

## 運用の型
```
/find-deals            → 案件を見つける
/propose <案件名>       → 応募文をもらう（送信は自分で）
/new-project <案件名>   → 受注後、要件と設計を固める
/build <案件名>         → 実装からQAまで
```

## 人間（あなた）が必ず握る判断
- 応募・返信の送信
- 見積金額の最終決定と契約
- 本業の就業規則・利益相反の確認
- 顧客の実データを扱う際の取り扱い方針

## データ安全の最低条件
- 顧客データ、患者情報、秘密情報を外部AIや公開リポジトリへ送らない
- 案件ごとに保存先、保持期間、削除方法、バックアップを決める
- QAは情報漏えい・データ消失・法令/契約違反を受入基準外でも強制差し戻しにする
- 募集案件はURL、取得日時、最終確認日、募集状態を記録し、直接URL未取得の案件は応募候補にしない

## 公開・非公開データの分離

- 公開可能: `README.md`、`templates/`、`sales/examples/`、ダミー案件
- 非公開: `sales/private/`（実案件、提案、個人の連絡先。Git管理外）
- 顧客実データ: `customer-data/` または案件内の `private/`（Git管理外かつClaude読取禁止）
- `.gitignore` は公開防止、`.claude/settings.json` はAI読取防止です。目的が異なるため両方を維持します。

非公開営業資料をClaudeで処理する場合は、公開情報・社内情報の範囲に限定し、連絡先などのローカル値はプレースホルダーのまま生成後に人間が差し込みます。

## カスタマイズのコツ
- 単価やメニューは `CLAUDE.md` の表を書き換えれば全社員に反映される
- 役割を足したい時は `.claude/agents/` に同じ形式で1ファイル追加
- `description` に「いつ使うか」を具体的に書くほど、自動で呼ばれる精度が上がる
- 変更後は必ず `python scripts/validate_scaffold.py` を実行する

## 動作確認済みサンプル

`projects/demo-csv-summary/` に、要件定義→設計→実装→QA→納品まで通したダミー案件があります。顧客情報や実データは含みません。
