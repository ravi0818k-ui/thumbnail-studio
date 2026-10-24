"""Draws public/og-image.png, the 1200x630 card shown when the site is shared.

Run with `python scripts/og-image.py` after changing the logo or the copy. Uses
Windows system fonts; on another OS point FONT_DIR at any bold sans.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = Path("C:/Windows/Fonts")
W, H = 1200, 630


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / name), size)


img = Image.new("RGB", (W, H), "#0a0c10")

# Two soft colour washes taken from the logo, so the card reads as the brand.
glow = Image.new("RGB", (W, H), "#0a0c10")
g = ImageDraw.Draw(glow)
g.ellipse((760, -160, 1360, 440), fill="#5b2a8a")
g.ellipse((820, 260, 1380, 820), fill="#8a1f2a")
img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(160)), 0.85)

logo = Image.open(ROOT / "public/logo.png").convert("RGBA").resize((340, 340), Image.LANCZOS)
img.paste(logo, (800, 145), logo)

d = ImageDraw.Draw(img)
x = 72
d.text((x, 70), "THUMBNAIL STUDIO", font=font("segoeuib.ttf", 28), fill="#ffb02e")
d.text((x, 118), "Free YouTube", font=font("seguibl.ttf", 82), fill="#ffffff")
d.text((x, 208), "Thumbnail Maker", font=font("seguibl.ttf", 82), fill="#ffffff")
d.text(
    (x, 322),
    "The free Canva alternative for thumbnails,\nShorts covers and channel banners.",
    font=font("segoeuib.ttf", 32),
    fill="#c9ced8",
    spacing=10,
)

# Feature chips.
cx = x
for label in ("No sign-up", "AI background remover", "Runs in your browser"):
    f = font("segoeuib.ttf", 24)
    w = d.textlength(label, font=f)
    d.rounded_rectangle((cx, 448, cx + w + 36, 496), radius=24, fill="#1b1f29", outline="#2c3240", width=2)
    d.text((cx + 18, 455), label, font=f, fill="#ffffff")
    cx += w + 52

d.text((x, 546), "youtubethumbnail.org", font=font("segoeuib.ttf", 28), fill="#8b93a3")

img.save(ROOT / "public/og-image.png", optimize=True)
print("wrote public/og-image.png")
