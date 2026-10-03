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
ROWS = [
    ("よもぎ蒸し 30分", "¥3,500"),
    ("温活よもぎコース 30分", "¥4,400"),
    ("よもぎペア蒸し 30分", "¥6,000"),
    ("ペア蒸し × フットまたは頭ほぐし", "¥12,000"),
    ("よもぎ蒸し 30分 × アロマトリートメントまたは頭ほぐし 30分", "¥6,300"),
    ("よもぎ蒸し × 頭ほぐし 45分", "¥7,800"),
    ("よもぎ蒸し × 背面 30分", "¥8,500"),
    ("よもぎ蒸し 30分 × アロマトリートメント 60分", "¥9,800"),
    ("よもぎ蒸し × 背面 30分 × 選べるアロマ 30分", "¥11,500"),
    ("背面コース 30分", "¥5,500"),
    ("アロマトリートメント 40分", "¥4,000"),
    ("アロマトリートメント 60分", "¥6,800"),
    ("アロマトリートメント 80分", "¥9,000"),
    ("頭ほぐし 30分", "¥3,300"),
    ("頭ほぐし 45分", "¥4,800"),
    ("お誕生日クーポン(お誕生日の月のみ)", "¥8,000"),
]
MUST_CONTAIN_MORE = [
    "100分", "当日キャンセル", "2週間以内", "妊娠の可能性がある時期", "妊活中", "授乳中",
    "生理中", "お誕生日の月のみ", "予約サイトのカレンダー",
]
FORBIDDEN_RE = [
    (r"0\d{1,4}[-ー−]\d{1,4}[-ー−]\d{3,4}", "電話番号らしき数字"),
    (r"(改善|デトックス|効果|効能|お客様の声|★|☆|おやすみ処|でありたいと考えています|頑張りすぎるあなた)", "効能・口コミ・出典のない語"),
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
    for s_ in MUST_CONTAIN_MORE:
        if squashed(s_) not in text:
            errors.append(f"本文にありません: {s_}")
    for pat, label in FORBIDDEN_RE:
        m = re.search(pat, raw)
        if m:
            errors.append(f"{label}: {m.group(0)}")
    rows = [(re.sub(r"\s+", " ", n).strip(), y.strip()) for n, y in
            re.findall(r'<span class="name">(.*?)</span><span class="yen">(.*?)</span>', raw)]
    if sorted(rows) != sorted(ROWS):
        errors.append(f"料金表の行が仕様と違います(行数 {len(rows)} / 期待 {len(ROWS)})")
    ids = re.findall(r'id="([^"]+)"', raw)
    for dup in {i for i in ids if ids.count(i) > 1}:
        errors.append(f"idが重複: {dup}")
    for ref in re.findall(r'aria-controls="([^"]+)"', raw):
        if ref not in ids:
            errors.append(f"aria-controls の参照先がありません: {ref}")
    heads = [int(x) for x in re.findall(r"<h([1-6])", raw)]
    for a, b in zip(heads, heads[1:]):
        if b > a + 1:
            errors.append(f"見出し階層が飛んでいます: h{a} → h{b}")
    if re.search(r"<(title|meta)[^>]*>[^<]*&(?!amp;|#)", raw) or re.search(r"<title>[^<]*&(?!amp;|#)", raw):
        errors.append("title / meta の & が &amp; になっていません")
    if 'class="nav-toggle"' in raw and "role=" not in raw.split('class="sticky-cta"')[-1][:80]:
        errors.append("固定CTAに role がありません")
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    js = (ROOT / "main.js").read_text(encoding="utf-8")
    for needle, why in [
        (".js .nav-toggle", "JSなしでは「メニュー」ボタンを出さない"),
        (".js .nav {", "JSなしではナビを常時表示する(JS有効時だけ折りたたむ)"),
        ("visibility: hidden", "隠れた固定CTAにキーボードフォーカスが入らないようにする"),
        ("@media print", "印刷時に本文が消えないようにする"),
    ]:
        if needle not in css:
            errors.append(f"styles.css: {why}")
    if "threshold: 0.12" in js:
        errors.append("main.js: 背の高い要素が表示されない恐れ(threshold を 0 に)")
    for color in ("#8a9a7b", "#c08a3e"):
        for m in re.finditer(r"([^{}]+)\{([^}]*)\}", css):
            sel, body = m.group(1).strip(), m.group(2)
            if re.search(r"(^|;|\s)color:\s*(var\(--sage\)|var\(--amber\)|%s)" % color, body):
                errors.append(f"styles.css: 文字色に低コントラストの色: {sel}")
    if "--publish" in sys.argv:
        for needle in ('rel="canonical"', 'property="og:url"', 'property="og:image"', '"url"'):
            if needle not in raw:
                errors.append(f"公開前に必要: {needle}")
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
