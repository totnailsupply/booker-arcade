"""Agent B preview: art/levels/preview-B.png
Every final asset at 4x on mid-gray, plus a mock 480x270 scene per level at 2x.
Run: python3 art/levels/scripts/b_preview.py [levels...]   (default 4 5 6, skips missing)
Also writes art/levels/drafts/b-lN-scene.png (1x mock) per level.
"""
import sys
from b_lib import *

GRAY = (128, 128, 128, 255)
GY = 238  # WORLD.GROUND_Y


def load(k):
    p = os.path.join(OUT, k + ".png")
    return Image.open(p).convert("RGBA") if os.path.exists(p) else None


def frame(sheet, i, fw, fh):
    return sheet.crop((i * fw, 0, (i + 1) * fw, fh))


def booker(i=0):
    b = load("booker")
    return frame(b, i, 48, 36)


def base_scene(lv, pit_x=(224, 288)):
    sc = load(f"l{lv}-bg-far")
    for k in ("bg-mid", "bg-near"):
        sc.alpha_composite(load(f"l{lv}-{k}"))
    g, p = load(f"l{lv}-ground"), load(f"l{lv}-pit")
    for x in range(0, W, 32):
        if pit_x[0] <= x < pit_x[1]:
            sc.alpha_composite(p, (x, GY))
        else:
            sc.alpha_composite(g, (x, GY))
    return sc


def put(sc, im, x, y_bottom):
    sc.alpha_composite(im, (x, y_bottom - im.height))


def scene4():
    sc = base_scene(4)
    pf = load("l4-platform")
    for x in range(208, 304, 32):
        sc.alpha_composite(pf, (x, 170))
    wall = load("l4-wall")
    for y in range(GY - 32 * 4, GY, 32):
        sc.alpha_composite(wall, (360, y))
    put(sc, load("l4-crate"), 120, GY)
    put(sc, load("l4-steam-vent"), 170, GY)
    put(sc, load("l4-gear"), 248, 150)
    put(sc, load("l4-gear"), 420, GY)
    put(sc, booker(0), 30, GY)
    put(sc, booker(14) if load("booker").width >= 48 * 15 else booker(7), 316, 180)
    return sc


def scene5():
    sc = base_scene(5)
    pf = load("l5-platform")
    for x in range(200, 296, 32):
        sc.alpha_composite(pf, (x, 175))
    vac, drn = load("l5-vacuum"), load("l5-drone")
    put(sc, frame(vac, 0, 24, 16), 130, GY)
    put(sc, frame(vac, 1, 24, 16), 330, GY)
    put(sc, frame(drn, 0, 24, 16), 250, 150)
    put(sc, frame(drn, 1, 24, 16), 400, 190)
    put(sc, load("l5-cart"), 160, GY)
    put(sc, load("l5-hydrant"), 440, GY)
    put(sc, booker(0), 40, GY)
    put(sc, booker(6), 215, 175)
    return sc


def scene6():
    sc = base_scene(6)
    pf = load("l6-platform")
    for x in range(200, 296, 32):
        sc.alpha_composite(pf, (x, 175))
    put(sc, load("l6-boxes"), 110, GY)
    put(sc, load("l6-gate"), 160, GY)
    put(sc, load("l6-grill"), 320, GY)
    put(sc, load("l6-trashcan"), 370, GY)
    put(sc, load("golden-steak"), 420, GY - 6)
    put(sc, booker(0), 40, GY)
    put(sc, booker(6), 230, 175)
    return sc


ASSETS = {
    4: ["l4-gear", "l4-crate", "l4-steam-vent", ("l4-ground", 3, 1), ("l4-pit", 2, 2),
        ("l4-wall", 2, 2), ("l4-platform", 3, 1)],
    5: ["l5-vacuum", "l5-drone", "l5-cart", "l5-hydrant", ("l5-ground", 3, 1), ("l5-pit", 2, 2),
        ("l5-platform", 3, 1)],
    6: ["l6-boxes", "l6-gate", "l6-grill", "l6-trashcan", "golden-steak", ("l6-ground", 3, 1),
        ("l6-pit", 2, 2), ("l6-platform", 3, 1)],
}
SCENES = {4: scene4, 5: scene5, 6: scene6}


def level_block(lv):
    Z, pad = 4, 12
    items = []
    for a in ASSETS[lv]:
        if isinstance(a, tuple):
            im = load(a[0])
            items.append(tile(im, a[1], a[2]))
        else:
            items.append(load(a))
    thumb = load(f"thumb-l{lv}")
    row_h = max(i.height for i in items) * Z
    row_w = sum(i.width * Z + pad for i in items) + pad
    sc = SCENES[lv]()
    sc.save(DRAFT(f"b-l{lv}-scene.png"))
    bw = max(row_w, W * 2 + pad * 3 + (thumb.width * 2 if thumb else 0))
    bh = pad + row_h + pad + H * 2 + pad
    blk = Image.new("RGBA", (bw, bh), GRAY)
    x = pad
    for im in items:
        blk.alpha_composite(zoom(im, Z), (x, pad))
        x += im.width * Z + pad
    y = pad + row_h + pad
    blk.alpha_composite(zoom(sc, 2), (pad, y))
    if thumb:
        blk.alpha_composite(zoom(thumb, 2), (pad * 2 + W * 2, y))
    return blk


def main(levels):
    blocks = []
    for lv in levels:
        if load(f"l{lv}-bg-far") is None:
            continue
        blocks.append(level_block(lv))
    cw = max(b.width for b in blocks)
    cv = Image.new("RGBA", (cw, sum(b.height for b in blocks)), GRAY)
    y = 0
    for b in blocks:
        cv.alpha_composite(b, (0, y))
        y += b.height
    cv.convert("RGB").save(os.path.join(LEVELS, "preview-B.png"))
    print("preview-B.png", cv.size)


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or [4, 5, 6])
