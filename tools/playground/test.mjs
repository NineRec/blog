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

const chrome = spawn(findChrome(), ['--headless', '--remote-debugging-port=0', `--window-size=${VW},${VH}`, '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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

const GAMES = {
  async makeup() {
    const face = await largest();
    const lips = { x: face.x, y: face.y - face.h / 2 + face.h * 504 / 730 };
    await path(zigzag(lips, face.w * 0.13, face.h * 0.05, 5, 12));
    const lip = await js(`+document.querySelector('.paint-lip').getAttribute('opacity')`);
    if (!(lip > 0.6)) throw new Error(`lipstick did not go on (${lip})`);
    for (const [cat, slot] of [[3, 'lash'], [5, 'hair'], [6, 'ear'], [7, 'neck']]) {
      await click(await one('.mk-cats .chip', cat)); await sleep(150);
      await click(await one('.mk-options .chip', 1)); await sleep(150);
      if (!(await js(`document.querySelector('[data-slot="${slot}"]').innerHTML.length`))) throw new Error(`${slot} was not put on`);
    }
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
    await shot('dressup-look');
    await click(await one('.stage-button.pink'));
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
    await sleep(600);
    for (let i = 0; i < 12 && await count('.sprite.pulse.tappable'); i++) { await click(await one('.sprite.pulse.tappable')); await sleep(250); }
    if (await stars() !== 1) throw new Error('leaves did not come off');
    const pet = await largest();
    const tools = await all('.tool');
    for (const [i, c, w, h] of [[0, { x: pet.x, y: pet.y - pet.h * 0.07 }, pet.w * 0.75, pet.h * 0.64], [1, { x: pet.x, y: pet.y - pet.h * 0.47 }, pet.w * 1.05, pet.h * 0.07], [2, { x: pet.x, y: pet.y - pet.h * 0.07 }, pet.w * 0.8, pet.h * 0.69]]) {
      for (let pass = 0; pass < 4 && await stars() < i + 2; pass++) await path([tools[i], ...zigzag(c, w, h, 7, 14)], 14);
      if (await stars() !== i + 2) throw new Error(`tool ${i} did not finish (stars ${await stars()})`);
      await sleep(200);
    }
    await click(await one('.tray .chip', 1)); await click(await one('.tray .chip', 4)); await sleep(200);
    await shot('spa-clean');
    await click(await one('.stage-button.green'));
  },
  async coloring() {
    await click(await one('.cl-thumb', 0)); await sleep(500);
    // a point that really lands on each shape (others may lie on top of its middle)
    const zones = await js(`[...document.querySelectorAll('.cl-paper .zone')].map((z) => { const r = z.getBoundingClientRect(); for (let i = 0; i < 60; i++) { const x = r.left + r.width * ((i * 0.37) % 1), y = r.top + r.height * ((i * 0.61) % 1); if (document.elementFromPoint(x, y) === z) return { x, y }; } return null; }).filter(Boolean)`);
    for (let i = 0; i < zones.length; i++) { if (i % 3 === 0) await click(await one('.cl-palette > *', (i / 3) % 9)); await click(zones[i]); await sleep(40); }
    const painted = await js(`[...document.querySelectorAll('.cl-paper .zone')].filter((z) => z.getAttribute('fill') !== '#ffffff').length`);
    if (painted < 4) throw new Error(`only ${painted} shapes took colour`);
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
      await until(async () => !(await count('.bubble-box.think')) || won(), 6000, 'the next friend');
    }
  },
  async puzzle() {
    for (let round = 0; round < 3; round++) {
      await sleep(1800);
      for (let i = 0; i < 40 && await count('.piece:not(.placed)'); i++) {
        const p = await one('.piece:not(.placed)');
        const targetOf = `((x, y) => { const piece = document.elementFromPoint(x, y)?.closest('.piece'); if (!piece) return null; const [vx, vy, vw, vh] = piece.querySelector('svg').getAttribute('viewBox').split(' ').map(Number);
          const b = document.querySelector('.pz-board svg').getBoundingClientRect(); return { x: b.left + (vx + vw / 2) / 600 * b.width, y: b.top + (vy + vh / 2) / 450 * b.height }; })(${p.x}, ${p.y})`;
        const to = await js(targetOf);
        if (!to) { await path(line(p, { x: p.x - 30, y: p.y + 20 })); continue; }
        await path(line(p, to, 10)); await sleep(260);
      }
      if (round === 2) await shot('puzzle-solved');
      await until(async () => (await stars()) === round + 1, 3000, 'the picture to be whole');
      await sleep(2200);
    }
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

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(GAMES);
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
errors.length = 0;
await send('Page.navigate', { url: `${base}#/album` }); await sleep(800);
const stickers = await count('.sticker'), got = await count('.sticker.got');
await shot('album');
console.log(`album: ${got}/${stickers} stickers${errors.length ? ` errors: ${errors.join(' | ')}` : ''}`);
console.log(`screenshots in ${out}`);
ws.close(); chrome.kill(); server.close();
process.exit(failed ? 1 : 0);
