"""Build Level 2 (The Docks), Level 3 (The Rooftops) and menu-bg finals from the drafts.

Run from booker-run:  python3 art/levels/scripts/build_levels.py
Same steps as Level 1: L1 edge fix (best-cut + crossfade) for the parallax layers, premultiplied
box downscale, inner dark outline on sprites, one 32-colour palette per level (no dither),
hard alpha (0/255). Writes public/assets/l2-*.png, l3-*.png, menu-bg.png and merges manifest entries.
"""
import json
import os
import subprocess
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixlib import (ROOT, OUT, LV, D, OUTLINE, rgba, split_grid, clean_alpha, down, outline_inner, wrap_seamless,
                    make_palette, apply_palette, n_colors)

W, H = 480, 270
GROUND_Y = 238


# ------------------------------------------------------------------ helpers
def layer(path, k, dy=0, to_bottom=False):
    """Seamless 480x270 transparent layer; dy drops it down; to_bottom shifts it so the
    lowest opaque row sits on the bottom edge (no transparent strip under a pit)."""
    lay = clean_alpha(wrap_seamless(rgba(path), W, H, k))
    if to_bottom:
        rows = np.nonzero((np.array(lay)[:, :, 3] > 0).any(1))[0]
        dy += (H - 1) - rows.max()
    out = Image.new("RGBA", (W, H))
    out.alpha_composite(lay, (0, dy))
    return out


def tile_h(src, w, h, k):
    """Horizontally seamless tile (L1 ground method)."""
    return wrap_seamless(src, w, h, k, cut=False)


def tile_hv(src, w, h, k):
    """Seamless both ways: resize to (w+k, h+k), crossfade overflow columns then rows."""
    big = np.array(src.convert("RGBA").resize((w + k, h + k), Image.BOX)).astype(np.float32)
    a = big[:, :w].copy()
    for x in range(k):
        t = (x + 0.5) / k
        a[:, x] = big[:, w + x] * (1 - t) + big[:, x] * t
    out = a[:h].copy()
    for y in range(k):
        t = (y + 0.5) / k
        out[y] = a[h + y] * (1 - t) + a[y] * t
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def platform_strip(piece, w=32, h=16, k=6, frac=(0.3, 0.7)):
    """Cut the middle of a long platform sprite (no end caps) and make it tile horizontally."""
    x0, x1 = int(piece.width * frac[0]), int(piece.width * frac[1])
    mid = piece.crop((x0, 0, x1, piece.height))
    t = tile_h(mid, w, h, k)
    t = clean_alpha(t)
    # keep a bold dark top and bottom edge line
    a = np.array(t)
    op = a[:, :, 3] > 0
    for y in (0, h - 1):
        a[y, op[y], :3] = OUTLINE
    return Image.fromarray(a, "RGBA")


def fit_sprite(src, size, max_ratio=1.35, outline=0.6):
    """Fill `size` as fully as possible, allowing at most max_ratio aspect distortion; bottom-centre."""
    W_, H_ = size
    sx, sy = W_ / src.width, H_ / src.height
    if sx / sy > max_ratio:
        sx = sy * max_ratio
    elif sy / sx > max_ratio:
        sy = sx * max_ratio
    w, h = max(1, min(W_, round(src.width * sx))), max(1, min(H_, round(src.height * sy)))
    sm = outline_inner(down(src, (w, h)), outline)
    out = Image.new("RGBA", size)
    out.alpha_composite(sm, ((W_ - w) // 2, H_ - h))
    return out


def frames_common(pieces, fw, fh, align=("left", "bottom"), max_ratio=1.35, outline=0.6):
    """Several animation frames from separately drawn pieces at ONE common scale and anchor."""
    cw, ch = max(p.width for p in pieces), max(p.height for p in pieces)
    out = []
    for p in pieces:
        c = Image.new("RGBA", (cw, ch))
        x = 0 if align[0] == "left" else (cw - p.width) // 2
        y = ch - p.height if align[1] == "bottom" else (ch - p.height) // 2
        c.alpha_composite(p, (x, y))
        out.append(fit_sprite(c, (fw, fh), max_ratio, outline))
    return out


def finish(level, named, weights, opaque, extra_entries=None, keep=()):
    pal = make_palette([(named[k], weights.get(k, 1)) for k in named], 32, keep=(OUTLINE,) + tuple(keep))
    final = {}
    for k, im in named.items():
        q = apply_palette(im, pal)
        if k in opaque:
            q = q.convert("RGB")
        else:
            q = clean_alpha(q)
        final[k] = q
        q.save(os.path.join(OUT, f"{k}.png"), optimize=True)
    entries = {}
    for k, im in final.items():
        entries[k] = {"file": f"{k}.png", "width": im.width, "height": im.height}
    if extra_entries:
        for k, v in extra_entries.items():
            entries[k].update(v)
    allpx = np.concatenate([np.array(im.convert("RGBA"))[np.array(im.convert("RGBA"))[:, :, 3] > 0][:, :3]
                            for im in final.values()])
    ncol = len(np.unique(allpx, axis=0))
    print(f"{level}: {len(final)} assets, {ncol} colours")
    for k, im in final.items():
        a = np.array(im.convert("RGBA"))[:, :, 3]
        print(f"  {k:14s} {im.size} {im.mode} alpha={sorted(set(np.unique(a)))}")
    return final, entries


def seam_score(im):
    """Mean abs difference between last and first column vs. typical neighbour difference."""
    a = np.array(im.convert("RGBA")).astype(np.float32)
    wrap = np.abs(a[:, -1] - a[:, 0]).mean()
    typ = np.abs(a[:, 1:] - a[:, :-1]).mean()
    return wrap, typ


def shade(im, k=0.85, tint=(0, 0, 0), t=0.0):
    """Darken (and optionally tint) a layer so gameplay objects in front of it pop."""
    a = np.array(im.convert("RGBA")).astype(np.float32)
    a[:, :, :3] = a[:, :, :3] * k * (1 - t) + np.array(tint, np.float32) * t
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def brighten(im, k=1.25, lift=0):
    a = np.array(im.convert("RGBA")).astype(np.float32)
    a[:, :, :3] = a[:, :, :3] * k + lift
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def antenna_sprite():
    """Hand-placed 12x48 TV antenna: the generated one shrank to a 1 px pole that vanished at 1x.
    Bold outline, 2-px light pole, three Yagi crossbars, base plate, red warning light."""
    O, L, M, R, RH = OUTLINE, (196, 204, 226), (118, 128, 168), (214, 52, 52), (255, 160, 140)
    a = np.zeros((48, 12, 4), np.uint8)

    def rect(x0, y0, x1, y1, c):
        a[y0:y1 + 1, x0:x1 + 1] = (*c, 255)

    rect(4, 3, 7, 44, O); rect(5, 4, 6, 43, L); rect(6, 4, 6, 43, M)            # pole
    for y, x0, x1 in [(8, 0, 11), (15, 1, 10), (22, 2, 9)]:                       # crossbars
        rect(x0, y, x1, y + 2, O); rect(x0 + 1, y + 1, x1 - 1, y + 1, L)
        rect(5, y + 1, 6, y + 1, L)
    rect(2, 43, 9, 47, O); rect(3, 44, 8, 46, M); rect(3, 44, 8, 44, L)          # base plate
    rect(4, 0, 7, 3, O); rect(5, 1, 6, 2, R); a[1, 5] = (*RH, 255)                # warning light
    return Image.fromarray(a, "RGBA")


# ------------------------------------------------------------------ Level 2: The Docks
def level2():
    far = wrap_seamless(rgba(D("l2far_med.png")), W, H, 16)
    mid = layer(D("l2mid_med.png"), 12, dy=30)
    near = shade(layer(D("l2near_med.png"), 12, dy=36), 0.86)   # posts top ~185, like the L1 fence
    ground = tile_h(rgba(D("l2ground_med.png")), 32, 32, 6)
    pit = tile_hv(rgba(D("l2pit_med.png")), 32, 32, 6)
    (plat, bollard, tires, crab), = split_grid(rgba(D("l2spr_med.png")))
    named = {
        "l2-bg-far": far, "l2-bg-mid": mid, "l2-bg-near": near,
        "l2-ground": ground, "l2-pit": pit,
        "l2-platform": platform_strip(plat),
        "l2-bollard": fit_sprite(brighten(bollard, 1.3, 18), (16, 20), outline=0.8),   # lift off the dark pier
        "l2-tires": fit_sprite(tires, (24, 32)),
        "l2-crab": fit_sprite(crab, (20, 12), max_ratio=1.5, outline=0.7),
    }
    weights = {"l2-bg-far": 1, "l2-bg-mid": 1, "l2-bg-near": 1, "l2-ground": 30, "l2-pit": 30,
               "l2-platform": 40, "l2-bollard": 40, "l2-tires": 40, "l2-crab": 60}
    return finish("L2", named, weights, opaque={"l2-bg-far", "l2-ground", "l2-pit"})


# ------------------------------------------------------------------ Level 3: The Rooftops
def level3():
    far = wrap_seamless(rgba(D("l3far_med.png")), W, H, 16)
    mid = layer(D("l3mid_med.png"), 12, dy=24)
    near = shade(layer(D("l3near_med.png"), 12, dy=34), 0.78, (16, 18, 48), 0.12)   # railing ~205
    mid = shade(mid, 0.88, (16, 18, 48), 0.08)
    ground = tile_h(rgba(D("l3ground_med.png")), 32, 32, 6)
    pit = tile_hv(rgba(D("l3pit_med.png")), 32, 32, 6)
    rows = split_grid(rgba(D("l3spr_med.png")))
    (plank, ac, antenna), (pig1, pig2, vent) = rows
    p1, p2 = frames_common([brighten(pig1, 1.3, 12), brighten(pig2, 1.3, 12)], 16, 12, align=("left", "bottom"),
                           max_ratio=1.4, outline=0.9)
    pigeon = Image.new("RGBA", (32, 12))
    pigeon.alpha_composite(p1, (0, 0))
    pigeon.alpha_composite(p2, (16, 0))
    named = {
        "l3-bg-far": far, "l3-bg-mid": mid, "l3-bg-near": near,
        "l3-ground": ground, "l3-pit": pit,
        "l3-platform": platform_strip(plank, frac=(0.25, 0.75)),
        "l3-acunit": fit_sprite(ac, (28, 24)),
        "l3-antenna": antenna_sprite(),
        "l3-pigeon": pigeon,
        "l3-vent": fit_sprite(vent, (32, 16), max_ratio=1.4),
    }
    weights = {"l3-bg-far": 1, "l3-bg-mid": 1, "l3-bg-near": 1, "l3-ground": 30, "l3-pit": 20,
               "l3-platform": 40, "l3-acunit": 40, "l3-antenna": 80, "l3-pigeon": 80, "l3-vent": 40}
    return finish("L3", named, weights, opaque={"l3-bg-far", "l3-ground", "l3-pit"},
                  keep=((240, 228, 168),),   # pale yellow moon

                  extra_entries={"l3-pigeon": {"frameWidth": 16, "frameHeight": 12, "frames": 2}})


# ------------------------------------------------------------------ menu background
def menu():
    src = rgba(D("menu_med.png")).resize((W, H), Image.BOX)
    a = np.array(src).astype(np.float32)
    # gently darken the middle band (behind the level cards), soft falloff
    y = np.arange(H)[:, None]
    band = np.clip(1 - np.abs(y - H * 0.47) / (H * 0.36), 0, 1) ** 0.8
    a[:, :, :3] *= (1 - 0.22 * band)[:, :, None] if band.ndim == 2 else 1
    im = Image.fromarray(a.astype(np.uint8), "RGBA")
    return finish("menu", {"menu-bg": im}, {"menu-bg": 1}, opaque={"menu-bg"})


if __name__ == "__main__":
    which = sys.argv[1:] or ["l2", "l3", "menu"]
    entries = {}
    finals = {}
    for w in which:
        f, e = {"l2": level2, "l3": level3, "menu": menu}[w]()
        finals.update(f)
        entries.update(e)
    for k in [k for k in finals if "bg-" in k]:
        print("seam", k, "wrap/typical = %.1f / %.1f" % seam_score(finals[k]))
    frag = os.path.join(LV, "drafts", "_levels_A_entries.json")
    json.dump(entries, open(frag, "w"), indent=1)
    subprocess.run([sys.executable, os.path.join(ROOT, "art", "scripts", "merge_manifest.py"), "--file", frag],
                   check=True)
