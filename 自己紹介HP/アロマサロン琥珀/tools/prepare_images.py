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
herbs = menu.crop((655, 574, 1000, 672))
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
photo.thumbnail((470, 500))
card.paste(photo, (1200 - photo.width - 42, (630 - photo.height) // 2))
d = ImageDraw.Draw(card)
d.text((70, 170), "琥珀", font=font(150), fill="#4A3B33")
d.text((74, 340), "こはく  姫路のプライベートサロン", font=font(32), fill="#B97F76")
d.text((74, 410), "脳の休息と巡りを変えるサロン", font=font(40), fill="#4A3B33")
d.text((74, 480), "女性専用・完全予約制", font=font(30), fill="#8A9A7B")
card.save(OUT / "og-image.png", optimize=True)
print("生成:", [p.name for p in sorted(OUT.iterdir())])
