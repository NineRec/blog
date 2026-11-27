"""
Shared by salon-gen.py (to check a generated prop sheet) and salon-build.py (to cut it up), so the generator's
"8 items" is exactly the 8 pictures the build will cut.

Slicing (after hatch-pet's extract_strip_frames in OpenGame): pieces close together (within `gap` px) are one item;
an item is a "seed" when it is big enough to be a thing on its own; smaller loose bits — a sparkle, a bead that came
off, the dot of an i — go with the nearest seed instead of being thrown away or counted as an item; specks are noise.
"""
import numpy as np
from scipy import ndimage


def slice_items(alpha, gap=12, min_area=900, seed_share=0.05, bit_share=0.002):
    """
    The items on a transparent sheet, in reading order (rows top to bottom, left to right in each row).
    Returns [{'box': (y0, y1, x0, x1), 'mask': bool array of the box, 'area': px, 'edge': touches the sheet's edge,
    'bits': loose pieces attached}].
    """
    solid = alpha > 24
    lab, n = ndimage.label(ndimage.binary_dilation(solid, iterations=gap))
    if not n:
        return []
    lab = lab * solid
    area = ndimage.sum(solid, lab, range(1, n + 1))
    big = area.max()
    seeds = [i + 1 for i in range(n) if area[i] >= max(min_area, seed_share * big)]
    if not seeds:
        return []
    cy, cx = np.array(ndimage.center_of_mass(solid, lab, seeds)).T
    owner = {s: s for s in seeds}
    bits = {s: 0 for s in seeds}
    for i in range(n):
        k = i + 1
        if k in owner or area[i] < bit_share * big:
            continue
        y, x = ndimage.center_of_mass(solid, lab, k)
        s = seeds[int(np.argmin((cy - y) ** 2 + (cx - x) ** 2))]
        owner[k] = s
        bits[s] += 1
    H, W = alpha.shape
    items = []
    for s in seeds:
        mine = [k for k, o in owner.items() if o == s]
        m = np.isin(lab, mine)
        ys, xs = np.nonzero(m)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        items.append({'box': (y0, y1, x0, x1), 'mask': m[y0:y1, x0:x1], 'area': int(m.sum()),
                      'edge': bool(y0 <= 1 or x0 <= 1 or y1 >= H - 1 or x1 >= W - 1), 'bits': bits[s]})
    # reading order: a new row starts when an item's middle is below the row's first item by > 60% of its height
    items.sort(key=lambda t: (t['box'][0] + t['box'][1]) / 2)
    rows, row = [], []
    for t in items:
        if row:
            r = row[0]['box']
            if (t['box'][0] + t['box'][1]) / 2 - (r[0] + r[1]) / 2 > (r[1] - r[0]) * 0.6:
                rows.append(row)
                row = []
        row.append(t)
    if row:
        rows.append(row)
    return [t for r in rows for t in sorted(r, key=lambda t: t['box'][2])]


def contact_sheet(items, cell=220, cols=8, matte=(140, 140, 148), mark=(255, 0, 200)):
    """
    A grid of pictures on a flat neutral grey (OpenGame uses #8c8c94: a cut-out and a picture with a box around it
    look different at a glance, which a checkerboard hides), each with its label under it.
    `items`: [(label, PIL RGBA image, bool mask of suspect pixels or None, hot)]. Returns a PIL RGB image.
    """
    from PIL import Image, ImageDraw
    rows = max(1, (len(items) + cols - 1) // cols)
    sheet = Image.new('RGB', (cols * cell, rows * (cell + 18)), 'white')
    d = ImageDraw.Draw(sheet)
    for i, (label, im, bad, hot) in enumerate(items):
        w, h = im.size
        back = Image.new('RGBA', (w, h), matte + (255,))
        back.alpha_composite(im)
        if bad is not None and bad.any():
            mag = np.zeros((h, w, 4), np.uint8)
            mag[ndimage.binary_dilation(bad, iterations=2)] = mark + (255,)
            back.alpha_composite(Image.fromarray(mag))
        t = back.convert('RGB')
        t.thumbnail((cell - 8, cell - 8))
        x, y = (i % cols) * cell, (i // cols) * (cell + 18)
        sheet.paste(t, (x + (cell - t.width) // 2, y + (cell - t.height) // 2))
        d.text((x + 4, y + cell), label[:30] + (' !' if hot else ''), fill=(200, 0, 120) if hot else (60, 60, 70))
    return sheet


# ---- AVIF twins: the same picture as AVIF when that is smaller at the same quality as the WebP the build stores ----

MATTE = np.array([140, 140, 148], np.float32)


def seen(im):
    """A picture as it looks on the review sheets' grey matte (float RGB): edges and see-through parts count."""
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    al = a[..., 3:] / 255
    return a[..., :3] * al + MATTE * (1 - al)


def ssim(x, y):
    """Mean SSIM over R, G and B (gaussian window, sigma 1.5)."""
    c1, c2, out = (0.01 * 255) ** 2, (0.03 * 255) ** 2, []
    for ch in range(3):
        a, b = x[..., ch], y[..., ch]
        mu_a, mu_b = ndimage.gaussian_filter(a, 1.5), ndimage.gaussian_filter(b, 1.5)
        va = ndimage.gaussian_filter(a * a, 1.5) - mu_a ** 2
        vb = ndimage.gaussian_filter(b * b, 1.5) - mu_b ** 2
        cov = ndimage.gaussian_filter(a * b, 1.5) - mu_a * mu_b
        out.append(float((((2 * mu_a * mu_b + c1) * (2 * cov + c2)) / ((mu_a ** 2 + mu_b ** 2 + c1) * (va + vb + c2))).mean()))
    return sum(out) / 3


def avif_bytes(im, q):
    import io
    buf = io.BytesIO()
    im.save(buf, 'AVIF', quality=q, speed=4, subsampling='4:4:4')
    return buf.getvalue()


def matched_avif(im, webp):
    """
    (quality, bytes) of the smallest AVIF of `im` at least as close to it as `webp` (the stored WebP's bytes) is;
    None when that AVIF is not smaller than the WebP.
    """
    import io
    from PIL import Image
    ref = seen(im)
    target = ssim(ref, seen(Image.open(io.BytesIO(webp))))
    lo, hi, best = 20, 95, None
    while lo <= hi:
        mid = (lo + hi) // 2
        data = avif_bytes(im, mid)
        if ssim(ref, seen(Image.open(io.BytesIO(data)))) >= target:
            best, hi = (mid, data), mid - 1
        else:
            lo = mid + 1
    return best if best and len(best[1]) < len(webp) else None
