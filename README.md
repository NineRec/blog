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

- **Zoey 的游乐园** lives in `static/kids-playground/` and is published at `/kids-playground/`: sixteen small games for a four-year-old with a sticker album. Plain ES modules, no build step; all pictures are flat SVG drawn in `js/art/`; it installs as a PWA and works offline.
  - **美美沙龙** is a collection of its own (`#/salon`, `js/salon.js`): one customer stands in the lobby and six rooms work on her — hair salon, makeup, spa facial, nail salon, dress-up, pet bath. What a room changes (hair colour and length, makeup, crown, outfit, glasses) is saved per customer and shown on the lobby figure; the lobby can swap the customer, take a photo, or start her over.
  - The playground group holds the other ten: cake shop, colouring, thinking puzzles, ice cream shop, feeding, jigsaw, memory, hide and seek, maze, fruit catching.
  - Preview: `python3 -m http.server 8080 --directory static`, then open `http://localhost:8080/kids-playground/` (`dev/gallery.html` shows every picture).
  - After changing any file run `node tools/playground/build.mjs` to refresh the offline file list in `sw.js`.
  - `node tools/playground/test.mjs` plays every game to the end in headless Chromium, muted (`… test.mjs nails lobby` runs only those; `lobby` and `look` check the salon lobby).
  - Zoey's voice: add a line to `tools/playground/voice-lines.json`, then `.voice-lab/.venv/bin/python tools/playground/build-voice.py` (see `tools/voice/README.md`; if the virtualenv is gone: `python3 -m venv .voice-lab/.venv && .voice-lab/.venv/bin/pip install -r tools/voice/requirements.txt`).
    The builder re-renders any take that comes out in a deeper, grown-up voice; `tools/playground/check-voice.py` scans the whole folder for such clips.
  - `dev/pets.html` shows every bath friend wearing every accessory (the per-animal fit lives in `FIT` in `js/games/spa.js`).
- **Zoey 的小钢琴** in `static/kids-piano/` is copied from its own project and published at `/kids-piano/`.
