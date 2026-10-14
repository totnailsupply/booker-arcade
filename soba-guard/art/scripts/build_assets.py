"""Build every Soba Guard game asset from the generated drafts, deterministically.

Run from soba-guard/art:   python3 scripts/build_assets.py
Inputs : drafts/*.png (generated with scripts/gen.sh, prompts in drafts/prompts.sh + prompts.txt)
Outputs: out/<key>.png, out/manifest.json, out/preview.png, out/mock.png
         (drafts/_palette.png is a review aid)
Steps  : cut sheets into items (XY-cut on empty gaps, items assigned to grid cells)
         -> one scale per sprite sheet so relative sizes survive
         -> premultiplied box downscale -> darken edge pixels toward the outline colour
         -> frames of one animation aligned on the body anchor (largest blob: bottom + foot centre)
         -> one shared palette (<= 32 colours, no dither) for every asset
         -> alpha thresholded to 0/255.
Adapted from soba-tower/art/scripts/build_assets.py.
"""
import json
import os

import numpy as np
from PIL import Image

ART = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ART, "out")
os.makedirs(OUT, exist_ok=True)


def D(n):
    return os.path.join(ART, "drafts", n)


# Final source drafts (one per batch).
SRC = {
    "soba": "soba_med.png",       # 10 poses, 2 rows x 5 cols
    "def": "def_med.png",         # 4 rows (luckycat, steamer, chili, onigiri) x 3 frames
    "enemy": "enemy_med.png",     # 5 rows (rat, lidrat, crow, tanuki, fox) x 4 frames
    "items": "items_med.png",     # rows of 4, 4 items + row of 2 scooter frames
    "tiles": "tiles2_low.png",    # opaque 2x2: paver-in-grass, grass, porch planks, cobble
    "house": "house2_low.png",    # transparent tall narrow facade slice
    "alley": "alley2_low.png",    # opaque, 2:3, wall band on top, cobble ground
    "title": "title_1k.png",      # gemini, flat green background (keyed out)
}
for k, v in list(SRC.items()):  # fall back to the low draft until a medium render exists
    if not os.path.exists(D(v)) and os.path.exists(D(v.replace("_med", "_low"))):
        SRC[k] = v.replace("_med", "_low")

N_COLORS = 32
OUTLINE = (26, 18, 32)  # #1a1220
GLINT = (250, 246, 236)


# ============================================================== basic helpers
def rgba(path):
    return Image.open(path).convert("RGBA")


def clean_alpha(im, thr=128):
    """Hard edges: alpha to 0/255; fully transparent pixels zeroed."""
    a = np.array(im)
    on = a[:, :, 3] >= thr
    a[:, :, 3] = np.where(on, 255, 0)
    a[~on] = 0
    return Image.fromarray(a, "RGBA")


def segments(mask1d, min_len=4, min_gap=1):
    """Runs of True in a 1-D mask, merging runs separated by gaps < min_gap."""
    segs, start = [], None
    for i, v in enumerate(mask1d):
        if v and start is None:
            start = i
        if not v and start is not None:
            segs.append([start, i])
            start = None
    if start is not None:
        segs.append([start, len(mask1d)])
    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] < min_gap:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    return [(a, b) for a, b in merged if b - a >= min_len]


def xycut(mask, x0=0, y0=0, gap=12):
    """Recursive XY-cut: split on empty rows/cols (gaps >= gap px). Returns boxes."""
    rows = segments(mask.any(1), 1, gap)
    if len(rows) > 1:
        out = []
        for r0, r1 in rows:
            out += xycut(mask[r0:r1], x0, y0 + r0, gap)
        return out
    cols = segments(mask.any(0), 1, gap)
    if len(cols) > 1:
        out = []
        for c0, c1 in cols:
            out += xycut(mask[:, c0:c1], x0 + c0, y0, gap)
        return out
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return []
    return [(x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1)]


def grid_items(im, cols, rows, min_area=60, gap=3, row_cols=None):
    """Cut a sheet laid out as a grid. Every chunk found by XY-cut is assigned to the
    grid cell holding its centre; chunks in one cell are merged. row_cols lets each row
    have its own column count (rows are then found from horizontal gaps)."""
    im = clean_alpha(im, 100)
    m = np.array(im)[:, :, 3] > 0
    W, H = im.size
    bands = None
    if row_cols:
        bands = segments(m.any(1), 20, 25)
        assert len(bands) == rows, bands
    cells = {}
    for b in xycut(m, gap=gap):
        if m[b[1]:b[3], b[0]:b[2]].sum() < min_area:
            continue
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        if bands:
            r = min(range(rows), key=lambda i: 0 if bands[i][0] <= cy < bands[i][1]
                    else min(abs(cy - bands[i][0]), abs(cy - bands[i][1])))
            key = (r, int(cx * row_cols[r] // W))
        else:
            key = (int(cy * rows // H), int(cx * cols // W))
        if key in cells:
            o = cells[key]
            cells[key] = (min(o[0], b[0]), min(o[1], b[1]), max(o[2], b[2]), max(o[3], b[3]))
        else:
            cells[key] = b
    out = []
    for r in range(rows):
        for c in range(row_cols[r] if row_cols else cols):
            assert (r, c) in cells, ("missing cell", r, c)
            out.append(im.crop(cells[(r, c)]))
    return out


def down(im, size):
    """Premultiplied box downscale, then hard alpha."""
    a = np.array(im).astype(np.float32)
    al = a[:, :, 3:4] / 255.0
    pre = np.concatenate([a[:, :, :3] * al, a[:, :, 3:4]], 2).astype(np.uint8)
    small = np.array(Image.fromarray(pre, "RGBA").resize(size, Image.BOX)).astype(np.float32)
    al2 = np.maximum(small[:, :, 3:4] / 255.0, 1e-6)
    rgb = np.clip(small[:, :, :3] / al2, 0, 255)
    return clean_alpha(Image.fromarray(np.concatenate([rgb, small[:, :, 3:4]], 2).astype(np.uint8), "RGBA"))


def outline_inner(im, strength=1.0):
    """Darken opaque pixels that touch transparency toward the outline colour, so the
    silhouette keeps a 1 px dark border without growing the sprite."""
    a = np.array(im).astype(np.float32)
    op = a[:, :, 3] > 0
    pad = np.pad(op, 1)
    edge = op & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    for c in range(3):
        ch = a[:, :, c]
        ch[edge] = ch[edge] * (1 - strength) + OUTLINE[c] * strength
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def fit(src, size, stretch=False, align="bottom", outline=0.7):
    """Downscale src into a canvas of `size`, keeping aspect unless stretch."""
    W, H = size
    if stretch:
        w, h = W, H
    else:
        s = min(W / src.width, H / src.height)
        w, h = max(1, round(src.width * s)), max(1, round(src.height * s))
    sm = outline_inner(down(src, (w, h)), outline)
    out = Image.new("RGBA", size)
    y = H - h if align == "bottom" else (H - h) // 2
    out.alpha_composite(sm, ((W - w) // 2, y))
    return out


def largest_blob(mask):
    """Boolean mask of the largest 4-connected component."""
    H, W = mask.shape
    lab = np.zeros((H, W), np.int32)
    best, best_n, n = 0, 0, 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n += 1
        stack, cnt = [(y0, x0)], 0
        lab[y0, x0] = n
        while stack:
            y, x = stack.pop()
            cnt += 1
            for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    stack.append((yy, xx))
        if cnt > best_n:
            best, best_n = n, cnt
    return lab == best


def anchor(sm):
    """(x, y) anchor of a downscaled frame: bottom row of its main body and the x centre of
    that body's lowest third (feet / base). Effects (steam, sparks, flying lids) and lunging
    heads do not move it, so animation frames stay planted."""
    m = largest_blob(np.array(sm)[:, :, 3] > 0)
    ys, xs = np.nonzero(m)
    y1 = ys.max()
    low = ys >= y1 - max(2, (y1 - ys.min()) // 3)
    return xs[low].mean(), y1


def eye_glints(src):
    """Centres of the tiny pure-white eye-shine blobs in a source frame. They vanish in a
    box downscale, so they are re-painted as single pixels afterwards. A blob counts
    when it is small and its surroundings are dark (excludes muzzle, blaze and chest)."""
    a = np.array(src).astype(np.int32)
    white = (a[:, :, :3].min(2) > 236) & (a[:, :, 3] > 0)
    lum = (a[:, :, :3] * [0.299, 0.587, 0.114]).sum(2)
    H, W = white.shape
    seen = np.zeros_like(white)
    out = []
    for y0, x0 in zip(*np.nonzero(white)):
        if seen[y0, x0]:
            continue
        stack, pts = [(y0, x0)], []
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= yy < H and 0 <= xx < W and white[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    stack.append((yy, xx))
        if not 6 <= len(pts) <= 160:
            continue
        ys, xs = np.array(pts).T
        r = 8
        ring = lum[max(0, ys.min() - r):ys.max() + r + 1, max(0, xs.min() - r):xs.max() + r + 1]
        ring_a = a[max(0, ys.min() - r):ys.max() + r + 1, max(0, xs.min() - r):xs.max() + r + 1, 3]
        dark_share = (ring[ring_a > 0] < 110).mean()
        if dark_share > 0.55:
            out.append((xs.mean(), ys.mean()))
    return out


def animate(frames, size, scale, outline=0.75, glints=False, ax=None, pad=0):
    """Downscale every frame by one shared scale and place it so its body anchor sits at
    (ax, bottom). A frame that would leave the canvas is shifted back inside."""
    W, H = size
    ax = W / 2 if ax is None else ax
    out = []
    for src in frames:
        w, h = max(1, round(src.width * scale)), max(1, round(src.height * scale))
        sm = outline_inner(down(src, (w, h)), outline).copy()
        if glints:
            px_ = sm.load()
            for gx, gy in eye_glints(src):
                ox, oy = int(gx * w / src.width), int(gy * h / src.height)
                if px_[ox, oy][3]:
                    px_[ox, oy] = GLINT + (255,)
        cx, by = anchor(sm)
        x = int(round(ax - cx))
        y = H - 1 - pad - by
        x = max(0, min(W - w, x)) if w <= W else (W - w) // 2
        y = max(0, min(H - h, y)) if h <= H else H - h
        cell = Image.new("RGBA", (W, H))
        cell.alpha_composite(sm, (x, y)) if (x >= 0 and y >= 0) else cell.paste(sm, (x, y), sm)
        out.append(cell)
    return out


def strip(frames):
    W, H = frames[0].size
    sheet = Image.new("RGBA", (W * len(frames), H))
    for i, f in enumerate(frames):
        sheet.alpha_composite(f, (i * W, 0))
    return sheet


def sheet_scale(frames, box):
    """Largest scale at which every frame fits in box (w, h)."""
    return min(min(box[0] / f.width, box[1] / f.height) for f in frames)


def key_out(im, thresh=160):
    """Key out a flat green background (letter counters too) and remove green spill."""
    t = np.array(im.convert("RGBA")).astype(np.int32)
    bg = t[2, 2, :3]
    green = (np.abs(t[:, :, :3] - bg).sum(2) < thresh) | (
        (t[:, :, 1] > 150) & (t[:, :, 0] < 120) & (t[:, :, 2] < 120))
    t[green] = 0
    spill = t[:, :, 1] > np.maximum(t[:, :, 0], t[:, :, 2])
    t[:, :, 1] = np.where(spill, np.maximum(t[:, :, 0], t[:, :, 2]), t[:, :, 1])
    return clean_alpha(Image.fromarray(t.astype(np.uint8), "RGBA"), 128)


# ============================================================== Soba (40x40, faces right)
FW = FH = 40
IDLE_H = 32  # idle frame height in px (same as soba-tower); every pose uses the same scale
soba_src = grid_items(rgba(D(SRC["soba"])), 5, 2)
assert len(soba_src) == 10, len(soba_src)
# sheet (row-major): idle0 idle1 barkWind bark cheer | run0 run1 run2 run3 sad
# contract order    : idle 0-1, bark 2-3, run 4-7, cheer 8, sad 9
SOBA_ORDER = [0, 1, 2, 3, 5, 6, 7, 8, 4, 9]
soba_src = [soba_src[i] for i in SOBA_ORDER]
s_soba = min(IDLE_H / soba_src[0].height, sheet_scale(soba_src, (FW - 1, FH - 1)))
soba_frames = animate(soba_src, (FW, FH), s_soba, outline=0.85, glints=True)
soba_sheet = strip(soba_frames)

# ============================================================== defenders (32x32, face right)
UW = UH = 32
def_src = grid_items(rgba(D(SRC["def"])), 3, 4)
assert len(def_src) == 12, len(def_src)
DEF_KEYS = ["luckycat", "steamer", "chili", "onigiri"]
# one scale per character (each fills its 32 px cell; they share a tile with nothing else)
units = {}
for i, k in enumerate(DEF_KEYS):
    fr = def_src[i * 3:i * 3 + 3]
    s = sheet_scale(fr, (UW - 1, UH - 1))
    units[k] = strip(animate(fr, (UW, UH), s, outline=0.75, ax=UW / 2 - (2 if k == "chili" else 0)))

# ============================================================== enemies (32x32, face left)
en_src = grid_items(rgba(D(SRC["enemy"])), 4, 5)
assert len(en_src) == 20, len(en_src)
EN_KEYS = ["rat", "lidrat", "crow", "tanuki", "fox"]
# one scale for the whole sheet so the model's relative sizes survive (fox > tanuki > rat)
s_en = sheet_scale(en_src, (UW - 1, UH - 1))
for i, k in enumerate(EN_KEYS):
    fr = en_src[i * 4:i * 4 + 4]
    s = min(sheet_scale(fr, (UW - 1, UH - 1)), s_en * 1.15)
    units[k] = strip(animate(fr, (UW, UH), s, outline=0.75, ax=UW / 2 + 1))

# ============================================================== items (16x16) + scooter (32x24)
it_src = grid_items(rgba(D(SRC["items"])), 0, 3, row_cols=[4, 4, 2])
assert len(it_src) == 10, len(it_src)
ITEM_NAMES = ["coin", "dumpling", "lid", "ember", "feather", "stonepuff", "bone", "star"]
IW = 16
item_frames = []
for src in it_src[:8]:
    s = min(15 / src.width, 15 / src.height)
    w, h = max(1, round(src.width * s)), max(1, round(src.height * s))
    sm = outline_inner(down(src, (w, h)), 0.8)
    cell = Image.new("RGBA", (IW, IW))
    cell.alpha_composite(sm, ((IW - w) // 2, (IW - h) // 2))
    item_frames.append(cell)
items_sheet = strip(item_frames)
SCW, SCH = 32, 24
s_sc = sheet_scale(it_src[8:], (SCW - 1, SCH - 1))
scooter_sheet = strip(animate(it_src[8:], (SCW, SCH), s_sc, outline=0.75))


# ============================================================== tiles (40x40, opaque)
def wrap_fade(a, k, axis):
    """a has k extra rows/cols beyond the tile; crossfade them into the start."""
    if axis == 0:
        n = a.shape[0] - k
        out = a[:n].copy()
        for i in range(k):
            t = (i + 0.5) / k
            out[i] = a[n + i] * (1 - t) + a[i] * t
    else:
        n = a.shape[1] - k
        out = a[:, :n].copy()
        for i in range(k):
            t = (i + 0.5) / k
            out[:, i] = a[:, n + i] * (1 - t) + a[:, i] * t
    return out


def seamless(src_rgb, box, size, k=3):
    """Crop box (+k px overflow at final scale), downscale, crossfade the overflow back in."""
    x0, y0, x1, y1 = box
    sx, sy = (x1 - x0) / size, (y1 - y0) / size
    crop = src_rgb.crop((x0, y0, x1 + int(np.ceil(k * sx)), y1 + int(np.ceil(k * sy))))
    a = np.array(crop.resize((size + k, size + k), Image.BOX)).astype(np.float32)
    return wrap_fade(wrap_fade(a, k, 0), k, 1)


def grade(a, mul, add, tint=(1, 1, 1)):
    return np.clip(a * mul * np.array(tint) + add, 0, 255)


TS = 40
tiles_src = Image.open(D(SRC["tiles"])).convert("RGB")
TW, TH = tiles_src.size
q = TW // 2  # quadrant size
grass = seamless(tiles_src, (q + 40, 40, q + 40 + 400, 40 + 400), TS)
# paver: non-green blob in the top-left quadrant, pasted centred so the tile edges are grass
tl = np.array(tiles_src.crop((0, 0, q - 8, q - 8))).astype(np.int32)
notgreen = ~((tl[:, :, 1] > tl[:, :, 0] + 12) & (tl[:, :, 1] > tl[:, :, 2] - 4))
pm = largest_blob(notgreen)
ys, xs = np.nonzero(pm)
pbox = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
paver_rgba = np.zeros((pbox[3] - pbox[1], pbox[2] - pbox[0], 4), np.uint8)
paver_rgba[:, :, :3] = tl[pbox[1]:pbox[3], pbox[0]:pbox[2]]
paver_rgba[:, :, 3] = pm[pbox[1]:pbox[3], pbox[0]:pbox[2]] * 255
PV = 22
paver = outline_inner(down(Image.fromarray(paver_rgba, "RGBA"), (PV, PV)), 0.6)


def garden(grass_a, paver_mul):
    g = Image.fromarray(grass_a.astype(np.uint8), "RGB").convert("RGBA")
    p = np.array(paver).astype(np.float32)
    # pull the stone a quarter of the way toward the lawn so grey rats don't vanish on it
    p[:, :, :3] = np.clip((p[:, :, :3] * 0.75 + grass_a.mean((0, 1)) * 0.25 + 12) * paver_mul, 0, 255)
    g.alpha_composite(Image.fromarray(p.astype(np.uint8), "RGBA"), ((TS - PV) // 2, (TS - PV) // 2))
    return g


grass_light = garden(grade(grass, 1.12, 10), 1.0)
grass_dark = garden(grade(grass, 0.84, 0, (0.95, 1.0, 1.05)), 0.9)

# porch: horizontal planks; crop a whole number of plank periods starting on a seam
bl = tiles_src.crop((6, q + 6, q - 6, TH - 6))
bla = np.array(bl).astype(np.float32).mean(2)
rowlum = bla.mean(1)
best, per = None, 60
for p in range(60, 160):
    d = np.abs(bla[p:] - bla[:-p]).mean()
    if best is None or d < best:
        best, per = d, p
seam = int(np.argmin(rowlum[:per]))
NPL = 4
porch = bl.crop((0, seam, bl.width, seam + NPL * per)).resize((TS, TS), Image.BOX).convert("RGBA")
cobble = seamless(tiles_src, (q + 40, q + 40, q + 40 + 380, q + 40 + 380), TS)
cobble = Image.fromarray(grade(cobble, 0.95, 4).astype(np.uint8), "RGB").convert("RGBA")
tiles_sheet = strip([grass_light, grass_dark, porch, cobble])

# ============================================================== house (72x248) and alley (168x248)
house_src = clean_alpha(rgba(D(SRC["house"])), 100)
house_src = house_src.crop(house_src.getbbox())
house = down(house_src, (72, 248))
ha = np.array(house)
ha[ha[:, :, 3] == 0] = OUTLINE + (255,)  # the panel is opaque
house = Image.fromarray(ha, "RGBA")
alley_src = Image.open(D(SRC["alley"])).convert("RGB")
alley = alley_src.resize((168, 248), Image.BOX)
BG_LIFT = (0.9, 20)  # background grade: lift the very dark alley toward mid-tone so black sprites read
alley = Image.fromarray(grade(np.array(alley).astype(np.float32), *BG_LIFT).astype(np.uint8), "RGB").convert("RGBA")

# ============================================================== title (320x120, transparent)
t = key_out(rgba(D(SRC["title"])))
t = t.crop(t.getbbox())
title = fit(t, (320, 120), align="center", outline=0.0)

# ============================================================== shared palette
named = {"soba": soba_sheet, **units, "scooter": scooter_sheet, "items": items_sheet,
         "tiles": tiles_sheet, "house": house, "alley": alley, "title": title}
# share of the palette sample each asset gets (importance, not area)
share = {"soba": 22, "luckycat": 4, "steamer": 4, "chili": 4, "onigiri": 3, "rat": 3, "lidrat": 3,
         "crow": 2, "tanuki": 3, "fox": 3, "scooter": 3, "items": 4, "tiles": 12, "house": 8,
         "alley": 10, "title": 6}
# Anchor colours: small but important features a population-based median cut merges away
# (outline, eye glint, tongue/ear pink, lantern red, gold, steel, grass green, fox orange,
# window glow, dusk violet, Soba tan).
ANCHORS = [OUTLINE, GLINT, (232, 130, 142), (200, 40, 44), (248, 184, 48), (176, 184, 196),
           (64, 110, 84), (232, 120, 40), (240, 196, 110), (106, 80, 112), (176, 106, 52),
           (62, 56, 80), (80, 68, 98), (112, 108, 132)]  # alley plum-greys, paver grey


def dominant(im, n=2):
    """The n most common colours of an opaque tile (lawn base + tuft), used as anchors so
    the checker's light/dark lawn keeps its own greens."""
    qq = im.convert("RGB").quantize(n + 1, method=Image.Quantize.MEDIANCUT)
    pl = qq.getpalette()
    return [tuple(pl[i * 3:i * 3 + 3]) for _, i in sorted(qq.getcolors(), reverse=True)[:n]]


ANCHORS += dominant(grass_light) + dominant(grass_dark)
rng = np.random.default_rng(7)
samples = []
for k, im in named.items():
    a = np.array(im)
    px_ = a[a[:, :, 3] > 0][:, :3]
    if not len(px_):
        continue
    lum = px_ @ np.array([0.299, 0.587, 0.114])
    w = np.where(lum < 45, 0.3, 1.0)
    idx = rng.choice(len(px_), share[k] * 2000, p=w / w.sum())
    samples.append(px_[idx])
px_all = np.concatenate(samples)
side = int(np.ceil(np.sqrt(len(px_all))))
buf = np.zeros((side * side, 3), np.uint8)
buf[: len(px_all)] = px_all
buf[len(px_all):] = px_all[: side * side - len(px_all)]
n_auto = N_COLORS - len(ANCHORS)
pal_img = Image.fromarray(buf.reshape(side, side, 3), "RGB").quantize(
    n_auto + 6, method=Image.Quantize.MEDIANCUT, kmeans=3)
auto = np.array(pal_img.getpalette()[: (n_auto + 6) * 3]).reshape(-1, 3)
cols = [tuple(c) for c in ANCHORS]
for c in auto:  # drop auto colours that duplicate an anchor or each other
    if min(np.abs(np.array(cols) - c).sum(1)) > 18:
        cols.append(tuple(int(v) for v in c))
cols = cols[:N_COLORS]
pal = [v for c in cols for v in c]
pal_ref = Image.new("P", (1, 1))
pal_ref.putpalette(pal + list(pal[:3]) * ((768 - len(pal)) // 3))


def apply_palette(im):
    a = np.array(im)
    qd = im.convert("RGB").quantize(palette=pal_ref, dither=Image.Dither.NONE).convert("RGB")
    out = np.concatenate([np.array(qd), a[:, :, 3:4]], 2)
    out[out[:, :, 3] == 0] = 0
    return Image.fromarray(out, "RGBA")


final = {k: apply_palette(v) for k, v in named.items()}
for k, im in final.items():
    im.save(os.path.join(OUT, f"{k}.png"), optimize=True)
sw = Image.new("RGB", (len(pal) // 3, 1))
sw.putdata([tuple(pal[i:i + 3]) for i in range(0, len(pal), 3)])
sw.resize((len(pal) // 3 * 16, 16), Image.NEAREST).save(os.path.join(ART, "drafts", "_palette.png"))


# ============================================================== manifest
def entry(key, fw, fh, n, anims):
    return {"file": f"{key}.png", "frameWidth": fw, "frameHeight": fh, "frames": n,
            "animations": anims}


manifest = {"soba": entry("soba", FW, FH, 10, {"idle": [0, 1], "bark": [2, 3], "run": [4, 5, 6, 7],
                                                 "cheer": [8], "sad": [9]})}
for k in ["luckycat", "steamer", "chili"]:
    manifest[k] = entry(k, UW, UH, 3, {"idle": [0, 1], "action": [2]})
manifest["onigiri"] = entry("onigiri", UW, UH, 3, {"full": [0], "bitten": [1], "crumbling": [2]})
for k in EN_KEYS:
    manifest[k] = entry(k, UW, UH, 4, {"walk": [0, 1], "bite": [2, 3]})
manifest["scooter"] = entry("scooter", SCW, SCH, 2, {"ride": [0, 1]})
manifest["items"] = entry("items", IW, IW, 8, {n: [i] for i, n in enumerate(ITEM_NAMES)})
manifest["tiles"] = entry("tiles", TS, TS, 4, {"grassLight": [0], "grassDark": [1], "porch": [2],
                                                "alley": [3]})
for k in ["house", "alley", "title"]:
    manifest[k] = {"file": f"{k}.png", "width": final[k].width, "height": final[k].height}
json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=2)


# ============================================================== mock battle screen (640x360)
def frame(key, i):
    m = manifest[key]
    fw, fh = m["frameWidth"], m["frameHeight"]
    return final[key].crop((i * fw, 0, (i + 1) * fw, fh))


def sky(W, H, top, bottom):
    g = np.zeros((H, W, 4), np.uint8)
    for y in range(H):
        t_ = y / max(1, H - 1)
        g[y, :, :3] = [int(top[i] * (1 - t_) + bottom[i] * t_) for i in range(3)]
        g[y, :, 3] = 255
    return Image.fromarray(g, "RGBA")


GX, GY = 112, 84
mock = sky(640, 360, (18, 20, 44), (60, 44, 80))
for r in range(5):
    for c in range(9):
        mock.alpha_composite(frame("tiles", (r + c) % 2), (GX + c * TS, GY + r * TS))
    mock.alpha_composite(frame("tiles", 2), (72, GY + r * TS))
mock.alpha_composite(final["house"], (0, 56))
mock.alpha_composite(final["alley"], (472, 56))
bar = Image.new("RGBA", (640, 56), (40, 28, 46, 235))
mock.alpha_composite(bar, (0, 0))
mock.alpha_composite(Image.new("RGBA", (640, 64), (40, 28, 46, 235)), (0, 296))
mock.alpha_composite(frame("items", 0), (10, 20))


def put(key, i, col, row, dx=0, dy=0):
    im = frame(key, i)
    x = GX + col * TS + (TS - im.width) // 2 + dx
    y = GY + row * TS + TS - im.height - 3 + dy
    mock.alpha_composite(im, (x, y))


for r in range(5):  # one delivery scooter per row, at the porch's left edge
    mock.alpha_composite(frame("scooter", r % 2), (72 + 4, GY + r * TS + TS - 24 - 2))
mock.alpha_composite(frame("soba", 2 + 1), (72, GY + 2 * TS + TS - 40))
mock.alpha_composite(frame("soba", 4), (72, GY + 0 * TS + TS - 40 - 4))
put("luckycat", 0, 0, 0); put("luckycat", 2, 0, 2); put("luckycat", 1, 0, 4)
put("steamer", 0, 1, 0); put("steamer", 2, 1, 1); put("steamer", 1, 1, 2); put("steamer", 0, 2, 3)
put("chili", 2, 2, 2); put("onigiri", 0, 4, 1); put("onigiri", 1, 3, 3); put("onigiri", 2, 4, 4)
put("rat", 0, 6, 0); put("lidrat", 0, 5, 1); put("crow", 0, 7, 2); put("rat", 2, 4, 3, dx=14)
put("tanuki", 1, 8, 4); put("fox", 0, 9, 2, dx=20); put("crow", 2, 5, 4, dx=12)
put("rat", 1, 10, 0, dx=10); put("lidrat", 2, 11, 3)
mock.alpha_composite(frame("items", 1), (GX + 1 * TS + 34, GY + 1 * TS + 14))
mock.alpha_composite(frame("items", 3), (GX + 2 * TS + 40, GY + 2 * TS + 14))
mock.alpha_composite(frame("items", 0), (GX + 0 * TS + 20, GY + 0 * TS + 4))
mock.convert("RGB").save(os.path.join(OUT, "mock.png"))

# ============================================================== preview (3x, grey + night)
Z, PAD = 3, 8


def z(im, f=Z):
    im = im.convert("RGBA")
    return im.resize((im.width * f, im.height * f), Image.NEAREST)


def row_of(ims, gap=6):
    W = sum(i.width for i in ims) + gap * (len(ims) - 1)
    H = max(i.height for i in ims)
    out = Image.new("RGBA", (W, H))
    x = 0
    for i in ims:
        out.alpha_composite(i, (x, H - i.height)); x += i.width + gap
    return out


sprite_rows = [
    row_of([final["soba"]]),
    row_of([final[k] for k in DEF_KEYS]),
    row_of([final[k] for k in EN_KEYS[:3]]),
    row_of([final[k] for k in EN_KEYS[3:]] + [final["scooter"], final["items"]]),
]
sprites = Image.new("RGBA", (max(r.width for r in sprite_rows),
                             sum(r.height + PAD for r in sprite_rows)))
y = 0
for r in sprite_rows:
    sprites.alpha_composite(r, (0, y)); y += r.height + PAD
env_row = row_of([final["house"], final["alley"],
                  row_of([final["tiles"]]), final["title"]], gap=8)
blocks = []
for bgc in [(128, 128, 128, 255), (22, 22, 46, 255)]:
    b = Image.new("RGBA", (max(sprites.width, env_row.width) + 2 * PAD,
                           sprites.height + env_row.height + 3 * PAD), bgc)
    b.alpha_composite(sprites, (PAD, PAD))
    b.alpha_composite(env_row, (PAD, sprites.height + 2 * PAD))
    blocks.append(z(b))
# checker test of the garden tiles (3x3) and tiled porch column
chk = Image.new("RGBA", (TS * 4 + 8 + TS, TS * 3))
for r in range(3):
    for c in range(4):
        chk.alpha_composite(frame("tiles", (r + c) % 2), (c * TS, r * TS))
    chk.alpha_composite(frame("tiles", 2), (TS * 4 + 8, r * TS))
blocks.append(z(chk))
Wp = max(b.width for b in blocks)
cv = Image.new("RGBA", (Wp, sum(b.height for b in blocks)), (128, 128, 128, 255))
y = 0
for b in blocks:
    cv.alpha_composite(b, (0, y)); y += b.height
cv.convert("RGB").save(os.path.join(OUT, "preview.png"))

print("soba scale", round(s_soba, 4), "enemy scale", round(s_en, 4), "porch period", per)
for k, im in final.items():
    a = np.array(im.convert("RGBA"))
    n = len(np.unique(a[a[:, :, 3] > 0][:, :3], axis=0))
    print(f"{k:10s} {im.size} colours={n} alpha={im.getchannel('A').getextrema()}")
