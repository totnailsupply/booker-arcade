"""Agent A preview: art/levels/preview-A.png
Booker 18-frame sheet at 6x (two rows of 9), every small final asset at 4x on mid-gray,
thumbnails and menu-bg, 2x1 seam checks of every background layer (1x), and a mock
480x270 scene for L2 and L3 at 2x (backgrounds + ground + pit + platform + hazards + gliding Booker).
Run from booker-run:  python3 art/levels/scripts/make_preview_A.py
"""
import os
import sys
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixlib import OUT, LV, zoom

GRAY = (128, 128, 128, 255)
W, H, GY = 480, 270, 238


def load(k):
    return Image.open(os.path.join(OUT, k + ".png")).convert("RGBA")


def bfr(i):
    return load("booker").crop((i * 48, 0, (i + 1) * 48, 36))


def put(sc, im, x, y_bottom):
    sc.alpha_composite(im, (x, y_bottom - im.height))


def base(lv, pit=(256, 320)):
    sc = load(f"l{lv}-bg-far")
    sc.alpha_composite(load(f"l{lv}-bg-mid"))
    sc.alpha_composite(load(f"l{lv}-bg-near"))
    g, p = load(f"l{lv}-ground"), load(f"l{lv}-pit")
    for x in range(0, W, 32):
        sc.alpha_composite(p if pit[0] <= x < pit[1] else g, (x, GY))
    return sc


def scene2():
    sc = base(2)
    pf = load("l2-platform")
    for x in range(240, 336, 32):
        sc.alpha_composite(pf, (x, 168))
    put(sc, load("l2-bollard"), 120, GY)
    put(sc, load("l2-tires"), 180, GY)
    put(sc, load("l2-crab"), 380, GY)
    put(sc, load("l2-crab"), 300, 168)
    put(sc, bfr(0), 40, GY)
    put(sc, bfr(10), 196, 150)
    put(sc, bfr(12), 330, 120)
    return sc


def scene3():
    sc = base(3)
    pf = load("l3-platform")
    for x in range(240, 336, 32):
        sc.alpha_composite(pf, (x, 168))
    put(sc, load("l3-acunit"), 110, GY)
    put(sc, load("l3-antenna"), 170, GY)
    put(sc, load("l3-vent"), 400, GY)
    pg = load("l3-pigeon")
    put(sc, pg.crop((0, 0, 16, 12)), 360, 110)
    put(sc, pg.crop((16, 0, 32, 12)), 400, 96)
    put(sc, bfr(0), 40, GY)
    put(sc, bfr(13), 270, 130)
    return sc


def seam(k):
    im = load(k)
    s = Image.new("RGBA", (W * 2, H), GRAY)
    s.alpha_composite(im, (0, 0)); s.alpha_composite(im, (W, 0))
    return s


def main():
    pad = 16
    blocks = []  # (image, label)
    b = load("booker")
    r1 = Image.new("RGBA", (48 * 9, 36)); r1.alpha_composite(b.crop((0, 0, 48 * 9, 36)))
    r2 = Image.new("RGBA", (48 * 9, 36)); r2.alpha_composite(b.crop((48 * 9, 0, 48 * 18, 36)))
    blocks.append([zoom(r1, 6)])
    blocks.append([zoom(r2, 6)])
    blocks.append([zoom(load("ui-icons"), 4)])
    small2 = ["l2-ground", "l2-pit", "l2-platform", "l2-bollard", "l2-tires", "l2-crab"]
    small3 = ["l3-ground", "l3-pit", "l3-platform", "l3-acunit", "l3-antenna", "l3-pigeon", "l3-vent"]
    blocks.append([zoom(load(k), 4) for k in small2])
    blocks.append([zoom(load(k), 4) for k in small3])
    # tiling checks for tiles: 3x2 ground/pit, 3x1 platform, at 4x
    tiles = []
    for k, nx, ny in [("l2-ground", 3, 1), ("l2-pit", 3, 2), ("l2-platform", 3, 1),
                      ("l3-ground", 3, 1), ("l3-pit", 3, 2), ("l3-platform", 3, 1)]:
        t = load(k); c = Image.new("RGBA", (t.width * nx, t.height * ny))
        for i in range(nx):
            for j in range(ny):
                c.alpha_composite(t, (i * t.width, j * t.height))
        tiles.append(zoom(c, 4))
    blocks.append(tiles)
    thumbs = [zoom(load(f"thumb-l{n}"), 2) for n in (1, 2, 3) if os.path.exists(os.path.join(OUT, f"thumb-l{n}.png"))]
    blocks.append(thumbs)
    blocks.append([zoom(scene2(), 2)])
    blocks.append([zoom(scene3(), 2)])
    blocks.append([zoom(load("menu-bg"), 2)])
    for lv in (2, 3):
        blocks.append([seam(f"l{lv}-bg-{k}") for k in ("far", "mid")])
        blocks.append([seam(f"l{lv}-bg-near")])
    cw = max(sum(i.width + pad for i in row) + pad for row in blocks)
    ch = sum(max(i.height for i in row) + pad for row in blocks) + pad
    cv = Image.new("RGBA", (cw, ch), GRAY)
    y = pad
    for row in blocks:
        x = pad
        for im in row:
            cv.alpha_composite(im, (x, y))
            x += im.width + pad
        y += max(i.height for i in row) + pad
    cv.convert("RGB").save(os.path.join(LV, "preview-A.png"))
    scene2().save(os.path.join(LV, "drafts", "_scene_l2.png"))
    scene3().save(os.path.join(LV, "drafts", "_scene_l3.png"))
    print("preview-A", cv.size)


if __name__ == "__main__":
    main()
