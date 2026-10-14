# usage: python3 viewlayers.py out.png far.png mid.png near.png  -> 2x2: far | mid on magenta / near on magenta | composite
import sys
from PIL import Image
out, far, mid, near = sys.argv[1:5]
W, H = 768, 432
f = Image.open(far).convert("RGBA").resize((W, H), Image.LANCZOS)
m = Image.open(mid).convert("RGBA").resize((W, H), Image.LANCZOS)
n = Image.open(near).convert("RGBA").resize((W, H), Image.LANCZOS)
for p, im in [(far, f), (mid, m), (near, n)]:
    print(p, Image.open(p).size, Image.open(p).mode, im.getchannel("A").getextrema())
mag = lambda im: Image.alpha_composite(Image.new("RGBA", im.size, (255, 0, 255, 255)), im)
comp = f.copy(); comp.alpha_composite(m); comp.alpha_composite(n)
cv = Image.new("RGBA", (W * 2 + 8, H * 2 + 8), (40, 40, 40, 255))
cv.paste(f, (0, 0)); cv.paste(mag(m), (W + 8, 0)); cv.paste(mag(n), (0, H + 8)); cv.paste(comp, (W + 8, H + 8))
cv.convert("RGB").save(out)
