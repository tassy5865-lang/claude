# メニュー・料金設定(管理画面から編集) 設計書

日付: 2026-10-11 / 対象: `gas/Code.gs` `admin.html` `tests/`
前提: `docs/superpowers/specs/2026-10-06-menu-sheet-design.md`(メニューのシート化)。同書で「管理画面の編集フォームは後で追加」とした部分にあたる。

## 1. 目的
オーナーがスプレッドシートを開かずに、管理画面からメニュー・オプションの名前・料金・所要分・説明・表示・並び順を編集し、新しいメニューを追加できるようにする。
`メニュー`/`オプション`シートは引き続き**正**であり、管理画面はその行を読み書きするだけにする。予約時のサーバー側料金再計算(`calcBooking_`)は変えない。

成功条件: 管理画面で料金を変えて保存すると、予約サイトのメニュー一覧に(最大5分待たずに)反映され、新規予約はその料金で確定する。

## 2. 範囲外
メニュー・オプションの削除(表示=OFFで代替) / ドラッグでの並べ替え / カテゴリ名や説明文(`CATS`)の編集 / サムネ画像 /
予約画面を開いたままのお客様への「料金が変わりました」警告(`price_changed`。既存の後回し項目) / 予約シートの既存行の書き換え。

## 3. GAS(`gas/Code.gs`)

### 3.1 API(いずれも `adminAuth_` 必須。`handleAction_` に case を追加)
| action | 入力 | 出力 |
|---|---|---|
| `adminMenu` | なし | `{ok, menu:[item…], options:[item…], cats:[{id}], groups:[id], kinds:['','pair','omakase']}`。**表示OFFを含む**全行を、キャッシュを使わずシートから直接読む(`loadMenu_()`)。`show`・`order` も含む |
| `adminMenuSave` | `{item, create}` | `{ok:true, id}` / `{ok:false, error, field?}` |
| `adminOptionSave` | `{item, create}` | 同上 |

`item`(メニュー): `{id, name, min, price, desc, cats[], g, kind, show, order}`。`price` は `null`(=当日案内)か整数。
`item`(オプション): `{id, name, min, price, show, order}`。

### 3.2 保存の挙動
- `create:true`: 新規行を末尾に追加。ID が空なら自動採番(メニュー `menu-<連番>`、オプション `opt-<連番>`。既存IDの数値部の最大+1)。既存IDと重複なら `duplicate_id`
- `create:false`: シートの1列目(ID)を `trim` して一致する行を更新。無ければ `not_found`。**IDは書き換えない**(`item.id` は検索キーとしてのみ使う)
- 行は `MENU_HEADERS` / `OPTION_HEADERS` の並びで、`setNumberFormat('@')` の文字列として書く(数式注入・先頭0落ち防止)。`cats` はカンマ区切り、`show` は `ON`/`OFF`、`price` が `null` なら空欄、`order` は文字列化
- 保存後に `CacheService.getScriptCache().remove('menu:v1')` で公開APIのキャッシュを消す(即時反映)
- 書き込みは既存どおり `doPost` の `LockService` 下で直列化される

### 3.3 入力検証(`validateMenuItem_(item, create, ids)` / `validateOptionItem_(item, create, ids)`、純関数。問題なければ `''`、あれば `{error, field}`)
| 項目 | 規則 | エラー |
|---|---|---|
| id | `^[A-Za-z0-9_-]{1,40}$`(create で空は自動採番) | `bad_field`(field=`id`) |
| id(create) | 既存と重複しない | `duplicate_id` |
| name | `trim` 後 1〜60文字 | `bad_field`(`name`) |
| desc | 200文字以内 | `bad_field`(`desc`) |
| min | 整数 10〜300。**種別 `omakase` のメニューは空/0可**。オプションは 0〜300 | `bad_field`(`min`) |
| price | メニューは `null` か 0〜1,000,000 の整数。オプションは 0〜1,000,000 の整数(必須) | `bad_field`(`price`) |
| kind | `''` / `pair` / `omakase` | `bad_field`(`kind`) |
| cats | 全要素が `first,rec,aroma,facial,steam,pair,omakase` のいずれか(0件は不可) | `bad_field`(`cats`) |
| g | `aroma,facial,steam,pair,omakase` のいずれか | `bad_field`(`g`) |
| show | boolean | `bad_field`(`show`) |
| order | 整数 0〜9999 | `bad_field`(`order`) |

数値は文字列で届いても、`numOrNull_` と同じ正規化(全角数字・カンマ・円記号の除去)を通してから判定する。

### 3.4 新しい純関数
`validateMenuItem_` / `validateOptionItem_` / `menuRowFromItem_(item) → string[10]` / `optionRowFromItem_(item) → string[6]` / `nextItemId_(prefix, ids) → string`。

## 4. 管理画面(`admin.html`)
- ナビ(`NAV` / `VIEWS`)に「メニュー」を追加(キー `menu`)。画面内は「メニュー / オプション」の切替(チップ)。
- 一覧: 並び順(`order`)昇順。各行に 名前 / 所要分 / 料金(空は「当日案内」)。表示OFFは薄く表示し「非表示」バッジ。上部に「＋ 追加」ボタン。
- 編集シート(既存の `.sheet` パターン): 名前 / 料金(空欄=当日案内)/ 所要分 / 説明 / カテゴリ(チェックボックス。日本語名: はじめての方・おすすめ・アロマ・フェイシャル・蒸し・ペア・おまかせ)/
  グループ(選択。日本語名: アロマ・フェイシャル・蒸し・ペア・おまかせ)/ 種別(通常・ペア(オプション料金が2名分)・おまかせ(料金と時間は当日相談))/ 表示(チェック)/ 並び順。
  ID は既存行では表示のみ、新規作成時のみ入力欄(任意・英数字。空なら自動)。種別を変更したら「料金の計算方法が変わります」と注意を出す。オプションはカテゴリ・グループ・種別・説明を持たない。
- 保存: `adminMenuSave` / `adminOptionSave`。成功したら一覧を再取得し、管理画面の予約追加・リンク発行で使う `MENU`(`loadMenu()`)も取り直す。失敗は `field` に応じた日本語メッセージ(例: 「料金は0〜1,000,000の整数で入力してください」)を表示。
- 取得失敗は既存の `failed` パターン(再読込ボタン)。`logout` / `reload` で状態をクリア。
- デモ表示(`GAS_URL` 空): 予備配列のコピーを画面内のメモリで編集(保存しても実データには影響しない)。

## 5. 安全性
- 管理系APIは必ずトークン必須。入力は GAS 側で再検証し、クライアントの検証は補助
- 表示は `esc()`、書き込みは文字列書式
- メニューIDは作成後に変更不可(既存予約・「同じメニューで予約」が参照するため)。削除機能は持たない
- `price` の変更は既存予約に影響しない(予約シートは確定時の名前・金額を保存済み)

## 6. 既知の限界
- 予約画面を開いたままのお客様は旧料金を見るが、確定時はサーバーが再計算するため請求は正しい(警告は後回し項目のまま)
- シートを直接編集して壊れた行(数値でない料金など)は従来どおり一覧から除外される
- 管理画面とシートを同時に編集した場合は、後に書いた方が勝つ(行単位)

## 7. テスト
- `tests/gas-menu-admin.test.js`(新規、`vm`): `validateMenuItem_` / `validateOptionItem_`(境界値: 名前0・61文字、所要分9・10・300・301、料金 `null`・-1・1000001・全角数字、おまかせの所要分空、不正なカテゴリ/グループ/種別)、
  `menuRowFromItem_`(`price:null`→空、`cats`→カンマ区切り、`show`→ON/OFF、全て文字列)、`nextItemId_`(既存IDの最大+1、数字を含まないIDが混ざっても落ちない)、`handleAction_` が3つのactionをトークン無しで `auth` 拒否
- `tests/admin.test.js`: メニュー一覧 → 編集 → 保存 → 反映 / 新規追加(ID空で自動) / 検証エラーの表示 / 表示OFFの見た目 / オプション切替 / HTMLエスケープ
- `check:gas`(構文)。シート書き込み・キャッシュ消去は実機確認とし、`docs/deploy-checklist.md` に追記(料金変更→予約サイトに即反映、新規追加、表示OFF、ID重複の拒否、シートの書式が文字列のまま)

## 8. 公開順序
GASを新バージョンでデプロイ → `admin.html` 公開(`setup` の再実行は不要)。
旧 `admin.html` でも新GASで動く(新しいactionを呼ばないだけ)。新 `admin.html` を旧GASに向けると、メニュー画面が `unknown_action` で取得失敗の表示になるだけで他の機能に影響しない。
