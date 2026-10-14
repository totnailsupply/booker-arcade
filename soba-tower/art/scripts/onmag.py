# usage: python3 onmag.py out.png in1.png [in2.png ...]  -> side-by-side on magenta, plus alpha extrema
import sys
from PIL import Image
ims=[Image.open(p).convert("RGBA") for p in sys.argv[2:]]
for p,im in zip(sys.argv[2:],ims): print(p, im.size, im.getchannel("A").getextrema())
W=sum(i.width for i in ims); H=max(i.height for i in ims)
bg=Image.new("RGBA",(W,H),(255,0,255,255)); x=0
for i in ims: bg.alpha_composite(i,(x,0)); x+=i.width
bg.thumbnail((1600,1600)); bg.save(sys.argv[1])
