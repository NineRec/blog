// 换装 — the style studio: the customer stands on a little stage, head to toe, wearing the hair and makeup
// from the other rooms. Dresses, tops, bottoms, shoes, hats, glasses, things to hold and wings fly
// from the shelf onto her; tap something she wears to take it off. The tick: a dance and a photo.
import { el, rand, pick } from '../core.js';
import { BODY, PROPS, BG } from '../salon/manifest.js';
import { Shelf, img, backdrop, doneButton } from '../salon/ui.js';
import { prop, photo, SHELF_W } from '../salon/room.js';
import { customer, look, saveLook } from '../salon/look.js';
import { Doll, WEAR } from '../salon/doll.js';
import { ART } from '../salon/ui.js';

/** Shelf tabs: key, the item shown on the tab, voice line. */
const TABS = [['dress', 'dress-princess', 'du-outfit'], ['top', 'top-star', 'sl-du-top'], ['bottom', 'bottom-tutu', 'sl-du-bottom'], ['shoes', 'shoes-ballerina', 'du-shoes'],
  ['hat', 'hat-party', 'du-head'], ['glasses', 'gl-heart', 'du-glasses'], ['hand', 'hold-balloon', 'du-hand'], ['back', 'back-butterfly', 'du-back']];
/** Where the clothes land on her (body landmark), for the sparkles. */
const LAND = { dress: 'chest', top: 'chest', bottom: 'waist', shoes: 'feet', back: 'chest', hand: 'handR' };

/** Shelf art: the whole thing (wings and capes have their own pictures, not the worn ones cut by her body). */
const art = (key) => (PROPS[`icon-${key}`] ? prop(`icon-${key}`) : BODY.wear?.[key] ? img(BODY.wear[key].src, 'sl-wear-icon') : prop(key));

export default {
  id: 'dressup',
  name: '换装',
  colors: ['#efe3ff', '#cdb4ff'],
  intro: 'sl-du-hi',
  icon: () => img(BODY.wear?.['dress-princess']?.src || PROPS['hold-wand']?.src || ''),
  async start(ctx) {
    backdrop(ctx, BG.studio);
    const who = customer(), l = look();
    // she stands on the stage painted in the middle of the room (the picture covers the room, bottom-aligned)
    const k = Math.max(ctx.W / 1800, ctx.H / 1200), cx = Math.min(ctx.W / 2, ctx.W - SHELF_W - 230), feet = ctx.H - (1200 - 1012) * k;
    const doll = new Doll(ctx, { cx, bottom: feet + 18, height: feet - 70 }, who, l);     // room above her head for a hat
    doll.node.classList.add('sl-enter');
    await doll.ready;
    doll.head.blinking = true;
    let shelf = null, busy = false;

    /** Fly a copy of the shelf item onto her, then put the thing on. */
    async function put(slot, key, from) {
      if (busy) return;
      busy = true;
      try {
        const target = slot === 'hat' ? doll.headPoint(627, 260) : slot === 'glasses' ? doll.headPoint(624, 600) : doll.anchor(LAND[slot] || 'chest');
        if (from) {
          const r = from.getBoundingClientRect(), a = ctx.point({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
          const fly = ctx.add(el('div', { class: 'sl-fly', html: art(key), style: { left: `${a.x - 60}px`, top: `${a.y - 60}px` } }));
          const dx = target.x - a.x, dy = target.y - a.y;
          await fly.animate([
            { transform: 'translate(0,0) scale(1) rotate(0deg)' },
            { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 160}px) scale(1.25) rotate(-12deg)`, offset: 0.5 },
            { transform: `translate(${dx}px, ${dy}px) scale(.6) rotate(0deg)`, opacity: 0.2 },
          ], { duration: 460, easing: 'ease-in-out', fill: 'forwards' }).finished.catch(() => {});
          fly.remove();
        }
        ctx.sfx('whoosh');
        await doll.wear(slot, key);
        ctx.burst(target.x, target.y, { n: 9, spread: 190 });
        ctx.sfx('sparkle');
        doll.mood('surprise', 500);
        ctx.after(520, () => doll.mood('love', 900));
        if (slot === 'dress' || slot === 'top' || slot === 'bottom') doll.spin(); else doll.react('hop');
        if (Math.random() < 0.35) ctx.say(pick(['mk-pretty', 'mk-lovely']));
      } finally { busy = false; }
    }

    function open(tab) {
      const items = WEAR[tab] || [];
      shelf.setItems(items.map((k) => ({ key: k, art: art(k), cls: `sl-wear-item sl-wear-item-${tab}` })), {
        on: doll.worn[tab],
        tap: (k, b) => {
          if (doll.worn[tab] === k) { takeOff(tab); return; }
          put(tab, k, b);
        },
      });
    }
    function takeOff(slot) {
      doll.off(slot);
      ctx.sfx('drop');
      doll.mood('surprise', 400);
      if (shelf.tab === slot) shelf.select(null);
    }
    shelf = new Shelf(ctx, {
      color: '#b68cff', width: SHELF_W,
      tabs: TABS.map(([key, icon, voice]) => ({ key, art: art(icon), label: voice })),
      onTab: (key) => { ctx.say(TABS.find((t) => t[0] === key)[2]); open(key); },
    });
    shelf.open('dress', true);
    open('dress');

    // tap her: take off what was tapped, or she giggles
    const box = doll.node.getBoundingClientRect(), a = ctx.point({ clientX: box.left, clientY: box.top }), b = ctx.point({ clientX: box.right, clientY: box.bottom });
    const hit = ctx.add(el('div', { class: 'sl-hit', style: { left: `${a.x + (b.x - a.x) * 0.1}px`, top: `${Math.max(0, a.y)}px`, width: `${(b.x - a.x) * 0.8}px`, height: `${b.y - Math.max(0, a.y)}px` } }));
    hit.addEventListener('pointerdown', (ev) => {
      if (busy) return;
      const slot = doll.slotAt(ctx.point(ev));
      if (slot) { takeOff(slot); return; }
      ctx.sfx('squeak');
      doll.mood('giggle', 700);
      doll.react('giggle');
    });

    // a dice: a whole new outfit at once
    const dice = ctx.button('dice', 92, ctx.H - 210, 'purple', '随机', async () => {
      if (busy) return;
      busy = true;
      const full = Math.random() < 0.5;
      const pickOr = (slot, p) => (Math.random() < p ? pick(WEAR[slot]) : null);
      const next = full ? { dress: pick(WEAR.dress) } : { top: pick(WEAR.top), bottom: pick(WEAR.bottom) };
      Object.assign(next, { shoes: pick(WEAR.shoes), hat: pickOr('hat', 0.5), glasses: pickOr('glasses', 0.3), hand: pickOr('hand', 0.5), back: pickOr('back', 0.3) });
      for (const s of Object.keys(doll.worn)) doll.off(s, true);
      for (const [s, k] of Object.entries(next)) if (k) await doll.wear(s, k, true);
      busy = false;
      ctx.sfx('sparkle');
      doll.spin();
      doll.mood('love', 900);
      ctx.burst(cx, ctx.H / 2, { n: 16, spread: 360 });
      if (shelf.tab) shelf.select(doll.worn[shelf.tab] || null);
    });

    let done = false;
    const tickBtn = doneButton(ctx, async () => {
      if (done) return;
      done = true;
      tickBtn.remove();
      dice.remove();
      saveLook('dressup', { wear: Object.fromEntries(Object.keys(WEAR).map((slot) => [slot, doll.worn[slot] || null])) });
      shelf.hide();
      ctx.say('sl-du-dance');
      // a little dance: hop, twirl, hop, with hearts
      doll.mood('love');
      for (let i = 0; i < 5; i++) ctx.after(i * 420, () => ctx.burst(cx + (i % 2 ? 150 : -150), ctx.H * 0.35 + rand(-40, 40), { n: 6, shapes: ['heart'], spread: 160, size: 34 }));
      await doll.react('hop');
      await doll.spin();
      await doll.react('hop');
      await photo(ctx, { node: doll.node, mood: (m) => doll.mood(m), react: (k) => doll.react(k) });
      ctx.win({ delay: 300 });
    });

    window.__salon = { doll, shelf, open: (k) => shelf.open(k), put, ready: true };
    void ART; void rand;
  },
};
