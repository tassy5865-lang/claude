# 琥珀(KOHAKU)予約システム — Claude Code 引き継ぎ

アロマサロン「琥珀」の予約システム。**静的HTML(フロント) + Google Apps Script(バックエンド) + Googleスプレッドシート/カレンダー(データ) + LINE** の構成。
オーナーは日本語で作業する。UI文言・コメント・コミュニケーションは日本語。
デザイン参考: `docs/reference-design.png` / 画面構成: `docs/flow.md`

## 重要: まだ実機で動かしていない
これまでの開発はチャット上のサンドボックスで行われ、**Apps Script・LINE API・Googleカレンダーでの実動作は未確認**。
確認済みなのは (a) `npm test`(jsdomによるフロントのデモモード動作)と (b) `Code.gs` の構文チェックのみ。
GAS側の変更は、可能なら実機(テスト用スプレッドシート+テスト用カレンダー)で確かめること。

## ファイル構成
| パス | 役割 |
|---|---|
| `index.html` | お客様向け。予約フロー + My Kohaku + LIFF(LINE内で開く)対応。単一ファイル、外部ライブラリなし(LIFF SDKのみ動的ロード) |
| `admin.html` | 管理画面(今日の予約・カレンダー・予約追加)。パスワード認証 |
| `gas/Code.gs` | バックエンド全体(Web App)。`doGet`=空き状況、`doPost`=予約登録+各種action |
| `gas/appsscript.json` | GASマニフェスト(Asia/Tokyo、Webアプリ公開設定) |
| `tests/` | jsdomによるフロントのスモークテスト。`npm test` |
| `docs/` | 参考デザイン画像、画面遷移 |
| `docs/superpowers/` | 設計書(specs)と実装計画(plans)。メニューのシート化は `specs/2026-10-06-menu-sheet-design.md` |

## アーキテクチャ
```
index.html / admin.html (GitHub Pages等で配信)
   │  fetch  GET ?action=availability / POST JSON (text/plain, CORS回避)
   ▼
gas/Code.gs (Web App: 実行=自分 / アクセス=全員)
   ├─ Googleカレンダー … 空き判定・二重予約チェックの元データ(予約=予定)
   ├─ スプレッドシート … 予約 / 顧客 / クーポン
   ├─ MailApp          … 確認・リマインド(LINE未連携者)
   └─ LINE (UrlFetchApp)… 通知push、IDトークン検証
```
- `CONFIG.GAS_URL` が空だと**デモモード**(ダミーデータ、保存なし。確認コード `123456` / 管理パスワード `demo`)。`npm test` はこのモードで動く。
- 時刻はすべて **JST(+09:00)** で扱う。フロントは `jst()` ヘルパー、GASは `+09:00` 付きでDateを生成。

## API(`gas/Code.gs` の `doGet` / `doPost` → `handleAction_`)
- `GET ?action=availability&from=YYYY-MM-DD&to=YYYY-MM-DD` … 予定の**時間帯のみ**返す(タイトル等の個人情報は返さない)
- `GET ?action=menu` … 認証なし。`メニュー`/`オプション`シートの**表示=ON の行だけ**を返す(5分キャッシュ。`&fresh=1` でキャッシュ回避、予約が `bad_menu` になったときの再取得に使う)。失敗時 `menu_unavailable`
- `POST`(actionなし)… 予約登録。`menuId` + `optionIds`(+おまかせのみ `minutes`)を受け取り、**料金・所要分・名前はサーバーがシートから決める**(クライアントの値は見ない)。未知/非表示は `bad_menu`、おまかせの分が60/90/120以外は `bad_minutes`。LockServiceで排他、カレンダーで二重予約チェック(前後 `BUFFER_MIN`)
- `POST {action}`:
  - お客様: `sendCode` / `verifyCode`(メール6桁コード→6時間トークン) / `me` / `cancel` / `reschedule` / `updateProfile` / `logout`
  - LINE: `lineLinkCode`(要ログイン) / `lineLink`(IDトークン+連携コード) / `lineLogin`(IDトークン) / `lineUnlink`
  - 管理: `adminLogin` / `adminList` / `adminSetStatus` / `adminCreate`(トークン6時間。パスワードは `ADMIN_PASSWORD`)
- レスポンスは `{ok:true,...}` / `{ok:false,error:'code'}`。エラーコード→日本語は `index.html` の `errMsg` / `admin.html` の `errMsg`。

## データモデル(スプレッドシート)
**列の追加は必ず末尾。既存列の並び替え・削除は禁止**(コードが列番号で参照している)。定義は `gas/Code.gs` の `HEADERS` / `CUSTOMER_HEADERS` と冒頭コメント。
- **予約**(24列): 予約ID, 受付日時, 予約ステータス(確定/来店済/キャンセル), 日付, 開始, 終了, メニュー, オプション, 合計金額, 所要分, お名前, フリガナ, 電話, メール, 初回/再来, ご要望, カレンダーEventID, メニューID, 顧客ID, 予約日時(ISO), 流入経路(web/admin/将来line), 2日前リマインド送信日時, 更新日時, 当日リマインド送信日時
- **顧客**: 顧客ID(C000001), メール, お名前, フリガナ, 電話, **LINE userId**, LINE連携日時, LINE通知(許可/停止), 登録日時, 更新日時, メモ。メールで名寄せ
- **メニュー**(10列、`MENU_HEADERS`): メニューID, 名前, 所要分, 料金(空=当日案内), 説明, カテゴリ(カンマ区切り), グループ, 種別(空/pair/omakase), 表示(ON/OFF), 並び順。**メニューIDは変更禁止**(既存予約・「同じメニューで予約」が参照)。やめるメニューは削除せず表示=OFF
- **オプション**(6列、`OPTION_HEADERS`): オプションID, 名前, 所要分, 料金, 表示(ON/OFF), 並び順
- **クーポン**: コード, 名称, 内容, 対象メール(空=全員), 開始日, 期限, 状態(有効/無効/使用済)
- 全セルを文字列(`'@'`書式)で保存(先頭0落ち・数式注入の防止)。
- 既存データ移行は `migrate_()`(`setup` から呼ばれる。冪等)。

## 通知・リマインド
- 予約確認(即時) / 2日前(毎日18時) / 当日(毎日8時) / 日時変更 / キャンセル。`notifyCustomer_` が LINE連携済み→LINE(Flex)、それ以外→メール。
- リマインドは時間トリガー `remind2DaysBefore` / `remindToday`(`installTriggers()` を一度実行して登録)。送信済みは該当列に日時を記録し二重送信を防ぐ。日時変更時は記録をクリア。
- マイページからの変更・キャンセルは来店 `CANCEL_DEADLINE_HOURS`(24h)前まで。

## 設定の置き場所(同じ値が複数箇所にあるので注意)
- `index.html` の `CONFIG`: `GAS_URL`, `LIFF_ID`, 営業時間, 刻み, `BUFFER_MIN`, `CAPACITY`, 定休日, 先行受付, `NOTICE`
- `gas/Code.gs` の `CONFIG`: 上記と**同じ意味の値**(CAPACITY/BUFFER_MIN/CLOSED_WEEKDAYS/OPEN/CLOSE/MIN_ADVANCE_HOURS)を持つ → 変更時は両方そろえる
- メニュー/オプションの**正は `メニュー`/`オプション`シート**(オーナーが直接編集。反映は最大5分遅れ)。`index.html` の `MENU`/`OPTIONS`、`admin.html` の `MENU` は**予備配列**(デモ・取得失敗時用)で、`gas/Code.gs` の `SEED_MENU`(表示ON)と同じ内容に保つ(`tests/menu-front.test.js` が検査)。カテゴリ `CATS` は `index.html` に固定
- 秘密情報は **スクリプト プロパティ**: `ADMIN_PASSWORD`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_LOGIN_CHANNEL_ID`, `LIFF_ID`。コードに直書き・コミット禁止

## 設計上の判断(変えるなら理由を確認)
- **LINE Webhookは使わない**: GASはリクエストヘッダー(`X-Line-Signature`)を読めず署名検証できないため。連携はLIFF+IDトークン検証で行う。
- **LINE連携は、メール確認済みのMy Kohakuセッションからのみ**: 予約直後の画面から連携させない(他人のメールで予約→その人のLINEを紐づけ→My Kohaku乗っ取り、を防ぐため)。連携コードは10分・1回限り。
- `sendCode` は予約実績のあるメールにだけ送信し、応答では登録有無を区別しない。失敗5回でロック。
- 公開エンドポイント(availability)は個人情報を返さない。管理系は必ずトークン必須。
- 空き判定: 営業時間内、施術時間+前後バッファ、`CAPACITY` 未満。終日予定=臨時休業として全日ブロック(`BLOCK_ALL_DAY_EVENTS`)。
- 管理画面のURLは予約サイトと別の場所に置く想定(noindex付き)。

## 実装済み / 未実装
**実装済み**: メニュー/オプションのシート管理 + 予約時のサーバー側料金再計算 / 予約フロー(7ステップ)/ My Kohaku(次回・履歴・クーポン表示・登録情報)/ 日時変更・キャンセル / 管理画面(今日・カレンダー・詳細・状態変更・予約追加)/ 顧客ID・LINE userId保存項目 / LINE連携(LIFF)/ 確認・2日前・当日通知

**未実装(優先度の目安)**
1. 管理画面の残り: **営業日**(臨時休業=終日予定の登録/解除)、**顧客一覧**、**クーポン管理**、**売上分析**
2. クーポンの**予約時適用**(今は表示のみ。コードを来店時に伝える運用)
3. ~~管理画面でキャンセルした際のお客様への通知~~ → 実装済み(`adminSetStatus` の `notify`、詳細画面のチェックで ON/OFF。GAS実機は未確認)
4. LINEブロック判定の実機調整(`linePush_` の停止条件は推測。実際の応答を見て調整)
5. 週表示(時間軸)カレンダー、メニュー変更を伴う予約変更
6. Version 3: AIおすすめ診断、リピート促進の自動LINE配信
7. データ増加時の移行(予約が数千件を超えたらFirebase/Supabase等を検討)

## 仮置きの値(オーナーに確認が必要)
定休日=水曜 / 営業10:00〜20:00 / 準備時間15分 / 同時1件 / キャンセル期限24時間前 / 単品のよもぎ蒸し・まこも蒸し(メニュー表に無いため表示=OFF、シートで切替可) / ペア蒸し+フット/頭ほぐし30分の所要70分(確認済み) / おまかせ相談の料金=当日案内 / `NOTICE` 文言(キャンセルポリシー)

## 開発コマンド
```bash
npm install
npm test            # jsdomでフロントのデモモードを検証(予約フロー/My Kohaku/日時変更/LIFF/管理画面)
npm run check:gas   # gas/Code.gs の構文チェック
# GASの反映(任意): npm i -g @google/clasp → clasp login → clasp create/clone → rootDir を gas に設定して clasp push
```
- 静的ファイルのプレビュー: `npx serve .`。`GAS_URL` を空にしたままならデモ表示で全画面を確認できる。
- GASを変更したら「デプロイを管理」から**新バージョン**で更新(URLは変わらない)。列追加時・メニュー機能の初回導入時は `setup` を再実行(`メニュー`/`オプション`シートが初期データ付きで作られる)。
- **公開の順序**: 先にGASを更新して `setup` → その後に `index.html` を公開。逆だと予約が `bad_menu` で失敗する(旧GASは新ペイロードの `total` 無しを受ける)。

## コーディング規約
- フロントは**依存なしのバニラJS単一HTML**。ビルド工程を入れない(GitHub Pagesにそのまま置ける)。外部読み込みはGoogle Fonts と LIFF SDK のみ。
- ユーザー入力は必ず `esc()` でエスケープして描画。数式・HTMLインジェクションに注意。
- スマホ優先(`viewport-fit=cover`、safe-area対応)。タップ領域44px以上、`aria-label`、フォーカスリング、`prefers-reduced-motion` 対応を維持。
- デザイントークン(CSS変数): cream `#F6EFE3` / paper `#FFFCF7` / sand `#EADBC3` / caramel `#B58553` / brown `#6E5238` / ink `#33261C` / moss `#44593F` / danger `#A5473A`。見出しは Shippori Mincho、本文は Zen Kaku Gothic New。落ち着いた琥珀色のトーンを崩さない。
- 新しいAPIは `handleAction_` に case を足し、**認証(トークン)必須か**を明示。エラーは `{ok:false,error:'snake_case'}` で返し、フロントの `errMsg` に日本語を追加。
- テストはデモモードで通る形で `tests/` に追加する。
