// Plays every game of /kids-playground/ to the end in headless Chromium with real mouse input.
//   node tools/playground/test.mjs [game ...]        (CHROME=/path/to/chrome, OUT=/dir/for/screenshots, SIZE=1194x834)
// Needs no packages: it serves static/ itself and talks to the browser over the DevTools protocol.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync, mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../static');
const out = process.env.OUT || join(tmpdir(), 'kids-playground-test');
mkdirSync(out, { recursive: true });
const [VW, VH] = (process.env.SIZE || '1194x834').split('x').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell')).sort().reverse()) {
    for (const sub of readdirSync(join(cache, dir))) { const p = join(cache, dir, sub, 'chrome-headless-shell'); if (existsSync(p)) return p; }
  }
  throw new Error('Set CHROME to a Chromium binary');
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.m4a': 'audio/mp4', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  let file = resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  try {
    if (!file.startsWith(root)) throw new Error('outside');
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
    res.end(readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/kids-playground/`;

const chrome = spawn(findChrome(), ['--headless', '--remote-debugging-port=0', `--window-size=${VW},${VH}`, '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((done) => chrome.stderr.on('data', (d) => { const m = /ws:\/\/[^\s]+/.exec(String(d)); if (m) done(m[0]); }));
const port = new URL(wsUrl).port;
const target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const pending = new Map(), errors = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id) { pending.get(msg.id)?.(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
  if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) errors.push(`${msg.params.response.status} ${msg.params.response.url}`);
});
const send = (method, params = {}) => new Promise((done, fail) => { const id = ++seq; pending.set(id, (m) => (m.error ? fail(new Error(m.error.message)) : done(m.result))); ws.send(JSON.stringify({ id, method, params })); });
for (const d of ['Runtime', 'Page', 'Network']) await send(`${d}.enable`);
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });

const js = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed'); return r.result.value; };
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
const click = async (p) => { await mouse('mousePressed', p.x, p.y); await mouse('mouseReleased', p.x, p.y); };
const path = async (points, pause = 12) => { await mouse('mousePressed', points[0].x, points[0].y); for (const p of points.slice(1)) { await mouse('mouseMoved', p.x, p.y); await sleep(pause); } const l = points[points.length - 1]; await mouse('mouseReleased', l.x, l.y); };
const line = (a, b, n = 8) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }));
const zigzag = (c, w, h, rows = 6, n = 10) => Array.from({ length: rows }, (_, r) => line({ x: c.x - w / 2, y: c.y - h / 2 + h * r / (rows - 1) }, { x: c.x + w / 2, y: c.y - h / 2 + h * r / (rows - 1) }, n)).flatMap((l, r) => (r % 2 ? l.reverse() : l));
const RECT = `(e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }`;
const all = (sel) => js(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(${RECT})`);
const one = async (sel, i = 0) => (await all(sel))[i];
const largest = async () => (await all('.sprite')).sort((a, b) => b.w * b.h - a.w * a.h)[0];
const count = (sel) => js(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const won = () => js(`!document.getElementById('win').hidden`);
const stars = () => count('#progress .on');
const until = async (fn, ms = 9000, what = 'condition') => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(120); } throw new Error(`timed out waiting for ${what}`); };
const shot = async (name) => writeFileSync(join(out, `${name}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

// For the salon games: where the stage is on the screen, and holding a tool by its working end.
const stageBox = () => js(`(() => { const s = document.getElementById('stage'), r = s.getBoundingClientRect(), W = parseFloat(s.style.width); return { x: r.left, y: r.top, k: r.width / W, W }; })()`);
const tool = (key) => one(`.tool[data-tool="${key}"]`);
/** Drag a tool so that its working end (not the middle of its picture) passes through these screen points. */
const useTool = async (key, points, pause = 16) => {
  const t = await tool(key), tip = await js(`import('./js/art/salon.js').then((m) => m.TIP[${JSON.stringify(key)}])`);
  await path([t, ...points.map((p) => ({ x: p.x - tip[0] * t.w, y: p.y - tip[1] * t.h }))], pause);
};
const untilStars = async (n, act, tries = 8, what = `star ${n}`) => { for (let i = 0; i < tries && (await stars()) < n; i++) { await act(i); await sleep(250); } if ((await stars()) < n) throw new Error(`did not reach ${what}`); };

const GAMES = {
  async hair() {
    await sleep(500);
    const st = await stageBox(), at = (x, y) => ({ x: st.x + x * st.k, y: st.y + y * st.k }), hx = Math.round(st.W * 0.45), hy = 336;
    const sweep = (x0, y0, x1, y1, n = 14) => line(at(x0, y0), at(x1, y1), n);
    await untilStars(1, () => useTool('shampoo', [...sweep(hx - 70, hy - 215, hx + 70, hy - 215, 8), ...sweep(hx + 70, hy - 215, hx - 70, hy - 215, 8)], 150), 3, 'shampoo on the hair');
    if ((await count('.salon-face[data-eyes="shut"]')) !== 1) throw new Error('she did not close her eyes for the shampoo');
    await shot('hair-1-shampoo');
    await untilStars(2, () => path(zigzag(at(hx, hy - 150), 250 * st.k, 110 * st.k, 5, 12), 22), 6, 'a lather');
    await shot('hair-2-lather');
    await untilStars(3, () => useTool('shower', [...sweep(hx - 240, hy - 290, hx + 240, hy - 290, 20), ...sweep(hx + 240, hy - 290, hx - 240, hy - 290, 20)], 40), 5, 'the foam rinsed off');
    if (await count('.foam')) await sleep(600);
    await shot('hair-3-wet');
    await untilStars(4, (i) => useTool('dryer', i % 2 ? [...sweep(hx - 40, hy - 150, hx - 40, hy + 230, 16), ...sweep(hx - 40, hy + 230, hx - 40, hy - 150, 16)] : [...sweep(hx + 250, hy - 150, hx + 250, hy + 230, 16), ...sweep(hx + 250, hy + 230, hx + 250, hy - 150, 16)], 90), 10, 'dry hair');
    await shot('hair-4-frizzy');
    await untilStars(5, () => useTool('comb', zigzag(at(hx, hy), 460 * st.k, 440 * st.k, 9, 12), 24), 5, 'combed hair');
    await sleep(900);
    await shot('hair-5-tools');
    // the hairdresser's tools: each must really change the hair
    const paths = () => js(`[...document.querySelectorAll('.strands path')].map((p) => p.getTotalLength()).reduce((a, b) => a + b, 0)`);
    const before = await paths();
    await useTool('scissors', sweep(hx - 280, hy + 120, hx - 110, hy + 120, 20), 20);
    if (!(await count('.cut path'))) throw new Error('the scissors cut nothing');
    await sleep(200);
    const cut = await paths();
    if (!(cut < before - 300)) throw new Error(`cutting did not shorten the hair (${before} → ${cut})`);
    await shot('hair-6-cut');
    await useTool('potion', [...Array(40)].map((_, i) => at(hx - 175 + (i % 2) * 6, hy + 110)), 40);
    const grown = await paths();
    if (!(grown > cut + 300)) throw new Error(`the potion did not grow the hair (${cut} → ${grown})`);
    await click(await one('.hair-dyes .swatch', 5)); await sleep(150);
    await useTool('spray', zigzag(at(hx + 175, hy + 60), 70 * st.k, 260 * st.k, 7, 6), 24);
    if (!(await count('.strands path[stroke="#3fb4ff"]'))) throw new Error('the spray did not colour the hair');
    await click(await one('.hair-dyes .swatch', 7)); await sleep(150);
    await useTool('spray', zigzag(at(hx - 175, hy + 60), 70 * st.k, 260 * st.k, 7, 6), 24);
    const wavy = () => js(`Math.max(...[...document.querySelectorAll('.strands[data-kind="drape"] path')].map((p) => p.getBBox().width))`);
    const straight = await wavy();
    await useTool('curler', zigzag(at(hx + 175, hy + 80), 60 * st.k, 240 * st.k, 6, 6), 40);
    await shot('hair-7-styled');
    await useTool('dryer', [...Array(30)].map(() => at(hx + 300, hy + 60)), 40);
    await shot('hair-8-wind');
    // glitter sticks to the hair, and every ready-made hairstyle reshapes it
    await useTool('glitter', zigzag(at(hx + 170, hy + 20), 80 * st.k, 220 * st.k, 6, 6), 30);
    if ((await count('.glits path')) < 5) throw new Error(`only ${await count('.glits path')} bits of glitter on the hair`);
    await shot('hair-8b-glitter');
    const lengths = [], widths = [];
    for (let i = 0; i < 4; i++) { await click(await one('.hair-presets .chip', i)); await sleep(1700); lengths.push(Math.round(await paths())); widths.push(await wavy()); await shot(`hair-style-${i}`); }
    if (!(lengths[0] < lengths[1] - 1500)) throw new Error(`the short and the long hairstyle look the same (${lengths})`);
    if (!(widths[3] > widths[1] + 4)) throw new Error(`the curly hairstyle is no curlier than the straight one (${widths})`);
    await click(await one('.stage-button.green')); await sleep(500);
    // every crown and hair thing goes on (one from the top and one from the side at a time)
    const things = await count('.tray:not(.hair-presets) .chip');
    for (let i = 0; i < things; i++) {
      await click(await one('.tray .chip', i)); await sleep(520);
      if (!(await js(`[...document.querySelectorAll('.wear .acc-in')].some((g) => g.getBBox().width > 20)`))) throw new Error(`hair thing ${i} did not show`);
      if (i < 6 || i === 8) await shot(`hair-wear-${i}`);
    }
    await click(await one('.tray .chip', 1)); await sleep(300);
    if ((await count('.wear .acc-in')) !== 2) throw new Error('the hair things were not put on');
    await sleep(500);
    await shot('hair-9-done');
    await click(await one('.stage-button.pink'));
  },
  async nails() {
    await sleep(500);
    const st = await stageBox(), at = (x, y) => ({ x: st.x + x * st.k, y: st.y + y * st.k }), px = Math.round(st.W * 0.48), py = 536;
    const sweep = (x0, y0, x1, y1, n = 14) => line(at(x0, y0), at(x1, y1), n);
    await shot('nails-1-dirty');
    const hand = [[-30, 60], [52, 150], [-98, -210], [-34, -250], [40, -230], [106, -160], [-150, 20], [30, -10], [-66, 130], [70, 70]];
    await untilStars(1, () => useTool('sponge', hand.flatMap(([x, y]) => zigzag(at(px + x, py + y), 70 * st.k, 50 * st.k, 4, 5)), 10), 4, 'a clean hand');
    if (await count('.grime .mud')) throw new Error('mud is left on the hand');
    await shot('nails-1b-foam');
    await untilStars(2, () => useTool('shower', [...sweep(px - 220, py - 360, px + 220, py - 360, 26), ...sweep(px + 220, py - 360, px - 220, py - 360, 26)], 40), 4, 'the foam rinsed off');
    await sleep(900);
    await shot('nails-1c-long');
    for (const tip of await all('.finger .over')) { await useTool('clipper', [...line({ x: tip.x + 120, y: tip.y }, tip, 6), ...Array(8).fill(tip)], 50); await sleep(450); }
    if ((await stars()) < 3) { await sleep(700); if ((await stars()) < 3) throw new Error('the nails were not clipped'); }
    await sleep(400);
    await shot('nails-2-clipped');
    for (const edge of await all('.finger .rough')) { await useTool('file', [...Array(9)].flatMap(() => [{ x: edge.x - 26, y: edge.y }, { x: edge.x + 26, y: edge.y }]), 22); await sleep(450); }
    await sleep(700);
    if ((await stars()) < 4) throw new Error('the nails were not filed');
    await sleep(500);
    const nails = await all('.finger .plate');
    for (let i = 0; i < nails.length; i++) {
      await click(await one('.nl-polish .chip', [0, 3, 8, 7, 6][i])); await sleep(120);
      // a tap brings the nail up close; it is painted there and the hand comes back by itself
      await click(nails[i]); await sleep(800);
      if (!(await count('.zoom-ring'))) throw new Error(`nail ${i} did not zoom in`);
      const big = (await all('.finger .plate'))[i];
      if (!(big.w > nails[i].w * 1.8)) throw new Error(`nail ${i} is not bigger up close (${nails[i].w} → ${big.w})`);
      await path(zigzag(big, big.w * 0.8, big.h * 0.8, 7, 8), 10);
      if (i === 1) await shot('nails-3-painting');
      await until(async () => !(await count('.zoom-ring')), 4000, 'the hand to come back');
      await sleep(700);
    }
    // zooming out by hand works too
    await click(nails[0]); await sleep(800);
    await click(await one('.stage-button.blue')); await sleep(800);
    if (await count('.zoom-ring')) throw new Error('the zoom-out button did not work');
    if ((await count('.finger .paint rect')) !== 5) throw new Error(`only ${await count('.finger .paint rect')} nails took a full coat`);
    await click(await one('.stage-button.green')); await sleep(700);
    const pieces = await all('.sprite.shadowed.draggable');
    for (let i = 0; i < 5; i++) { await path(line(pieces[i], nails[i], 8)); await sleep(150); }
    if ((await count('.finger .decal .acc-in')) !== 5) throw new Error('the stickers did not land on the nails');
    const fingersAt = await all('.finger');
    await path(line(pieces[6], fingersAt[2], 8)); await sleep(150);
    await path(line(pieces[7], fingersAt[3], 8)); await sleep(150);
    if ((await count('.ring-on')) !== 2) throw new Error('the rings did not go on');
    await path(line(pieces[9], at(px, py + 190), 8)); await sleep(500);
    if ((await count('.wrist-slot .acc-in')) !== 1) throw new Error('the bracelet did not go on');
    await shot('nails-4-done');
    await click(await one('.stage-button.pink'));
  },
  async facial() {
    await sleep(500);
    const st = await stageBox(), K = 0.86, hx = Math.round(st.W * 0.47), hy = 404;
    const at = (x, y) => ({ x: st.x + x * st.k, y: st.y + y * st.k }), face = (x, y) => at(hx + (x - 300) * K, hy + (y - 339) * K);
    const over = (rows = 8) => zigzag(at(hx, hy + 36), 320 * st.k, 300 * st.k, rows, 12);
    await shot('facial-1-dirty');
    await untilStars(1, () => useTool('puff', over(), 26), 5, 'a clean face');
    await shot('facial-2-foam');
    await untilStars(2, () => useTool('towel', over(), 22), 5, 'the foam wiped off');
    await sleep(600);
    const tokens = await all('.sprite.shadowed.draggable'), bowl = at(168, 588);
    if (tokens.length !== 5) throw new Error(`${tokens.length} things to mix`);
    await path(line(tokens[0], at(600, 700), 6)); await sleep(500);      // dropped beside the bowl: it goes back
    for (const i of [1, 2, 4]) { await path(line(tokens[i], bowl, 8)); await sleep(450); }
    if ((await count('.blobs circle')) !== 3) throw new Error('the things did not land in the bowl');
    await shot('facial-2b-bowl');
    const spoon = await one('.sprite.shadowed.pulse');
    await path([spoon, ...[...Array(10)].flatMap(() => [at(118, 548), at(218, 548)].flatMap((p, k) => line(k ? at(118, 548) : at(218, 548), p, 5)))], 12);
    await untilStars(3, () => sleep(400), 5, 'the mask mixed');
    await shot('facial-2c-mixed');
    await sleep(500);
    await untilStars(4, () => path(over(10), 14), 5, 'the mask painted on');
    if (!(await count('.mask-paint > *'))) throw new Error('no mask on the face');
    await shot('facial-3-mask');
    await sleep(500);
    const slices = await all('.sprite.pulse.draggable');
    await path(line(slices[0], face(218, 364), 8)); await sleep(300);
    await path(line(slices[1], face(382, 364), 8));
    await untilStars(5, () => sleep(300), 6, 'cucumbers on the eyes');
    await sleep(600);
    for (let i = 0; i < 3; i++) { await click(await one('.sprite.tappable.pulse')); await sleep(450); if (i === 1) await shot('facial-4-steam'); await sleep(450); }
    await untilStars(6, () => sleep(400), 10, 'the steaming');
    await sleep(500);
    for (const eye of [face(218, 364), face(382, 364)]) { await click(eye); await sleep(450); }
    await untilStars(7, () => useTool('towel', over(10), 16), 5, 'the mask wiped off');
    if (await count('.mask-paint > *')) throw new Error('some mask is left');
    await sleep(600);
    await useTool('cream', [[300, 272], [172, 448], [428, 448], [300, 426], [300, 552]].flatMap(([x, y]) => [face(x, y), face(x, y), face(x, y)]), 60);
    if ((await count('.creams .acc-in')) !== 5) throw new Error(`only ${await count('.creams .acc-in')} dabs of cream`);
    await shot('facial-5-cream');
    for (const [x, y] of [[300, 272], [172, 448], [428, 448], [300, 426], [300, 552]]) await path(zigzag(face(x, y), 50 * st.k, 30 * st.k, 5, 6), 12);
  },
  async makeup() {
    const face = await largest();
    const lips = { x: face.x, y: face.y - face.h / 2 + face.h * 504 / 730 };
    await path(zigzag(lips, face.w * 0.13, face.h * 0.05, 5, 12));
    const lip = await js(`+document.querySelector('.paint-lip').getAttribute('opacity')`);
    if (!(lip > 0.6)) throw new Error(`lipstick did not go on (${lip})`);
    // every lash style and every sparkle must really show on the face
    for (const [cat, slot, n] of [[3, 'lash', 3], [4, 'gem', 5]]) {
      await click(await one('.mk-cats .chip', cat)); await sleep(150);
      for (let i = 0; i < n; i++) {
        await click(await one('.mk-options .chip', i)); await sleep(200);
        // a shape counts as showing when its middle is not under the fringe, which is drawn after it
        const seen = await js(`(() => { const svg = document.querySelector('.sprite svg'), fringe = svg.querySelector('[data-slot="gem"]').nextElementSibling;
          return [...svg.querySelector('[data-slot="${slot}"]').querySelectorAll('path, circle, ellipse')].filter((n) => { const b = n.getBBox(), p = svg.createSVGPoint(); p.x = b.x + b.width / 2; p.y = b.y + b.height / 2; return !fringe.isPointInFill(p); }).length; })()`);
        if (!seen) throw new Error(`${slot} option ${i} is hidden on the face`);
        await shot(`makeup-${slot}-${i}`);
      }
    }
    for (const [cat, slot] of [[3, 'lash'], [5, 'hair'], [6, 'ear'], [7, 'neck']]) {
      await click(await one('.mk-cats .chip', cat)); await sleep(150);
      await click(await one('.mk-options .chip', 1)); await sleep(150);
      if (!(await js(`document.querySelector('[data-slot="${slot}"]').innerHTML.length`))) throw new Error(`${slot} was not put on`);
    }
    for (let i = 0; i < 4; i++) {
      await click(await one('.mk-cats .chip', 8)); await sleep(150);
      await click(await one('.mk-options .chip', i)); await sleep(200);
      if (!(await js(`document.querySelector('[data-slot="brow"]').getBBox().width > 100`))) throw new Error(`brow ${i} did not show`);
    }
    await shot('makeup-brows');
    // she shuts her eyes while the lids are painted, and opens them again
    await click(await one('.mk-cats .chip', 2)); await sleep(150);
    const lid = { x: face.x - face.w * 0.137, y: face.y - face.h / 2 + face.h * 316 / 730 };
    await mouse('mousePressed', lid.x, lid.y);
    for (const p of zigzag(lid, face.w * 0.14, face.h * 0.05, 5, 10)) { await mouse('mouseMoved', p.x, p.y); await sleep(10); }
    if (!(await count('.mk-face.shut'))) throw new Error('her eyes stayed open for the eye shadow');
    await shot('makeup-shut');
    await mouse('mouseReleased', lid.x, lid.y); await sleep(600);
    if (await count('.mk-face.shut')) throw new Error('her eyes did not open again');
    await click(await one('.mk-cats .chip', 1)); await sleep(150);
    await click(await one('.mk-options .swatch', 2));
    await path(zigzag({ x: face.x - face.w * 0.22, y: face.y - face.h / 2 + face.h * 452 / 730 }, face.w * 0.11, face.h * 0.05, 5, 12));
    await shot('makeup-face');
    await click(await one('.stage-button.pink'));
  },
  async dressup() {
    for (const [cat, opt] of [[0, 1], [1, 3], [2, 0], [3, 0], [4, 1], [5, 1], [6, 2]]) {
      await click(await one('.du-cats .chip', cat)); await sleep(150);
      await click(await one('.du-options .chip', opt)); await sleep(200);
    }
    if (!(await js(`document.querySelector('#stage .sprite.bob svg').innerHTML.includes('rgba(255,143,196,.45)')`))) throw new Error('the glasses did not go on');
    await shot('dressup-look');
    await click(await one('.stage-button.pink'));
    await sleep(1200);
    await shot('dressup-dance');
  },
  async cake() {
    await click(await one('.cake-side .chip', 2)); await sleep(200);
    await click(await one('.stage-button.green')); await sleep(300);
    const cake = await largest();
    const half = cake.w * 0.34;
    for (const fy of [0.83, 0.6, 0.38]) await path([...line({ x: cake.x - half, y: cake.y - cake.h / 2 + cake.h * fy }, { x: cake.x + half, y: cake.y - cake.h / 2 + cake.h * fy }, 40), ...line({ x: cake.x + half, y: cake.y - cake.h / 2 + cake.h * fy }, { x: cake.x - half, y: cake.y - cake.h / 2 + cake.h * fy }, 40)], 6);
    await click(await one('.stage-button.green')); await sleep(300);
    if (await stars() !== 2) throw new Error('cream step did not finish');
    const tops = await all('.sprite.draggable');
    for (let i = 0; i < 5; i++) { await path(line(tops[i], { x: cake.x + (i - 2) * cake.w * 0.11, y: cake.y + cake.h * (0.05 - (i % 2) * 0.2) })); await sleep(150); }
    await click(await one('.stage-button.green')); await sleep(300);
    for (let i = 0; i < 3; i++) { await click(await one('.tray .chip', i)); await sleep(200); }
    await shot('cake-candles');
    await click(await one('.stage-button.green')); await sleep(400);
    for (const c of await all('.sprite.pulse')) { await click({ x: c.x, y: c.y - c.h * 0.3 }); await sleep(250); }
  },
  async spa() {
    // Every visit has its own steps: tap what is stuck on or floating around, otherwise use the tool that is lit up.
    await sleep(600);
    const pet = await largest();
    const visit = await js(`document.getElementById('stage').dataset.visit`), seen = new Set();
    const sweeps = [zigzag({ x: pet.x, y: pet.y - pet.h * 0.07 }, pet.w * 0.8, pet.h * 0.69, 7, 14), zigzag({ x: pet.x, y: pet.y - pet.h * 0.47 }, pet.w * 1.05, pet.h * 0.07, 2, 14)];
    for (let turn = 0; turn < 40 && !(await count('.stage-button.green')); turn++) {
      const tap = await one('.layer .sprite.tappable');
      if (tap) { if (!seen.has('tap' + await stars())) { seen.add('tap' + await stars()); await shot(`spa-${visit}-step${await stars()}-tap`); } await click(tap); await sleep(200); continue; }
      const tool = await one('.tool.pulse');
      if (!tool) { await sleep(300); continue; }
      const kind = await js(`document.querySelector('.tool.pulse')?.dataset.tool`);
      if (!seen.has(kind)) { seen.add(kind); await shot(`spa-${visit}-step${await stars()}-${kind}`); }
      const before = await stars();
      for (const sweep of sweeps) if ((await stars()) === before) await path([tool, ...sweep], 14);
      await sleep(250);
    }
    if (!(await count('.stage-button.green'))) throw new Error(`the bath did not finish (visit ${await js(`document.getElementById('stage').dataset.visit`)}, ${await stars()} stars)`);
    for (const i of [1, 4, 5]) { await click(await one('.tray .chip', i)); await sleep(150); }
    await shot(`spa-visit-${await js(`document.getElementById('stage').dataset.visit`)}`);
    await click(await one('.stage-button.green'));
  },
  async coloring() {
    await click(await one('.cl-thumb', 0)); await sleep(500);
    // a point that really lands on each shape (others may lie on top of its middle)
    const zones = await js(`[...document.querySelectorAll('.cl-paper .zone, .cl-paper .zone-line')].map((z) => { const r = z.getBoundingClientRect(); for (let i = 0; i < 60; i++) { const x = r.left + r.width * ((i * 0.37) % 1), y = r.top + r.height * ((i * 0.61) % 1); if (document.elementFromPoint(x, y) === z) return { x, y }; } return null; }).filter(Boolean)`);
    for (let i = 0; i < zones.length; i++) { if (i % 3 === 0) await click(await one('.cl-palette > *', (i / 3) % 9)); await click(zones[i]); await sleep(40); }
    const painted = await js(`[...document.querySelectorAll('.cl-paper .zone, .cl-paper .zone-line')].filter((z) => z.getAttribute(z.dataset.kind) !== '#ffffff').length`);
    if (painted < 4) throw new Error(`only ${painted} shapes took colour`);
    const all = await count('.cl-paper .zone, .cl-paper .zone-line');
    if (zones.length < all) throw new Error(`${all - zones.length} of ${all} shapes cannot be reached`);
    if (await js(`document.querySelector('.cl-paper .zone').getAttribute('fill') === '#ffffff'`)) throw new Error('the background did not take colour');
    if ((await count('.cl-pattern')) < 10) throw new Error('too few patterns');
    // nothing left to colour is smaller than a fingertip
    const small = await js(`[...document.querySelectorAll('.cl-paper .zone')].filter((z) => { const r = z.getBoundingClientRect(); return Math.max(r.width, r.height) < 34 * innerHeight / 834; }).length`);
    if (small) throw new Error(`${small} shapes are still too small to tap`);
    await shot('coloring-page');
    if (!(await won())) await click(await one('.stage-button.green'));
  },
  async logic() {
    for (let i = 0; i < 60 && !(await won()); i++) {
      const card = await one('.q-card:not(.no):not(.yes)');
      if (i === 3) await shot('logic-question');
      if (card && !(await count('.q-card.yes'))) await click(card);
      await sleep(await count('.q-card.yes') ? 900 : 350);
    }
  },
  async icecream() {
    for (let served = 0; served < 4; served++) {
      await until(() => count('.bubble-box.order'), 9000, 'an order');
      for (let pass = 0; pass < 8 && !(await count('.sprite.glow')); pass++) for (const chip of await all('.ic-tray .chip')) { await click(chip); await sleep(60); if (await count('.sprite.glow')) break; }
      if (served === 3) await shot('icecream-order');
      await click(await one('.sprite.glow'));
      await until(async () => (await stars()) === served + 1, 4000, 'the customer to be served');
      await sleep(served < 3 ? 2400 : 0);
    }
  },
  async feed() {
    for (let round = 0; round < 5; round++) {
      await until(() => count('.bubble-box.think'), 9000, 'a hungry friend');
      await sleep(300);
      const pet = await largest();
      for (const pile of await all('.sprite.shadowed.draggable')) {
        for (let n = 0; n < 9; n++) {
          const before = await count('.want.fed');
          await path(line(pile, { x: pet.x, y: pet.y })); await sleep(450);
          if ((await count('.want.fed')) === before) break;
        }
      }
      if (round === 0) await shot('feed-round');
      await until(async () => (await stars()) === round + 1, 4000, 'the friend to be full');
      await until(async () => (await won()) || ((await count('.bubble-box.think')) && !(await count('.want.fed'))), 8000, 'the next friend');
    }
  },
  async puzzle() {
    await shot('puzzle-levels');
    await click(await one('.pz-level', +(process.env.PUZZLE || 0)));
    await until(() => count('.pz'), 6000, 'the pieces');
    await sleep(1600);
    const total = await count('.pz');
    await shot(`puzzle-${total}-start`);
    for (let i = 0; i < total * 4 && await count('.pz:not(.placed)'); i++) {
      const p = await one('.pz:not(.placed)');
      // whichever piece is really under that point goes to its own place
      const to = await js(`((x, y) => { const piece = document.elementFromPoint(x, y)?.closest('.pz'); if (!piece || piece.classList.contains('placed')) return null;
        const stage = document.getElementById('stage'), r = stage.getBoundingClientRect(), k = r.width / parseFloat(stage.style.width);
        return { x: r.left + piece.dataset.tx * k, y: r.top + piece.dataset.ty * k }; })(${p.x}, ${p.y})`);
      if (!to) { await path(line(p, { x: p.x + 40, y: p.y - 30 })); continue; }
      await path(line(p, to, 8), 8); await sleep(200);
    }
    await shot(`puzzle-${total}-solved`);
  },
  async memory() {
    for (let turn = 0; turn < 60 && !(await won()); turn++) {
      const cards = await js(`[...document.querySelectorAll('.mcard')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, done: e.classList.contains('matched'), key: e.querySelector('.front').innerHTML.replace(/kp\\d+/g, '').replace(/style="[^"]*"/g, '') }; })`);
      const open = cards.filter((c) => !c.done);
      if (!open.length) { await sleep(400); continue; }
      const a = open[0], b = open.find((c) => c !== a && c.key === a.key);
      await click(a); await sleep(120); await click(b); await sleep(1000);
      if (turn === 1) await shot('memory-cards');
    }
  },
  async seek() {
    for (let round = 0; round < 2; round++) {
      await sleep(900);
      if (round === 0) await shot('seek-scene');
      for (const h of await all('.sprite.tappable')) { await click({ x: h.x, y: h.y - h.h * 0.25 }); await sleep(260); }
      await until(async () => (await stars()) === round + 1, 3000, 'everyone to be found');
      await sleep(2600);
    }
  },
  async maze() {
    const petAt = () => js(`(() => { const e = [...document.querySelectorAll('.sprite')].find((s) => s.querySelector('svg.animal')); return (${RECT})(e); })()`);
    for (let round = 0; round < 3; round++) {
      await sleep(700);
      const start = await petAt(), cell = start.w / 0.82, seen = new Set(['0,0']);
      const walk = async (gx, gy, at) => {
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const key = `${gx + dx},${gy + dy}`;
          if (seen.has(key)) continue;
          await click({ x: at.x + dx * cell, y: at.y + dy * cell }); await sleep(190);
          const now = await petAt();
          if (Math.hypot(now.x - at.x, now.y - at.y) < cell / 2) continue;
          seen.add(key);
          if ((await stars()) > round) return true;
          if (await walk(gx + dx, gy + dy, now)) return true;
          await click(at); await sleep(190);
        }
        return false;
      };
      if (!(await walk(0, 0, start))) throw new Error(`no way through maze ${round + 1}`);
      if (round === 2) await shot('maze-done');
      await sleep(2300);
    }
  },
  async catch() {
    await mouse('mousePressed', VW / 2, VH / 2);
    for (let i = 0; i < 1400 && !(await won()); i++) {
      const x = await js(`(() => { const f = [...document.querySelectorAll('.sprite')].filter((s) => s.querySelector('svg.food')).map((s) => s.getBoundingClientRect()).filter((r) => r.top < innerHeight * 0.8).sort((a, b) => b.top - a.top)[0]; return f ? f.left + f.width / 2 : null; })()`);
      if (x) await mouse('mouseMoved', x, VH / 2);
      if (i === 150) await shot('catch-play');
      await sleep(40);
    }
    await mouse('mouseReleased', VW / 2, VH / 2);
  },
};

const args = process.argv.slice(2);
const wanted = (args.length ? args : Object.keys(GAMES)).filter((n) => n !== 'lobby' && n !== 'look');
let failed = 0;
await send('Page.navigate', { url: base });
await sleep(1200);
const cards = await count('.card');
await shot('hub');
console.log(`hub: ${cards} cards`);
for (const name of wanted) {
  errors.length = 0;
  const started = Date.now();
  try {
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(150);
    await send('Page.navigate', { url: `${base}#/play/${name}` });
    await until(() => js(`document.getElementById('stage')?.children.length > 0`), 8000, 'the game to start');
    await sleep(700);
    await GAMES[name]();
    await until(won, 12000, 'the win screen');
    await sleep(1500);
    await shot(`${name}-win`);
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    console.log(`PASS ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } catch (err) {
    failed++;
    await shot(`${name}-FAILED`);
    console.log(`FAIL ${name}: ${err.message}${errors.length ? ` [errors: ${errors.join(' | ')}]` : ''}`);
  }
}
// After the rooms: the lobby figure wears what she was given, and the rooms are ticked off.
if (!args.length || args.includes('look')) {
  errors.length = 0;
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: `${base}#/salon` }); await sleep(900);
  const ticks = await count('#salon-grid .card-done'), saved = await js(`JSON.stringify(JSON.parse(localStorage.getItem('kids-playground-v1')).salon.looks[0])`);
  await shot('lobby-4-after');
  const done = Object.keys(JSON.parse(saved).done).length;
  const fine = ticks === done && (args.length ? done > 0 : done === 6 && ['outfit', 'hairCol', 'makeup'].every((k) => JSON.parse(saved)[k])) && !errors.length;
  if (!fine) failed++;
  console.log(`${fine ? 'PASS' : 'FAIL'} lobby keeps the look (${ticks}/6 rooms ticked) ${fine ? '' : saved} ${errors.join(' | ')}`);
}
// The salon lobby: six rooms, a customer who can be swapped, photographed and reset, and a door on the home screen.
if (!args.length || args.includes('lobby')) {
  errors.length = 0;
  try {
    await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
    await send('Page.navigate', { url: base }); await sleep(900);
    await click(await one('.card-door')); await sleep(700);
    if (!(await js(`location.hash === '#/salon' && !document.getElementById('salon').hidden`))) throw new Error('the door did not open the salon');
    if ((await count('#salon-grid .card')) !== 6) throw new Error(`${await count('#salon-grid .card')} rooms in the salon`);
    await shot('lobby-1');
    const who = () => js(`JSON.parse(localStorage.getItem('kids-playground-v1') || '{}').salon?.who ?? 0`);
    const before = await who();
    await click(await one('#salon-buttons .round', 0)); await sleep(1300);
    if ((await who()) === before) throw new Error('the customer did not change');
    await shot('lobby-2-next');
    await click(await one('#salon-doll')); await sleep(300);
    await click(await one('#salon-buttons .round', 1)); await sleep(1100);
    if (!(await count('.salon-photo'))) throw new Error('no photo');
    await shot('lobby-3-photo');
    await click(await one('.salon-photo')); await sleep(500);
    if (await count('.salon-photo')) throw new Error('the photo did not close');
    await click(await one('#salon-buttons .round', 2)); await sleep(400);
    await click(await one('#salon-grid .card', 3)); await sleep(900);
    if (!(await js(`location.hash.startsWith('#/play/') && document.getElementById('stage').children.length > 0`))) throw new Error('a room did not open');
    await click(await one('#play-home .round')); await sleep(600);
    if (!(await js(`location.hash === '#/salon'`))) throw new Error('home in a room did not lead back to the salon');
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    console.log('PASS lobby');
  } catch (err) { failed++; await shot('lobby-FAILED'); console.log(`FAIL lobby: ${err.message}${errors.length ? ` [errors: ${errors.join(' | ')}]` : ''}`); }
}
// Sound after the app has been in the background: the first touch back must bring a running audio context.
{
  errors.length = 0;
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: base }); await sleep(900);
  await click(await one('.hub-side .zoey'));
  await sleep(300);
  const state = () => js(`import('./js/audio.js').then((m) => m.audioState())`);
  const first = await state();
  await js(`(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); })()`);
  await sleep(200);
  const away = await state();
  await js(`(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); })()`);
  await click(await one('.hub-side .zoey'));
  await sleep(400);
  const back = await state();
  const fine = first === 'running' && away !== 'running' && back === 'running' && !errors.length;
  if (!fine) failed++;
  console.log(`${fine ? 'PASS' : 'FAIL'} sound after returning from the background (${first} → ${away} → ${back})${errors.length ? ` errors: ${errors.join(' | ')}` : ''}`);
}

errors.length = 0;
await send('Page.navigate', { url: `${base}#/album` }); await sleep(800);
const stickers = await count('.sticker'), got = await count('.sticker.got');
await shot('album');
console.log(`album: ${got}/${stickers} stickers${errors.length ? ` errors: ${errors.join(' | ')}` : ''}`);
console.log(`screenshots in ${out}`);
ws.close(); chrome.kill(); server.close();
process.exit(failed ? 1 : 0);
