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
