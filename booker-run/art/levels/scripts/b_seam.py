"""Zoomed seam check: python3 b_seam.py out.png key1 key2 ... (public/assets keys)"""
import sys
from b_lib import *
out = sys.argv[1]; keys = sys.argv[2:]
rows = []
for k in keys:
    im = Image.open(os.path.join(OUT, k + ".png")).convert("RGBA")
    t = tile(im, 2, 1)
    w = min(100, im.width // 2)
    c = on_bg(t.crop((im.width - w, 0, im.width + w, im.height)))
    rows.append(zoom(c, 3 if im.width > 100 else 8))
cv = Image.new("RGBA", (sum(r.width + 10 for r in rows), max(r.height for r in rows)), (255, 0, 255, 255))
x = 0
for r in rows:
    cv.alpha_composite(r, (x, 0)); x += r.width + 10
cv.save(out)
