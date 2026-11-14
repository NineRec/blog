# Zoey: the selected curious voice

The versioned reference is the exact `.voice-lab/output/zoey-age5-03-curious.wav` audition selected by the user. `zoey-curious.json` records its SHA-256, reference transcript, original design prompt, seed, and both pinned model revisions. It is a fictional generated character, with no human reference recording.

The Base model conditions every English or Mandarin line on this same selected sample. Do not independently redesign a voice per line or fall back to device speech.

```sh
.voice-lab/.venv/bin/python tools/playground/build-voice.py            # render new or changed lines
.voice-lab/.venv/bin/python tools/playground/build-voice.py some-key --force
```

Lines for the kids playground live in `tools/playground/voice-lines.json`; the generator skips clips whose text is unchanged (`voice-info.json`). Clips kept from the earlier recordings are listed with their transcripts in `tools/playground/voice-reused.json`. AAC clips are published under `static/kids-playground/assets/voice/`; models, virtualenv and caches stay local in `.voice-lab`. Very short lines ("One!") sometimes come back empty and need rewording. Now and then the model also drifts into a deeper, adult-sounding voice ("Mango!" did, in every take): the builder measures each take's pitch and tries another seed, and reports the line if none sounds like Zoey — then reword it. `tools/playground/check-voice.py` runs the same check over all published clips.

Download the pinned `mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit` revision in the profile to `.voice-lab/models/Qwen3-TTS-12Hz-1.7B-Base-8bit`. Runtime versions are pinned in `requirements.txt`.

Model/runtime documentation: [Qwen3-TTS in MLX Audio](https://github.com/Blaizzy/mlx-audio/blob/main/mlx_audio/tts/models/qwen3_tts/README.md).
