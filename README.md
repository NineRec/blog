# CodePanic Blog Content

The repo for `blog.CodePanic.cn`. Based on Hugo.

Directly copied the theme [hugo-theme-even](https://github.com/olOwOlo/hugo-theme-even) code to folder `theme/even`, as repo not actively maintained, and there are bugs need to be fixed.

## init the repo

```bash
git clone https://github.com/NineRec/blog.git
git submodule update --init
```

## new post

```
hugo new post/blog-title.md
```

## deploy

```
sh deploy.sh
```

## Kids apps

Linked from the **Games** page (`content/games.md`, menu entry in `config.toml`).

- **Zoey 的游乐园** lives in `static/kids-playground/` and is published at `/kids-playground/`: thirteen small games for a four-year-old (makeup, dress-up, cake shop, pet bath, colouring, thinking puzzles, ice cream shop, feeding, jigsaw, memory, hide and seek, maze, fruit catching) with a sticker album. Plain ES modules, no build step; all pictures are flat SVG drawn in `js/art/`; it installs as a PWA and works offline.
  - Preview: `python3 -m http.server 8080 --directory static`, then open `http://localhost:8080/kids-playground/` (`dev/gallery.html` shows every picture).
  - After changing any file run `node tools/playground/build.mjs` to refresh the offline file list in `sw.js`.
  - `node tools/playground/test.mjs` plays every game to the end in headless Chromium.
  - Zoey's voice: add a line to `tools/playground/voice-lines.json`, then `.voice-lab/.venv/bin/python tools/playground/build-voice.py` (see `tools/voice/README.md`).
    The builder re-renders any take that comes out in a deeper, grown-up voice; `tools/playground/check-voice.py` scans the whole folder for such clips.
  - `dev/pets.html` shows every bath friend wearing every accessory (the per-animal fit lives in `FIT` in `js/games/spa.js`).
- **Zoey 的小钢琴** in `static/kids-piano/` is copied from its own project and published at `/kids-piano/`.
