"""Agent B shared pixel pipeline (Levels 4-6).

Same steps as art/scripts/build_assets.py (Level 1), copied here because that
script rebuilds Level 1 on import:
  box downscale (premultiplied) -> crossfade wrap seams -> per-level 32-colour
  palette (no dither) -> alpha thresholded to 0/255 -> bold dark inner outline.
"""
import os
import numpy as np
from PIL import Image

LEVELS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # art/levels
ART = os.path.dirname(LEVELS)
ROOT = os.path.dirname(ART)  # booker-run
OUT = os.path.join(ROOT, "public", "assets")
RAW = lambda n: os.path.join(LEVELS, "raw", n)
DRAFT = lambda n: os.path.join(LEVELS, "drafts", n)

N_COLORS = 32
OUTLINE = (34, 18, 22)  # same outline colour as Level 1
W, H = 480, 270


def rgba(path):
    return Image.open(path).convert("RGBA")


def segments(mask1d, min_len=4):
    segs, start = [], None
    for i, v in enumerate(mask1d):
        if v and start is None:
            start = i
        if not v and start is not None:
            if i - start >= min_len:
                segs.append((start, i))
            start = None
    if start is not None and len(mask1d) - start >= min_len:
        segs.append((start, len(mask1d)))
    return segs


def clean_alpha(im, thr=128):
    a = np.array(im)
    on = a[:, :, 3] >= thr
    a[:, :, 3] = np.where(on, 255, 0)
    a[~on] = 0
    return Image.fromarray(a, "RGBA")


def split_row(im, min_gap=20):
    im = clean_alpha(im, 100)
    a = np.array(im)[:, :, 3] > 0
    out = []
    for x0, x1 in segments(a.any(0), min_gap):
        piece = im.crop((x0, 0, x1, im.height))
        out.append(piece.crop(piece.getbbox()))
    return out


def split_grid(im, min_gap=20):
    """Rows separated by empty rows, then pieces separated by empty columns."""
    im = clean_alpha(im, 100)
    a = np.array(im)[:, :, 3] > 0
    out = []
    for y0, y1 in segments(a.any(1), min_gap):
        out += split_row(im.crop((0, y0, im.width, y1)), min_gap)
    return out


def down(im, size):
    a = np.array(im).astype(np.float32)
    al = a[:, :, 3:4] / 255.0
    pre = np.concatenate([a[:, :, :3] * al, a[:, :, 3:4]], 2).astype(np.uint8)
    small = np.array(Image.fromarray(pre, "RGBA").resize(size, Image.BOX)).astype(np.float32)
    al2 = np.maximum(small[:, :, 3:4] / 255.0, 1e-6)
    rgb = np.clip(small[:, :, :3] / al2, 0, 255)
    return clean_alpha(Image.fromarray(np.concatenate([rgb, small[:, :, 3:4]], 2).astype(np.uint8), "RGBA"))


def outline_inner(im, strength=1.0, wrap_x=False):
    """wrap_x: treat the left/right borders as wrapping (horizontal tiles)."""
    a = np.array(im).astype(np.int32)
    op = a[:, :, 3] > 0
    pad = np.pad(op, 1)
    if wrap_x:
        pad[1:-1, 0] = op[:, -1]
        pad[1:-1, -1] = op[:, 0]
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
    if cut:
        im = best_cut(im)
    big = np.array(im.resize((w + k, h), Image.BOX)).astype(np.float32)
    out = big[:, :w].copy()
    for x in range(k):
        t = (x + 0.5) / k
        out[:, x] = big[:, w + x] * (1 - t) + big[:, x] * t
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def wrap_xy(im, w, h, k):
    """Seamless both ways: crossfade columns, then rows."""
    big = np.array(im.convert("RGBA").resize((w + k, h + k), Image.BOX)).astype(np.float32)
    out = big[:, :w].copy()
    for x in range(k):
        t = (x + 0.5) / k
        out[:, x] = big[:, w + x] * (1 - t) + big[:, x] * t
    o2 = out[:h].copy()
    for y in range(k):
        t = (y + 0.5) / k
        o2[y] = out[h + y] * (1 - t) + out[y] * t
    return Image.fromarray(o2.astype(np.uint8), "RGBA")


def fit(src, size, stretch=False, outline=0.6, align="bottom"):
    Wt, Ht = size
    if stretch:
        w, h = Wt, Ht
    else:
        s = min(Wt / src.width, Ht / src.height)
        w, h = max(1, round(src.width * s)), max(1, round(src.height * s))
    sm = down(src, (w, h))
    if outline:
        sm = outline_inner(sm, outline)
    out = Image.new("RGBA", size)
    y = Ht - h if align == "bottom" else (Ht - h) // 2
    out.alpha_composite(sm, ((Wt - w) // 2, y))
    return out


def make_palette(named, weights, n=N_COLORS, extra=()):
    """One per-level palette: weighted pixel sample -> median cut + kmeans.
    `extra` colours (and the outline colour) are always included."""
    samples = []
    for k, im in named.items():
        a = np.array(im.convert("RGBA"))
        px = a[a[:, :, 3] > 0][:, :3]
        samples.append(np.repeat(px, weights.get(k, 1), axis=0))
    px = np.concatenate(samples)
    side = int(np.ceil(np.sqrt(len(px))))
    buf = np.zeros((side * side, 3), np.uint8)
    buf[: len(px)] = px
    rest = side * side - len(px)
    buf[len(px):] = px[:rest] if rest <= len(px) else 0
    m = n - 1 - len(extra)
    pal_img = Image.fromarray(buf.reshape(side, side, 3), "RGB").quantize(
        m, method=Image.Quantize.MEDIANCUT, kmeans=3)
    pal = pal_img.getpalette()[: m * 3]
    for c in extra:
        pal += list(c)
    pal += list(OUTLINE)
    ref = Image.new("P", (1, 1))
    ref.putpalette(pal + list(OUTLINE) * ((768 - len(pal)) // 3))  # pad with outline, not black
    return ref, pal


def apply_palette(im, ref):
    a = np.array(im.convert("RGBA"))
    q = im.convert("RGB").quantize(palette=ref, dither=Image.Dither.NONE).convert("RGB")
    out = np.concatenate([np.array(q), a[:, :, 3:4]], 2)
    out[out[:, :, 3] == 0] = 0
    return Image.fromarray(out, "RGBA")


def tile(im, nx, ny):
    a = np.array(im.convert("RGBA"))
    return Image.fromarray(np.tile(a, (ny, nx, 1)), "RGBA")


def on_bg(im, color=(128, 128, 128, 255)):
    bg = Image.new("RGBA", im.size, color)
    bg.alpha_composite(im.convert("RGBA"))
    return bg


def zoom(im, z):
    return im.resize((im.width * z, im.height * z), Image.NEAREST)


def check_alpha(im):
    a = np.array(im.convert("RGBA"))[:, :, 3]
    vals = set(np.unique(a).tolist())
    assert vals <= {0, 255}, vals
    return vals


def n_colors(im):
    a = np.array(im.convert("RGBA"))
    px = a[a[:, :, 3] > 0][:, :3]
    return len(np.unique(px, axis=0))


def down_lines(im, size, k=0.7, frac=0.22, dark=0.5):
    """Box downscale that keeps thin dark lines (mortar, seams): wherever a target
    pixel's source block is >= frac 'dark line' pixels (darker than k x the local
    average), darken that pixel. Use for tiles whose pattern is drawn with thin lines."""
    from PIL import ImageFilter
    src = im.convert("RGBA")
    L = np.array(src.convert("L")).astype(np.float32)
    ref = np.array(src.convert("L").filter(ImageFilter.BoxBlur(24))).astype(np.float32)
    mask = (L < ref * k).astype(np.uint8) * 255
    mfrac = np.array(Image.fromarray(mask, "L").resize(size, Image.BOX)).astype(np.float32) / 255
    base = np.array(down(src, size)).astype(np.float32)
    sel = mfrac >= frac
    base[sel, :3] *= dark
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGBA")


def outline_outer(im):
    """Classic 1 px outline outside the silhouette (needs 1 px of free border)."""
    a = np.array(im.convert("RGBA"))
    op = a[:, :, 3] > 0
    pad = np.pad(op, 1)
    near = pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
    ring = near & ~op
    a[ring] = list(OUTLINE) + [255]
    return Image.fromarray(a, "RGBA")


def fit_outer(src, size, align="bottom", inner=0.0, stretch=None):
    """Fit into size minus a 1 px border, then draw an outer outline (keeps thin parts).
    stretch=(w, h): resize to exactly that inner size instead of keeping the aspect."""
    Wt, Ht = size
    if stretch:
        w, h = stretch
    else:
        s = min((Wt - 2) / src.width, (Ht - 2) / src.height)
        w, h = max(1, round(src.width * s)), max(1, round(src.height * s))
    sm = down(src, (w, h))
    if inner:
        sm = outline_inner(sm, inner)
    out = Image.new("RGBA", size)
    y = Ht - 1 - h if align == "bottom" else (Ht - h) // 2
    out.alpha_composite(sm, ((Wt - w) // 2, y))
    return outline_outer(out)


def make_palette_groups(groups, extra=()):
    """Split palette: each (images_dict, weights, n) group is quantized on its own and
    the results are joined (+ extra + outline). Keeps sprite colours from being
    swamped by background pixels. Total = sum(n) + len(extra) + 1 <= 32."""
    pal = []
    for named, weights, n in groups:
        ref, p = make_palette(named, weights, n=n + 1)
        pal += p[: n * 3]
    for c in extra:
        pal += list(c)
    pal += list(OUTLINE)
    ref = Image.new("P", (1, 1))
    ref.putpalette(pal + list(OUTLINE) * ((768 - len(pal)) // 3))
    return ref, pal


def component_bbox(im, seed=None):
    """Bounding box of the opaque blob containing `seed` (default: image centre).
    Pure-PIL flood fill on the alpha mask (no scipy)."""
    from PIL import ImageDraw
    m = Image.fromarray(((np.array(im)[:, :, 3] > 0) * 255).astype(np.uint8), "L").copy()
    if seed is None:  # opaque pixel nearest the centre
        ys, xs = np.nonzero(np.array(m) > 0)
        i = np.argmin((xs - m.width / 2) ** 2 + (ys - m.height / 2) ** 2)
        seed = (int(xs[i]), int(ys[i]))
    ImageDraw.floodfill(m, seed, 128)
    a = np.array(m) == 128
    ys, xs = np.nonzero(a)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
