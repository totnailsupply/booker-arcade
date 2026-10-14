#!/usr/bin/env python3
"""Make level-select thumbnails (128x72) from each level's own art. No image-gen cost.

Usage (from anywhere):
  python3 art/scripts/make_thumb.py 1 2 3        # writes public/assets/thumb-l1.png ... and merges manifest
  python3 art/scripts/make_thumb.py 4 --no-manifest

Composite = far + mid + near background layers + a strip of ground tiles from WORLD.GROUND_Y (238),
then a premultiplied BOX downscale 480x270 -> 128x72 and a snap to the scene's own 32 colours
(no dither) so the thumbnail stays crisp pixel art. Level 1 uses the unprefixed keys
(bg-far, bg-mid, bg-near, ground); level N >= 2 uses lN-bg-far, lN-bg-mid, lN-bg-near, lN-ground.
"""
import json
import os
import subprocess
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "assets")
W, H, GROUND_Y = 480, 270, 238
TW, TH = 128, 72


def keys(n):
    p = "" if n == 1 else f"l{n}-"
    return [f"{p}bg-far", f"{p}bg-mid", f"{p}bg-near"], f"{p}ground"


def scene(n):
    layers, ground = keys(n)
    sc = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    for k in layers:
        im = Image.open(os.path.join(OUT, k + ".png")).convert("RGBA")
        sc.alpha_composite(im)
    g = Image.open(os.path.join(OUT, ground + ".png")).convert("RGBA")
    for x in range(0, W, g.width):
        for y in range(GROUND_Y, H, g.height):
            sc.alpha_composite(g, (x, y))
    return sc


def thumb(n):
    sc = scene(n).convert("RGB")
    small = sc.resize((TW, TH), Image.BOX)
    pal = sc.quantize(32, method=Image.Quantize.MEDIANCUT, kmeans=2)
    return small.quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        sys.exit(2)
    frag = {}
    for a in args:
        n = int(a)
        t = thumb(n)
        name = f"thumb-l{n}"
        t.save(os.path.join(OUT, name + ".png"), optimize=True)
        frag[name] = {"file": name + ".png", "width": TW, "height": TH}
        print(name, t.size)
    if "--no-manifest" not in sys.argv:
        subprocess.run([sys.executable, os.path.join(HERE, "merge_manifest.py"), json.dumps(frag)], check=True)


if __name__ == "__main__":
    main()
