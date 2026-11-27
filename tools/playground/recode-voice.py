"""
Store every published voice clip as voice_level.AAC (HE-AAC, 24 kbps): clips encoded otherwise (the plain AAC at
64 kbps used until 2026-11) are decoded and encoded again. Clips already in that format are left alone.
Then every clip loses the empty `free` box afconvert leaves before the audio (3 KB, a third of a short clip).

    .voice-lab/.venv/bin/python tools/playground/recode-voice.py
"""
import struct
import subprocess
import tempfile
from pathlib import Path
from voice_level import AAC

VOICE = Path(__file__).resolve().parents[2] / 'static/kids-playground/assets/voice'


def drop_padding(d):
    """An .m4a without its top-level `free` boxes; the audio's chunk offsets (stco) move up by what was removed."""
    boxes, i = [], 0
    while i + 8 <= len(d):
        size, kind = struct.unpack('>I4s', d[i:i + 8])
        if size < 8:
            return d            # a layout this does not know (64-bit sizes): left as it is
        boxes.append((kind, d[i:i + size]))
        i += size
    kinds = [k for k, _ in boxes]
    if b'free' not in kinds or b'moov' not in kinds or kinds.index(b'moov') > kinds.index(b'mdat'):
        return d
    cut = sum(len(b) for k, b in boxes[:kinds.index(b'mdat')] if k == b'free')
    out = []
    for kind, b in boxes:
        if kind == b'free':
            continue
        if kind == b'moov':
            b = bytearray(b)
            j = b.find(b'stco')
            while j != -1:
                n = struct.unpack('>I', b[j + 8:j + 12])[0]
                for e in range(n):
                    o = j + 12 + 4 * e
                    b[o:o + 4] = struct.pack('>I', struct.unpack('>I', b[o:o + 4])[0] - cut)
                j = b.find(b'stco', j + 4)
            b = bytes(b)
        out.append(b)
    return b''.join(out)


def main():
    before = after = n = 0
    with tempfile.TemporaryDirectory() as tmp:
        wav, new = Path(tmp) / 'c.wav', Path(tmp) / 'c.m4a'
        for p in sorted(VOICE.glob('*.m4a')):
            if 'aach' in subprocess.run(['afinfo', str(p)], capture_output=True, text=True).stdout:
                continue
            subprocess.run(['afconvert', str(p), str(wav), '-f', 'WAVE', '-d', 'LEI16'], check=True)
            subprocess.run(['afconvert', str(wav), str(new), *AAC], check=True)
            before += p.stat().st_size
            after += new.stat().st_size
            p.write_bytes(new.read_bytes())
            n += 1
    print(f'{n} clips re-encoded: {before / 1e6:.2f} MB -> {after / 1e6:.2f} MB')
    saved = 0
    for p in sorted(VOICE.glob('*.m4a')):
        d = p.read_bytes()
        slim = drop_padding(d)
        if len(slim) < len(d):
            p.write_bytes(slim)
            saved += len(d) - len(slim)
    print(f'padding removed: {saved / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
