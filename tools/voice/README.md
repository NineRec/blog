# Zoey: the selected curious voice

The versioned reference is the exact `.voice-lab/output/zoey-age5-03-curious.wav` audition selected by the user. `zoey-curious.json` records its SHA-256, reference transcript, original design prompt, seed, and both pinned model revisions. It is a fictional generated character, with no human reference recording.

The Base model conditions every existing and future English or Mandarin line on this same selected sample. Do not independently redesign a voice per line or fall back to device speech/Samantha.

```sh
.voice-lab/.venv/bin/python tools/build-adventure-audio.py
.voice-lab/.venv/bin/python tools/build-adventure-audio.py new-clip-key
.voice-lab/.venv/bin/python tools/check-adventure-audio.py --transcribe
```

Update `static/butterfly-adventure/audio/narration.json` before adding a line. The generator skips clips only when transcript, reference/profile and call source fingerprints match. `--force` regenerates selected clips. AAC recordings and their integrity manifest are published; models, virtualenv and caches stay local in `.voice-lab`.

Download the pinned `mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit` revision in the profile to `.voice-lab/models/Qwen3-TTS-12Hz-1.7B-Base-8bit`, then write its revision to `selected-revision.txt`. Runtime versions are pinned in `requirements.txt`.

`production-qa.json` records waveform/checksum and optional speech-recognition checks. ASR verifies wording and handles numeral/spacing variants; it cannot certify perceived age or expression. The selected reference itself determines voice identity/style.

Model/runtime documentation: [Qwen3-TTS in MLX Audio](https://github.com/Blaizzy/mlx-audio/blob/main/mlx_audio/tts/models/qwen3_tts/README.md).

Mandarin lines use the same fictional reference with Qwen Base’s Chinese language setting. The build detects Chinese characters in each transcript. ASR uses multilingual Whisper for Mandarin and preserves previous transcript checks only when both the recording checksum and transcript still match.
