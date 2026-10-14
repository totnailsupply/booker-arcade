"""Build all final game assets from the generated drafts.

Run from booker-run/art:   python3 scripts/build_assets.py
Inputs : drafts/*.png (generated), outputs: ../public/assets/*.png + manifest.json + preview.png
Steps  : cut frames/props by empty gaps -> box downscale -> crossfade seams ->
         one shared 32-colour palette (no dither) -> alpha thresholded to 0/255.
"""
import json
import os
import numpy as np
from PIL import Image

ART = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ART, "..", "public", "assets")
D = lambda n: os.path.join(ART, "drafts", n)
os.makedirs(OUT, exist_ok=True)

N_COLORS = 32
OUTLINE = (34, 18, 22)


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


def split_row(im):
    """Split a sprite row into pieces separated by fully transparent columns."""
    im = clean_alpha(im, 100)
    a = np.array(im)[:, :, 3] > 0
    out = []
    for x0, x1 in segments(a.any(0), 20):
        piece = im.crop((x0, 0, x1, im.height))
        out.append(piece.crop(piece.getbbox()))
    return out


def clean_alpha(im, thr=128):
    """Hard edges: alpha to 0/255; transparent pixels zeroed."""
    a = np.array(im)
    on = a[:, :, 3] >= thr
    a[:, :, 3] = np.where(on, 255, 0)
    a[~on] = 0
    return Image.fromarray(a, "RGBA")


def down(im, size):
    """Premultiplied box downscale (keeps eyes / mask readable better than NEAREST
    at a 6x reduction); hard pixel edges come back from palette + alpha threshold."""
    a = np.array(im).astype(np.float32)
    al = a[:, :, 3:4] / 255.0
    pre = np.concatenate([a[:, :, :3] * al, a[:, :, 3:4]], 2).astype(np.uint8)
    small = np.array(Image.fromarray(pre, "RGBA").resize(size, Image.BOX)).astype(np.float32)
    al2 = np.maximum(small[:, :, 3:4] / 255.0, 1e-6)
    rgb = np.clip(small[:, :, :3] / al2, 0, 255)
    return clean_alpha(Image.fromarray(np.concatenate([rgb, small[:, :, 3:4]], 2).astype(np.uint8), "RGBA"))


def outline_inner(im, strength=1.0):
    """Darken opaque edge pixels (touching transparency) toward the outline colour,
    so the silhouette keeps a bold dark border without growing the sprite."""
    a = np.array(im).astype(np.int32)
    op = a[:, :, 3] > 0
    pad = np.pad(op, 1)
    edge = op & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    for c in range(3):
        ch = a[:, :, c]
        ch[edge] = (ch[edge] * (1 - strength) + OUTLINE[c] * strength).astype(np.int32)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def best_cut(im, min_frac=0.85, band=4):
    """Find the crop width Wc (>= min_frac of the width) whose columns just past
    Wc look most like the first columns, so [0, Wc) wraps with little mismatch."""
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
    """Crop at the best-matching wrap column, resize to (w+k, h), then crossfade the
    first k columns with the overflow so column w-1 is followed seamlessly by column 0."""
    if cut:
        im = best_cut(im)
    big = np.array(im.resize((w + k, h), Image.BOX)).astype(np.float32)
    out = big[:, :w].copy()
    for x in range(k):
        t = (x + 0.5) / k
        out[:, x] = big[:, w + x] * (1 - t) + big[:, x] * t
    return Image.fromarray(out.astype(np.uint8), "RGBA")


# ---------------------------------------------------------------- Booker sheet
FW, FH = 48, 36
run = split_row(rgba(D("run_med.png")))
pose = split_row(rgba(D("pose_med.png")))
assert len(run) == 6 and len(pose) == 4, (len(run), len(pose))

s_run = min(min((FW - 1) / f.width, (FH - 1) / f.height) for f in run)
# pose sheet was drawn bigger: match the fall frame (standing-ish) to run frame 3 height
s_pose = s_run * run[3].height / pose[1].height
s_pose = min([s_pose] + [min((FW - 1) / f.width, (FH - 1) / f.height) for f in pose])


def frame(src, s, center="mass"):
    w, h = max(1, round(src.width * s)), max(1, round(src.height * s))
    sm = outline_inner(down(src, (w, h)), 0.85)
    cell = Image.new("RGBA", (FW, FH))
    a = np.array(sm)[:, :, 3] > 0
    cx = np.nonzero(a)[1].mean() if center == "mass" else w / 2
    x = int(round(FW / 2 - cx))
    x = max(0, min(FW - w, x))
    cell.alpha_composite(sm, (x, FH - h))  # feet on bottom row baseline
    return cell


frames = [frame(f, s_run) for f in run] + [frame(f, s_pose) for f in pose]
sheet = Image.new("RGBA", (FW * 10, FH))
for i, f in enumerate(frames):
    sheet.alpha_composite(f, (i * FW, 0))

# ---------------------------------------------------------------- props
props_im = rgba(D("props_med.png"))
pa = np.array(props_im)[:, :, 3] > 100
rows = segments(pa.any(1), 20)
props = []
for y0, y1 in rows:
    props += split_row(props_im.crop((0, y0, props_im.width, y1)))
assert len(props) == 6, len(props)
cone, crate, pallets, barrel, bone, steak = props


def fit(src, size, stretch=False, rotate=0):
    if rotate:
        src = src.rotate(rotate, resample=Image.BICUBIC, expand=True)
        src = src.crop(src.getbbox())
    W, H = size
    if stretch:
        w, h = W, H
    else:
        s = min(W / src.width, H / src.height)
        w, h = max(1, round(src.width * s)), max(1, round(src.height * s))
    sm = outline_inner(down(src, (w, h)), 0.6)
    out = Image.new("RGBA", size)
    out.alpha_composite(sm, ((W - w) // 2, H - h))
    return out


def bone_angle(src):
    a = np.array(src)[:, :, 3] > 128
    ys, xs = np.nonzero(a)
    xs = xs - xs.mean(); ys = ys - ys.mean()
    cov = np.cov(np.vstack([xs, ys]))
    v = np.linalg.eigh(cov)[1][:, -1]
    return np.degrees(np.arctan2(v[1], v[0]))


ang = bone_angle(bone)
items = {
    "cone": fit(cone, (16, 20), stretch=True),
    "crate": fit(crate, (24, 24), stretch=True),
    "pallets": fit(pallets, (24, 48), stretch=True),
    "barrel": fit(barrel, (20, 20), stretch=True),
    "bone": fit(bone, (16, 8), stretch=True, rotate=ang),
    "steak": fit(steak, (40, 28)),
}

# ---------------------------------------------------------------- backgrounds / ground / title
W, H = 480, 270
bg_far = wrap_seamless(rgba(D("bgfar_med.png")), W, H, 16)
mid = clean_alpha(wrap_seamless(rgba(D("bgmid_med.png")), W, H, 12))
bg_mid = Image.new("RGBA", (W, H))
bg_mid.alpha_composite(mid, (0, 45))  # drop hangars so the far skyline/sun peek over
bg_near = clean_alpha(wrap_seamless(rgba(D("bgnear_med.png")), W, H, 12))

g = rgba(D("ground_med.png"))
ground = wrap_seamless(g, 32, 32, 6, cut=False)

t = rgba(D("title_1k.png"))
tw = round(t.height * W / H)
t = t.crop(((t.width - tw) // 2, 0, (t.width - tw) // 2 + tw, t.height))
title = t.resize((W, H), Image.LANCZOS)

# ---------------------------------------------------------------- shared palette
named = {"booker": sheet, **items, "bg-far": bg_far, "bg-mid": bg_mid, "bg-near": bg_near,
         "ground": ground, "title": title}
weights = {"booker": 60, "cone": 30, "crate": 30, "pallets": 20, "barrel": 30, "bone": 40,
           "steak": 40, "bg-far": 1, "bg-mid": 1, "bg-near": 1, "ground": 30, "title": 1}
samples = []
for k, im in named.items():
    a = np.array(im)
    px = a[a[:, :, 3] > 0][:, :3]
    samples.append(np.repeat(px, weights[k], axis=0))
px = np.concatenate(samples)
side = int(np.ceil(np.sqrt(len(px))))
buf = np.zeros((side * side, 3), np.uint8)
buf[: len(px)] = px
buf[len(px):] = px[: side * side - len(px)] if side * side - len(px) <= len(px) else 0
pal_img = Image.fromarray(buf.reshape(side, side, 3), "RGB").quantize(
    N_COLORS - 1, method=Image.Quantize.MEDIANCUT, kmeans=3)
pal = pal_img.getpalette()[: (N_COLORS - 1) * 3]
pal += list(OUTLINE)  # guarantee the outline colour exists
pal_ref = Image.new("P", (1, 1))
pal_ref.putpalette(pal + [0] * (768 - len(pal)))


def apply_palette(im):
    a = np.array(im)
    q = im.convert("RGB").quantize(palette=pal_ref, dither=Image.Dither.NONE).convert("RGB")
    out = np.concatenate([np.array(q), a[:, :, 3:4]], 2)
    out[out[:, :, 3] == 0] = 0
    return Image.fromarray(out, "RGBA")


final = {k: apply_palette(v) for k, v in named.items()}
final["bg-far"] = final["bg-far"].convert("RGB")
final["ground"] = final["ground"].convert("RGB")
final["title"] = final["title"].convert("RGB")
for k, im in final.items():
    im.save(os.path.join(OUT, f"{k}.png"), optimize=True)
Image.new("RGB", (len(pal) // 3 * 8, 8)).save(os.path.join(ART, "drafts", "_palette.png"))
sw = Image.new("RGB", (len(pal) // 3, 1)); sw.putdata([tuple(pal[i:i + 3]) for i in range(0, len(pal), 3)])
sw.resize((len(pal) // 3 * 16, 16), Image.NEAREST).save(os.path.join(ART, "drafts", "_palette.png"))

manifest = {"booker": {"file": "booker.png", "frameWidth": FW, "frameHeight": FH, "frames": 10,
                       "animations": {"run": [0, 1, 2, 3, 4, 5], "jump": [6], "fall": [7],
                                      "hurt": [8], "win": [9]}}}
for k in ["cone", "crate", "pallets", "barrel", "bone", "steak", "bg-far", "bg-mid", "bg-near",
          "ground", "title"]:
    im = final[k]
    manifest[k] = {"file": f"{k}.png", "width": im.width, "height": im.height}
json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=2)

# ---------------------------------------------------------------- preview
GRAY = (128, 128, 128, 255)
Z = 4
tiles = [("booker", final["booker"])] + [(k, final[k]) for k in
                                         ["cone", "crate", "pallets", "barrel", "bone", "steak"]]
tiles.append(("ground x3", Image.fromarray(np.tile(np.array(final["ground"].convert("RGBA")), (1, 3, 1)))))
scene = final["bg-far"].convert("RGBA")
for k in ["bg-mid", "bg-near"]:
    scene.alpha_composite(final[k])
GY = H - 32
for x in range(0, W, 32):
    scene.alpha_composite(final["ground"].convert("RGBA"), (x, GY))
scene.alpha_composite(frames_q := final["booker"].crop((2 * FW, 0, 3 * FW, FH)), (70, GY - FH))
scene.alpha_composite(final["booker"].crop((6 * FW, 0, 7 * FW, FH)), (140, GY - FH - 40))
scene.alpha_composite(final["cone"], (200, GY - 20))
scene.alpha_composite(final["crate"], (250, GY - 24))
scene.alpha_composite(final["pallets"], (300, GY - 48))
scene.alpha_composite(final["barrel"], (350, GY - 20))
scene.alpha_composite(final["bone"], (240, GY - 60))
scene.alpha_composite(final["steak"], (420, GY - 28))
# seam checks: 2x1 tiles of each background, half size
seam = Image.new("RGBA", (W * 2, H * 3), GRAY)
for i, k in enumerate(["bg-far", "bg-mid", "bg-near"]):
    for j in range(2):
        seam.alpha_composite(final[k].convert("RGBA"), (W * j, H * i))

pad = 16
row1_h = max(im.height for _, im in tiles) * Z
sheet_w = max(sum(im.width * Z + pad for _, im in tiles[1:]) + pad, FW * 10 * Z + 2 * pad)
canvas_w = max(sheet_w, W * 2 + 2 * pad)
canvas_h = pad + FH * Z + pad + row1_h + pad + H * 2 + pad + H * 2 + pad + H * 3 // 2 + pad
cv = Image.new("RGBA", (canvas_w, canvas_h), GRAY)
y = pad
cv.alpha_composite(final["booker"].resize((FW * 10 * Z, FH * Z), Image.NEAREST), (pad, y))
y += FH * Z + pad
x = pad
for _, im in tiles[1:]:
    im = im.convert("RGBA")
    cv.alpha_composite(im.resize((im.width * Z, im.height * Z), Image.NEAREST), (x, y))
    x += im.width * Z + pad
y += row1_h + pad
cv.alpha_composite(scene.resize((W * 2, H * 2), Image.NEAREST), (pad, y))
y += H * 2 + pad
cv.alpha_composite(final["title"].convert("RGBA").resize((W * 2, H * 2), Image.NEAREST), (pad, y))
y += H * 2 + pad
cv.alpha_composite(seam.resize((W, H * 3 // 2), Image.NEAREST), (pad, y))
cv.convert("RGB").save(os.path.join(ART, "preview.png"))
scene.save(os.path.join(ART, "drafts", "_scene.png"))
print("scales", s_run, s_pose, "bone angle", ang)
for k, im in final.items():
    print(k, im.size, im.mode)
