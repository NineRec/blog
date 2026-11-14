"""Flags voice clips that do not sound like Zoey: a clip pitched far below the rest was rendered
in a deeper, adult-sounding voice and should be rendered again.

    .voice-lab/.venv/bin/python tools/playground/check-voice.py [--all]

build-voice.py already retries a line until it is pitched like Zoey; this checks the whole folder,
including clips kept from earlier recordings.
"""
import subprocess, sys, tempfile, wave
from pathlib import Path
import numpy as np
from zoey_pitch import pitch_of

VOICE = Path(__file__).resolve().parents[2] / 'static/kids-playground/assets/voice'
LOWEST = 330   # Hz; Zoey's clips sit around 400


def clip_pitch(path):
    with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
        subprocess.run(['afconvert', str(path), tmp.name, '-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1'], check=True)
        with wave.open(tmp.name) as w:
            x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16) / 32768
    # The animal introductions end with the animal's own call: listen to the spoken half only.
    return pitch_of(x[:len(x) // 2] if path.stem.startswith('about-') else x, 16000)


def main():
    rows = sorted(((clip_pitch(p) or 0, p.stem) for p in sorted(VOICE.glob('*.m4a'))))
    low = [r for r in rows if r[0] < LOWEST]
    print(f'{len(rows)} clips, typical pitch {np.median([r[0] for r in rows]):.0f} Hz, {len(low)} below {LOWEST} Hz')
    for hz, key in (rows if '--all' in sys.argv else low):
        print(f'{"LOW " if hz < LOWEST else "    "}{key:24s} {hz:4.0f} Hz')
    sys.exit(1 if low else 0)


if __name__ == '__main__':
    main()
