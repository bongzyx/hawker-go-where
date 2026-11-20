"""Build MapLibre SDF glyph PBFs from Inter with OpenType features baked in.

usage: python3 scripts/build-glyphs.py <InterVariable.ttf> <reference glyph dir> public/fonts/glyphs
Needs Pillow built with raqm (for OpenType features) and numpy.
The reference dir (TransitGo's glyphs) only supplies which code points to include.
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(__file__))
import glyph_pbf as pbf

FONT, REF, OUT = sys.argv[1:4]
SIZE, BUFFER, RADIUS, CUTOFF, S = 24, 3, 8, 0.25, 4
FEATURES = ["cv05", "cv11"]  # keep in step with font-feature-settings in styles.css
WEIGHTS = {"Inter Regular": 400, "Inter Medium": 500, "Inter Bold": 700}
RANGES = ["0-255", "256-511", "8192-8447"]

def sdf_glyph(font, ch):
    adv = round(font.getlength(ch, features=FEATURES) / S)
    l, t, r, b = font.getbbox(ch, features=FEATURES, anchor="ls")
    if r - l <= 0 or b - t <= 0:
        return dict(w=0, h=0, left=0, top=-SIZE, adv=adv, bitmap=b"")
    pad = (BUFFER + RADIUS + 2) * S
    W, H = (r - l) + 2 * pad, (b - t) + 2 * pad
    ox, oy = pad - l, pad - t                       # baseline origin in hi-res pixels
    img = Image.new("L", (int(W), int(H)), 0)
    ImageDraw.Draw(img).text((ox, oy), ch, font=font, fill=255, anchor="ls", features=FEATURES)
    a = np.asarray(img)
    m = a >= 128
    ys, xs = np.nonzero(a > 0)
    if not len(xs):
        return dict(w=0, h=0, left=0, top=-SIZE, adv=adv, bitmap=b"")
    # Ink extents (getbbox reports the advance box, not the ink), relative to the origin.
    l, r, t, b = xs.min() - ox, xs.max() + 1 - ox, ys.min() - oy, ys.max() + 1 - oy

    # Edge points: midpoints between horizontally/vertically adjacent inside/outside pixels,
    # in 24px units relative to the glyph origin (y down).
    ys, xs = np.nonzero(m[:, 1:] != m[:, :-1]); ex = [xs + 1.0]; ey = [ys + 0.5]
    ys, xs = np.nonzero(m[1:, :] != m[:-1, :]); ex.append(xs + 0.5); ey.append(ys + 1.0)
    ex = (np.concatenate(ex) - ox) / S; ey = (np.concatenate(ey) - oy) / S

    left, top = int(np.floor(l / S)), int(np.ceil(-t / S))
    w, h = int(np.ceil(r / S)) - left, top + int(np.ceil(b / S))
    gx = left - BUFFER + np.arange(w + 2 * BUFFER) + 0.5
    gy = -top - BUFFER + np.arange(h + 2 * BUFFER) + 0.5
    PX, PY = np.meshgrid(gx, gy)
    d = np.sqrt(((PX[..., None] - ex) ** 2 + (PY[..., None] - ey) ** 2).min(axis=-1))
    hx = np.clip((PX * S + ox).astype(int), 0, m.shape[1] - 1)
    hy = np.clip((PY * S + oy).astype(int), 0, m.shape[0] - 1)
    d = np.where(m[hy, hx], -d, d)
    v = np.clip(np.round(255 - 255 * (d / RADIUS + CUTOFF)), 0, 255).astype(np.uint8)
    return dict(w=w, h=h, left=left, top=top - SIZE, adv=adv, bitmap=v.tobytes())

for name, wght in WEIGHTS.items():
    font = ImageFont.truetype(FONT, SIZE * S)
    font.set_variation_by_axes([14, wght])
    os.makedirs(os.path.join(OUT, name), exist_ok=True)
    for rng in RANGES:
        ids = sorted(pbf.read(os.path.join(REF, "Inter Regular", f"{rng}.pbf")))
        glyphs = {cp: sdf_glyph(font, chr(cp)) for cp in ids}
        pbf.write(os.path.join(OUT, name, f"{rng}.pbf"), name, rng, glyphs)
    print(name, "ok")
