#!/usr/bin/env python3
"""
Would AVIF store the salon's pictures smaller than WebP, at the same quality?

For every picture the build makes (dumped before encoding: SALON_DUMP=dir salon-build.py), this encodes WebP exactly
as the build does, measures how close it is to the original (SSIM of R, G and B over the grey matte the review sheets
use, so the edges and the see-through parts count as they are seen), then finds the lowest AVIF quality that is at
least as close, and compares the sizes.

    SALON_DUMP=/tmp/dump .salon-art/.venv/bin/python tools/playground/salon-build.py --no-review
    .salon-art/.venv/bin/python tools/playground/avif-test.py /tmp/dump [--out dir-for-the-avifs]
"""
import io
import json
import sys
from pathlib import Path

from PIL import Image

from salonart import seen, ssim   # noqa: E402  (shared with the build's AVIF twins)


def encode(im, fmt, q):
    buf = io.BytesIO()
    if fmt == 'WEBP':
        im.save(buf, 'WEBP', quality=q, method=6, alpha_quality=88)
    else:
        im.save(buf, 'AVIF', quality=q, speed=4, subsampling='4:4:4')
    data = buf.getvalue()
    return data, Image.open(io.BytesIO(data))


def main():
    src = Path(sys.argv[1])
    out = Path(sys.argv[sys.argv.index('--out') + 1]) if '--out' in sys.argv else None
    if out:
        out.mkdir(parents=True, exist_ok=True)
    rows = []
    for p in sorted(src.glob('*.png')):
        im = Image.open(p).convert('RGBA')
        q = int((p.with_suffix('.q')).read_text())
        ref = seen(im)
        w, wim = encode(im, 'WEBP', q)
        target = ssim(ref, seen(wim))
        lo, hi, best = 20, 95, None          # the lowest AVIF quality as close as the WebP
        while lo <= hi:
            mid = (lo + hi) // 2
            a, aim = encode(im, 'AVIF', mid)
            if ssim(ref, seen(aim)) >= target:
                best, hi = (mid, a), mid - 1
            else:
                lo = mid + 1
        if best is None:
            best = (95, encode(im, 'AVIF', 95)[0])
        if out:
            (out / (p.stem + '.avif')).write_bytes(best[1])
        rows.append({'name': p.stem, 'webp': len(w), 'avif': len(best[1]), 'q': best[0], 'ssim': round(target, 4)})
        print(f'{p.stem:34s} webp {len(w) / 1024:7.1f} KB  avif q{best[0]:<3d} {len(best[1]) / 1024:7.1f} KB  ({len(best[1]) / len(w):.0%})', flush=True)
    W, A = sum(r['webp'] for r in rows), sum(r['avif'] for r in rows)
    print(f'\n{len(rows)} pictures: webp {W / 1e6:.2f} MB, avif {A / 1e6:.2f} MB ({A / W:.0%}), saving {(W - A) / 1e6:.2f} MB')
    worse = [r for r in rows if r['avif'] >= r['webp']]
    print(f'avif not smaller for {len(worse)}: ' + ' '.join(r['name'] for r in worse[:20]))
    (src / 'avif-test.json').write_text(json.dumps(rows, indent=1))


if __name__ == '__main__':
    main()
