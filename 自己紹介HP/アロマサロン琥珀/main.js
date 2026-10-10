(function () {
  document.documentElement.classList.add("js");

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  var sticky = document.querySelector(".sticky-cta");
  var hero = document.getElementById("top");
  if (sticky && hero && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      sticky.classList.toggle("is-visible", !entries[0].isIntersecting);
    }).observe(hero);
  } else if (sticky) {
    sticky.classList.add("is-visible");
  }

  var items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0, rootMargin: "0px 0px -8% 0px" });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("is-in"); });
  }
  // ヘッダー: スクロールしたら半透明のアイボリー背景に
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 24); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // ヒーローの写真をごくゆっくり動かす(パララックス。動きを減らす設定では無効)
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var photos = document.querySelectorAll(".hero__photo img");
  if (!reduce && photos.length && window.matchMedia("(min-width: 820px)").matches) {
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = Math.min(window.scrollY, 700);
        photos.forEach(function (img, i) { img.style.transform = "translateY(" + (y * (i ? -0.05 : 0.08)).toFixed(1) + "px)"; });
        ticking = false;
      });
    }, { passive: true });
  }

  // オープニング動画: 1回再生 → フェードアウト → サイト表示(ボタンなし)
  var root = document.documentElement;
  var intro = document.getElementById("intro");
  var video = intro && intro.querySelector("video");
  // 初回かどうかは <head> の判定(has-intro クラスの有無)に従う
  if (intro && video && !reduce && root.classList.contains("has-intro")) {
    try { localStorage.setItem("kohaku-intro", "1"); } catch (e) {}
    try { sessionStorage.setItem("kohaku-intro", "1"); } catch (e) {} // localStorage不可時の代替
    var finished = false;
    var finish = function () {
      if (finished) return;
      finished = true;
      intro.classList.add("is-done");
      root.classList.remove("is-intro-playing");
      setTimeout(function () { intro.remove(); root.classList.remove("has-intro"); }, 1100);
    };
    root.classList.add("is-intro-playing");
    // 横長画面(PC)は横長動画、縦長画面(スマホ)は縦長動画
    var wide = window.matchMedia("(min-aspect-ratio: 1/1)").matches;
    video.src = wide ? video.getAttribute("data-src-wide") : video.getAttribute("data-src-tall");
    video.addEventListener("ended", finish);
    video.addEventListener("error", finish);
    // 再生が始まらない(通信が遅い等)ときは5秒で諦めてサイトを表示。始まったら動画の長さ(8秒)+余裕で保険
    var stallTimer = setTimeout(finish, 5000);
    video.addEventListener("playing", function () {
      clearTimeout(stallTimer);
      setTimeout(finish, 10000);
    }, { once: true });
    var p = video.play();
    if (p && p.catch) p.catch(finish);
  } else if (intro) {
    intro.remove();
    root.classList.remove("has-intro");
  }

  // アクセス解析: 予約・LINE・Instagram・地図ボタンのクリックをGA4のイベントとして送る
  var tracked = [
    { test: /^https:\/\/tol-app\.jp\//, name: "click_reserve" },
    { test: /^https:\/\/line\.me\//, name: "click_line" },
    { test: /^https:\/\/(ig\.me|www\.instagram\.com)\//, name: "click_instagram" },
    { test: /^https:\/\/www\.google\.com\/maps\//, name: "click_map" }
  ];
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || typeof window.gtag !== "function") return;
    var href = a.getAttribute("href");
    for (var i = 0; i < tracked.length; i++) {
      if (tracked[i].test.test(href)) {
        window.gtag("event", tracked[i].name, {
          link_url: href,
          link_text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40)
        });
        break;
      }
    }
  });
})();
