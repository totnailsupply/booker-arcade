"""Rebuild public/assets/booker.png as 18 frames of 48x36.

Frames 0-9 are copied byte-for-byte (pixel-identical) from the Level 1 sheet backup
art/levels/raw/booker-l1-10frames.png. Frames 10-17 come from drafts/abil_med.png:
10-11 double-jump spin, 12-13 ear glide, 14 wall cling, 15 pounce, 16-17 zoomies dash.
New frames are snapped to the exact colours already used in the Level 1 Booker sheet,
so Booker's colours never change.

Run from booker-run:  python3 art/levels/scripts/build_booker.py
"""
import json
import os
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixlib import (LV, OUT, D, rgba, split_grid, clean_alpha, down, outline_inner, palette_from_image,
                    apply_palette)

FW, FH = 48, 36
L1 = rgba(os.path.join(LV, "raw", "booker-l1-10frames.png"))
assert L1.size == (480, 36), L1.size
PAL = palette_from_image(L1)

src = rgba(D("abil_med.png"))
from pixlib import segments
ys = segments((np.array(clean_alpha(src, 100))[:, :, 3] > 0).any(1), 20)
assert len(ys) == 2, ys
row1 = split_grid(src.crop((0, ys[0][0], src.width, ys[0][1])), max_gap=0)[0]
row2m = split_grid(src.crop((0, ys[1][0], src.width, ys[1][1])), max_gap=45)[0]   # dash incl. streaks
row2 = [p for p in split_grid(src.crop((0, ys[1][0], src.width, ys[1][1])), max_gap=0)[0] if p.height > 100]
assert len(row1) == 4 and len(row2) == 4, ([p.size for p in row1], [p.size for p in row2])
spin1, spin2, glide1, glide2 = row1
cling, pounce, dash1, dash2 = row2

# One uniform scale for the whole sheet (drawn at one scale), chosen so the dash
# (dog + streaks) is 46 px long; tall poses shrink just enough to fit 35 px.
S = 46 / max(p.width for p in row2m[2:])
STREAK = (252, 227, 185)  # Booker's lightest cream; thin lines would otherwise be eaten by the outline pass


def cell(piece, align="bottom", s=None, hx="mass"):
    s = s or S
    s = min(s, (FW - 1) / piece.width, (FH - 1) / piece.height)
    w, h = max(1, round(piece.width * s)), max(1, round(piece.height * s))
    sm = outline_inner(down(piece, (w, h)), 0.85)
    out = Image.new("RGBA", (FW, FH))
    a = np.array(sm)[:, :, 3] > 0
    if hx == "right":
        x = FW - w            # paws touch the frame's right edge (the wall)
    else:
        cx = np.nonzero(a)[1].mean()
        x = max(0, min(FW - w, int(round(FW / 2 - cx))))
    y = FH - h if align == "bottom" else max(0, (FH - h) // 2 + 3)
    out.alpha_composite(sm, (x, y))
    return out


new = [
    cell(spin1, "bottom"), cell(spin2, "bottom"),
    cell(glide1, "bottom"), cell(glide2, "bottom"),
    cell(cling, "bottom", hx="right"),
    cell(pounce, "bottom"),
    cell(dash1, "bottom"), cell(dash2, "bottom"),
]


def streaks(f, rows_len):
    """Light motion streaks behind the dashing dog (left of its tail)."""
    a = np.array(f)
    op = a[:, :, 3] > 0
    for y, ln, gap in rows_len:
        xs = np.nonzero(op[y])[0]
        x_end = (xs.min() if len(xs) else 24) - gap
        for x in range(max(0, x_end - ln), x_end):
            a[y, x] = (*STREAK, 255)
    return Image.fromarray(a, "RGBA")


# shift the dash dogs right to make room for the streaks
for i in (6, 7):
    f = new[i]
    bb = f.getbbox()
    shift = (FW - 1) - bb[2] + 1
    g = Image.new("RGBA", (FW, FH)); g.alpha_composite(f, (shift, 0)); new[i] = g
new[6] = streaks(new[6], [(22, 6, 2), (26, 8, 2), (30, 5, 3)])
new[7] = streaks(new[7], [(21, 7, 2), (25, 5, 3), (29, 8, 2)])
new = [apply_palette(f, PAL) for f in new]

sheet = Image.new("RGBA", (FW * 18, FH))
sheet.paste(L1, (0, 0))                      # frames 0-9 untouched
for i, f in enumerate(new):
    sheet.alpha_composite(f, ((10 + i) * FW, 0))
sheet = clean_alpha(sheet)
# sanity: frames 0-9 pixel-identical
assert np.array_equal(np.array(sheet)[:, :480], np.array(L1)), "frames 0-9 changed"
sheet.save(os.path.join(OUT, "booker.png"), optimize=True)
print("scale", S, "sheet", sheet.size)
for i, f in enumerate(new):
    a = np.array(f)[:, :, 3] > 0
    ys, xs = np.nonzero(a)
    print(10 + i, "bbox x", xs.min(), xs.max(), "y", ys.min(), ys.max())

entry = {"booker": {"file": "booker.png", "frameWidth": FW, "frameHeight": FH, "frames": 18,
                    "animations": {"run": [0, 1, 2, 3, 4, 5], "jump": [6], "fall": [7], "hurt": [8],
                                   "win": [9], "double": [10, 11], "glide": [12, 13], "cling": [14],
                                   "pounce": [15], "dash": [16, 17]}}}
with open(os.path.join(LV, "drafts", "_booker_entry.json"), "w") as f:
    json.dump(entry, f)
