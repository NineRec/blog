// Checks the service worker (what build.mjs writes) on a copy of /kids-playground/, in headless Chromium:
//   1. a first visit keeps only the core offline;
//   2. opening a game keeps all of that game's files;
//   3. with the server gone, that game still opens and draws;
//   4. an update downloads only what changed, and the game is still kept offline afterwards.
//   node tools/playground/test-sw.mjs [game]          (default: hair)
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, mkdtempSync, readFileSync, readdirSync, existsSync, statSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const game = process.argv[2] || 'hair';
const tmp = mkdtempSync(join(tmpdir(), 'kp-sw-'));
const app = join(tmp, 'kids-playground');
cpSync(join(here, '../../static/kids-playground'), app, { recursive: true });
const build = () => execFileSync('node', [join(here, 'build.mjs')], { env: { ...process.env, KP_ROOT: app } }).toString();
build();
const sw = () => readFileSync(join(app, 'sw.js'), 'utf8');
const constant = (name) => JSON.parse(new RegExp(`const ${name} = (.*);`).exec(sw())[1]);

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.m4a': 'audio/mp4', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
let offline = false;
const asked = [];
const server = createServer((req, res) => {
  if (offline) { req.socket.destroy(); return; }
  const url = decodeURIComponent(req.url.split('?')[0]);
  asked.push(url.replace('/kids-playground/', ''));
  let file = resolve(tmp, '.' + url);
  try {
    if (!file.startsWith(tmp)) throw new Error('outside');
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
    res.end(readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/kids-playground/`;

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell')).sort().reverse()) {
    for (const sub of readdirSync(join(cache, dir))) { const p = join(cache, dir, sub, 'chrome-headless-shell'); if (existsSync(p)) return p; }
  }
  throw new Error('Set CHROME to a Chromium binary');
}
const profile = join(tmp, 'profile');
const chrome = spawn(findChrome(), ['--headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--mute-audio', '--window-size=1194,834', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((done) => chrome.stderr.on('data', (d) => { const m = /ws:\/\/[^\s]+/.exec(String(d)); if (m) done(m[0]); }));
const target = (await (await fetch(`http://127.0.0.1:${new URL(wsUrl).port}/json`)).json()).find((t) => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const pending = new Map(), errors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((done, fail) => { const id = ++seq; pending.set(id, (m) => (m.error ? fail(new Error(m.error.message)) : done(m.result))); ws.send(JSON.stringify({ id, method, params })); });
for (const d of ['Runtime', 'Page']) await send(`${d}.enable`);
const js = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, what) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await sleep(200); } throw new Error(`timed out: ${what}`); };
const go = async (hash = '') => { await send('Page.navigate', { url: 'about:blank' }); await sleep(100); await send('Page.navigate', { url: base + hash }); await sleep(1200); };
// what the current cache holds: [cache names, paths kept]
const cached = () => js(`(async () => { const names = (await caches.keys()).filter((k) => k.startsWith('kids-playground-')); const c = await caches.open(names[names.length - 1]);
  return [names, (await c.keys()).map((r) => decodeURIComponent(new URL(r.url).pathname).replace('/kids-playground/', '') || './')]; })()`);
const size = (p) => (p === './' || p.startsWith('__') ? 0 : statSync(join(app, p)).size);
const mb = (list) => (list.reduce((s, p) => s + size(p), 0) / 1e6).toFixed(2) + ' MB';
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) failed++; };

try {
  // 1. first visit
  await go();
  asked.length = 0;
  await js(`navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => true)`);
  await until(() => js('!!navigator.serviceWorker.controller'), 15000, 'the worker to take the page');
  const CORE = constant('CORE'), GROUPS = constant('GROUPS');
  let [names, kept] = await cached();
  const fetched = asked.filter((p) => p !== 'sw.js');
  check(kept.length === CORE.length && CORE.every((p) => kept.includes(p)), `first visit keeps the core: ${kept.length}/${CORE.length} files, ${mb(CORE)} (downloaded ${fetched.length})`);

  // 2. opening a game keeps that game
  const mine = GROUPS[game] || [];
  await go(`#/play/${game}`);
  await js(`navigator.serviceWorker.controller.postMessage({ warm: ${JSON.stringify(game)} }), true`);
  await until(async () => (await cached())[1].includes(`__warm/${game}`), 60000, `${game} kept offline`);
  [names, kept] = await cached();
  check(mine.length > 0 && mine.every((p) => kept.includes(p)), `opening ${game} keeps its ${mine.length} files (${mb(mine)})`);

  // 3. offline
  offline = true;
  errors.length = 0;
  await go(`#/play/${game}`);
  await until(() => js(`document.getElementById('stage')?.children.length > 0`), 8000, `${game} to start offline`);
  await sleep(1500);
  const broken = await js(`[...document.querySelectorAll('#stage img')].filter((i) => i.complete && !i.naturalWidth).map((i) => i.src.split('/').pop())`);
  const pics = await js(`document.querySelectorAll('#stage img').length`);
  // and its voice: one of its clips, fetched and decoded with no server
  const clip = mine.find((p) => p.endsWith('.m4a'));
  const heard = !clip || await js(`fetch(${JSON.stringify(clip)}).then((r) => r.arrayBuffer()).then((b) => new OfflineAudioContext(1, 1, 48000).decodeAudioData(b)).then((a) => a.duration > 0, () => false)`);
  check(!broken.length && !errors.length && heard, `${game} plays offline (${pics} pictures, ${broken.length} missing${broken.length ? ': ' + broken.slice(0, 5).join(' ') : ''}; voice ${clip ? (heard ? 'decodes' : 'MISSING') : 'none'}${errors.length ? '; errors: ' + errors.join(' | ') : ''})`);
  offline = false;

  // 4. an update: one script and one of the game's files change
  const changed = ['js/fx.js', mine.find((p) => p.endsWith('.webp') || p.endsWith('.m4a'))].filter(Boolean);
  appendFileSync(join(app, changed[0]), '\n// changed\n');
  if (changed[1]) { const f = join(app, changed[1]); writeFileSync(f, Buffer.concat([readFileSync(f), Buffer.from([0])])); }
  build();
  await go();
  asked.length = 0;
  const before = names[0];
  await js(`navigator.serviceWorker.getRegistration().then((r) => r.update()).then(() => true)`);
  await until(async () => { const [n, k] = await cached(); return n.length === 1 && n[0] !== before && k.includes(`__warm/${game}`) && mine.every((p) => k.includes(p)); }, 60000, 'the update to finish');
  const downloaded = [...new Set(asked.filter((p) => p !== 'sw.js'))].sort();
  check(downloaded.length === changed.length && changed.every((p) => downloaded.includes(p)), `the update downloads only what changed: ${downloaded.join(', ') || 'nothing'}`);
  [names, kept] = await cached();
  check(mine.every((p) => kept.includes(p)), `${game} is still kept offline after the update; old cache removed (${names.length} cache)`);
} catch (err) {
  failed++;
  console.log(`FAIL ${err.message}`);
}
ws.close(); chrome.kill(); server.close();
await sleep(300);
rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
