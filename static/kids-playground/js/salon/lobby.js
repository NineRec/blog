// 美美沙龙 lobby: the customer of the moment stands on a pedestal head to toe, wearing everything
// the rooms gave her. Tap her and she reacts; swap her for the next customer, zoom in on her face,
// take a polaroid, or wash it all off and start again. The rooms are cards, ticked when done.
import { el, anim, icon, roundButton } from '../core.js';
import { say, sfx, unlock } from '../audio.js';
import { confetti, burst } from '../fx.js';
import { BG, PROPS } from './manifest.js';
import { ART, img } from './ui.js';
import { Doll } from './doll.js';
import { customer, look, resetLook, CUSTOMERS, whoIndex, setWho, lookOf } from './look.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The little part of a game's context a doll needs when it lives outside a game (the lobby, the
 * home-screen door, a photo): timers and a frame loop that stop when its node leaves the page.
 */
export function shim(holder) {
  const ctx = {
    get alive() { return holder.isConnected; },
    after: (ms, fn) => setTimeout(() => { if (ctx.alive) fn(); }, ms),
    sleep,
    loop(fn) { let on = true; const tick = () => { if (!on || !ctx.alive) return; fn(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); return () => { on = false; }; },
    point: (ev) => { const r = holder.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; },
    add: (node) => holder.appendChild(node),
    sfx, say,
  };
  return ctx;
}

/** Draw the customer, head to toe, filling a box (w × h px) inside `holder`. Resolves to the Doll. */
export async function dollIn(holder, w, h, o = {}) {
  const ctx = shim(holder);
  const height = h * (o.fill ?? 0.97);
  const doll = new Doll(ctx, { parent: holder, cx: w / 2, bottom: h - (o.foot ?? 0), height }, o.who || customer(), o.look || look());
  await doll.ready;
  doll.head.blinking = o.blink !== false;
  return doll;
}

let built = false, busy = false, doll = null, zoomed = false, games = [];

export function renderSalon(list) {
  games = list;
  if (!built) {
    built = true;
    $('salon-bg').innerHTML = BG.lobby ? img(BG.lobby, 'salon-bg-art') : '';
    $('salon-back').append(roundButton('home', 'ink', '回到首页', () => { sfx('tap'); location.hash = '#/'; }));
    $('salon-buttons').append(
      roundButton('swap', 'purple big', '选一位客人', () => gallery()),
      roundButton('zoom', 'blue big', '看近一点', () => zoom()),
      roundButton('camera', 'pink big', '拍照', () => photo()),
      roundButton('eraser', 'orange big', '重新打扮', () => reset()),
    );
    $('salon-doll').addEventListener('click', () => { unlock(); tapped(); });
    $('salon-grid').addEventListener('click', (ev) => { if (ev.target.closest('.card')) { unlock(); sfx('tap'); } });
  }
  zoomed = false;
  $('salon-doll').classList.remove('zoomed');
  drawRooms();
  drawDoll();
}

function drawRooms() {
  const done = look().done || {};
  $('salon-grid').innerHTML = '';
  for (const g of games) {
    $('salon-grid').append(el('a', {
      class: 'card salon-card', href: `#/play/${g.id}`, style: { '--c1': g.colors[0], '--c2': g.colors[1] }, 'data-game': g.id,
      html: `<div class="card-art">${g.icon()}</div><div class="card-name">${g.name}</div>${done[g.id] ? `<div class="card-done">${icon('check')}</div>` : ''}`,
    }));
  }
  const n = games.filter((g) => done[g.id]).length;
  $('salon-stars').innerHTML = `${icon('star')}<span>${n} / ${games.length}</span>`;
}

/** The pedestal, her name, and her. */
async function drawDoll(enter = '') {
  const box = $('salon-doll');
  box.innerHTML = '';
  const W = box.clientWidth || 360, H = box.clientHeight || 600;
  box.append(el('div', { class: 'salon-pedestal-art', html: PROPS.pedestal ? img(PROPS.pedestal.src) : '' }));
  const stand = box.appendChild(el('div', { class: `salon-stand ${enter}` }));
  box.append(el('div', { class: 'salon-name', html: customer().name }));
  const ped = Math.min(W * 0.2, H * 0.12);
  doll = await dollIn(stand, W, H, { foot: ped * 0.55, fill: 0.92 });
  doll.node.dataset.who = customer().name;
  return doll;
}

function tapped() {
  if (busy || !doll) return;
  const r = Math.floor(Math.random() * 3);
  sfx(['pop', 'boing', 'squeak'][r]);
  say(`sl-lobby-tap-${r + 1}`);
  if (r === 0) { doll.mood('love', 1100); doll.react('hop'); }
  else if (r === 1) { doll.mood('giggle', 1100); doll.spin(); }
  else { doll.mood('surprise', 700); doll.react('giggle'); }
  const b = $('salon-doll');
  burst(b, b.clientWidth / 2, b.clientHeight * 0.3, { n: 8, spread: 160, shapes: ['heart'] });
}

/**
 * All the customers side by side, each as she looks now (with how many rooms she has been through).
 * Tap one: the gallery closes, the one on the pedestal hops off and the chosen one hops on.
 */
async function gallery() {
  if (busy) return;
  busy = true;
  unlock();
  sfx('whoosh');
  if (zoomed) zoom();
  const view = $('salon');
  const box = view.appendChild(el('div', { class: 'salon-gallery', role: 'dialog', 'aria-label': '选一位客人' }));
  const grid = box.appendChild(el('div', { class: 'salon-gallery-grid' }));
  let closed = false;
  const close = async (pick) => {
    if (closed) return;
    closed = true;
    await box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished.catch(() => {});
    box.remove();
    busy = false;
    if (pick != null && pick !== whoIndex()) swap(pick);
  };
  box.append(roundButton('close', 'ink', '关闭', () => { sfx('tap'); close(null); }));
  box.addEventListener('click', (ev) => { if (ev.target === box) close(null); });
  anim(box, 'in', 220);
  const cards = CUSTOMERS.map((who, i) => {
    const l = lookOf(i), n = games.filter((g) => l.done?.[g.id]).length;
    const card = grid.appendChild(el('button', { class: `salon-guest${i === whoIndex() ? ' on' : ''}`, type: 'button', 'data-who': i, 'aria-label': who.name,
      html: `<div class="salon-guest-doll"></div><div class="salon-guest-name">${who.name}</div><div class="salon-guest-done">${icon('star')}<span>${n}</span></div>` }));
    card.addEventListener('click', () => { sfx('pop'); anim(card, 'squash', 250); close(i); });
    anim(card, 'pop', 300, { delay: i * 50 });
    return { card, who, l };
  });
  // the little dolls draw once the cards have their size
  await sleep(30);
  for (const { card, who, l } of cards) {
    if (closed) break;
    const holder = card.querySelector('.salon-guest-doll');
    await dollIn(holder, holder.clientWidth, holder.clientHeight, { fill: 0.98, blink: false, who, look: l });
  }
}

/** She hops off the pedestal to the right, customer `i` hops on from the left. */
async function swap(i) {
  if (busy) return;
  busy = true;
  sfx('whoosh');
  const stand = $('salon-doll').querySelector('.salon-stand');
  if (stand) await stand.animate([0, 1, 2, 3].map((k) => ({ transform: `translate(${k * 45}%, ${k % 2 ? -6 : 0}%)`, opacity: k === 3 ? 0 : 1 })), { duration: 520, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
  setWho(i);
  await drawDoll('walk-in');
  drawRooms();
  say('sl-lobby-next');
  sfx('sparkle');
  doll.mood('love', 1300);
  const b = $('salon-doll');
  burst(b, b.clientWidth / 2, b.clientHeight * 0.5, { n: 9, spread: 170 });
  busy = false;
}

/** Look closer: the camera moves in on her face, and back out. */
function zoom() {
  unlock();
  zoomed = !zoomed;
  sfx(zoomed ? 'slide' : 'whoosh');
  $('salon-doll').classList.toggle('zoomed', zoomed);
  if (zoomed && doll) doll.mood('surprise', 600);
}

/** A polaroid of the finished look: flash, then the print drops in with her in it. */
async function photo() {
  if (busy || !doll) return;
  busy = true;
  unlock();
  sfx('camera');
  say('sl-lobby-cheese');
  doll.mood('love', 1600);
  const view = $('salon');
  const flash = view.appendChild(el('div', { class: 'flash' }));
  await sleep(420);
  flash.remove();
  const shot = view.appendChild(el('button', { class: 'salon-photo', type: 'button', 'aria-label': '照片',
    html: `<div class="salon-print"><div class="salon-print-art">${BG.lobby ? img(BG.lobby, 'salon-print-bg') : ''}<div class="salon-print-doll"></div></div><div class="salon-print-name">${customer().name}</div></div>` }));
  const holder = shot.querySelector('.salon-print-doll');
  const pd = await dollIn(holder, holder.clientWidth, holder.clientHeight, { fill: 1, blink: false });
  pd.mood('love');
  confetti(2200);
  sfx('win');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    shot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).finished.then(() => shot.remove(), () => shot.remove());
    busy = false;
  };
  shot.addEventListener('click', () => { sfx('tap'); close(); });
  setTimeout(close, 4200);
}

/** A big soapy sweep washes the look off: she is as she walked in. */
async function reset() {
  if (busy) return;
  busy = true;
  unlock();
  sfx('water');
  const b = $('salon-doll');
  const wipe = b.appendChild(el('div', { class: 'salon-wipe', html: PROPS.sponge ? img(PROPS.sponge.src) : '' }));
  await wipe.animate([{ transform: 'translate(-60%, 10%) rotate(-20deg)' }, { transform: 'translate(40%, 30%) rotate(10deg)' }, { transform: 'translate(-30%, 55%) rotate(-10deg)' }, { transform: 'translate(70%, 70%) rotate(20deg)', opacity: 0 }], { duration: 900, easing: 'ease-in-out' }).finished.catch(() => {});
  resetLook();
  await drawDoll();
  anim(b.querySelector('.salon-stand'), 'pop', 400);
  burst(b, b.clientWidth / 2, b.clientHeight * 0.45, { n: 12, spread: 200 });
  drawRooms();
  busy = false;
}

void ART;
