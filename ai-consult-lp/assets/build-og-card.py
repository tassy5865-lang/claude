# -*- coding: utf-8 -*-
"""Generate the 1200x630 OGP card (assets/social-card.png) for the Nexsist LP.

Usage: python build-og-card.py social-card.png
Colors mirror styles.css (--bg / --violet / --cyan). Needs Pillow and Windows fonts
(Yu Gothic for Japanese, Arial Black for the outlined display words).
"""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1200, 630
FDIR = r"C:\Windows\Fonts"

BG = (6, 6, 26)
VIOLET = (123, 92, 255)
VIOLET_SOFT = (180, 155, 255)
CYAN = (34, 211, 238)
TEXT = (236, 236, 255)


def font(name, size):
    return ImageFont.truetype(FDIR + "\\" + name, size)


GOTH_B = lambda s: font("YuGothB.ttc", s)
GOTH_M = lambda s: font("YuGothM.ttc", s)
BLACK = lambda s: font("ariblk.ttf", s)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_text(img, xy, text, f, c1, c2):
    d = ImageDraw.Draw(img)
    bbox = d.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] + 4, bbox[3] + 4
    mask = Image.new("L", (tw, th), 0)
    ImageDraw.Draw(mask).text((0, 0), text, font=f, fill=255)
    grad = Image.new("RGBA", (tw, th))
    gp = grad.load()
    for x in range(tw):
        c = lerp(c1, c2, x / max(tw - 1, 1))
        for y in range(th):
            gp[x, y] = c + (255,)
    img.paste(grad, xy, mask)


img = Image.new("RGBA", (W, H), BG + (255,))

# light orbs
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
g = ImageDraw.Draw(glow)
g.ellipse([720, -320, 1460, 420], fill=VIOLET + (150,))
g.ellipse([-160, 380, 520, 980], fill=CYAN + (90,))
glow = glow.filter(ImageFilter.GaussianBlur(110))
img = Image.alpha_composite(img, glow)

d = ImageDraw.Draw(img, "RGBA")

# decorative outlined display words on the right (fill = bg, stroke drawn under)
fx = BLACK(108)
gx, gy = 752, 92
for i, word in enumerate(["WEB.", "LINE."]):
    d.text((gx, gy + i * 128), word, font=fx, fill=BG + (255,), stroke_width=3, stroke_fill=(255, 255, 255, 120))
gradient_text(img, (gx, gy + 2 * 128), "AI.", fx, VIOLET_SOFT, CYAN)
d = ImageDraw.Draw(img, "RGBA")

x0 = 84

# brand + eyebrow
cx = x0
for ch in "NEXSIST":
    d.text((cx, 70), ch, font=BLACK(26), fill=TEXT + (255,))
    cx += d.textlength(ch, font=BLACK(26)) + 8
cx = x0
for ch in "WEB × LINE × AI":
    d.text((cx, 150), ch, font=GOTH_M(22), fill=CYAN + (255,))
    cx += d.textlength(ch, font=GOTH_M(22)) + 4

# headline
d.text((x0, 200), "お店の集客と予約を、", font=GOTH_B(58), fill=TEXT + (255,))
gradient_text(img, (x0, 282), "まるごと仕組みに。", GOTH_B(64), VIOLET_SOFT, CYAN)
d = ImageDraw.Draw(img, "RGBA")

# sub + signature
d.text((x0, 420), "HP・予約・LINE／Lステップ・Threads・AIツール", font=GOTH_B(24), fill=TEXT + (220,))
d.text((x0, 470), "設計から運用まで、ひとりの担当者がつなげて作ります", font=GOTH_M(22), fill=(190, 190, 220, 255))

for i in range(132):
    d.line([(x0 + i, 540), (x0 + i, 544)], fill=lerp(VIOLET, CYAN, i / 131) + (255,))
d.text((x0, 556), "Nexsist ／ 田代 裕貴", font=GOTH_M(22), fill=(170, 172, 200, 255))

img.convert("RGB").save(sys.argv[1], "PNG", optimize=True)
print("saved", sys.argv[1])
