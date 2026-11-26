"""Cut Codex-generated salon art into game layers.

    .salon-art/.venv/bin/python tools/playground/salon-art.py diff  BASE EDITED OUT.png [--thresh 38] [--keep 400] [--grow 3] [--only x0,y0,x1,y1]
    .salon-art/.venv/bin/python tools/playground/salon-art.py patch BASE EDITED OUT.png x0,y0,x1,y1 [--feather 18]
    .salon-art/.venv/bin/python tools/playground/salon-art.py slice SHEET OUTDIR name1 name2 ...   (reading order)
    .salon-art/.venv/bin/python tools/playground/salon-art.py pack  SRC.png DEST.webp [--scale 0.5] [--trim] [--q 86]
    .salon-art/.venv/bin/python tools/playground/salon-art.py skin  SRC.png DEST.png FROM_HEX TO_HEX [--tol 60]

diff   keeps only what an edit added or changed (a hairstyle drawn on the bald master, a dress on the body).
patch  takes a rectangle of the edit with a soft edge (closed eyes, a laughing mouth) to lay over the master.
slice  splits a sheet of separate items on a transparent background into one file per item.
pack   writes the web copy; with --trim it also prints the box the picture kept, for the layer manifest.
skin   moves every pixel near one skin tone to another, keeping its shading.
"""
import json
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage


def load(path, size=None):
    im = Image.open(path).convert('RGBA')
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return im


def arr(im):
    return np.asarray(im).astype(np.float32)


def flag(args, name, default, cast=float):
    if name in args:
        i = args.index(name)
        v = args[i + 1]
        del args[i:i + 2]
        return cast(v)
    return default


def clean_alpha(a, keep=1500, grow=3):
    """The generator's cut-outs come with a faint haze and coloured specks around each item:
    keep the solid shapes and a thin anti-aliased rim, drop everything else."""
    al = a[..., 3]
    core = ndimage.binary_opening(al > 235, iterations=2)
    lab, n = ndimage.label(core)
    if n:
        sizes = ndimage.sum(core, lab, range(1, n + 1))
        core = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= keep])
    # Fill holes the threshold punched into a shape, not real openings (a ring's middle stays clear).
    holes, nh = ndimage.label(ndimage.binary_fill_holes(core) & ~core)
    if nh:
        hs = ndimage.sum(holes > 0, holes, range(1, nh + 1))
        core = core | np.isin(holes, [i + 1 for i, s in enumerate(hs) if s < 120])
    rim = ndimage.binary_dilation(core, iterations=grow)
    out = a.copy()
    out[..., 3] = np.where(core, np.maximum(al, 250), np.where(rim, al, 0))
    return out


def cmd_clean(args):
    keep = flag(args, '--keep', 1500, int)
    for p in args:
        a = arr(load(p))
        Image.fromarray(clean_alpha(a, keep).astype(np.uint8)).save(p)
        print(f'{p}: cleaned')


def over_grey(a):
    """Colour as seen over mid grey, so a transparent pixel and a visible one always differ."""
    al = a[..., 3:4] / 255
    return a[..., :3] * al + 128 * (1 - al)


def cmd_diff(args):
    thresh = flag(args, '--thresh', 38)
    keep = flag(args, '--keep', 400, int)
    grow = flag(args, '--grow', 3, int)
    only = flag(args, '--only', None, str)
    base_p, edit_p, out = args
    base = load(base_p)
    edit = load(edit_p, base.size)
    a, b = arr(base), arr(edit)
    d = np.abs(over_grey(a) - over_grey(b)).max(axis=2)
    mask = d > thresh
    mask = ndimage.binary_opening(mask, iterations=2)
    mask = ndimage.binary_closing(mask, iterations=4)
    mask = ndimage.binary_fill_holes(mask)
    lab, n = ndimage.label(mask)
    if n:
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        mask = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= keep])
    if only:
        x0, y0, x1, y1 = map(int, only.split(','))
        box = np.zeros_like(mask)
        box[y0:y1, x0:x1] = True
        mask &= box
    if grow:
        mask = ndimage.binary_dilation(mask, iterations=grow)
    soft = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    alpha = (np.asarray(soft).astype(np.float32) / 255) * b[..., 3]
    out_im = b.copy()
    out_im[..., 3] = alpha
    Image.fromarray(out_im.astype(np.uint8)).save(out)
    print(f'{out}: {int(mask.sum())} px changed')


def cmd_patch(args):
    feather = flag(args, '--feather', 18, int)
    base_p, edit_p, out, box = args
    base = load(base_p)
    edit = load(edit_p, base.size)
    x0, y0, x1, y1 = map(int, box.split(','))
    m = np.zeros((base.size[1], base.size[0]), np.float32)
    m[y0 + feather:y1 - feather, x0 + feather:x1 - feather] = 1
    m = ndimage.gaussian_filter(m, feather / 2)
    b = arr(edit)
    b[..., 3] *= m
    Image.fromarray(b.astype(np.uint8)).save(out)
    print(f'{out}: patch {box}')


def cmd_slice(args):
    sheet_p, outdir, *names = args
    im = load(sheet_p)
    a = clean_alpha(arr(im))
    solid = a[..., 3] > 24
    blob = ndimage.binary_dilation(solid, iterations=12)       # bits of one item (a sparkle beside a ring) stay together
    lab, n = ndimage.label(blob)
    boxes = ndimage.find_objects(lab)
    items = []
    for i, sl in enumerate(boxes):
        area = int(solid[sl].sum())
        if area < 900:
            continue
        ys, xs = sl
        items.append((ys.start, ys.stop, xs.start, xs.stop, i + 1, area))
    # reading order: rows (by centre y, grouped), then x
    items.sort(key=lambda t: (t[0] + t[1]) / 2)
    rows, row = [], []
    for t in items:
        if row and (t[0] + t[1]) / 2 - (row[0][0] + row[0][1]) / 2 > (row[0][1] - row[0][0]) * 0.6:
            rows.append(row)
            row = []
        row.append(t)
    if row:
        rows.append(row)
    ordered = [t for r in rows for t in sorted(r, key=lambda t: t[2])]
    if names and len(names) != len(ordered):
        print(f'warning: {len(ordered)} items found, {len(names)} names given', file=sys.stderr)
    for k, (y0, y1, x0, x1, label, area) in enumerate(ordered):
        piece = a[y0:y1, x0:x1].copy()
        piece[..., 3] *= (lab[y0:y1, x0:x1] == label)
        name = names[k] if k < len(names) else f'item{k}'
        Image.fromarray(piece.astype(np.uint8)).save(f'{outdir}/{name}.png')
        print(f'{name}: {x1 - x0}x{y1 - y0} at {x0},{y0}')


def cmd_pack(args):
    scale = flag(args, '--scale', 1.0)
    q = flag(args, '--q', 86, int)
    trim = '--trim' in args
    if trim:
        args.remove('--trim')
    src, dest = args
    im = load(src)
    W, H = im.size
    box = (0, 0, W, H)
    if trim:
        bb = im.getchannel('A').point(lambda v: 255 if v > 3 else 0).getbbox()
        if bb:
            pad = 4
            box = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(W, bb[2] + pad), min(H, bb[3] + pad))
            im = im.crop(box)
    if scale != 1:
        im = im.resize((max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))), Image.LANCZOS)
    im.save(dest, 'WEBP', quality=q, method=6, alpha_quality=90)
    # the box is in the source picture's own units, whatever the web copy's pixel size
    print(json.dumps({'src': dest.split('/')[-1], 'x': box[0], 'y': box[1], 'w': box[2] - box[0], 'h': box[3] - box[1]}))


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def cmd_skin(args):
    tol = flag(args, '--tol', 60)
    src, dest, from_hex, to_hex = args
    a = arr(load(src))
    f, t = hexrgb(from_hex), hexrgb(to_hex)
    rgb = a[..., :3]
    # how close each pixel is to the skin family: compare chroma direction and allow light/shade
    lum = rgb.mean(axis=2, keepdims=True) + 1
    fl = f.mean() + 1
    chroma_d = np.abs(rgb / lum - f / fl).sum(axis=2) * 100
    w = np.clip(1 - (chroma_d - tol * 0.5) / (tol * 0.5), 0, 1)
    w *= np.clip((lum[..., 0] - 40) / 40, 0, 1)           # outlines and pupils stay as they are
    ratio = rgb / f                                       # shading relative to the base tone
    moved = np.clip(ratio * t, 0, 255)
    a[..., :3] = rgb * (1 - w[..., None]) + moved * w[..., None]
    Image.fromarray(a.astype(np.uint8)).save(dest)
    print(f'{dest}: {int((w > 0.5).sum())} skin px')


if __name__ == '__main__':
    cmd, *rest = sys.argv[1:]
    {'clean': cmd_clean, 'diff': cmd_diff, 'patch': cmd_patch, 'slice': cmd_slice, 'pack': cmd_pack, 'skin': cmd_skin}[cmd](rest)
