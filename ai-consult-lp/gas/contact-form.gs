/**
 * AIコンサルLPの問い合わせフォームを受信するGAS Web App。
 * スプレッドシートに紐づけて使う（コンテナバインド）ので、IDの手入力は不要。
 * 受信するとシートに追記し、通知メールも送る。
 *
 * デプロイ手順:
 * 1. Googleスプレッドシートを新規作成する（名前は「AIコンサルLP お問い合わせ」など）
 * 2. メニュー「拡張機能」→「Apps Script」を開き、このファイルの内容を貼り付けて保存
 * 3. 関数「setup」を選んで実行 → 権限を承認（見出し行が作られる）
 * 4. 関数「testNotify」を選んで実行 → メール送信の権限を承認（テストメールが届く）
 * 5. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *      実行するユーザー: 自分 / アクセスできるユーザー: 全員
 * 6. 発行された「ウェブアプリのURL」を ai-consult-lp/main.js の GAS_ENDPOINT に設定する
 *
 * コードを修正したら「デプロイを管理」→ 編集 → 新バージョンで更新する
 * （新規デプロイするとURLが変わるので注意）。
 * 新しい権限（メール送信）を追加した場合は、更新の前にエディタで関数を1回実行して承認しておく。
 */

const SHEET_NAME = "お問い合わせ";
const HEADERS = ["受信日時", "お名前", "メールアドレス", "相談内容"];

// 通知メールの宛先。空のままなら、このスクリプトを実行するアカウント（デプロイした本人）に送る。
// 別のアドレスに送りたいときだけ設定する（例: "you@example.com"）。
const NOTIFY_TO = "";
const MAIL_SENDER_NAME = "AIコンサルLP";

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

// メール送信の権限承認と動作確認用。エディタで実行すると、宛先にテストメールが届く
function testNotify() {
  notify_(
    { name: "[TEST] 通知テスト", email: "", message: "通知メールの動作確認です。このメールは削除して構いません。" },
    getSheet_().getParent().getUrl()
  );
}

// 件名などに使う文字列から改行を除き、長さを制限する
function oneLine_(value, max) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

function notify_(data, sheetUrl) {
  const to = NOTIFY_TO || Session.getEffectiveUser().getEmail();
  if (!to) return;

  const name = oneLine_(data.name, 40);
  const email = oneLine_(data.email, 200);
  const options = { name: MAIL_SENDER_NAME };
  // 返信するだけで相手に届くよう、形式が正しいときだけ Reply-To に設定する
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) options.replyTo = email;

  const received = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm");
  const body = [
    "AIコンサルLPに問い合わせがありました。",
    "",
    "受信日時: " + received,
    "お名前: " + (name || "(未入力)"),
    "メールアドレス: " + (email || "(未入力)"),
    "",
    "【相談内容】",
    String(data.message || "").trim() || "(未入力)",
    "",
    "----",
    "スプレッドシート: " + sheetUrl,
    options.replyTo ? "このメールに返信すると、相手のアドレスに届きます。" : "",
  ].join("\n");

  MailApp.sendEmail(to, "【AIコンサルLP】お問い合わせ: " + (name || "(名前なし)"), body, options);
}

// ---- 受け口の防御(公開URLなので、誰でも何度でも送れる前提で守る) ----
const LIMITS = { name: 40, email: 200, message: 2000 };
const RATE = { perEmailPerHour: 3, perHour: 20, perDay: 60 }; // メール上限(約100通/日)を使い切られないため

// 前後の空白・制御文字を除き、長さを制限する
function clean_(value, max) {
  return String(value == null ? "" : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
}

// スプレッドシートで式として実行されないよう、先頭が = + - @ のときは ' を付けて文字にする
function safeCell_(s) {
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

// CacheService のカウンタで回数を数え、上限を超えたら true
function overLimit_(key, limit, ttlSec) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), ttlSec);
  return n > limit;
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply_({ ok: false, error: "bad_request" });
  }
  if (!data || typeof data !== "object") return reply_({ ok: false, error: "bad_request" });

  // ハニーポット: 人には見えない欄に入力があれば、ボットとみなして何も保存・通知しない
  if (data.website) return reply_({ ok: true });

  const name = clean_(data.name, LIMITS.name);
  const email = clean_(data.email, LIMITS.email);
  const message = clean_(data.message, LIMITS.message);
  if (!name || !message) return reply_({ ok: false, error: "missing_field" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply_({ ok: false, error: "bad_email" });

  // 回数制限(同じメールの連投・全体の大量送信)。カウンタの更新を競合させないようロックする
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hour = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMddHH");
    const day = hour.slice(0, 8);
    if (
      overLimit_("mail:" + hour + ":" + email.toLowerCase(), RATE.perEmailPerHour, 3600) ||
      overLimit_("all:" + hour, RATE.perHour, 3600) ||
      overLimit_("all:" + day, RATE.perDay, 86400)
    ) {
      return reply_({ ok: false, error: "busy" });
    }

    const sheet = getSheet_();
    sheet.appendRow([new Date(), safeCell_(name), safeCell_(email), safeCell_(message)]);

    // 通知に失敗しても、シートへの記録と送信者への応答は成功のままにする
    try {
      notify_({ name: name, email: email, message: message }, sheet.getParent().getUrl());
    } catch (err) {
      console.error("通知メールの送信に失敗: " + err);
    }
  } finally {
    lock.releaseLock();
  }

  return reply_({ ok: true });
}
