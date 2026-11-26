"""Draw the salon art: local mflux first, Codex when mflux's picture does not pass the checks.

    python3 tools/playground/salon-gen.py JOBS.json [--only name1,name2] [--jobs 4] [--force]
                                          [--engine auto|mflux|codex] [--try DIR]

JOBS.json: {"style": "...", "edit": "...", "sheet": "...", "bg": "...",
            "jobs": [{"out": "props/spa-tools.png", "prompt": "...", "input": "master/m0.png", "kind": "sheet|edit|gen|bg",
                      "engine": "auto|mflux|codex"}]}

- A job is drawn again when its picture is missing or its prompt, inputs or the shared style changed since it was
  drawn (the hash is kept next to it in <out>.job.json); --force draws everything again.
- engine auto (default): mflux (FLUX.2 klein 4B, ~1–3 min a picture) and its checks; on a fail, Codex. Backgrounds
  and new characters default to Codex: no automatic check can judge them.
- mflux edits are drawn on a flat backdrop (the colour farthest from the picture's own), keyed out, and only the part that changed is pasted back on the input, so
  everything else stays pixel-identical (salon-build.py takes layers as the difference). They pass when something
  changed but not everything, the figure did not shift or recolour, and the new outlines are not black.
  mflux sheets are drawn on white and cut out; they pass with the right number of items and no black outlines.
- Codex runs several at a time. When it reports a usage limit, nothing more is sent until the time it gives, then
  the rest go (if that is more than 8 hours away, it stops and lists what is left).
- Codex's pictures go through the same checks; a rejected one is drawn again with the reasons in the prompt (at most
  twice more), and if none passes the best attempt is kept and flagged "NEEDS A LOOK".
- Every prompt for an edit or a sheet also carries RULES (no loose sparkles, glows or shadows: they do not survive
  cutting out). RULES is not part of the hash, so changing it does not redraw finished art.
- A picture is never overwritten: the old one and its record go to .salon-art/versions/ first. <out>.job.json records
  the hash, engine, attempts, sha256, time, prompt and inputs.
- --try DIR: draw into DIR instead (no hashes written), to compare engines; mflux's raw pictures are kept in DIR/raw
  and MFLUX_REUSE=1 judges those again without drawing.
- Never loosen a check to make a picture pass; change the prompt (or the engine) instead.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

from salonart import slice_items

ROOT = Path(__file__).resolve().parents[2] / '.salon-art'
MFLUX = Path.home() / '.local/bin/mflux-generate-flux2-edit'
# Backdrops mflux may draw an edit on: the one farthest from every colour in the picture is used (from OpenGame's
# hatch-pet: score each by the 1st-percentile distance to the subject's pixels), so a green dress never gets keyed out.
KEYS = [('green', (0, 177, 64)), ('magenta', (255, 0, 255)), ('cyan', (0, 230, 255)), ('blue', (0, 60, 255)),
        ('yellow', (255, 230, 0))]
VERSIONS = ROOT / 'versions'


def arg(name, default=None):
    if name in sys.argv:
        return sys.argv[sys.argv.index(name) + 1]
    return default


def inputs(job):
    i = job.get('input')
    return [i] if isinstance(i, str) else list(i or [])


def job_hash(job, cfg):
    kind = job.get('kind', 'gen')
    h = hashlib.sha1(json.dumps([job['prompt'], kind, inputs(job), cfg['style'], cfg.get(kind if kind != 'edit' else 'edit', '')]).encode())
    for i in inputs(job):
        p = ROOT / i
        if p.exists():
            h.update(hashlib.sha1(p.read_bytes()).digest())
    return h.hexdigest()


def engine_of(job):
    if arg('--engine'):
        return arg('--engine')
    if job.get('engine'):
        return job['engine']
    return 'codex' if job.get('kind') == 'bg' or (job['out'].startswith('master/') and not inputs(job)) else 'auto'


def prompt_text(job, cfg, codex):
    kind = job.get('kind', 'gen')
    parts = []
    if codex:
        parts += ['Use the imagegen skill with the built-in image_gen tool. Produce exactly ONE final image and copy it into the current directory as '
                  f'{Path(job["out"]).name} (PNG' + (', landscape 3:2, opaque' if kind == 'bg' else ', keep the alpha channel') + '). Do not write any other files or post-process the picture.', '']
    if kind == 'edit':
        parts.append(cfg['edit'])
    elif kind in cfg:
        parts.append(cfg[kind])
    parts += [job['prompt'], '', cfg['style']]
    if kind in ('edit', 'sheet'):
        parts += ['', RULES]
    if job.get('_repair'):
        parts += ['', 'A previous attempt was rejected by the automatic checks: ' + job['_repair'] + '. Draw it again and fix exactly that.']
    return '\n'.join(parts)


# Said in every edit and sheet prompt, kept out of the job hash on purpose: adding a rule must not redraw finished art.
# (From OpenGame: ask for what survives cutting out instead of repairing it afterwards.)
RULES = ('Everything drawn is one solid connected shape per item: no loose sparkles, stars, hearts, motion lines, glows, '
         'halos, drop shadows or ground shadows floating around it (they are cut away automatically).')


# ---------------------------------------------------------------- Codex

class Quota:
    """Codex's usage limit: once hit, every Codex job waits until it resets."""
    def __init__(self):
        self.until = None
        self.lock = threading.Lock()

    def hit(self, log_text):
        m = re.search(r'try again at (\d{1,2}:\d{2}\s*[AP]M)', log_text)
        when = None
        if m:
            t = datetime.strptime(m.group(1).replace(' ', ''), '%I:%M%p')
            now = datetime.now()
            when = now.replace(hour=t.hour, minute=t.minute, second=0) + timedelta(minutes=2)
            if when < now:
                when += timedelta(days=1)
        with self.lock:
            self.until = when or (datetime.now() + timedelta(hours=1))
        print(f'.. Codex usage limit: waiting until {self.until:%H:%M}', flush=True)

    def wait(self):
        while True:
            with self.lock:
                u = self.until
            if not u or datetime.now() >= u:
                return True
            if u - datetime.now() > timedelta(hours=8):
                return False
            time.sleep(30)


QUOTA = Quota()


def codex(job, cfg, out, tries=3):
    """
    Codex draws; the same checks as mflux's judge the picture. A rejected picture is drawn again (at most twice) with
    the reasons added to the prompt; if none passes, the best attempt is kept and flagged for a look (no third bill).
    """
    best, notes = None, []
    for attempt in range(tries):
        job = dict(job, _repair='; '.join(notes[-1:]) or None) if attempt else job
        if out.exists():
            out.unlink()
        ok, note = codex_draw(job, cfg, out)
        if not ok:
            return False, note
        why, score = judge(job, out)
        if not why:
            return True, 'codex' + (f' (attempt {attempt + 1})' if attempt else '')
        notes.append(', '.join(why))
        keep = Path(str(out) + f'.try{attempt}.png')
        shutil.move(out, keep)
        if best is None or score < best[0]:
            best = (score, keep)
    shutil.copy(best[1], out)
    for f in out.parent.glob(out.name + '.try*.png'):
        f.unlink()
    return True, f'codex, NEEDS A LOOK (no attempt passed: {" | ".join(notes)})'


def codex_draw(job, cfg, out):
    for _ in range(3):
        if not QUOTA.wait():
            return False, 'usage limit resets more than 8 hours from now'
        cmd = ['codex', 'exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', str(out.parent)]
        for i in inputs(job):
            cmd.append(f'--image={ROOT / i}')
        cmd += ['--', prompt_text(job, cfg, True)]
        log = Path(str(out) + '.log')
        with open(log, 'w') as f:
            subprocess.run(cmd, stdout=f, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, cwd=out.parent)
        text = log.read_text(errors='ignore')
        if out.exists():
            return True, 'codex'
        if 'usage limit' in text:
            QUOTA.hit(text)
            continue
        return False, (text.strip().splitlines() or ['no picture'])[-1][:160]
    return False, 'codex gave no picture'


def judge(job, out):
    """Reasons to reject a finished picture (Codex's, already transparent and in place) and a score (lower is better)."""
    np, Image, ndimage = _np()
    kind = job.get('kind', 'gen')
    a = np.asarray(Image.open(out).convert('RGBA')).astype(np.float32)
    if kind == 'edit' and inputs(job):
        s = np.asarray(Image.open(ROOT / inputs(job)[0]).convert('RGBA')).astype(np.float32)
        if a.shape != s.shape:
            a = np.asarray(Image.open(out).convert('RGBA').resize(s.shape[1::-1], Image.LANCZOS)).astype(np.float32)
        why, st = edit_checks(np, ndimage, job, a, s)
        return why, len(why) + st['frac'] / max_change(job) + st['drift'] / 12
    if kind == 'sheet':
        why, st = sheet_checks(np, ndimage, job, a)
        return why, len(why)
    return [], 0


# ---------------------------------------------------------------- mflux

def _np():
    import numpy as np                      # only needed for mflux; keeps a plain Codex run free of the venv
    from PIL import Image
    from scipy import ndimage
    return np, Image, ndimage


def mflux_draw(prompt, refs, size, out, seed=7):
    env = dict(os.environ, HF_HUB_OFFLINE='1', HF_HUB_DISABLE_XET='1')
    ca = ROOT / 'mflux/ca.pem'
    if ca.exists():
        env.update(SSL_CERT_FILE=str(ca), REQUESTS_CA_BUNDLE=str(ca))
    w, h = (max(256, round(v / 16) * 16) for v in size)
    cmd = [str(MFLUX), '-m', 'flux2-klein-4b', '-q', '8', '--image-paths', *map(str, refs), '--width', str(w), '--height', str(h),
           '--steps', '4', '--seed', str(seed), '--prompt', prompt, '--output', str(out)]
    r = subprocess.run(cmd, env=env, capture_output=True, text=True, stdin=subprocess.DEVNULL)
    return out.exists(), (r.stderr or r.stdout).strip().splitlines()[-1:] if r.returncode else ''


def black_outlines(np, ndimage, rgba, region=None):
    """Of the pixels along the edges of the drawn shapes, the share that is near-black (the house style never is)."""
    a = rgba[..., 3] > 128
    edge = a & ~ndimage.binary_erosion(a, iterations=3)
    if region is not None:
        edge &= region
    if edge.sum() < 50:
        return 0.0
    px = rgba[edge][:, :3]
    return float(((px.max(1) < 70) & (px.max(1) - px.min(1) < 30)).mean())     # grey-black; navy or plum outlines are fine


def key_backdrop(np, ndimage, o):
    """Transparent where the picture is the backdrop. klein does not keep the exact green (it drifts to teal), so the
    backdrop colour is read from the picture's border, and pixels are keyed by their distance from it."""
    b = np.concatenate([o[:8].reshape(-1, 3), o[-8:].reshape(-1, 3), o[:, :8].reshape(-1, 3), o[:, -8:].reshape(-1, 3)])
    bg = np.median(b, 0)
    dist = np.abs(o - bg).max(2)
    alpha = np.clip((dist - 28) / 50, 0, 1)
    # only what touches the border is backdrop (a green dress stays)
    lab, _ = ndimage.label(alpha < 0.5)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    back = np.isin(lab, edge[edge > 0])
    alpha = np.where(back, alpha, np.maximum(alpha, 1.0))
    alpha = ndimage.gaussian_filter(alpha, 0.7)
    # despill: half-keyed edge pixels lose the backdrop's tint
    k = (1 - alpha)[..., None]
    o = np.clip((o - bg * k) / np.maximum(alpha[..., None], 0.05), 0, 255)
    return np.dstack([o, alpha * 255])


def align(np, ndimage, Image, rgba, s):
    """Scale + shift `rgba` so its figure lies over the source's figure (best overlap of the two silhouettes)."""
    n = 256
    H, W = s.shape[:2]
    small = lambda a: np.asarray(Image.fromarray((a > 128).astype(np.uint8) * 255).resize((n, n), Image.BILINEAR)).astype(np.float32) / 255
    ms, mo = small(s[..., 3]), small(rgba[..., 3])
    best = (-1, 1.0, 0, 0)
    F = np.fft.fft2(ms)
    for sc in np.arange(0.9, 1.1001, 0.01):
        m = ndimage.affine_transform(mo, [1 / sc, 1 / sc], offset=[(n / 2) * (1 - 1 / sc)] * 2, order=1)
        c = np.real(np.fft.ifft2(F * np.conj(np.fft.fft2(m))))
        dy, dx = np.unravel_index(np.argmax(c), c.shape)
        dy, dx = (dy if dy < n / 2 else dy - n), (dx if dx < n / 2 else dx - n)
        sh = np.roll(np.roll(m, dy, 0), dx, 1)
        iou = (np.minimum(sh, ms).sum()) / max(1e-3, np.maximum(sh, ms).sum())
        if iou > best[0]:
            best = (iou, sc, dy * H / n, dx * W / n)
    _, sc, dy, dx = best
    # output pixel (y, x) takes input ((y - dy - c)/sc + c)
    cy, cx = H / 2, W / 2
    out = np.stack([ndimage.affine_transform(rgba[..., i], [1 / sc, 1 / sc], offset=[cy - (cy + dy) / sc, cx - (cx + dx) / sc], order=1)
                    for i in range(4)], -1)
    return out


def match_colour(np, rgba, s):
    """Per-channel gain + offset that maps klein's colours back onto the source's, fitted on the pixels that agree."""
    both = (rgba[..., 3] > 200) & (s[..., 3] > 200)
    if both.sum() < 1000:
        return rgba
    x, y = rgba[both][:, :3], s[both][:, :3]
    keep = np.ones(len(x), bool)
    for _ in range(3):
        coef = [np.polyfit(x[keep, c] + np.random.default_rng(c).normal(0, 1e-3, keep.sum()), y[keep, c], 1) for c in range(3)]
        fit = np.stack([np.polyval(coef[c], x[:, c]) for c in range(3)], 1)
        r = np.abs(fit - y).max(1)
        keep = r <= np.percentile(r, 70)
    out = rgba.copy()
    for c in range(3):
        out[..., c] = np.clip(np.polyval(coef[c], rgba[..., c]), 0, 255)
    return out


def settle(np, ndimage, Image, rgba, s):
    """Of: as drawn, and lined up over the original — whichever (after colour matching) differs least from it."""
    grey = lambda a: a[..., :3] * (a[..., 3:4] / 255) + 128 * (1 - a[..., 3:4] / 255)
    fig = s[..., 3] > 200
    best = None
    for cand in (rgba, align(np, ndimage, Image, rgba, s)):
        c = match_colour(np, cand, s)
        m = float(np.median(np.abs(grey(c) - grey(s)).max(2)[fig]))
        if best is None or m < best[0]:
            best = (m, c)
    return best[1]


def max_change(job):
    """How much of the figure an edit of this kind may change: a ring or bracelet is a small part of the hand, a hat
    covers the top of the head, an outfit most of the body. Anything more means klein redrew things it should keep."""
    if 'max_change' in job:
        return job['max_change']
    o = job['out']
    # about 1.25-1.5x the most any of Codex's accepted edits of that kind changed (2026-11: ring 3.3%, bracelet 3.6%,
    # hat 24% (the wide sun hat 36%: its job says so), held thing 24%, top 19%, bottom 30%, dress 48%, wings/cape 38%,
    # long hairstyles 93%)
    for pat, v in (('worn/ring', 0.05), ('worn/bracelet', 0.055), ('worn/hat', 0.33), ('worn/hold', 0.3), ('worn/', 0.3),
                   ('wear/top', 0.25), ('wear/bottom', 0.37), ('wear/dress', 0.6), ('wear/back', 0.47), ('wear/', 0.6),
                   ('hair/', 1.3), ('face/', 0.25), ('brows/', 0.15)):
        if pat in o:
            return v
    return 0.6


def edit_checks(np, ndimage, job, rgba, s):
    """An edit of `s` (both RGBA float, same size): it changed something, not too much for its kind, left the rest
    alone, and kept the house outlines."""
    grey = lambda a: a[..., :3] * (a[..., 3:4] / 255) + 128 * (1 - a[..., 3:4] / 255)
    d = np.abs(grey(rgba) - grey(s)).max(2)
    ch = ndimage.binary_closing(ndimage.binary_opening(d > 40, iterations=2), iterations=6)
    lab, n = ndimage.label(ch)
    if n:
        sizes = ndimage.sum(ch, lab, range(1, n + 1))
        ch = np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v >= 400])
    region = ndimage.binary_dilation(ndimage.binary_fill_holes(ch), iterations=6)
    figure = s[..., 3] > 200
    frac = region.sum() / max(1, figure.sum())
    drift = float(np.median(d[figure & ~region])) if (figure & ~region).any() else 0.0
    dark = black_outlines(np, ndimage, rgba, region)
    why = []
    if (d > 40).sum() < 0.002 * figure.sum():      # raw pixels: a fix of thin slivers has no big blob, but did change
        why.append('nothing changed')
    most = max_change(job)
    if frac > most:
        why.append(f'too much changed ({frac:.0%} > {most:.0%})')
    if drift > 12:
        why.append(f'the figure moved or recoloured (drift {drift:.0f})')
    if dark > 0.3:
        why.append(f'black outlines ({dark:.0%})')
    return why, {'frac': frac, 'drift': drift, 'dark': dark, 'region': region}


def sheet_checks(np, ndimage, job, a):
    """A prop sheet: exactly rows x columns items as the build will cut them, none cut off by the edge, house outlines."""
    m = re.search(r'(\d+) rows? x (\d+) columns?', job['prompt'])
    want = int(m.group(1)) * int(m.group(2)) if m else None
    items = slice_items(a[..., 3])
    dark = black_outlines(np, ndimage, a)
    why = []
    if want and len(items) != want:
        why.append(f'{len(items)} items, not {want}')
    cut = sum(t['edge'] for t in items)
    if cut:
        why.append(f'{cut} items touch the edge')
    if dark > 0.3:
        why.append(f'black outlines ({dark:.0%})')
    return why, {'n': len(items), 'dark': dark}


def key_colour(np, src):
    """The backdrop colour (name, rgb) least like anything in `src` (a PIL RGBA picture)."""
    a = np.asarray(src.convert('RGBA'))
    px = a[a[..., 3] > 128][:, :3].astype(np.float32)
    if len(px) > 40000:
        px = px[np.random.default_rng(0).choice(len(px), 40000, replace=False)]
    if not len(px):
        return KEYS[0]
    score = [np.percentile(np.sqrt(((px - np.array(rgb)) ** 2).sum(1)), 1) for _, rgb in KEYS]
    return KEYS[int(np.argmax(score))]


def mflux_edit(job, cfg, out):
    np, Image, ndimage = _np()
    target = ROOT / inputs(job)[0]
    src = Image.open(target).convert('RGBA')
    W, H = src.size
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        name, key = key_colour(np, src)
        flat = Image.new('RGBA', src.size, key + (255,))
        flat.alpha_composite(src)
        flat.convert('RGB').save(tmp / 'in.png')
        refs = [tmp / 'in.png'] + [ROOT / i for i in inputs(job)[1:]]
        p = prompt_text(job, cfg, False) + f'\nThe background stays the same flat pure {name} (#{"%02X%02X%02X" % key}) everywhere outside the character.'
        again = RAW_KEEP / f'{out.stem}.mflux.png' if RAW_KEEP and os.environ.get('MFLUX_REUSE') else None
        if again and again.exists():                # re-judge a trial's picture without drawing it again
            shutil.copy(again, tmp / 'out.png')
        else:
            ok, err = mflux_draw(p, refs, (W, H), tmp / 'out.png')
            if not ok:
                return False, f'mflux failed {err}'
        if RAW_KEEP and not again:                                # trials keep what mflux drew, to judge the checks by eye
            RAW_KEEP.mkdir(parents=True, exist_ok=True)
            shutil.copy(tmp / 'out.png', RAW_KEEP / f'{out.stem}.mflux.png')
        o = np.asarray(Image.open(tmp / 'out.png').convert('RGB').resize((W, H), Image.LANCZOS)).astype(np.float32)
    s = np.asarray(src).astype(np.float32)
    rgba = key_backdrop(np, ndimage, o)
    rgba = settle(np, ndimage, Image, rgba, s)       # klein shifts, scales and recolours a little: undo that first
    why, st = edit_checks(np, ndimage, job, rgba, s)
    region = st['region']
    if why:
        return False, 'mflux: ' + ', '.join(why)
    # paste back only the changed part, feathered
    soft = ndimage.gaussian_filter(region.astype(np.float32), 2)[..., None]
    res = s * (1 - soft) + rgba * soft
    Image.fromarray(np.clip(res, 0, 255).astype(np.uint8), 'RGBA').save(out)
    return True, f"mflux (changed {st['frac']:.0%}, drift {st['drift']:.0f}, dark {st['dark']:.0%})"


def mflux_sheet(job, cfg, out):
    np, Image, ndimage = _np()
    refs = [ROOT / i for i in inputs(job)] or sorted((ROOT / 'props').glob('*.png'))[:1]     # a finished sheet shows the style
    p = prompt_text(job, cfg, False) + '\nDraw them on a plain pure white background, well apart. Match the drawing style of the reference picture.'
    with tempfile.TemporaryDirectory() as tmp:
        ok, err = mflux_draw(p, refs, (1536, 1024), Path(tmp) / 'out.png')
        if not ok:
            return False, f'mflux failed {err}'
        a = np.asarray(Image.open(Path(tmp) / 'out.png').convert('RGBA')).astype(np.float32)
    white = a[..., :3].min(-1) > 238
    lab, _ = ndimage.label(white)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    a[..., 3] = np.where(np.isin(lab, list(edge)), 0, 255)
    why, st = sheet_checks(np, ndimage, job, a)
    if why:
        return False, 'mflux: ' + ', '.join(why)
    Image.fromarray(a.astype(np.uint8), 'RGBA').save(out)
    return True, f"mflux ({st['n']} items, dark {st['dark']:.0%})"


RAW_KEEP = None
MFLUX_LOCK = threading.Lock()       # one picture at a time on the GPU


def mflux(job, cfg, out):
    kind = job.get('kind', 'gen')
    if kind not in ('edit', 'sheet') or (kind == 'edit' and not inputs(job)):
        return False, 'mflux: no check for this kind'
    with MFLUX_LOCK:
        return (mflux_edit if kind == 'edit' else mflux_sheet)(job, cfg, out)


# ---------------------------------------------------------------- jobs

def keep_version(out):
    """Never overwrite a picture: the old one (and its .job.json) goes to versions/<path>/<time>-<sha8>.png first."""
    rel = out.relative_to(ROOT)
    d = VERSIONS / rel.with_suffix('')
    d.mkdir(parents=True, exist_ok=True)
    stem = f'{datetime.now():%Y%m%d-%H%M%S}-{hashlib.sha256(out.read_bytes()).hexdigest()[:8]}'
    shutil.copy2(out, d / f'{stem}.png')
    meta = Path(str(out) + '.job.json')
    if meta.exists():
        shutil.copy2(meta, d / f'{stem}.job.json')


def run(job, cfg, base, tag):
    out = base / job['out']
    out.parent.mkdir(parents=True, exist_ok=True)
    eng, notes = engine_of(job), []
    ok = False
    if tag and out.exists():
        keep_version(out)
    if eng in ('auto', 'mflux'):
        ok, note = mflux(job, cfg, out)
        notes.append(note)
    if not ok and eng in ('auto', 'codex'):
        if out.exists():
            out.unlink()
        ok, note = codex(job, cfg, out)
        notes.append(note)
    print(('ok   ' if ok else 'FAIL ') + job['out'] + '  ' + ' → '.join(notes), flush=True)
    if ok and tag:
        Path(str(out) + '.job.json').write_text(json.dumps({
            'hash': tag, 'engine': notes[-1], 'tried': notes, 'sha256': hashlib.sha256(out.read_bytes()).hexdigest(),
            'drawn': datetime.now().isoformat(timespec='seconds'), 'prompt': job['prompt'], 'inputs': inputs(job)}, indent=1))
        if 'NEEDS A LOOK' in notes[-1]:
            print(f'   ! {job["out"]}: kept the best attempt; check it in the review sheets (older version in versions/)', flush=True)
    return ok


def main():
    cfg = json.loads(Path(sys.argv[1]).read_text())
    only = set(filter(None, (arg('--only') or '').split(',')))
    force = '--force' in sys.argv
    trial = arg('--try')
    base = Path(trial).resolve() if trial else ROOT
    global RAW_KEEP
    RAW_KEEP = base / 'raw' if trial else None
    todo = []
    last = {j['out']: j for j in cfg['jobs']}       # a later job for the same picture is a fix of it: only that one counts
    for j in cfg['jobs']:
        if last[j['out']] is not j:
            continue
        if only and Path(j['out']).stem not in only and j['out'] not in only:
            continue
        h = job_hash(j, cfg)
        out, meta = ROOT / j['out'], Path(str(ROOT / j['out']) + '.job.json')
        if not force and not trial and out.exists():
            if not meta.exists():                   # drawn before hashes were kept: take it as current
                meta.write_text(json.dumps({'hash': h, 'engine': 'codex (before hashes)'}))
                continue
            if json.loads(meta.read_text()).get('hash') == h:
                continue
            print(f'.. {j["out"]}: prompt or inputs changed, drawing again', flush=True)
        todo.append((j, None if trial else h))
    print(f'{len(todo)} pictures to draw', flush=True)
    with ThreadPoolExecutor(int(arg('--jobs', 4))) as pool:
        results = list(pool.map(lambda t: run(t[0], cfg, base, t[1]), todo))
    print(f'done: {sum(results)}/{len(results)}')


if __name__ == '__main__':
    main()
