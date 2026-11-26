#!/usr/bin/env python3
"""
Sharper sources for the salon: every picture that shows big on screen (the masters, faces, brows, hairstyles,
clothes, worn things, room backgrounds) upscaled 1.5x with SeedVR2 (mflux, local), into .salon-art/hires/.
salon-build.py takes its colours from these when they are there and up to date (the shapes still come from the
originals), so the game's pictures are stored 1.5x sharper than Codex draws them.

Why SeedVR2: it keeps the drawing (colours, outlines, highlights) and only sharpens; FLUX.2 klein redraws the
picture (colours shift, outlines darken). One 1254 px picture takes ~90 s on an M3 Pro (peak ~15.5 GB), so this
runs one at a time, in the order below, and skips pictures whose upscale is newer than the source (by hash).

    python3 tools/playground/salon-upscale.py [--only worn/ring-heart.png ...]
"""
import hashlib
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / '.salon-art'
HI = RAW / 'hires'
FACTOR = '1.5x'
ORDER = ['master/m0.png', 'master/m1.png', 'master/m2.png', 'master/hand.png', 'master/hand-long.png', 'master/body.png',
         'face/*.png', 'brows/*.png', 'hair/*.png', 'worn/*.png', 'wear/*.png', 'bg/*.png']
SKIP = ('mask',)        # mask edits only give shapes
BIN = Path.home() / '.local/bin/mflux-upscale-seedvr2'


def sources(only=None):
    if only:
        return [RAW / p for p in only]
    seen, out = set(), []
    for pat in ORDER:
        for p in sorted(RAW.glob(pat)):
            if p in seen or any(s in p.stem for s in SKIP):
                continue
            seen.add(p)
            out.append(p)
    return out


def flat(p, dst):
    """The picture without transparency: see-through pixels take the colour of the nearest solid one (no halo)."""
    a = np.asarray(Image.open(p).convert('RGBA'))
    rgb = a[..., :3]
    see = a[..., 3] < 128
    if see.any() and not see.all():
        _, (iy, ix) = ndimage.distance_transform_edt(see, return_indices=True)
        rgb = rgb[iy, ix]
    Image.fromarray(rgb.astype(np.uint8)).save(dst)


def main():
    only = sys.argv[sys.argv.index('--only') + 1:] if '--only' in sys.argv else None
    env = dict(os.environ, HF_HUB_OFFLINE='1', HF_HUB_DISABLE_XET='1')
    ca = RAW / 'mflux/ca.pem'
    if ca.exists():
        env.update(SSL_CERT_FILE=str(ca), REQUESTS_CA_BUNDLE=str(ca))
    todo = sources(only)
    for n, p in enumerate(todo, 1):
        rel = p.relative_to(RAW)
        out, tag = HI / rel, (HI / rel).with_suffix('.sha')
        sha = hashlib.sha1(p.read_bytes()).hexdigest()
        if out.exists() and tag.exists() and tag.read_text() == sha:
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / 'in.png'
            flat(p, src)
            r = subprocess.run([str(BIN), '-m', 'seedvr2-3b', '-q', '8', '--image-path', str(src), '--resolution', FACTOR,
                                '--seed', '7', '--output', str(out)], env=env, capture_output=True, text=True, stdin=subprocess.DEVNULL)
        if r.returncode == 0 and out.exists():
            tag.write_text(sha)
            print(f'ok   [{n}/{len(todo)}] {rel}', flush=True)
        else:
            print(f'FAIL [{n}/{len(todo)}] {rel}: {(r.stderr or r.stdout).strip().splitlines()[-1:]}', flush=True)


if __name__ == '__main__':
    main()
