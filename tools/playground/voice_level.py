"""
Every Zoey clip at the same speech loudness, so no line is much quieter or louder than the next (after OpenGame's
mix targets: voice is the loudest layer, with headroom under full scale).

Loudness here is the RMS of the speaking parts only (50 ms frames above 10% of the loudest frame), so a short
"One!" and a long sentence with pauses compare fairly.
"""
import numpy as np

TARGET_DB = -19.5     # speech RMS, dBFS: the median of the published clips (2026-11)
PEAK = 0.89           # never above -1 dBFS
TOLERANCE_DB = 2.0    # published clips further off than this are levelled again
# How clips are stored: HE-AAC (AAC with spectral band replication), mono, 24 kbps. Half the size of the plain
# AAC at 64 kbps used before, and closer to it than plain AAC at 32 kbps: SBR keeps the 8-12 kHz that makes speech
# crisp, which plain AAC drops at these rates. Chromium, Safari and Firefox decode it (decodeAudioData).
AAC = ['-f', 'm4af', '-d', 'aach', '-b', '24000']


def speech_db(x, rate):
    x = x if x.ndim == 1 else x.mean(1)
    w = max(1, int(rate * 0.05))
    fr = x[:len(x) // w * w].reshape(-1, w)
    if not len(fr):
        return -120.0
    e = np.sqrt((fr ** 2).mean(1) + 1e-12)
    act = e[e > e.max() * 0.1]
    return float(20 * np.log10(np.sqrt((act ** 2).mean()) + 1e-12))


def level(x, rate):
    """`x` scaled to TARGET_DB of speech, as far as the peak limit allows."""
    gain = 10 ** ((TARGET_DB - speech_db(x, rate)) / 20)
    gain = min(gain, PEAK / max(1e-4, float(np.abs(x).max())))
    return x * gain
