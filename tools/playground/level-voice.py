"""
Bring published voice clips that are much quieter or louder than the rest to the common speech loudness
(voice_level.TARGET_DB). build-voice.py levels every new clip already; this fixes the ones made before it did.
Only clips more than TOLERANCE_DB off are re-encoded (once, at the same AAC settings).

    .voice-lab/.venv/bin/python tools/playground/level-voice.py [--apply]
"""
import subprocess, sys, tempfile
from pathlib import Path
import numpy as np
import soundfile as sf
from voice_level import TARGET_DB, TOLERANCE_DB, PEAK, speech_db

VOICE = Path(__file__).resolve().parents[2] / 'static/kids-playground/assets/voice'


def main():
    apply = '--apply' in sys.argv
    off = []
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / 'c.wav'
        for p in sorted(VOICE.glob('*.m4a')):
            subprocess.run(['afconvert', str(p), str(wav), '-f', 'WAVE', '-d', 'LEI16'], check=True)
            x, rate = sf.read(wav)
            # the animal introductions end with the animal's own call: judge the spoken half
            db = speech_db(x[:len(x) // 2] if p.stem.startswith('about-') else x, rate)
            if abs(db - TARGET_DB) <= TOLERANCE_DB:
                continue
            gain = min(10 ** ((TARGET_DB - db) / 20), PEAK / max(1e-4, float(np.abs(x).max())))
            off.append((p.stem, db, 20 * np.log10(gain)))
            if apply and abs(20 * np.log10(gain)) > 0.5:
                sf.write(wav, x * gain, rate, subtype='PCM_16')
                subprocess.run(['afconvert', str(wav), str(p), '-f', 'm4af', '-d', 'aac', '-b', '64000'], check=True)
    for k, db, g in off:
        print(f'{k:24s} {db:6.1f} dB  {"→" if apply else "needs"} {g:+.1f} dB')
    print(f'{len(off)} clips more than {TOLERANCE_DB} dB from {TARGET_DB} dB' + (' (levelled)' if apply else '; --apply to level them'))


if __name__ == '__main__':
    main()
