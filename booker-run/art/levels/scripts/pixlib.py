"""Shared pixel-art helpers for Levels 2-6 art (agent A).

Same steps as the Level 1 pipeline in art/scripts/build_assets.py (copied here because
importing that file would rebuild and overwrite the Level 1 assets):
cut by empty gaps -> premultiplied box downscale -> inner dark outline ->
palette snap (no dither) -> hard alpha 0/255 -> seamless wrap for tiling layers.
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.abspath(os.path.join(HERE, "..", ".."))           # booker-run/art
ROOT = os.path.abspath(os.path.join(ART, ".."))                   # booker-run
OUT = os.path.join(ROOT, "public", "assets")
LV = os.path.join(ART, "levels")
D = lambda n: os.path.join(LV, "drafts", n)
OUTLINE = (34, 18, 22)


def rgba(path):
    return Image.open(path).convert("RGBA")


def segments(mask1d, min_len=4, max_gap=0):
    """Runs of True; runs separated by <= max_gap False cells are merged."""
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
        if merged and s[0] - merged[-1][1] <= max_gap:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    return [tuple(s) for s in merged if s[1] - s[0] >= min_len]


def clean_alpha(im, thr=128):
    a = np.array(im)
    on = a[:, :, 3] >= thr
    a[:, :, 3] = np.where(on, 255, 0)
    a[~on] = 0
    return Image.fromarray(a, "RGBA")


def split_grid(im, thr=100, min_len=20, max_gap=0, row_gap=0):
    """Rows by empty horizontal bands, then pieces by empty vertical bands. Returns list of rows."""
    im = clean_alpha(im, thr)
    a = np.array(im)[:, :, 3] > 0
    rows = []
    for y0, y1 in segments(a.any(1), min_len, row_gap):
        r = im.crop((0, y0, im.width, y1))
        ra = np.array(r)[:, :, 3] > 0
        pieces = []
        for x0, x1 in segments(ra.any(0), min_len, max_gap):
            p = r.crop((x0, 0, x1, r.height))
            pieces.append(p.crop(p.getbbox()))
        rows.append(pieces)
    return rows


def down(im, size):
    """Premultiplied box downscale; hard edges come back from palette + alpha threshold."""
    a = np.array(im).astype(np.float32)
    al = a[:, :, 3:4] / 255.0
    pre = np.concatenate([a[:, :, :3] * al, a[:, :, 3:4]], 2).astype(np.uint8)
    small = np.array(Image.fromarray(pre, "RGBA").resize(size, Image.BOX)).astype(np.float32)
    al2 = np.maximum(small[:, :, 3:4] / 255.0, 1e-6)
    rgb = np.clip(small[:, :, :3] / al2, 0, 255)
    return clean_alpha(Image.fromarray(np.concatenate([rgb, small[:, :, 3:4]], 2).astype(np.uint8), "RGBA"))


def outline_inner(im, strength=1.0):
    a = np.array(im).astype(np.int32)
    op = a[:, :, 3] > 0
    pad = np.pad(op, 1)
    edge = op & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    for c in range(3):
        ch = a[:, :, c]
        ch[edge] = (ch[edge] * (1 - strength) + OUTLINE[c] * strength).astype(np.int32)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def best_cut(im, min_frac=0.85, band=4):
    a = np.array(im.resize((im.width // 2, im.height // 2), Image.BOX)).astype(np.float32)
    a[:, :, :3] *= a[:, :, 3:4] / 255.0
    W0 = a.shape[1]
    head = a[:, :band]
    best, bw = None, W0
    for wc in range(int(W0 * min_frac), W0 - band):
        d = np.abs(a[:, wc:wc + band] - head).mean()
        if best is None or d < best:
            best, bw = d, wc
    return im.crop((0, 0, bw * 2, im.height))


def wrap_seamless(im, w, h, k, cut=True):
    """Level 1 edge fix: crop at best-matching wrap column, resize to (w+k, h),
    crossfade the first k columns with the overflow so column w-1 -> column 0 is seamless."""
    if cut:
        im = best_cut(im)
    big = np.array(im.resize((w + k, h), Image.BOX)).astype(np.float32)
    out = big[:, :w].copy()
    for x in range(k):
        t = (x + 0.5) / k
        out[:, x] = big[:, w + x] * (1 - t) + big[:, x] * t
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def wrap_seamless_v(im, k):
    """Vertical version of the crossfade for tiles that wrap both ways (same size in/out)."""
    a = np.array(im.convert("RGBA")).astype(np.float32)
    h = a.shape[0]
    big = np.array(im.convert("RGBA").resize((im.width, h + k), Image.BOX)).astype(np.float32)
    out = big[:h].copy()
    for y in range(k):
        t = (y + 0.5) / k
        out[y] = big[h + y] * (1 - t) + big[y] * t
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def make_palette(images_weights, n_colors, keep=()):
    """Median-cut palette from opaque pixels of (image, weight) pairs, plus fixed colours."""
    samples = []
    for im, w in images_weights:
        a = np.array(im.convert("RGBA"))
        px = a[a[:, :, 3] > 0][:, :3]
        if len(px):
            samples.append(np.repeat(px, w, axis=0))
    px = np.concatenate(samples)
    if len(px) > 4_000_000:
        px = px[np.random.default_rng(0).choice(len(px), 4_000_000, replace=False)]
    side = int(np.ceil(np.sqrt(len(px))))
    buf = np.zeros((side * side, 3), np.uint8)
    buf[: len(px)] = px
    rest = side * side - len(px)
    buf[len(px):] = px[:rest] if rest <= len(px) else 0
    n = n_colors - len(keep)
    q = Image.fromarray(buf.reshape(side, side, 3), "RGB").quantize(n, method=Image.Quantize.MEDIANCUT, kmeans=3)
    pal = q.getpalette()[: n * 3]
    for c in keep:
        pal += list(c)
    return pal


def palette_from_image(im):
    a = np.array(im.convert("RGBA"))
    px = a[a[:, :, 3] > 0][:, :3]
    u = np.unique(px.reshape(-1, 3), axis=0)
    return [int(v) for c in u for v in c]


def apply_palette(im, pal):
    pal_ref = Image.new("P", (1, 1))
    pal_ref.putpalette(pal + pal[-3:] * ((768 - len(pal)) // 3))  # pad with a real colour, not black
    a = np.array(im.convert("RGBA"))
    q = im.convert("RGB").quantize(palette=pal_ref, dither=Image.Dither.NONE).convert("RGB")
    out = np.concatenate([np.array(q), a[:, :, 3:4]], 2)
    out[out[:, :, 3] == 0] = 0
    return Image.fromarray(out, "RGBA")


def n_colors(im):
    a = np.array(im.convert("RGBA"))
    px = a[a[:, :, 3] > 0][:, :3]
    return len(np.unique(px.reshape(-1, 3), axis=0))


def fit(src, size, stretch=False, outline=0.6, align="bottom"):
    W, H = size
    if stretch:
        w, h = W, H
    else:
        s = min(W / src.width, H / src.height)
        w, h = max(1, round(src.width * s)), max(1, round(src.height * s))
    sm = down(src, (w, h))
    if outline:
        sm = outline_inner(sm, outline)
    out = Image.new("RGBA", size)
    y = H - h if align == "bottom" else (H - h) // 2
    out.alpha_composite(sm, ((W - w) // 2, y))
    return out


def on_bg(im, color=(128, 128, 128, 255)):
    bg = Image.new("RGBA", im.size, color)
    bg.alpha_composite(im.convert("RGBA"))
    return bg


def zoom(im, z):
    return im.resize((im.width * z, im.height * z), Image.NEAREST)
