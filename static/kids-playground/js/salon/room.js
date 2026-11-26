// What every salon room starts with: the painted room, the customer of the moment wearing everything
// she has had done so far, and the way a room ends (a tick, a photo flash, her happiest face).
import { el, anim } from '../core.js';
import { confetti } from '../fx.js';
import { BUST, HAIR, BG, PROPS } from './manifest.js';
import { Rig } from './rig.js';
import { Hair } from './hair.js';
import { PaintLayer, image } from './paint.js';
import { tinted, productTint } from './tint.js';
import { backdrop, img, ART, doneButton } from './ui.js';
import { customer, look, hairOf, saveLook } from './look.js';

export const SHELF_W = 300;
/** Where the customer stands: the middle of the room left of the shelf. */
export const stageMid = (ctx) => (ctx.W - SHELF_W - 30) / 2 + 10;

/** A prop picture (from the sheets) for the shelf or the stage. */
export const prop = (key, cls = '') => img(PROPS[key].src, cls);

/** Load product pictures (keys of PROPS) for tinting; returns {key: image} for those that exist. */
export async function products(keys) {
  const out = {};
  await Promise.all(keys.filter((k) => PROPS[k]).map(async (k) => { out[k] = await image(ART + PROPS[k].src); }));
  return out;
}
/**
 * A product in a colour, as shelf or ghost art. Without its picture: the `fallback` picture tinted when it was
 * loaded too (products([..., fallback])), else the plain fallback prop with a dot of the colour.
 */
export const productArt = (pics, key, col, kind = '', cls = '', fallback = key) => {
  const pic = pics[key] || pics[fallback];
  if (pic) return `<img class="${cls}" src="${productTint(pic, col, kind)}" alt="" draggable="false">`;
  if (!PROPS[fallback]) return '';
  const bg = Array.isArray(col) ? `linear-gradient(${col.join(',')})` : col === 'rainbow' ? 'conic-gradient(#ff5f7e,#ffe14d,#4fb4ff,#a77cf0,#ff5f7e)' : col;
  return col ? `${prop(fallback, cls)}<i class="sl-dot" style="background:${bg}"></i>` : prop(fallback, cls);
};

/** The makeup and spa layers on her face, in the order they sit. */
const FACE = [
  ['glow', 'face', 'lids', { blend: 'screen', opacity: 0.55 }],
  ['blush', 'face', 'lids', { blend: 'multiply', opacity: 0.8 }],
  ['shadow', 'lids', 'lids', { opacity: 0.85 }],
  ['lips', 'lips', 'lips', { blend: 'multiply' }],
  ['gloss', 'lips', 'lips', { blend: 'screen', opacity: 0.7 }],
];

/**
 * Set the room up with the customer of the moment. o.bg: room picture; o.height/o.bottom/o.cx: where she stands;
 * o.headband: wear the spa headband. Returns {rig, hair, face, who, look}.
 */
export async function bustRoom(ctx, o = {}) {
  backdrop(ctx, BG[o.bg]);
  const who = customer(), l = look();
  const rig = new Rig(ctx, BUST, { cx: o.cx ?? stageMid(ctx), bottom: o.bottom ?? 880, height: o.height ?? 930 }, { skin: who.skin, eyeCol: l.face?.lens || who.eyeCol });
  rig.node.classList.add('sl-enter');
  const { face, hair } = await dressBust(rig, who, l, o);
  const room = { rig, hair, face, who, look: l };
  window.__salon = room;                    // for the automated play-through
  return room;
}

/** Put everything she has had done so far on a bust rig: face paint, freckles, brows, lashes, stickers, hair, hair accessories. */
export async function dressBust(rig, who, l, o = {}) {
  await rig.ready;
  const face = {};
  for (const [key, mask, slot, opt] of FACE) {
    const spec = BUST.masks[mask];
    if (!spec) continue;
    const layer = new PaintLayer(rig.slots[slot], spec, { res: 0.6, ...opt, cls: `pl-${key}` });
    layer.setMask(await image(ART + spec.src));
    face[key] = layer;
    if (l.face?.[key]) await layer.restore(l.face[key]);
  }
  if (who.freckles) rig.add('lids', el('div', { class: 'sl-freckles', html: freckles(rig) }));
  const hc = hairOf(l, who).color || who.hairCol;
  await setBrows(rig, l.face?.brows || 'natural', hc);
  if (l.face?.lashes) await setLashes(rig, l.face.lashes);
  for (const s of l.face?.stickers || []) placeOn(rig, 'face', s);
  const hair = new Hair(rig, HAIR);
  await hair.load(hairOf(l, who));
  for (const a of l.hairAcc || []) placeOn(rig, 'top', a);
  if (o.headband && BUST.headband) rig.headband = await rig.layer('top', BUST.headband, 'sl-headband');
  return { face, hair };
}

/** Her eyebrows: a shape from the set, coloured like her hair. */
export async function setBrows(rig, key, hairCol) {
  const spec = BUST.browSet?.[key] || BUST.brows;
  const pic = await image(ART + spec.src);
  const c = tinted(pic, hairCol ? darker(hairCol) : '#6b3a22', { key: `brow-${key}` });
  const node = document.createElement('canvas');
  node.width = c.width; node.height = c.height;
  node.getContext('2d').drawImage(c, 0, 0);
  node.className = 'sl-layer sl-brow';
  Object.assign(node.style, { left: `${spec.x}px`, top: `${spec.y}px`, width: `${spec.w}px`, height: `${spec.h}px` });
  rig.browNode?.remove();
  rig.slots.brows.prepend(node);
  rig.browNode = node;
  rig.browKey = key;
}
const darker = (h) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * 0.72).toString(16).padStart(2, '0')).join('');

/** Her lashes: none, long dark ones, or coloured mascara. */
export async function setLashes(rig, key) {
  rig.lashNode?.remove();
  rig.lashNode = null;
  rig.lashKey = key;
  if (!key || key === 'none' || !BUST.lashes) return;
  const spec = BUST.lashes, pic = await image(ART + spec.src);
  const col = { black: null, pink: '#ff5fae', blue: '#3f7fe8', purple: '#8f55e0' }[key];
  const src = col ? tinted(pic, col, { key: `lash-${key}` }) : pic;
  const node = document.createElement('canvas');
  node.width = src.width || src.naturalWidth; node.height = src.height || src.naturalHeight;
  node.getContext('2d').drawImage(src, 0, 0);
  node.className = 'sl-layer sl-lashes';
  Object.assign(node.style, { left: `${spec.x}px`, top: `${spec.y}px`, width: `${spec.w}px`, height: `${spec.h}px` });
  rig.slots.brows.append(node);
  rig.lashNode = node;
}

/** A sticker or accessory saved as {key, x, y, s, r} put back on her. */
export function placeOn(rig, slot, s, size = 150) {
  const p = PROPS[s.key];
  if (!p) return null;
  const w = (s.s || 1) * size, h = w * p.h / p.w;
  const node = rig.add(slot, el('div', { class: 'sl-stuck', 'data-key': s.key, html: img(p.src), style: { left: `${s.x - w / 2}px`, top: `${s.y - h / 2}px`, width: `${w}px`, height: `${h}px`, transform: `rotate(${s.r || 0}deg)` } }));
  node.save = () => ({ key: s.key, x: s.x, y: s.y, s: s.s || 1, r: s.r || 0 });
  return node;
}

function freckles(rig) {
  const { cheekL, cheekR } = rig.def.anchors;
  const dots = [];
  for (const [cx, cy] of [cheekL, cheekR]) for (const [dx, dy] of [[-40, -14], [-12, -24], [14, -10], [36, -22], [-24, 10], [6, 6]]) dots.push(`<circle cx="${cx + dx}" cy="${cy + dy - 20}" r="5.5"/>`);
  return `<svg viewBox="0 0 ${rig.W} ${rig.H}" width="${rig.W}" height="${rig.H}" fill="#b0683f" opacity=".45">${dots.join('')}</svg>`;
}

/** Snapshots of her face paint, for the look. */
export function faceSave(face, keys = Object.keys(face)) {
  const out = {};
  for (const k of keys) if (face[k]) out[k] = face[k].cover > 0.01 || face[k].painted ? face[k].snapshot() : null;
  return out;
}

/**
 * The green tick: when tapped, keep the look, flash the camera, let her beam, and win.
 * `save()` returns the patch for the look; o.before() runs before the photo, o.photo is (or returns) its options.
 */
export function finishButton(ctx, rig, zone, save, o = {}) {
  let done = false;
  const b = doneButton(ctx, async () => {
    if (done) return;
    done = true;
    b.remove();
    saveLook(zone, save());
    await o.before?.();
    await photo(ctx, rig, typeof o.photo === 'function' ? o.photo() : o.photo);
    ctx.win({ delay: 300 });
  });
  return b;
}

/**
 * The camera: a flash, then a white frame around her and confetti. o.box: what the photo shows, in stage
 * units (default: her head and shoulders); o.all: frame everything of the rig that is on screen.
 */
export async function photo(ctx, rig, o = {}) {
  ctx.sfx('camera');
  const flash = ctx.add(el('div', { class: 'flash' }));
  rig.mood?.('love');
  await ctx.sleep(380);
  flash.remove();
  let box = o.box;
  if (!box) {
    const r = rig.node.getBoundingClientRect(), p = ctx.point({ clientX: r.left, clientY: r.top }), q = ctx.point({ clientX: r.right, clientY: r.bottom });
    const x0 = Math.max(8, p.x), y0 = Math.max(8, p.y), x1 = Math.min(ctx.W - SHELF_W - 30, q.x), y1 = Math.min(ctx.H - 8, q.y);
    box = o.all ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: p.x + (q.x - p.x) * 0.16, y: Math.max(10, p.y + (q.y - p.y) * 0.1), w: (q.x - p.x) * 0.68, h: Math.min(780, (q.y - p.y) * 0.8) };
  }
  const pad = 18, frame = ctx.add(el('div', { class: 'sl-frame' }));
  Object.assign(frame.style, { left: `${box.x - pad}px`, top: `${box.y - pad}px`, width: `${box.w + pad * 2}px`, height: `${box.h + pad * 2}px` });
  anim(frame, 'in', 400);
  confetti(1800);
  ctx.sfx('sparkle');
  rig.react?.('hop');
  await ctx.sleep(900);
}

/**
 * The part of her face that can be seen and touched: the face shape without what her hair
 * (and a headband) covers. A canvas the size of the face mask's box.
 */
export async function visibleFace(room, res = 0.5) {
  const f = BUST.masks.face, c = document.createElement('canvas');
  c.width = Math.ceil(f.w * res); c.height = Math.ceil(f.h * res);
  const g = c.getContext('2d');
  g.drawImage(await image(ART + f.src), 0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-out';
  const cover = (node) => {
    if (!node) return;
    const x = parseFloat(node.style.left), y = parseFloat(node.style.top), w = parseFloat(node.style.width), h = parseFloat(node.style.height);
    g.drawImage(node, (x - f.x) * res, (y - f.y) * res, w * res, h * res);
  };
  room.hair.render();
  cover(room.hair.canvas);
  cover(room.rig.headband);
  return c;
}

export { image };
