"""Build every Soba Tower game asset from the generated drafts, deterministically.

Run from soba-tower/art:   python3 scripts/build_assets.py
Inputs : drafts/*.png (generated with scripts/gen.sh, prompts in drafts/prompts*.{txt,sh})
Outputs: out/<key>.png, out/manifest.json, out/preview.png, out/soba_vs_photo.png
         (drafts/_palette.png and drafts/_mock.png are review aids)
Steps  : cut sheets into items (XY-cut on empty gaps, items assigned to grid cells)
         -> premultiplied box downscale -> darken edge pixels toward the outline colour
         -> one shared palette (<= 32 colours, no dither) for every asset
         -> alpha thresholded to 0/255.
Technique adapted from booker-run/art/scripts/build_assets.py.
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw

ART = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ART, "out")
os.makedirs(OUT, exist_ok=True)


def D(n):
    return os.path.join(ART, "drafts", n)


# Final source drafts (one per batch).
SRC = {
    "soba": "sheet_med.png",        # 12 poses, 3 rows x 4 cols
    "plat": "plat_med.png",         # 5 bars (left column) + 2 springs (right column)
    "props": "props_med.png",       # 3 x 3 grid of props
    "wall": "wall_low2.png",        # opaque facade, 2 bays x 3 storeys, repeats both ways
    "skyline": "skyline_low.png",   # transparent, bottom aligned
    "streetroof": "streetroof_low.png",  # roof strip (top) + street strip (bottom)
    "title": "title_1k.png",        # gemini, flat green background (keyed out)
}

N_COLORS = 32
OUTLINE = (26, 18, 32)  # #1a1220


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


def grid_items(im, cols, rows, min_area=60, gap=3):
    """Cut a sheet laid out as a cols x rows grid. Every chunk found by XY-cut is
    assigned to the grid cell holding its centre; chunks in one cell are merged."""
    im = clean_alpha(im, 100)
    m = np.array(im)[:, :, 3] > 0
    W, H = im.size
    cells = {}
    for b in xycut(m, gap=gap):
        if m[b[1]:b[3], b[0]:b[2]].sum() < min_area:
            continue
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        key = (int(cy * rows // H), int(cx * cols // W))
        if key in cells:
            o = cells[key]
            cells[key] = (min(o[0], b[0]), min(o[1], b[1]), max(o[2], b[2]), max(o[3], b[3]))
        else:
            cells[key] = b
    out = []
    for r in range(rows):
        for c in range(cols):
            if (r, c) in cells:
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


def key_out(im, bg_rgb, thresh=60):
    """Flood-fill a flat background colour from the borders to transparent."""
    im = im.convert("RGBA")
    a = np.array(im).astype(np.int32)
    d = np.abs(a[:, :, :3] - np.array(bg_rgb)).sum(2)
    near = d < thresh
    # connected to border
    H, W = near.shape
    seen = np.zeros_like(near)
    stack = [(y, x) for y in range(H) for x in (0, W - 1) if near[y, x]]
    stack += [(y, x) for x in range(W) for y in (0, H - 1) if near[y, x]]
    while stack:
        y, x = stack.pop()
        if seen[y, x] or not near[y, x]:
            continue
        seen[y, x] = True
        if y > 0: stack.append((y - 1, x))
        if y < H - 1: stack.append((y + 1, x))
        if x > 0: stack.append((y, x - 1))
        if x < W - 1: stack.append((y, x + 1))
    out = np.array(im)
    out[seen] = 0
    return Image.fromarray(out, "RGBA")


# ============================================================== Soba
FW = FH = 40
IDLE_H = 32  # idle frame height in px; every other pose uses the same scale
soba_src = grid_items(rgba(D(SRC["soba"])), 4, 3)
assert len(soba_src) == 12, len(soba_src)
# sheet order (row-major) -> poses
POSES = ["idle0", "idle1", "crouch", "rise", "apex", "fall0", "fall1", "steer",
         "hurt", "celebrate0", "celebrate1", "sit"]
s_soba = IDLE_H / soba_src[0].height
s_soba = min([s_soba] + [min((FW - 1) / f.width, (FH - 1) / f.height) for f in soba_src])


GLINT = (250, 246, 236)


def eye_glints(src):
    """Centres of the tiny pure-white eye-shine blobs in a source frame. They vanish in a
    9x box downscale, so they are re-painted as single pixels afterwards. A blob counts
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


def soba_frame(src):
    w, h = max(1, round(src.width * s_soba)), max(1, round(src.height * s_soba))
    sm = outline_inner(down(src, (w, h)), 0.85).copy()
    px_ = sm.load()
    for gx, gy in eye_glints(src):
        ox, oy = int(gx * w / src.width), int(gy * h / src.height)
        if px_[ox, oy][3]:
            px_[ox, oy] = GLINT + (255,)
    a = np.array(sm)[:, :, 3] > 0
    cx = np.nonzero(a)[1].mean()
    x = int(round(FW / 2 - cx))
    x = max(0, min(FW - w, x))
    cell = Image.new("RGBA", (FW, FH))
    cell.alpha_composite(sm, (x, FH - h))  # feet on the bottom row
    return cell


soba_frames = [soba_frame(f) for f in soba_src]
soba_sheet = Image.new("RGBA", (FW * len(soba_frames), FH))
for i, f in enumerate(soba_frames):
    soba_sheet.alpha_composite(f, (i * FW, 0))

# ============================================================== platforms + springs
plat_im = clean_alpha(rgba(D(SRC["plat"])), 100)
pm = np.array(plat_im)[:, :, 3] > 0
colsegs = segments(pm.any(0), 20, 60)
assert len(colsegs) == 2, colsegs
(lx0, lx1), (rx0, rx1) = colsegs


def column_rows(x0, x1, gap=15):
    sub = pm[:, x0:x1]
    out = []
    for y0, y1 in segments(sub.any(1), 20, gap):
        piece = plat_im.crop((x0, y0, x1, y1))
        out.append(piece.crop(piece.getbbox()))
    return out


bars = column_rows(lx0, lx1)
springs = column_rows(rx0, rx1)
assert len(bars) == 5 and len(springs) == 2, (len(bars), len(springs))
CAP, PH = 8, 12
# downscaled width per bar: chosen so the end details (caps, bands, rings) land in the 8 px caps
BAR_W = {"plat-beam": 40, "plat-slider": 40, "plat-crumble": 40, "plat-crumble-cracked": 40,
         "plat-lift": 40}
BAR_KEYS = ["plat-beam", "plat-slider", "plat-crumble", "plat-crumble-cracked", "plat-lift"]


# where (fraction of the bar width) the middle tile is taken from
MID_AT = {"plat-beam": 0.5, "plat-slider": 0.5, "plat-crumble": 0.78,
          "plat-crumble-cracked": 0.5, "plat-lift": 0.5}


def seamless_middle(strip, at=0.5, k=3):
    """8 px middle tile from a downscaled bar: take 8+k columns around `at` and
    crossfade the overflow into the first k columns so col 7 -> col 0 joins cleanly."""
    a = np.array(strip).astype(np.float32)
    W = a.shape[1]
    x0 = int(W * at) - (CAP + k) // 2
    win = a[:, x0:x0 + CAP + k].copy()
    out = win[:, :CAP].copy()
    for x in range(k):
        t = (x + 0.5) / k
        out[:, x] = win[:, CAP + x] * (1 - t) + win[:, x] * t
    out[:, :, 3] = np.where(out[:, :, 3] >= 128, 255, 0)
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def body_rows(src, frac=0.8):
    """Crop away thin things sticking out above a bar (the lift's rings): keep from the
    first row whose opaque width is >= frac of the bar width."""
    a = np.array(src)[:, :, 3] > 0
    full = np.nonzero(a.sum(1) >= frac * src.width)[0]
    return src.crop((0, full[0], src.width, src.height))


# 5x4 gold eye-bolt ring painted onto the lift's caps (the generated rings read as spikes
# at 12 px). O = outline, L/G = gold light/mid, . = keep the block pixel underneath.
RING = ["OOOOO",
        "OLGGO",
        "OGOGO",
        "OGOGO"]
RING_C = {"O": OUTLINE, "L": (252, 214, 110), "G": (232, 160, 40)}


def paint(im, grid, colors, x0, y0):
    px_ = im.load()  # caller passes a writable image (crop/copy/new)
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            if ch in colors:
                px_[x0 + x, y0 + y] = tuple(colors[ch]) + (255,)


plat = {}
for key, src in zip(BAR_KEYS, bars):
    if key == "plat-lift":
        src = body_rows(src)
    strip = outline_inner(down(src, (BAR_W[key], PH)), 0.6)
    left = strip.crop((0, 0, CAP, PH)).copy()
    right = strip.crop((strip.width - CAP, 0, strip.width, PH)).copy()
    mid = seamless_middle(strip, MID_AT[key])
    if key == "plat-lift":
        paint(left, RING, RING_C, 2, 0)
        paint(right, RING, RING_C, 1, 0)
    sheet = Image.new("RGBA", (CAP * 3, PH))
    for i, piece in enumerate([left, mid, right]):
        sheet.alpha_composite(piece, (i * CAP, 0))
    plat[key] = sheet

# spring: 2 frames of 16x10, compressed then extended, same horizontal scale, bottom aligned
SW_, SH_ = 16, 10
spring_frames = []
sx = (SW_ - 1) / max(s.width for s in springs)
sy = (SH_) / max(s.height for s in springs)
for s in springs:
    w = max(1, round(s.width * sx))
    h = max(1, min(SH_, round(s.height * sy)))
    sm = outline_inner(down(s, (w, h)), 0.6)
    cell = Image.new("RGBA", (SW_, SH_))
    cell.alpha_composite(sm, ((SW_ - w) // 2, SH_ - h))
    spring_frames.append(cell)
spring_sheet = Image.new("RGBA", (SW_ * 2, SH_))
for i, f in enumerate(spring_frames):
    spring_sheet.alpha_composite(f, (i * SW_, 0))

# ============================================================== props
props = grid_items(rgba(D(SRC["props"])), 3, 3)
assert len(props) == 9, len(props)
crow_up, crow_down, tile_src, chimes_src, treat_src, bell_src, cushion_src, flag_src, paw_src = props

# crow: both frames share one scale; align on the centre of mass
CW, CH = 24, 16
s_crow = min(min(CW / c.width, CH / c.height) for c in (crow_up, crow_down))
crow_frames = []
for c in (crow_up, crow_down):
    w, h = max(1, round(c.width * s_crow)), max(1, round(c.height * s_crow))
    sm = outline_inner(down(c, (w, h)), 0.5)
    a = np.array(sm)[:, :, 3] > 0
    ys, xs = np.nonzero(a)
    x = max(0, min(CW - w, int(round(CW / 2 - xs.mean()))))
    y = max(0, min(CH - h, int(round(CH / 2 - ys.mean()))))
    cell = Image.new("RGBA", (CW, CH))
    cell.alpha_composite(sm, (x, y))
    crow_frames.append(cell)
crow_sheet = Image.new("RGBA", (CW * 2, CH))
for i, f in enumerate(crow_frames):
    crow_sheet.alpha_composite(f, (i * CW, 0))

# The paw icon and the treat are hand-pixelled: at 10-12 px the generated art turns
# into a blob. Colours are snapped to the shared palette like everything else.
PAW = ["..OO..OO..",
       ".OCCOOCCO.",
       "OOCCOOCCOO",
       "OCOO..OOCO",
       "OCOOOOOOCO",
       "OOOCCCCOOO",
       ".OCCCCCCO.",
       ".OCCPPCCO.",
       ".OCCPPCCO.",
       "..OOOOOO.."]
PAW_C = {"O": OUTLINE, "C": (244, 234, 216), "P": (232, 130, 142)}
paw_im = Image.new("RGBA", (10, 10))
paint(paw_im, PAW, PAW_C, 0, 0)

# Treat: a chunky bone mask; edge pixels -> outline, inner pixels lit from the top-left.
TREAT = ["............",
         ".##......##.",
         "####....####",
         "############",
         ".##########.",
         ".##########.",
         ".##########.",
         "############",
         "####....####",
         ".##......##.",
         "............",
         "............"]


def shade_mask(grid, base, light, dark):
    m = np.array([[c == "#" for c in r] for r in grid])
    H, W = m.shape
    pad = np.pad(m, 1)
    edge = m & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    out = np.zeros((H, W, 4), np.uint8)
    out[m] = tuple(base) + (255,)
    for y in range(H):
        for x in range(W):
            if m[y, x] and not edge[y, x]:
                if (y > 0 and edge[y - 1, x]) or (x > 0 and edge[y, x - 1]):
                    out[y, x, :3] = light
                elif (y < H - 1 and edge[y + 1, x]) or (x < W - 1 and edge[y, x + 1]):
                    out[y, x, :3] = dark
    out[edge] = tuple(OUTLINE) + (255,)
    return Image.fromarray(out, "RGBA")


treat_im = shade_mask(TREAT, (246, 178, 52), (255, 226, 140), (196, 112, 36))

items = {
    "roof-tile": fit(tile_src, (14, 10), align="center"),
    "chimes": fit(chimes_src, (16, 24), align="top", outline=0.5),
    "treat": treat_im,
    "bell": fit(bell_src, (48, 48)),
    "cushion": fit(cushion_src, (40, 12), stretch=True),
    "best-flag": fit(flag_src, (16, 24), stretch=True),
    "paw": paw_im,
}

# ============================================================== wall (opaque, tiles both ways)
def period(a, axis, lo, hi):
    """Best repeat period (px) along an axis, by mean abs difference of shifted copies."""
    best, bp = None, lo
    for p in range(lo, hi):
        if axis == 0:
            d = np.abs(a[p:] - a[:-p]).mean()
        else:
            d = np.abs(a[:, p:] - a[:, :-p]).mean()
        if best is None or d < best:
            best, bp = d, p
    return bp


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


wall_src = Image.open(D(SRC["wall"])).convert("RGB")
wa = np.array(wall_src.resize((wall_src.width // 2, wall_src.height // 2), Image.BOX)).astype(np.float32)
py = period(wa, 0, 120, 240) * 2   # one storey (source px)
px = period(wa, 1, 180, 300) * 2   # one window bay (source px)
ny = max(1, round(wall_src.height / py))  # storeys in the 192 tile
nx = max(1, round(wall_src.width / px))   # bays in the 192 tile
WT = 192
assert WT % nx == 0 and WT % ny == 0, (nx, ny)
cw, ch = WT // nx, WT // ny  # one bay x one storey, at final size
KF = 3  # crossfade px at final size
# Take ONE interior cell (half a period in from the image edges, so the model's own
# border never enters the tile), plus a KF-px overflow, scale it, crossfade the overflow
# into the start on both axes, then repeat the seamless cell nx x ny times.
x0, y0 = px // 2, py // 2
ox, oy = int(np.ceil(px * KF / cw)), int(np.ceil(py * KF / ch))
assert x0 + px + ox <= wall_src.width and y0 + py + oy <= wall_src.height
cell = wall_src.crop((x0, y0, x0 + px + ox, y0 + py + oy))
cell = np.array(cell.resize((cw + KF, ch + KF), Image.BOX)).astype(np.float32)
cell = wrap_fade(wrap_fade(cell, KF, 0), KF, 1)
WALL_LIFT = (0.85, 28)  # background grade: compress toward mid-tone so black Soba reads on it
cell = np.clip(cell * WALL_LIFT[0] + WALL_LIFT[1], 0, 255)
wall = Image.fromarray(np.tile(cell, (ny, nx, 1)).astype(np.uint8), "RGB").convert("RGBA")

# ============================================================== skyline / street / roof
sky_src = clean_alpha(rgba(D(SRC["skyline"])), 100)
sky_src = sky_src.crop((0, sky_src.getbbox()[1], sky_src.width, sky_src.height))
skw, skh = 270, 160
sh = min(skh, round(sky_src.height * skw / sky_src.width))
skyline = Image.new("RGBA", (skw, skh))
skyline.alpha_composite(down(sky_src, (skw, sh)), (0, skh - sh))

sr = clean_alpha(rgba(D(SRC["streetroof"])), 100)
srm = np.array(sr)[:, :, 3] > 0
strips = segments(srm.any(1), 30, 40)
assert len(strips) == 2, strips
roof_src = sr.crop((0, strips[0][0], sr.width, strips[0][1]))
street_src = sr.crop((0, strips[1][0], sr.width, strips[1][1]))
roof_src = roof_src.crop(roof_src.getbbox())
street_src = street_src.crop(street_src.getbbox())


def strip_to(src, W, H, max_stretch=1.25):
    """Scale a strip to width W. If it would be shorter than H, bottom-align it on a
    transparent canvas; if taller, squash vertically up to max_stretch, then crop the top."""
    h_nat = src.height * W / src.width
    h = round(min(H * 1.0, h_nat) if h_nat <= H else max(H, h_nat / max_stretch))
    sm = outline_inner(down(src, (W, h)), 0.5)
    if h > H:
        sm = sm.crop((0, h - H, W, h))
        h = H
    out = Image.new("RGBA", (W, H))
    out.alpha_composite(sm, (0, H - h))
    return out


roof = strip_to(roof_src, 270, 64)
street = strip_to(street_src, 270, 48)

# ============================================================== title (gemini, keyed)
t = np.array(rgba(D(SRC["title"]))).astype(np.int32)
bg = t[2, 2, :3]
# key the flat green everywhere (letter counters too), then remove green spill on edges
green = (np.abs(t[:, :, :3] - bg).sum(2) < 160) | ((t[:, :, 1] > 150) & (t[:, :, 0] < 120) & (t[:, :, 2] < 120))
t[green] = 0
spill = t[:, :, 1] > np.maximum(t[:, :, 0], t[:, :, 2])
t[:, :, 1] = np.where(spill, np.maximum(t[:, :, 0], t[:, :, 2]), t[:, :, 1])
t = clean_alpha(Image.fromarray(t.astype(np.uint8), "RGBA"), 128)
t = t.crop(t.getbbox())
title = fit(t, (240, 100), align="center", outline=0.0)

# ============================================================== shared palette
named = {"soba": soba_sheet, **plat, "spring": spring_sheet, "crow": crow_sheet, **items,
         "wall": wall, "skyline": skyline, "street": street, "roof": roof, "title": title}
# share of the palette sample each asset gets (importance, not area)
share = {"soba": 26, "plat-beam": 4, "plat-slider": 3, "plat-crumble": 3,
         "plat-crumble-cracked": 2, "plat-lift": 3, "spring": 2, "crow": 3, "roof-tile": 2,
         "chimes": 2, "treat": 3, "bell": 3, "cushion": 2, "best-flag": 2, "paw": 2,
         "wall": 14, "skyline": 8, "street": 8, "roof": 5, "title": 6}
# Anchor colours: small but important features that a population-based median cut
# merges away (tongue/ear pink, lantern red, eye glint, gold, steel, teal, window glow,
# dusk violet). The remaining slots come from a median cut of a sample in which very dark
# pixels are down-weighted (black fur + outlines otherwise eat a third of the palette).
ANCHORS = [OUTLINE, (250, 246, 236), (232, 130, 142), (200, 40, 44), (248, 184, 48),
           (176, 184, 196), (58, 122, 128), (240, 176, 96), (106, 80, 112)]
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
    n_auto, method=Image.Quantize.MEDIANCUT, kmeans=3)
auto = np.array(pal_img.getpalette()[: n_auto * 3]).reshape(-1, 3)
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
    q = im.convert("RGB").quantize(palette=pal_ref, dither=Image.Dither.NONE).convert("RGB")
    out = np.concatenate([np.array(q), a[:, :, 3:4]], 2)
    out[out[:, :, 3] == 0] = 0
    return Image.fromarray(out, "RGBA")


final = {k: apply_palette(v) for k, v in named.items()}
final["wall"] = final["wall"].convert("RGB")
for k, im in final.items():
    im.save(os.path.join(OUT, f"{k}.png"), optimize=True)
sw = Image.new("RGB", (len(pal) // 3, 1))
sw.putdata([tuple(pal[i:i + 3]) for i in range(0, len(pal), 3)])
sw.resize((len(pal) // 3 * 16, 16), Image.NEAREST).save(os.path.join(ART, "drafts", "_palette.png"))

# ============================================================== manifest
manifest = {
    "soba": {"file": "soba.png", "frameWidth": FW, "frameHeight": FH, "frames": len(soba_frames),
             "animations": {"idle": [0, 1], "crouch": [2], "rise": [3], "apex": [4],
                            "fall": [5, 6], "steer": [7], "hurt": [8], "celebrate": [9, 10],
                            "sit": [11]}},
}
for k in BAR_KEYS:
    manifest[k] = {"file": f"{k}.png", "frameWidth": CAP, "frameHeight": PH, "frames": 3,
                   "animations": {"left": [0], "middle": [1], "right": [2]}}
manifest["spring"] = {"file": "spring.png", "frameWidth": SW_, "frameHeight": SH_, "frames": 2,
                      "animations": {"compressed": [0], "extended": [1]}}
manifest["crow"] = {"file": "crow.png", "frameWidth": CW, "frameHeight": CH, "frames": 2,
                    "animations": {"fly": [0, 1]}}
for k in ["roof-tile", "chimes", "treat", "bell", "cushion", "best-flag", "paw", "wall",
          "skyline", "street", "roof", "title"]:
    im = final[k]
    manifest[k] = {"file": f"{k}.png", "width": im.width, "height": im.height}
json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=2)

# ============================================================== preview
GRAY = (128, 128, 128, 255)
Z = 4
PAD = 16


def z(im, f=Z):
    im = im.convert("RGBA")
    return im.resize((im.width * f, im.height * f), Image.NEAREST)


def compose_platform(sheet, width):
    out = Image.new("RGBA", (width, PH))
    out.alpha_composite(sheet.crop((0, 0, CAP, PH)), (0, 0))
    for x in range(CAP, width - CAP, CAP):
        out.alpha_composite(sheet.crop((CAP, 0, 2 * CAP, PH)), (x, 0))
    out.alpha_composite(sheet.crop((2 * CAP, 0, 3 * CAP, PH)), (width - CAP, 0))
    return out


def sky_gradient(W, H, top, bottom):
    g = np.zeros((H, W, 4), np.uint8)
    for y in range(H):
        t = y / max(1, H - 1)
        g[y, :, :3] = [int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)]
        g[y, :, 3] = 255
    return Image.fromarray(g, "RGBA")


blocks = []  # list of images stacked vertically
# row: soba frames
blocks.append(z(final["soba"]))
# row: platforms at 32 / 48 / 64 + raw sheets
prow = []
for k in BAR_KEYS:
    col = Image.new("RGBA", (64 + 4 + 64 + 4 + 48 + 4 + 32, PH), (0, 0, 0, 0))
    x = 0
    col.alpha_composite(final[k], (x, 0)); x += 24 + 8
    for w in (32, 48, 64):
        col.alpha_composite(compose_platform(final[k], w), (x, 0)); x += w + 6
    prow.append(col.crop((0, 0, x, PH)))
pw = max(p.width for p in prow)
pblock = Image.new("RGBA", (pw, len(prow) * (PH + 6)))
for i, p in enumerate(prow):
    pblock.alpha_composite(p, (0, i * (PH + 6)))
blocks.append(z(pblock))
# row: springs, crow, small props
small = [final["spring"], final["crow"], final["roof-tile"], final["chimes"], final["treat"],
         final["bell"], final["cushion"], final["best-flag"], final["paw"]]
sw_ = sum(i.width + 6 for i in small)
sb = Image.new("RGBA", (sw_, max(i.height for i in small)))
x = 0
for i in small:
    sb.alpha_composite(i, (x, sb.height - i.height)); x += i.width + 6
blocks.append(z(sb))
# row: wall 2x3 tiled (vertical + horizontal seams), skyline, street, roof
wt = Image.new("RGBA", (WT * 2, WT * 3))
for j in range(3):
    for i in range(2):
        wt.alpha_composite(final["wall"].convert("RGBA"), (i * WT, j * WT))
blocks.append(z(wt, 2))
bg_row = Image.new("RGBA", (270, 160 + 6 + 48 + 6 + 64 + 6 + 100))
y = 0
for k in ["skyline", "street", "roof", "title"]:
    bg_row.alpha_composite(final[k], (0, y)); y += final[k].height + 6
blocks.append(z(bg_row, 3))

# mock screens: street level at dusk, and the summit at night (270x480 each, shown at 2x)
def mock(bottom_sky, top_sky, base, night):
    sc = sky_gradient(270, 480, top_sky, bottom_sky)
    sc.alpha_composite(final["skyline"], (0, 480 - 160 - (48 if base else 0) + (0 if base else 40)))
    # tower column 192 wide, centred
    for yy in range(-192, 480, 192):
        sc.alpha_composite(final["wall"].convert("RGBA"), (39, yy))
    if base:
        sc.alpha_composite(final["street"], (0, 480 - 48))
        pl = [("plat-beam", 64, 40, 380), ("plat-slider", 48, 150, 320), ("plat-crumble", 48, 30, 260),
              ("plat-crumble-cracked", 48, 170, 200), ("plat-lift", 48, 90, 140), ("plat-beam", 56, 150, 80)]
        for k, w, xx, yy in pl:
            sc.alpha_composite(compose_platform(final[k], w), (xx, yy))
        sc.alpha_composite(final["soba"].crop((0, 0, 40, 40)), (50, 380 - 40))
        sc.alpha_composite(final["soba"].crop((7 * 40, 0, 8 * 40, 40)), (120, 250))
        sc.alpha_composite(final["treat"], (110, 300))
        sc.alpha_composite(final["spring"].crop((16, 0, 32, 10)), (170, 70))
        sc.alpha_composite(final["paw"], (6, 6)); sc.alpha_composite(final["paw"], (18, 6))
        sc.alpha_composite(final["paw"], (30, 6))
        sc.alpha_composite(final["best-flag"], (200, 176))
    else:
        sc.alpha_composite(final["roof"], (0, 200))
        sc.alpha_composite(final["bell"], (111, 200 + 64 - 48 - 8))
        sc.alpha_composite(final["soba"].crop((9 * 40, 0, 10 * 40, 40)), (60, 200 + 64 - 40 - 10))
        sc.alpha_composite(final["crow"].crop((0, 0, 24, 16)), (40, 330))
        sc.alpha_composite(final["chimes"], (200, 300))
        sc.alpha_composite(final["roof-tile"], (150, 360))
        sc.alpha_composite(final["cushion"], (100, 420))
        sc.alpha_composite(final["soba"].crop((4 * 40, 0, 5 * 40, 40)), (100, 380))
        sc.alpha_composite(compose_platform(final["plat-lift"], 40), (30, 440))
    return sc


m1 = mock((250, 170, 120), (205, 120, 140), True, False)
m2 = mock((70, 60, 110), (20, 24, 50), False, True)
mm = Image.new("RGBA", (270 * 2 + 10, 480))
mm.alpha_composite(m1, (0, 0)); mm.alpha_composite(m2, (280, 0))
blocks.append(z(mm, 2))

Wp = max(b.width for b in blocks) + 2 * PAD
Hp = sum(b.height + PAD for b in blocks) + PAD
cv = Image.new("RGBA", (Wp, Hp), GRAY)
y = PAD
for b in blocks:
    cv.alpha_composite(b, (PAD, y)); y += b.height + PAD
cv.convert("RGB").save(os.path.join(OUT, "preview.png"))
mm.convert("RGB").save(os.path.join(ART, "drafts", "_mock.png"))

# ============================================================== likeness check
photo = Image.open(os.path.join(ART, "raw", "soba_ref_fullbody.png")).convert("RGB")
ph_small = photo.resize((round(photo.width * 40 / photo.height), 40), Image.BOX)
P8 = 8
idle = z(final["soba"].crop((0, 0, FW, FH)), P8)
sit = z(final["soba"].crop((11 * FW, 0, 12 * FW, FH)), P8)
ph_px = ph_small.resize((ph_small.width * P8, 40 * P8), Image.NEAREST).convert("RGBA")
ph_big = photo.resize((round(photo.width * 320 / photo.height), 320), Image.LANCZOS).convert("RGBA")
cmp_w = idle.width + sit.width + ph_px.width + ph_big.width + 5 * PAD
cmp = Image.new("RGBA", (cmp_w, 320 + 2 * PAD), GRAY)
x = PAD
for im in (idle, sit, ph_px, ph_big):
    cmp.alpha_composite(im, (x, PAD)); x += im.width + PAD
cmp.convert("RGB").save(os.path.join(OUT, "soba_vs_photo.png"))

print("soba scale", round(s_soba, 4), "wall periods", px, py, "x", nx, ny)
for k, im in final.items():
    a = np.array(im.convert("RGBA"))
    n = len(np.unique(a[a[:, :, 3] > 0][:, :3], axis=0))
    print(f"{k:22s} {im.size} {im.mode} colours={n}")
