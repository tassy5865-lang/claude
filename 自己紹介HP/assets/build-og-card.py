# -*- coding: utf-8 -*-
"""Generate a 1200x630 OGP card PNG for the profile site."""
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
FDIR = r"C:\Windows\Fonts"

def font(name, size, index=0):
    return ImageFont.truetype(FDIR + "\\" + name, size, index=index)

MINCHO = lambda s: font("BIZ-UDMinchoM.ttc", s)
GOTH_B = lambda s: font("YuGothB.ttc", s)
GOTH_M = lambda s: font("YuGothM.ttc", s)
GEO_B  = lambda s: font("georgiab.ttf", s)

# background: diagonal gradient
top, bot = (16, 24, 38), (30, 58, 95)
bg = Image.new("RGB", (W, H))
px = bg.load()
for y in range(H):
    for x in range(W):
        t = x / W * 0.35 + y / H * 0.65
        px[x, y] = (
            int(top[0] + (bot[0] - top[0]) * t),
            int(top[1] + (bot[1] - top[1]) * t),
            int(top[2] + (bot[2] - top[2]) * t),
        )

d = ImageDraw.Draw(bg, "RGBA")

# decorative circles
d.ellipse([740, -220, 1340, 380], fill=(74, 144, 217, 36))
d.ellipse([910, 350, 1330, 770], fill=(255, 255, 255, 10))

# TY ring mark
cx, cy, r = 995, 312, 150
d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, 48), width=2)
d.text((cx, cy - 4), "TY", font=GEO_B(150), fill=(255, 255, 255, 235), anchor="mm")
d.text((cx, cy + 96), "AI \u00d7 CLINICAL", font=GOTH_M(18), fill=(255, 255, 255, 150), anchor="mm")

x0 = 92

# eyebrow with letter-spacing
cxp = x0
for ch in "AI \u00d7 CLINICAL WORKFLOW":
    d.text((cxp, 104), ch, font=GOTH_M(24), fill=(132, 185, 238, 255))
    cxp += d.textlength(ch, font=GOTH_M(24)) + 5

# headline
d.text((x0, 188), "\u73fe\u5834\u306e\u8ab2\u984c\u3092\u3001", font=MINCHO(82), fill=(255, 255, 255, 255))
d.text((x0, 298), "AI\u3067\u5f62\u306b\u3059\u308b\u3002", font=MINCHO(96), fill=(132, 185, 238, 255))

# sub
d.text((x0, 470),
       "\u7530\u4ee3 \u88d5\u8cb4\uff5c\u81e8\u5e8a\u5de5\u5b66\u6280\u58eb / AI\u6d3b\u7528\u30fb\u696d\u52d9\u6539\u5584",
       font=GOTH_B(30), fill=(255, 255, 255, 212))

# accent rule
d.rectangle([x0, 548, x0 + 132, 552], fill=(74, 144, 217, 255))

bg.save(sys.argv[1], "PNG", optimize=True)
print("saved", sys.argv[1])
