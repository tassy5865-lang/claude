# 琥珀サロンサイト Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 姫路の女性専用・完全予約制サロン「琥珀(こはく)」の、1ページ完結の静的ホームページを作る。

**Architecture:** `index.html` + `styles.css` + `main.js` + `images/` の静的サイト(ビルド不要)。本文は静的HTMLで書き、JSは補助(ナビ開閉・固定CTA・フェード)のみ。事実の抜けや誤りは Python 標準ライブラリだけの検査スクリプト `tools/check_site.py` で機械的に検出する。

**Tech Stack:** HTML / CSS / vanilla JS、Google Fonts(Noto Serif JP, Noto Sans JP)、Python 3 + Pillow(画像加工のみ)。

**Spec:** `docs/superpowers/specs/2026-10-03-kohaku-salon-site-design.md`

## Global Constraints

- 作業場所は `自己紹介HP/アロマサロン琥珀/`(以下 `SITE/`)。フォルダ名は変えない(OneDrive同期の事故を避ける)。
- 屋号の正式表記は「琥珀(こはく)」。
- 予約URL: `https://tol-app.jp/s/hgcmuzzsyrx2ji76o97n`
- LINE URL: `https://line.me/R/ti/p/@ncf2830x`
- Instagram: `https://www.instagram.com/kohaku_salon.himeji/` / DM: `https://ig.me/m/kohaku_salon.himeji`
- 住所: 兵庫県姫路市大津区天神町2丁目176-10。営業時間: 10:00〜17:00(最終受付15:00)。不定休(予約カレンダーで確認)。
- 電話番号・口コミ・実績の数字・効能の断定(「治る」「痩せる」等)は載せない。
- 料金は予約サイトを正とする(メニュー画像の料金は使わない)。商標 ®(おかま直伝よもぎ蒸し®、ハーブの読み取り®、おかま直伝頭ほぐし®)を付けて表記。
- 配色: 背景 `#FAF6F0` / `#F3EBE1`、文字 `#4A3B33`、ローズ `#B97F76`、セージ `#8A9A7B`、琥珀 `#C08A3E`(小さな装飾のみ)。暗色モードなし。
- 本文は最初から表示。JSなしでも全て読める。`prefers-reduced-motion` を尊重。
- 外部リンクは `target="_blank" rel="noopener"`。
- git は狭いパスだけ `git add`(`git add -A` 禁止)。`git push` はユーザーの明示的な許可を得てから。

## Review Focus

1. 360px幅のスマホで横スクロールが出ない(料金表・ボタン・長い見出し)。→ Task 6 のブラウザ確認
2. 画面下の固定予約ボタンが、最後のアクセス・予約セクションや本文を隠さない。→ CSS `body` の下余白 + Task 6 確認
3. JSが動かなくても全セクションの文章と予約リンクが読める。→ `check_site.py` が `index.html` の静的テキストだけを検査
4. 画像が読み込めなくても内容が分かる(altが全画像にある)。→ `check_site.py`
5. 料金16項目+初回限定が1つも欠けず、金額が予約サイトと一致する。→ `check_site.py` + Task 1 の目視照合

---

### Task 1: 予約サイトの料金を目視で照合し、検査スクリプトを作る(赤の状態)

**Files:**
- Create: `自己紹介HP/アロマサロン琥珀/tools/check_site.py`

**Interfaces:**
- Produces: `python tools/check_site.py` — 全検査が通れば終了コード0、失敗があれば項目を表示して1。以降の全タスクの「テスト」として使う。

- [ ] **Step 1: 予約サイトをブラウザで開き、料金16項目を目視で照合する**

`https://tol-app.jp/s/hgcmuzzsyrx2ji76o97n` を claude-in-chrome で開き(読むだけ、予約操作は一切しない)、スクリーンショットで次の表と照合する。差異があれば Step 2 の `PRICES` と、Task 5 のメニュー表の該当行を実際の値に直す。

| 名称 | 料金 |
|---|---|
| よもぎ蒸し30分 | ¥3,500 |
| よもぎ蒸し30分×アロマトリートメントor頭ほぐし30分 | ¥6,300 |
| 温活よもぎコース30分 | ¥4,400 |
| よもぎ蒸し30分×アロマトリートメント60分 | ¥9,800 |
| よもぎペア蒸し30分 | ¥6,000 |
| ペア蒸し×フットor頭ほぐし | ¥12,000 |
| よもぎ蒸し×背面30分 | ¥8,500 |
| よもぎ蒸し×頭ほぐし45分 | ¥7,800 |
| アロマトリートメント40分 | ¥4,000 |
| よもぎ蒸し×背面30分×選べるアロマ30分 | ¥11,500 |
| 背面コース30分 | ¥5,500 |
| アロマトリートメント80分 | ¥9,000 |
| アロマトリートメント60分 | ¥6,800 |
| 頭ほぐし30分 | ¥3,300 |
| 頭ほぐし45分 | ¥4,800 |
| お誕生日クーポン | ¥8,000 |

- [ ] **Step 2: 検査スクリプトを書く**

```python
#!/usr/bin/env python3
"""琥珀サイトの静的検査。python tools/check_site.py で実行する。"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

PRICES = [
    "¥3,500", "¥6,300", "¥4,400", "¥9,800", "¥6,000", "¥12,000", "¥8,500",
    "¥7,800", "¥4,000", "¥11,500", "¥5,500", "¥9,000", "¥6,800", "¥3,300",
    "¥4,800", "¥8,000",
]
MUST_CONTAIN = [
    "琥珀", "こはく", "完全予約制", "女性専用",
    "兵庫県姫路市大津区天神町2丁目176-10", "10:00", "17:00", "15:00", "不定休",
    "駐車場", "田代真弓", "12年目", "¥10,000", "¥12,000", "¥3,500",
    "おかま直伝よもぎ蒸し®", "ハーブの読み取り®", "おかま直伝頭ほぐし®",
    "料金は予約サイトの表示が最新です",
]
MUST_LINK = [
    "https://tol-app.jp/s/hgcmuzzsyrx2ji76o97n",
    "https://line.me/R/ti/p/@ncf2830x",
    "https://ig.me/m/kohaku_salon.himeji",
    "https://www.instagram.com/kohaku_salon.himeji/",
]
MUST_NOT_CONTAIN = [
    "TODO", "TBD", "tel:", "お電話", "治る", "治ります", "痩せる", "必ず効果", "口コミ",
    "アロマサロン琥珀",
]
SECTION_IDS = ["top", "worries", "about", "flow", "kodawari", "menu", "notice", "faq", "access"]


class Scan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.h1 = 0
        self.ids = set()
        self.imgs = []
        self.links = []
        self.jsonld = []
        self._in_jsonld = False
        self.text = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.add(a["id"])
        if tag == "h1":
            self.h1 += 1
        if tag == "img":
            self.imgs.append(a)
        if tag in ("a", "link") and "href" in a:
            self.links.append((tag, a))
        if tag == "script" and a.get("type") == "application/ld+json":
            self._in_jsonld = True
        elif tag in ("script", "style"):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag == "script" and self._in_jsonld:
            self._in_jsonld = False
        elif tag in ("script", "style") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if self._in_jsonld:
            self.jsonld.append(data)
        elif not self._skip:
            self.text.append(data)


def main():
    errors = []
    for name in ("index.html", "styles.css", "main.js"):
        if not (ROOT / name).exists():
            errors.append(f"ファイルがありません: {name}")
    if errors:
        return report(errors)

    raw = INDEX.read_text(encoding="utf-8")
    scan = Scan()
    scan.feed(raw)
    text = re.sub(r"\s+", "", "".join(scan.text))
    squashed = lambda s: re.sub(r"\s+", "", s)

    for p in PRICES:
        if p not in text:
            errors.append(f"料金がありません: {p}")
    for s in MUST_CONTAIN:
        if squashed(s) not in text:
            errors.append(f"本文にありません: {s}")
    for url in MUST_LINK:
        if url not in raw:
            errors.append(f"リンクがありません: {url}")
    for s in MUST_NOT_CONTAIN:
        if s in raw:
            errors.append(f"載せてはいけない語があります: {s}")
    for sid in SECTION_IDS:
        if sid not in scan.ids:
            errors.append(f"セクションidがありません: #{sid}")
    if scan.h1 != 1:
        errors.append(f"h1は1つだけ(現在 {scan.h1})")

    for img in scan.imgs:
        if not img.get("alt"):
            errors.append(f"altがない画像: {img.get('src')}")
        src = img.get("src", "")
        if src and not src.startswith("http") and not (ROOT / src).exists():
            errors.append(f"画像ファイルがありません: {src}")
    for tag, a in scan.links:
        href = a["href"]
        if href.startswith("http"):
            if tag == "a" and ("noopener" not in a.get("rel", "") or a.get("target") != "_blank"):
                if "fonts.g" not in href:
                    errors.append(f"外部リンクに target=_blank rel=noopener がありません: {href}")
        elif href.startswith("#"):
            if href[1:] and href[1:] not in scan.ids:
                errors.append(f"存在しないアンカー: {href}")
        elif href and not (ROOT / href).exists():
            errors.append(f"ファイルがありません: {href}")

    if not scan.jsonld:
        errors.append("JSON-LD がありません")
    for block in scan.jsonld:
        try:
            data = json.loads(block)
            if data.get("@type") != "HealthAndBeautyBusiness":
                errors.append("JSON-LD の @type が HealthAndBeautyBusiness ではありません")
            if "天神町2丁目176-10" not in json.dumps(data, ensure_ascii=False):
                errors.append("JSON-LD に住所がありません")
        except json.JSONDecodeError as e:
            errors.append(f"JSON-LD が壊れています: {e}")

    return report(errors)


def report(errors):
    if errors:
        print(f"NG {len(errors)}件")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: すべての検査に合格")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: 実行して失敗することを確認する**

Run: `cd "自己紹介HP/アロマサロン琥珀" && python tools/check_site.py`
Expected: `NG` と表示され、「ファイルがありません: index.html」などが出る(終了コード1)。

- [ ] **Step 4: Commit**

```bash
git add "自己紹介HP/アロマサロン琥珀/tools/check_site.py" docs/superpowers/specs/2026-10-03-kohaku-salon-site-design.md docs/superpowers/plans/2026-10-03-kohaku-salon-site.md
git commit -m "琥珀サイト: 設計書・実装計画・静的検査スクリプトを追加"
```

---

### Task 2: 画像を用意する

**Files:**
- Create: `SITE/tools/prepare_images.py`
- Create: `SITE/images/owner-steam.jpg`、`SITE/images/herbs.jpg`、`SITE/images/og-image.png`

**Interfaces:**
- Produces: `images/owner-steam.jpg`(店主・よもぎ蒸しの場面、555×582)、`images/herbs.jpg`(ハーブの器、メニュー画像から切り出し)、`images/og-image.png`(1200×630)。Task 4・5 の `<img>` と `<meta property="og:image">` が参照する。
- 1枚目の写真(施術中・背中が写る)は、施術を受けている方の掲載許可が未確認のため**使わない**。許可が出たら別途追加する。

- [ ] **Step 1: 画像加工スクリプトを書く**

日本語ファイル名はglobで拾う(Bashの直接指定は文字化けで失敗することがあるため)。

```python
#!/usr/bin/env python3
"""元画像から images/ を作る。python tools/prepare_images.py"""
import glob
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "images"
OUT.mkdir(exist_ok=True)


def find(pattern):
    hits = sorted(glob.glob(str(ROOT / pattern)))
    if not hits:
        raise SystemExit(f"元画像が見つかりません: {pattern}")
    return Path(hits[0])


# 1) 店主・よもぎ蒸し(215357 のスクリーンショット)
owner = Image.open(find("スクリーンショット*215357.png")).convert("RGB")
owner.save(OUT / "owner-steam.jpg", quality=88, optimize=True)

# 2) ハーブの器(メニュー画像の右側中段を切り出し。画像は 1024x1536)
menu = Image.open(find("アロマサロン*メニュー.png")).convert("RGB")
herbs = menu.crop((655, 535, 1000, 690))
herbs = herbs.resize((herbs.width * 2, herbs.height * 2), Image.LANCZOS)
herbs.save(OUT / "herbs.jpg", quality=90, optimize=True)

# 3) OGP画像 1200x630
FONTS = ["C:/Windows/Fonts/yumin.ttf", "C:/Windows/Fonts/YuGothM.ttc", "C:/Windows/Fonts/msmincho.ttc"]


def font(size):
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    raise SystemExit("日本語フォントが見つかりません")


card = Image.new("RGB", (1200, 630), "#F3EBE1")
photo = owner.copy()
photo.thumbnail((520, 546))
card.paste(photo, (1200 - photo.width - 42, (630 - photo.height) // 2))
d = ImageDraw.Draw(card)
d.text((70, 170), "琥珀", font=font(150), fill="#4A3B33")
d.text((74, 340), "こはく  姫路のプライベートサロン", font=font(36), fill="#B97F76")
d.text((74, 410), "脳の休息と巡りを変えるサロン", font=font(40), fill="#4A3B33")
d.text((74, 480), "女性専用・完全予約制", font=font(30), fill="#8A9A7B")
card.save(OUT / "og-image.png", optimize=True)
print("生成:", [p.name for p in sorted(OUT.iterdir())])
```

- [ ] **Step 2: 実行する**

Run: `cd "自己紹介HP/アロマサロン琥珀" && python tools/prepare_images.py`
Expected: `生成: ['herbs.jpg', 'og-image.png', 'owner-steam.jpg']`

- [ ] **Step 3: 画像を目で確認する**

`images/herbs.jpg` と `images/og-image.png` を Read ツールで開く。herbs.jpg に文字やイラストの枠が大きく写り込んでいたら、`menu.crop((...))` の座標を調整して再実行する。og-image.png は文字が欠けず、写真と重なっていないことを確認する。

- [ ] **Step 4: Commit**

```bash
git add "自己紹介HP/アロマサロン琥珀/tools/prepare_images.py" "自己紹介HP/アロマサロン琥珀/images/"
git commit -m "琥珀サイト: 画像加工スクリプトと画像を追加"
```

---

### Task 3: styles.css と main.js を書く

**Files:**
- Create: `SITE/styles.css`
- Create: `SITE/main.js`

**Interfaces:**
- Produces (Task 4・5 の HTML が使うクラス): `.container` `.section` `.section--alt` `.eyebrow` `.btn` `.btn--primary` `.btn--line` `.btn--ghost` `.site-header` `.nav` `.nav-toggle` `.hero` `.hero__media` `.cta-row` `.cards` `.card` `.checklist` `.about` `.steps` `.price-card` `.price-group` `.price-list` `.badge` `.notice` `.faq` `.access` `.sticky-cta` `.footer` `.reveal`
- main.js は `<button class="nav-toggle" aria-expanded>` と `<nav id="site-nav">` を開閉し、`.reveal` 要素をスクロールで表示、`.sticky-cta` を最初の画面を過ぎたら表示する。JS無効時は `.js` クラスが付かないので、全て最初から表示される。

- [ ] **Step 1: styles.css を書く**

```css
:root {
  --bg: #faf6f0;
  --bg-alt: #f3ebe1;
  --ink: #4a3b33;
  --ink-soft: #6f5f55;
  --rose: #b97f76;
  --rose-deep: #9c5f56;
  --sage: #8a9a7b;
  --amber: #c08a3e;
  --line: #e4d8ca;
  --radius: 18px;
  --serif: "Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif;
  --sans: "Noto Sans JP", "Yu Gothic", "Hiragino Sans", Meiryo, sans-serif;
}

*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 72px; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.9;
  padding-bottom: 88px; /* 固定CTAが本文を隠さない余白 */
  overflow-wrap: anywhere;
}
img { max-width: 100%; height: auto; display: block; }
a { color: var(--rose-deep); }
h1, h2, h3 { font-family: var(--serif); font-weight: 500; line-height: 1.5; margin: 0; }
p { margin: 0 0 1em; }
:focus-visible { outline: 3px solid var(--amber); outline-offset: 3px; }

.container { width: min(100% - 32px, 1040px); margin-inline: auto; }
.section { padding: 72px 0; }
.section--alt { background: var(--bg-alt); }
.eyebrow { color: var(--sage); font-size: 13px; letter-spacing: .24em; margin: 0 0 8px; }
.section h2 { font-size: clamp(24px, 5vw, 34px); margin-bottom: 28px; }
.lead { color: var(--ink-soft); max-width: 36em; }

/* ボタン */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 48px; padding: 0 26px; border-radius: 999px;
  font-weight: 700; text-decoration: none; border: 2px solid transparent;
  transition: transform .2s, background .2s;
}
.btn:hover { transform: translateY(-1px); }
.btn--primary { background: var(--rose-deep); color: #fff; }
.btn--primary:hover { background: #864d45; }
.btn--line { background: #fff; color: #2f6b3a; border-color: #2f6b3a; }
.btn--ghost { background: transparent; color: var(--ink); border-color: var(--line); }
.cta-row { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }

/* ヘッダー */
.site-header {
  position: sticky; top: 0; z-index: 20;
  background: rgba(250, 246, 240, .94); backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
}
.site-header .container { display: flex; align-items: center; justify-content: space-between; min-height: 64px; }
.brand { font-family: var(--serif); font-size: 22px; letter-spacing: .12em; text-decoration: none; color: var(--ink); }
.brand small { font-size: 12px; letter-spacing: .1em; color: var(--ink-soft); margin-left: 6px; }
.nav { display: none; }
.nav.is-open {
  display: block; position: absolute; left: 0; right: 0; top: 64px;
  background: var(--bg); border-bottom: 1px solid var(--line); padding: 8px 16px 16px;
}
.nav a { display: block; padding: 12px 4px; color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--line); }
.nav-toggle {
  min-height: 44px; min-width: 44px; border: 1px solid var(--line); border-radius: 12px;
  background: transparent; color: var(--ink); font: inherit; cursor: pointer;
}
.header-cta { display: none; }

/* ヒーロー */
.hero { padding: 48px 0 64px; background: linear-gradient(180deg, var(--bg-alt), var(--bg)); }
.hero .container { display: grid; gap: 32px; }
.hero h1 { font-size: clamp(32px, 8vw, 52px); letter-spacing: .08em; }
.hero h1 small { display: block; font-size: 15px; letter-spacing: .2em; color: var(--rose); margin-bottom: 10px; }
.hero__tag { font-family: var(--serif); font-size: clamp(18px, 4.4vw, 24px); margin: 18px 0 8px; }
.hero__chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 18px 0 0; list-style: none; }
.hero__chips li { background: #fff; border: 1px solid var(--line); border-radius: 999px; padding: 4px 14px; font-size: 14px; }
.hero__media img { border-radius: 28px; width: 100%; max-width: 380px; margin-inline: auto; box-shadow: 0 18px 40px rgba(74, 59, 51, .14); }

/* カード・チェックリスト */
.cards { display: grid; gap: 16px; }
.card { background: #fff; border: 1px solid var(--line); border-radius: var(--radius); padding: 24px; }
.checklist { list-style: none; padding: 0; margin: 0 0 24px; display: grid; gap: 12px; }
.checklist li { position: relative; padding-left: 32px; }
.checklist li::before { content: ""; position: absolute; left: 4px; top: .62em; width: 14px; height: 8px; border-left: 2px solid var(--sage); border-bottom: 2px solid var(--sage); transform: rotate(-45deg); }

/* 店主 */
.about { display: grid; gap: 28px; }
.about img { border-radius: var(--radius); max-width: 420px; width: 100%; }
.about__name { font-family: var(--serif); font-size: 20px; margin: 0 0 4px; }
.about__meta { color: var(--ink-soft); font-size: 14px; }

/* 施術の流れ */
.steps { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; counter-reset: step; }
.steps li { counter-increment: step; position: relative; background: #fff; border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 18px 18px 68px; }
.steps li::before {
  content: counter(step); position: absolute; left: 18px; top: 16px; width: 36px; height: 36px; border-radius: 50%;
  background: var(--rose); color: #fff; display: grid; place-items: center; font-family: var(--serif);
}
.steps strong { display: block; }
.steps span { color: var(--ink-soft); font-size: 14px; }

/* こだわり */
.kodawari { display: grid; gap: 28px; align-items: center; }
.kodawari img { border-radius: var(--radius); width: 100%; }

/* メニュー・料金 */
.price-card { background: #fff; border: 2px solid var(--amber); border-radius: var(--radius); padding: 24px; margin-bottom: 36px; }
.badge { display: inline-block; background: var(--amber); color: #fff; font-size: 13px; padding: 2px 12px; border-radius: 999px; margin-bottom: 10px; }
.price-card h3 { font-size: 20px; margin-bottom: 8px; }
.price-card .price { font-family: var(--serif); font-size: 30px; color: var(--rose-deep); }
.price-card .price s { font-size: 16px; color: var(--ink-soft); margin-right: 8px; }
.price-group { margin-bottom: 32px; }
.price-group h3 { font-size: 18px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 2px solid var(--line); }
.price-list { list-style: none; padding: 0; margin: 0; }
.price-list li { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 12px 0; border-bottom: 1px dashed var(--line); }
.price-list .name { flex: 1 1 auto; min-width: 0; }
.price-list .yen { flex: 0 0 auto; font-family: var(--serif); white-space: nowrap; }
.fine { color: var(--ink-soft); font-size: 14px; }

/* 案内・FAQ */
.notice { background: #fff; border-left: 4px solid var(--sage); border-radius: 0 var(--radius) var(--radius) 0; padding: 18px 22px; margin-bottom: 16px; }
.notice h3 { font-size: 17px; margin-bottom: 8px; }
.notice ul { margin: 0; padding-left: 1.2em; }
.faq details { background: #fff; border: 1px solid var(--line); border-radius: 14px; margin-bottom: 10px; padding: 0 18px; }
.faq summary { cursor: pointer; padding: 16px 0; font-weight: 700; list-style-position: outside; }
.faq details p { padding-bottom: 16px; color: var(--ink-soft); }

/* アクセス */
.access { display: grid; gap: 24px; }
.access dl { margin: 0; }
.access dt { font-weight: 700; margin-top: 14px; }
.access dd { margin: 0; color: var(--ink-soft); }

/* フッター・固定CTA */
.footer { text-align: center; padding: 32px 16px 24px; color: var(--ink-soft); font-size: 13px; }
.sticky-cta {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; display: flex; gap: 8px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); background: rgba(250, 246, 240, .96);
  border-top: 1px solid var(--line); transform: translateY(0); transition: transform .3s;
}
.sticky-cta .btn { flex: 1 1 0; min-height: 46px; padding: 0 8px; font-size: 15px; }
.js .sticky-cta { transform: translateY(110%); }
.js .sticky-cta.is-visible { transform: translateY(0); }

/* フェード(JS有効時のみ。本文はJSなしなら最初から見える) */
.js .reveal { opacity: 0; transform: translateY(14px); transition: opacity .7s, transform .7s; }
.js .reveal.is-in { opacity: 1; transform: none; }

@media (min-width: 820px) {
  body { padding-bottom: 0; }
  .sticky-cta { display: none; }
  .nav-toggle { display: none; }
  .nav { display: flex; gap: 22px; }
  .nav a { border: 0; padding: 8px 0; font-size: 14px; }
  .header-cta { display: inline-flex; min-height: 40px; padding: 0 20px; }
  .hero .container { grid-template-columns: 1.2fr 1fr; align-items: center; }
  .cards { grid-template-columns: repeat(3, 1fr); }
  .about { grid-template-columns: 420px 1fr; align-items: center; }
  .kodawari { grid-template-columns: 1fr 1fr; }
  .steps { grid-template-columns: 1fr 1fr; }
  .access { grid-template-columns: 1fr 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .btn, .sticky-cta, .js .reveal { transition: none; }
  .js .reveal { opacity: 1; transform: none; }
}
```

- [ ] **Step 2: main.js を書く**

```javascript
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
    }, { threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("is-in"); });
  }
})();
```

- [ ] **Step 3: 構文を確認する**

Run: `node --check "自己紹介HP/アロマサロン琥珀/main.js"`
Expected: 何も表示されず終了コード0(Node がなければ Task 6 のブラウザ確認でコンソールエラーがないことを見る)。

- [ ] **Step 4: Commit**

```bash
git add "自己紹介HP/アロマサロン琥珀/styles.css" "自己紹介HP/アロマサロン琥珀/main.js"
git commit -m "琥珀サイト: スタイルとスクリプトを追加"
```

---

### Task 4: index.html(前半:head〜こだわり)

**Files:**
- Create: `SITE/index.html`(後半は Task 5 で `<!-- PART2 -->` の位置に追記)

**Interfaces:**
- Consumes: Task 3 のクラス、Task 2 の `images/owner-steam.jpg` `images/herbs.jpg` `images/og-image.png`
- Produces: セクション id `top` `worries` `about` `flow` `kodawari`、固定CTA、ヘッダー。Task 5 は `<!-- PART2 -->` を `menu` `notice` `faq` `access` とフッターに置き換える。

> 公開URL(canonical / og:url)は GitHub Pages のパスが確定するまで使えないため、**canonical と og:url は付けない**。公開URLが決まった時点で Task 7 で追加する。og:image も絶対URLが必要なため同様。

- [ ] **Step 1: index.html の前半を書く**

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>琥珀(こはく)|姫路の女性専用・完全予約制アロマ&よもぎ蒸しサロン</title>
  <meta name="description" content="姫路市大津区の女性専用プライベートサロン「琥珀(こはく)」。アロマトリートメントとよもぎ蒸しで、香りに包まれて自分に戻る時間を。完全予約制。">
  <meta name="theme-color" content="#faf6f0">
  <meta property="og:type" content="website">
  <meta property="og:title" content="琥珀(こはく)|姫路のアロマ&よもぎ蒸しサロン">
  <meta property="og:description" content="脳の休息と巡りを変えるサロン。女性専用・完全予約制。">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&family=Noto+Serif+JP:wght@500&display=swap">
  <link rel="stylesheet" href="styles.css">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    "name": "琥珀(こはく)",
    "description": "姫路市大津区の女性専用・完全予約制のプライベートサロン。アロマトリートメントとよもぎ蒸し。",
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "JP",
      "addressRegion": "兵庫県",
      "addressLocality": "姫路市",
      "streetAddress": "大津区天神町2丁目176-10"
    },
    "sameAs": ["https://www.instagram.com/kohaku_salon.himeji/"]
  }
  </script>
</head>
<body>
  <header class="site-header">
    <div class="container">
      <a class="brand" href="#top">琥珀<small>こはく</small></a>
      <nav class="nav" id="site-nav" aria-label="主要メニュー">
        <a href="#worries">こんな方へ</a>
        <a href="#about">店主</a>
        <a href="#flow">施術の流れ</a>
        <a href="#menu">メニュー・料金</a>
        <a href="#faq">よくある質問</a>
        <a href="#access">アクセス</a>
      </nav>
      <a class="btn btn--primary header-cta" href="https://tol-app.jp/s/hgcmuzzsyrx2ji76o97n" target="_blank" rel="noopener">ご予約</a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">メニュー</button>
    </div>
  </header>

  <main>
    <section class="hero" id="top">
      <div class="container">
        <div>
          <h1><small>姫路・大津区天神町</small>琥珀</h1>
          <p class="hero__tag">脳の休息と巡りを変えるサロン</p>
          <p class="lead">香りに包まれ、ふっと力を抜いて、本来の自分に戻る時間。</p>
          <ul class="hero__chips">
            <li>女性専用</li>
            <li>完全予約制</li>
            <li>駐車場あり</li>
          </ul>
          <div class="cta-row">
            <a class="btn btn--primary" href="https://tol-app.jp/s/hgcmuzzsyrx2ji76o97n" target="_blank" rel="noopener">予約サイトから予約</a>
            <a class="btn btn--line" href="https://line.me/R/ti/p/@ncf2830x" target="_blank" rel="noopener">LINEで相談</a>
          </div>
        </div>
        <div class="hero__media">
          <img src="images/owner-steam.jpg" width="555" height="582" alt="よもぎ蒸しのガウンを着て、穏やかに目を閉じる店主。奥にはサロンの部屋が見える">
        </div>
      </div>
    </section>

    <section class="section" id="worries">
      <div class="container reveal">
        <p class="eyebrow">FOR YOU</p>
        <h2>こんな「小さな不調」を、当たり前にしていませんか?</h2>
        <ul class="checklist">
          <li>なんとなく疲れが抜けない</li>
          <li>眠ってもスッキリしない</li>
          <li>年齢とともに、体や肌の変化を感じる</li>
          <li>不眠・慢性疲労・更年期のゆらぎ・くすみ・体型のお悩み</li>
        </ul>
        <p class="lead">心と体は、思っている以上につながっています。琥珀では、ただ不調をケアするだけでなく、香りと温かさに包まれながら、心と体をゆるめる時間を大切にしています。</p>
      </div>
    </section>

    <section class="section section--alt" id="about">
      <div class="container about reveal">
        <img src="images/owner-steam.jpg" width="555" height="582" loading="lazy" alt="サロンの一室で微笑む店主の田代真弓">
        <div>
          <p class="eyebrow">THERAPIST</p>
          <h2>頑張りすぎるあなたに、力を抜く時間を。</h2>
          <p class="about__name">田代 真弓</p>
          <p class="about__meta">セラピスト歴 2026年で12年目</p>
          <p>忙しい毎日の中に、溜め込まない日をつくる。誰かのために頑張る前に、自分を大切にする時間をつくる。そんな小さな習慣が、これからの心と体をやさしく変えていくのかもしれません。</p>
          <p>香りに包まれて、深呼吸。「また頑張れる私」に戻る場所でありたいと考えています。</p>
        </div>
      </div>
    </section>

    <section class="section" id="flow">
      <div class="container reveal">
        <p class="eyebrow">FLOW</p>
        <h2>はじめての方へ|施術の流れ</h2>
        <p class="lead">初回限定メニュー(アロマボディトリートメント × まこも蒸し・100分)の流れです。</p>
        <ol class="steps">
          <li><strong>ウェルカムティー</strong><span>季節のハーブティーをどうぞ。</span></li>
          <li><strong>カウンセリングシート</strong><span>今のお体の状態やご希望をご記入ください。</span></li>
          <li><strong>体質診断チェック</strong><span>東洋医学に基づいて、体質を確認します。</span></li>
          <li><strong>まこも蒸し(30分)</strong><span>ハーブをお選びいただきます。温度は調整できます。</span></li>
          <li><strong>ボディトリートメント(50分)</strong><span>ベッドで、全身または気になる部位を。</span></li>
          <li><strong>お着替えと、おやすみ処</strong><span>よもぎ茶と茶菓子をご用意しています。</span></li>
        </ol>
      </div>
    </section>

    <section class="section section--alt" id="kodawari">
      <div class="container kodawari reveal">
        <img src="images/herbs.jpg" loading="lazy" width="690" height="310" alt="器に盛られた乾燥ハーブ">
        <div>
          <p class="eyebrow">COMMITMENT</p>
          <h2>素材へのこだわり</h2>
          <ul class="checklist">
            <li>国産の、香り高いよもぎと真菰(まこも)を使用</li>
            <li>ガイヤの水を利用</li>
            <li>化粧品登録のオイルを使用</li>
            <li>環境に優しい素材を選んでいます</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- PART2 -->
  </main>
```

> 注意: about セクションの写真 alt は「微笑む」と書いたが、実際の写真(owner-steam.jpg)は目を閉じた表情。**実装時に画像を見て alt を実際の様子に合わせて直す**(Step 3)。

- [ ] **Step 2: 検査を実行し、前半だけでは失敗することを確認する**

Run: `python tools/check_site.py`
Expected: `NG`。メニュー料金・セクション #menu #notice #faq #access・予約前案内などの不足が列挙される。前半で追加した項目(琥珀、田代真弓、12年目、完全予約制、女性専用、LINEリンクなど)が不足リストに出ていないこと。

- [ ] **Step 3: alt を実際の写真に合わせて直す**

`images/owner-steam.jpg` を Read で開き、`index.html` の2か所の alt(ヒーロー・店主セクション)を、写っている内容(目を閉じて穏やか、よもぎ蒸しのガウン、奥にサロンの部屋)に合わせて書き直す。2か所は同じ文にしない(ヒーローは場面の説明、店主セクションは人物の説明)。

- [ ] **Step 4: Commit**

```bash
git add "自己紹介HP/アロマサロン琥珀/index.html"
git commit -m "琥珀サイト: ページ前半(ヒーロー〜こだわり)を追加"
```

---

### Task 5: index.html(後半:メニュー〜アクセス・フッター)

**Files:**
- Modify: `SITE/index.html`(`<!-- PART2 -->` を置き換え、`</main>` の後に footer・固定CTA・script を追加)

**Interfaces:**
- Consumes: Task 4 の `<!-- PART2 -->`、`</main>` の直前。Task 1 の `PRICES` 16項目(照合済みの値)。
- Produces: セクション id `menu` `notice` `faq` `access`。Task 1 の `check_site.py` が全項目合格になる。

- [ ] **Step 1: `<!-- PART2 -->` を次の内容に置き換える**

```html
    <section class="section" id="menu">
      <div class="container reveal">
        <p class="eyebrow">MENU</p>
        <h2>メニューと料金</h2>

        <div class="price-card">
          <span class="badge">初回限定</span>
          <h3>アロマボディトリートメント × まこも蒸し + 体質診断チェック付き</h3>
          <p>100分</p>
          <p class="price"><s>通常 ¥12,000</s>¥10,000</p>
        </div>

        <div class="price-group">
          <h3>よもぎ蒸し</h3>
          <ul class="price-list">
            <li><span class="name">よもぎ蒸し 30分</span><span class="yen">¥3,500</span></li>
            <li><span class="name">温活よもぎコース 30分</span><span class="yen">¥4,400</span></li>
            <li><span class="name">よもぎペア蒸し 30分</span><span class="yen">¥6,000</span></li>
            <li><span class="name">ペア蒸し × フットまたは頭ほぐし</span><span class="yen">¥12,000</span></li>
          </ul>
        </div>

        <div class="price-group">
          <h3>よもぎ蒸し × 施術のセット</h3>
          <ul class="price-list">
            <li><span class="name">よもぎ蒸し 30分 × アロマトリートメントまたは頭ほぐし 30分</span><span class="yen">¥6,300</span></li>
            <li><span class="name">よもぎ蒸し × 頭ほぐし 45分</span><span class="yen">¥7,800</span></li>
            <li><span class="name">よもぎ蒸し × 背面 30分</span><span class="yen">¥8,500</span></li>
            <li><span class="name">よもぎ蒸し 30分 × アロマトリートメント 60分</span><span class="yen">¥9,800</span></li>
            <li><span class="name">よもぎ蒸し × 背面 30分 × 選べるアロマ 30分</span><span class="yen">¥11,500</span></li>
          </ul>
        </div>

        <div class="price-group">
          <h3>アロマトリートメント</h3>
          <ul class="price-list">
            <li><span class="name">背面コース 30分</span><span class="yen">¥5,500</span></li>
            <li><span class="name">アロマトリートメント 40分</span><span class="yen">¥4,000</span></li>
            <li><span class="name">アロマトリートメント 60分</span><span class="yen">¥6,800</span></li>
            <li><span class="name">アロマトリートメント 80分</span><span class="yen">¥9,000</span></li>
          </ul>
        </div>

        <div class="price-group">
          <h3>頭ほぐし</h3>
          <ul class="price-list">
            <li><span class="name">頭ほぐし 30分</span><span class="yen">¥3,300</span></li>
            <li><span class="name">頭ほぐし 45分</span><span class="yen">¥4,800</span></li>
          </ul>
        </div>

        <div class="price-group">
          <h3>お誕生日クーポン</h3>
          <ul class="price-list">
            <li><span class="name">お誕生日クーポン(お誕生日の月のみ)</span><span class="yen">¥8,000</span></li>
          </ul>
        </div>

        <p class="fine">料金は予約サイトの表示が最新です。<a href="https://tol-app.jp/s/hgcmuzzsyrx2ji76o97n" target="_blank" rel="noopener">予約サイトで確認する</a>。おかま直伝よもぎ蒸し®・ハーブの読み取り®・おかま直伝頭ほぐし®は登録商標です。</p>
      </div>
    </section>

    <section class="section section--alt" id="notice">
      <div class="container reveal">
        <p class="eyebrow">NOTICE</p>
        <h2>ご予約前にご確認ください</h2>
        <div class="notice">
          <h3>キャンセルについて</h3>
          <p>当日キャンセルの場合、キャンセル料は一律¥3,500です。2週間以内にご予約を変更いただく場合は、キャンセル料は発生しません。</p>
        </div>
        <div class="notice">
          <h3>蒸しをご希望の方へ</h3>
          <ul>
            <li>妊娠の可能性がある時期は、蒸しをお受けできません。</li>
            <li>妊活中の方は、低温期に蒸しを行います。</li>
            <li>授乳中の方は、ハーブなしで薬草蒸しを行います。</li>
            <li>生理中は、蒸しをお控えください。</li>
          </ul>
        </div>
        <div class="notice">
          <h3>お車でお越しの方</h3>
          <p>駐車場があります。</p>
        </div>
      </div>
    </section>

    <section class="section" id="faq">
      <div class="container faq reveal">
        <p class="eyebrow">FAQ</p>
        <h2>よくある質問</h2>
        <details><summary>予約は必要ですか?</summary><p>完全予約制です。予約サイト、公式LINE、InstagramのDMからご連絡いただけます。</p></details>
        <details><summary>営業日と営業時間を教えてください。</summary><p>不定休です(土日に営業することもあります)。営業時間は10:00〜17:00、最終受付は15:00です。営業日は予約サイトのカレンダーでご確認ください。</p></details>
        <details><summary>男性も利用できますか?</summary><p>女性専用のプライベートサロンです。</p></details>
        <details><summary>車で行けますか?</summary><p>駐車場があります。</p></details>
        <details><summary>キャンセルしたい場合は?</summary><p>当日キャンセルは一律¥3,500です。2週間以内にご予約を変更いただく場合は、キャンセル料はかかりません。</p></details>
        <details><summary>妊娠中・授乳中・生理中でも蒸しは受けられますか?</summary><p>妊娠の可能性がある時期はお受けできません。授乳中はハーブなしの薬草蒸し、生理中はお控えください。妊活中の方は低温期に行います。</p></details>
      </div>
    </section>

    <section class="section section--alt" id="access">
      <div class="container access reveal">
        <div>
          <p class="eyebrow">ACCESS</p>
          <h2>アクセス・ご予約</h2>
          <dl>
            <dt>サロン名</dt><dd>琥珀(こはく)</dd>
            <dt>所在地</dt><dd>兵庫県姫路市大津区天神町2丁目176-10</dd>
            <dt>営業時間</dt><dd>10:00〜17:00(最終受付 15:00)</dd>
            <dt>営業日</dt><dd>不定休(予約サイトのカレンダーでご確認ください)</dd>
            <dt>その他</dt><dd>女性専用・完全予約制・駐車場あり</dd>
          </dl>
          <p><a href="https://www.google.com/maps/search/?api=1&amp;query=%E5%85%B5%E5%BA%AB%E7%9C%8C%E5%A7%AB%E8%B7%AF%E5%B8%82%E5%A4%A7%E6%B4%A5%E5%8C%BA%E5%A4%A9%E7%A5%9E%E7%94%BA2%E4%B8%81%E7%9B%AE176-10" target="_blank" rel="noopener">Googleマップで見る</a></p>
        </div>
        <div>
          <h3>ご予約・お問い合わせ</h3>
          <div class="cta-row">
            <a class="btn btn--primary" href="https://tol-app.jp/s/hgcmuzzsyrx2ji76o97n" target="_blank" rel="noopener">予約サイトから予約</a>
            <a class="btn btn--line" href="https://line.me/R/ti/p/@ncf2830x" target="_blank" rel="noopener">公式LINE</a>
            <a class="btn btn--ghost" href="https://ig.me/m/kohaku_salon.himeji" target="_blank" rel="noopener">InstagramのDM</a>
          </div>
          <p class="fine" style="margin-top:16px"><a href="https://www.instagram.com/kohaku_salon.himeji/" target="_blank" rel="noopener">Instagram @kohaku_salon.himeji</a> では日々の様子をお届けしています。</p>
        </div>
      </div>
    </section>
```

- [ ] **Step 2: `</main>` の直後(`</body>` の前)に footer・固定CTA・script を追加する**

```html
  <footer class="footer">
    <p>© 琥珀(こはく)</p>
  </footer>

  <div class="sticky-cta" aria-label="ご予約">
    <a class="btn btn--primary" href="https://tol-app.jp/s/hgcmuzzsyrx2ji76o97n" target="_blank" rel="noopener">ご予約</a>
    <a class="btn btn--line" href="https://line.me/R/ti/p/@ncf2830x" target="_blank" rel="noopener">LINE</a>
  </div>

  <script src="main.js"></script>
</body>
</html>
```

- [ ] **Step 3: 検査を実行して合格を確認する**

Run: `python tools/check_site.py`
Expected: `OK: すべての検査に合格`。失敗が出たら、項目名どおりに `index.html` を直す(検査側を緩めて通さない。ただし料金そのものが Task 1 の目視照合で変わった場合は両方を揃える)。

> `MUST_NOT_CONTAIN` に「アロマサロン琥珀」を入れているため、本文・メタ情報に旧表記が混ざっていれば検出される。

- [ ] **Step 4: Commit**

```bash
git add "自己紹介HP/アロマサロン琥珀/index.html"
git commit -m "琥珀サイト: メニュー・案内・FAQ・アクセスを追加"
```

---

### Task 6: ブラウザで実機確認する

**Files:**
- Modify: 見つかった不具合に応じて `SITE/styles.css` / `SITE/index.html`

- [ ] **Step 1: ローカルサーバーを起動する**

Run(バックグラウンド): `cd "自己紹介HP/アロマサロン琥珀" && python -m http.server 8765`

- [ ] **Step 2: スマホ幅(390px)で確認する**

claude-in-chrome で `http://localhost:8765/` を開き、`resize_window` で幅390にして、上から最後までスクロールしながらスクリーンショットを撮る。確認項目:
  - 横スクロールが出ていない(`javascript_tool` で `document.documentElement.scrollWidth <= window.innerWidth` を確認)
  - ヒーローを過ぎると下部の固定CTAが出て、最後のアクセス・フッターが隠れない
  - 料金表で金額が折り返さず、名称が長くても崩れない
  - 「メニュー」ボタンでナビが開閉する
  - `read_console_messages` にエラーがない

- [ ] **Step 3: 360px幅とPC幅(1280px)で確認する**

360px で Step 2 の最初の2項目を再確認。1280px でヒーローが2カラム、固定CTAが非表示、ヘッダーにナビと「ご予約」が出ることを確認する。

- [ ] **Step 4: JS無効相当の確認**

`javascript_tool` で `document.documentElement.classList.remove("js")` を実行し、全セクションの文章が表示され続けることを確認する(`.js` クラスがなければフェード用の非表示は効かない設計)。

- [ ] **Step 5: 不具合を直し、検査を再実行する**

Run: `python tools/check_site.py`  Expected: `OK`。直した内容があれば Commit:

```bash
git add "自己紹介HP/アロマサロン琥珀/styles.css" "自己紹介HP/アロマサロン琥珀/index.html"
git commit -m "琥珀サイト: 実機確認での表示崩れを修正"
```

- [ ] **Step 6: サーバーを止め、開いたタブを閉じる**

---

### Task 7: ドキュメントと公開前チェック

**Files:**
- Create: `SITE/CLAUDE.md`

- [ ] **Step 1: フォルダの CLAUDE.md を書く**

```markdown
# 琥珀(こはく)サイト

姫路の女性専用・完全予約制サロン「琥珀」の公開用ホームページ。ビルド不要の静的サイト。

## 構成
- `index.html` — 本文は静的HTML。`<head>` に JSON-LD(HealthAndBeautyBusiness)。住所・説明を変えたら JSON-LD も更新する
- `styles.css` / `main.js` — 見た目と補助動作(ナビ開閉・固定CTA・フェード)。JSなしでも全文が読める
- `images/` — `owner-steam.jpg`、`herbs.jpg`、`og-image.png`。`tools/prepare_images.py` で元画像から再生成できる
- `tools/check_site.py` — 料金・リンク・必須文言・alt・JSON-LD の検査。変更後は `python tools/check_site.py`

## ルール
- 料金は予約サイト(https://tol-app.jp/s/hgcmuzzsyrx2ji76o97n)を正とする。変更したら `check_site.py` の `PRICES` と `index.html` の両方を直す
- 屋号の表記は「琥珀(こはく)」。商標 ® を付ける語は仕様どおり
- 電話番号・口コミ・効能の断定は載せない。お客様の顔や背中が写る写真は、本人の掲載許可がない限り使わない
- 元画像(日本語ファイル名のスクリーンショット・メニュー画像)はこのフォルダに残す。削除・リネームは OneDrive 同期の事故を避けるため gitで行う
```

- [ ] **Step 2: 検査と最終確認**

Run: `python tools/check_site.py`  Expected: `OK`

- [ ] **Step 3: 公開前に、ユーザーへ次の4点を確認する(答えが出るまで push しない)**
  1. 店主・田代真弓さんが、サイト掲載と note 記事の内容の利用を了承しているか
  2. 1枚目の写真で施術を受けていた方の掲載許可(許可が出たら `prepare_images.py` に追加して再生成)
  3. 料金が税込か/ペア蒸しが2名分か(表記を足すか)
  4. 公開URL。GitHub Pages のパスが決まったら、`index.html` に `canonical`・`og:url`・`og:image`(絶対URL)を追加し、JSON-LD に `url` を足す

- [ ] **Step 4: Commit**

```bash
git add "自己紹介HP/アロマサロン琥珀/CLAUDE.md"
git commit -m "琥珀サイト: CLAUDE.md を追加"
```

- [ ] **Step 5: push はユーザーの許可を得てから**

許可が出たら `git push` し、公開後に Pages のビルド状況と公開URLの表示を確認する。
