# usage: python3 ongrey.py out.png in.png [max_side]  -> composite on mid-grey (Read draws alpha as black)
import sys
from PIL import Image
im = Image.open(sys.argv[2]).convert("RGBA")
print(sys.argv[2], im.size, im.getchannel("A").getextrema())
bg = Image.new("RGBA", im.size, (110, 110, 120, 255)); bg.alpha_composite(im)
m = int(sys.argv[3]) if len(sys.argv) > 3 else 1400
bg.thumbnail((m, m)); bg.convert("RGB").save(sys.argv[1])
