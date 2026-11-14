"""How high a voice clip is pitched — the measurable part of "does this sound like Zoey?"."""
import numpy as np


def pitch_of(samples, rate):
    """Median fundamental (Hz) over the voiced frames, or None when there is too little voice."""
    x = np.asarray(samples, dtype=np.float64).reshape(-1)
    size, hop = int(rate * 0.064), int(rate * 0.016)
    lo, hi = int(rate / 600), int(rate / 110)
    loud = max(1e-6, float(np.sqrt(np.mean(x ** 2))))
    found = []
    for start in range(0, len(x) - size, hop):
        frame = x[start:start + size] * np.hanning(size)
        if np.sqrt(np.mean(frame ** 2)) < loud * 0.35:
            continue
        ac = np.correlate(frame, frame, 'full')[size - 1:]
        if ac[0] <= 0:
            continue
        lag = lo + int(np.argmax(ac[lo:hi]))
        if ac[lag] / ac[0] > 0.45:
            found.append(rate / lag)
    return float(np.median(found)) if len(found) >= 3 else None
