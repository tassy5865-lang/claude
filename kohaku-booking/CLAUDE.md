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
| `tests/` | jsdomによるフロントのスモークテスト + GAS純関数のテスト(Node `vm`)。`npm test` |
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
- `POST`(actionなし)… 予約登録。`menuId` + `optionIds`(+おまかせのみ `minutes`)を受け取り、**料金・所要分・名前はサーバーがシートから決める**(クライアントの値は見ない)。未知/非表示は `bad_menu`、おまかせの分が60/90/120以外は `bad_minutes`。`couponCode`(任意)があれば**サーバーが再判定**して割引後の合計を保存(エラーは `bad_coupon` / `coupon_used` / `coupon_not_applicable` / `locked`)。LockServiceで排他、カレンダーで二重予約チェック(前後 `BUFFER_MIN`)
- `POST {action}`:
  - 公開(認証なし): `couponCheck`(確認画面の「適用」用。`{code,email,menuId,optionIds,minutes}` → `{name,discount,total}`、予約は作らない。メール別10回/10分・全体100回/10分を超えると `locked`)
  - お客様: `sendCode` / `verifyCode`(メール6桁コード→6時間トークン) / `me` / `cancel` / `reschedule` / `updateProfile` / `logout`
  - LINE: `lineLinkCode`(要ログイン) / `lineLink`(IDトークン+連携コード) / `lineLogin`(IDトークン) / `lineUnlink`
  - 管理: `adminLogin` / `adminList` / `adminSetStatus` / `adminCreate` / `adminSetClosed`(臨時休業の登録/解除) / `adminCustomers`(顧客一覧+集計) / `adminCustomerUpdate`(Instagram名・流入元・初回問い合わせ日・メモ) / `adminMenu`(メニュー・オプション一覧。表示OFFを含む) / `adminMenuSave` / `adminOptionSave`(1件の更新・新規追加。保存後に `menu:v1` キャッシュを消すので予約サイトへ即反映。検証違反は `{error:'bad_field', field}`、ID重複は `duplicate_id`) / `adminCoupons`(クーポン一覧。利用数=非キャンセル予約数・表示用状態つき) / `adminCouponSave`(`{item, create}` で発行・更新。コード空なら `CP-`+6文字を自動生成。検証違反は `bad_field`+`field`、コード重複は `duplicate_code`、更新対象なしは `not_found`) / `adminAnalytics`(期間 `{from,to}` の集計。売上=来店済の割引後金額、見込み・未処理・金額未定・キャンセル率・前期間比、推移(62日以内は日別・超は月別)、メニュー別・流入元別・新規/再来。読み取り専用で個人情報なし。期間は400日以内、違反は `bad_range`)(トークン6時間。パスワードは `ADMIN_PASSWORD`)
  - `adminList` は `closures`(休業日の配列)を返す。予約の応答には `refSource`(流入元)・`inquiryId`(問い合わせID)が入る(既存の `source`=web/admin はそのまま)
- 予約リンク(`index.html`): `?source=instagram_dm|instagram|line|web|other` / `&inquiry=<英数字-_ 32文字以内>` / `&menu=<メニューID>`。LIFF経由(`liff.state`)も解釈。無効な値は無視。予約POSTの `source` / `inquiry` をGASが再検証して保存する
- レスポンスは `{ok:true,...}` / `{ok:false,error:'code'}`。エラーコード→日本語は `index.html` の `errMsg` / `admin.html` の `errMsg`。

## データモデル(スプレッドシート)
**列の追加は必ず末尾。既存列の並び替え・削除は禁止**(コードが列番号で参照している)。定義は `gas/Code.gs` の `HEADERS` / `CUSTOMER_HEADERS` と冒頭コメント。
- **予約**(28列): 予約ID, 受付日時, 予約ステータス(確定/来店済/キャンセル), 日付, 開始, 終了, メニュー, オプション, 合計金額, 所要分, お名前, フリガナ, 電話, メール, 初回/再来, ご要望, カレンダーEventID, メニューID, 顧客ID, 予約日時(ISO), 流入経路(web/admin/将来line), 2日前リマインド送信日時, 更新日時, 当日リマインド送信日時, 流入元(instagram_dm等), 問い合わせID, **クーポン**(使ったコード), **割引額**(円)。`合計金額` は**割引後**の金額
- **顧客**: 顧客ID(C000001), メール, お名前, フリガナ, 電話, **LINE userId**, LINE連携日時, LINE通知(許可/停止), 登録日時, 更新日時, メモ, **Instagram名, 流入元, 初回問い合わせ日, 問い合わせID**(末尾4列)。メールで名寄せ。流入元・問い合わせIDは予約リンクから「空のときだけ」埋め、手入力した値は上書きしない。来店回数・最終来店・予約履歴は保存せず予約シートから計算して表示する
- **メニュー**(10列、`MENU_HEADERS`): メニューID, 名前, 所要分, 料金(空=当日案内), 説明, カテゴリ(カンマ区切り), グループ, 種別(空/pair/omakase), 表示(ON/OFF), 並び順。**メニューIDは変更禁止**(既存予約・「同じメニューで予約」が参照)。やめるメニューは削除せず表示=OFF
- **オプション**(7列、`OPTION_HEADERS`): オプションID, 名前, 所要分, 料金, 表示(ON/OFF), 並び順, **対象メニュー**(メニューIDのカンマ区切り。空=全メニュー共通。入っていればそのメニューの予約でだけ選べ、他メニューで送られると `bad_menu`)
- **クーポン**(9列、`COUPON_HEADERS`): コード, 名称, 内容, 対象メール(空=全員), 開始日, 期限, 状態(有効/無効/使用済), **割引種別(金額/割合)**, **割引値**(金額=1〜1,000,000円 / 割合=1〜100)。利用回数は保存せず、予約シートの非キャンセル予約から数える(1人=メール1回。キャンセルすると再び使える)。**割引種別/値が空のクーポンは表示専用**(予約時には適用できず `coupon_not_applicable`)。状態 `使用済` は `無効` と同様に自動適用の対象外
- 全セルを文字列(`'@'`書式)で保存(先頭0落ち・数式注入の防止)。ユーザー入力を含む行の書き込みは `putTexts_`(`'@'`書式+リッチテキスト値)を使う。`setNumberFormat('@').setValues` だけだと `=` 始まりが数式になる(2026-10-23 実機で `#ERROR!` を確認)。
- 既存データ移行は `migrate_()`(`setup` から呼ばれる。冪等)。

## 通知・リマインド
- 予約確認(即時) / 2日前(毎日18時) / 当日(毎日8時) / 日時変更 / キャンセル。`notifyCustomer_` が LINE連携済み→LINE(Flex)、それ以外→メール。
- リマインドは時間トリガー `remind2DaysBefore` / `remindToday`(`installTriggers()` を一度実行して登録)。送信済みは該当列に日時を記録し二重送信を防ぐ。日時変更時は記録をクリア。
- マイページからの変更・キャンセルは来店 `CANCEL_DEADLINE_HOURS`(24h)前まで。

## 設定の置き場所(同じ値が複数箇所にあるので注意)
- `index.html` の `CONFIG`: `GAS_URL`, `LIFF_ID`, 営業時間, 刻み, `BUFFER_MIN`, `CAPACITY`, 定休日, 先行受付, `NOTICE`
- `admin.html` の `CONFIG`: `GAS_URL`, `SITE_URL`(予約リンク発行のベースURL。空なら同じフォルダの `index.html`)。流入元の5種類(`instagram_dm` 等)は `index.html` / `admin.html` / `gas/Code.gs` の3箇所をそろえる
- `gas/Code.gs` の `CONFIG`: 上記と**同じ意味の値**(CAPACITY/BUFFER_MIN/CLOSED_WEEKDAYS/OPEN/CLOSE/MIN_ADVANCE_HOURS)を持つ → 変更時は両方そろえる
- メニュー/オプションの**正は `メニュー`/`オプション`シート**(管理画面の「メニュー」画面から編集・新規追加でき、保存後は即反映。シートを直接編集した場合の反映は最大5分遅れ。IDは作成後に変更不可・削除はせず表示=OFF)。`index.html` の `MENU`/`OPTIONS`、`admin.html` の `MENU` は**予備配列**(デモ・取得失敗時用)で、`gas/Code.gs` の `SEED_MENU`/`SEED_OPTIONS`(表示ON)と同じ内容に保つ(`tests/menu-front.test.js` が検査。生成の手間を省くには SEED から node で書き出す)。カテゴリ `CATS` は `index.html` に固定で、メニューが1件も無いカテゴリは画面に出ない。
  - **メニュー改訂の手順(2026-10-20 を例に)**: `SEED_MENU`/`SEED_OPTIONS` を新しい内容にする(やめるメニューは削除せず表示=OFFの行として残す)→ GAS更新 → `setup`(オプションの見出しに「対象メニュー」列が入る)→ Apps Script エディタで `syncMenuFromSeed` を1回実行(同じIDの行は上書き、無いIDは追加。SEEDに無い行は触らない)→ `index.html`/`admin.html` 公開
- 秘密情報は **スクリプト プロパティ**: `ADMIN_PASSWORD`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_LOGIN_CHANNEL_ID`, `LIFF_ID`。コードに直書き・コミット禁止

## 設計上の判断(変えるなら理由を確認)
- **LINE Webhookは使わない**: GASはリクエストヘッダー(`X-Line-Signature`)を読めず署名検証できないため。連携はLIFF+IDトークン検証で行う。
- **LINE連携は、メール確認済みのMy Kohakuセッションからのみ**: 予約直後の画面から連携させない(他人のメールで予約→その人のLINEを紐づけ→My Kohaku乗っ取り、を防ぐため)。連携コードは10分・1回限り。
- `sendCode` は予約実績のあるメールにだけ送信し、応答では登録有無を区別しない。失敗5回でロック。
- 公開エンドポイント(availability)は個人情報を返さない。管理系は必ずトークン必須。
- 空き判定: 営業時間内、施術時間+前後バッファ、`CAPACITY` 未満。終日予定=臨時休業として全日ブロック(`BLOCK_ALL_DAY_EVENTS`)。
- 管理画面のURLは予約サイトと別の場所に置く想定(noindex付き)。
- **クーポンの無効理由は区別して返さない**: 存在しない・期間外・対象外メール・無効は全て `bad_coupon`(コードの当て推量対策)。`couponCheck` は試行回数を制限(`CacheService`。厳密なレート制限ではない)。
- **割引・利用判定は常にサーバー**: クライアントの割引額・合計は見ない。確定時にロック内で再判定する。利用判定はメール単位なので、別メールなら同じコードを再利用できる(全員向けコード=1メール1回)。
- **管理画面の予約追加(電話予約)にはクーポンを自動適用しない**。
- **売上は「来店済」の予約だけを実績とする**: 確定は見込み、過去日付のまま確定のものは「未処理」として可視化し、売上には入れない。新規/再来は予約時の自己申告。流入元は予約リンクから来た予約のみ(それ以外は未記録)。

## 実装済み / 未実装
**実装済み**: メニュー/オプションのシート管理 + 予約時のサーバー側料金再計算 / 予約フロー(7ステップ)/ My Kohaku(次回・履歴・クーポン表示・登録情報)/ 日時変更・キャンセル / 管理画面(今日・カレンダー・詳細・状態変更・予約追加・**営業日(臨時休業の登録/解除)**・**顧客一覧/詳細/編集**・**予約リンク発行**・**メニュー/オプションの編集・追加**・**クーポンの発行/編集**・**売上・来店分析(「分析」画面)**。PCは左サイドバー、スマホは下タブ)/ 予約リンクによる流入元・問い合わせIDの記録とメニュー事前選択 / 顧客ID・LINE userId保存項目 / LINE連携(LIFF)/ 確認・2日前・当日通知 / **クーポン管理(発行・編集・無効化)と予約時の自動適用(金額OFF/%OFF、1人1回)**

**未実装(優先度の目安)**
1. 管理画面の残り: **スタッフ管理**。ナビ(`admin.html` の `NAV` / `VIEWS`)に足す
2. ~~管理画面でキャンセルした際のお客様への通知~~ → 実装済み(`adminSetStatus` の `notify`、詳細画面のチェックで ON/OFF。GAS実機は未確認)
3. LINEブロック判定の実機調整(`linePush_` の停止条件は推測。実際の応答を見て調整)
4. 週表示(時間軸)カレンダー、メニュー変更を伴う予約変更
5. Version 3: AIおすすめ診断、リピート促進の自動LINE配信
6. データ増加時の移行(予約が数千件を超えたらFirebase/Supabase等を検討)

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
- GASを変更したら「デプロイを管理」から**新バージョン**で更新(URLは変わらない)。列追加時・メニュー機能の初回導入時は `setup` を再実行(`メニュー`/`オプション`シートが初期データ付きで作られる)。顧客・予約・クーポンシートの列追加(流入元・クーポンなど)も `setup` 再実行で見出しが入る(`ensureColumns_` が書き込み時にも列を足す)。
- **公開の順序**: 先にGASを更新して `setup` → その後に `index.html` を公開。逆だと予約が `bad_menu` で失敗する(旧GASは新ペイロードの `total` 無しを受ける)。

## コーディング規約
- フロントは**依存なしのバニラJS単一HTML**。ビルド工程を入れない(GitHub Pagesにそのまま置ける)。外部読み込みはGoogle Fonts と LIFF SDK のみ。
- ユーザー入力は必ず `esc()` でエスケープして描画。数式・HTMLインジェクションに注意。
- スマホ優先(`viewport-fit=cover`、safe-area対応)。タップ領域44px以上、`aria-label`、フォーカスリング、`prefers-reduced-motion` 対応を維持。
- デザイントークン(CSS変数): cream `#F6EFE3` / paper `#FFFCF7` / sand `#EADBC3` / caramel `#B58553` / brown `#6E5238` / ink `#33261C` / moss `#44593F` / danger `#A5473A`。見出しは Shippori Mincho、本文は Zen Kaku Gothic New。落ち着いた琥珀色のトーンを崩さない。
- 新しいAPIは `handleAction_` に case を足し、**認証(トークン)必須か**を明示。エラーは `{ok:false,error:'snake_case'}` で返し、フロントの `errMsg` に日本語を追加。
- テストはデモモードで通る形で `tests/` に追加する。
