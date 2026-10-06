#!/usr/bin/env python3
"""Check the live, versioned assets against this checkout after a Pages deploy."""
import hashlib
import json
import os
from pathlib import Path
import re
import urllib.request

root = Path(__file__).resolve().parents[1]
assets = root / 'static' / 'butterfly-adventure'
base = os.environ.get('BASE_URL', 'https://blog.codepanic.cn/butterfly-adventure/').rstrip('/') + '/'
version = re.search(r"const AUDIO_VERSION = '([^']+)'", (assets / 'app.js').read_text())[1]

def get(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Zoey-deployment-check'})
    with urllib.request.urlopen(request, timeout=30) as response:
        assert response.status == 200, (url, response.status)
        return response.read()

def verify(name):
    actual = get(base + name + '?v=' + version)
    expected = (assets / name).read_bytes()
    assert hashlib.sha256(actual).digest() == hashlib.sha256(expected).digest(), f'Stale asset: {name}'

assert version in get(base).decode(), 'Stale game-selection page'
assert version in get(base + 'materials.html').decode(), 'Stale material gallery'
html = get(base + 'play.html').decode()
assert f'picture-play.css?v={version}' in html and f'play-flow.js?v={version}' in html
assert f'puzzle-games.js?v={version}' in html and f'sfx.js?v={version}' in html and f'puzzle.css?v={version}' in html, 'Stale game page'
hub = get(base).decode()
assert 'game=connect' in hub and 'game=match' in hub, 'The new puzzle doors are missing'
assets_checked = ['app.js', 'art.js', 'materials.js', 'zoo-animals.js', 'sea-animals.js', 'mini-art.js', 'creatures.js',
                  'world-maps.js', 'games.js', 'mini-games.js', 'hub.js', 'materials-preview.js', 'play-flow.js',
                  'picture-play.css', 'club.css', 'learning.css', 'world-map.css',
                  'puzzle-art.js', 'puzzle-games.js', 'puzzle.css', 'sfx.js', 'celebration.js',
                  'audio/narration.json', 'audio/recording-info.json']
for name in assets_checked:
    verify(name)
meta = json.loads((assets / 'audio' / 'recording-info.json').read_text())
assert meta['voice'] == 'Zoey / 03-curious'
lines = json.loads((assets / 'audio' / 'narration.json').read_text())
assert len(meta['recordings']) == len(lines)
candidates = dict.fromkeys(re.findall(r"\['([a-z]+)','[A-Za-z ']+','", (assets / 'creatures.js').read_text()))
zoo_sea = [key for key in candidates if key in lines]
assert len(zoo_sea) >= 60, 'Every zoo and sea animal needs its own spoken introduction'
changed = (['zoo-intro', 'sea-intro'] + [key for key in lines if key.startswith(('seedling-', 'connect-', 'match-'))] + zoo_sea)
for name in changed:
    verify(f'audio/{name}.m4a')
print(f'PASS live HTML + {len(assets_checked)} versioned assets + {len(changed)} voice clips match this checkout; {len(lines)} bundled Zoey recordings')
print(base)
