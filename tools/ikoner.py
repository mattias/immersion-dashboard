# /// script
# requires-python = ">=3.12"
# dependencies = ["pillow==11.3.0"]
# ///
# Draws the app icons: gold magic circle and the character 旅 on the night blue. Run: uv run tools/ikoner.py
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

UT = Path(__file__).resolve().parent.parent / "icons"
FONT = "C:/Windows/Fonts/yumindb.ttf"
GULD = (220, 192, 138)


def rita(storlek, skala):
    s = storlek * 4
    bild = Image.new("RGB", (s, s), (11, 16, 32))
    d = ImageDraw.Draw(bild)
    for y in range(s):
        t = y / s
        d.line([(0, y), (s, y)], fill=(int(11 + 16 * t), int(16 + 21 * t), int(34 + 46 * t)))
    c, r = s / 2, s / 2 * skala
    lager = Image.new("RGBA", (s, s))
    l = ImageDraw.Draw(lager)
    w = max(2, s // 160)
    for f in (1, 0.9, 0.7):
        l.ellipse([c - r * f, c - r * f, c + r * f, c + r * f], outline=GULD + (200,), width=w)
    for v in (-90, 90):
        p = [(c + r * 0.9 * math.cos(math.radians(v + i * 120)), c + r * 0.9 * math.sin(math.radians(v + i * 120))) for i in range(3)]
        l.polygon(p, outline=GULD + (110,), width=w)
    font = ImageFont.truetype(FONT, int(r * 0.95))
    l.text((c, c + r * 0.02), "旅", font=font, fill=(240, 236, 226, 255), anchor="mm")
    glod = lager.filter(ImageFilter.GaussianBlur(s / 60))
    bild.paste(glod, (0, 0), glod)
    bild.paste(lager, (0, 0), lager)
    return bild.resize((storlek, storlek), Image.LANCZOS)


UT.mkdir(exist_ok=True)
rita(192, 0.86).save(UT / "icon-192.png")
rita(512, 0.86).save(UT / "icon-512.png")
rita(512, 0.66).save(UT / "maskable-512.png")
rita(180, 0.8).save(UT / "apple-touch-icon.png")
print("ok")
