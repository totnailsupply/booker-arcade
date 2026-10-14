"""Shared pixel-art post-processing helpers (Pillow only)."""
from PIL import Image, ImageDraw

def premul_resize(im, size):
    """Area-average downscale that ignores colour under transparent pixels."""
    im = im.convert("RGBA")
    r, g, b, a = im.split()
    from PIL import ImageChops
    rp = ImageChops.multiply(r, a); gp = ImageChops.multiply(g, a); bp = ImageChops.multiply(b, a)
    rs, gs, bs, as_ = [c.resize(size, Image.BOX) for c in (rp, gp, bp, a)]
    out = Image.new("RGBA", size)
    px = out.load(); R, G, B, A = rs.load(), gs.load(), bs.load(), as_.load()
    for y in range(size[1]):
        for x in range(size[0]):
            al = A[x, y]
            if al == 0:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (min(255, R[x, y] * 255 // al), min(255, G[x, y] * 255 // al), min(255, B[x, y] * 255 // al), al)
    return out

def quantize_rgba(im, colors=32, alpha_cut=128):
    """Hard alpha + reduced palette so the sprite reads as pixel art."""
    im = im.convert("RGBA")
    a = im.getchannel("A").point(lambda v: 255 if v >= alpha_cut else 0)
    rgb = im.convert("RGB")
    if colors:
        rgb = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    out = rgb.convert("RGBA"); out.putalpha(a)
    # zero the colour of transparent pixels so no halo leaks when filtered
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            if px[x, y][3] == 0:
                px[x, y] = (0, 0, 0, 0)
    return out

def pixelize(im, w, h, colors=32, alpha_cut=128):
    return quantize_rgba(premul_resize(im, (w, h)), colors, alpha_cut)

def upscale(im, k=4):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)

def remove_bg_flood(im, thresh=40, seeds=None):
    im = im.convert("RGBA")
    w, h = im.size
    seeds = seeds or [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    for xy in seeds:
        if im.getpixel(xy)[3]:
            ImageDraw.floodfill(im, xy, (0, 0, 0, 0), thresh=thresh)
    return im

def fit_on_canvas(im, cw, ch, margin=0, anchor="center"):
    """Trim to content, scale to fit within (cw-2m, ch-2m) keeping aspect, paste."""
    im = im.convert("RGBA")
    bb = im.getbbox()
    if bb: im = im.crop(bb)
    aw, ah = cw - 2 * margin, ch - 2 * margin
    s = min(aw / im.width, ah / im.height)
    nw, nh = max(1, round(im.width * s)), max(1, round(im.height * s))
    im = im.resize((nw, nh), Image.LANCZOS)
    out = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    x = (cw - nw) // 2
    y = (ch - nh) // 2 if anchor == "center" else ch - margin - nh
    out.alpha_composite(im, (x, y))
    return out
