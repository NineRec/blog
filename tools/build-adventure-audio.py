"""Render every production clip with Zoey's selected 03-curious fictional voice.

Run with .voice-lab/.venv/bin/python. Models and caches remain in .voice-lab;
the reference/profile are versioned under tools/voice. Browsers only play AAC.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / '.voice-lab'
os.environ.setdefault('HF_HOME', str(LAB / 'cache/huggingface'))
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')
import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model

AUDIO = ROOT / 'static/butterfly-adventure/audio'
PROFILE = ROOT / 'tools/voice/zoey-curious.json'
RATE = 24000


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('keys', nargs='*')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    profile = json.loads(PROFILE.read_text())
    reference = PROFILE.parent / profile['reference_file']
    assert hashlib.sha256(reference.read_bytes()).hexdigest() == profile['reference_sha256']
    model_path = LAB / 'models/Qwen3-TTS-12Hz-1.7B-Base-8bit'
    revision = (model_path / 'selected-revision.txt').read_text().strip()
    assert revision == profile['model_revision'], 'Use the pinned Base model revision'
    lines = json.loads((AUDIO / 'narration.json').read_text())
    info_path = AUDIO / 'recording-info.json'
    old = json.loads(info_path.read_text()) if info_path.exists() else {}
    info = {'guide': 'Zoey', 'voice': 'Zoey / 03-curious', 'style': profile['style'],
            'locale': 'en-US', 'format': 'bundled prerecorded AAC', 'model': profile['model'],
            'model_revision': revision, 'reference_sha256': profile['reference_sha256'],
            'clips': len(lines), 'recordings': old.get('recordings', {})}
    todo = []
    for key, text in lines.items():
        if args.keys and key not in args.keys:
            continue
        call = next(iter(sorted(AUDIO.glob(f'{key}-call.*'))), None)
        fingerprint = hashlib.sha256((text + json.dumps(profile, sort_keys=True)).encode() + (call.read_bytes() if call else b'')).hexdigest()
        if not args.force and (AUDIO / f'{key}.m4a').exists() and info['recordings'].get(key, {}).get('fingerprint') == fingerprint:
            continue
        todo.append((key, text, call, fingerprint))
    if not todo:
        print('All selected Zoey clips are current', flush=True)
        return
    print(f'Loading pinned Base model; {len(todo)} clips to render', flush=True)
    model = load_model(str(model_path))
    mx.eval(model.parameters())
    assert model.config.tts_model_type == 'base'
    with tempfile.TemporaryDirectory(prefix='zoey-production-') as directory:
        temp = Path(directory)
        for index, (key, text, call, fingerprint) in enumerate(todo):
            started = time.monotonic()
            seed = profile['seed'] + int(hashlib.sha256(key.encode()).hexdigest()[:6], 16)
            mx.random.seed(seed)
            results = list(model.generate(text=text, ref_audio=str(reference), ref_text=profile['reference_text'], lang_code='English',
                                          temperature=profile['temperature'], top_p=profile['top_p'], max_tokens=800, verbose=False))
            audio = np.concatenate([np.asarray(r.audio).reshape(-1) for r in results])
            sr = results[0].sample_rate
            if not np.isfinite(audio).all() or len(audio) < sr * .25 or max(abs(audio)) < .003:
                raise RuntimeError(f'Invalid or silent voice clip: {key}')
            if any(r.token_count >= 800 for r in results):
                raise RuntimeError(f'Truncated voice clip: {key}')
            speech_seconds = len(audio) / sr
            if call:
                subprocess.run(['afconvert', str(call), str(temp / 'call.wav'), '-f', 'WAVE', '-d', f'LEI16@{sr}', '-c', '1'], check=True)
                samples, _ = sf.read(temp / 'call.wav', dtype='float32')
                samples = samples[:sr * 4]
                samples *= min(1, .58 / max(.001, float(max(abs(samples)))))
                fade = min(700, len(samples) // 4)
                samples[:fade] *= np.linspace(0, 1, fade)
                samples[-fade:] *= np.linspace(1, 0, fade)
                audio = np.concatenate([audio, np.zeros(int(.35 * sr)), samples])
            audio *= min(1, .88 / max(.001, float(max(abs(audio)))))
            sf.write(temp / 'combined.wav', audio, sr, subtype='PCM_16')
            subprocess.run(['afconvert', str(temp / 'combined.wav'), str(AUDIO / f'{key}.m4a'), '-f', 'm4af', '-d', 'aac', '-b', '64000'], check=True)
            info['recordings'][key] = {'fingerprint': fingerprint, 'seed': seed, 'speech_seconds': round(speech_seconds, 3),
                                      'duration_seconds': round(len(audio) / sr, 3), 'sha256': hashlib.sha256((AUDIO / f'{key}.m4a').read_bytes()).hexdigest()}
            info_path.write_text(json.dumps(info, indent=2) + '\n')
            mx.clear_cache()
            print(f'{index+1}/{len(todo)} {key}: {speech_seconds:.2f}s voice, {time.monotonic()-started:.1f}s render', flush=True)
    print('All recordings use Zoey / 03-curious', flush=True)


if __name__ == '__main__':
    main()
