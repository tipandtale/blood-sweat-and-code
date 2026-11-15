#!/usr/bin/env python3
"""
Builds the animated sprite sheets (png + json frame list), static SVG icons and
extension icon from three pixel-art source images.

Usage:
  python3 tools/build_sprites.py --seven seven.png --heart heart.png --sparkle sparkle.png

Sources must have a transparent background. The script detects each image's
real pixel grid, rebuilds it as a clean small bitmap, then generates:
  media/animations/{blip,boom,newline}.png + .json  (animated frames)
  media/{blip,boom,newline}.svg                      (static trail icons)
  media/icons/icon.svg, media/icon.png               (sidebar logo = heart, extension icon = heart + sparkles)

Frame geometry read by src/effects/EffectManager.ts from the .json files:
blip 8x(32x32), boom 7x(128x128 in a 6-col grid), newline 5x(64x64).
"""
import argparse, math, os, random
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA = os.path.join(ROOT, "media")


# ---------- art extraction ----------
def detect_grid(crop):
    H, W = crop.shape[:2]
    best = None
    for cell in np.arange(8, 80, 0.25):
        nx, ny = int(round(W / cell)), int(round(H / cell))
        if nx < 4 or ny < 4:
            continue
        cw, ch = W / nx, H / ny
        tot = 0.0
        for j in range(ny):
            for i in range(nx):
                blk = crop[int((j + .25) * ch):int((j + .75) * ch) + 1,
                           int((i + .25) * cw):int((i + .75) * cw) + 1]
                tot += blk.reshape(-1, 4).var(axis=0).sum()
        score = tot / (nx * ny)
        if best is None or score < best[0] - 1e-6:
            best = (score, nx, ny)
    return best[1], best[2]


def kmeans(colors, k, iters=30):
    # deterministic farthest-point init
    pts = colors.astype(float)
    cent = [pts[0]]
    while len(cent) < k:
        d = np.min([((pts - c) ** 2).sum(1) for c in cent], axis=0)
        cent.append(pts[int(d.argmax())])
    cent = np.array(cent)
    for _ in range(iters):
        lab = ((pts[:, None] - cent[None]) ** 2).sum(2).argmin(1)
        for i in range(k):
            if (lab == i).any():
                cent[i] = pts[lab == i].mean(0)
    return np.round(cent).astype(np.uint8), lab


def extract_art(path, k):
    im = np.array(Image.open(path).convert("RGBA")).astype(float)
    ys, xs = np.where(im[..., 3] > 128)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = im[y0:y1, x0:x1]
    nx, ny = detect_grid(crop)
    cw, ch = crop.shape[1] / nx, crop.shape[0] / ny
    art = np.zeros((ny, nx, 4), dtype=np.uint8)
    for j in range(ny):
        for i in range(nx):
            blk = crop[int((j + .25) * ch):int((j + .75) * ch) + 1,
                       int((i + .25) * cw):int((i + .75) * cw) + 1].reshape(-1, 4)
            med = np.median(blk, axis=0)
            if med[3] > 128:
                art[j, i, :3] = med[:3]
                art[j, i, 3] = 255
    mask = art[..., 3] > 0
    cent, lab = kmeans(art[mask][:, :3], k)
    art[mask, :3] = cent[lab]
    # The source cut-outs made some enclosed white cells transparent: fill any
    # transparent cell that can't reach the outside (4-connected) with the lightest colour.
    h, w = mask.shape
    outside = np.zeros((h, w), bool)
    stack = [(y, x) for y in range(h) for x in (0, w - 1)] + [(y, x) for x in range(w) for y in (0, h - 1)]
    while stack:
        y, x = stack.pop()
        if not (0 <= y < h and 0 <= x < w) or outside[y, x] or mask[y, x]:
            continue
        outside[y, x] = True
        stack += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    holes = ~mask & ~outside
    if holes.any():
        light = cent[cent.astype(int).sum(1).argmax()]
        art[holes, :3] = light
        art[holes, 3] = 255
    return art


# ---------- pixel sprite compositing ----------
def blit(canvas, art, cx, cy, scale, alpha=1.0, flash=0.0, tint=None):
    """Nearest-neighbour draw `art` centred at (cx,cy) with `scale` px per art pixel."""
    h, w = art.shape[:2]
    dw, dh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    x0, y0 = int(round(cx - dw / 2)), int(round(cy - dh / 2))
    ys = np.minimum(((np.arange(dh) + .5) / scale).astype(int), h - 1)
    xs = np.minimum(((np.arange(dw) + .5) / scale).astype(int), w - 1)
    patch = art[ys][:, xs].astype(float)
    if flash:
        patch[..., :3] = patch[..., :3] * (1 - flash) + 255 * flash
    if tint is not None:
        patch[..., :3] = tint
    patch[..., 3] *= alpha
    H, W = canvas.shape[:2]
    for py in range(dh):
        y = y0 + py
        if not 0 <= y < H:
            continue
        for px in range(dw):
            x = x0 + px
            if not 0 <= x < W:
                continue
            a = patch[py, px, 3] / 255
            if a <= 0:
                continue
            dst = canvas[y, x]
            da = dst[3] / 255
            oa = a + da * (1 - a)
            dst[:3] = (patch[py, px, :3] * a + dst[:3] * da * (1 - a)) / max(oa, 1e-6)
            dst[3] = oa * 255


def square(canvas, cx, cy, size, rgb, alpha=1.0):
    blit(canvas, np.array([[[*rgb, 255]]], dtype=np.uint8), cx, cy, size, alpha)


def components(art):
    mask = art[..., 3] > 0
    seen = np.zeros(mask.shape, bool)
    comps = []
    for y, x in zip(*np.where(mask)):
        if seen[y, x]:
            continue
        stack, cells = [(y, x)], []
        seen[y, x] = True
        while stack:
            cy, cx = stack.pop()
            cells.append((cy, cx))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
        comps.append(cells)
    return comps


# ---------- animations ----------
def blip_frames(heart):
    # pop in, overshoot, float up, fade
    sc = [0.8, 1.5, 2.3, 2.6, 2.3, 2.1, 2.0, 1.7]
    dy = [0, 0, 0, -1, -2, -4, -6, -8]
    al = [1, 1, 1, 1, 1, .9, .6, .3]
    out = []
    for i in range(8):
        c = np.zeros((32, 32, 4))
        blit(c, heart, 16, 17 + dy[i], sc[i], al[i], flash=0.35 if i == 2 else 0)
        out.append(c)
    return out


def boom_frames(seven):
    pal = [tuple(int(v) for v in c) for c in np.unique(seven[seven[..., 3] > 0][:, :3], axis=0)]
    warm = [p for p in pal if p[0] > 200] or pal  # orange / yellow bits for the burst
    rnd = random.Random(7)
    n = 14
    angles = [i * 2 * math.pi / n + rnd.uniform(-.12, .12) for i in range(n)]
    cols = [warm[rnd.randrange(len(warm))] for _ in range(n)]
    sc = [2.0, 4.2, 5.4, 5.0, 4.8, 4.5, 4.2]
    flash = [.75, .35, 0, 0, 0, 0, 0]
    al = [1, 1, 1, 1, .85, .55, .25]
    rad = [0, 30, 44, 54, 60, 65, 69]
    psz = [8, 9, 8, 7, 6, 4, 3]
    shake = [0, 0, 3, -3, 2, -1, 0]
    out = []
    for i in range(7):
        c = np.zeros((128, 128, 4))
        if i > 0:
            for a, col in zip(angles, cols):
                square(c, 64 + math.cos(a) * rad[i], 64 + math.sin(a) * rad[i], psz[i], col, al[i])
        blit(c, seven, 64 + shake[i], 64, sc[i], al[i], flash=flash[i])
        out.append(c)
    return out


def newline_frames(sparkle):
    comps = components(sparkle)
    h, w = sparkle.shape[:2]
    out = []
    gs = [1.5, 1.9, 2.1, 1.9, 1.5]
    fade = [1, 1, 1, .85, .5]
    for f in range(5):
        c = np.zeros((64, 64, 4))
        for k, cells in enumerate(comps):
            ys, xs = zip(*cells)
            sub = np.zeros((max(ys) - min(ys) + 1, max(xs) - min(xs) + 1, 4), dtype=np.uint8)
            for (yy, xx) in cells:
                sub[yy - min(ys), xx - min(xs)] = sparkle[yy, xx]
            scx = (min(xs) + max(xs) + 1) / 2
            scy = (min(ys) + max(ys) + 1) / 2
            phase = k / max(1, len(comps))
            pulse = 0.5 + 0.5 * abs(math.sin(math.pi * (f / 4 + phase)))
            s = gs[f] * (0.6 + 0.5 * pulse)
            dest_x = 32 + (scx - w / 2) * gs[f]
            dest_y = 32 + (scy - h / 2) * gs[f] - f * 0.8
            blit(c, sub, dest_x, dest_y, s, fade[f])
        out.append(c)
    return out


# ---------- writers ----------
def to_img(frame):
    return Image.fromarray(np.clip(frame, 0, 255).astype(np.uint8), "RGBA")


def write_sheet(path, frames, fw, fh, cols):
    rows = math.ceil(len(frames) / cols)
    sheet = Image.new("RGBA", (fw * min(cols, len(frames)), fh * rows), (0, 0, 0, 0))
    regions = []
    for i, f in enumerate(frames):
        x, y = (i % cols) * fw, (i // cols) * fh
        sheet.paste(to_img(f), (x, y))
        regions.append((x, y))
    sheet.save(path)
    return regions


def write_meta(path, regions, fw, fh, fps):
    import json
    meta = {"fps": fps, "frames": [{"x": x, "y": y, "w": fw, "h": fh} for (x, y) in regions]}
    with open(path, "w") as f:
        json.dump(meta, f)


def art_to_svg(art, path, width, height):
    h, w = art.shape[:2]
    rects = []
    for y in range(h):
        x = 0
        while x < w:
            if art[y, x, 3] == 0:
                x += 1
                continue
            col = tuple(art[y, x, :3])
            x2 = x
            while x2 + 1 < w and art[y, x2 + 1, 3] and tuple(art[y, x2 + 1, :3]) == col:
                x2 += 1
            rects.append('<rect x="%d" y="%d" width="%d" height="1" fill="#%02x%02x%02x"/>' % (x, y, x2 - x + 1, *col))
            x = x2 + 1
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" '
           'shape-rendering="crispEdges">%s</svg>' % (width, height, w, h, "".join(rects)))
    open(path, "w").write(svg)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seven", required=True, help="boom / delete effect + extension icon")
    ap.add_argument("--heart", required=True, help="typing blip effect")
    ap.add_argument("--sparkle", required=True, help="newline effect")
    a = ap.parse_args()

    seven = extract_art(a.seven, 7)
    heart = extract_art(a.heart, 4)
    sparkle = extract_art(a.sparkle, 5)
    print("grids  seven %s  heart %s  sparkle %s" % (seven.shape[:2], heart.shape[:2], sparkle.shape[:2]))

    anim = os.path.join(MEDIA, "animations")
    os.makedirs(anim, exist_ok=True)
    os.makedirs(os.path.join(MEDIA, "icons"), exist_ok=True)

    f = blip_frames(heart);  r = write_sheet(os.path.join(anim, "blip.png"), f, 32, 32, 8);  write_meta(os.path.join(anim, "blip.json"), r, 32, 32, 20)
    f = boom_frames(seven);  r = write_sheet(os.path.join(anim, "boom.png"), f, 128, 128, 6); write_meta(os.path.join(anim, "boom.json"), r, 128, 128, 16)
    f = newline_frames(sparkle); r = write_sheet(os.path.join(anim, "newline.png"), f, 64, 64, 5); write_meta(os.path.join(anim, "newline.json"), r, 64, 64, 12)

    art_to_svg(heart, os.path.join(MEDIA, "blip.svg"), 20, 16)
    art_to_svg(seven, os.path.join(MEDIA, "boom.svg"), 20, 23)
    art_to_svg(sparkle, os.path.join(MEDIA, "newline.svg"), 20, 22)
    art_to_svg(heart, os.path.join(MEDIA, "icons", "icon.svg"), 33, 27)  # sidebar logo: the pastel heart

    # Extension icon: pastel heart + sparkles on a soft lavender-to-pink gradient
    n = 256
    gx, gy = np.meshgrid(np.linspace(0, 1, n), np.linspace(0, 1, n))
    t = (gx + gy) / 2
    c0, c1 = np.array([142, 110, 226]), np.array([205, 140, 245])
    bg = np.zeros((n, n, 4))
    bg[..., :3] = c0 + (c1 - c0) * t[..., None]
    bg[..., 3] = 255
    mask = Image.new("L", (n, n), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, n - 1, n - 1), radius=56, fill=255)
    bg[..., 3] = np.array(mask)
    blit(bg, heart, 128, 132, 15)
    comps = sorted(components(sparkle), key=len)
    for cells, (cx, cy, sc) in zip(comps, [(206, 52, 5.5), (50, 196, 4.5), (60, 56, 3.5)]):
        ys, xs = zip(*cells)
        sub_art = np.zeros((max(ys) - min(ys) + 1, max(xs) - min(xs) + 1, 4), dtype=np.uint8)
        for (yy, xx) in cells:
            sub_art[yy - min(ys), xx - min(xs)] = sparkle[yy, xx]
        blit(bg, sub_art, cx, cy, sc)
    to_img(bg).save(os.path.join(MEDIA, "icon.png"))

    # contact sheet for eyeballing
    prev = Image.new("RGBA", (1100, 520), (30, 24, 48, 255))
    y = 0
    for name, frames, sz in (("blip", blip_frames(heart), 32), ("boom", boom_frames(seven), 128), ("newline", newline_frames(sparkle), 64)):
        x = 0
        for fr in frames:
            im = to_img(fr).resize((sz * 2 if sz < 128 else sz, sz * 2 if sz < 128 else sz), Image.NEAREST)
            prev.alpha_composite(im, (x, y))
            x += im.width + 4
        y += im.height + 8
    prev.save(os.path.join(ROOT, "tools", "preview.png"))


if __name__ == "__main__":
    main()
