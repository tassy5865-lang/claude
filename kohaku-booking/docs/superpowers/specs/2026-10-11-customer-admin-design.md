# 顧客管理 + 予約リンク + 管理画面サイドバー化 設計書

日付: 2026-10-11 / 対象: `index.html` `admin.html` `gas/Code.gs` `tests/`

## 1. 目的
`予約サイト イメージ.jpg`(連携システム全体図)の「管理画面(店舗側)」と「顧客データの管理イメージ」を参考に、
Instagram DM・LINE・予約サイトを横断して顧客を一元管理できる管理画面にする。今回の範囲は次の3つ。

1. 予約リンクのパラメータ(流入元・問い合わせID・メニュー指定)を予約サイトが受け取り、予約と顧客に記録する
2. 管理画面に「顧客」画面を追加する(一覧・検索・詳細・手入力項目の編集)
3. 管理画面のナビをサイドバー/下タブ化し、「予約リンク発行ツール」を追加する

成功条件: DMで送った専用リンクから予約が入ると、顧客の流入元・問い合わせIDが自動で入り、
管理画面の顧客詳細で予約履歴・来店回数・最終来店とともに確認でき、メモを残せる。

## 2. 範囲外
Instagram API での自動取り込み / DM履歴の自動連携 / スタッフ管理 / メニュー・料金の管理画面編集 /
クーポン管理 / 売上分析(いずれも別の設計で扱う。ナビには作る時点で項目を足す)。

## 3. 予約リンクのパラメータ(`index.html`)
| パラメータ | 有効な値 | 無効時 |
|---|---|---|
| `source` | `instagram_dm` / `instagram` / `line` / `web` / `other` | 無視(空として扱う) |
| `inquiry` | `^[A-Za-z0-9_-]{1,32}$` | 無視 |
| `menu` | メニューID(シートの表示=ONのもの) | 無視。通常のトップから開始 |

- 読み取り元: `location.search`。LIFF経由では `liff.state`(`?source=...` を含むURLエンコード文字列)も解釈し、`QS` とマージする。
- 保持: 画面内の `S.ref = {source, inquiry}` と `sessionStorage`(try/catch、リロードとLIFFログインの再読込に耐えるため)。
  予約完了後の `fresh()` では引き継がない。
- `menu` 指定: メニュー取得(`loadMenu`)完了後に一致を探し、あれば `S.menu` を設定して `detail` 画面へ。
  メニュー取得に失敗した場合や不一致の場合はトップのまま。
- 送信: `submit()` の payload に `source` と `inquiry` を追加する(値があるときのみ)。
- デモ表示(`GAS_URL` 空)でも同じ解釈・画面遷移をする。

## 4. データモデル(列の追加は末尾のみ)
**予約**(24 → 26列、`HEADERS` の末尾に追加): `流入元`(25列目) / `問い合わせID`(26列目)。
既存の `流入経路`(web/admin。内部名 `source`)は意味を変えない。新しい2列の内部名は衝突を避けて `refSource` / `inquiryId` とし、
`appendReservation_` と `parseRow_` に反映する。

**顧客**(11 → 15列、`CUSTOMER_HEADERS` の末尾に追加): `Instagram名` / `流入元` / `初回問い合わせ日`(YYYY-MM-DD) / `問い合わせID`。

**顧客への反映ルール**(`upsertCustomer_` に第5引数 `ref = {source, inquiry}` を追加):
- 新規作成時: `流入元`=ref.source、`問い合わせID`=ref.inquiry、`初回問い合わせ日`=(inquiryがあれば当日)
- 既存顧客: 各項目が**空のときだけ**埋める。手入力・既存の値は上書きしない
- ref が空なら何もしない(管理画面経由の予約=`source: admin` でも同様)

**計算で表示する項目**(保存しない): 予約数 / 来店回数(状態=来店済) / 最終来店日 / 次回予約 / 予約履歴。
予約は `顧客ID` で紐づけ、顧客IDが空の古い行はメールで補う。

**移行**: `migrate_()` が見出しを最新にし、不足列を追加する(冪等)。
読み取り側(`allCustomers_` / `allRows_`)は `min(列数, getLastColumn())` で読み、`setup` 未実行でも落ちない。

## 5. API(`gas/Code.gs`)
| action | 認証 | 入力 | 出力 |
|---|---|---|---|
| `POST`(予約)の拡張 | なし | 予約サイトのpayloadに `source`, `inquiry` を追加(GAS内では `refSource` / `inquiryId` として扱う) | 変更なし。値は GAS 側で再検証し、無効なら空にする |
| `adminCustomers` | 要トークン | なし | `{ok, customers:[{id,name,kana,tel,email,instagram,refSource,inquiryDate,inquiryId,lineLinked,visits,reservations,lastVisit,next,memo,history:[{date,time,menuName,status}]}]}` |
| `adminCustomerUpdate` | 要トークン | `id`, `instagram`, `refSource`, `inquiryDate`, `memo` | `{ok}` / `{ok:false,error}` |

- `adminCustomerUpdate` の検証: `id` 存在(`not_found`) / `refSource` は許可値か空(`bad_source`) /
  `inquiryDate` は空か `YYYY-MM-DD`(`bad_date`) / `instagram` は100文字以内・`memo` は1000文字以内(`too_long`)。
  更新日時を記録する。セルは `'@'` 書式の文字列で保存(数式注入対策)。
- `adminCustomers` は全顧客を返す(予約が数千件を超えたら移行を検討、という既存方針のまま)。
- `adminList` の既存仕様(予約一覧・`closures`)は変えない。予約の応答に `refSource`(流入元)と `inquiryId` を足す(既存の `source`=web/admin はそのまま)。

## 6. 管理画面(`admin.html`)
**ナビ**: 予約 / 顧客 / 予約リンク の3項目。`A.section` を追加(`reserve|customers|links`)。
予約セクション内の「今日の予約 / カレンダー」は従来どおり。
- PC幅(900px以上): 左サイドバー(ブランド、3項目)+ 右にコンテンツ。幅は従来の `.wrap` を超えて広げる
- スマホ: 下タブ。「予約追加」のFABは予約セクションのみ、下タブの上に表示する
- 色は既存トークン(brown/ink/cream/sand)。サイドバーは `--ink` 背景

**顧客**:
- 一覧: 名前・フリガナ・電話・Instagram名・顧客IDの部分一致検索 + 流入元フィルタ。
  各行に 名前 / 流入元バッジ / 来店回数 / 最終来店 / 次回予約。並びは最終来店の新しい順(未来店は後ろ)
- 詳細(シート): 連絡先(電話・メールはリンク)/ LINE連携状況 / 予約履歴(新しい順)/ 編集欄
  (Instagram名・流入元・初回問い合わせ日・メモ)。保存は `adminCustomerUpdate`。DM対応の記録はメモ欄
- 取得失敗時は既存の `failed` 表示パターン(再読込ボタン)

**予約リンク発行**: 流入元(select)・問い合わせID(任意、入力検証は3章と同じ)・メニュー(任意、`MENU` の `id` を使う)
→ URL を生成し、読み取り専用の入力欄 + 「コピー」ボタン(`navigator.clipboard`、失敗時は選択状態にして案内)。
- ベースURLは `CONFIG.SITE_URL`。空なら `new URL('index.html', location.href)`
- 管理画面の `MENU` 予備配列に `id` を持たせ、`gas/Code.gs` の `SEED_MENU` と一致させる
- 発行履歴は保存しない。予約時に顧客へ紐づくのが記録になる

**デモ表示**: 顧客一覧は `demo` 予約からメールで集計して生成。編集は画面内のメモリのみ(`demoClosed` と同様)。

## 7. エラーとセキュリティ
- 顧客系APIは `adminAuth_` 必須。公開APIは `availability` / `menu` / 予約POST のみで、顧客情報は返さない
- 流入元・問い合わせIDは GAS で必ず再検証(許可値・正規表現)。クライアントの値は信用しない
- 画面描画は `esc()` を通す。URL生成は `encodeURIComponent` を使う
- `errMsg` に追加: `bad_source`(流入元が正しくありません)/ `too_long`(入力が長すぎます)

## 8. テスト
`npm test`(jsdom・デモモード)に追加する。
- `index.html`: `?source=instagram_dm&inquiry=IG-1&menu=<id>` でメニュー選択済みの詳細画面から始まる /
  無効な `source`・`inquiry`・`menu` は無視される / 予約送信のpayloadに `source`・`inquiry` が入る(fetchをスタブ)
- `admin.html`: 顧客一覧の表示・検索・流入元フィルタ / 詳細の予約履歴 / 編集と保存 / ナビ切替 /
  リンク発行(URLに期待のパラメータが入る、メニューIDは encode される)
- `gas/Code.gs`: `npm run check:gas` の構文チェック。ロジックは Apps Script 実機でしか確認できないため、
  `docs/deploy-checklist.md` に実機確認項目(パラメータ付き予約→顧客反映、顧客更新、列追加の migrate)を追記する

## 9. 公開順序
GASを新バージョンでデプロイ → `setup` 再実行(列追加) → `index.html` / `admin.html` 公開。
旧 `index.html`(新パラメータなし)でも新GASで動く。新 `index.html` を旧GASに向けても、追加項目が無視されるだけで予約は成功する。

## 10. 未確認・前提
- GAS・LINE・Googleカレンダー・スプレッドシートの実機動作は未確認(既存と同じ)
- `liff.state` からの引き継ぎはLINE実機でしか検証できない
- 流入元の選択肢は5種類で固定。増やす場合は `index.html` / `admin.html` / `Code.gs` の3箇所をそろえる
