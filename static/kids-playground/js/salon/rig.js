// A customer drawn from painted layers: her picture, then patches for other eyes and mouths,
// her eyebrows, paint (dirt, makeup, a face mask), hair and things she wears. She breathes, blinks,
// and pulls faces when something happens to her.
import { el, rand } from '../core.js';
import { ART } from './ui.js';
import { image } from './paint.js';
import { reskin } from './tint.js';

/** Stacking order of a rig's slots, bottom to top. */
const SLOTS = ['back', 'base', 'skin', 'eyes', 'lids', 'mouth', 'lips', 'brows', 'face', 'hair', 'top', 'fx'];

/** Faces she can pull: which eye patch and mouth patch to show (null = the base picture's own). */
export const MOODS = {
  idle: { eyes: null, mouth: null },
  shut: { eyes: 'shut', mouth: null },
  giggle: { eyes: 'happy', mouth: 'laugh' },
  love: { eyes: 'happy', mouth: 'laugh' },
  surprise: { eyes: 'wide', mouth: 'o' },
  sad: { eyes: 'sad', mouth: 'sad' },
  ew: { eyes: 'squint', mouth: 'ew' },
  kiss: { eyes: 'happy', mouth: 'kiss' },
};

export class Rig {
  /**
   * def: an entry of the manifest ({size, base, eyes, mouth, brows, anchors, skin, eye}).
   * place: {cx, bottom, height} in stage units. who: {skin, eyeCol} of the customer.
   */
  constructor(ctx, def, place, who = {}) {
    this.ctx = ctx; this.def = def; this.who = who;
    const [W, H] = def.size;
    this.W = W; this.H = H;
    this.k = place.height / H;
    this.left = place.cx - (W * this.k) / 2;
    this.top = place.bottom - place.height;
    const node = el('div', { class: `sl-rig ${place.cls || ''}`, style: { width: `${W}px`, height: `${H}px`, transform: `translate(${this.left}px, ${this.top}px) scale(${this.k})` } });
    this.node = place.parent ? place.parent.appendChild(node) : ctx.add(node);
    this.pose = this.node.appendChild(el('div', { class: 'sl-pose', style: { transformOrigin: `${W / 2}px ${H}px` } }));
    this.slots = {};
    for (const s of def.slots || SLOTS) this.slots[s] = this.pose.appendChild(el('div', { class: `sl-slot sl-${s}` }));
    this.state = { eyes: null, mouth: null };
    this.patches = { eyes: {}, mouth: {} };
    this.moodTimer = 0;
    this.ready = this.build();
    this.blinking = true;
    ctx.after(rand(1500, 3000), () => this.blinkLoop());
  }
  /** A picture of the character's own (skin coloured for this customer). */
  async layer(slot, spec, cls = '') {
    const img = await image(ART + spec.src);
    const eye = this.def.eye && this.who.eyeCol && this.def.eye !== this.who.eyeCol ? [this.def.eye, this.who.eyeCol] : null;
    const skinned = this.def.skin && this.who.skin && (this.def.skin !== this.who.skin || eye);
    let node;
    if (skinned && spec.skin !== false) {
      node = reskin(img, this.def.skin, this.who.skin, { eye, eyeBox: this.def.eyeBox, at: [spec.x, spec.y], k: img.naturalWidth / spec.w });
      node = node.cloneNode ? copyCanvas(node) : node;
    } else {
      node = el('img', { src: ART + spec.src, alt: '', draggable: 'false' });
    }
    node.classList.add('sl-layer');
    if (cls) node.classList.add(...cls.split(' '));
    Object.assign(node.style, { left: `${spec.x}px`, top: `${spec.y}px`, width: `${spec.w}px`, height: `${spec.h}px` });
    this.slots[slot].append(node);
    return node;
  }
  async build() {
    const d = this.def, jobs = [this.layer('base', d.base)];
    for (const group of ['eyes', 'mouth']) {
      for (const [name, spec] of Object.entries(d[group] || {})) {
        jobs.push(this.layer(group, spec, 'sl-patch').then((n) => { n.hidden = true; this.patches[group][name] = n; }));
      }
    }
    await Promise.all(jobs);
  }
  /** Draw her again for new eye colours (coloured lenses): her picture and face patches, kept as they were. */
  async refresh(who) {
    Object.assign(this.who, who);
    const keep = { ...this.state };
    for (const s of ['base', 'eyes', 'mouth']) this.slots[s].innerHTML = '';
    this.patches = { eyes: {}, mouth: {} };
    const d = this.def, jobs = [this.layer('base', d.base)];
    for (const group of ['eyes', 'mouth']) for (const [name, spec] of Object.entries(d[group] || {})) jobs.push(this.layer(group, spec, 'sl-patch').then((n) => { n.hidden = name !== keep[group]; this.patches[group][name] = n; }));
    await Promise.all(jobs);
  }
  /** Show one eye or mouth patch (null = the picture's own). */
  set(group, name) {
    if (this.state[group] === name) return;
    this.state[group] = name;
    for (const [k, n] of Object.entries(this.patches[group])) n.hidden = k !== name;
    if (group === 'eyes') this.node.dataset.eyes = name || 'open';
    if (group === 'mouth') this.node.dataset.mouth = name || 'smile';
  }
  /** Pull a face; after `ms` go back to `rest` (her face at rest in this room). */
  mood(name, ms = 0) {
    const m = MOODS[name] || MOODS.idle;
    this.set('eyes', m.eyes); this.set('mouth', this.keepMouth ? null : m.mouth);
    this.node.dataset.mood = name;
    clearTimeout(this.moodTimer);
    if (ms) this.moodTimer = setTimeout(() => { if (this.ctx.alive) this.mood(this.rest || 'idle'); }, ms);
    if (this.browNode) {
      const lift = { surprise: -14, love: -8, giggle: -8, sad: 6, ew: 8 }[name] || 0;
      this.browNode.style.transform = `translateY(${lift}px)`;
    }
  }
  /** Her resting face in this room (sad while she is dirty, idle once clean). */
  settle(name) { this.rest = name; this.mood(name); }
  async blinkLoop() {
    if (!this.ctx.alive || !this.node.isConnected) return;
    if (this.blinking && this.state.eyes === null && this.patches.eyes.shut) {
      this.set('eyes', 'shut');
      await this.ctx.sleep(120);
      if (this.state.eyes === 'shut' && (this.node.dataset.mood || 'idle') !== 'shut') this.set('eyes', null);
    }
    this.ctx.after(rand(2200, 4800), () => this.blinkLoop());
  }
  /** A little whole-body reaction. */
  react(kind = 'wiggle') {
    const frames = {
      wiggle: [0, -2.5, 2.5, -2, 2, 0].map((r) => ({ transform: `rotate(${r}deg)` })),
      giggle: [0, 1.6, -1.6, 1.6, -1.6, 1, 0].map((r, i) => ({ transform: `rotate(${r}deg) translateY(${i % 2 ? -6 : 0}px)` })),
      flinch: [{ transform: 'scale(1,1)' }, { transform: 'scale(1.03,.96) translateY(10px)' }, { transform: 'scale(1,1)' }],
      hop: [{ transform: 'translateY(0)' }, { transform: 'translateY(-38px) scale(.98,1.03)' }, { transform: 'translateY(0) scale(1.03,.97)' }, { transform: 'translateY(0)' }],
      shake: [0, -10, 10, -8, 8, -4, 0].map((x) => ({ transform: `translateX(${x}px)` })),
      nod: [0, 8, 0, 6, 0].map((y) => ({ transform: `translateY(${y}px)` })),
    }[kind];
    return this.pose.animate(frames, { duration: kind === 'giggle' ? 700 : 500, easing: 'ease-in-out' }).finished.catch(() => {});
  }
  /** Stage point → the character's own units. */
  local(p) { return { x: (p.x - this.left) / this.k, y: (p.y - this.top) / this.k }; }
  /** The character's units → stage point. */
  stage(x, y) { return { x: this.left + x * this.k, y: this.top + y * this.k }; }
  anchor(name) { const [x, y] = this.def.anchors[name]; return this.stage(x, y); }
  /** Is a stage point within r (character units) of an anchor? */
  near(p, name, r) { const q = this.local(p), [x, y] = this.def.anchors[name]; return Math.hypot(q.x - x, q.y - y) < r; }
  add(slot, node) { this.slots[slot].append(node); return node; }
  remove() { this.node.remove(); }
}

function copyCanvas(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
