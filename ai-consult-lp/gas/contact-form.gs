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
 * 7. 関数「installResendTrigger」を1回実行する(推奨)。1時間ごとに resendFailedNotifications が動き、
 *    通知メールが届いていない問い合わせ(「通知」列が「失敗」や、止まったままの「未送信」)を送り直す。
 *    何度実行してもトリガーは1つだけ。手動で送り直したいときは resendFailedNotifications を実行する
 *
 * コードを修正したら「デプロイを管理」→ 編集 → 新バージョンで更新する
 * （新規デプロイするとURLが変わるので注意）。
 * 新しい権限（メール送信）を追加した場合は、更新の前にエディタで関数を1回実行して承認しておく。
 */

const SHEET_NAME = "お問い合わせ";
const HEADERS = ["受信日時", "お名前", "メールアドレス", "相談内容", "受付ID", "通知", "再送回数", "最終再送", "失敗理由"];
const COL = { received: 1, name: 2, email: 3, message: 4, requestId: 5, notified: 6, tries: 7, lastTry: 8, reason: 9 };
// 「通知」列の状態: 未送信(保存直後・送信枠待ち) → 送信済 / 失敗。再送ジョブが処理中の行は「送信中」。
// 再送の上限まで失敗した行は「要手動対応」(自動では送らない。シートを見て本人が連絡する)
const MANUAL = "要手動対応";
// 通知メールの1日の送信枠。初回の通知と再送で共通に使う(MailApp の上限 約100通/日 に余裕を残す)
const MAIL_PER_DAY = 80;
const RESEND = {
  perRun: 10,                    // 1回の実行で送り直す最大件数(メールの1日の上限を使い切らない)
  maxTries: 5,                   // 再送の上限回数。超えた行はシートで確認して手動で対応する
  pendingAfterMs: 10 * 60 * 1000, // 保存から10分たっても「未送信」の行は、途中で止まったとみなして回収する
  staleClaimMs: 30 * 60 * 1000,  // 「送信中」のまま30分たった行も回収する
};

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
  // 以前の4列・6列のシートにも、足りない見出し(受付ID〜最終再送)を足す
  const head = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const extra = HEADERS.slice(COL.requestId - 1);
  if (extra.some(function (h, i) { return head[COL.requestId - 1 + i] !== h; })) {
    sheet.getRange(1, COL.requestId, 1, extra.length).setValues([extra]);
  }
  return sheet;
}

// 同じ受付IDの行があるか。キャッシュが消えていても重複を見つけられるよう、シートの受付ID列を全部見る
function hasRequestId_(sheet, requestId) {
  const last = sheet.getLastRow();
  if (last < 2) return false;
  const ids = sheet.getRange(2, COL.requestId, last - 1, 1).getValues();
  return ids.some(function (r) { return r[0] === requestId; });
}

function ageMs_(value, now) {
  return value && typeof value.getTime === "function" ? now - value.getTime() : Infinity;
}

function today_() {
  return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMddHH").slice(0, 8);
}

function reasonOf_(err) {
  return oneLine_(err && err.message ? err.message : err, 200);
}

// 通知メールが届いていない問い合わせを送り直す(installResendTrigger で1時間ごとに実行)。
// 対象: 「失敗」の行、保存から時間がたっても「未送信」の行、「送信中」のまま止まった行。
// 二重送信を避けるため、短いロックの中で対象を「送信中」にして確保し、メールはロックの外で送る
function resendFailedNotifications() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return; // ほかの受付・再送が動いているときは次の回に回す
  const claimed = [];
  let sheet;
  try {
    sheet = getSheet_();
    const last = sheet.getLastRow();
    if (last < 2) return;
    const values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
    const now = Date.now();
    const day = today_();
    for (let i = 0; i < values.length && claimed.length < RESEND.perRun; i++) {
      const r = values[i];
      const state = r[COL.notified - 1];
      const tries = Number(r[COL.tries - 1] || 0);
      const due =
        state === "失敗" ||
        (state === "未送信" && ageMs_(r[COL.received - 1], now) >= RESEND.pendingAfterMs) ||
        (state === "送信中" && ageMs_(r[COL.lastTry - 1], now) >= RESEND.staleClaimMs);
      if (!due) continue;
      if (tries >= RESEND.maxTries) {
        // 上限まで試した行(最後の試行が途中で止まった行も含む)は自動では送らず、手動対応に回す
        const why = state === "送信中" ? "最後の再送が途中で止まりました" : String(r[COL.reason - 1] || "再送の上限に達しました");
        sheet.getRange(i + 2, COL.notified).setValue(MANUAL);
        sheet.getRange(i + 2, COL.reason).setValue(why);
        continue;
      }
      // 送信枠がなければ今回はここまで。枠待ちの行は再送回数を使わずに次の回へ
      if (!takeDailySlot_("mailcount:", day, MAIL_PER_DAY)) break;
      sheet.getRange(i + 2, COL.notified, 1, 3).setValues([["送信中", tries + 1, new Date()]]);
      claimed.push({ row: i + 2, tries: tries + 1, data: { name: r[COL.name - 1], email: r[COL.email - 1], message: r[COL.message - 1], received: r[COL.received - 1] } });
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  if (!claimed.length) return;
  const url = sheet.getParent().getUrl();
  claimed.forEach(function (c) {
    try {
      notify_(c.data, url);
      sheet.getRange(c.row, COL.notified).setValue("送信済");
    } catch (err) {
      console.error("通知の再送に失敗: " + err);
      sheet.getRange(c.row, COL.notified).setValue(c.tries >= RESEND.maxTries ? MANUAL : "失敗");
      sheet.getRange(c.row, COL.reason).setValue(reasonOf_(err));
    }
  });
}

// 再送ジョブ(1時間ごと)を登録する。エディタから1回実行する。何度実行しても1つだけ
function installResendTrigger() {
  const exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === "resendFailedNotifications";
  });
  if (!exists) ScriptApp.newTrigger("resendFailedNotifications").timeBased().everyHours(1).create();
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
  if (!to) throw new Error("通知先のメールアドレスが取得できません(NOTIFY_TO を設定してください)");

  const name = oneLine_(data.name, 40);
  const email = oneLine_(data.email, 200);
  const options = { name: MAIL_SENDER_NAME };
  // 返信するだけで相手に届くよう、形式が正しいときだけ Reply-To に設定する
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) options.replyTo = email;

  // 受付日時はシートに保存した日時を使う(翌日に再送しても、問い合わせが来た日時が分かるように)
  const at = function (d) { return Utilities.formatDate(d, "Asia/Tokyo", "yyyy-MM-dd HH:mm"); };
  const hasReceived = data.received && typeof data.received.getTime === "function";
  const received = at(hasReceived ? data.received : new Date());
  const sentNow = at(new Date());
  const body = [
    "AIコンサルLPに問い合わせがありました。",
    "",
    "受付日時: " + received + (hasReceived && received !== sentNow ? "(このメールは " + sentNow + " に再送)" : ""),
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

// 1日の件数はスクリプトプロパティで数える(CacheService の有効期限は最大6時間なので日次には使えない)。
// 枠が残っていれば1つ使って true、なければ何も変えずに false。
// 日付が変わったら前日までのカウンタを消す。ロックの中から呼ぶこと
function takeDailySlot_(prefix, day, limit) {
  const props = PropertiesService.getScriptProperties();
  const key = prefix + day;
  props.getKeys().forEach(function (k) {
    if (k.indexOf(prefix) === 0 && k !== key) props.deleteProperty(k);
  });
  const n = Number(props.getProperty(key) || 0) + 1;
  if (n > limit) return false;
  props.setProperty(key, String(n));
  return true;
}

// 同じ送信(requestId)の再送は1件として扱う。通信が切れて利用者が再送しても二重に保存・通知しない
const REQUEST_ID_TTL = 21600; // 6時間(CacheService の上限)
function validRequestId_(id) {
  return typeof id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : "";
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

  // 回数制限・重複確認・保存はロックの中で行う(カウンタとシートの更新を競合させない)。
  // ロックが取れないときは「混雑」としてJSONで返す
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return reply_({ ok: false, error: "busy" });
  }
  const requestId = validRequestId_(data.requestId);
  let sheet, row, canMail;
  const receivedAt = new Date();
  try {
    const hour = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMddHH");
    const day = hour.slice(0, 8);
    const cache = CacheService.getScriptCache();
    sheet = getSheet_();
    if (requestId && (cache.get("req:" + requestId) || hasRequestId_(sheet, requestId))) {
      return reply_({ ok: true, duplicate: true });
    }
    if (
      overLimit_("mail:" + hour + ":" + email.toLowerCase(), RATE.perEmailPerHour, 3600) ||
      overLimit_("all:" + hour, RATE.perHour, 3600) ||
      !takeDailySlot_("daycount:", day, RATE.perDay)
    ) {
      return reply_({ ok: false, error: "busy" });
    }

    // 通知メールの送信枠も、再送ジョブと共通の枠からロックの中で確保する
    canMail = takeDailySlot_("mailcount:", day, MAIL_PER_DAY);
    sheet.appendRow([
      receivedAt, safeCell_(name), safeCell_(email), safeCell_(message), requestId, "未送信", 0, "",
      canMail ? "" : "1日の送信枠を超えたため、再送ジョブで後から送ります",
    ]);
    row = sheet.getLastRow();
    SpreadsheetApp.flush(); // 保存を確定させてからロックを外す
    if (requestId) {
      try {
        cache.put("req:" + requestId, "1", REQUEST_ID_TTL); // 重複確認の近道。失敗してもシートで確かめられる
      } catch (err) {
        console.error("受付IDのキャッシュに失敗: " + err);
      }
    }
  } finally {
    lock.releaseLock();
  }

  // 通知はロックの外で送る(メールが遅くても、ほかの問い合わせを待たせない)。
  // 失敗しても受付は成功のまま。「通知」列に結果を残し、resendFailedNotifications で送り直せる。
  // 送信枠がない日は「未送信」のまま残し、再送ジョブが枠の空いた回に送る
  if (!canMail) return reply_({ ok: true });
  try {
    notify_({ name: name, email: email, message: message, received: receivedAt }, sheet.getParent().getUrl());
    sheet.getRange(row, COL.notified).setValue("送信済");
  } catch (err) {
    console.error("通知メールの送信に失敗: " + err);
    sheet.getRange(row, COL.notified).setValue("失敗");
    sheet.getRange(row, COL.reason).setValue(reasonOf_(err));
  }

  return reply_({ ok: true });
}
