"""Agent B: build Level 4-6 finals from art/levels/raw/b-*.png.

Run:  python3 art/levels/scripts/b_build.py 4 [5 6]
Writes public/assets/<key>.png, merges manifest entries (merge_manifest.py),
and saves art/levels/drafts/b-lN-check.png (assets at 4x + seam checks).
"""
import json
import subprocess
import sys

from b_lib import *

MERGE = os.path.join(ART, "scripts", "merge_manifest.py")


def platform_window(path, x0, period, n=3):
    """Cut n periods of a repeating catwalk/awning band and size it to 32x16."""
    im = clean_alpha(rgba(RAW(path)), 100)
    box = im.getbbox()
    band = im.crop((x0, box[1], x0 + round(period * n), box[3]))
    return band


def shade(im, k=1.0, tint=(20, 24, 60), t=0.0):
    """Night falloff for parallax layers: scale value by k, blend toward a tint."""
    a = np.array(im.convert("RGBA")).astype(np.float32)
    a[:, :, :3] = a[:, :, :3] * k * (1 - t) + np.array(tint, np.float32) * t
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def bg_layers(far, mid, near, mid_dy=0, near_dy=0, far_k=16, mid_shade=(1.0, 0.0),
              near_shade=(1.0, 0.0), tint=(20, 24, 60)):
    bg_far = wrap_seamless(rgba(RAW(far)), W, H, far_k)
    m = clean_alpha(wrap_seamless(rgba(RAW(mid)), W, H, 12))
    m = shade(m, mid_shade[0], tint, mid_shade[1])
    bg_mid = Image.new("RGBA", (W, H))
    bg_mid.alpha_composite(m, (0, mid_dy))
    n = clean_alpha(wrap_seamless(rgba(RAW(near)), W, H, 12))
    n = shade(n, near_shade[0], tint, near_shade[1])
    bg_near = Image.new("RGBA", (W, H))
    bg_near.alpha_composite(n, (0, near_dy))
    return bg_far, bg_mid, bg_near


OPAQUE = set()


def wrap_lines(im, w, h, k=6, lk=0.7, frac=0.22):
    """Horizontal-wrap tile with thin dark lines (mortar) kept through the downscale."""
    arr = np.array(down_lines(im, (w + k, h), lk, frac)).astype(np.float32)
    out = arr[:, :w].copy()
    for x in range(k):
        t = (x + 0.5) / k
        out[:, x] = arr[:, w + x] * (1 - t) + arr[:, x] * t
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def finish(level, named, weights, extra=(), opaque=(), sheets=None, groups=None):
    """groups: [(keys, n_colours), ...] -> split palette so sprites keep their colours."""
    if groups:
        ref, pal = make_palette_groups(
            [({k: named[k] for k in keys}, weights, n) for keys, n in groups], extra=extra)
    else:
        ref, pal = make_palette(named, weights, extra=extra)
    final = {}
    for k, im in named.items():
        q = apply_palette(im, ref)
        if k not in opaque:
            q = clean_alpha(q)
        final[k] = q
    frag = {}
    for k, im in final.items():
        out = im.convert("RGB") if k in opaque else im
        out.save(os.path.join(OUT, f"{k}.png"), optimize=True)
        entry = {"file": f"{k}.png", "width": im.width, "height": im.height}
        if sheets and k in sheets:
            entry.update(sheets[k])
        frag[k] = entry
    subprocess.run([sys.executable, MERGE, json.dumps(frag)], check=True)
    sw = Image.new("RGB", (len(pal) // 3, 1))
    sw.putdata([tuple(pal[i:i + 3]) for i in range(0, len(pal), 3)])
    sw.resize((len(pal) // 3 * 16, 16), Image.NEAREST).save(DRAFT(f"b-l{level}-palette.png"))
    for k, im in final.items():
        if k not in opaque:
            check_alpha(im)
        print(k, im.size, "colors", n_colors(im))
    return final


def check_sheet(level, final, keys_tiles, keys_props):
    """Assets at 4x on mid-gray, tiles repeated, plus 2x1 seam strips of the backgrounds."""
    Z, pad = 4, 12
    items = []
    for k in keys_props:
        items.append(final[k])
    for k, (nx, ny) in keys_tiles.items():
        items.append(tile(final[k], nx, ny))
    row_w = sum(i.width * Z + pad for i in items) + pad
    row_h = max(i.height for i in items) * Z
    seam_w = W * 2
    cw = max(row_w, seam_w + 2 * pad)
    ch = pad + row_h + pad + (H + pad) * 3
    cv = Image.new("RGBA", (cw, ch), (128, 128, 128, 255))
    x = pad
    for im in items:
        cv.alpha_composite(zoom(im, Z), (x, pad))
        x += im.width * Z + pad
    y = pad + row_h + pad
    for k in [f"l{level}-bg-far", f"l{level}-bg-mid", f"l{level}-bg-near"]:
        cv.alpha_composite(tile(final[k], 2, 1), (pad, y))
        y += H + pad
    cv.convert("RGB").save(DRAFT(f"b-l{level}-check.png"))


# ------------------------------------------------------------------ Level 4
def level4():
    far, mid, near = bg_layers("b-l4-far-med.png", "b-l4-mid-med.png", "b-l4-near-med.png",
                               mid_dy=40, near_dy=14, mid_shade=(0.88, 0.06),
                               near_shade=(0.72, 0.12))
    ground = wrap_seamless(rgba(RAW("b-l4-ground-med.png")), 32, 32, 6, cut=False)
    pit = wrap_xy(rgba(RAW("b-l4-pit-med.png")), 32, 32, 6)
    wall = down(rgba(RAW("b-l4-wall-med.png")), (32, 32))
    band = platform_window("b-l4-platform2-med.png", 264, 252, 2)  # yellow catwalk, 2 panels
    platform = outline_inner(clean_alpha(down(band, (32, 16))), 0.6, wrap_x=True)
    gear = split_grid(rgba(RAW("b-l4-props-med.png")))[0]
    crate, vent = split_grid(rgba(RAW("b-l4-props2-med.png")))  # bright orange crate, silver vent
    props = {
        "l4-gear": fit(shade(gear, 1.35), (24, 24), align="center"),  # lighter disc reads at 1x
        "l4-crate": fit(crate, (24, 24), stretch=True),
        "l4-steam-vent": fit(vent, (16, 8), stretch=True),
    }
    named = {"l4-bg-far": far, "l4-bg-mid": mid, "l4-bg-near": near, "l4-ground": ground,
             "l4-pit": pit, "l4-platform": platform, "l4-wall": wall, **props}
    weights = {"l4-ground": 20, "l4-pit": 20, "l4-platform": 30, "l4-wall": 20,
               "l4-gear": 40, "l4-crate": 40, "l4-steam-vent": 40}
    groups = [(["l4-bg-far", "l4-bg-mid", "l4-bg-near"], 13),
              (["l4-ground", "l4-pit", "l4-platform", "l4-wall"], 8),
              (["l4-gear", "l4-crate", "l4-steam-vent"], 9)]
    final = finish(4, named, weights, extra=[(255, 236, 160)], groups=groups,
                   opaque={"l4-bg-far", "l4-ground", "l4-pit", "l4-wall"})
    check_sheet(4, final, {"l4-ground": (3, 1), "l4-pit": (2, 2), "l4-wall": (2, 2),
                           "l4-platform": (3, 1)},
                ["l4-gear", "l4-crate", "l4-steam-vent"])
    return final


# ------------------------------------------------------------------ Level 5
def sheet2(f1, f2):
    s = Image.new("RGBA", (f1.width * 2, f1.height))
    s.alpha_composite(f1, (0, 0)); s.alpha_composite(f2, (f1.width, 0))
    return s


def recolor(im, mask_fn, new_fn):
    a = np.array(im).astype(np.int32)
    m = mask_fn(a) & (a[:, :, 3] > 0)
    a[m] = new_fn(a[m])
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def level5():
    far, mid, near = bg_layers("b-l5-far-med.png", "b-l5-mid-med.png", "b-l5-near-med.png",
                               mid_dy=30, near_dy=10, mid_shade=(0.78, 0.08),
                               near_shade=(0.62, 0.14), tint=(30, 16, 60))
    ground = wrap_lines(rgba(RAW("b-l5-ground2-med.png")), 32, 32)  # thick curb, brick mortar kept
    pit = wrap_xy(rgba(RAW("b-l5-pit-med.png")), 32, 32, 6)
    band = platform_window("b-l5-platform-med.png", 18, 192, 2)  # 4 stripes, 8 px each
    platform = outline_inner(clean_alpha(down(band, (32, 16))), 0.6, wrap_x=True)
    vac, _, cart, hyd = split_grid(rgba(RAW("b-l5-props-med.png")))
    # enemies face left (they patrol toward Booker); engine does not flip them
    vac = vac.transpose(Image.FLIP_LEFT_RIGHT)
    drone = clean_alpha(rgba(RAW("b-l5-drone2-med.png")), 100)  # chunky drone, already faces left
    drone = drone.crop(drone.getbbox())
    v1 = fit_outer(vac, (24, 16))
    d1 = fit_outer(drone, (24, 16), align="center")
    # vacuum frame 2: the red dome light on top goes dark (blink)
    top = np.zeros((16, 24), bool); top[:np.nonzero(np.array(v1)[:, :, 3].any(1))[0][0] + 3] = True
    v2 = recolor(v1, lambda a: top & (a[:, :, 0] > 150) & (a[:, :, 1] < 110),
                 lambda px: np.stack([px[:, 0] * 0.45, px[:, 1] * 0.4, px[:, 2] * 0.5, px[:, 3]], 1))
    # drone frame 2: mirror each rotor blur bar about its hub, blink the green light
    a = np.array(d1)
    rows = np.nonzero(a[:, :, 3].any(1))[0]
    r0 = rows[0]
    d2a = a.copy()
    for y in range(r0, r0 + 3):
        line = a[y]
        on = np.nonzero(line[:, 3] > 0)[0]
        if not len(on):
            continue
        for seg in np.split(on, np.nonzero(np.diff(on) > 1)[0] + 1):
            d2a[y, seg] = line[seg[::-1]]
    d2 = Image.fromarray(d2a, "RGBA")
    d2 = recolor(d2, lambda a: (a[:, :, 1] > 150) & (a[:, :, 0] < 140) & (a[:, :, 2] < 140),
                 lambda px: np.stack([px[:, 0] * 0.4, px[:, 1] * 0.45, px[:, 2] * 0.4, px[:, 3]], 1))
    props = {
        "l5-vacuum": sheet2(v1, v2),
        "l5-drone": sheet2(d1, d2),
        "l5-cart": fit_outer(shade(cart, 1.3), (32, 28)),  # lift the dark wood off the bg
        "l5-hydrant": fit_outer(hyd, (14, 20)),
    }
    named = {"l5-bg-far": far, "l5-bg-mid": mid, "l5-bg-near": near, "l5-ground": ground,
             "l5-pit": pit, "l5-platform": platform, **props}
    weights = {"l5-ground": 20, "l5-pit": 20, "l5-platform": 30, "l5-vacuum": 50,
               "l5-drone": 50, "l5-cart": 40, "l5-hydrant": 40}
    sheets = {"l5-vacuum": {"frameWidth": 24, "frameHeight": 16, "frames": 2},
              "l5-drone": {"frameWidth": 24, "frameHeight": 16, "frames": 2}}
    groups = [(["l5-bg-far", "l5-bg-mid", "l5-bg-near"], 14),
              (["l5-ground", "l5-pit", "l5-platform"], 7),
              (["l5-vacuum", "l5-drone", "l5-cart", "l5-hydrant"], 10)]
    final = finish(5, named, weights, opaque={"l5-bg-far", "l5-ground", "l5-pit"},
                   sheets=sheets, groups=groups)
    return final


# ------------------------------------------------------------------ Level 6
def level6():
    far, mid, near = bg_layers("b-l6-far-med.png", "b-l6-mid-med.png", "b-l6-near-med.png",
                               mid_dy=34, near_dy=10, mid_shade=(0.8, 0.06),
                               near_shade=(0.66, 0.12), tint=(36, 12, 30))
    ground = wrap_lines(rgba(RAW("b-l6-ground-med.png")), 32, 32)
    pit = wrap_xy(rgba(RAW("b-l6-pit-med.png")), 32, 32, 6)
    band = platform_window("b-l6-platform-med.png", 205, 187.6, 2)  # 2 marquee bulbs per tile
    platform = outline_inner(clean_alpha(down(band, (32, 16))), 0.6, wrap_x=True)
    boxes, gate, _, can = split_grid(rgba(RAW("b-l6-props-med.png")))
    grill = clean_alpha(rgba(RAW("b-l6-grill2-med.png")), 100)
    grill = grill.crop(grill.getbbox())
    gold = clean_alpha(rgba(RAW("b-golden-med.png")), 100)
    gold = gold.crop(gold.getbbox())
    props = {
        "l6-boxes": fit_outer(boxes, (24, 48), stretch=(22, 47)),
        "l6-gate": fit_outer(gate, (16, 56), stretch=(14, 55)),
        "l6-grill": fit_outer(grill, (32, 24), stretch=(30, 21)),
        "l6-trashcan": fit_outer(can, (20, 28)),
        "golden-steak": fit_outer(gold, (48, 36)),
    }
    named = {"l6-bg-far": far, "l6-bg-mid": mid, "l6-bg-near": near, "l6-ground": ground,
             "l6-pit": pit, "l6-platform": platform, **props}
    weights = {}
    groups = [(["l6-bg-far", "l6-bg-mid", "l6-bg-near"], 11),
              (["l6-ground", "l6-pit", "l6-platform"], 6),
              (["l6-boxes", "l6-gate", "l6-grill", "l6-trashcan"], 9),
              (["golden-steak"], 5)]
    final = finish(6, named, weights, opaque={"l6-bg-far", "l6-ground", "l6-pit"},
                   groups=groups)
    return final


if __name__ == "__main__":
    for lv in sys.argv[1:] or ["4"]:
        {"4": level4, "5": lambda: level5(), "6": lambda: level6()}[lv]()
