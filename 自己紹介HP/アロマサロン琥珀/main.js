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
  if (intro && video && !reduce) {
    var finished = false;
    var finish = function () {
      if (finished) return;
      finished = true;
      intro.classList.add("is-done");
      root.classList.remove("is-intro-playing");
      setTimeout(function () { intro.remove(); root.classList.remove("has-intro"); }, 1100);
    };
    root.classList.add("is-intro-playing");
    video.addEventListener("ended", finish);
    video.addEventListener("error", finish);
    var p = video.play();
    if (p && p.catch) p.catch(finish);
    setTimeout(finish, 12000); // 万一止まったときの保険
  } else if (intro) {
    intro.remove();
    root.classList.remove("has-intro");
  }
})();
