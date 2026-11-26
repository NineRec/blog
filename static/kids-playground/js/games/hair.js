// 美发屋 — her hair is a tangle with leaves in it. Wet it, shampoo it, rub up a foam, rinse, blow it dry
// and comb it smooth; then style it freely: cut, grow, curl, straighten, dye (patches, ombre, rainbow),
// pick a new hairstyle, sprinkle glitter and clip on bows, tiaras and flowers.
import { el, rand, anim } from '../core.js';
import { spray, pointer } from './salonkit.js';
import { PROPS, BUST, HAIR } from '../salon/manifest.js';
import { Shelf, img, guide } from '../salon/ui.js';
import { bustRoom, prop, finishButton, placeOn, SHELF_W, products, productArt } from '../salon/room.js';

const CLEAN_STEPS = 6;
const SHAMPOO = { 'shampoo-pink': '#ffc2dc', 'shampoo-mint': '#c4f2dc', 'shampoo-blue': '#c9dcff' };
const DYES = [
  ['chestnut', '#8a5233'], ['blonde', '#efc86a'], ['black', '#2b2226'], ['red', '#d4402f'], ['orange', '#f08a2c'], ['pink', '#ff7fb6'],
  ['purple', '#a77cf0'], ['blue', '#4c9df0'], ['mint', '#5fd6b4'], ['silver', '#d6d8e6'],
];
const RAINBOW = ['#ff5f7e', '#ffa53a', '#ffe14d', '#6fd56a', '#4fb4ff', '#a77cf0'];
const GLITTER = [['gold', '#ffd84d'], ['silver', '#ffffff'], ['pink', '#ff8fd0'], ['blue', '#8fd8ff']];
const ACC = ['bow-pink', 'bow-blue', 'bow-yellow', 'clip-star', 'clip-heart', 'clip-butterfly', 'crown-flower', 'tiara', 'catears', 'pearls', 'hibiscus', 'scrunchie'];
const CURLY = { long: 'wavy', bob: 'curly' }, STRAIGHT = { wavy: 'long', curly: 'bob' };
const TABS = [
  ['cut', 'scissors', 'hair-snip'], ['grow', 'tonic', 'hair-grow'], ['curl', 'curler', 'hair-curl'], ['straight', 'straightener', 'hair-straight'],
  ['dye', 'dye', 'hair-color'], ['styles', 'mirror', 'sl-hair-styles'], ['glitter', 'glitter', 'hair-glitter'], ['acc', 'bow-pink', 'hair-deco'],
];

export default {
  id: 'hair',
  name: '美发屋',
  colors: ['#c4f1f4', '#62cfd6'],
  intro: 'sl-hair-hi',
  icon: () => img(PROPS.dryer?.src || ''),
  async start(ctx) {
    const room = await bustRoom(ctx, { bg: 'hair' }), { rig, hair } = room;
    const A = BUST.anchors;
    let shelf = new Shelf(ctx, { color: '#62cfd6', width: SHELF_W });
    let step = 0;
    const next = () => { step++; ctx.progress(step, CLEAN_STEPS); ctx.sfx('star'); };
    ctx.progress(0, CLEAN_STEPS);
    const S = () => hair.spec;
    const onHair = (p, slack = 40) => { const q = rig.local(p), s = S(); return q.x > s.x - slack && q.x < s.x + s.w + slack && q.y > s.y - slack && q.y < Math.max(A.chin[1], hair.bottom(q.x)) + slack; };
    const headTop = () => rig.stage(A.crown[0], A.crown[1] + 60);

    /* ---- the mess ---- */
    rig.settle('sad');
    hair.setMessy(1);
    const leaves = [[-180, 40], [150, 10], [40, -40], [-90, 140], [200, 160]].map(([dx, dy], i) => rig.add('top', el('div', {
      class: 'sl-stuck sl-leaf', html: prop(i % 2 ? 'leaf' : 'leaf'),
      style: { left: `${A.crown[0] + dx - 45}px`, top: `${A.crown[1] + 90 + dy - 45}px`, width: '90px', height: '90px', transform: `rotate(${rand(-60, 60)}deg)` },
    })));

    const job = (items, use, o = {}) => new Promise((done) => {
      let fin = false, last = null;
      const finish = () => { if (!fin) { fin = true; done(); } };
      shelf.setItems(items.map((k) => ({ key: k, art: prop(k) })), {
        drag: {
          size: o.size || 150, tip: o.tip || [0, 0],
          start: () => { last = null; },
          move: (k, p, ghost) => { if (!fin && use(k, p, last, ghost, false)) finish(); last = p; },
          drop: (k, p, ghost) => { if (fin) return false; const r = use(k, p, last, ghost, true); last = null; if (!r) return false; setTimeout(() => ghost.remove(), 260); if (r === true) finish(); return true; },
        },
      });
      if (o.hint) pointer(ctx, o.hint.map(([x, y]) => rig.stage(x, y)));
    });
    const water = (p) => {
      spray(ctx, p.x - 30, p.y + 50, { n: 3, angle: 100, cone: 14, reach: 230, size: 14, color: ['#9fdcff', '#e3f6ff'], shape: 'drop', fall: 40, ms: 420 });
      if (Math.random() < 0.15) ctx.sfx('water');
    };

    /* ---- 1. wet ---- */
    ctx.say('sl-hair-wet');
    let wet = 0;
    await job(['shower'], (k, p) => {
      water(p);
      if (!onHair({ x: p.x - 30, y: p.y + 120 })) return false;
      rig.mood('shut', 500);
      const q = rig.local({ x: p.x - 30, y: p.y + 140 });
      for (const l of leaves) {
        if (l.gone || Math.abs(parseFloat(l.style.left) + 45 - q.x) > 150) continue;
        l.gone = true;
        l.animate([{ translate: '0 0', opacity: 1 }, { translate: `${rand(-80, 80)}px 600px`, opacity: 0 }], { duration: 1100, easing: 'ease-in', fill: 'forwards' }).finished.then(() => l.remove(), () => l.remove());
      }
      wet++;
      if (wet > 25) hair.wet(true);
      return wet > 60 && leaves.every((l) => l.gone);
    }, { tip: [-30, 50], hint: [[A.crown[0] - 200, A.crown[1] - 60], [A.crown[0] + 200, A.crown[1] - 60]] });
    hair.wet(true);
    rig.settle('idle');
    next();

    /* ---- 2. shampoo ---- */
    ctx.say('hair-shampoo');
    const ring = guide(ctx, headTop().x, headTop().y, 90);
    let foamCol = '#fff', gel = null;
    await job(Object.keys(SHAMPOO), (k, p, last, ghost, up) => {
      if (!up || !onHair(p)) return false;
      foamCol = SHAMPOO[k];
      ghost.animate([{ transform: 'rotate(160deg) scale(1,1)' }, { transform: 'rotate(160deg) scale(1.12,.84)' }, { transform: 'rotate(160deg) scale(1,1)' }], { duration: 320 });
      ctx.sfx('squirt');
      const q = rig.local(p);
      gel = rig.add('fx', el('div', { class: 'sl-blob', style: { left: `${q.x - 50}px`, top: `${q.y - 40}px`, background: `radial-gradient(circle at 35% 30%, #fff 0 25%, ${foamCol})` } }));
      return true;
    }, { size: 150 });
    ring();
    next();

    /* ---- 3. rub up a foam with a finger ---- */
    ctx.say('hair-lather');
    const foam = [];
    shelf.setItems([]);
    const stopHint = pointer(ctx, [rig.stage(A.crown[0] - 160, A.crown[1] + 120), rig.stage(A.crown[0] + 160, A.crown[1] + 120), rig.stage(A.crown[0], A.crown[1] + 40)]);
    await new Promise((done) => {
      let last = null, travel = 0, fin = false;
      ctx.rub((p, ev, first) => {
        if (fin) return;
        if (first) last = null;
        if (!onHair(p, 0)) { last = p; return; }
        if (last) travel += Math.hypot(p.x - last.x, p.y - last.y);
        last = p;
        if (gel) gel.style.opacity = Math.max(0, 1 - travel / 800);
        if (Math.random() < 0.45 && foam.length < 80 && hair.inHair(rig.local(p).x, rig.local(p).y)) {
          const q = rig.local(p), s = rand(50, 110);
          foam.push(rig.add('fx', el('div', { class: 'sl-foam', style: { left: `${q.x - s / 2 + rand(-20, 20)}px`, top: `${q.y - s / 2 + rand(-20, 20)}px`, width: `${s}px`, height: `${s}px`, '--foam': foamCol } })));
          if (Math.random() < 0.3) ctx.sfx('bubble');
        }
        if (travel % 900 < 30) { rig.mood('giggle', 800); rig.react('giggle'); }
        if (foam.length >= 60 && travel > 2200) { fin = true; done(); }
      });
    });
    stopHint();
    gel?.remove();
    next();

    /* ---- 4. rinse ---- */
    ctx.say('hair-rinse');
    await job(['shower'], (k, p) => {
      water(p);
      const q = rig.local({ x: p.x - 30, y: p.y + 120 });
      rig.mood('shut', 500);
      for (const f of foam) {
        if (f.gone) continue;
        const fx = parseFloat(f.style.left), fy = parseFloat(f.style.top);
        if (Math.abs(fx - q.x) < 170 && fy > q.y - 300 && fy < q.y + 260) {
          f.gone = true;
          f.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${rand(200, 400)}px)`, opacity: 0 }], { duration: 800, easing: 'ease-in', fill: 'forwards' }).finished.then(() => f.remove(), () => f.remove());
        }
      }
      return foam.every((f) => f.gone);
    }, { tip: [-30, 50] });
    rig.settle('idle');
    next();

    /* ---- 5. blow dry ---- */
    ctx.say('hair-dry');
    let dry = 0;
    await job(['dryer'], (k, p, last, ghost) => {
      const mouth = { x: p.x - 70, y: p.y - 10 };
      spray(ctx, mouth.x, mouth.y, { n: 2, angle: 180, cone: 18, reach: 160, size: 30, color: 'rgba(255,255,255,.7)', shape: 'streak', ms: 300, turn: 0 });
      ghost.classList.add('sl-buzz');
      if (Math.random() < 0.12) ctx.sfx('puff');
      if (!onHair({ x: mouth.x - 100, y: mouth.y })) return false;
      dry++;
      hair.canvas.classList.toggle('sl-flutter', true);
      if (dry % 40 === 0) { rig.mood('giggle', 700); spray(ctx, mouth.x - 80, mouth.y, { n: 4, angle: 180, cone: 50, reach: 200, size: 14, color: '#bfe6ff', shape: 'drop', fall: 60 }); }
      if (dry > 70) hair.wet(false);
      return dry > 130;
    }, { tip: [-70, -10], size: 170 });
    hair.wet(false);
    hair.canvas.classList.remove('sl-flutter');
    rig.mood('surprise', 700);
    next();

    /* ---- 6. comb out the tangles ---- */
    ctx.say('sl-hair-comb');
    let messy = 1;
    await job(['comb'], (k, p, last) => {
      if (!last || !onHair(p)) return false;
      const d = p.y - last.y;
      if (d > 2) { messy -= d / 1600; hair.setMessy(messy); if (Math.random() < 0.1) ctx.sfx('brush'); }
      if (Math.random() < 0.02) { rig.mood('ew', 500); ctx.sfx('boing'); }
      return messy <= 0.05;
    }, { size: 140, hint: [[A.crown[0] - 160, A.crown[1] + 40], [A.crown[0] - 200, A.chin[1]]] });
    hair.setMessy(0);
    rig.mood('love', 1200);
    rig.react('hop');
    ctx.sfx('great');
    ctx.burst(headTop().x, headTop().y, { n: 12, spread: 200 });
    await ctx.sleep(900);

    /* ---- the styling, free ---- */
    ctx.say('hair-style');
    ctx.progress(0, 0);
    const acc = [...rig.slots.top.querySelectorAll('.sl-stuck')].filter((n) => n.save);     // what she came in wearing
    const minCut = A.browL[1] + 10;
    const tool = {
      cut: (p, last, ghost) => {
        ghost.classList.toggle('sl-snip', Math.floor(performance.now() / 160) % 2 === 0);
        if (!last) return;
        const a = rig.local(last), b = rig.local(p);
        const cut = hair.cut(a, b, minCut);
        if (cut > 300) { ctx.sfx('snip'); rig.mood('surprise', 600); }
      },
      grow: (p) => {
        spray(ctx, p.x - 40, p.y + 30, { n: 2, angle: 120, cone: 20, reach: 120, size: 12, color: ['#9be27a', '#d6ffb0'], ms: 380 });
        const q = rig.local({ x: p.x - 60, y: p.y + 60 });
        if (hair.grow(q.x, 5)) { if (Math.random() < 0.08) ctx.sfx('sparkle'); if (Math.random() < 0.02) rig.mood('giggle', 600); }
      },
      curl: (p) => twist(p, CURLY),
      straight: (p) => twist(p, STRAIGHT),
    };
    let dwell = 0;
    const twist = (p, map) => {
      if (!onHair(p)) return;
      spray(ctx, p.x, p.y, { n: 1, angle: 270, cone: 40, reach: 60, size: 22, color: 'rgba(255,255,255,.6)', shape: 'puff', ms: 500 });
      if (++dwell < 45) return;
      dwell = 0;
      const to = map[hair.key];
      if (!to) { ctx.sfx('boing'); rig.react('shake'); return; }
      ctx.sfx('steam');
      restyle(to, false);
    };
    const restyle = async (key, voice = true) => {
      ctx.sfx('whoosh');
      hair.canvas.animate([{ filter: 'brightness(1.6) blur(3px)', opacity: 0.3 }, { filter: 'none', opacity: 1 }], { duration: 450 });
      await hair.setStyle(key, hair.color);
      rig.mood('surprise', 500);
      ctx.after(500, () => rig.mood('love', 900));
      const t = headTop();
      ctx.burst(t.x, t.y + 80, { n: 12, spread: 220 });
      if (voice) ctx.sfx('sparkle');
    };
    const tools = (key, items, use, o = {}) => shelf.setItems(items, {
      drag: {
        size: o.size || 150, tip: o.tip || [0, 0],
        start: () => { dwell = 0; },
        move: (k, p, ghost) => { use(k, p, ghost.last, ghost); ghost.last = p; },
        drop: (k, p, ghost) => o.drop?.(k, p, ghost),
      },
    });
    const pics = await products(['pr-dye', 'pr-glitter']);
    const can = (col, kind) => productArt(pics, 'pr-dye', col, kind, '', 'dye');
    const dyeCol = (k) => (k === 'rainbow' ? RAINBOW : k.startsWith('ombre-') ? [hair.color || '#8a5233', DYES.find((d) => d[0] === k.slice(6))[1]] : DYES.find((d) => d[0] === k)[1]);
    const shelfFor = {
      cut: () => tools('cut', [{ key: 'scissors', art: prop('scissors') }], (k, p, last, g) => tool.cut(p, last, g), { size: 160, tip: [-50, -40] }),
      grow: () => tools('grow', [{ key: 'tonic', art: prop('tonic') }], (k, p) => tool.grow(p), { size: 150 }),
      curl: () => tools('curl', [{ key: 'curler', art: prop('curler') }], (k, p) => tool.curl(p), { size: 170 }),
      straight: () => tools('straight', [{ key: 'straightener', art: prop('straightener') }], (k, p) => tool.straight(p), { size: 170 }),
      dye: () => tools('dye', [...DYES.map(([k, c]) => ({ key: k, art: can(c), ghost: can(c) })),
        { key: 'ombre-pink', art: can(['#8a5233', '#ff7fb6']), ghost: can(['#8a5233', '#ff7fb6']) }, { key: 'ombre-blue', art: can(['#8a5233', '#4c9df0']), ghost: can(['#8a5233', '#4c9df0']) },
        { key: 'rainbow', art: can('rainbow'), ghost: can('rainbow') }], (k, p) => {
        const col = dyeCol(k), show = Array.isArray(col) ? col[col.length - 1] : col;
        spray(ctx, p.x - 30, p.y + 40, { n: 3, angle: 120, cone: 22, reach: 140, size: 16, color: Array.isArray(col) ? col : show, ms: 380 });
        if (Math.random() < 0.1) ctx.sfx('spray');
        const q = rig.local({ x: p.x - 70, y: p.y + 90 });
        if (onHair({ x: p.x - 70, y: p.y + 90 })) hair.dye(q.x, q.y, col, 80);
      }, { size: 140 }),
      styles: () => shelf.setItems(Object.keys(HAIR).map((k) => ({ key: k, art: img(HAIR[k].src, 'sl-style-icon') })), { on: hair.key, tap: (k) => restyle(k) }),
      glitter: () => tools('glitter', GLITTER.map(([k, c]) => ({ key: k, art: productArt(pics, 'pr-glitter', c, 'glitter', '', 'glitter'), ghost: productArt(pics, 'pr-glitter', c, 'glitter', '', 'glitter') })), (k, p) => {
        const c = GLITTER.find((g) => g[0] === k)[1];
        spray(ctx, p.x, p.y + 30, { n: 2, angle: 90, cone: 30, reach: 110, size: 14, color: c, shape: 'star', ms: 450 });
        for (let i = 0; i < 2; i++) { const q = rig.local({ x: p.x + rand(-50, 50), y: p.y + rand(40, 140) }); if (hair.glitter(q.x, q.y, c) && Math.random() < 0.1) ctx.sfx('sparkle'); }
      }, { size: 130 }),
      acc: () => tools('acc', ACC.map((k) => ({ key: k, art: prop(k) })), () => {}, {
        size: 140,
        drop: (k, p) => {
          if (!onHair(p, 60)) return false;
          const q = rig.local(p);
          const node = placeOn(rig, 'top', { key: k, x: q.x, y: q.y, s: ['crown-flower', 'tiara', 'catears', 'pearls'].includes(k) ? 1.9 : 1.2, r: rand(-12, 12) });
          node.classList.add('sl-removable');
          node.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); ctx.sfx('pop'); acc.splice(acc.indexOf(node), 1); anim(node, 'out', 200, { fill: 'forwards' }).then(() => node.remove()); });
          acc.push(node);
          anim(node, 'squash', 350);
          ctx.sfx('pop');
          rig.mood('love', 800);
          return true;
        },
      }),
    };
    shelf.remove();
    const styling = shelf = new Shelf(ctx, {
      color: '#62cfd6', width: SHELF_W,
      tabs: TABS.map(([key, icon, voice]) => ({ key, art: prop(key === 'dye' && PROPS['pr-dye'] ? 'pr-dye' : key === 'glitter' && PROPS['pr-glitter'] ? 'pr-glitter' : icon), label: voice })),
      onTab: (key) => { const t = TABS.find((x) => x[0] === key); ctx.say(t[2]); shelfFor[key](); },
    });
    styling.open('cut', true);
    shelfFor.cut();
    finishButton(ctx, rig, 'hair', () => ({ hair: hair.save(), hairAcc: acc.map((n) => n.save()) }));
  },
};
