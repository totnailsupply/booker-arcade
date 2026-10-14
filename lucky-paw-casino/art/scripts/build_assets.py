#!/usr/bin/env python3
"""Rebuild every Lucky Paw Casino art final from art/drafts/ (no API calls).

Run from the project root:  python3 art/scripts/build_assets.py
Writes processed finals to art/out/, installs them into public/assets/,
writes public/assets/manifest.json and art/out/preview.png.
"""
import json
import os
import shutil
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DRAFTS = os.path.join(ROOT, "art", "drafts")
OUT = os.path.join(ROOT, "art", "out")
PUB = os.path.join(ROOT, "public", "assets")


def d(name):
    return os.path.join(DRAFTS, name)


# ---------------------------------------------------------------- helpers

def down(im, size):
    """Premultiplied Lanczos downscale (no colour bleed from transparent pixels)."""
    return im.convert("RGBA").convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")


def harden(im, palette_img=None, colors=48, alpha_cut=128):
    """Hard 1-bit alpha + limited palette -> reads as pixel art."""
    im = im.convert("RGBA")
    a = im.getchannel("A").point(lambda v: 255 if v >= alpha_cut else 0)
    rgb = im.convert("RGB")
    if palette_img is not None:
        rgb = rgb.quantize(palette=palette_img, dither=Image.Dither.NONE).convert("RGB")
    elif colors:
        rgb = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT,
                           dither=Image.Dither.NONE).convert("RGB")
    out = rgb.convert("RGBA")
    out.putalpha(a)
    # zero colour under transparent pixels so filtering never shows a halo
    clear = Image.new("RGBA", out.size, (0, 0, 0, 0))
    return Image.composite(out, clear, a)


def up(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def shared_palette(images, colors):
    """One palette for a family of sprites so they match exactly."""
    w = sum(i.width for i in images)
    h = max(i.height for i in images)
    strip = Image.new("RGB", (w, h), (0, 0, 0))
    x = 0
    for i in images:
        rgb = Image.new("RGB", i.size, (0, 0, 0))
        rgb.paste(i.convert("RGB"), (0, 0), i.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
        strip.paste(rgb, (x, 0))
        x += i.width
    return strip.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def fit_logical(im, cw, ch, margin, anchor="center"):
    """Trim to content and scale into a (cw x ch) logical canvas with a margin."""
    im = im.convert("RGBA")
    bb = im.getchannel("A").point(lambda v: 255 if v >= 64 else 0).getbbox()
    im = im.crop(bb)
    s = min((cw - 2 * margin) / im.width, (ch - 2 * margin) / im.height)
    nw, nh = max(1, round(im.width * s)), max(1, round(im.height * s))
    small = down(im, (nw, nh))
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    x = (cw - nw) // 2
    y = (ch - nh) // 2 if anchor == "center" else ch - nh - (0 if anchor == "bottom-flush" else margin)
    canvas.alpha_composite(small, (x, y))
    return canvas


def main_subject(im, keep_frac=0.04):
    """Drop stray specks from neighbouring cells: keep connected alpha blobs
    whose area is at least keep_frac of the largest blob (on a 1/4 mask)."""
    im = im.convert("RGBA")
    q = 4
    m = im.getchannel("A").resize((im.width // q, im.height // q), Image.BOX)
    w, h = m.size
    mp = m.load()
    seen = [[False] * w for _ in range(h)]
    blobs = []
    for y0 in range(h):
        for x0 in range(w):
            if seen[y0][x0] or mp[x0, y0] < 40:
                continue
            stack, pts = [(x0, y0)], []
            seen[y0][x0] = True
            while stack:
                x, y = stack.pop()
                pts.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and mp[nx, ny] >= 40:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            blobs.append(pts)
    if not blobs:
        return im
    big = max(len(b) for b in blobs)
    keep = Image.new("L", (w, h), 0)
    kp = keep.load()
    for b in blobs:
        if len(b) >= keep_frac * big:
            for x, y in b:
                kp[x, y] = 255
    keep = keep.resize(im.size, Image.NEAREST)
    from PIL import ImageFilter
    keep = keep.filter(ImageFilter.MaxFilter(9))
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), keep)
    return out


def slice_cells(im, cols, rows):
    w, h = im.size
    cw, ch = w // cols, h // rows
    return [main_subject(im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)))
            for r in range(rows) for c in range(cols)]


def save(im, rel):
    """Save to art/out/<rel> and install to public/assets/<rel>."""
    for base in (OUT, PUB):
        p = os.path.join(base, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        im.save(p, optimize=True)
    return rel


MANIFEST = {}


def register(key, rel, im, pixel=True):
    MANIFEST[key] = {"file": rel, "pixel": pixel, "w": im.width, "h": im.height}


# ---------------------------------------------------------------- Soba portraits
# Logical grid 128x128 -> x2 = 256 px (the Booker dealer master is effectively
# ~128+ px detail; a 64 grid made Soba's expressions unreadable).

def soba_portraits():
    src = {
        "soba-neutral": "soba_hero_d2.png",
        "soba-happy": "soba_happy_d1.png",
        "soba-sad": "soba_sad_d1.png",
        "soba-nervous": "soba_nervous_d1.png",
        "soba-smug": "soba_smug_d1.png",
    }
    G, K, SCALE = 128, 2, 0.92
    smalls = {}
    for key, f in src.items():
        im = Image.open(d(f)).convert("RGBA")
        # Same transform for all five (the edits keep the hero's position):
        # shrink to 92 % and anchor to the bottom centre, leaving headroom
        # above the ears like Booker's dealer.webp.
        W = im.width
        nw = round(W * SCALE)
        canvas = Image.new("RGBA", (W, W), (0, 0, 0, 0))
        canvas.alpha_composite(down(im, (nw, nw)), ((W - nw) // 2, W - nw))
        smalls[key] = down(canvas, (G, G))
    pal = shared_palette(list(smalls.values()), 64)
    for key, sm in smalls.items():
        px = harden(sm, palette_img=pal)
        rel = save(up(px, K), f"soba/{key}.png")
        register(key, rel, up(px, K))


# ---------------------------------------------------------------- duo hero

def duo():
    im = Image.open(d("duo_d1.png")).convert("RGBA")
    bb = im.getchannel("A").point(lambda v: 255 if v >= 64 else 0).getbbox()
    im = im.crop(bb)
    H = 256  # logical height -> x2 = 512 px
    W = round(im.width * H / im.height)
    px = harden(down(im, (W, H)), colors=64)
    big = up(px, 2)
    register("duo-hero", save(big, "duo-hero.png"), big)


# ---------------------------------------------------------------- logo

def key_magenta(im):
    im = im.convert("RGBA")
    w, h = im.size
    for xy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(im, xy, (0, 0, 0, 0), thresh=90)
    # remove remaining magenta-ish fringe pixels (strong R and B, weak G)
    px = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and r > 150 and b > 150 and g < 110 and abs(r - b) < 90:
                px[x, y] = (0, 0, 0, 0)
    return im


def logo():
    im = key_magenta(Image.open(d("logo_d1.png")))
    bb = im.getchannel("A").getbbox()
    im = im.crop(bb)
    CW, CH, M = 960, 320, 8
    s = min((CW - 2 * M) / im.width, (CH - 2 * M) / im.height)
    nw, nh = round(im.width * s), round(im.height * s)
    small = harden(down(im, (nw, nh)), colors=0)
    canvas = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    canvas.alpha_composite(small, ((CW - nw) // 2, (CH - nh) // 2))
    register("title-logo", save(canvas, "title-logo.png"), canvas, pixel=False)


# ---------------------------------------------------------------- backgrounds

def backgrounds():
    for n in ["lobby", "plinko", "blackjack", "craps", "roulette", "slots"]:
        im = Image.open(d(f"bg_{n}_d1.png")).convert("RGB")
        small = im.resize((320, 180), Image.LANCZOS)
        if n == "lobby":  # the lobby draft came out darker than the table rooms
            from PIL import ImageEnhance
            small = ImageEnhance.Brightness(small).enhance(1.18)
        small = small.quantize(colors=192, method=Image.Quantize.MEDIANCUT,
                               dither=Image.Dither.NONE).convert("RGB")
        big = up(small, 4)
        register(f"bg-{n}", save(big, f"bg/bg-{n}.png"), big)


# ---------------------------------------------------------------- icons

def icons():
    sheet = Image.open(d("icons_d1.png")).convert("RGBA")
    cells = slice_cells(sheet, 3, 2)
    names = ["plinko", "blackjack", "craps", "roulette", "slots"]
    logical = [fit_logical(c, 40, 40, 2) for c in cells[:5]]
    for n, lg in zip(names, logical):
        big = up(harden(lg, colors=0), 4)  # 40x40 is small; keep source colours (pegs stay white)
        register(f"icon-{n}", save(big, f"icons/icon-{n}.png"), big)


# ---------------------------------------------------------------- slot symbols

def symbols():
    sheet = Image.open(d("symbols_d1.png")).convert("RGBA")
    cells = slice_cells(sheet, 4, 2)
    names = ["wild-gen", "scatter", "booker", "soba", "bone", "ball", "hydrant", "bowl"]
    logical = {n: fit_logical(c, 32, 32, 2) for n, c in zip(names, cells)}
    for n, lg in logical.items():
        if n == "wild-gen":
            continue
        big = up(harden(lg, colors=32), 4)
        register(f"sym-{n}", save(big, f"slots/sym-{n}.png"), big)
    # Wild = the existing Golden Paw coin (26x26 logical at 16x), exact match.
    paw = Image.open(os.path.join(PUB, "booker", "slots-paw.png")).convert("RGBA")
    paw = paw.resize((26, 26), Image.NEAREST)
    canvas = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    canvas.alpha_composite(paw, (3, 3))
    big = up(canvas, 4)
    register("sym-wild", save(big, "slots/sym-wild.png"), big)


# ---------------------------------------------------------------- preview sheet

def preview():
    order = list(MANIFEST.keys())
    tiles = []
    for k in order:
        im = Image.open(os.path.join(PUB, MANIFEST[k]["file"])).convert("RGBA")
        s = min(1.0, 320 / im.width, 200 / im.height)
        if s < 1:
            im = im.resize((round(im.width * s), round(im.height * s)),
                           Image.NEAREST if MANIFEST[k]["pixel"] else Image.LANCZOS)
        tiles.append((k, im))
    cols, cw, ch = 5, 330, 230
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cw, rows * ch), (128, 128, 128, 255))
    dr = ImageDraw.Draw(sheet)
    for i, (k, im) in enumerate(tiles):
        x, y = (i % cols) * cw, (i // cols) * ch
        sheet.alpha_composite(im, (x + (cw - im.width) // 2, y + 4 + (200 - im.height) // 2))
        dr.text((x + 6, y + ch - 22), k, fill=(255, 255, 255, 255))
    sheet.convert("RGB").save(os.path.join(OUT, "preview.png"))


def main():
    soba_portraits()
    duo()
    logo()
    backgrounds()
    icons()
    symbols()
    keys = ["soba-neutral", "soba-happy", "soba-sad", "soba-nervous", "soba-smug", "duo-hero",
            "title-logo", "bg-lobby", "bg-plinko", "bg-blackjack", "bg-craps", "bg-roulette",
            "bg-slots", "icon-plinko", "icon-blackjack", "icon-craps", "icon-roulette", "icon-slots",
            "sym-wild", "sym-scatter", "sym-booker", "sym-soba", "sym-bone", "sym-ball",
            "sym-hydrant", "sym-bowl"]
    ordered = {k: MANIFEST[k] for k in keys if k in MANIFEST
               and os.path.exists(os.path.join(PUB, MANIFEST[k]["file"]))}
    MANIFEST.clear()
    MANIFEST.update(ordered)
    with open(os.path.join(PUB, "manifest.json"), "w") as f:
        json.dump(MANIFEST, f, indent=2)
        f.write("\n")
    preview()
    for k, v in MANIFEST.items():
        im = Image.open(os.path.join(PUB, v["file"]))
        a = im.convert("RGBA").getchannel("A").getextrema()
        print(f"{k:14s} {v['file']:28s} {im.size} alpha={a}")


if __name__ == "__main__":
    main()
