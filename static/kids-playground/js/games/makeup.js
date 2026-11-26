// 化妆间 — free makeup on the customer: eyebrow shapes, eyeshadow (she closes her eyes while it goes on),
// lashes, coloured lenses, blush, lipstick and gloss, face stickers, and a cotton pad that wipes it off.
import { el, rand, pick, anim } from '../core.js';
import { spray } from './salonkit.js';
import { PROPS, BUST } from '../salon/manifest.js';
import { Shelf, img } from '../salon/ui.js';
import { bustRoom, prop, finishButton, faceSave, placeOn, setBrows, setLashes, SHELF_W, products, productArt } from '../salon/room.js';
import { hairOf } from '../salon/look.js';

const SHADOW = [['pink', '#ff8fc8'], ['purple', '#b48cff'], ['blue', '#7fb8ff'], ['mint', '#7fe0c0'], ['gold', '#f5c64a'], ['peach', '#ffad8a'], ['brown', '#b07a5a'], ['silver', '#d8dbe8'],
  ['sunset', ['#ffb347', '#ff6fa8']], ['ocean', ['#7fe0c0', '#4c7dff']], ['rainbow', 'rainbow'], ['stars', '#f5c64a', 'glitter']];
const RAINBOW = ['#ff5f7e', '#ffa53a', '#ffe14d', '#6fd56a', '#4fb4ff', '#a77cf0'];
const BLUSH = [['pink', '#ff9cb8'], ['coral', '#ff9a7f'], ['rose', '#f77aa0'], ['peach', '#ffb98f'], ['lilac', '#d6a3ff'], ['berry', '#e0608f']];
const LIPS = [['natural', '#f08ca0'], ['cherry', '#e0304a'], ['coral', '#ff7860'], ['berry', '#b0306a'], ['purple', '#9a4fd0'], ['orange', '#ff8a30'], ['nude', '#d9907a'],
  ['hotpink', '#ff4fa0'], ['plum', '#7a2f5a'], ['peach', '#ffa080'], ['gloss', '#ffffff', 'gloss'], ['glitter', '#ff6fb0', 'glitter']];
const LENS = [['brown', '#55230c'], ['blue', '#2f78d6'], ['green', '#3a9a55'], ['purple', '#8a4fd6'], ['pink', '#e0559a'], ['grey', '#6f7787']];
const LASHES = ['none', 'black', 'pink', 'blue', 'purple'];
const STICKERS = ['st-star', 'st-heart', 'st-rainbow', 'st-butterfly', 'st-flower', 'st-gem', 'st-moon', 'st-strawberry', 'st-ladybug', 'st-bow', 'st-sparkle', 'st-sun'];
const TABS = [['brows', 'brow-pencil', 'mk-brow'], ['shadow', 'palette', 'mk-shadow'], ['lashes', 'mascara', 'mk-lash'], ['lens', null, 'sl-mk-lens'], ['blush', 'blush', 'mk-blush'],
  ['lips', 'lipstick', 'mk-lip'], ['stickers', 'st-star', 'sl-mk-sticker'], ['wipe', 'cotton', 'sl-mk-wipe']];
/** The product picture on a tab, when there is one. */
const TAB_ART = { shadow: 'pr-shadow-pot', lashes: 'pr-mascara', lips: 'pr-lipstick' };

export default {
  id: 'makeup',
  name: '化妆间',
  colors: ['#fff1b8', '#ffc94d'],
  intro: 'sl-mk-hi',
  icon: () => img(PROPS.lipstick?.src || ''),
  async start(ctx) {
    const room = await bustRoom(ctx, { bg: 'makeup', height: 1120, bottom: 1010 }), { rig, face, look, who } = room;
    rig.keepMouth = true;
    const A = BUST.anchors, F = BUST.face;
    const onFace = (p) => { const q = rig.local(p); return q.x > F[0] && q.x < F[2] && q.y > F[1] - 40 && q.y < F[3]; };
    const stickers = [...rig.slots.face.querySelectorAll('.sl-stuck')].filter((n) => n.save);
    let lens = look.face?.lens || null;
    const praise = () => { if (Math.random() < 0.5) ctx.say(pick(['mk-pretty', 'mk-lovely'])); rig.mood('love', 900); ctx.sfx('sparkle'); };

    let shelf = null;
    const pics = await products(['pr-shadow-pot', 'pr-shadow-wand', 'pr-blush-brush', 'pr-lipstick', 'pr-gloss', 'pr-mascara', 'blush']);
    const P = (key, col, kind, fallback) => productArt(pics, key, col, kind || '', '', fallback);
    const paint = (layer, colorAt, o) => (k, p, ghost) => {
      if (!onFace(p)) return;
      const q = rig.local(p), from = ghost.last && onFace(ghost.last) ? rig.local(ghost.last) : null;
      const before = layer.cover;
      const c = layer.dab(q.x, q.y, o.r, colorAt(k, q), { soft: o.soft ?? 0.6, alpha: o.alpha ?? 0.5, from });
      if (o.sparkle && Math.random() < 0.3) layer.dab(q.x + rand(-o.r, o.r), q.y + rand(-o.r / 2, o.r / 2), 5, '#fff', { soft: 0.2 });
      if (Math.random() < 0.08) ctx.sfx('brush');
      if (before < o.full && c >= o.full) { o.done?.(k); praise(); }
    };
    const pullable = (items, use, o = {}) => shelf.setItems(items, {
      drag: {
        size: o.size || 140, tip: o.tip || [-40, -40],
        start: (k) => { o.start?.(k); },
        move: (k, p, ghost) => { use(k, p, ghost); ghost.last = p; },
        drop: (k, p, ghost) => { const r = o.drop?.(k, p, ghost); o.end?.(k); return r; },
      },
    });

    const open = {
      brows: () => shelf.setItems(Object.keys(BUST.browSet || { natural: 1 }).map((k) => ({ key: k, art: img(BUST.browSet[k].src, 'sl-brow-icon') })), {
        on: rig.browKey,
        tap: async (k) => { await setBrows(rig, k, hairOf(look).color || who.hairCol); anim(rig.browNode, 'pop', 350); ctx.sfx('sparkle'); rig.mood('surprise', 600); },
      }),
      shadow: () => pullable(SHADOW.map(([key, col, kind]) => ({ key, art: P('pr-shadow-pot', col, kind, 'palette'), ghost: P('pr-shadow-wand', col, kind, 'shadow-brush') })), paint(face.shadow, (k, q) => {
        const [, col] = SHADOW.find((s) => s[0] === k);
        if (col === 'rainbow') { const eye = q.x < BUST.size[0] / 2 ? A.eyeL : A.eyeR; return RAINBOW[Math.max(0, Math.min(5, Math.floor((q.x - eye[0] + 120) / 40)))]; }
        if (Array.isArray(col)) return q.y > A.lidL[1] ? col[0] : col[1];
        return col;
      }, { r: 34, alpha: 0.45, soft: 0.6, full: 0.7, sparkle: false }), {
        size: 150, tip: [-20, -62],
        start: () => { rig.blinking = false; rig.mood('shut'); },
        end: () => ctx.after(350, () => { rig.mood('idle'); rig.blinking = true; }),
      }),
      lashes: () => shelf.setItems(LASHES.map((k) => ({ key: k, art: k === 'none' ? `<span class="sl-none"></span>` : P('pr-mascara', { black: '#2a2430', pink: '#ff5fae', blue: '#3f7fe8', purple: '#8f55e0' }[k], '', 'mascara') })), {
        on: rig.lashKey || 'none',
        tap: async (k) => { await setLashes(rig, k); if (rig.lashNode) anim(rig.lashNode, 'pop', 350); ctx.sfx('brush'); rig.mood('shut', 300); ctx.after(320, () => praise()); },
      }),
      lens: () => shelf.setItems(LENS.map(([k, c]) => ({ key: k, art: `<span class="sl-eye-chip" style="--c:${c}"></span>` })), {
        on: LENS.find((l) => l[1] === lens)?.[0],
        tap: async (k) => { lens = LENS.find((l) => l[0] === k)[1]; rig.mood('shut'); ctx.sfx('pop'); await ctx.sleep(200); await rig.refresh({ eyeCol: lens }); rig.mood('surprise', 700); ctx.sfx('sparkle'); },
      }),
      blush: () => pullable(BLUSH.map(([key, col]) => ({ key, art: P('blush', col), ghost: P('pr-blush-brush', col, '', 'blush-brush') })), paint(face.blush, (k) => BLUSH.find((s) => s[0] === k)[1], { r: 60, alpha: 0.28, soft: 0.95, full: 0.25 }), { size: 170, tip: [-30, -66] }),
      lips: () => pullable(LIPS.map(([key, col, kind]) => {
        const pic = kind === 'gloss' ? P('pr-gloss', '#ffb3d6', 'pearl', 'gloss') : P('pr-lipstick', col, kind === 'glitter' ? 'glitter' : '', 'lipstick');
        return { key, art: pic, ghost: pic };
      }), (k, p, ghost) => {
        const [, col, kind] = LIPS.find((s) => s[0] === k);
        const layer = kind === 'gloss' ? face.gloss : face.lips;
        paint(layer, () => col, { r: 26, alpha: kind === 'gloss' ? 0.5 : 0.7, soft: 0.4, full: 0.75, sparkle: kind === 'glitter',
          done: () => { layer.painted = true; rig.react('nod'); const m = rig.anchor('mouth'); for (let i = 0; i < 3; i++) spray(ctx, m.x, m.y - 20, { n: 1, angle: 270, cone: 40, reach: 140, size: 30, color: '#ff6f9f', shape: 'drop', ms: 900 }); ctx.sfx('pop'); } })(k, p, ghost);
      }, { size: 140, tip: [-18, -60] }),
      stickers: () => pullable(STICKERS.map((k) => ({ key: k, art: prop(k) })), () => {}, {
        size: 90, tip: [0, 0],
        drop: (k, p) => {
          if (!onFace(p)) return false;
          const q = rig.local(p), node = placeOn(rig, 'face', { key: k, x: q.x, y: q.y, s: 0.6, r: rand(-15, 15) });
          node.classList.add('sl-removable');
          node.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); ctx.sfx('pop'); stickers.splice(stickers.indexOf(node), 1); anim(node, 'out', 200, { fill: 'forwards' }).then(() => node.remove()); });
          stickers.push(node);
          anim(node, 'squash', 350);
          ctx.sfx('pop');
          rig.mood('love', 700);
          return true;
        },
      }),
      wipe: () => pullable([{ key: 'cotton', art: prop('cotton') }], (k, p) => {
        if (!onFace(p)) return;
        const q = rig.local(p);
        for (const l of [face.shadow, face.blush, face.lips, face.gloss]) l.erase(q.x, q.y, 50, { strength: 0.5 });
        for (const n of [...stickers]) {
          const x = parseFloat(n.style.left) + parseFloat(n.style.width) / 2, y = parseFloat(n.style.top) + parseFloat(n.style.height) / 2;
          if (Math.hypot(x - q.x, y - q.y) < 60) { stickers.splice(stickers.indexOf(n), 1); anim(n, 'out', 200, { fill: 'forwards' }).then(() => n.remove()); }
        }
        if (Math.random() < 0.06) { ctx.sfx('brush'); rig.mood('giggle', 500); }
      }, { size: 130, tip: [0, 0] }),
    };
    shelf = new Shelf(ctx, {
      color: '#ffc94d', width: SHELF_W,
      tabs: TABS.map(([key, icon, voice]) => ({ key, art: icon ? prop(PROPS[TAB_ART[key]] ? TAB_ART[key] : icon) : `<span class="sl-eye-chip" style="--c:#2f78d6"></span>`, label: voice })),
      onTab: (key) => { ctx.say(TABS.find((t) => t[0] === key)[2]); open[key](); },
    });
    shelf.open('shadow', true);
    open.shadow();
    window.__salon.open = (k) => shelf.open(k);
    finishButton(ctx, rig, 'makeup', () => ({
      face: { ...faceSave(face, ['shadow', 'blush', 'lips', 'gloss']), brows: rig.browKey, lashes: rig.lashKey || null, lens, stickers: stickers.map((n) => n.save()) },
    }));
    void el;
  },
};
