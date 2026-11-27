#!/usr/bin/env python3
"""
Make a hand-drawn SVG smaller without changing how it looks.

  - gradient stops that sit (almost) on the straight line between their neighbours go (a stop is kept only where
    the colour bends by more than `--stop` levels of 255; Douglas–Peucker on the colour curve);
  - every path segment absolute or relative, whichever is shorter (exact decimal arithmetic: nothing moves), command
    letters only where they change, no leading zeros, no spaces where none are needed;
  - with --digits N, numbers (and gradient offsets, to 2) are also rounded: lossy, and arcs are sensitive (a radius
    equal to half its chord, rounded up, moves the arc), so the check below decides;
  - repeated attributes moved to a parent are left alone (the drawing's own structure is kept).

It checks itself: both versions are rendered (headless Chromium, 3x) and compared with SSIM over the colours on grey;
the slimmed file is written only if it matches (>= 0.995).

    python3 tools/playground/svg-slim.py in.svg out.svg [--digits N] [--stop 4]
"""
import io
import re
from decimal import Decimal
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from salonart import seen, ssim          # noqa: E402

args = sys.argv[1:]
src, dst = args[0], args[1]
DIGITS = int(args[args.index('--digits') + 1]) if '--digits' in args else None     # None: no rounding (lossless)
STOP = float(args[args.index('--stop') + 1]) if '--stop' in args else 4


def num(v, d):
    s = f'{round(float(v), d):.{d}f}'.rstrip('0').rstrip('.') if d else str(round(float(v)))
    if s.startswith('0.'):
        s = s[1:]
    elif s.startswith('-0.'):
        s = '-' + s[2:]
    return '0' if s in ('', '-0', '-') else s


ARGS = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6, 'S': 4, 'Q': 4, 'T': 2, 'A': 7, 'Z': 0}


def dec(x):
    """A Decimal written as short as SVG allows (exact: no rounding)."""
    s = format(x.normalize(), 'f')
    if '.' in s:
        s = s.rstrip('0').rstrip('.')
    if s.startswith('0.'):
        s = s[1:]
    elif s.startswith('-0.'):
        s = '-' + s[2:]
    return '0' if s in ('', '-0') else s


def glue(out, n):
    """`n` appended to `out`, with a space only where it would otherwise run into the number before it."""
    if not out or out[-1].isalpha() or n.startswith('-'):
        return out + n
    lastnum = re.split(r'[ ,A-Za-z]|(?=-)', out)[-1]
    if n.startswith('.') and '.' in lastnum:
        return out + n
    return out + ' ' + n


def short_path(d, digits=None):
    """
    The same path, shorter and exact: each segment absolute or relative, whichever is shorter (with decimal
    arithmetic, so no point moves), and a command letter only where it changes. digits=None keeps every number as
    it is; a number of digits rounds first (lossy).
    """
    toks = re.findall(r'[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?', d)
    segs, i, cmd = [], 0, None
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]; i += 1
            if cmd in 'Zz':
                segs.append(('Z', [])); continue
        n = ARGS[cmd.upper()]
        args = [Decimal(t) for t in toks[i:i + n]]
        if digits is not None:
            args = [round(a, digits) if not (cmd.upper() == 'A' and k in (3, 4)) else a for k, a in enumerate(args)]
        segs.append((cmd, args)); i += n
        if cmd in 'Mm':
            cmd = 'L' if cmd == 'M' else 'l'          # coordinates after a move are lines
    # to absolute
    absol, cx, cy, sx, sy = [], Decimal(0), Decimal(0), Decimal(0), Decimal(0)
    for c, a in segs:
        U, rel = c.upper(), c.islower()
        if U == 'Z':
            absol.append(('Z', [], cx, cy)); cx, cy = sx, sy; continue
        a = list(a)
        if rel:
            if U == 'H': a[0] += cx
            elif U == 'V': a[0] += cy
            elif U == 'A': a[5] += cx; a[6] += cy
            else:
                for k in range(0, len(a), 2): a[k] += cx; a[k + 1] += cy
        absol.append((U, a, cx, cy))
        if U == 'H': cx = a[0]
        elif U == 'V': cy = a[0]
        else: cx, cy = a[-2], a[-1]
        if U == 'M': sx, sy = cx, cy
    out, last = '', None
    for U, a, px, py in absol:
        if U == 'Z':
            out += 'Z'; last = 'Z'; continue
        r = list(a)
        if U == 'H': r[0] -= px
        elif U == 'V': r[0] -= py
        elif U == 'A': r[5] -= px; r[6] -= py
        else:
            for k in range(0, len(r), 2): r[k] -= px; r[k + 1] -= py
        best = None
        for letter, vals in ((U, a), (U.lower(), r)):
            if not out and letter != 'M':
                continue                              # a path starts with an absolute move
            # the letter can go when it repeats (after a move, a line is implied)
            implied = last == letter or (last == 'M' and letter == 'L') or (last == 'm' and letter == 'l')
            text = out if implied else out + letter
            for v in vals:
                text = glue(text, dec(v))
            if best is None or len(text) < len(best[0]):
                best = (text, 'm' if letter == 'm' else letter)
        out, last = best
    return out


def hexrgb(c):
    c = c.lstrip('#')
    if len(c) == 3:
        c = ''.join(ch * 2 for ch in c)
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def short_hex(c):
    c = c.lower()
    return '#' + c[1] + c[3] + c[5] if len(c) == 7 and c[1] == c[2] and c[3] == c[4] and c[5] == c[6] else c


def slim_stops(stops):
    """Keep the stops where the colour curve bends (Douglas–Peucker over offset → RGB)."""
    pts = [(float(o), hexrgb(c)) for o, c in stops]
    keep = {0, len(pts) - 1}

    def split(i, j):
        if j <= i + 1:
            return
        (o0, c0), (o1, c1) = pts[i], pts[j]
        worst, at = 0, None
        for k in range(i + 1, j):
            o, c = pts[k]
            t = (o - o0) / (o1 - o0) if o1 > o0 else 0
            e = np.abs(c - (c0 + (c1 - c0) * t)).max()
            if e > worst:
                worst, at = e, k
        if worst > STOP:
            keep.add(at)
            split(i, at); split(at, j)
    split(0, len(pts) - 1)
    return [stops[k] for k in sorted(keep)]


def slim(svg):
    svg = re.sub(r'<!--.*?-->', '', svg, flags=re.S)
    svg = re.sub(r'>\s+<', '><', svg).strip()

    def grad(m):
        head, body = m.group(1), m.group(2)
        stops = re.findall(r'<stop offset="([^"]+)" stop-color="([^"]+)"\s*/>', body)
        if not stops or len(stops) != body.count('<stop'):
            return m.group(0)
        stops = slim_stops([(o, c) for o, c in stops])
        return head + ''.join(f'<stop offset="{num(o, 2) if DIGITS is not None else dec(Decimal(o))}" stop-color="{short_hex(c)}"/>' for o, c in stops) + '</linearGradient>'
    svg = re.sub(r'(<linearGradient[^>]*>)(.*?)</linearGradient>', grad, svg, flags=re.S)
    svg = re.sub(r' d="([^"]+)"', lambda m: f' d="{short_path(m.group(1), DIGITS)}"', svg)
    if DIGITS is not None:
        for a in ('cx', 'cy', 'rx', 'ry', 'r', 'x', 'y', 'width', 'height', 'stroke-width', 'opacity', 'x1', 'y1', 'x2', 'y2'):
            svg = re.sub(rf' {a}="(-?[\d.]+)"', lambda m, a=a: f' {a}="{num(m.group(1), DIGITS)}"', svg)
        svg = re.sub(r'(transform="rotate\()([^)]+)\)', lambda m: m.group(1) + ' '.join(num(v, DIGITS) for v in m.group(2).split()) + ')', svg)
    svg = re.sub(r'stop-color="(#[0-9a-fA-F]{6})"', lambda m: f'stop-color="{short_hex(m.group(1))}"', svg)
    svg = re.sub(r'(stroke|fill)="(#[0-9a-fA-F]{6})"', lambda m: f'{m.group(1)}="{short_hex(m.group(2))}"', svg)
    return svg


def chrome():
    """The headless Chromium the tests use (Playwright's): it draws the SVG the way the game's browser will."""
    found = sorted(Path.home().glob('Library/Caches/ms-playwright/chromium_headless_shell*/*/chrome-headless-shell'))
    if not found:
        sys.exit('no headless Chromium (npx playwright install chromium-headless-shell)')
    return str(found[-1])


def render(svg, k=3):
    """The SVG drawn by Chromium at k times its size, on transparent."""
    w, h = (float(v) for v in re.search(r'viewBox="[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)"', svg).groups())
    W, H = round(w * k), round(h * k)
    with tempfile.TemporaryDirectory() as d:
        Path(d, 'a.svg').write_text(svg)
        Path(d, 'a.html').write_text(f'<body style="margin:0"><img src="a.svg" style="display:block;width:{W}px;height:{H}px">')
        subprocess.run([chrome(), '--headless', '--hide-scrollbars', '--default-background-color=00000000', f'--window-size={W},{H}',
                        f'--screenshot={d}/a.png', f'file://{d}/a.html'], capture_output=True, check=True)
        return Image.open(f'{d}/a.png').convert('RGBA')


before = open(src).read()
after = slim(before)
a, b = render(before), render(after)
score = ssim(seen(a), seen(b))
diff = np.abs(np.asarray(a, float) - np.asarray(b, float)).max(-1)
print(f'{len(before)} → {len(after)} bytes ({len(after) / len(before):.0%}); stops {before.count("<stop")} → {after.count("<stop")}; '
      f'SSIM {score:.4f}, pixels off by >16: {(diff > 16).mean():.2%}')
if score >= 0.995:
    open(dst, 'w').write(after)
    print('written', dst)
else:
    print('NOT written: looks different')
    sys.exit(1)
