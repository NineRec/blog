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

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.m4a': 'audio/mp4', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
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

// The painted salon rooms: points on the customer, and pulling things off the shelf.
const anchor = async (name) => { const st = await stageBox(), p = await js(`window.__salon.rig.anchor(${JSON.stringify(name)})`); return { x: st.x + p.x * st.k, y: st.y + p.y * st.k }; };
const pull = async (key, points, pause = 16) => { await until(() => count(`.sl-item[data-item="${key}"]`), 4000, `${key} on the shelf`).catch(() => {}); await js(`(() => { const it = document.querySelector('.sl-item[data-item="${key}"]'); if (it) { const g = it.parentElement; g.scrollTop = it.offsetTop - g.clientHeight / 2 + it.offsetHeight / 2; } })()`); await sleep(120); const it = await one(`.sl-item[data-item="${key}"]`); if (!it) throw new Error(`no ${key} on the shelf`); await path([it, ...line(it, points[0], 6).slice(1), ...points.slice(1)], pause); };

const GAMES = {
  async hair() {
    await until(() => count('.sl-item[data-item="shower"]'), 9000, 'the shower on the shelf');
    const st = await stageBox(), crown = await anchor('crown'), chin = await anchor('chin'), k = st.k;
    const head = { x: crown.x, y: crown.y + 200 * k };
    await shot('hair-1-messy');
    await untilStars(1, () => pull('shower', zigzag({ x: head.x + 30 * k, y: head.y - 140 * k }, 460 * k, 300 * k, 6, 10), 20), 8, 'wet hair');
    await pull('shampoo-pink', [{ x: crown.x, y: crown.y + 60 * k }]);
    await untilStars(2, () => sleep(300), 6, 'shampoo');
    await untilStars(3, async (i) => { await path(zigzag(head, 380 * k, 260 * k, 8, 12), 12); if (i === 1) await shot('hair-2-foam'); }, 10, 'foam');
    await untilStars(4, () => pull('shower', zigzag({ x: head.x + 30 * k, y: head.y - 100 * k }, 520 * k, 420 * k, 7, 10), 20), 10, 'rinsed');
    await untilStars(5, () => pull('dryer', zigzag({ x: head.x + 120 * k, y: head.y }, 380 * k, 320 * k, 7, 10), 20), 10, 'dry');
    for (let i = 0; i < 10 && (await count('.sl-item[data-item="comb"]')); i++) for (const dx of [-220, -120, 120, 220]) if (await count('.sl-item[data-item="comb"]')) await pull('comb', line({ x: head.x + dx * k, y: crown.y + 80 * k }, { x: head.x + dx * k, y: chin.y }, 12), 14);
    await until(() => count('.sl-tab'), 5000, 'the styling tabs');
    await sleep(1500);
    await shot('hair-3-clean');
    const tab = async (key) => { await click(await one(`.sl-tab[data-tab="${key}"]`)); await sleep(400); };
    const bottomBefore = await js(`window.__salon.hair.bottom(window.__salon.hair.spec.x + 60)`);
    await tab('grow'); await pull('tonic', line({ x: head.x - 260 * k, y: chin.y }, { x: head.x + 260 * k, y: chin.y }, 30), 20);
    await tab('cut'); await pull('scissors', line({ x: head.x - 330 * k, y: chin.y - 60 * k }, { x: head.x + 330 * k, y: chin.y - 60 * k }, 16), 25);
    const bottomAfter = await js(`window.__salon.hair.bottom(window.__salon.hair.spec.x + 60)`);
    if (!(bottomAfter < bottomBefore)) throw new Error(`the scissors did not cut (${bottomBefore} → ${bottomAfter})`);
    await tab('styles'); await click(await one('.sl-item[data-item="long"]')); await sleep(800);
    if ((await js('window.__salon.hair.key')) !== 'long') throw new Error('the hairstyle did not change');
    await tab('curl'); await pull('curler', Array.from({ length: 60 }, (_, i) => ({ x: head.x - 200 * k + (i % 6) * 4, y: chin.y + 40 * k })), 16);
    await sleep(600);
    if ((await js('window.__salon.hair.key')) !== 'wavy') throw new Error('the curler did not curl');
    await tab('dye'); await pull('pink', zigzag({ x: head.x - 60 * k, y: head.y - 60 * k }, 260 * k, 300 * k, 5, 8), 20);
    await pull('rainbow', zigzag({ x: head.x + 260 * k, y: chin.y }, 160 * k, 300 * k, 5, 6), 20);
    if ((await js('window.__salon.hair.dyes.length')) < 2) throw new Error('the dye did not take');
    await tab('glitter'); await pull('gold', zigzag({ x: head.x, y: head.y - 180 * k }, 300 * k, 120 * k, 3, 8), 20);
    if (!(await count('.sl-glit'))) throw new Error('no glitter stuck');
    await tab('acc'); await pull('tiara', [{ x: crown.x, y: crown.y + 30 * k }]); await pull('bow-pink', [{ x: head.x + 200 * k, y: head.y - 60 * k }]);
    if ((await count('.sl-removable')) < 2) throw new Error('the accessories did not stick');
    await tab('straight'); await tab('cut');
    await shot('hair-4-styled');
    await click(await one('.sl-done'));
  },
  async nails() {
    await until(() => count('.sl-item[data-item="soap"]'), 9000, 'the soap on the shelf');
    const st = await stageBox(), k = st.k;
    const at = async (x, y) => { const p = await js(`window.__salon.at(${x}, ${y})`); return { x: st.x + p.x * st.k, y: st.y + p.y * st.k }; };
    const nail = async (i, dy = 0) => { const p = await js(`window.__salon.nail(${i})`); return { x: st.x + p.x * st.k, y: st.y + (p.y + dy * 0.64) * st.k }; };
    await shot('nails-1-dirty');
    await pull('soap', [await at(560, 760)]);
    await untilStars(1, () => sleep(300), 5, 'soap');
    await untilStars(2, async (i) => { await pull('nail-sponge', zigzag(await at(580, 640), 900 * k * 0.64, 900 * k * 0.64, 10, 12), 12); if (i === 0) await shot('nails-2-scrub'); for (const g of await all('.sl-germ:not(.run)')) await pull('nail-sponge', zigzag(g, 80, 60, 3, 4), 14); }, 10, 'clean hand');
    await untilStars(3, async () => pull('shower', zigzag(await at(610, 520), 950 * k * 0.64, 950 * k * 0.64, 8, 10), 22), 10, 'rinsed');
    await shot('nails-3-long');
    await untilStars(4, async () => { for (let i = 0; i < 5 && (await stars()) < 4; i++) { await pull('clipper', [await nail(i, -60)]); await sleep(250); } }, 3, 'clipped');
    await shot('nails-3b-clipped');
    await untilStars(5, async () => { for (let i = 0; i < 5 && (await stars()) < 5; i++) { const c = await nail(i, -30); await pull('file', [c, ...zigzag(c, 60 * k, 20 * k, 3, 6)], 14); } }, 4, 'filed');
    await untilStars(6, async (r) => { for (let i = 0; i < 5 && (await stars()) < 6; i++) { await pull('oil', [await nail(i)]); await sleep(200); if (r === 0 && i === 2) await shot('nails-3c-oil'); } }, 3, 'oiled');
    await until(() => count('.sl-tab'), 5000, 'the decorating tabs');
    await click(await nail(2)); await sleep(700);
    if ((await js('window.__salon.zoomed()')) !== 2) throw new Error('tapping a nail did not zoom in');
    await shot('nails-4-zoom');
    for (let t = 0; t < 4 && ((await js('window.__salon.polish[2].key')) !== 'red' || (await js('window.__salon.polish[2].wet'))); t++) await pull('red', zigzag(await nail(2), 190 * k, 260 * k, 10, 8), 12);
    await sleep(800);
    if ((await js('window.__salon.zoomed()')) !== null) throw new Error(`the nail did not zoom back out after painting (cover ${await js('window.__salon.polish[2].cover')}, key ${await js('window.__salon.polish[2].key')})`);
    for (const [i, c] of [[0, 'glitter-pink'], [1, 'rainbow'], [3, 'mint'], [4, 'pearl']]) for (let t = 0; t < 4 && (await js(`window.__salon.polish[${i}].wet !== false`)); t++) await pull(c, zigzag(await nail(i), 45 * k, 70 * k, 8, 5), 12);
    await click(await one('.sl-tab[data-tab="stickers"]')); await sleep(400); await pull('st-heart', [await nail(3)]);
    await click(await one('.sl-tab[data-tab="gems"]')); await sleep(400); await pull('gem-pink', [await nail(4)]);
    const finger = async (i, t) => { const p = await js(`window.__salon.fingerPoint(${i}, ${t})`); return { x: st.x + p.x * st.k, y: st.y + p.y * st.k }; };
    await click(await one('.sl-tab[data-tab="rings"]')); await sleep(400);
    await pull('ring-heart', [await finger(1, 0.6), await finger(1, 0.9)]); await sleep(800);
    await pull('ring-blue', [await finger(3, 0.6), await finger(3, 0.9)]); await sleep(800);
    await click(await one('.sl-tab[data-tab="bracelets"]')); await sleep(400);
    const wrist = await js('(() => { const w = window.__salon.wrist; return w; })()');
    await pull('bracelet-hearts', [await at(wrist[0], wrist[1] - 300), await at(wrist[0], wrist[1])]); await sleep(900);
    const worn = await js('JSON.stringify(window.__salon.worn())');
    if (!/"1":"ring-heart"/.test(worn) || !/"3":"ring-blue"/.test(worn) || !/bracelet-hearts/.test(worn)) throw new Error(`rings or bracelet not worn: ${worn}`);
    if ((await count('.sl-nail-deco, .sl-stuck')) < 2) throw new Error('decorations missing');
    await shot('nails-5-done');
    await click(await one('.sl-done'));
  },
  async facial() {
    await until(() => count('.sl-item[data-item="wash"]'), 9000, 'the face wash on the shelf');
    const face = async (dx = 0, dy = 0) => { const a = await anchor('face'); return { x: a.x + dx, y: a.y + dy }; };
    const scrub = async (w = 300, h = 360, rows = 7) => path(zigzag(await face(0, 20), w, h, rows, 10), 14);
    await shot('facial-1-dirty');
    await pull('wash', [await anchor('nose')]);
    await untilStars(1, async (i) => { if (i === 0) await until(() => count('.sl-item[data-item="sponge"]'), 3000, 'the sponge'); await pull('sponge', zigzag(await face(0, 20), 320, 380, 8, 10), 12); if (i === 0) await shot('facial-2-foam'); }, 8, 'a clean face');
    await untilStars(2, async () => pull('shower', zigzag(await face(30, -120), 420, 360, 6, 8), 30), 8, 'the foam rinsed away');
    await untilStars(3, async () => pull('towel', zigzag(await face(0, 20), 340, 380, 8, 10), 12), 8, 'a dry face');
    for (let i = 0; i < 3; i++) { const spot = await one('.sl-spot:not(.patched)'); if (spot) await pull(['patch-star', 'patch-heart', 'patch-flower'][i], [spot]); await sleep(300); }
    await shot('facial-3-patches');
    await untilStars(4, () => sleep(400), 8, 'the spots healed');
    const bowl = await one('.sl-bowl');
    for (const k of ['strawberry', 'kiwi', 'blueberry']) { await pull(k, [{ x: bowl.x, y: bowl.y }]); await sleep(450); }
    await shot('facial-4-bowl');
    await untilStars(5, async () => { const sp = await one('.sl-spoon'), c = { x: bowl.x, y: bowl.y - 5 * (await stageBox()).k }, r = 60 * (await stageBox()).k; await path([sp, ...Array.from({ length: 60 }, (_, i) => ({ x: c.x + Math.cos(i / 6) * r, y: c.y + Math.sin(i / 6) * r * 0.6 }))], 14); }, 6, 'the mask mixed');
    await untilStars(6, async (i) => { await pull('brush', zigzag(await face(0, 20), 340, 420, 9, 10), 12); if (i === 0) await shot('facial-5-mask'); }, 8, 'the mask on');
    for (const e of ['eyeL', 'eyeR']) { await pull('cucumber', [await anchor(e)]); await sleep(300); }
    await shot('facial-6-relax');
    await untilStars(7, () => sleep(500), 14, 'the rest');
    await untilStars(8, async () => pull('cotton', zigzag(await face(0, 20), 360, 440, 9, 10), 10), 10, 'the mask wiped off');
    await shot('facial-7-glow');
    for (const [dx, dy] of [[-110, -120], [110, -120], [-150, 60], [150, 60], [0, 150]]) { await pull('cream', [await face(dx, dy)]); await sleep(150); }
    await shot('facial-8-cream');
    await untilStars(9, async () => pull('cream', zigzag(await face(0, 20), 340, 420, 8, 10), 12), 8, 'the cream');
    await sleep(600);
    await click(await one('.sl-done'));
  },
  async makeup() {
    if (process.env.PERF) console.log('PERF', await js(`(async () => {
      const { productTint, reskin } = await import('/kids-playground/js/salon/tint.js');
      const { PROPS, BUST, BODY } = await import('/kids-playground/js/salon/manifest.js');
      const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = '/kids-playground/assets/salon/' + src; });
      const out = {};
      for (const k of ['pr-polish', 'pr-shadow-pot', 'pr-lipstick']) { const im = await load(PROPS[k].src); const t = performance.now(); for (let j = 0; j < 16; j++) productTint(im, '#' + (0x100000 + j * 77777).toString(16).slice(0, 6), j % 3 ? '' : 'glitter'); out[k + ' x16'] = Math.round(performance.now() - t); }
      const b = await load(BUST.base.src); let t = performance.now(); reskin(b, BUST.skin, '#8f5c3e', { eyeBox: BUST.eyeBox, at: [BUST.base.x, BUST.base.y] }); out['reskin bust'] = Math.round(performance.now() - t);
      const bb = await load(BODY.base.src); t = performance.now(); reskin(bb, BODY.skin || BUST.skin, '#8f5c3e', { at: [BODY.base.x, BODY.base.y] }); out['reskin body'] = Math.round(performance.now() - t);
      return JSON.stringify(out);
    })()`));
    await until(() => count('.sl-tab'), 9000, 'the makeup shelf');
    const k = (await stageBox()).k, tab = async (key) => { await click(await one(`.sl-tab[data-tab="${key}"]`)); await sleep(400); };
    const cover = (layer) => js(`window.__salon.face.${layer}.cover`);
    const around = async (name, w, h, rows = 4) => zigzag(await anchor(name), w * k, h * k, rows, 8);
    await shot('makeup-1');
    await pull('pink', [...await around('lidL', 140, 50), ...await around('lidR', 140, 50)], 16);
    await pull('pink', [...await around('lidL', 160, 70, 5), ...await around('lidR', 160, 70, 5)], 16);
    if ((await cover('shadow')) < 0.3) throw new Error(`eyeshadow only ${(await cover('shadow')).toFixed(2)}`);
    await pull('rainbow', await around('lidR', 160, 60), 16);
    await tab('brows'); await click(await one('.sl-item', 1)); await sleep(400);
    if ((await js('window.__salon.rig.browKey')) === 'natural') throw new Error('the eyebrows did not change');
    await tab('lashes'); await click(await one('.sl-item[data-item="pink"]')); await sleep(500);
    if (!(await count('.sl-lashes'))) throw new Error('no lashes');
    await tab('lens'); await click(await one('.sl-item[data-item="blue"]')); await sleep(900);
    await tab('blush'); await pull('coral', [...await around('cheekL', 160, 110), ...await around('cheekR', 160, 110)], 14);
    if ((await cover('blush')) < 0.05) throw new Error('no blush');
    await tab('lips'); await pull('cherry', await around('mouth', 170, 60, 4), 18); await pull('cherry', await around('mouth', 150, 50, 5), 18);
    if ((await cover('lips')) < 0.5) throw new Error(`lipstick only ${(await cover('lips')).toFixed(2)}`);
    await pull('gloss', await around('mouth', 150, 50, 3), 18);
    await tab('stickers'); await pull('st-heart', [await anchor('cheekR')]); await pull('st-star', [await anchor('cheekL')]);
    if ((await count('.sl-removable')) < 2) throw new Error('the stickers did not stick');
    await shot('makeup-2-done');
    await tab('wipe'); await pull('cotton', await around('cheekL', 120, 90), 14);
    if ((await count('.sl-removable')) !== 1) throw new Error('the cotton pad did not take the sticker off');
    await tab('stickers'); await pull('st-star', [await anchor('cheekL')]);
    await click(await one('.sl-done'));
  },
  async dressup() {
    const tab = async (key) => { await click(await one(`.sl-tab[data-tab="${key}"]`)); await sleep(400); };
    const wear = async (key) => { await click(await one(`.sl-item[data-item="${key}"]`)); await sleep(900); };
    const worn = () => js('JSON.stringify(window.__salon.doll.worn)').then(JSON.parse);
    await sleep(800);
    await shot('dressup-1');
    await wear('dress-princess');
    if ((await worn()).dress !== 'dress-princess') throw new Error('the dress did not go on');
    await tab('top'); await wear('top-star');
    await tab('bottom'); await wear('bottom-tutu');
    let w = await worn();
    if (w.dress || w.top !== 'top-star' || w.bottom !== 'bottom-tutu') throw new Error(`top and skirt should replace the dress: ${JSON.stringify(w)}`);
    await tab('shoes'); await wear('shoes-ballerina');
    await tab('hat'); await wear('hat-party');
    await tab('glasses'); await wear('gl-heart');
    await tab('hand'); await wear('hold-balloon');
    await tab('back'); await wear('back-butterfly');
    w = await worn();
    for (const s of ['shoes', 'hat', 'glasses', 'hand', 'back']) if (!w[s]) throw new Error(`nothing in ${s}: ${JSON.stringify(w)}`);
    await shot('dressup-2-outfit');
    // tap the glasses on her face to take them off
    const g = await js(`(() => { const r = window.__salon.doll.nodes.glasses.getBoundingClientRect(); return { x: r.left + r.width * 0.25, y: r.top + r.height / 2 }; })()`);
    await click(g); await sleep(500);
    if ((await worn()).glasses) throw new Error('tapping the glasses did not take them off');
    // every option of every tab goes on
    for (const t of ['dress', 'top', 'bottom', 'shoes', 'hat', 'glasses', 'hand', 'back']) {
      await tab(t);
      const keys = await js(`[...document.querySelectorAll('.sl-item')].map((b) => b.dataset.item)`);
      if (keys.length < 4) throw new Error(`only ${keys.length} ${t} options`);
      for (const k of keys) { await js(`window.__salon.doll.wear('${t}', '${k}', true)`); await sleep(60); if ((await worn())[t] !== k) throw new Error(`${k} did not go on`); if (process.env.EVERY) { await sleep(300); await shot(`dressup-opt-${k}`); } }
    }
    await shot('dressup-3-last');
    await click(await one('.stage-button.purple')); await sleep(900);
    await shot('dressup-4-dice');
    await click(await one('.sl-done'));
    await sleep(1500);
    await shot('dressup-5-dance');
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
  await until(() => js(`!!document.querySelector('#salon-doll .sl-head')`), 6000, 'the lobby customer').catch(() => {});
  await sleep(600);
  const ticks = await count('#salon-grid .card-done'), saved = await js(`JSON.stringify(JSON.parse(localStorage.getItem('kids-playground-v1')).salon2.looks[0])`);
  await shot('lobby-4-after');
  const l = JSON.parse(saved), done = Object.keys(l.done).length;
  const worn = await count('#salon-doll .sl-wear');
  const fine = ticks === done && (args.length ? done > 0 : done === 5 && l.hair && l.face && l.wear && worn > 0) && !errors.length;
  if (!fine) failed++;
  console.log(`${fine ? 'PASS' : 'FAIL'} lobby keeps the look (${ticks}/5 rooms ticked, ${worn} things worn) ${fine ? '' : saved.slice(0, 300)} ${errors.join(' | ')}`);
}
// The salon lobby: five rooms, a customer who can be swapped, photographed and reset, and a door on the home screen.
if (!args.length || args.includes('lobby')) {
  errors.length = 0;
  try {
    await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
    await send('Page.navigate', { url: base }); await sleep(900);
    await click(await one('.card-door')); await sleep(700);
    if (!(await js(`location.hash === '#/salon' && !document.getElementById('salon').hidden`))) throw new Error('the door did not open the salon');
    if ((await count('#salon-grid .card')) !== 5) throw new Error(`${await count('#salon-grid .card')} rooms in the salon`);
    await until(() => js(`!!document.querySelector('#salon-doll .sl-head')`), 6000, 'the lobby customer');
    await sleep(500);
    await shot('lobby-1');
    const who = () => js(`JSON.parse(localStorage.getItem('kids-playground-v1') || '{}').salon2?.who ?? 0`);
    const before = await who();
    // the customer gallery: all six, each as she looks; pick one and she hops on
    for (const [i, pickIt] of [[0, 2], [1, 4]]) {
      await click(await one('#salon-buttons .round', 0)); await sleep(400);
      if ((await count('.salon-guest')) !== 6) throw new Error(`${await count('.salon-guest')} customers in the gallery`);
      await until(() => js(`[...document.querySelectorAll('.salon-guest')].every((g) => g.querySelector('.sl-head'))`), 9000, 'all six drawn in the gallery');
      await sleep(300);
      if (i === 0) await shot('lobby-2-gallery');
      await click(await one('.salon-guest', pickIt)); await sleep(1800);
      if (await count('.salon-gallery')) throw new Error('the gallery did not close');
      if ((await who()) !== pickIt) throw new Error(`picked ${pickIt}, got ${await who()}`);
      await shot(`lobby-2-next-${i}`);
    }
    if ((await who()) === before) throw new Error('the customer did not change');
    if (await js(`document.querySelector('#salon-doll .salon-name').textContent`) === '朵朵') throw new Error('the name did not change');
    await click(await one('#salon-doll')); await sleep(300);
    await click(await one('#salon-buttons .round', 1)); await sleep(700);
    if (!(await js(`document.getElementById('salon-doll').classList.contains('zoomed')`))) throw new Error('no zoom');
    await shot('lobby-2-zoom');
    await click(await one('#salon-buttons .round', 1)); await sleep(500);
    await click(await one('#salon-buttons .round', 2)); await sleep(1400);
    if (!(await count('.salon-photo .sl-head'))) throw new Error('no photo of her');
    await shot('lobby-3-photo');
    await click(await one('.salon-photo')); await sleep(500);
    if (await count('.salon-photo')) throw new Error('the photo did not close');
    await click(await one('#salon-buttons .round', 3)); await sleep(1500);
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
