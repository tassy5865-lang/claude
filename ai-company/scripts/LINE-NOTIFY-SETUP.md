# deal-sweep → 公式LINE 通知の設定手順（田代がやる）

`deal-sweep` ループが**新規◎○案件を見つけたときだけ**、公式LINE（Nexsist.cs）にプッシュ通知します。
LINE Messaging API の「ブロードキャスト」を使うので、**友だち全員（＝今は田代のみ）に届き、ユーザーIDは不要**です。

## 1. Messaging API を有効化してトークンを取得

1. **LINE Official Account Manager**（https://manager.line.biz/ ）→ 対象アカウント **Nexsist.cs（@103lwyiq）** → `設定` → `Messaging API` → **「Messaging APIを利用する」** を有効化。
   - プロバイダーは新規作成でよい（例: `Nexsist.cs`）。
2. 表示される **Channel ID / Channel secret** はメモ（今回は使わないが控える）。
3. **LINE Developers コンソール**（https://developers.line.biz/console/ ）→ 今作られたプロバイダー → 該当チャネル → **`Messaging API` タブ** → 一番下の **「チャネルアクセストークン（長期）」** → **発行**。
   - この長い文字列をコピー。**これが `channel_access_token`。**
4. 同じ `Messaging API` タブで **「応答メッセージ」「あいさつメッセージ」の webhook 等はそのままでOK**（通知は送信専用なので webhook 不要）。
   - ※「Messaging APIを利用する」を有効にすると、OA Manager 側の自動応答（キーワード応答・あいさつ）は**引き続き動きます**。必要なら `応答設定` で確認。

## 2. トークンをローカル設定ファイルに保存

`ai-company/scripts/line.local.json.example` をコピーして `line.local.json` を作り、トークンを貼る:

```
cp ai-company/scripts/line.local.json.example ai-company/scripts/line.local.json
```
`line.local.json` を編集:
```json
{
  "channel_access_token": "（発行した長期トークンを貼る）",
  "mode": "broadcast",
  "to": ""
}
```
- `line.local.json` は `.gitignore` 済み（`**/*.local.json`）＝コミットされません。
- Claude の Read ツールからも拒否設定済み（`notify-line.ps1` だけが読む）。

## 3. テスト送信

```
powershell -NoProfile -ExecutionPolicy Bypass -File "ai-company\scripts\notify-line.ps1" -Text "テスト通知：Nexsist.cs 案件巡回の設定ができました"
```
- `LINE notify: sent (broadcast).` と出て、LINE に届けば成功。
- `LINE notify: not configured ...` → `line.local.json` が無い／トークン未設定。
- `LINE notify: FAILED - ...` → トークンが違う／Messaging API 未有効。エラー本文を確認。
- 送信ログ: `ai-company/logs/line-notify.log`

## 4. 以降

`deal-sweep` ループが新規◎○を見つけると自動で通知します（0件の回は送りません）。
無料の「コミュニケーションプラン」は**月200通**まで。新規案件は稀なので通常は余裕ですが、
巡回間隔を極端に短くしない（4〜8時間推奨）こと。

## 手動で使う

`notify-line.ps1 -Text "..."` は単体でも使えます（例: daily-run の結果を自分に送りたいとき）。
