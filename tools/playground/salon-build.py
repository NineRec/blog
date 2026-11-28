"""Turn the raw Codex pictures in .salon-art/ into the salon's web assets and their manifest.

    .salon-art/.venv/bin/python tools/playground/salon-build.py

Writes static/kids-playground/assets/salon/*.webp and static/kids-playground/js/salon/manifest.js.
Every layer keeps the box it occupies in its master picture, so layers stack back into place.
"""
import hashlib
import os
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

from salonart import slice_items, contact_sheet, matched_avif

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / '.salon-art'
OUT = ROOT / 'static/kids-playground/assets/salon'
MANIFEST = ROOT / 'static/kids-playground/js/salon/manifest.js'
OUT.mkdir(parents=True, exist_ok=True)


HIRES, HI = RAW / 'hires', 1.5      # salon-upscale.py's SeedVR2 upscales, and their factor


class Pic(np.ndarray):
    """A picture array that remembers the file it came from, through copies and edits, so save() can use its upscale."""
    def __array_finalize__(self, obj):
        self.src = getattr(obj, 'src', None)


def load(p):
    a = np.asarray(Image.open(RAW / p).convert('RGBA')).astype(np.float32).view(Pic)
    a.src = p
    return a


_hi = {}


def hires(src, shape):
    """The colours of `src` 1.5x sharper (float RGB), when its upscale exists and was made from the file as it is now."""
    if not src:
        return None
    if src not in _hi:
        f, tag = HIRES / src, (HIRES / src).with_suffix('.sha')
        ok = f.exists() and tag.exists() and tag.read_text() == hashlib.sha1((RAW / src).read_bytes()).hexdigest()
        _hi[src] = np.asarray(Image.open(f).convert('RGB').resize((round(shape[1] * HI), round(shape[0] * HI)), Image.LANCZOS)).astype(np.float32) if ok else None
    return _hi[src]


def have(*ps):
    return all((RAW / p).exists() for p in ps)


def clean(a, keep=1500, grow=3):
    al = a[..., 3]
    core = ndimage.binary_opening(al > 235, iterations=2)
    lab, n = ndimage.label(core)
    if n:
        sizes = ndimage.sum(core, lab, range(1, n + 1))
        core = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= keep])
    # Fill the pin-holes the threshold punches into a shape, not real openings (a ring's middle stays clear).
    holes, nh = ndimage.label(ndimage.binary_fill_holes(core) & ~core)
    if nh:
        hs = ndimage.sum(holes > 0, holes, range(1, nh + 1))
        core = core | np.isin(holes, [i + 1 for i, s in enumerate(hs) if s < 120])
    rim = ndimage.binary_dilation(core, iterations=grow)
    out = a.copy()
    out[..., 3] = np.where(core, np.maximum(al, 250), np.where(rim, al, 0))
    return out


def over_grey(a):
    al = a[..., 3:4] / 255
    return a[..., :3] * al + 128 * (1 - al)


def diff_mask(base, edit, thresh=38, keep=300, grow=4, box=None):
    d = np.abs(over_grey(base) - over_grey(edit)).max(axis=2)
    m = d > thresh
    m = ndimage.binary_opening(m, iterations=1)
    m = ndimage.binary_closing(m, iterations=4)
    m = ndimage.binary_fill_holes(m)
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= keep])
    if box:
        x0, y0, x1, y1 = box
        b = np.zeros_like(m)
        b[y0:y1, x0:x1] = True
        m &= b
    if grow:
        m = ndimage.binary_dilation(m, iterations=grow)
    return m


def layer_from(edit, mask, feather=1.6):
    soft = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(feather))).astype(np.float32) / 255
    out = edit.copy()
    out[..., 3] = edit[..., 3] * soft
    return out


def green(a):
    """How much each pixel is the flat green of a mask edit (0..1)."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    v = np.clip((g - np.maximum(r, b) - 60) / 80, 0, 1) * (a[..., 3] > 128)
    m = ndimage.binary_opening(v > 0.5, iterations=1)
    m = ndimage.binary_dilation(m, iterations=1)
    return m


REVIEW = []      # (name, picture, suspect pixels) for the review sheets
WARN = []        # other things to look at (an item cut off by its sheet's edge)


def strays(alpha, r=5, keep=200):
    """Pixels that are neither a solid shape nor touching one: thin lines and specks left over from a diff."""
    A = alpha > 6
    core = ndimage.binary_opening(A, iterations=r)
    lab, n = ndimage.label(core)
    if n:
        sizes = ndimage.sum(core, lab, range(1, n + 1))
        core = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= keep])
    return A & ~ndimage.binary_dilation(core, iterations=r + 3)


def outline_coloured(rgb):
    """Is a colour the warm orange-brown of her outline (what a redrawn arm or finger leaves behind in a diff)?"""
    r, g, b = rgb / 255
    mx, mn = max(r, g, b), min(r, g, b)
    if mx - mn < 1e-3:
        return False
    s = (mx - mn) / mx
    h = ((g - b) / (mx - mn) / 6) % 1 if mx == r else ((b - r) / (mx - mn) + 2) / 6 if mx == g else ((r - g) / (mx - mn) + 4) / 6
    return 0.025 < h < 0.08 and s > 0.42 and 0.45 < mx < 0.92


def outline_strays(a):
    """The stray pieces of a layer (see strays) that are outline-coloured, as one mask."""
    bad = strays(a[..., 3])
    lab, n = ndimage.label(bad, structure=np.ones((3, 3)))
    out = np.zeros(bad.shape, bool)
    for i, sl in enumerate(ndimage.find_objects(lab)):
        m = lab[sl] == i + 1
        px = a[sl][m]
        solid = px[px[:, 3] > 120]
        if len(solid) and outline_coloured(np.median(solid[:, :3], 0)):
            out[sl] |= m
    return out


def no_outline_strays(a):
    """A layer without its outline-coloured stray lines (thin parts in its own colours, a balloon string, stay)."""
    for _ in range(3):              # taking a piece away can leave the next one hanging loose
        m = outline_strays(a)
        if not m.any():
            break
        a = a.copy()
        a[..., 3] *= ~ndimage.binary_dilation(m, iterations=1)
    return a


def extract(e, m, solo=False):
    """
    A worn thing out of its picture: the layer (outline strays dropped) and the mask of what is left.
    solo: the thing is one compact piece (a ring, a bracelet): pieces away from the biggest one are dropped too.
    """
    L = no_outline_strays(layer_from(e, m))
    if solo:
        A = L[..., 3] > 40
        lab, n = ndimage.label(ndimage.binary_dilation(A, iterations=2))
        if n > 1:
            sizes = ndimage.sum(A, lab, range(1, n + 1))
            main = ndimage.find_objects(lab)[int(np.argmax(sizes))]
            y0, y1, x0, x1 = main[0].start, main[0].stop, main[1].start, main[1].stop
            py, px = (y1 - y0) * 0.15 + 6, (x1 - x0) * 0.15 + 6
            keep = np.zeros(A.shape, bool)
            for i, sl in enumerate(ndimage.find_objects(lab)):
                cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
                if y0 - py <= cy <= y1 + py and x0 - px <= cx <= x1 + px:
                    keep |= lab == i + 1
            L = L.copy()
            L[..., 3] *= keep
    return L, L[..., 3] > 40


def save(a, name, scale=1.0, trim=True, q=86, check=True):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')
    W, H = im.size
    box = (0, 0, W, H)
    if trim:
        bb = im.getchannel('A').point(lambda v: 255 if v > 3 else 0).getbbox()
        if not bb:
            return None
        pad = 3
        box = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(W, bb[2] + pad), min(H, bb[3] + pad))
        im = im.crop(box)
    if check and REVIEW is not None:
        arr = np.asarray(im)
        arr = arr.astype(np.float32)
        REVIEW.append((name, im, strays(arr[..., 3]), outline_strays(arr)))
    hi = hires(getattr(a, 'src', None), a.shape) if scale == 1 and a.ndim == 3 and a.shape[2] == 4 else None
    if hi is not None:
        # the same shape, 1.5x sharper: colours from the upscale, the edge from this picture's own alpha
        al = Image.fromarray(np.clip(a[..., 3], 0, 255).astype(np.uint8)).resize((hi.shape[1], hi.shape[0]), Image.LANCZOS)
        big = Image.fromarray(np.dstack([np.clip(hi, 0, 255), np.asarray(al, np.float32)]).astype(np.uint8), 'RGBA')
        im = big.crop(tuple(round(v * HI) for v in box))
    elif scale != 1:
        im = im.resize((max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))), Image.LANCZOS)
    if os.environ.get('SALON_DUMP'):         # the picture before encoding, to compare formats (avif-test.py)
        d = Path(os.environ['SALON_DUMP']); d.mkdir(parents=True, exist_ok=True)
        im.save(d / (name[:-5] + '.png'))
        (d / (name[:-5] + '.q')).write_text(str(q))
    im.save(OUT / name, 'WEBP', quality=q, method=6, alpha_quality=88)
    twin(im, name)
    return {'src': name, 'x': box[0], 'y': box[1], 'w': box[2] - box[0], 'h': box[3] - box[1]}


AVIF_CACHE = RAW / 'avif-cache.json'
_avif = json.loads(AVIF_CACHE.read_text()) if AVIF_CACHE.exists() else {}
AVIF = set()        # the WebPs that have an AVIF twin (written to the manifest)


def twin(im, name):
    """
    The picture also as AVIF when that is smaller at the same quality as its WebP (most pictures: about half the
    size; not the tiny masks). Devices that show AVIF load it instead (ui.js useAvif). Finding the quality takes a
    few seconds a picture, so it is remembered by the picture's content.
    """
    sha = hashlib.sha1(f'{im.mode}{im.size}'.encode() + im.tobytes()).hexdigest()
    out = OUT / (name[:-5] + '.avif')
    hit = _avif.get(name)
    if not (hit and hit['sha'] == sha and (hit['q'] is None or out.exists())):
        best = matched_avif(im, (OUT / name).read_bytes())
        if best:
            out.write_bytes(best[1])
        hit = _avif[name] = {'sha': sha, 'q': best[0] if best else None}
        AVIF_CACHE.write_text(json.dumps(_avif, indent=0, sort_keys=True))
    if hit['q'] is None:
        out.unlink(missing_ok=True)
    else:
        AVIF.add(name)


def mask_img(m, name, blur=1.2):
    a = np.zeros(m.shape + (4,), np.float32)
    a[..., :3] = 255
    a[..., 3] = m * 255
    soft = np.asarray(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))).astype(np.float32)
    return save(soft, name, q=80, check=False)


def centre(m):
    ys, xs = np.nonzero(m)
    return [round(float(xs.mean())), round(float(ys.mean()))]


def bbox(m):
    ys, xs = np.nonzero(m)
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]


def hexcol(rgb):
    return '#' + ''.join(f'{int(v):02x}' for v in rgb)


M = {}


def bust():
    if not have('master/m1.png', 'master/m2.png'):
        return
    m0, m1, m2 = load('master/m0.png'), load('master/m1.png'), load('master/m2.png')
    m1c = clean(m1)
    B = {'size': [m1.shape[1], m1.shape[0]]}
    B['base'] = save(clean(m2), 'bust-base.webp')
    brows = diff_mask(m2, m1, grow=3)
    B['brows'] = save(layer_from(m1c, brows), 'bust-brows.webp')
    B['browSet'] = {'natural': B['brows']}
    for p in sorted((RAW / 'brows').glob('*.png')) if (RAW / 'brows').exists() else []:
        e = clean(load(f'brows/{p.name}'))
        B['browSet'][p.stem] = save(layer_from(e, diff_mask(m2, e, grow=3)), f'bust-brows-{p.stem}.webp')
    bb = bbox(brows)
    lips = green(load('face/lips-mask.png')) if have('face/lips-mask.png') else None
    mouth_c = centre(lips) if lips is not None else [m1.shape[1] // 2, int(m1.shape[0] * 0.6)]
    # the band of the face where eyes are: under the brows, above the nose
    eye_top, eye_bot = bb[1] + (bb[3] - bb[1]) // 2 + 6, mouth_c[1] - 70
    mouth_top = mouth_c[1] - 60
    B['eyes'], B['mouth'] = {}, {}
    for name in ['shut', 'happy', 'wide', 'sad', 'squint', 'kiss']:
        p = f'face/{name}.png'
        if not have(p):
            continue
        e = clean(load(p))
        em = diff_mask(m1, e, box=(0, eye_top, m1.shape[1], mouth_top - 4), grow=6)
        mm = diff_mask(m1, e, box=(0, mouth_top - 4, m1.shape[1], m1.shape[0] - 260), grow=6)
        if em.sum() > 400:
            B['eyes'][name] = save(layer_from(e, em, 2.5), f'bust-eyes-{name}.webp')
        if mm.sum() > 200:
            mouth_name = {'happy': 'laugh', 'wide': 'o', 'squint': 'ew'}.get(name, name)
            B['mouth'][mouth_name] = save(layer_from(e, mm, 2.5), f'bust-mouth-{mouth_name}.webp')
    if have('face/lashes.png'):
        la = clean(load('face/lashes.png'))
        B['lashes'] = save(layer_from(la, diff_mask(m1, la, box=(0, eye_top - 40, m1.shape[1], mouth_top), grow=2)), 'bust-lashes.webp')
    if have('face/headband.png'):
        hb = clean(load('face/headband.png'))
        B['headband'] = save(layer_from(hb, diff_mask(m1, hb, grow=3)), 'bust-headband.webp')
    B['masks'] = {}
    if lips is not None:
        B['masks']['lips'] = mask_img(lips, 'mask-lips.webp')
    lids = None
    if have('face/lid-mask.png'):
        lids = green(load('face/lid-mask.png'))
        B['masks']['lids'] = mask_img(ndimage.binary_closing(lids, iterations=8), 'mask-lids.webp', blur=7)
    # the face: skin-coloured pixels of the head above the jaw (for face masks, dirt, cream)
    al = m2[..., 3] > 200
    rgb = m2[..., :3]
    cy, cx = int(m1.shape[0] * 0.45), m1.shape[1] // 2
    skin = np.median(rgb[cy - 20:cy + 20, cx - 20:cx + 20].reshape(-1, 3), axis=0)
    lum = rgb.mean(axis=2, keepdims=True) + 1
    near = (np.abs(rgb / lum - skin / (skin.mean() + 1)).sum(axis=2) * 100 < 16) & al & (rgb.mean(axis=2) > 120)
    lab, n = ndimage.label(ndimage.binary_opening(near, iterations=2))
    face = lab == lab[cy, cx]
    face = ndimage.binary_fill_holes(ndimage.binary_closing(face, iterations=6))
    B['masks']['face'] = mask_img(face, 'mask-face.webp')
    B['skin'] = hexcol(skin)
    fb = bbox(face)
    # eye colour: the iris, sampled just inside each eye
    shut_m = diff_mask(m1, load('face/shut.png'), box=(0, eye_top, m1.shape[1], mouth_top - 4)) if have('face/shut.png') else None
    eyes_box = bbox(shut_m) if shut_m is not None else [fb[0] + 60, eye_top, fb[2] - 60, mouth_top - 4]
    mid = (eyes_box[0] + eyes_box[2]) // 2
    left = shut_m.copy() if shut_m is not None else None
    if left is not None:
        left[:, mid:] = False
        right = shut_m.copy(); right[:, :mid] = False
        eL, eR = centre(left), centre(right)
    else:
        eL, eR = [mid - 150, (eye_top + mouth_top) // 2], [mid + 150, (eye_top + mouth_top) // 2]
    iris = m1[eL[1] - 6:eL[1] + 6, eL[0] - 6:eL[0] + 6, :3].reshape(-1, 3)
    B['eye'] = hexcol(np.median(iris, axis=0))
    B['eyeBox'] = [eyes_box[0] - 10, eyes_box[1] - 10, eyes_box[2] + 10, eyes_box[3] + 10]
    head = m0[..., 3] > 200
    top_y = int(np.nonzero(head[:, cx])[0].min())
    B['anchors'] = {
        'eyeL': eL, 'eyeR': eR, 'mouth': mouth_c,
        'cheekL': [eL[0] - 20, eL[1] + 120], 'cheekR': [eR[0] + 20, eR[1] + 120],
        'browL': [eL[0], bb[1] + 20], 'browR': [eR[0], bb[1] + 20],
        'forehead': [cx, (top_y + bb[1]) // 2 + 30], 'crown': [cx, top_y], 'chin': [cx, fb[3]],
        'nose': [cx, (eL[1] + mouth_c[1]) // 2 + 10], 'face': [cx, (fb[1] + fb[3]) // 2],
    }
    B['face'] = fb
    if lids is not None:
        B['anchors']['lidL'], B['anchors']['lidR'] = centre(lids & (np.arange(lids.shape[1]) < mid)), centre(lids & (np.arange(lids.shape[1]) >= mid))
    hats = worn_hats(m0)
    if hats:
        B['hats'] = hats
    M['BUST'] = B
    # hairstyles: drawn on the bald master m0
    H = {}
    for p in sorted((RAW / 'hair').glob('*.png')):
        e = clean(load(f'hair/{p.name}'))
        hm = diff_mask(m0, e, thresh=30, keep=2000, grow=2, box=(0, 0, m0.shape[1], m0.shape[0]))
        # a gap between curls that closes into a ring (wavy, beside her arm) is filled in as hair by the mask, but
        # there the picture is still the master's pale backdrop: white, unchanged, it showed as a grey heart once tinted
        rgb = e[..., :3]
        pale = (rgb.min(-1) > 200) & (np.ptp(rgb, -1) < 40) & (np.abs(rgb - m0[..., :3]).max(-1) < 30) & (m0[..., 3] > 200)
        lab, n = ndimage.label(ndimage.binary_opening(pale))
        if n:
            sizes = ndimage.sum(pale, lab, range(1, n + 1))
            hm &= ~ndimage.binary_dilation(np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 40]), iterations=1)
        H[p.stem] = save(layer_from(e, hm, 1.2), f'hair-{p.stem}.webp')
    M['HAIR'] = H


def hand():
    if not have('master/hand.png'):
        return
    h = clean(load('master/hand.png'))
    D = {'size': [h.shape[1], h.shape[0]], 'base': save(h, 'hand-base.webp')}
    if have('master/hand-mask.png'):
        g = green(load('master/hand-mask.png'))
        lab, n = ndimage.label(g)
        nails = sorted([lab == i + 1 for i in range(n) if (lab == i + 1).sum() > 800], key=lambda m: centre(m)[0])
        D['nails'] = []
        for i, m in enumerate(nails):
            entry = mask_img(m, f'mask-nail{i}.webp')
            entry['c'] = centre(m)
            D['nails'].append(entry)
    if have('master/hand-long.png'):
        lg = clean(load('master/hand-long.png'))
        lm = diff_mask(h, lg, grow=4)
        lab, n = ndimage.label(lm)
        parts = sorted([lab == i + 1 for i in range(n) if (lab == i + 1).sum() > 600], key=lambda m: centre(m)[0])
        # the long nail tips only: redrawn finger outlines are stripped, and pieces that were nothing else dropped
        # (the clipper would knock them off the finger)
        def tip_only(L):
            rgb = L[..., :3] / 255
            mx, mn = rgb.max(-1), rgb.min(-1)
            pink = (L[..., 3] > 120) & (rgb[..., 0] >= rgb[..., 1]) & (rgb[..., 2] > rgb[..., 1]) & ((mx - mn) / (mx + 1e-3) > 0.12)
            L = L.copy()
            L[..., 3] *= ndimage.binary_dilation(pink, iterations=10)     # the nail and its own rim, not the finger
            return L
        tips = [L for L in (tip_only(no_outline_strays(layer_from(lg, m, 1.4))) for m in parts) if (L[..., 3] > 120).sum() > 1500]
        for f in OUT.glob('hand-long*.webp'):
            f.unlink()
        D['long'] = [save(L, f'hand-long{i}.webp') for i, L in enumerate(tips)]
    D['skin'] = hexcol(np.median(h[h.shape[0] // 2 - 20:h.shape[0] // 2 + 20, h.shape[1] // 2 - 20:h.shape[1] // 2 + 20, :3].reshape(-1, 3), axis=0))
    if D.get('nails'):
        worn_jewelry(h, D, nails)
    M['HAND'] = D


def worn_hats(m0):
    """Hats drawn on the bald bust; and for each, the part of her hair the hat hides (above the hat's lower edge)."""
    hats = {}
    for p in sorted((RAW / 'worn').glob('hat-*.png')) if (RAW / 'worn').exists() else []:
        e = clean(load(f'worn/{p.name}'))
        m = no_threads(diff_mask(m0, e, keep=600, grow=2), r=3)
        if not m.any():
            continue
        L, _ = extract(e, m)
        L = drop_redrawn(L, e, m0)
        m = L[..., 3] > 40
        spec = save(L, f'worn-{p.stem}.webp')
        cols = np.nonzero(m.any(0))[0]
        bottom = {int(x): int(np.nonzero(m[:, x])[0].max()) for x in cols}
        hide = np.zeros(m.shape, bool)
        for x, yb in bottom.items():
            hide[:max(0, yb - 14), x] = True       # a little hair still peeks out under the edge
        hide = ndimage.binary_opening(hide, iterations=3)
        keep = np.zeros(m.shape + (4,), np.float32); keep[..., :3] = 255
        keep[..., 3] = np.where(hide, 0, 255)
        spec['keep'] = save(keep, f'worn-{p.stem}-keep.webp', scale=0.25, trim=False, q=70, check=False)['src']
        hats[p.stem] = spec
    return hats


def finger_axis(m):
    """A nail's direction (unit vector from the fingertip towards the palm) and its length along it."""
    ys, xs = np.nonzero(m)
    pts = np.stack([xs - xs.mean(), ys - ys.mean()], 1)
    w, v = np.linalg.eigh(np.cov(pts.T))
    u = v[:, np.argmax(w)]
    if u[1] < 0:
        u = -u
    proj = pts @ u
    return u, float(proj.max() - proj.min())


def width_at(alpha, p, u):
    """How wide the finger is at p, across the direction u."""
    v = np.array([-u[1], u[0]])
    def run(sign):
        for t in range(1, 400):
            x, y = (p + sign * t * v).round().astype(int)
            if not (0 <= y < alpha.shape[0] and 0 <= x < alpha.shape[1]) or alpha[y, x] < 128:
                return t
        return 400
    return run(1) + run(-1)


def midline(alpha, p, u):
    """The middle of the finger across p (p moved sideways onto it)."""
    v = np.array([-u[1], u[0]])
    def run(sign):
        for t in range(1, 400):
            x, y = (p + sign * t * v).round().astype(int)
            if not (0 <= y < alpha.shape[0] and 0 <= x < alpha.shape[1]) or alpha[y, x] < 128:
                return t
        return 400
    return p + v * (run(1) - run(-1)) / 2


def local_axis(alpha, p, u, reach=36):
    """A finger's direction where p is, from the middles of the finger a little above and below it (a thumb bends)."""
    for _ in range(2):
        a, b = midline(alpha, p - u * reach, u), midline(alpha, p + u * reach, u)
        u = (b - a) / np.linalg.norm(b - a)
    return u, midline(alpha, p, u)


def band(m, alpha, u):
    """
    Where a ring drawn on the middle finger sits: `at`, the middle of its band (between the band's two ends, so a
    big jewel does not move the ring up the finger), and `w0`, how wide the finger is there.
    """
    v = np.array([-u[1], u[0]])
    ys, xs = np.nonzero(m)
    pts = np.stack([xs, ys], 1).astype(float)
    across = pts @ v
    lo, hi = across.min(), across.max()
    ends = [pts[across < lo + 6].mean(0), pts[across > hi - 6].mean(0)]
    at = (ends[0] + ends[1]) / 2
    return {'at': [round(float(at[0])), round(float(at[1]))], 'w0': width_at(alpha, at, u), 'span': round(float(hi - lo))}


def worn_jewelry(h, D, nails):
    """Rings drawn worn on the middle finger, and where a ring sits on every finger; bracelets worn on the wrist."""
    alpha = h[..., 3]
    geo = []
    for m in nails:
        u, ln = finger_axis(m)
        geo.append({'c': np.array(centre(m), float), 'u': u, 'len': ln})
    mid = min(range(len(geo)), key=lambda i: geo[i]['c'][1])
    D['ringFinger'] = mid
    for n, f in zip(D['nails'], geo):
        n['u'] = [round(float(v), 4) for v in f['u']]
        n['len'] = round(f['len'])
    rings, at = {}, None
    for p in sorted((RAW / 'worn').glob('ring-*.png')) if (RAW / 'worn').exists() else []:
        e = clean(load(f'worn/{p.name}'))
        m = diff_mask(h, e, keep=200, grow=2)
        if not m.any():
            continue
        L, m = extract(e, m, solo=True)
        # Only the ring: where the edit still shows her finger as it was (the skin and outline around the band,
        # which the grown, feathered diff takes along) it goes, softly, so the band ends crisp at her outline
        # instead of trailing a blur of finger past it.
        d = np.abs(e[..., :3] - h[..., :3]).max(-1)
        L[..., 3] *= np.clip((d - 14) / 26, 0, 1)
        L[..., 3] *= ndimage.binary_dilation(extract(L, L[..., 3] > 40, solo=True)[1], iterations=2)
        # Seen from above, a band goes round the sides of the finger out of sight: whatever the edit drew past her
        # finger's outline (bands are drawn a little wide, the rainbow's straight one most) is cut there, softly,
        # so every band ends on the outline and fits any finger once scaled to its width.
        # (only her finger's own: a ring drawn low reaches over the next fingers, which are opaque too)
        g = geo[mid]
        ga, gc = local_axis(alpha, np.array(centre(m), float), g['u'])
        gv, half = np.array([-ga[1], ga[0]]), width_at(alpha, gc, ga) / 2 + 3
        yy, xx = np.mgrid[:alpha.shape[0], :alpha.shape[1]]
        own = np.abs((xx - gc[0]) * gv[0] + (yy - gc[1]) * gv[1]) <= half
        on = ndimage.gaussian_filter((ndimage.binary_dilation(alpha > 128, iterations=2) & own).astype(np.float32), 1.0)
        L[..., 3] *= on
        m = L[..., 3] > 40
        rings[p.stem] = save(L, f'worn-{p.stem}.webp')
        rings[p.stem].update(band(m, alpha, ga))
        at = at or rings[p.stem]['at']
    g = geo[mid]
    gu = local_axis(alpha, np.array(at, float), g['u'])[0] if at else g['u']     # the middle finger where rings were drawn
    w0 = width_at(alpha, np.array(at, float) if at else g['c'] + g['u'] * 2.2 * g['len'], g['u'])
    D['fingers'] = []
    for i, f in enumerate(geo):
        # A ring is worn low, on the finger's first segment just above where it joins the hand: the web is where
        # the finger suddenly widens (it meets the palm or the next finger), and the band sits ~0.4 of a finger's
        # width above it, so the whole band, ends and all, is on the finger.
        wn = width_at(alpha, f['c'] + f['u'] * f['len'] * 0.9, f['u'])
        web = next((t for t in range(int(f['len'] * 0.9), 900, 4) if width_at(alpha, f['c'] + f['u'] * t, f['u']) > wn * 1.5), None)
        t = web - 0.4 * wn if web else 2.2 * f['len']
        r = f['c'] + f['u'] * max(f['len'] * 1.1, t)
        # square to the finger and on its middle where the ring is (the nail's direction is the tip's; a thumb bends)
        lu, r = local_axis(alpha, r, f['u'])
        D['fingers'].append({'c': [round(v) for v in f['c']], 'u': [round(float(v), 4) for v in lu], 'ring': [round(float(v)) for v in r],
                             'w': width_at(alpha, r, lu), 'w0': w0, 'ang': round(float(np.degrees(np.arctan2(lu[1], lu[0]) - np.arctan2(gu[1], gu[0]))), 2)})
    D['rings'] = rings
    bracelets = {}
    for p in sorted((RAW / 'worn').glob('bracelet-*.png')) if (RAW / 'worn').exists() else []:
        e = clean(load(f'worn/{p.name}'))
        m = diff_mask(h, e, keep=300, grow=2)
        if m.any():
            L, m = extract(e, m, solo=True)
            bracelets[p.stem] = save(L, f'worn-{p.stem}.webp')
            bracelets[p.stem]['at'] = centre(m)
    if bracelets:
        D['bracelets'] = bracelets
    # the wrist: where the arm leaves the picture, and how wide it is there
    y = alpha.shape[0] - 200
    xs = np.nonzero(alpha[y] > 128)[0]
    if len(xs):
        D['wrist'] = {'at': [int((xs.min() + xs.max()) // 2), y], 'w': int(xs.max() - xs.min())}


def body_coloured(a):
    """Her skin and its outline (warm, not grey or white like the vest and shorts), where `a` is solid."""
    rgb = a[..., :3] / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    c = mx - mn
    r, g, bl = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - bl) / np.maximum(c, 1e-3) / 6) % 1, 0.5)
    sat = c / np.maximum(mx, 1e-3)
    return (a[..., 3] > 200) & (mx == r) & (h > 0.01) & (h < 0.12) & (sat > 0.1) & (mx > 0.35)


def redrawn_body(e, b, r=3, thr=28):
    """
    Pixels of an edit that are just her body drawn again, up to `r` px off: the same colour as her skin or outline
    within r px in the master, where the master shows body or nothing (never the vest or shorts the clothes cover).
    A dress edit redraws the head's edge and the arms' outlines slightly moved; without this they come out as lines
    (above her head, along her arms) in the dress layer.
    """
    body = body_coloured(b)
    E = e[..., :3]
    best = np.full(E.shape[:2], 1e9, np.float32)
    H, W = best.shape
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            ys, yd = (slice(dy, H), slice(0, H - dy)) if dy >= 0 else (slice(0, H + dy), slice(-dy, H))
            xs, xd = (slice(dx, W), slice(0, W - dx)) if dx >= 0 else (slice(0, W + dx), slice(-dx, W))
            d = np.abs(E[yd, xd] - b[ys, xs, :3]).max(-1)
            d = np.where(body[ys, xs], d, 1e9)
            best[yd, xd] = np.minimum(best[yd, xd], d)
    covered = (b[..., 3] > 200) & ~body          # the vest and shorts: whatever the edit drew there is clothes
    return (best < thr) & ~covered & (e[..., 3] > 128)


def skin_outline(a):
    """Her skin and its warm orange-brown outline (light peach to brown), for a whole picture."""
    rgb = a[..., :3] / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    r, g, bl = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.where(mx == r, ((g - bl) / np.maximum(mx - mn, 1e-3) / 6) % 1, 0.5)
    return (a[..., 3] > 6) & (hue > 0.02) & (hue < 0.09) & (sat > 0.3) & (mx > 0.45)


def drop_redrawn(layer, e, master, thin_only=False):
    """
    A worn thing's layer without her own body drawn again a pixel or two off (the edge of her head, an arm's or a
    finger's outline) — only along its edge: inside it, a colour close to skin is the thing's own shading.
    """
    R = redrawn_body(e, master)
    R &= ~ndimage.binary_fill_holes((layer[..., 3] > 40) & ~R)
    if thin_only:       # a hand closed round a stick is new skin over the old hand: only lines go, not shapes
        R &= ~ndimage.binary_dilation(ndimage.binary_opening(layer[..., 3] > 40, iterations=4), iterations=1)
    out = layer.copy()
    out[..., 3] *= ~R
    out[..., 3] *= no_threads(out[..., 3] > 6)      # what that leaves hanging loose
    return out


def sheet_pieces(sheet):
    """The items of a prop sheet at full size, by name (as SHEETS lists them)."""
    p = f'props/{sheet}.png'
    if not have(p):
        return {}
    a = clean(load(p))
    out = {}
    for name, it in zip(SHEETS[sheet].split(), slice_items(a[..., 3])):
        y0, y1, x0, x1 = it['box']
        piece = a[y0:y1, x0:x1].copy()
        piece[..., 3] *= it['mask']
        out[name] = piece
    return out


def fit_whole(item, e, b):
    """
    The whole item (from its sheet) placed on the master canvas where the edit shows it: the scale and position at
    which it best covers what the edit drew beside her body (searched on a small copy), so it lines up with the worn
    picture it was drawn from.
    """
    H, W = b.shape[:2]
    shows = (e[..., 3] > 128) & (b[..., 3] < 128)
    # only solid parts: the edit also redraws her outline a pixel wider all round, which must not count
    shows = ndimage.binary_opening(shows, iterations=4)
    lab, n = ndimage.label(shows)
    if n:
        sizes = ndimage.sum(shows, lab, range(1, n + 1))
        shows = np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v >= 2000])
    ys, xs = np.nonzero(shows)
    iy, ix = np.nonzero(item[..., 3] > 128)
    s0 = (xs.max() - xs.min()) / (ix.max() - ix.min())
    q = 4                                                   # search on a quarter-size copy
    T = shows[::q, ::q]
    hide = (b[..., 3] >= 128)[::q, ::q]
    ia = Image.fromarray((item[..., 3] > 128).astype(np.uint8) * 255)
    best = (-1, None)
    for sk in np.arange(0.88, 1.121, 0.02):
        s = s0 * sk
        w, h = max(1, round(item.shape[1] * s / q)), max(1, round(item.shape[0] * s / q))
        I = np.asarray(ia.resize((w, h), Image.BILINEAR)) > 127
        cx = (xs.min() + xs.max()) / 2 / q
        top = ys.min() / q - (iy.min() * s / q)
        for dy in range(-8, 9):
            for dx in range(-6, 7):
                x0, y0 = round(cx - w / 2) + dx, round(top) + dy
                P = np.zeros_like(T)
                ya, yb, xa, xb = max(0, y0), min(T.shape[0], y0 + h), max(0, x0), min(T.shape[1], x0 + w)
                if ya >= yb or xa >= xb:
                    continue
                P[ya:yb, xa:xb] = I[ya - y0:yb - y0, xa - x0:xb - x0]
                P &= ~hide
                iou = (P & T).sum() / max(1, (P | T).sum())
                if iou > best[0]:
                    best = (iou, (s, x0 * q, y0 * q))
    iou, (s, x0, y0) = best
    w, h = round(item.shape[1] * s), round(item.shape[0] * s)
    im = Image.fromarray(np.clip(item, 0, 255).astype(np.uint8), 'RGBA').resize((w, h), Image.LANCZOS)
    canvas = Image.new('RGBA', (W, H))
    canvas.paste(im, (int(x0), int(y0)))
    print(f'   whole back item: scale {s:.2f}, overlap {iou:.0%}')
    if iou < 0.45:       # the whole drawing is never quite the worn one: butterfly 55% and cape 50% look right on her
        WARN.append(f'back item fitted with only {iou:.0%} overlap: check it on her')
    return np.asarray(canvas).astype(np.float32)


def in_front(e, b, keep=1200):
    """What a back item's edit drew over her body (a cape's knot at the neck), as a layer, or None."""
    m = diff_mask(b, e, keep=keep, grow=2) & (b[..., 3] > 128)
    R = redrawn_body(e, b)
    m &= ~(R & ~ndimage.binary_fill_holes(m & ~R))
    m = no_threads(m, keep=keep)
    if m.sum() < keep:
        return None
    L, _ = extract(e, m, solo=True)
    return L if (L[..., 3] > 120).sum() >= keep else None


def body_keep(b, e, near, name, min_px=300, reach=40, also=None):
    """
    A keep picture for the body (opaque where it still shows) hiding what the edit `e` shows as background but the
    master `b` draws (the vest beside a fitted dress), close to the worn thing (`near`), and `also`; None when
    nothing is hidden.
    """
    gone = (b[..., 3] > 128) & (e[..., 3] < 60) & ndimage.binary_dilation(near, iterations=reach)
    if also is not None:
        gone |= also
    gone = ndimage.binary_opening(gone, iterations=2)
    lab, n = ndimage.label(gone)
    if n:
        sizes = ndimage.sum(gone, lab, range(1, n + 1))
        gone = np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v >= min_px])
    if gone.sum() < min_px:
        return None
    gone = ndimage.binary_dilation(gone, iterations=2)
    base = M['BODY']['base']
    bx, by, bw, bh = base['x'], base['y'], base['w'], base['h']
    keep = np.zeros((bh, bw, 4), np.float32)
    keep[..., :3] = 255
    keep[..., 3] = np.where(gone[by:by + bh, bx:bx + bw], 0, 255)
    return save(keep, f'{name}-keep.webp', scale=0.5, trim=False, q=70, check=False)['src']


def clothes_regions(b):
    """
    Where the master's own clothes are: {'dress': vest and shorts, 'top': the vest, 'bottom': the shorts}. They are
    the solid, not-skin part of the body; the vest's hem is the row with the most shadow between the two.
    """
    cov = ndimage.binary_opening((b[..., 3] > 200) & ~body_coloured(b), iterations=2)
    lab, n = ndimage.label(cov)
    if not n:
        return {}
    sizes = ndimage.sum(cov, lab, range(1, n + 1))
    cov = lab == int(np.argmax(sizes)) + 1           # the eyes are not-skin too, but small and apart
    ys = np.nonzero(cov.any(1))[0]
    y0, y1 = ys.min() + (ys.max() - ys.min()) // 2, ys.max() - 40
    dark = [((b[y, :, :3].min(-1) < 200) & cov[y]).sum() for y in range(y0, y1)]
    hem = y0 + int(np.argmax(dark))
    rows = np.arange(b.shape[0])[:, None]
    return {'dress': cov, 'top': cov & (rows < hem + 6), 'bottom': cov & (rows >= hem - 6)}


def body():
    if not have('master/body.png'):
        return
    b = clean(load('master/body.png'))
    M['BODY'] = {'size': [b.shape[1], b.shape[0]], 'base': save(b, 'body-base.webp')}
    M['BODY']['skin'] = hexcol(np.median(b[int(b.shape[0] * 0.75):int(b.shape[0] * 0.75) + 10, b.shape[1] // 2 - 120:b.shape[1] // 2 - 110, :3].reshape(-1, 3), axis=0))
    whole = sheet_pieces('backs')
    covers = clothes_regions(b)
    for p in sorted((RAW / 'wear').glob('*.png')) if (RAW / 'wear').exists() else []:
        e = clean(load(f'wear/{p.name}'))
        wear = M['BODY'].setdefault('wear', {})
        if p.stem.startswith('back-') and f'icon-{p.stem}' in whole:
            # Wings and capes sit behind her: the whole thing goes on the back layer (her body hides its middle),
            # not the bits of it the edit shows beside her. Only what lies over her body stays a layer of its own
            # in front (a cape's knot at the neck).
            wear[p.stem] = save(fit_whole(whole[f'icon-{p.stem}'], e, b), f'wear-{p.stem}.webp')
            front = in_front(e, b)
            if front is not None:
                wear[p.stem]['front'] = save(front, f'wear-{p.stem}-front.webp')
            continue
        layer, cut = extract(e, no_threads(diff_mask(b, e, keep=800, grow=2)))
        # Whatever the edit drew over what this replaces (a dress: vest and shorts; a top: the vest; bottoms: the
        # shorts) is the new clothes, even where it looks like the old (a white tutu over white shorts): no holes,
        # and no edge of the old shorts left showing under a hem.
        kind = p.stem.split('-')[0]
        part, rim = covers.get(kind), None
        if part is not None and kind in ('top', 'bottom'):
            # A top or bottoms replace half her clothes, and the edit leaves what it did not change as it was: the
            # other half's vest or shorts at the waist, and the rim of the old shorts (vest) beside slimmer jeans
            # (a slimmer top). Neither is the new piece: the waist stays the body's, the rim is hidden.
            band = covers['top'] & covers['bottom']
            same = (np.abs(e[..., :3] - b[..., :3]).max(-1) < 28) & (e[..., 3] > 128)
            part = part & ~same
            rim = ndimage.binary_opening(covers[kind] & same & ~band, iterations=2)
        if part is not None:
            add = ndimage.gaussian_filter((part & (e[..., 3] > 128)).astype(np.float32), 1.2)
            layer[..., 3] = np.maximum(layer[..., 3], e[..., 3] * add)
        layer = drop_redrawn(layer, e, b)
        # and once more on the picture itself: a stray outline the hole filling joined to the clothes
        layer[..., 3] *= no_threads(layer[..., 3] > 6)
        if p.stem.startswith('dress-'):
            # Every dress came with shoes: cut them off at the ankle so shoes are a choice of their own.
            cut = ankle(layer[..., 3] > 40)
            shoes = layer.copy(); shoes[:cut, :, 3] = 0
            layer[cut:, :, 3] = 0
            wear['shoes-' + p.stem[6:]] = save(shoes, f'wear-shoes-{p.stem[6:]}.webp')
        wear[p.stem] = save(layer, f'wear-{p.stem}.webp')
        # Clothes narrower than her vest and shorts (a fitted dress): the picture shows background between the
        # dress and her arm where the master has vest. Those parts of the body picture are hidden while it is worn.
        keep = body_keep(b, e, cut, f'wear-{p.stem}', also=rim)
        if keep:
            wear[p.stem]['keep'] = keep


    holds, shelf = {}, sheet_pieces('handheld')
    for p in sorted((RAW / 'worn').glob('hold-*.png')) if (RAW / 'worn').exists() else []:
        e = clean(load(f'worn/{p.name}'))
        m = no_threads(diff_mask(b, e, keep=600, grow=2))
        if not m.any():
            continue
        m |= strings(b, e, m)
        L, m = extract(e, m)
        # Her arm, moved a few px by the new pose, leaves thin slivers of skin and outline away from any solid
        # shape (the curled fist is new skin too, but solid, and its outline hugs it); things in her hand are drawn
        # above her clothes, so a sliver would cross a sleeve. Strings and sticks are other colours and stay
        # (drop_redrawn's thread filter would take a balloon's string too, so it is not used here).
        solid = ndimage.binary_dilation(ndimage.binary_opening(L[..., 3] > 40, iterations=9), iterations=6)
        L[..., 3] *= ~(skin_outline(L) & ~solid)
        lab, n = ndimage.label(L[..., 3] > 6, structure=np.ones((3, 3)))     # specks that leaves loose
        if n:
            sizes = ndimage.sum(L[..., 3] > 6, lab, range(1, n + 1))
            L[..., 3] *= np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v >= 400])
        behind = None
        if p.stem in HELD_WHOLE and p.stem in shelf:
            behind, L, lift = held_whole(shelf[p.stem], L, HELD_WHOLE[p.stem])
        spec = save(L, f'worn-{p.stem}.webp')
        if behind is not None:
            spec['behind'] = save(behind, f'worn-{p.stem}-behind.webp')
            spec['behind']['y'] -= lift
        # where her open hand was and is no longer (fingers now curled, the tips well below the fist): hidden
        keep = body_keep(b, e, m, f'worn-{p.stem}', reach=110, min_px=150)
        if keep:
            spec['keep'] = keep
        holds[p.stem] = spec
    if holds:
        M['BODY']['hold'] = holds


def hsv(a):
    """Hue, saturation and value (0..1) of a picture's colours."""
    rgb = a[..., :3] / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    c = mx - mn
    r, g, bl = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    cc = np.maximum(c, 1e-6)
    h = np.where(mx == r, ((g - bl) / cc) % 6, np.where(mx == g, (bl - r) / cc + 2, (r - g) / cc + 4)) / 6
    return np.where(c > 1e-6, h, 0), c / np.maximum(mx, 1e-6), mx


def recolour(a, m, hue, sat_k=1.0):
    """The pixels `m` of `a` in another hue (shading kept: value as it was, saturation times sat_k)."""
    _, s, v = hsv(a)
    s = np.clip(s * sat_k, 0, 1)
    h6 = hue * 6
    i, f = np.floor(h6) % 6, h6 - np.floor(h6)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    rgb = np.select([i[..., None] == k for k in range(6)],
                    [np.dstack(x) for x in ((v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q))])
    out = a.copy()
    out[..., :3] = np.where(m[..., None], rgb * 255, a[..., :3])
    return out


def rotated_onto(up, axis, top, end, shape):
    """
    The upright picture `up` (its axis the column `axis`, its top at row 0) turned and moved so that the axis runs
    from `top` towards `end` (body points), on a canvas of `shape` (premultiplied, so no dark fringe).
    """
    d = np.subtract(end, top).astype(float)
    dx, dy = d / np.hypot(*d)
    tx, ty = top
    im = Image.fromarray(np.clip(up, 0, 255).astype(np.uint8), 'RGBA').convert('RGBa')
    coeffs = (dy, -dx, axis - dy * tx + dx * ty, dx, dy, -dx * tx - dy * ty)
    out = im.transform((shape[1], shape[0]), Image.AFFINE, coeffs, resample=Image.BICUBIC).convert('RGBA')
    return np.asarray(out).astype(np.float32)


# Long things held up (an umbrella over her shoulder) are drawn whole from the shelf picture, behind her (like wings:
# her head and hair hide the canopy's edge, so there is no gap whatever her hair), with only her fist from the edit in
# front. The edit's own umbrella was drawn round the master's big bald head, so on the real head it stood off to the
# side, its shaft bent. canopy: where its top sits (centre x, top y) and how wide it is, in body units; stick: the
# scale of the shaft and hook (the canopy is far bigger than on the shelf, the stick about as thick as her fist holds).
HELD_WHOLE = {'hold-umbrella': {'canopy': (600, -170, 860), 'stick': 0.95}}


def held_whole(piece, L, spec):
    """
    (back, fist, lift): the shelf umbrella upright, its short shaft made long and straight (and the shelf's lavender shaft
    pink like its hook), turned so it runs from the canopy spot down through her fist; and the fist alone (`L` is
    the edit's layer: fist and umbrella). `back` starts `lift` rows above the body picture (the canopy rises over it).
    """
    H, W = L.shape[:2]
    h, s, v = hsv(L)
    pink = (L[..., 3] > 6) & ((h > 0.8) | (h < 0.015)) & (s > 0.15)
    fist = (L[..., 3] > 6) & ~pink
    lab, n = ndimage.label(fist, structure=np.ones((3, 3)))
    sizes = ndimage.sum(fist, lab, range(1, n + 1))
    fist = lab == int(np.argmax(sizes)) + 1
    front = L.copy()
    front[..., 3] *= ndimage.gaussian_filter(ndimage.binary_dilation(fist, iterations=1).astype(np.float32), 0.7)
    ys, xs = np.nonzero(fist)
    f_top, f_bot = ys.min(), ys.max()
    # where the shaft goes into her fist (the edit's shaft just above it)
    band = pink[max(0, f_top - 30):f_top - 4]
    bx = np.nonzero(band.any(0))[0]
    grip = (float((bx.min() + bx.max()) / 2) if len(bx) else float(xs.mean()), float(f_top))

    # the shelf umbrella: canopy rows, a plain run of shaft, then collar and hook
    piece = np.asarray(piece, np.float32)
    a = piece[..., 3] > 128
    widths = a.sum(1)
    y = int(np.argmax(widths))                      # the canopy's widest row; the shaft is the narrow run below it
    while widths[y] >= 0.1 * widths.max():
        y += 1
    s0 = y
    while abs(int(widths[y + 1]) - int(widths[s0 + 2])) <= 3:
        y += 1
    s0, s1 = s0 + 4, y - 4                          # the plain shaft (below the canopy, above the collar)
    cols = np.nonzero(a[(s0 + s1) // 2])[0]
    axis = (cols.min() + cols.max()) / 2
    ph, ps, _ = hsv(piece)
    hook_hue = float(np.median(ph[s1 + 8:][(piece[s1 + 8:, :, 3] > 200) & (ps[s1 + 8:] > 0.3)]))
    lav = (piece[..., 3] > 6) & (ph > 0.6) & (ph < 0.85)
    piece = recolour(piece, lav, hook_hue, sat_k=1.8)

    cx, cy, cw = spec['canopy']
    kc, ks = cw / a.any(0).sum(), spec.get('stick', 1.0)    # canopy and stick have scales of their own
    top = (cx, cy)
    # the collar sits just under her fist, on the line from the canopy through the grip
    d = np.subtract(grip, top); d = d / np.hypot(*d)
    end = np.add(grip, d * (f_bot - grip[1] - 6) / d[1])
    length = np.hypot(*np.subtract(end, top))            # body units, top to collar

    def scaled(x, k):
        return np.asarray(Image.fromarray(np.clip(x, 0, 255).astype(np.uint8), 'RGBA').convert('RGBa').resize(
            (max(1, round(x.shape[1] * k)), max(1, round(x.shape[0] * k))), Image.LANCZOS).convert('RGBA')).astype(np.float32)

    # the canopy, without the bit of shaft under it (the stick is drawn again, thinner, behind it)
    ax = int(round(axis))
    emerge = next(y for y in range(s0, 0, -1) if not lav[y, ax])     # where the shaft comes out under the canopy
    half = (cols.max() - cols.min()) / 2 + 3
    canopy = piece[:s0].copy()
    xx = np.arange(piece.shape[1])
    canopy[emerge + 1:, np.abs(xx - axis) <= half, 3] = 0
    C = scaled(canopy, kc)
    stick_row = scaled(piece[s1:s1 + 1, cols.min() - 2:cols.max() + 3], ks)
    hook = scaled(piece[s1:], ks)
    # the upright umbrella: axis at column X, top at row 0, collar at row `length`
    X = max(axis * kc, (axis - cols.min() + 2) * ks, axis * ks) + 2
    Wd = int(X + max(C.shape[1] - axis * kc, hook.shape[1] - axis * ks) + 4)
    Ht = int(length + hook.shape[0] + 2)
    up = np.zeros((Ht, Wd, 4), np.float32)

    def put(pic, x0, y0):
        x0, y0 = int(round(x0)), int(round(y0))
        h, w = pic.shape[:2]
        h, w = min(h, Ht - y0), min(w, Wd - x0)
        dst = up[y0:y0 + h, x0:x0 + w]
        src = pic[:h, :w]
        al = src[..., 3:] / 255
        dst[..., :3] = src[..., :3] * al + dst[..., :3] * (1 - al)
        dst[..., 3:] = src[..., 3:] + dst[..., 3:] * (1 - al)

    y0 = emerge * kc * 0.8                                     # the stick starts well inside the canopy
    stick = np.repeat(stick_row, int(length - y0) + 2, 0)
    put(stick, X - (axis - cols.min() + 2) * ks, y0)
    put(hook, X - axis * ks, length)
    put(C, X - axis * kc, 0)
    lift = max(0, int(-cy) + 40)                               # room above the body picture for the canopy
    back = rotated_onto(up, X, (cx, cy + lift), (end[0], end[1] + lift), (H + lift, W + 300))     # and beside it
    lean = np.degrees(np.arctan2(end[0] - top[0], end[1] - top[1]))
    print(f'   whole held item: canopy x{kc:.2f}, stick x{ks:.2f}, {length:.0f} units long, lean {lean:.1f}°')
    return back, front, lift


def worn_goggles(g, anchors):
    """
    Swimming goggles as worn: the shelf picture without the strap arching over the top (worn, it goes round her
    head, behind her hair), the lenses see-through (her eyes show), stretched a little taller and centred on her eyes.
    Returns the picture (bust units) or None.
    """
    h, s, v = hsv(g)
    A = g[..., 3]
    solid = A > 128
    glass = solid & (v > 0.8) & (s < 0.45)
    lab, n = ndimage.label(glass)
    if n < 2:
        return None
    sizes = ndimage.sum(glass, lab, range(1, n + 1))
    lenses = sorted([bbox(lab == i + 1) for i in np.argsort(sizes)[::-1][:2]], key=lambda b: b[0])
    teal = solid & (h > 0.4) & (h < 0.52) & (s > 0.3)
    yy, xx = np.mgrid[:g.shape[0], :g.shape[1]]
    keep = ndimage.binary_dilation(teal, iterations=3)
    for x0, y0, x1, y1 in lenses:
        # the frame: from the glass up to the gap under the arch
        c = (x0 + x1) // 2
        t = 0
        while y0 - t - 1 > 0 and A[y0 - t - 1, c] > 60:
            t += 1
        t += 1
        ex, ey, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 + t, (y1 - y0) / 2 + t
        keep |= ((xx - ex) / rx) ** 2 + ((yy - ey) / ry) ** 2 <= 1
        inner = ((xx - ex) / ((x1 - x0) / 2 + 1)) ** 2 + ((yy - ey) / ((y1 - y0) / 2 + 1)) ** 2 <= 1
        # see-through glass; its white glints stay
        shine = np.clip((0.3 - s) / 0.2, 0, 1) * np.clip((v - 0.9) / 0.08, 0, 1)
        clear = ndimage.gaussian_filter((inner & glass).astype(np.float32), 0.8)
        A = A * (1 - clear * (1 - (0.38 + 0.62 * shine)))
    (lx0, ly0, lx1, ly1), (rx0, ry0, rx1, ry1) = lenses
    mid = (ly0 + ly1) / 2
    keep |= (xx > lx1 - 4) & (xx < rx0 + 4) & (np.abs(yy - mid) < (ly1 - ly0) * 0.3)      # the bridge
    out = g.copy()
    out[..., 3] = A * ndimage.gaussian_filter(keep.astype(np.float32), 0.6)
    # on her: lens centres on her eyes, a little taller than the shelf picture so the frames go round them
    (ex0, ey), (ex1, _) = anchors['eyeL'], anchors['eyeR']
    gl, gr = ((lx0 + lx1) / 2, (ly0 + ly1) / 2), ((rx0 + rx1) / 2, (ry0 + ry1) / 2)
    sx = (ex1 - ex0) / (gr[0] - gl[0])
    sy = sx * 1.3
    w, hh = round(g.shape[1] * sx), round(g.shape[0] * sy)
    im = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA').convert('RGBa').resize((w, hh), Image.LANCZOS).convert('RGBA')
    x, y = round(ex0 - gl[0] * sx), round(ey - 6 - gl[1] * sy)
    return np.asarray(im).astype(np.float32), x, y


def glasses_worn():
    """BUST.glasses: glasses with a worn picture of their own (the goggles), in bust units."""
    if 'BUST' not in M:
        return
    pieces = sheet_pieces('hats')
    if 'gl-goggles' not in pieces:
        return
    got = worn_goggles(pieces['gl-goggles'], M['BUST']['anchors'])
    if got is None:
        return
    pic, x, y = got
    spec = save(pic, 'worn-gl-goggles.webp')
    spec['x'] += x; spec['y'] += y
    M['BUST']['glasses'] = {'gl-goggles': spec}


def strings(b, e, m):
    """
    A balloon's string, a ribbon end: thin new lines of a colour that is not her skin, joined to the thing `m`.
    diff_mask's opening and no_threads remove lines this thin, so they are put back here.
    """
    d = np.abs(over_grey(b) - over_grey(e)).max(axis=2) > 38
    line = d & (e[..., 3] > 100) & ~skin_outline(e)
    lab, n = ndimage.label(line | m, structure=np.ones((3, 3)))
    if not n:
        return line
    return line & np.isin(lab, np.unique(lab[m])) & ndimage.binary_dilation(line, iterations=1)


def no_threads(m, r=4, keep=1500):
    """Drop thin strays from a diff (a redrawn arm outline, a hair-thin line): keep only what a disc of radius r fits in, and what touches it."""
    core = ndimage.binary_opening(m, iterations=r)
    lab, n = ndimage.label(core)
    if n:
        sizes = ndimage.sum(core, lab, range(1, n + 1))
        core = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= keep])
    return m & ndimage.binary_dilation(core, iterations=r + 2)


def ankle(m, lo=1100, hi=1415, fallback=1392):
    """The row where a dress ends and its shoes begin: the last empty row above the feet, else just above the feet."""
    rows = m.any(1)
    empty = [y for y in range(lo, hi) if not rows[y]]
    return max(empty) + 1 if empty else fallback


SHEETS = {
    'backs': 'icon-back-angel icon-back-butterfly icon-back-dragon icon-back-cape',
    'products': 'pr-polish pr-polish-brush pr-shadow-pot pr-shadow-wand pr-blush-brush pr-lipstick pr-gloss pr-mascara pr-dye pr-glitter',
    'spa-tools': 'wash sponge shower towel brush cotton spoon cream bowl',
    'spa-food': 'strawberry cucumber lemon avocado blueberry rose honey oats kiwi',
    'spa-patches': 'patch-star patch-heart patch-flower patch-cloud mud1 mud2 smudge pimple leaf',
    'hair-tools': 'scissors comb dryer curler straightener tonic dye shampoo-pink shampoo-mint shampoo-blue glitter mirror',
    'hair-acc': 'bow-pink bow-blue bow-yellow clip-star clip-heart clip-butterfly crown-flower tiara catears pearls hibiscus scrunchie',
    'makeup-tools': 'brow-pencil shadow-brush liner mascara blush-brush lipstick gloss blush palette',
    'stickers': 'st-star st-heart st-rainbow st-butterfly st-flower st-gem st-moon st-strawberry st-ladybug st-bow st-sparkle st-sun',
    'nail-tools': 'soap nail-sponge clipper file oil polish',
    'germs': 'germ1 germ2 germ3 germ4 germ1-scared germ2-scared germ3-scared germ4-scared',
    'gems': 'gem-pink gem-heart gem-star gem-drop pearl charm-flower gem-mint charm-heart',
    'jewelry': 'ring-heart ring-blue ring-flower ring-crystal ring-rainbow ring-pearl ring-star ring-butterfly bracelet-beads bracelet-hearts bracelet-rainbow bracelet-pearl',
    'lobby': 'pedestal camera polaroid plant star stool',
    'hats': 'hat-sun hat-beret hat-party hat-cap hat-beanie hat-unicorn gl-heart gl-star gl-round gl-cateye gl-goggles gl-rainbow',
    'handheld': 'hold-wand hold-flowers hold-balloon hold-umbrella hold-bag hold-teddy hold-icecream hold-lollipop',
}


def sheets():
    P = {}
    for sheet, names in SHEETS.items():
        p = f'props/{sheet}.png'
        if not have(p):
            continue
        a = clean(load(p))
        ordered = slice_items(a[..., 3])          # shared with salon-gen.py's sheet check
        names = names.split()
        if len(ordered) != len(names):
            print(f'!! {sheet}: {len(ordered)} items for {len(names)} names')
        for k, it in enumerate(ordered[:len(names)]):
            y0, y1, x0, x1 = it['box']
            piece = a[y0:y1, x0:x1].copy()
            piece[..., 3] *= it['mask']
            if it['edge']:
                WARN.append(f'p-{names[k]}.webp: touches the edge of {sheet}.png (cut off?)')
            scale = min(1.0, 360 / max(piece.shape[:2]))
            e = save(piece, f'p-{names[k]}.webp', scale=scale, q=84)
            P[names[k]] = {'src': e['src'], 'w': e['w'], 'h': e['h']}
    M['PROPS'] = P


# Props made locally with mflux (a reference prop + a small edit), drawn on plain white: name → file in .salon-art/mflux/.
LOCAL = {'polish-pink': 'polish-pink.png'}


def local_props():
    """Cut each local picture off its white background (the white that touches the border) and add it to PROPS."""
    for name, f in LOCAL.items():
        if not have(f'mflux/{f}'):
            continue
        a = load(f'mflux/{f}')
        white = (a[..., :3].min(-1) > 238)
        lab, _ = ndimage.label(white)
        edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        bg = np.isin(lab, list(edge))
        bg = ndimage.binary_opening(bg, iterations=1)
        a[..., 3] = np.where(bg, 0, 255)
        a = clean(a)
        e = save(a, f'p-{name}.webp', scale=min(1.0, 360 / max(a.shape[:2])), q=84)
        M['PROPS'][name] = {'src': e['src'], 'w': e['w'], 'h': e['h']}


def vector_props():
    """
    Props drawn as SVG (tools/playground/salon-svg/<name>.svg) take the place of the painted picture of the same
    name: sharp at any size and a third of the bytes. The box keeps the painted one's height, so nothing moves.
    """
    import re
    for f in sorted((ROOT / 'tools/playground/salon-svg').glob('*.svg')):
        name, svg = f.stem, re.sub(r'>\s+<', '><', f.read_text()).strip()
        vw, vh = (float(v) for v in re.search(r'viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"', svg).groups())
        old = M['PROPS'].get(name, {})
        h = old.get('h') or round(vh)
        (OUT / f'p-{name}.svg').write_text(svg)
        for ext in ('webp', 'avif'):
            (OUT / f'p-{name}.{ext}').unlink(missing_ok=True)
        AVIF.discard(f'p-{name}.webp')
        M['PROPS'][name] = {'src': f'p-{name}.svg', 'w': round(h * vw / vh), 'h': h}


def backgrounds():
    G = {}
    for p in sorted((RAW / 'bg').glob('*.png')) if (RAW / 'bg').exists() else []:
        im = Image.open(p).convert('RGB')
        up = HIRES / 'bg' / p.name
        w = 1800
        if up.exists() and up.with_suffix('.sha').exists() and up.with_suffix('.sha').read_text() == hashlib.sha1(p.read_bytes()).hexdigest():
            im, w = Image.open(up).convert('RGB'), 2400      # an iPad in landscape is ~2400 device px wide
        im = im.resize((w, round(im.size[1] * w / im.size[0])), Image.LANCZOS)
        im.save(OUT / f'bg-{p.stem}.webp', 'WEBP', quality=78, method=6)
        twin(im, f'bg-{p.stem}.webp')
        G[p.stem] = f'bg-{p.stem}.webp'
    M['BG'] = G


def review(limit=150):
    """
    Contact sheets of every picture (on flat grey, suspect pixels in magenta) in .salon-art/review/, one per group,
    review.json with the numbers for each picture, and a warning for each picture with more than `limit` stray
    outline-coloured pixels or other trouble. Look at the sheets after every build.
    """
    out = RAW / 'review'
    out.mkdir(exist_ok=True)
    for f in out.glob('*.png'):
        f.unlink()
    groups, warn, stats = {}, list(WARN), {}
    for name, im, bad, line in REVIEW:
        a = np.asarray(im)[..., 3]
        stats[name] = {'size': list(im.size), 'opaque': int((a > 128).sum()), 'thin': int(bad.sum()), 'outline_strays': int(line.sum())}
        if line.sum() > limit:
            warn.append(f'{name}: {int(line.sum())} outline-coloured stray px')
    for name, im, bad, line in REVIEW:
        hot = any(w.startswith(name + ':') for w in warn)
        groups.setdefault(name.split('-')[0], []).append((name, im, bad, hot))
    for g, items in groups.items():
        contact_sheet(items).save(out / f'{g}.png')
    (out / 'warnings.txt').write_text('\n'.join(warn) + '\n')
    (out / 'review.json').write_text(json.dumps({'warnings': warn, 'pictures': stats}, indent=1))
    print(f'review: {len(REVIEW)} pictures in {len(groups)} sheets (.salon-art/review/), {len(warn)} warnings (magenta: every thin piece, to look over)')
    for w in warn:
        print('  !', w)


if __name__ == '__main__':
    bust(); hand(); body(); sheets(); local_props(); vector_props(); glasses_worn(); backgrounds()
    if '--no-review' not in sys.argv:
        review()
    js = '// Generated by tools/playground/salon-build.py — do not edit by hand.\n// Every layer: its file and the box it covers in its master picture.\n'
    for k, v in M.items():
        js += f'export const {k} = {json.dumps(v, separators=(",", ":"))};\n'
    js += '// The pictures that also come as .avif, smaller at the same quality (ui.js useAvif switches to them).\n'
    js += f'export const AVIF = {json.dumps(sorted(AVIF), separators=(",", ":"))};\n'
    MANIFEST.write_text(js)
    for f in OUT.glob('*.avif'):        # twins of pictures that are gone, or that WebP now stores smaller
        if f.stem + '.webp' not in AVIF:
            f.unlink()
    webp = sum(f.stat().st_size for f in OUT.glob('*.webp'))
    served = sum((OUT / (n[:-5] + '.avif')).stat().st_size if n in AVIF else f.stat().st_size for f in OUT.glob('*.webp') for n in [f.name])
    print(f'{len(list(OUT.glob("*.webp")))} files, {webp / 1e6:.1f} MB as WebP, {served / 1e6:.1f} MB with {len(AVIF)} AVIF twins; manifest: {", ".join(M)}')
    if 'BUST' in M:
        print(json.dumps({k: M['BUST'][k] for k in ('anchors', 'skin', 'eye', 'eyeBox', 'face')}))
