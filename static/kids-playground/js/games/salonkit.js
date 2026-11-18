// Bits shared by the salon games: a box of tools that are dragged onto the customer,
// sprays of little particles (mist, water, steam, dust), and paint that goes on stroke by stroke.
import { el, rand, anim } from '../core.js';
import { starPath } from '../art/base.js';

const NS = 'http://www.w3.org/2000/svg';
export const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

/**
 * Tools on a shelf. Each one is dragged by hand and springs back when let go.
 * `use(key, point, dt, tool, time)` runs every frame while a tool is held; `point` is the working
 * end of the tool (the tips of the scissors, the mouth of the dryer), not the middle of its picture.
 */
export function toolbox(ctx, use) {
  let held = null;
  const tools = new Map();
  const box = {
    tools,
    get held() { return held; },
    add(key, html, cx, cy, w, h, o = {}) {
      const t = ctx.sprite(html, cx, cy, w, h, `tool shadowed ${o.cls || ''}`);
      t.key = key; t.tip = o.tip || [0, 0]; t.on = true;
      t.el.dataset.tool = key;
      t.point = () => ({ x: t.cx + t.tip[0], y: t.cy + t.tip[1] });
      ctx.drag(t, {
        enabled: () => t.on,
        start: () => { held = t; t.el.classList.add('using'); t.el.classList.remove('pulse'); box.onPick?.(t); },
        end: () => { held = null; t.el.classList.remove('using'); t.goHome(); box.onDrop?.(t); },
      });
      tools.set(key, t);
      t.anim('in', 350);
      return t;
    },
    /** Light up the tools that can be used now; a single one also beats gently to show it is next. */
    enable(...keys) {
      for (const [k, t] of tools) {
        t.on = keys.includes(k);
        t.el.classList.toggle('off', !t.on);
        t.el.classList.toggle('pulse', t.on && keys.length === 1);
      }
    },
    remove(key) {
      const t = tools.get(key);
      if (!t) return;
      tools.delete(key);
      if (held === t) held = null;
      t.el.style.pointerEvents = 'none';
      anim(t.el, 'out', 250, { fill: 'forwards' }).then(() => t.remove());
    },
    clear() { for (const k of [...tools.keys()]) box.remove(k); },
  };
  ctx.loop((dt, time) => { if (held) use(held.key, held.point(), dt, held, time); });
  return box;
}

const BIT = {
  dot: (col) => `<svg viewBox="-12 -12 24 24"><circle r="10" fill="${col}"/></svg>`,
  drop: (col) => `<svg viewBox="-12 -12 24 24"><path d="M0 -11 C6 -3 8 1 8 4 a8 8 0 0 1 -16 0 C-8 1 -6 -3 0 -11Z" fill="${col}"/></svg>`,
  streak: (col) => `<svg viewBox="-12 -12 24 24"><rect x="-2.500" y="-11" width="5" height="22" rx="2.500" fill="${col}"/></svg>`,
  puff: (col) => `<svg viewBox="-24 -24 48 48"><circle cx="-8" cy="4" r="12" fill="${col}"/><circle cx="8" cy="2" r="14" fill="${col}"/><circle cx="0" cy="-8" r="11" fill="${col}"/></svg>`,
  bubble: () => `<svg viewBox="-12 -12 24 24"><circle r="9" fill="rgba(255,255,255,.45)" stroke="#fff" stroke-width="2.500"/><circle cx="-3" cy="-3" r="2.500" fill="#fff"/></svg>`,
  spark: (col) => `<svg viewBox="-12 -12 24 24"><path d="M0 -11 Q2 -2 11 0 Q2 2 0 11 Q-2 2 -11 0 Q-2 -2 0 -11Z" fill="${col}"/></svg>`,
  star: (col) => `<svg viewBox="-12 -12 24 24"><path d="${starPath(0, 0, 10, 4.5)}" fill="${col}"/></svg>`,
};

/**
 * Throw a few little shapes in one direction. Angles are in degrees on the screen:
 * 0 → right, 90 → down, 180 → left, 270 → up. `fall` adds a drop at the end (water), `grow` a final size.
 */
export function spray(ctx, x, y, o = {}) {
  const { n = 3, angle = 180, cone = 24, reach = 110, size = 16, color = '#fff', ms = 450, shape = 'dot', fall = 0, grow = 1.2, opacity = 0.9, turn = 0 } = o;
  const colors = Array.isArray(color) ? color : [color];
  for (let i = 0; i < n; i++) {
    const a = (angle + rand(-cone, cone)) * Math.PI / 180, d = reach * rand(0.55, 1), s = size * rand(0.7, 1.25);
    const bit = el('div', { class: 'bit', html: BIT[shape](colors[Math.floor(Math.random() * colors.length)]), style: { left: `${x - s / 2}px`, top: `${y - s / 2}px`, width: `${s}px`, height: `${s}px` } });
    ctx.stage.append(bit);
    const r = turn ? rand(-turn, turn) : 0;
    bit.animate([
      { transform: 'translate(0, 0) scale(.5)', opacity },
      { transform: `translate(${Math.cos(a) * d * 0.7}px, ${Math.sin(a) * d * 0.7 + fall * 0.3}px) scale(1) rotate(${r / 2}deg)`, opacity, offset: 0.6 },
      { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d + fall}px) scale(${grow}) rotate(${r}deg)`, opacity: 0 },
    ], { duration: ms * rand(0.8, 1.2), easing: 'ease-out' }).finished.then(() => bit.remove(), () => bit.remove());
  }
}

/**
 * Paint inside a shape, one dab at a time. `group` is an SVG group that is already clipped to the shape;
 * `points` are sample points inside it, used to tell how much of the shape is covered.
 * With an `eraser` group (the black part of a mask over `group`) the paint can be wiped off again.
 */
export class Paint {
  constructor(group, points, radius, eraser = null) {
    this.g = group; this.eraser = eraser; this.r = radius;
    this.points = points.map(([x, y]) => ({ x, y, on: false }));
    this.last = null;
  }
  mark(x, y, on, reach) {
    for (const p of this.points) if (p.on !== on && Math.hypot(p.x - x, p.y - y) < reach) p.on = on;
  }
  get cover() { return this.points.filter((p) => p.on).length / this.points.length; }
  /** One dab of colour at (x, y). Returns how much is covered now (0–1). */
  dab(x, y, color) {
    const l = this.last;
    if (!l || l.color !== color || Math.hypot(x - l.x, y - l.y) > this.r * 0.3) {
      this.g.append(svgEl('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: this.r, fill: color }));
      this.last = { x, y, color };
    }
    this.mark(x, y, true, this.r * 1.1);
    return this.cover;
  }
  /** Finish the coat: one even colour (nail polish), or `under` = only fill what is still bare (a face mask). */
  fill(color, under = false) {
    const coat = svgEl('rect', { x: -3000, y: -3000, width: 6000, height: 6000, fill: color });
    if (under) this.g.prepend(coat); else this.g.replaceChildren(coat);
    for (const p of this.points) p.on = true;
    this.last = null;
  }
  /** Start measuring again (a new colour is going over the old one). */
  recoat() { for (const p of this.points) p.on = false; }
  /** Wipe the paint off around (x, y). Returns how much is still covered. */
  wipe(x, y, radius = this.r * 1.3) {
    const l = this.last;
    if (!l || !l.wipe || Math.hypot(x - l.x, y - l.y) > radius * 0.3) {
      this.eraser.append(svgEl('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: radius, fill: '#000' }));
      this.last = { x, y, wipe: true };
    }
    this.mark(x, y, false, radius);
    return this.cover;
  }
  clear() {
    this.g.innerHTML = '';
    if (this.eraser) this.eraser.innerHTML = '';
    for (const p of this.points) p.on = false;
    this.last = null;
  }
}
