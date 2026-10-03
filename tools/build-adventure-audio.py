"""Rebuild bundled English recordings on macOS; no speech synthesis runs in the browser.

Requires the Samantha voice and afconvert. Existing animal-call source recordings are
kept in static/butterfly-adventure/audio. See credits.html for their licenses.
"""
import array
import json
import math
import random
from pathlib import Path
import subprocess
import sys
import tempfile
import wave

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / 'static/butterfly-adventure/audio'
RATE = 22050
VOICE = 'Samantha'


def pcm(path, target):
    subprocess.run(['afconvert', str(path), str(target), '-f', 'WAVE', '-d', f'LEI16@{RATE}', '-c', '1'], check=True)
    with wave.open(str(target)) as source:
        assert source.getnchannels() == 1 and source.getsampwidth() == 2
        return source.readframes(source.getnframes())


def main():
    lines = json.loads((AUDIO / 'narration.json').read_text())
    with tempfile.TemporaryDirectory(prefix='little-wonders-') as directory:
        temp = Path(directory)
        # A soft crafted owl hoot, with fades at both ends of every pulse.
        samples = array.array('h')
        for index in range(RATE * 2):
            t = index / RATE
            local = t if t < .7 else t - 1
            if 0 <= local < .6:
                envelope = math.sin(math.pi * local / .6) ** 2
                phase = 2 * math.pi * (380 * local - 28 * local * local)
                value = .32 * envelope * (math.sin(phase) + .13 * math.sin(2 * phase))
            else:
                value = 0
            samples.append(int(value * 32767))
        with wave.open(str(AUDIO / 'owl-call.wav'), 'w') as out:
            out.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
            out.writeframes(samples.tobytes())
        # A gentle, original tiger growl effect; not a wildlife recording.
        noise = random.Random(42)
        samples = array.array('h')
        phase = 0
        for index in range(RATE * 3):
            t = index / RATE
            local = t % 1.5
            envelope = math.sin(math.pi * min(local, 1.1) / 1.1) ** 2 if local < 1.1 else 0
            phase += 2 * math.pi * (105 + 12 * math.sin(t * 5)) / RATE
            tone = sum(math.sin(phase * harmonic) / harmonic for harmonic in range(1, 9)) / 2
            value = .36 * envelope * (tone + .13 * noise.uniform(-1, 1))
            samples.append(int(value * 32767))
        with wave.open(str(AUDIO / 'tiger-call.wav'), 'w') as out:
            out.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
            out.writeframes(samples.tobytes())
        for key, text in lines.items():
            if len(sys.argv) > 1 and key not in sys.argv[1:]:
                continue
            spoken = temp / 'spoken.aiff'
            subprocess.run(['say', '-v', VOICE, '-r', '158', '-o', str(spoken), text], check=True)
            frames = pcm(spoken, temp / 'voice.wav')
            call = next(iter(sorted(AUDIO.glob(f'{key}-call.*'))), None)
            if call:
                call_frames = pcm(call, temp / 'call.wav')
                # At most 4 seconds per call; tame recorded volume for little ears.
                call_samples = array.array('h', call_frames[:RATE * 4 * 2])
                peak = max((abs(value) for value in call_samples), default=1)
                scale = min(1, 19000 / max(1, peak))
                for i, value in enumerate(call_samples):
                    fade = min(1, i / 400, (len(call_samples) - i) / 700)
                    call_samples[i] = int(value * scale * fade)
                frames += bytes(int(.35 * RATE) * 2) + call_samples.tobytes()
            with wave.open(str(temp / 'combined.wav'), 'w') as out:
                out.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
                out.writeframes(frames)
            subprocess.run(['afconvert', str(temp / 'combined.wav'), str(AUDIO / f'{key}.m4a'), '-f', 'm4af', '-d', 'aac', '-b', '64000'], check=True)
            print(f'Recorded {key}', flush=True)
    if len(sys.argv) == 1:
        (AUDIO / 'recording-info.json').write_text(json.dumps({
            'guide': 'Zoey', 'voice': VOICE, 'locale': 'en-US',
            'format': 'bundled prerecorded AAC', 'clips': len(lines),
        }, indent=2) + '\n')


if __name__ == '__main__':
    main()
