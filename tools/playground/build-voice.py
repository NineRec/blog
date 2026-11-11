"""Render Zoey's new voice lines for the kids playground (/kids-playground/).

Uses the local voice lab (models, virtualenv, the selected "03-curious" Zoey reference):

    .voice-lab/.venv/bin/python tools/playground/build-voice.py [key ...] [--force]

Add or edit lines in tools/playground/voice-lines.json, then rerun. Clips whose text is unchanged are skipped.
Lines reused from the earlier recordings are listed in voice-reused.json.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

BLOG = Path(__file__).resolve().parents[2]
LAB = BLOG / '.voice-lab'
PROFILE = BLOG / 'tools/voice/zoey-curious.json'
OUT = BLOG / 'static/kids-playground/assets/voice'
LINES = Path(__file__).with_name('voice-lines.json')
INFO = Path(__file__).with_name('voice-info.json')
os.environ.setdefault('HF_HOME', str(LAB / 'cache/huggingface'))
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')

import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('keys', nargs='*')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    profile = json.loads(PROFILE.read_text())
    reference = PROFILE.parent / profile['reference_file']
    assert hashlib.sha256(reference.read_bytes()).hexdigest() == profile['reference_sha256']
    lines = json.loads(LINES.read_text())
    info = json.loads(INFO.read_text()) if INFO.exists() else {}
    todo = []
    for key, text in lines.items():
        if args.keys and key not in args.keys:
            continue
        fingerprint = hashlib.sha256((text + json.dumps(profile, sort_keys=True)).encode()).hexdigest()
        if not args.force and (OUT / f'{key}.m4a').exists() and info.get(key, {}).get('fingerprint') == fingerprint:
            continue
        todo.append((key, text, fingerprint))
    if not todo:
        print('All Zoey clips are current', flush=True)
        return
    print(f'Loading Zoey voice model; {len(todo)} clips to render', flush=True)
    model = load_model(str(LAB / 'models/Qwen3-TTS-12Hz-1.7B-Base-8bit'))
    mx.eval(model.parameters())
    OUT.mkdir(parents=True, exist_ok=True)
    failures = []
    with tempfile.TemporaryDirectory(prefix='zoey-playground-') as directory:
        wav = Path(directory) / 'clip.wav'
        for index, (key, text, fingerprint) in enumerate(todo):
            started = time.monotonic()
            seed = profile['seed'] + int(hashlib.sha256(key.encode()).hexdigest()[:6], 16)
            language = 'Chinese' if any('一' <= c <= '鿿' for c in text) else 'English'
            audio = None
            # Very short lines occasionally come back empty for one seed; try a few nearby seeds.
            for attempt in range(6):
                mx.random.seed(seed + attempt * 7919)
                results = list(model.generate(text=text, ref_audio=str(reference), ref_text=profile['reference_text'],
                                              lang_code=language, temperature=profile['temperature'],
                                              top_p=profile['top_p'], max_tokens=800, verbose=False))
                pieces = [np.asarray(r.audio).reshape(-1) for r in results if np.asarray(r.audio).size]
                heard = np.concatenate(pieces) if pieces else np.zeros(0)
                rate = results[0].sample_rate if results else 24000
                truncated = any(r.token_count >= 800 for r in results)
                if heard.size >= rate * .3 and np.isfinite(heard).all() and max(abs(heard)) >= .003 and not truncated:
                    audio, seed = heard, seed + attempt * 7919
                    break
            if audio is None:
                print(f'{index + 1}/{len(todo)} {key}: NO AUDIO for {text!r}; reword this line', flush=True)
                failures.append(key)
                continue
            audio = audio * min(1, .88 / max(.001, float(max(abs(audio)))))
            sf.write(wav, audio, rate, subtype='PCM_16')
            subprocess.run(['afconvert', str(wav), str(OUT / f'{key}.m4a'), '-f', 'm4af', '-d', 'aac', '-b', '64000'], check=True)
            info[key] = {'text': text, 'fingerprint': fingerprint, 'seed': seed, 'language': language,
                         'seconds': round(len(audio) / rate, 2)}
            INFO.write_text(json.dumps(info, indent=2, ensure_ascii=False) + '\n')
            mx.clear_cache()
            print(f'{index + 1}/{len(todo)} {key}: {len(audio) / rate:.2f}s voice, {time.monotonic() - started:.1f}s render', flush=True)
    if failures:
        print('Reword and rerun:', ' '.join(failures), flush=True)
        raise SystemExit(1)
    print('All clips use Zoey / 03-curious', flush=True)


if __name__ == '__main__':
    main()
