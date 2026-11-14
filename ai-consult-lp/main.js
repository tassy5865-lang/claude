// GASウェブアプリのデプロイ後、発行されたURLに差し替える（手順は gas/contact-form.gs 冒頭）
const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbzcjBaZo5FLa2SxVHC9H3OexsY4wlLmicdN5pjzpSYjt4bjJiS1OQLcLhp8hDBk01YIew/exec";
const SEND_TIMEOUT_MS = 20000;
const LINE_HINT = "お急ぎの場合はLINE公式アカウントからもご連絡いただけます。";

// 受け口の返事(または通信の失敗)を、画面に出す文言と「入力を消すか」に変える。
// 受付できた(ok:true)と確認できた時だけ成功扱いにし、それ以外は入力を残す。
function describeResult(result) {
  if (result && result.type === "response" && result.httpOk === false) {
    return { ok: false, clear: false, text: "受付の完了を確認できませんでした（サーバーのエラー）。重複を避けるため、LINEから「フォームを送った」とお知らせください。" };
  }
  if (result && result.type === "response" && result.body && result.body.ok === true) {
    return { ok: true, clear: true, text: "ご相談を受け付けました。2営業日以内に、ご入力のメールアドレスへご返信します。" };
  }
  if (result && result.type === "response" && result.body) {
    switch (result.body.error) {
      case "bad_email":
        return { ok: false, clear: false, field: "email", text: "メールアドレスの形式をご確認ください。入力内容はそのまま残しています。" };
      case "missing_field":
        return { ok: false, clear: false, field: "name", text: "お名前と相談内容を入力してください。" };
      case "busy":
        return { ok: false, clear: false, text: "ただいま送信が集中しています。少し時間をおいて再度お送りいただくか、LINEからご連絡ください。" };
      default:
        return { ok: false, clear: false, text: "送信内容を受け付けられませんでした。お手数ですが、LINEからご連絡ください。" };
    }
  }
  if (result && result.type === "timeout") {
    return { ok: false, clear: false, text: "送信に時間がかかり、受付を確認できませんでした。受け付けられている可能性もあります。もう一度「送信する」を押すと、同じ送信として照合するので重複しにくくなっています。心配な場合はLINEからお知らせください。" };
  }
  if (result && result.type === "unreadable") {
    return { ok: false, clear: false, text: "受付の完了を確認できませんでした。重複を避けるため、LINEから「フォームを送った」とお知らせください。" };
  }
  return { ok: false, clear: false, text: "通信が途切れ、受付を確認できませんでした。受け付けられている可能性もあります。入力内容は残しているので、接続を確かめてもう一度「送信する」を押してください（同じ送信として照合するので、重複しにくくなっています）。心配な場合はLINEからお知らせください。" };
}

// 送信ごとの受付ID。受け口は同じIDの再送を1件として扱う
function newRequestId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return "r" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}

// 受付を確認できなかった送信のIDを、ページを開き直しても同じ内容なら使えるように一時保存する
const PENDING_KEY = "nexsist-form-pending";
function loadPending() {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) || "null");
    return v && typeof v.key === "string" && typeof v.id === "string" ? v : null;
  } catch (e) {
    return null;
  }
}
function savePending(v) {
  try {
    if (v) window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(v));
    else window.sessionStorage.removeItem(PENDING_KEY);
  } catch (e) {
    /* 保存できない環境では、このページを開いている間だけIDを使い回す */
  }
}

window.NexsistForm = { describeResult };

document.addEventListener("DOMContentLoaded", () => {
  // ページ内リンクのスムーススクロール
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = document.querySelector(link.getAttribute("href"));
      if (!target) return;
      event.preventDefault();
      // 「動きを減らす」設定の人には、なめらかなスクロールをせずに一瞬で移動する
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
      // 「本文へ移動」などでキーボードのフォーカスも移す(tabindex="-1" の要素)
      if (target.hasAttribute("tabindex")) target.focus({ preventScroll: true });
    });
  });

  // 問い合わせフォーム送信
  const form = document.getElementById("contact-form");
  const status = document.getElementById("form-status");
  if (!form) return;
  const button = form.querySelector('button[type="submit"]');
  // HTMLでは送信ボタンを無効にしておき、この処理の準備ができてから押せるようにする
  // (JavaScriptが動かないときに、入力内容がURLに付いて送られるのを防ぐ)
  button.disabled = false;
  // 受付を確認できなかった送信の内容とID。同じ内容の再送には同じIDを使う
  let pending = loadPending();
  const fields = ["name", "email", "message"].map((k) => form.elements[k]).filter(Boolean);
  // 送信中は入力欄を書き換えられないようにする(送った内容と画面の内容を食い違わせない)
  const lockFields = (on) => fields.forEach((el) => { el.readOnly = on; });

  const show = (message, state) => {
    status.textContent = message;
    status.dataset.state = state;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled) return; // 連打による二重送信を防ぐ

    if (GAS_ENDPOINT.includes("REPLACE_WITH")) {
      show("現在フォームは準備中です。お手数ですがLINEからご連絡ください。", "error");
      return;
    }

    const formData = new FormData(form);
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      message: formData.get("message"),
      website: formData.get("website"), // ボット対策の見えない欄(人は入力しない)
    };
    const contentKey = JSON.stringify([payload.name, payload.email, payload.message]);
    if (!pending || pending.key !== contentKey) pending = { key: contentKey, id: newRequestId() };
    payload.requestId = pending.id;
    savePending(pending);

    button.disabled = true;
    lockFields(true);
    form.setAttribute("aria-busy", "true");
    show("送信中です…", "pending");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    let result;
    try {
      // text/plain の単純なPOSTにして、GASの返事(JSON)を読めるようにする
      const res = await fetch(GAS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      try {
        result = { type: "response", httpOk: res.ok, body: await res.json() };
      } catch (parseError) {
        result = { type: "unreadable" };
      }
    } catch (error) {
      result = { type: error && error.name === "AbortError" ? "timeout" : "network" };
    } finally {
      clearTimeout(timer);
    }

    const view = describeResult(result);
    show(view.ok ? view.text : view.text + (view.text.includes("LINE") ? "" : " " + LINE_HINT), view.ok ? "success" : "error");
    if (view.clear) {
      form.reset();
      pending = null;
      savePending(null);
    }
    if (view.field && form.elements[view.field]) form.elements[view.field].focus();
    lockFields(false);
    button.disabled = false;
    form.removeAttribute("aria-busy");
  });
});
