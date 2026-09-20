// GASウェブアプリのデプロイ後、発行されたURLに差し替える（手順は gas/contact-form.gs 冒頭）
const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbzcjBaZo5FLa2SxVHC9H3OexsY4wlLmicdN5pjzpSYjt4bjJiS1OQLcLhp8hDBk01YIew/exec";

document.addEventListener("DOMContentLoaded", () => {
  // ヘッダー内リンクのスムーススクロール
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = document.querySelector(link.getAttribute("href"));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth" });
    });
  });

  // 問い合わせフォーム送信
  const form = document.getElementById("contact-form");
  const status = document.getElementById("form-status");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // エンドポイント未設定のまま「送信しました」と表示しないためのガード
    if (GAS_ENDPOINT.includes("REPLACE_WITH")) {
      status.textContent = "現在フォームは準備中です。お手数ですがLINEからご連絡ください。";
      return;
    }

    status.textContent = "送信中...";
    const formData = new FormData(form);
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      message: formData.get("message"),
    };

    try {
      // no-corsのためレスポンスは読めず、到達確認はできない（ネットワーク断のみcatchされる）
      await fetch(GAS_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      status.textContent = "送信しました。ご連絡ありがとうございます。";
      form.reset();
    } catch (error) {
      status.textContent = "送信に失敗しました。お手数ですがLINEからご連絡ください。";
    }
  });
});
