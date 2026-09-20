# -*- coding: utf-8 -*-
"""Generate the 1200x630 OGP card (assets/social-card.png) for the AI consulting LP.

Usage: python build-og-card.py social-card.png
Colors mirror styles.css (--bg / --accent-violet / --accent-cyan).
"""
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
FDIR = r"C:\Windows\Fonts"

BG = (13, 14, 26)
VIOLET = (108, 100, 235)
CYAN = (107, 204, 230)


def font(name, size):
    return ImageFont.truetype(FDIR + "\\" + name, size)


GOTH_B = lambda s: font("YuGothB.ttc", s)
GOTH_M = lambda s: font("YuGothM.ttc", s)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


img = Image.new("RGB", (W, H), BG)
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
g = ImageDraw.Draw(glow)
g.ellipse([-260, -300, 620, 500], fill=VIOLET + (70,))
g.ellipse([700, 260, 1500, 940], fill=CYAN + (55,))
# soften the glows so they read as light, not shapes
from PIL import ImageFilter
glow = glow.filter(ImageFilter.GaussianBlur(120))
img = Image.alpha_composite(img.convert("RGBA"), glow)

d = ImageDraw.Draw(img, "RGBA")
x0 = 92

# eyebrow (letter-spaced)
cx = x0
for ch in "AI CONSULTING":
    d.text((cx, 96), ch, font=GOTH_M(24), fill=CYAN + (255,))
    cx += d.textlength(ch, font=GOTH_M(24)) + 6

# headline: white line + gradient line
d.text((x0, 172), "AIを「使える武器」に、", font=GOTH_B(78), fill=(244, 244, 248, 255))

line2 = "変える伴走者。"
f2 = GOTH_B(96)
bbox = d.textbbox((0, 0), line2, font=f2)
tw, th = bbox[2] - bbox[0] + 10, bbox[3] - bbox[1] + 20
mask = Image.new("L", (tw, th), 0)
ImageDraw.Draw(mask).text((0, 0), line2, font=f2, fill=255)
grad = Image.new("RGBA", (tw, th))
gp = grad.load()
for x in range(tw):
    c = lerp(VIOLET, CYAN, x / max(tw - 1, 1))
    for y in range(th):
        gp[x, y] = c + (255,)
img.paste(grad, (x0, 286 - bbox[1] + 10), mask)

# sub
d.text((x0, 470), "業務自動化ツール開発 × AI活用の伴走支援", font=GOTH_B(32), fill=(244, 244, 248, 215))
d.text((x0, 522), "田代 裕貴", font=GOTH_M(26), fill=(169, 172, 196, 255))

# accent rule
for i in range(132):
    d.line([(x0 + i, 584), (x0 + i, 588)], fill=lerp(VIOLET, CYAN, i / 131) + (255,))

img.convert("RGB").save(sys.argv[1], "PNG", optimize=True)
print("saved", sys.argv[1])
