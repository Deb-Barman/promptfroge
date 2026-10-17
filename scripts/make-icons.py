"""Renders the Prompt Forge brand mark (same geometry as the in-app SVG) to the PWA icon set in public/icons."""
from PIL import Image, ImageDraw
import os

S = 1024                                   # supersampled canvas; geometry is in the SVG's 32-unit space
k = S / 32
AMBER, BLUE, BG = (232, 176, 75, 255), (106, 169, 255, 255), (26, 30, 37, 255)

def mark(scale=1.0, rounded=True):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(7 * k), fill=BG)
        d.rounded_rectangle([int(.9 * k), int(.9 * k), S - int(.9 * k), S - int(.9 * k)], radius=int(6.3 * k), outline=(255, 255, 255, 18), width=int(.35 * k))
    else:
        d.rectangle([0, 0, S, S], fill=BG)            # full-bleed for maskable icons
    # glyph is drawn around the centre (16,16) and scaled
    def P(x, y): return ((16 + (x - 16) * scale) * k, (16 + (y - 16) * scale) * k)
    w = int(2.6 * k * scale)
    def seg(a, b):
        A, B = P(*a), P(*b)
        d.line([A, B], fill=AMBER, width=w)
        for p in (A, B): d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=AMBER)
    seg((8, 22), (14, 10)); seg((14, 10), (20, 22)); seg((10.5, 17), (17.5, 17))
    c = P(24, 9); r = 2.3 * k * scale
    d.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], fill=BLUE)
    return img

os.makedirs("public/icons", exist_ok=True)
base = mark()
for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png"), (32, "favicon-32.png")]:
    base.resize((size, size), Image.LANCZOS).save(f"public/icons/{name}")
# Maskable: OS crops to a circle/squircle, so keep the glyph inside the central 80% safe zone.
mark(scale=0.72, rounded=False).resize((512, 512), Image.LANCZOS).save("public/icons/maskable-512.png")
print("icons written")
