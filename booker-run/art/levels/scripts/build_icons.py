"""Build public/assets/ui-icons.png: 240x24, 10 frames of 24x24.

0 double jump, 1 glide, 2 wall kick, 3 pounce, 4 zoomies, 5 padlock, 6 star on,
7 star off, 8 trophy, 9 bone.  Source: drafts/icons_med.png (2 rows x 5).
Run from booker-run:  python3 art/levels/scripts/build_icons.py
"""
import json
import os
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixlib import (OUT, LV, D, OUTLINE, rgba, segments, clean_alpha, down, outline_inner, make_palette,
                    apply_palette, n_colors)

S = 24


def grid_pieces(im, cols, thr=100):
    """Cut a sheet into rows (empty bands) and assign every blob to one of `cols` columns
    by its centre, so loose bits (impact lines, streaks) stay with their icon."""
    im = clean_alpha(im, thr)
    a = np.array(im)[:, :, 3] > 0
    out = []
    for y0, y1 in segments(a.any(1), 20):
        ra = a[y0:y1]
        boxes = [None] * cols
        for x0, x1 in segments(ra.any(0), 3):
            c = min(cols - 1, int(((x0 + x1) / 2) / (im.width / cols)))
            ys = np.nonzero(ra[:, x0:x1].any(1))[0]
            b = (x0, y0 + ys.min(), x1, y0 + ys.max() + 1)
            o = boxes[c]
            boxes[c] = b if o is None else (min(o[0], b[0]), min(o[1], b[1]), max(o[2], b[2]), max(o[3], b[3]))
        out.append([im.crop(b) for b in boxes])
    return out


def icon(src, box=S - 1, outline=0.85):
    s = min(box / src.width, box / src.height)
    w, h = max(1, round(src.width * s)), max(1, round(src.height * s))
    sm = outline_inner(down(src, (w, h)), outline)
    out = Image.new("RGBA", (S, S))
    out.alpha_composite(sm, ((S - w) // 2, (S - h) // 2))
    return out


if __name__ == "__main__":
    rows = grid_pieces(rgba(D("icons_med.png")), 5)
    assert len(rows) == 2, len(rows)
    pieces = rows[0] + rows[1]
    icons = [icon(p) for p in pieces]
    # glide: icons2_med has the ears stretched out like wings; keep only the head+ears blob
    # (drop the wind lines) and squash it into 24x17 so the face stays readable.
    from PIL import ImageDraw
    g = np.array(clean_alpha(rgba(D("icons2_med.png")), 100))
    m = Image.fromarray(((g[:, :, 3] > 0) * 255).astype(np.uint8), "L").copy()
    ImageDraw.floodfill(m, (470, 450), 128)
    g[np.array(m) != 128] = 0
    gi = Image.fromarray(g, "RGBA")
    gi = gi.crop(gi.getbbox())
    sm = outline_inner(down(gi, (24, 17)), 0.85)
    icons[1] = Image.new("RGBA", (S, S))
    icons[1].alpha_composite(sm, (0, 4))
    pal = make_palette([(im, 4 if k in (1, 3) else 1) for k, im in enumerate(icons)], 32, keep=(OUTLINE,))
    icons = [apply_palette(i, pal) for i in icons]
    sheet = Image.new("RGBA", (S * 10, S))
    for i, im in enumerate(icons):
        sheet.alpha_composite(im, (i * S, 0))
    sheet = clean_alpha(sheet)
    sheet.save(os.path.join(OUT, "ui-icons.png"), optimize=True)
    print("ui-icons", sheet.size, "colors", n_colors(sheet))
    with open(os.path.join(LV, "drafts", "_icons_entry.json"), "w") as f:
        json.dump({"ui-icons": {"file": "ui-icons.png", "width": 240, "height": 24, "frameWidth": 24,
                                "frameHeight": 24, "frames": 10}}, f)
