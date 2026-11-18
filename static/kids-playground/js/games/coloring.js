// 涂色本 — pick a picture, then tap its shapes — and the sky and ground behind it — to fill them with a colour,
// a pattern or the magic wand. Shapes too small for a little finger come ready printed.
import { el, anim, sample, shuffle } from '../core.js';
import { ANIMALS, LAND, SEA } from '../art/animals.js';
import { foodInner } from '../art/food.js';
import { room } from '../art/scenes.js';
import { BOX, R, P, C, star, starPath, heartPath, INK } from '../art/base.js';
import { doll } from '../art/girl.js';
import { tray } from './kit.js';

const COLORS = ['#ff5a5a', '#ff9d2e', '#ffe45c', '#7ed957', '#3fd1c2', '#3fb4ff', '#5f6bf0', '#9a7bf5', '#ff7fb0', '#a8693a', '#ffffff', '#38334d'];
const tile = (id, w, h, inner, extra = '') => `<pattern id="pt-${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse" ${extra}>${inner}</pattern>`;
const blend = (id, stops, hard) => `<linearGradient id="pt-${id}" x1="0" y1="0" x2="0" y2="1">${stops.map((col, i) => (hard ? `<stop offset="${i / stops.length}" stop-color="${col}"/><stop offset="${(i + 1) / stops.length}" stop-color="${col}"/>` : `<stop offset="${i / (stops.length - 1)}" stop-color="${col}"/>`)).join('')}</linearGradient>`;
const PATTERNS = {
  hearts: tile('hearts', 26, 26, `<rect width="26" height="26" fill="#ffd0e3"/><path d="${heartPath(13, 13, 6)}" fill="#ff5c8a"/>`),
  stars: tile('stars', 28, 28, `<rect width="28" height="28" fill="#5f6bf0"/><path d="${starPath(14, 14, 8, 3.6)}" fill="#ffe45c"/>`),
  dots: tile('dots', 20, 20, `<rect width="20" height="20" fill="#ff7fb0"/><circle cx="5" cy="5" r="3.400" fill="#fff"/><circle cx="15" cy="15" r="3.400" fill="#fff"/>`),
  stripes: tile('stripes', 14, 14, `<rect width="14" height="14" fill="#fff"/><rect width="7" height="14" fill="#ff5a5a"/>`, 'patternTransform="rotate(45)"'),
  checks: tile('checks', 24, 24, `<rect width="24" height="24" fill="#dff4ff"/><rect width="12" height="12" fill="#3fb4ff"/><rect x="12" y="12" width="12" height="12" fill="#3fb4ff"/>`),
  flowers: tile('flowers', 32, 32, `<rect width="32" height="32" fill="#9be27a"/>${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="16" cy="9.500" rx="4.200" ry="6" fill="#fff" transform="rotate(${r} 16 16)"/>`).join('')}<circle cx="16" cy="16" r="3.600" fill="#ffe45c"/>`),
  zigzag: tile('zigzag', 16, 14, `<rect width="16" height="14" fill="#9a7bf5"/><path d="M-2 12 L8 3 L18 12" fill="none" stroke="#ffe45c" stroke-width="3.500" stroke-linejoin="round"/>`),
  scales: tile('scales', 24, 24, `<rect width="24" height="24" fill="#3fd1c2"/><path d="M0 0 a12 12 0 0 0 24 0 M-12 12 a12 12 0 0 0 24 0 M12 12 a12 12 0 0 0 24 0" fill="none" stroke="#e6fffb" stroke-width="2.500"/>`),
  waves: tile('waves', 24, 14, `<rect width="24" height="14" fill="#3fb4ff"/><path d="M-2 9 q6.500 -8 13 0 t13 0" fill="none" stroke="#dff4ff" stroke-width="3" stroke-linecap="round"/>`),
  sprinkles: tile('sprinkles', 30, 30, `<rect width="30" height="30" fill="#fff3c9"/>${[[7, 7, 30, '#ff5a5a'], [21, 9, -40, '#3fb4ff'], [10, 21, -20, '#7ed957'], [24, 23, 50, '#ff7fb0'], [15, 15, 80, '#9a7bf5']].map(([x, y, r, col]) => `<rect x="${x - 4.5}" y="${y - 1.800}" width="9" height="3.600" rx="1.800" fill="${col}" transform="rotate(${r} ${x} ${y})"/>`).join('')}`),
  rainbow: blend('rainbow', ['#ff5a5a', '#ff9d2e', '#ffe45c', '#7ed957', '#3fb4ff', '#9a7bf5'], true),
  sunset: blend('sunset', ['#9a7bf5', '#ff7fb0', '#ff9d2e', '#ffe45c']),
};
const princess = () => `<g transform="translate(-10 -6) scale(.31)">${doll({ hair: 'long', outfit: 'princess', shoes: 'mary', head: 'crown', hand: 'wand', back: 'fairy' })}</g>`;
const mermaid = () => `<g transform="translate(-10 -6) scale(.31)">${doll({ hair: 'curly', outfit: 'mermaid', head: 'wreath', hand: null, back: null })}</g>`;
const PAGES = [
  ...['unicorn', 'rabbit', 'cat', 'lion', 'elephant', 'owl', 'penguin', 'fox', 'giraffe'].map((k) => ({ key: k, draw: () => ANIMALS[k]() })),
  ...['whale', 'octopus', 'fish', 'turtle'].map((k) => ({ key: k, place: 'sea', draw: () => ANIMALS[k]() })),
  { key: 'princess', draw: princess }, { key: 'mermaid', place: 'sea', draw: mermaid },
  ...['cupcake', 'strawberry', 'cherry', 'mushroom', 'donut'].map((k) => ({ key: k, place: 'table', draw: () => foodInner(k, { face: true }) })),
];
const DARK = ['#38334d', '#3f3a52', '#2c2840'];
// Behind every picture: something up above and something to stand on, both to colour in. [above, below] in their real colours.
const PLACES = { land: ['#bfe8ff', '#9be27a'], sea: ['#8fdcf5', '#f7e3ae'], table: ['#ffe3ee', '#ffc9a0'] };
const backdrop = ([above, below]) => `<rect x="-8" y="-12" width="216" height="220" rx="16" fill="${above}"/><path d="M-8 168 Q46 150 100 164 T208 160 V192 Q208 208 192 208 H8 Q-8 208 -8 192Z" fill="${below}"/>`;

/** Turn a flat picture into a colouring page: every shape white with a line around it, remembering its real colour. */
function page(pg) {
  const holder = document.createElement('div');
  holder.innerHTML = `<svg class="art page calm" viewBox="${BOX}"><defs>${Object.values(PATTERNS).join('')}</defs>${backdrop(PLACES[pg.place || 'land'])}${pg.draw()}</svg>`;
  const svg = holder.firstElementChild;
  svg.querySelectorAll('ellipse, path, rect, circle').forEach((node) => {
    if (node.closest('clipPath, defs, .eye, .eyes-joy, .mouth-open')) return;
    const fill = node.getAttribute('fill'), stroke = node.getAttribute('stroke');
    if (node.classList.contains('t') || (fill === 'none' && stroke && !node.classList.contains('d'))) {
      const edge = node.cloneNode();
      edge.setAttribute('class', 'edge'); edge.setAttribute('stroke', INK); edge.setAttribute('stroke-width', +node.getAttribute('stroke-width') + 7);
      node.before(edge);
      node.dataset.real = stroke; node.dataset.kind = 'stroke'; node.setAttribute('stroke', '#ffffff'); node.classList.add('zone-line');
    } else if (fill && fill !== 'none' && !fill.startsWith('rgba') && !node.hasAttribute('opacity') && !(node.classList.contains('d') && DARK.includes(fill.toLowerCase()))) {
      node.dataset.real = fill; node.dataset.kind = 'fill'; node.setAttribute('fill', '#ffffff'); node.classList.add('zone');
    } else if (node.hasAttribute('opacity') || (fill && fill.startsWith('rgba')) || (fill === 'none' && stroke && !DARK.includes(stroke.toLowerCase()))) node.style.display = 'none';
  });
  svg.dataset.total = svg.querySelectorAll('.zone, .zone-line').length;
  if (tooSmall.has(pg.key)) printSmall(svg, tooSmall.get(pg.key));
  return svg;
}

/**
 * Shapes a small finger cannot hit are not left to colour: they come printed in their own colour, as details.
 * A shape is too small when the part of it that shows (not hidden under other shapes) is tiny or very thin.
 * The page must be on screen to be measured; the answer is remembered for each picture.
 */
const tooSmall = new Map();
function measureSmall(svg, key) {
  if (!tooSmall.has(key)) {
    const zones = [...svg.querySelectorAll('.zone, .zone-line')];
    const probe = svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g')), base = probe.getCTM();
    probe.remove();
    if (!base) return;
    const [bx, by, bw, bh] = BOX.split(' ').map(Number), N = 36, pt = svg.createSVGPoint(), local = svg.createSVGPoint();
    const info = zones.map((z) => {
      const m = z.getCTM().inverse().multiply(base), clip = z.closest('[clip-path]');
      const shape = clip && svg.querySelector(`${clip.getAttribute('clip-path').slice(4, -1)} > ellipse`);     // stripes and patches kept inside a body
      return { z, m, plain: m.a === 1 && m.d === 1 && !m.b && !m.c && !m.e && !m.f, line: z.dataset.kind === 'stroke', n: 0, x0: N, x1: -1, y0: N, y1: -1,
        oval: shape && ['cx', 'cy', 'rx', 'ry'].map((k) => +shape.getAttribute(k)) };
    });
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      pt.x = bx + (i + 0.5) * bw / N; pt.y = by + (j + 0.5) * bh / N;
      for (let k = info.length - 1; k >= 0; k--) {       // the last shape drawn is on top
        const o = info[k];
        let q = pt;
        if (!o.plain) { q = local; const t = pt.matrixTransform(o.m); q.x = t.x; q.y = t.y; }
        if (o.oval && ((q.x - o.oval[0]) / o.oval[2]) ** 2 + ((q.y - o.oval[1]) / o.oval[3]) ** 2 > 1) continue;
        if (!(o.line ? o.z.isPointInStroke(q) : o.z.isPointInFill(q))) continue;
        o.n++; o.x0 = Math.min(o.x0, i); o.x1 = Math.max(o.x1, i); o.y0 = Math.min(o.y0, j); o.y1 = Math.max(o.y1, j);
        break;
      }
    }
    // too small: fewer than 8 sample points showing (about a fingertip), under 3 points across, or a thin sliver
    tooSmall.set(key, info.map((o, k) => { const w = o.x1 - o.x0 + 1, h = o.y1 - o.y0 + 1; return o.n < 8 || Math.min(w, h) < 3 || o.n / Math.max(w, h) < 1.3 ? k : -1; }).filter((k) => k >= 0));
  }
  printSmall(svg, tooSmall.get(key));
}
function printSmall(svg, list) {
  if (svg.dataset.printed) return;      // once per page: the list counts shapes as they were at the start
  svg.dataset.printed = 1;
  const zones = [...svg.querySelectorAll('.zone, .zone-line')];
  for (const k of list) {
    const node = zones[k];
    if (!node) continue;
    node.setAttribute(node.dataset.kind, node.dataset.real);
    if (node.dataset.kind === 'stroke') node.previousElementSibling?.remove();
    node.classList.remove('zone', 'zone-line'); node.classList.add('printed');
  }
  svg.dataset.total = zones.length - list.length;
}

export default {
  id: 'coloring', name: '涂色本', colors: ['#fff0f6', '#ffc4de'], intro: 'color-intro',
  icon: () => `<svg viewBox="0 0 230 200">${R(30, 16, 150, 170, 18, '#fff')}<g transform="translate(46 34) scale(.6)" class="calm">${ANIMALS.unicorn()}</g>
    <g transform="rotate(35 180 110)">${R(166, 40, 30, 110, 8, '#ff7fb0')}${P('M166 150 h30 l-15 30z', '#ffd6b3')}${P('M175 168 h12 l-6 12z', '#ff7fb0')}${R(166, 40, 30, 18, 8, '#e64f8b')}</g>${star(40, 170, 14, '#ffc21f')}</svg>`,

  start(ctx) {
    const { W } = ctx;
    ctx.scene(room(W, '#fff3f8', '#ffe0ee', '#ffd0e3', 700));
    let chooser = null;

    function choose() {
      chooser = ctx.add(el('div', { class: 'cl-chooser' }));
      sample(PAGES, 8).forEach((pg, i) => {
        const svg = page(pg);
        const b = el('button', { class: 'cl-thumb', type: 'button', style: { animationDelay: `${i * 0.05}s` } }, svg);
        b.addEventListener('click', () => { ctx.sfx('pop'); chooser.remove(); paint(pg); });
        chooser.append(b);
        ctx.after(80 + i * 50, () => { if (svg.isConnected) measureSmall(svg, pg.key); });     // one at a time, so nothing stutters
      });
    }

    function paint(pg) {
      const svg = page(pg);
      const cx = Math.max(330, W * 0.4), size = 610;
      const paper = ctx.add(el('div', { class: 'cl-paper', style: { left: `${cx - size / 2}px`, top: `${400 - size / 2 - 14}px`, width: `${size}px`, height: `${size}px` } }, svg));
      measureSmall(svg, pg.key);
      anim(paper, 'in', 350);
      let color = COLORS[0], painted = new Set(), wand = false, won = false;
      const total = +svg.dataset.total;
      const items = [...COLORS.map((col) => ({ key: col, color: col })),
        ...Object.keys(PATTERNS).map((k) => ({ key: `url(#pt-${k})`, html: `<svg viewBox="0 0 60 60"><defs>${PATTERNS[k]}</defs><circle cx="30" cy="30" r="30" fill="url(#pt-${k})"/></svg>`, cls: 'cl-pattern' }))];
      const pal = tray(ctx, W - 162, 350, items, (item) => { color = item.key; wand = false; wandB.classList.remove('on'); ctx.sfx('tap'); }, { width: 296, cls: 'cl-palette' });
      pal.select(color);
      const wandB = ctx.button('star', W - 220, 712, 'yellow', '魔法棒', () => { wand = !wand; wandB.classList.toggle('on', wand); pal.clear(); if (!wand) pal.select(color); ctx.sfx('sparkle'); });
      ctx.button('eraser', W - 110, 712, 'blue', '全部擦掉', () => {
        svg.querySelectorAll('.zone, .zone-line').forEach((n) => n.setAttribute(n.dataset.kind, '#ffffff')); painted.clear(); ctx.sfx('water');
      });
      ctx.button('back', 70, 716, '', '换一张', () => { paper.remove(); pal.el.remove(); ctx.stage.querySelectorAll('.stage-button').forEach((b) => b.remove()); choose(); });
      ctx.button('check', 180, 716, 'green', '画好了', () => finish());

      const finish = () => {
        if (won) return;
        if (painted.size < Math.min(4, total)) { ctx.sfx('bad'); anim(paper, 'wiggle', 400); return; }
        won = true;
        svg.classList.remove('calm'); svg.classList.add('done');
        ctx.sfx('great'); anim(paper, 'pop', 500);
        ctx.burst(cx, 400, { n: 24, spread: 380, size: 44 });
        ctx.win({ voice: 'color-done', delay: 1200 });
      };
      svg.addEventListener('click', (ev) => {
        const node = ev.target.closest('.zone, .zone-line');
        if (!node || won) return;
        node.setAttribute(node.dataset.kind, wand ? node.dataset.real : color);
        node.animate([{ opacity: 0.3 }, { opacity: 1 }], 250);
        painted.add(node);
        ctx.sfx('pop'); ctx.note(painted.size % 8);
        const pt = ctx.point(ev);
        ctx.burst(pt.x, pt.y, { n: 4, spread: 60, size: 22, shapes: ['star', 'dot'] });
        if (painted.size === total) ctx.after(500, finish);
      });
    }
    choose();
  },
};
