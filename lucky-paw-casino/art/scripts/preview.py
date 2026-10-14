import sys
from PIL import Image
for f in sys.argv[1:]:
    im = Image.open(f).convert("RGBA")
    print(f, im.size, "alpha", im.getchannel("A").getextrema())
    bg = Image.new("RGBA", im.size, (255, 0, 255, 255)); bg.alpha_composite(im)
    bg.convert("RGB").save(f.rsplit(".", 1)[0] + "_mag.png")
