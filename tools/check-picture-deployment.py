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
for name in ['app.js', 'art.js', 'materials.js', 'mini-art.js', 'creatures.js', 'games.js', 'mini-games.js',
             'materials-preview.js', 'play-flow.js', 'picture-play.css', 'club.css',
             'audio/narration.json', 'audio/recording-info.json']:
    verify(name)
meta = json.loads((assets / 'audio' / 'recording-info.json').read_text())
assert meta['voice'] == 'Zoey / 03-curious'
lines = json.loads((assets / 'audio' / 'narration.json').read_text())
assert len(meta['recordings']) == len(lines)
changed = ['market-pay','market-done','market-cashier','market-checkout','kitchen-next','play-tap',
           'traffic-intro','traffic-wait','traffic-wrong','traffic-done','traffic-turn-left','traffic-turn-right',
           'traffic-green','traffic-park','traffic-market','traffic-library','traffic-next']
for name in changed:
    verify(f'audio/{name}.m4a')
print(f'PASS live HTML + 13 versioned assets + {len(changed)} voice clips match this checkout; {len(lines)} bundled Zoey recordings')
print(base)
