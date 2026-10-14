# usage: python3 viewtiles.py out.png ground.png pit.png sprites.png
import sys
from PIL import Image
out, g, p, s = sys.argv[1:5]
a = Image.open(g).convert("RGBA").resize((400, 400))
b = Image.open(p).convert("RGBA").resize((400, 400))
c = Image.open(s).convert("RGBA"); print(s, c.getchannel("A").getextrema())
c = Image.alpha_composite(Image.new("RGBA", c.size, (255, 0, 255, 255)), c).resize((600, 400))
cv = Image.new("RGBA", (1420, 400), (40, 40, 40, 255)); cv.paste(a, (0, 0)); cv.paste(b, (410, 0)); cv.paste(c, (820, 0))
cv.convert("RGB").save(out)
