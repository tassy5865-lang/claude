/**
 * AIコンサルLPの問い合わせフォームを受信するGAS Web App。
 * スプレッドシートに紐づけて使う（コンテナバインド）ので、IDの手入力は不要。
 *
 * デプロイ手順:
 * 1. Googleスプレッドシートを新規作成する（名前は「AIコンサルLP お問い合わせ」など）
 * 2. メニュー「拡張機能」→「Apps Script」を開き、このファイルの内容を貼り付けて保存
 * 3. 関数「setup」を選んで実行 → 権限を承認（見出し行が作られる）
 * 4. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *      実行するユーザー: 自分 / アクセスできるユーザー: 全員
 * 5. 発行された「ウェブアプリのURL」を ai-consult-lp/main.js の GAS_ENDPOINT に設定する
 *
 * コードを修正したら「デプロイを管理」→ 編集 → 新バージョンで更新する
 * （新規デプロイするとURLが変わるので注意）。
 */

const SHEET_NAME = "お問い合わせ";
const HEADERS = ["受信日時", "お名前", "メールアドレス", "相談内容"];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

// 初回に1回だけ手動実行して、権限承認と見出し行の作成を済ませる
function setup() {
  getSheet_();
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  getSheet_().appendRow([
    new Date(),
    data.name || "",
    data.email || "",
    data.message || "",
  ]);

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
