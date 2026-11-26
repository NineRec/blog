"""Turn the raw Codex pictures in .salon-art/ into the salon's web assets and their manifest.

    .salon-art/.venv/bin/python tools/playground/salon-build.py

Writes static/kids-playground/assets/salon/*.webp and static/kids-playground/js/salon/manifest.js.
Every layer keeps the box it occupies in its master picture, so layers stack back into place.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / '.salon-art'
OUT = ROOT / 'static/kids-playground/assets/salon'
MANIFEST = ROOT / 'static/kids-playground/js/salon/manifest.js'
OUT.mkdir(parents=True, exist_ok=True)


def load(p):
    return np.asarray(Image.open(RAW / p).convert('RGBA')).astype(np.float32)


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


def save(a, name, scale=1.0, trim=True, q=86):
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
    if scale != 1:
        im = im.resize((max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))), Image.LANCZOS)
    im.save(OUT / name, 'WEBP', quality=q, method=6, alpha_quality=88)
    return {'src': name, 'x': box[0], 'y': box[1], 'w': box[2] - box[0], 'h': box[3] - box[1]}


def mask_img(m, name, blur=1.2):
    a = np.zeros(m.shape + (4,), np.float32)
    a[..., :3] = 255
    a[..., 3] = m * 255
    soft = np.asarray(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))).astype(np.float32)
    return save(soft, name, q=80)


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
        D['long'] = [save(layer_from(lg, m, 1.4), f'hand-long{i}.webp') for i, m in enumerate(parts)]
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
        spec = save(layer_from(e, m), f'worn-{p.stem}.webp')
        cols = np.nonzero(m.any(0))[0]
        bottom = {int(x): int(np.nonzero(m[:, x])[0].max()) for x in cols}
        hide = np.zeros(m.shape, bool)
        for x, yb in bottom.items():
            hide[:max(0, yb - 14), x] = True       # a little hair still peeks out under the edge
        hide = ndimage.binary_opening(hide, iterations=3)
        keep = np.zeros(m.shape + (4,), np.float32); keep[..., :3] = 255
        keep[..., 3] = np.where(hide, 0, 255)
        spec['keep'] = save(keep, f'worn-{p.stem}-keep.webp', scale=0.25, trim=False, q=70)['src']
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
        rings[p.stem] = save(layer_from(e, m), f'worn-{p.stem}.webp')
        rings[p.stem]['at'] = centre(m)
        at = at or centre(m)
    g = geo[mid]
    # without ring pictures, a ring sits a little over two nail lengths below the middle fingertip
    L = float((np.array(at) - g['c']) @ g['u']) if at else 2.2 * g['len']
    w0 = width_at(alpha, np.array(at, float) if at else g['c'] + g['u'] * L, g['u'])
    if True:
        D['fingers'] = []
        for i, f in enumerate(geo):
            # down the finger, but not past where it widens into the palm (or touches the next finger)
            wn = width_at(alpha, f['c'] + f['u'] * f['len'] * 0.9, f['u'])
            t, stop = f['len'] * 0.9, L * (f['len'] / g['len']) ** 0.6
            while t < stop and width_at(alpha, f['c'] + f['u'] * t, f['u']) < wn * 1.35:
                t += 4
            r = f['c'] + f['u'] * max(f['len'] * 1.1, min(stop, t - 64))
            D['fingers'].append({'c': [round(v) for v in f['c']], 'u': [round(float(v), 4) for v in f['u']], 'ring': [round(float(v)) for v in r],
                                 'w': width_at(alpha, r, f['u']), 'w0': w0, 'ang': round(float(np.degrees(np.arctan2(f['u'][1], f['u'][0]) - np.arctan2(g['u'][1], g['u'][0]))), 2)})
        D['rings'] = rings
    bracelets = {}
    for p in sorted((RAW / 'worn').glob('bracelet-*.png')) if (RAW / 'worn').exists() else []:
        e = clean(load(f'worn/{p.name}'))
        m = diff_mask(h, e, keep=300, grow=2)
        if m.any():
            bracelets[p.stem] = save(layer_from(e, m), f'worn-{p.stem}.webp')
            bracelets[p.stem]['at'] = centre(m)
    if bracelets:
        D['bracelets'] = bracelets
    # the wrist: where the arm leaves the picture, and how wide it is there
    y = alpha.shape[0] - 200
    xs = np.nonzero(alpha[y] > 128)[0]
    if len(xs):
        D['wrist'] = {'at': [int((xs.min() + xs.max()) // 2), y], 'w': int(xs.max() - xs.min())}


def body():
    if not have('master/body.png'):
        return
    b = clean(load('master/body.png'))
    M['BODY'] = {'size': [b.shape[1], b.shape[0]], 'base': save(b, 'body-base.webp', scale=0.75)}
    M['BODY']['skin'] = hexcol(np.median(b[int(b.shape[0] * 0.75):int(b.shape[0] * 0.75) + 10, b.shape[1] // 2 - 120:b.shape[1] // 2 - 110, :3].reshape(-1, 3), axis=0))
    for p in sorted((RAW / 'wear').glob('*.png')) if (RAW / 'wear').exists() else []:
        e = clean(load(f'wear/{p.name}'))
        layer = layer_from(e, no_threads(diff_mask(b, e, keep=800, grow=2)))
        # and once more on the picture itself: a stray outline the hole filling joined to the clothes
        # (a wider radius only where a thick stray outline is known: it would eat thin ties and straps elsewhere)
        layer[..., 3] *= no_threads(layer[..., 3] > 6, r={'dress-sailor': 8, 'dress-mermaid': 8}.get(p.stem, 4))
        wear = M['BODY'].setdefault('wear', {})
        if p.stem.startswith('dress-'):
            # Every dress came with shoes: cut them off at the ankle so shoes are a choice of their own.
            cut = ankle(layer[..., 3] > 40)
            shoes = layer.copy(); shoes[:cut, :, 3] = 0
            layer[cut:, :, 3] = 0
            wear['shoes-' + p.stem[6:]] = save(shoes, f'wear-shoes-{p.stem[6:]}.webp', scale=0.75)
        wear[p.stem] = save(layer, f'wear-{p.stem}.webp', scale=0.75)


    holds = {}
    for p in sorted((RAW / 'worn').glob('hold-*.png')) if (RAW / 'worn').exists() else []:
        e = clean(load(f'worn/{p.name}'))
        m = no_threads(diff_mask(b, e, keep=600, grow=2))
        if not m.any():
            continue
        spec = save(layer_from(e, m), f'worn-{p.stem}.webp', scale=0.75)
        # where her open hand was and is no longer (fingers now curled): hide that part of the body picture
        near = ndimage.binary_dilation(m, iterations=30)
        hole = near & (b[..., 3] > 128) & (e[..., 3] < 60)
        hole = ndimage.binary_dilation(hole, iterations=2)
        bx, by, bw, bh = M['BODY']['base']['x'], M['BODY']['base']['y'], M['BODY']['base']['w'], M['BODY']['base']['h']
        keep = np.zeros((bh, bw, 4), np.float32); keep[..., :3] = 255
        keep[..., 3] = np.where(hole[by:by + bh, bx:bx + bw], 0, 255)
        k = save(keep, f'worn-{p.stem}-keep.webp', scale=0.5, trim=False, q=70)
        spec['keep'] = k['src']
        holds[p.stem] = spec
    if holds:
        M['BODY']['hold'] = holds


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
        solid = a[..., 3] > 24
        blob = ndimage.binary_dilation(solid, iterations=12)
        lab, n = ndimage.label(blob)
        items = []
        for i, sl in enumerate(ndimage.find_objects(lab)):
            if solid[sl].sum() < 900:
                continue
            items.append((sl[0].start, sl[0].stop, sl[1].start, sl[1].stop, i + 1))
        items.sort(key=lambda t: (t[0] + t[1]) / 2)
        rows, row = [], []
        for t in items:
            if row and (t[0] + t[1]) / 2 - (row[0][0] + row[0][1]) / 2 > (row[0][1] - row[0][0]) * 0.6:
                rows.append(row); row = []
            row.append(t)
        if row:
            rows.append(row)
        ordered = [t for r in rows for t in sorted(r, key=lambda t: t[2])]
        names = names.split()
        if len(ordered) != len(names):
            print(f'!! {sheet}: {len(ordered)} items for {len(names)} names')
        for k, (y0, y1, x0, x1, label) in enumerate(ordered[:len(names)]):
            piece = a[y0:y1, x0:x1].copy()
            piece[..., 3] *= (lab[y0:y1, x0:x1] == label)
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


def backgrounds():
    G = {}
    for p in sorted((RAW / 'bg').glob('*.png')) if (RAW / 'bg').exists() else []:
        im = Image.open(p).convert('RGB')
        w = 1800
        im = im.resize((w, round(im.size[1] * w / im.size[0])), Image.LANCZOS)
        im.save(OUT / f'bg-{p.stem}.webp', 'WEBP', quality=78, method=6)
        G[p.stem] = f'bg-{p.stem}.webp'
    M['BG'] = G


if __name__ == '__main__':
    bust(); hand(); body(); sheets(); local_props(); backgrounds()
    js = '// Generated by tools/playground/salon-build.py — do not edit by hand.\n// Every layer: its file and the box it covers in its master picture.\n'
    for k, v in M.items():
        js += f'export const {k} = {json.dumps(v, separators=(",", ":"))};\n'
    MANIFEST.write_text(js)
    total = sum(f.stat().st_size for f in OUT.glob('*.webp'))
    print(f'{len(list(OUT.glob("*.webp")))} files, {total / 1e6:.1f} MB; manifest: {", ".join(M)}')
    if 'BUST' in M:
        print(json.dumps({k: M['BUST'][k] for k in ('anchors', 'skin', 'eye', 'eyeBox', 'face')}))
