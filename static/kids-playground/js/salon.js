// 美美沙龙 — the salon as a collection of its own. One customer at a time stands in the lobby;
// what she gets in each room (hair colour, makeup, a crown, an outfit) is remembered and shown on her.
import { el, store, anim, icon, roundButton } from './core.js';
import { say, sfx, unlock } from './audio.js';
import { confetti, burst } from './fx.js';
import { CLIENTS } from './art/salon.js';
import { zoeySvg } from './art/girl.js';
import { room } from './art/scenes.js';
import { R, E, C, star, sparkle, heartPath } from './art/base.js';

const STYLE = ['bob', 'long', 'pigtails', 'curly', 'buns', 'ponytail'];     // the hair each customer walks in with
const data = () => store.data.salon || (store.data.salon = { who: 0, looks: {} });

export const whoIndex = () => data().who % CLIENTS.length;
export const client = () => CLIENTS[whoIndex()];
/** What the customer of the moment has had done so far. */
export function look() { const s = data(), i = whoIndex(); return s.looks[i] || (s.looks[i] = { done: {} }); }
/** A room is finished: remember what it changed. */
export function saveLook(zone, patch = {}) {
  const l = look();
  Object.assign(l, patch);
  l.done = { ...l.done, [zone]: true };
  store.save();
}
/** Her look as the full figure in `art/girl.js` understands it. */
export function dollLook() {
  const who = client(), l = look();
  return { hair: l.hair || STYLE[whoIndex() % STYLE.length], hairCol: l.hairCol || who.hair, skin: who.skin, outfit: l.outfit || null, shoes: l.shoes || null,
    head: l.head || null, hand: l.hand || null, back: l.back || null, glasses: l.glasses || null, makeup: l.makeup || null };
}

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let built = false, busy = false;

function lobbyArt() {
  let out = room(1200, '#f6e9ff', '#ecdcff', '#d9c2f5', 640);
  // a long mirror, a shelf of bottles and a plant: the things every salon has
  out += R(96, 110, 250, 440, 110, '#ffd447') + R(116, 130, 210, 400, 92, '#e6f5ff') + `<path d="M150 160 l50 0 l-96 150 l-28 0z" fill="#fff" opacity=".55"/>`;
  out += R(420, 250, 300, 16, 8, '#fff') + [[450, '#ff8fc4'], [510, '#7fd3ff'], [570, '#9be27a'], [630, '#ffd447'], [690, '#c4adff']].map(([x, col], i) => R(x - 18, 196 + (i % 2) * 14, 36, 54 - (i % 2) * 14, 12, col) + R(x - 9, 180 + (i % 2) * 14, 18, 20, 5, '#fff')).join('');
  out += R(790, 520, 90, 110, 26, '#ff9ecb') + E(835, 470, 70, 80, '#7ed957') + E(800, 500, 44, 56, '#9be27a') + E(872, 506, 40, 50, '#5fc45a');
  for (const [x, y, r, col] of [[60, 80, 16, '#fff36b'], [380, 90, 12, '#ff9ecb'], [760, 120, 15, '#7fd3ff'], [1130, 90, 14, '#fff36b'], [1000, 200, 10, '#ff9ecb']]) out += `<g class="twinkle" style="animation-delay:${-(x % 5) * 0.3}s">${star(x, y, r, col)}</g>`;
  return out;
}

/** Draw the lobby. `games` are the rooms, in order. */
export function renderSalon(games) {
  if (!built) {
    built = true;
    $('salon-bg').innerHTML = `<svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMax slice">${lobbyArt()}</svg>`;
    $('salon-back').append(roundButton('home', 'ink', '回到首页', () => { sfx('tap'); location.hash = '#/'; }));
    $('salon-buttons').append(
      roundButton('swap', 'purple big', '换一位客人', () => swap(games)),
      roundButton('camera', 'pink big', '拍照', () => photo()),
      roundButton('eraser', 'blue big', '重新打扮', () => { sfx('water'); data().looks[whoIndex()] = { done: {} }; store.save(); drawDoll(true); drawRooms(games); }),
    );
    $('salon-doll').addEventListener('click', () => { unlock(); sfx('pop'); cheer(1400); say('hello'); });
    $('salon-grid').addEventListener('click', (ev) => { if (ev.target.closest('.card')) { unlock(); sfx('tap'); } });
  }
  drawRooms(games);
  drawDoll(false);
}

function drawRooms(games) {
  const done = look().done || {};
  $('salon-grid').innerHTML = '';
  for (const g of games) {
    $('salon-grid').append(el('a', {
      class: 'card', href: `#/play/${g.id}`, style: { '--c1': g.colors[0], '--c2': g.colors[1] }, 'data-game': g.id,
      html: `<div class="card-art">${g.icon()}</div><div class="card-name">${g.name}</div>${done[g.id] ? `<div class="card-done">${icon('check')}</div>` : ''}`,
    }));
  }
  const n = games.filter((g) => done[g.id]).length;
  $('salon-stars').innerHTML = `${icon('star')}<span>${n} / ${games.length}</span>`;
}

function drawDoll(pop) {
  const node = $('salon-doll');
  node.innerHTML = `<div class="salon-pedestal"></div><div class="zoey salon-figure" data-pose="idle">${zoeySvg(dollLook())}</div>`;
  node.querySelector('svg').setAttribute('preserveAspectRatio', 'xMidYMax meet');      // her feet stay on the pedestal
  if (pop) { anim(node.lastChild, 'pop', 400); burst(node, node.clientWidth / 2, node.clientHeight * 0.45, { n: 10, spread: 180 }); }
}
let cheerToken = 0;
async function cheer(ms) {
  const fig = $('salon-doll').querySelector('.salon-figure'), token = ++cheerToken;
  if (!fig) return;
  fig.dataset.pose = 'cheer';
  await sleep(ms);
  if (token === cheerToken && fig.isConnected) fig.dataset.pose = 'idle';
}

/** The customer walks out and the next one walks in. */
async function swap(games) {
  if (busy) return;
  busy = true; sfx('whoosh');
  const node = $('salon-doll'), fig = node.querySelector('.salon-figure');
  await fig.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(130%)', opacity: 0 }], { duration: 380, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
  data().who = (whoIndex() + 1) % CLIENTS.length; store.save();
  drawDoll(false); drawRooms(games);
  const next = node.querySelector('.salon-figure');
  next.dataset.pose = 'wave';
  await next.animate([{ transform: 'translateX(-130%)', opacity: 0 }, { transform: 'translateX(6%)', opacity: 1, offset: 0.75 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 520, easing: 'ease-out' }).finished.catch(() => {});
  sfx('sparkle'); burst(node, node.clientWidth / 2, node.clientHeight * 0.5, { n: 9, spread: 170 });
  busy = false;
  await sleep(900);
  if (next.isConnected && next.dataset.pose === 'wave') next.dataset.pose = 'idle';
}

/** A photo of the finished look: a flash, then the print drops in. */
async function photo() {
  if (busy) return;
  busy = true; sfx('camera');
  const view = $('salon');
  const flash = view.appendChild(el('div', { class: 'flash' }));
  cheer(2600);
  await sleep(420); flash.remove();
  const shot = view.appendChild(el('button', { class: 'salon-photo', type: 'button', 'aria-label': '照片',
    html: `<div class="salon-print"><div class="salon-print-art"><svg viewBox="0 0 400 400">${R(0, 0, 400, 400, 0, '#ffe3f0')}${C(200, 220, 150, '#fff')}${[[60, 70, 16], [340, 90, 12], [330, 330, 15], [70, 320, 11]].map(([x, y, r]) => sparkle(x, y, r, '#ffd447')).join('')}<path d="${heartPath(350, 200, 12)}" fill="#ff7fb0"/><path d="${heartPath(48, 200, 10)}" fill="#ff7fb0"/></svg>${zoeySvg(dollLook())}</div></div>` }));
  confetti(2200); sfx('win');
  const close = () => { if (!shot.isConnected) return; shot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).finished.then(() => shot.remove(), () => shot.remove()); busy = false; };
  shot.addEventListener('click', () => { sfx('tap'); close(); });
  setTimeout(close, 4200);
}
