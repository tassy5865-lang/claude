"""images/65161〜65167・65170.jpg(店主が撮影した元写真)から、掲載用の画像を作る。要Pillow。
元写真は消さずに残し、salon-*.jpg を別名で書き出す。
使い方: python tools/prepare_photos.py
"""
from pathlib import Path
from PIL import Image, ImageOps

IMG = Path(__file__).resolve().parent.parent / "images"

# (元ファイル, 出力名, 切り抜き(left, top, right, bottom) または None, 最大の長辺)
JOBS = [
    ("65161.jpg", "salon-hero.jpg", None, 1100),                 # 枝越しの施術室(ヒーロー)
    ("65163.jpg", "salon-curtain.jpg", None, 900),               # カーテン越しの施術室
    ("65162.jpg", "salon-clock.jpg", None, 900),                 # 古時計とドライフラワー
    ("65167.jpg", "salon-houses.jpg", None, 1000),               # 置物とリース
    ("65166.jpg", "salon-exterior.jpg", None, 1100),             # 外観
    ("65165.jpg", "salon-herbs-hands.jpg", None, 900),           # 手のひらのハーブ
    ("65170.jpg", "salon-herb-plate.jpg", (0, 0, 1100, 960), 900),  # ハーブとバラの花びら(明るい左側)
]

for src, out, box, longest in JOBS:
    im = ImageOps.exif_transpose(Image.open(IMG / src)).convert("RGB")
    if box:
        im = im.crop(box)
    im.thumbnail((longest, longest), Image.LANCZOS)
    im.save(IMG / out, "JPEG", quality=82, optimize=True, progressive=True)
    print(f"{out}: {im.size[0]}x{im.size[1]}")


# ロゴ: 白背景の S__25346129.jpg を、余白を切り詰めた透過PNGにする(通常 #C88A42 / 暗い背景用 #FFFDFC)
src_img = Image.open(IMG / "S__25346129.jpg").convert("RGB")
logo = src_img.convert("L")
bbox = ImageOps.invert(logo).point(lambda v: 255 if v > 24 else 0).getbbox()
pad = 12
box = (max(bbox[0] - pad, 0), max(bbox[1] - pad, 0), min(bbox[2] + pad, logo.width), min(bbox[3] + pad, logo.height))
alpha = ImageOps.invert(logo.crop(box)).point(lambda v: min(255, int(v * 2.2)))
COLORS = {"": (200, 138, 66), "-light": (255, 253, 252)}
for suffix, rgb in COLORS.items():
    flat = Image.new("RGB", alpha.size, rgb)
    full = Image.merge("RGBA", (*flat.split(), alpha))
    mark = full.copy()
    mark.thumbnail((520, 520), Image.LANCZOS)
    mark.save(IMG / f"logo{suffix}.png", optimize=True)
    print(f"logo{suffix}.png: {mark.size[0]}x{mark.size[1]}")
    # ロゴマーク単体(しずく部分)を正方形に
    w, h = full.size
    drop = full.crop((0, 0, int(w * 0.355), h))
    side = max(drop.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(drop, ((side - drop.width) // 2, (side - drop.height) // 2))
    canvas.thumbnail((192, 192), Image.LANCZOS)
    canvas.save(IMG / f"logo-mark{suffix}.png", optimize=True)
    if not suffix:
        canvas.save(IMG / "favicon.png", optimize=True)
