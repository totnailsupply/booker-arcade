"""Build every Backyard Brawl art asset from the generated drafts, deterministically.

Run from backyard-brawl/art:   python3 scripts/build_assets.py
Inputs : drafts/*.png (generated with scripts/gen.sh, prompts in drafts/prompts.txt)
Outputs: out/<key>.png, out/manifest.json, out/preview.png
Steps  : cut each sheet into items (XY-cut on empty gaps, chunks assigned to grid cells)
         -> premultiplied box downscale (one scale per character so frames match)
         -> darken edge pixels to a 1 px dark outline -> per-sheet palette (no dither)
         -> alpha thresholded to 0/255.
Technique adapted from soba-tower/art/scripts/build_assets.py.
"""
import json
import os

import numpy as np
from PIL import Image

ART = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ART, "out")
os.makedirs(OUT, exist_ok=True)

SRC = {
    "booker": "booker_med.png",    # 8 poses, 2 rows x 4 cols
    "enemies": "enemies_med.png",  # 5 cols (cat, squirrel, crow, raccoon, skunk) x 2 rows (frames)
    "bosses": "bosses_low.png",    # 2 rows (big tom, robo-vac) x 2 cols (frames)
    "items": "items_low.png",      # 4 cols x 3 rows
    "icons": "icons_fix.png",      # 4 cols x 4 rows (edit of icons_low: collar, big-ears redrawn)
    "icon_tail": "icon_tail.png",  # single icon replacing waggy-tail (#11)
    "items_fix": "items_fix.png",  # edit of items_low; only the stink cloud (#5) is taken from it
    "arena": "arena_med.png",      # opaque 1536x1024
    "title": "title_1k.png",       # gemini 1376x768
}
OUTLINE = (28, 18, 14)
KEEP_ERR = 90  # palette error above which the original colour is kept


def D(n):
    return os.path.join(ART, "drafts", n)


def rgba(path):
    return Image.open(path).convert("RGBA")


def clean_alpha(im, thr=128):
    a = np.array(im)
    on = a[:, :, 3] >= thr
    a[:, :, 3] = np.where(on, 255, 0)
    a[~on] = 0
    return Image.fromarray(a, "RGBA")


def segments(mask1d, min_len=1, min_gap=1):
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


def xycut(mask, x0=0, y0=0, gap=3):
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


def components(m):
    """8-connected component labels of a boolean mask (BFS over opaque pixels)."""
    from collections import deque
    H, W = m.shape
    lab = np.zeros((H, W), np.int32)
    n = 0
    ys, xs = np.nonzero(m)
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if lab[y0, x0]:
            continue
        n += 1
        lab[y0, x0] = n
        q = deque([(y0, x0)])
        while q:
            y, x = q.popleft()
            for dy in (-1, 0, 1):
                yy = y + dy
                if yy < 0 or yy >= H:
                    continue
                for dx in (-1, 0, 1):
                    xx = x + dx
                    if 0 <= xx < W and m[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = n
                        q.append((yy, xx))
    return lab, n


def grid_items(im, cols, rows, min_area=60):
    """Cut a cols x rows sheet. Each connected component goes to the grid cell
    holding its centroid; pixels of other cells' components are masked out."""
    im = clean_alpha(im, 100)
    a = np.array(im)
    m = a[:, :, 3] > 0
    H, W = m.shape
    # label at half resolution for speed, then map back
    lab_s, n = components(m[::2, ::2])
    lab = np.repeat(np.repeat(lab_s, 2, 0), 2, 1)[:H, :W] * m
    cell_of = {}
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab_s == i)
        if len(ys) * 4 < min_area:
            continue
        cell_of[i] = (int(ys.mean() * 2 * rows // H), int(xs.mean() * 2 * cols // W))
    out = []
    for r in range(rows):
        for c in range(cols):
            ids = [i for i, k in cell_of.items() if k == (r, c)]
            assert ids, f"empty cell {(r, c)}"
            keep = np.isin(lab, ids)
            b = a.copy()
            b[~keep] = 0
            ys, xs = np.nonzero(keep)
            out.append(Image.fromarray(b, "RGBA").crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)))
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
    """Darken opaque pixels that touch transparency toward the outline colour."""
    a = np.array(im).astype(np.float32)
    op = a[:, :, 3] > 0
    pad = np.pad(op, 1)
    edge = op & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    for c in range(3):
        ch = a[:, :, c]
        ch[edge] = ch[edge] * (1 - strength) + OUTLINE[c] * strength
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def place(src, scale, size, align="bottom", margin=0, outline=1.0):
    """Downscale src by `scale` and paste into a `size` canvas (centred horizontally)."""
    W, H = size
    w = max(1, min(W - 2 * margin, round(src.width * scale)))
    h = max(1, min(H - 2 * margin, round(src.height * scale)))
    sm = outline_inner(down(src, (w, h)), outline)
    out = Image.new("RGBA", size)
    y = H - margin - h if align == "bottom" else (H - h) // 2
    out.alpha_composite(sm, ((W - w) // 2, y))
    return out


def shared_scale(frames, size, margin=0):
    W, H = size
    return min(min((W - 2 * margin) / f.width, (H - 2 * margin) / f.height) for f in frames)


def quantize(im, n):
    """Per-sheet palette, no dither; alpha kept hard."""
    a = np.array(im)
    rgb = Image.fromarray(a[:, :, :3], "RGB")
    q = np.array(rgb.quantize(n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB"))
    out = np.dstack([q, a[:, :, 3]])
    out[a[:, :, 3] == 0] = 0
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def sheet(frames, fw, fh, n_colors=None):
    s = Image.new("RGBA", (fw * len(frames), fh))
    for i, f in enumerate(frames):
        s.alpha_composite(f, (i * fw, 0))
    if n_colors:
        # quantize only opaque pixels: stack them into a strip first
        a = np.array(s)
        op = a[:, :, 3] > 0
        px = a[op][:, :3]
        side = int(np.ceil(np.sqrt(len(px))))
        buf = np.zeros((side * side, 3), np.uint8)
        buf[: len(px)] = px
        buf[len(px):] = px[0]
        pal = Image.fromarray(buf.reshape(side, side, 3), "RGB").quantize(
            n_colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        q = np.array(Image.fromarray(a[:, :, :3], "RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB"))
        # keep small accents (eyes, eye lights) that the palette would wash out
        err = np.abs(q.astype(int) - a[:, :, :3].astype(int)).sum(2)
        q = np.where((err > KEEP_ERR)[:, :, None], a[:, :, :3], q)
        a[:, :, :3] = np.where(op[:, :, None], q, 0)
        s = Image.fromarray(a, "RGBA")
    return s


manifest = {}
finals = {}


def save(key, im, fw=None, fh=None, n=None, anims=None):
    fn = f"{key}.png"
    im.save(os.path.join(OUT, fn))
    finals[key] = im
    if fw:
        e = {"file": fn, "frameWidth": fw, "frameHeight": fh, "frames": n}
        if anims:
            e["animations"] = anims
        manifest[key] = e
    else:
        manifest[key] = {"file": fn, "width": im.width, "height": im.height}


# ============================================================== Booker (32x32 x 8)
bk = grid_items(rgba(D(SRC["booker"])), 4, 2)
# sheet order: idle0 idle1 run0 run1 / run2 run3 hurt dash
s = shared_scale(bk, (32, 32), margin=0)
frames = [place(f, s, (32, 32), "bottom") for f in bk]
bsheet = sheet(frames, 32, 32, 28)


def find_eye(f):
    """Source-space centre of the near eye: an amber iris blob next to a white shine
    pixel, in the upper-right (head) part of the frame. None if the eyes are shut."""
    a = np.array(f).astype(int)
    h, w = a.shape[:2]
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    m = (R > 190) & (G > 80) & (G < 140) & (B < 60) & (a[:, :, 3] > 0)
    m[int(h * 0.6):] = False
    m[:, : w // 2] = False
    wy, wx = np.nonzero((a[:, :, :3].min(2) > 215) & (a[:, :, 3] > 0))
    lab, n = components(m)
    best = None
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        if not 15 <= len(ys) <= 250 or not len(wy):
            continue
        cy, cx = ys.mean(), xs.mean()
        d = np.sqrt((wy - cy) ** 2 + (wx - cx) ** 2).min()
        if d < 14 and (best is None or d < best[0]):
            best = (d, cy, cx)
    return None if best is None else best[1:]


# At 32 px the amber eye drowns in the black mask, so repaint it as one bright
# amber pixel with a dark pixel behind it (towards the ear) for contrast.
EYE, EYE_DARK = (255, 178, 40, 255), (30, 18, 12, 255)
for i, f in enumerate(bk):
    e = find_eye(f)
    if e is None:
        continue
    w, h = round(f.width * s), round(f.height * s)
    ex = i * 32 + (32 - w) // 2 + int(e[1] * s)
    ey = 32 - h + int(e[0] * s)
    bsheet.putpixel((ex, ey), EYE)
    if bsheet.getpixel((ex - 1, ey))[3]:
        bsheet.putpixel((ex - 1, ey), EYE_DARK)
save("booker", bsheet, 32, 32, 8,
     {"idle": [0, 1], "run": [2, 3, 4, 5], "hurt": [6], "dash": [7]})
print("booker scale", round(s, 4), [f.size for f in bk])

# ============================================================== enemies (2 frames each)
en = grid_items(rgba(D(SRC["enemies"])), 5, 2)
ENEMIES = [("cat", 24, "walk"), ("squirrel", 20, "run"), ("crow", 24, "flap"),
           ("raccoon", 28, "walk"), ("skunk", 24, "walk")]
for i, (key, size, anim) in enumerate(ENEMIES):
    pair = [en[i], en[5 + i]]
    s = shared_scale(pair, (size, size))
    align = "center" if key == "crow" else "bottom"
    frames = [place(f, s, (size, size), align) for f in pair]
    save(key, sheet(frames, size, size, 16), size, size, 2, {anim: [0, 1]})
    print(key, "scale", round(s, 4), [f.size for f in pair])

# ============================================================== bosses (64x64 x 2)
bo = grid_items(rgba(D(SRC["bosses"])), 2, 2)
for key, pair, anim in [("boss-cat", bo[0:2], "walk"), ("boss-vac", bo[2:4], "move")]:
    s = shared_scale(pair, (64, 64))
    frames = [place(f, s, (64, 64), "bottom") for f in pair]
    save(key, sheet(frames, 64, 64, 24), 64, 64, 2, {anim: [0, 1]})
    print(key, "scale", round(s, 4), [f.size for f in pair])

# ============================================================== items (16x16 x 12) and icons (24x24 x 16)
def largest_only(im):
    """Drop detached bits (fumes, specks) so the main shape fills the tiny frame."""
    a = np.array(im)
    lab, n = components(a[:, :, 3] > 0)
    sizes = np.bincount(lab.ravel())[1:]
    keep = np.isin(lab, [k + 1 for k, sz in enumerate(sizes) if sz >= 0.25 * sizes.max()])
    a[~keep] = 0
    ys, xs = np.nonzero(keep)
    return Image.fromarray(a, "RGBA").crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


it = grid_items(rgba(D(SRC["items"])), 4, 3)
it[4] = grid_items(rgba(D(SRC["items_fix"])), 4, 3)[4]  # puffy green/purple skull stink cloud
frames = [place(f, shared_scale([f], (16, 16), 1), (16, 16), "center", 1) for f in it]
save("items", sheet(frames, 16, 16, 48), 16, 16, 12)

ic = grid_items(rgba(D(SRC["icons"])), 4, 4)
ic[10] = grid_items(rgba(D(SRC["icon_tail"])), 1, 1)[0]  # waggy-tail
frames = [place(f, shared_scale([f], (24, 24), 1), (24, 24), "center", 1, outline=0.6) for f in ic]
save("icons", sheet(frames, 24, 24, 64), 24, 24, 16)

# ============================================================== arena (768x512, opaque)
ar = Image.open(D(SRC["arena"])).convert("RGB")
small = ar.resize((384, 256), Image.BOX)
small = small.quantize(32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
save("arena", small.resize((768, 512), Image.NEAREST).convert("RGBA"))

# ============================================================== title (480x270, opaque)
ti = Image.open(D(SRC["title"])).convert("RGB")
tw = round(ti.height * 16 / 9)
x0 = (ti.width - tw) // 2
ti = ti.crop((x0, 0, x0 + tw, ti.height)).resize((480, 270), Image.BOX)
ti = ti.quantize(64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
save("title", ti.convert("RGBA"))

with open(os.path.join(OUT, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=2)

# ============================================================== preview contact sheet
GRASS = (110, 170, 70, 255)
Z = 4
rows = []
for key in ["booker", "cat", "squirrel", "crow", "raccoon", "skunk", "boss-cat", "boss-vac", "items", "icons"]:
    im = finals[key]
    m = manifest[key]
    # spread frames apart by 2 px so frame boundaries are visible
    fw, fh, n = m["frameWidth"], m["frameHeight"], m["frames"]
    sp = Image.new("RGBA", (n * (fw + 2), fh), (0, 0, 0, 0))
    for i in range(n):
        sp.alpha_composite(im.crop((i * fw, 0, (i + 1) * fw, fh)), (i * (fw + 2), 0))
    z = Z if key not in ("boss-cat", "boss-vac") else 3
    rows.append(sp.resize((sp.width * z, sp.height * z), Image.NEAREST))
arena_t = finals["arena"]
title_t = finals["title"].resize((960, 540), Image.NEAREST)
Wp = max([r.width for r in rows] + [arena_t.width + title_t.width + 16])
Hp = sum(r.height + 12 for r in rows) + max(arena_t.height, title_t.height) + 12
cv = Image.new("RGBA", (Wp + 24, Hp + 24), GRASS)
y = 12
for r in rows:
    cv.alpha_composite(r, (12, y))
    y += r.height + 12
cv.alpha_composite(arena_t, (12, y))
cv.alpha_composite(title_t.convert("RGBA"), (12 + arena_t.width + 16, y))
cv.convert("RGB").save(os.path.join(OUT, "preview.png"))
print("wrote", sorted(manifest))
