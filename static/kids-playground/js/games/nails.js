// 美甲店 — a muddy hand with germs on it. Soap and scrub (the germs squeal and run), rinse, clip the long
// nails, file them, a drop of oil; then decorate: paint each nail stroke by stroke,
// add stickers and gems, and slide rings onto the fingers and a bracelet onto the wrist.
import { el, rand, pick, anim } from '../core.js';
import { spray, pointer } from './salonkit.js';
import { PROPS, HAND, BG } from '../salon/manifest.js';
import { Rig } from '../salon/rig.js';
import { PaintLayer, image } from '../salon/paint.js';
import { Shelf, ART, img, backdrop } from '../salon/ui.js';
import { prop, finishButton, placeOn, stageMid, SHELF_W, products, productArt } from '../salon/room.js';
import { customer, look } from '../salon/look.js';

const STEPS = 6;
const POLISH = [['red', '#e8344e'], ['pink', '#ff7fb6'], ['coral', '#ff7c5c'], ['orange', '#ff9a2e'], ['yellow', '#ffd93d'], ['mint', '#62d9b0'], ['green', '#4cbf5a'], ['sky', '#5fc0ff'],
  ['blue', '#3c6fe0'], ['purple', '#9a5ce8'], ['lilac', '#c9a7ff'], ['white', '#f6f4fb'], ['glitter-gold', '#f2c23c', 'glitter'], ['glitter-pink', '#ff6fc0', 'glitter'], ['rainbow', 'rainbow'], ['pearl', ['#fff6fb', '#ffd3ea', '#e6dcff'], 'pearl']];
const RAINBOW = ['#ff5f7e', '#ffa53a', '#ffe14d', '#6fd56a', '#4fb4ff', '#a77cf0'];
const STICKERS = ['st-heart', 'st-star', 'st-strawberry', 'st-butterfly', 'st-rainbow', 'st-flower', 'st-moon', 'st-ladybug', 'st-bow', 'st-sparkle', 'st-sun', 'st-gem'];
const GEMS = ['gem-pink', 'gem-heart', 'gem-star', 'gem-drop', 'pearl', 'charm-flower', 'gem-mint', 'charm-heart'];
const RINGS = ['ring-heart', 'ring-blue', 'ring-flower', 'ring-crystal', 'ring-rainbow', 'ring-pearl', 'ring-star', 'ring-butterfly'];
const BRACELETS = ['bracelet-beads', 'bracelet-hearts', 'bracelet-rainbow', 'bracelet-pearl'];
const TABS = [['polish', 'polish', 'nails-polish'], ['stickers', 'st-heart', 'sl-nail-sticker'], ['gems', 'gem-pink', 'sl-nail-gem'], ['rings', 'ring-heart', 'sl-nail-ring'], ['bracelets', 'bracelet-beads', 'sl-nail-bracelet']];

export default {
  id: 'nails',
  name: '美甲店',
  colors: ['#eadcff', '#b48cf5'],
  intro: 'sl-nail-hi',
  icon: () => img((PROPS['polish-pink'] || PROPS.polish)?.src || ''),
  async start(ctx) {
    backdrop(ctx, BG.nails);
    const who = customer(), l = look();
    const rig = new Rig(ctx, { ...HAND, anchors: {} }, { cx: stageMid(ctx), bottom: 830, height: 800 }, { skin: who.skin });
    rig.node.classList.add('sl-enter', 'sl-hand');
    await rig.ready;
    window.__salon = { rig, nail: (i) => rig.stage(...HAND.nails[i].c), at: (x, y) => rig.stage(x, y) };
    const nails = HAND.nails.map((n, i) => ({ ...n, i }));
    // the long nails, each piece belonging to the nail it grows from
    const longs = await Promise.all((HAND.long || []).map((spec) => rig.layer('fx', spec)));
    longs.forEach((node, k) => { const s = HAND.long[k], cx = s.x + s.w / 2; node.nail = nails.reduce((a, b) => (Math.abs(b.c[0] - cx) < Math.abs(a.c[0] - cx) ? b : a)).i; });
    const polish = await Promise.all(nails.map(async (n) => { const p = new PaintLayer(rig.slots.skin, n, { res: 1, cls: 'pl-nail' }); p.setMask(await image(ART + n.src)); return p; }));
    const deco = [];                       // the room always starts with a fresh, muddy hand
    void l;
    /** A canvas the size of nail i's box, cut to the nail's shape by draw(g, w, h, tip) (tip: the free edge's middle, in the box). */
    const nailMasks = await Promise.all(nails.map((n) => image(ART + n.src)));
    const onNail = (n, cls, draw) => {
      const c = el('canvas', { class: `sl-layer ${cls}`, width: n.w, height: n.h, style: { left: `${n.x}px`, top: `${n.y}px`, width: `${n.w}px`, height: `${n.h}px` } });
      const g = c.getContext('2d'), u = n.u || [0, 1], tip = { x: n.c[0] - n.x - u[0] * (n.len || n.h) * 0.5, y: n.c[1] - n.y - u[1] * (n.len || n.h) * 0.5 };
      draw(g, n.w, n.h, tip, u);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(nailMasks[n.i], 0, 0, n.w, n.h);
      return rig.add('fx', c);
    };
    let shelf = new Shelf(ctx, { color: '#b48cf5', width: SHELF_W });
    const handBox = { x: 0, y: 0, w: HAND.size[0], h: HAND.size[1] };
    const onHand = (p) => { const q = rig.local(p); return q.x > 60 && q.x < handBox.w - 60 && q.y > 20 && q.y < handBox.h - 120; };
    /** The nail whose box (plus `slack`) holds the point. */
    const nailIn = (p, slack = 12) => { const q = rig.local(p); return nails.find((n) => q.x > n.x - slack && q.x < n.x + n.w + slack && q.y > n.y - slack && q.y < n.y + n.h + slack); };
    const nailAt = (p, r = 90) => { const q = rig.local(p); return nails.find((n) => Math.hypot(n.c[0] - q.x, n.c[1] - q.y) < r); };
    let step = 0;
    const next = () => { step++; ctx.progress(step, STEPS); ctx.sfx('star'); };
    ctx.progress(0, STEPS);
    const job = (items, use, o = {}) => new Promise((done) => {
      let fin = false;
      const finish = () => { if (!fin) { fin = true; done(); } };
      shelf.setItems(items.map((k) => ({ key: k, art: prop(k) })), {
        drag: {
          size: o.size || 150, tip: o.tip || [0, 0],
          move: (k, p, ghost) => { if (!fin && use(k, p, ghost.last, ghost, false)) finish(); ghost.last = p; },
          drop: (k, p, ghost) => { if (fin) return false; const r = use(k, p, null, ghost, true); if (!r) return false; setTimeout(() => ghost.remove(), 260); if (r === true) finish(); return true; },
        },
      });
      if (o.hint) pointer(ctx, o.hint.map(([x, y]) => rig.stage(x, y)));
    });

    /* ---- the mess ---- */
    const dirtMask = document.createElement('canvas');
    dirtMask.width = HAND.base.w / 2; dirtMask.height = HAND.base.h / 2;
    dirtMask.getContext('2d').drawImage(await image(ART + HAND.base.src), 0, 0, dirtMask.width, dirtMask.height);
    const dirt = new PaintLayer(rig.slots.skin, HAND.base, { res: 0.5, cls: 'pl-dirt' });
    dirt.setMask(dirtMask);
    const muds = await Promise.all(['mud1', 'mud2', 'smudge'].map((k) => image(ART + PROPS[k].src)));
    for (const [x, y] of [[420, 760], [700, 840], [560, 600], [300, 520], [820, 640], [600, 980]]) { const m = pick(muds), s = rand(130, 190); dirt.stamp(m, x, y, s, s * m.naturalHeight / m.naturalWidth, rand(-0.6, 0.6)); }
    const dirt0 = dirt.measure();
    const germs = nails.slice(0, 4).map((n, i) => {
      const g = rig.add('top', el('div', { class: 'sl-germ', 'data-i': i, html: `${prop(`germ${i + 1}`)}${prop(`germ${i + 1}-scared`, 'scared')}`, style: { left: `${n.c[0] - 60 + (i % 2 ? 40 : -30)}px`, top: `${n.c[1] + 90 + i * 20}px`, animationDelay: `${-i * 0.3}s` } }));
      return g;
    });

    /* ---- 1. soap ---- */
    ctx.say('sl-nail-soap');
    let blob = null;
    await job(['soap'], (k, p, last, ghost, up) => {
      if (!up || !onHand(p)) return false;
      ghost.animate([{ transform: 'scale(1,1)' }, { transform: 'scale(1.12,.84)' }, { transform: 'scale(1,1)' }], { duration: 300 });
      ctx.sfx('squirt');
      const q = rig.local(p);
      blob = rig.add('fx', el('div', { class: 'sl-blob', style: { left: `${q.x - 50}px`, top: `${q.y - 40}px`, background: 'radial-gradient(circle at 35% 30%, #fff 0 25%, #bfe2ff)' } }));
      return true;
    }, { hint: [[560, 760]] });
    next();

    /* ---- 2. scrub: the germs run ---- */
    ctx.say('nails-wash');
    const foam = [];
    await job(['nail-sponge'], (k, p, last) => {
      if (!last || !onHand(p)) return false;
      const q = rig.local(p);
      dirt.erase(q.x, q.y, 70, { strength: 0.35 });
      if (blob) blob.style.opacity = Math.max(0, (+blob.style.opacity || 1) - 0.02);
      if (Math.random() < 0.3 && foam.length < 60) { const s = rand(40, 80); foam.push(rig.add('fx', el('div', { class: 'sl-foam', style: { left: `${q.x - s / 2 + rand(-30, 30)}px`, top: `${q.y - s / 2 + rand(-30, 30)}px`, width: `${s}px`, height: `${s}px`, '--foam': '#cfe8ff' } }))); }
      for (const g of germs) {
        if (g.gone) continue;
        const gx = parseFloat(g.style.left) + 60, gy = parseFloat(g.style.top) + 60;
        if (Math.hypot(gx - q.x, gy - q.y) > 110) continue;
        g.gone = true;
        g.classList.add('run');
        ctx.sfx('squeak');
        const dir = gx < handBox.w / 2 ? -1 : 1;
        g.animate([{ translate: '0 0', rotate: '0deg' }, { translate: '0 -40px', rotate: `${dir * 10}deg`, offset: 0.2 }, { translate: `${dir * 900}px ${rand(-200, 200)}px`, rotate: `${dir * 30}deg` }], { duration: 1100, delay: 250, easing: 'ease-in', fill: 'forwards' }).finished.then(() => g.remove(), () => g.remove());
      }
      if (Math.random() < 0.08) ctx.sfx('brush');
      if (Math.random() < 0.03) rig.react('wiggle');
      return germs.every((g) => g.gone) && dirt.measure() < dirt0 * 0.15;
    }, { size: 150, hint: [[400, 700], [700, 700], [560, 500]] });
    blob?.remove();
    dirt.clear();
    next();

    /* ---- 3. rinse ---- */
    ctx.say('sl-nail-rinse');
    await job(['shower'], (k, p) => {
      spray(ctx, p.x - 30, p.y + 50, { n: 3, angle: 100, cone: 14, reach: 230, size: 14, color: ['#9fdcff', '#e3f6ff'], shape: 'drop', fall: 40, ms: 420 });
      if (Math.random() < 0.15) ctx.sfx('water');
      const q = rig.local({ x: p.x - 30, y: p.y + 120 });
      for (const f of foam) {
        if (f.gone) continue;
        const fx = parseFloat(f.style.left), fy = parseFloat(f.style.top);
        if (Math.abs(fx - q.x) < 160 && fy > q.y - 280 && fy < q.y + 220) { f.gone = true; f.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${rand(200, 400)}px)`, opacity: 0 }], { duration: 700, easing: 'ease-in', fill: 'forwards' }).finished.then(() => f.remove(), () => f.remove()); }
      }
      return foam.every((f) => f.gone);
    }, { tip: [-30, 50] });
    rig.react('shake');
    spray(ctx, rig.stage(handBox.w / 2, 500).x, rig.stage(0, 500).y, { n: 14, angle: 270, cone: 80, reach: 260, size: 14, color: '#bfe6ff', shape: 'drop', fall: 120 });
    next();

    /* ---- 4. clip ---- */
    ctx.say('nails-clip');
    const tips = (i) => longs.filter((n) => n.nail === i && !n.cut);
    /** A freshly clipped nail has a jagged, chipped white edge until it is filed. */
    const rough = [];
    const roughEdge = (n) => {
      const node = onNail(n, 'sl-rough', (g, w, h, tip, u) => {
        const px = -u[1], py = u[0], L = n.len || h, d = L * 0.3, a = L * 0.07;
        g.translate(tip.x, tip.y); g.transform(px, py, u[0], u[1], 0, 0);     // x along the edge, y into the nail
        // the chipped white end of the nail, with a jagged broken line where the clipper bit
        g.fillStyle = '#fffafb'; g.strokeStyle = '#c4607c'; g.lineWidth = 5; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(-w, -40);
        for (let x = -w, j = 0; x <= w; x += a * 0.9, j++) g.lineTo(x, d + (j % 2 ? a : -a * 0.4) + rand(-a * 0.3, a * 0.3));
        g.lineTo(w, -40); g.closePath(); g.fill(); g.stroke();
        // little cracks and chips
        g.strokeStyle = '#d88aa0'; g.lineWidth = 3;
        for (let j = 0; j < 4; j++) { const x = rand(-w * 0.35, w * 0.35), y = rand(d * 0.3, d * 0.8); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-8, 8), y - rand(10, 18)); g.lineTo(x + rand(-10, 10), y - rand(20, 28)); g.stroke(); }
      });
      anim(node, 'in', 250);
      return node;
    };
    /** A white glint sweeps across a nail. */
    const shine = (n) => {
      const node = onNail(n, 'sl-glint', (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0.35, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.95)'); gr.addColorStop(0.65, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      });
      node.animate([{ opacity: 0, transform: 'translateX(-40%)' }, { opacity: 1, offset: 0.4 }, { opacity: 0, transform: 'translateX(40%)' }], { duration: 650 }).finished.then(() => node.remove(), () => node.remove());
    };
    const clipRings = nails.map((n) => (tips(n.i).length ? ring(ctx, rig, n.c[0], n.c[1] - 60, 70) : null));
    await job(['clipper'], (k, p, last, ghost, up) => {
      if (!up) return false;
      const n = nailAt({ x: p.x, y: p.y }, 140);
      if (!n || !tips(n.i).length) return false;
      ghost.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(0)' }], { duration: 220 });
      ctx.sfx('snip');
      for (const t of tips(n.i)) {
        t.cut = true;
        t.animate([{ translate: '0 0', rotate: '0deg', opacity: 1 }, { translate: `${rand(-120, 120)}px 700px`, rotate: `${rand(-200, 200)}deg`, opacity: 0 }], { duration: 900, easing: 'ease-in', fill: 'forwards' }).finished.then(() => t.remove(), () => t.remove());
      }
      clipRings[n.i]?.();
      rough[n.i] = roughEdge(n);
      rig.react('flinch');
      return longs.every((t) => t.cut) ? true : 'used';
    }, { size: 130 });
    next();

    /* ---- 5. file: the rough edges wear smooth ---- */
    ctx.say('nails-file');
    const filed = nails.map(() => 0), FILE = 170;
    const fileRings = nails.map((n) => ring(ctx, rig, n.c[0], n.c[1] - 50, 75));
    await job(['file'], (k, p, last) => {
      if (!last) return false;
      const n = nailAt(p, 110);
      if (!n || filed[n.i] >= FILE) return false;
      filed[n.i] += Math.hypot(p.x - last.x, p.y - last.y);
      const left = Math.max(0, 1 - filed[n.i] / FILE);
      if (rough[n.i]) rough[n.i].style.opacity = left;
      if (Math.random() < 0.45) spray(ctx, p.x, p.y + 10, { n: 3, angle: 90, cone: 70, reach: 70, size: 9, color: ['#fde7ee', '#fff'], fall: 60, ms: 600 });
      if (Math.random() < 0.1) ctx.sfx('file');
      if (!left) {
        rough[n.i]?.remove();
        fileRings[n.i]?.();
        const c = rig.stage(n.c[0], n.c[1] - 40);
        ctx.burst(c.x, c.y, { n: 6, spread: 50 });
        ctx.sfx('sparkle');
        shine(n);
      }
      return filed.every((f) => f >= FILE);
    }, { size: 150 });
    next();

    /* ---- 6. oil: a golden drop on each nail spreads into a shiny glow ---- */
    ctx.say('sl-nail-oil');
    const oil = [];
    const oilRings = nails.map((n) => ring(ctx, rig, n.c[0], n.c[1], 75));
    await job(['oil'], (k, p, last, ghost, up) => {
      if (!up) return false;
      const n = nailAt(p, 140);
      if (!n || oil[n.i]) return false;
      const c = rig.stage(n.c[0], n.c[1]);
      const drop = ctx.add(el('div', { class: 'sl-oil-drop', style: { left: `${c.x - 14}px`, top: `${c.y - 140}px` } }));
      drop.animate([{ transform: 'translateY(0) scale(.6)' }, { transform: 'translateY(126px) scale(1)' }], { duration: 380, easing: 'ease-in', fill: 'forwards' }).finished.then(() => drop.remove(), () => drop.remove());
      oil[n.i] = onNail(n, 'sl-oil', (g, w, h, tip, u) => {
        const cx = n.c[0] - n.x, cy = n.c[1] - n.y;
        const gr = g.createRadialGradient(cx, cy, 4, cx, cy, Math.max(w, h) * 0.7);
        gr.addColorStop(0, 'rgba(255,196,60,.85)'); gr.addColorStop(0.6, 'rgba(255,214,110,.55)'); gr.addColorStop(1, 'rgba(255,226,150,.35)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.save(); g.translate(cx, cy); g.rotate(Math.atan2(u[1], u[0]) - Math.PI / 2);
        g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(-w * 0.2, -h * 0.05, w * 0.07, h * 0.3, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(w * 0.12, -h * 0.25, w * 0.05, 0, 7); g.fill();
        g.restore();
      });
      oil[n.i].style.transformOrigin = `${n.c[0] - n.x}px ${n.c[1] - n.y}px`;
      oil[n.i].animate([{ transform: 'scale(.15)', opacity: 0 }, { transform: 'scale(.15)', opacity: 0, offset: 0.4 }, { transform: 'scale(1.05)', opacity: 1, offset: 0.8 }, { transform: 'scale(1)', opacity: 1 }], { duration: 950, easing: 'ease-out' });
      ctx.after(380, () => { ctx.sfx('drop'); oilRings[n.i]?.(); });
      ctx.after(800, () => { ctx.sfx('sparkle'); ctx.burst(c.x, c.y, { n: 5, spread: 50 }); });
      return oil.filter(Boolean).length === nails.length ? true : 'used';
    }, { size: 130, tip: [10, 55] });
    await ctx.sleep(900);
    next();
    ctx.sfx('great');
    rig.react('wiggle');
    await ctx.sleep(700);

    /* ---- decorate ---- */
    ctx.say('nails-polish');
    ctx.progress(0, 0);
    let dragging = false, tab = 'polish';
    const coat = (i, key) => {
      const [, col, kind] = POLISH.find((x) => x[0] === key), layer = polish[i];
      layer.fill((g, w, h) => {
        if (col === 'rainbow' || kind === 'pearl') {
          const gr = g.createLinearGradient(0, 0, 0, h); const list = col === 'rainbow' ? RAINBOW : col;
          list.forEach((c, j) => gr.addColorStop(j / (list.length - 1), c)); g.fillStyle = gr;
        } else g.fillStyle = col;
        g.fillRect(0, 0, w, h);
        if (kind === 'glitter') for (let j = 0; j < 40; j++) { g.fillStyle = pick(['#fff', '#fff6c4', '#ffe0f4']); g.beginPath(); g.arc(rand(0, w), rand(0, h), rand(1, 3), 0, 7); g.fill(); }
        const sh = g.createLinearGradient(0, 0, w, 0);       // the shine of fresh polish
        sh.addColorStop(0.15, 'rgba(255,255,255,0)'); sh.addColorStop(0.3, 'rgba(255,255,255,.55)'); sh.addColorStop(0.42, 'rgba(255,255,255,0)');
        g.fillStyle = sh; g.fillRect(0, 0, w, h);
      });
      layer.key = key;
    };
    const pics = await products(['pr-polish', 'pr-polish-brush', 'polish-pink']);
    const tools = (items, o) => shelf.setItems(items, {
      drag: {
        size: o.size || 130, tip: o.tip || [0, 0],
        start: () => { dragging = true; },
        move: (k, p, ghost) => { o.move?.(k, p, ghost); ghost.last = p; },
        drop: (k, p, ghost, moved) => { setTimeout(() => { dragging = false; }, 0); return o.drop?.(k, p, ghost, moved); },
      },
    });
    const stick = (k, p, scale) => {
      const n = nailAt(p, 80);
      if (!n) return false;
      const q = rig.local(p);
      const node = placeOn(rig, 'top', { key: k, x: q.x, y: q.y, s: scale, r: rand(-15, 15) });
      node.classList.add('sl-nail-deco', 'sl-removable');
      node.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); ctx.sfx('pop'); deco.splice(deco.indexOf(node), 1); anim(node, 'out', 200, { fill: 'forwards' }).then(() => node.remove()); });
      deco.push(node);
      anim(node, 'squash', 300);
      ctx.sfx('pop');
      return true;
    };
    /* rings slide down a finger and stay on it; a bracelet slips over the hand onto the wrist */
    const worn = { rings: {}, bracelet: null };
    const fingerAt = (p) => {
      const q = rig.local(p), F = HAND.fingers || [];
      let best = null, bd = 1e9;
      F.forEach((f, i) => {
        const a = f.c, b = [f.ring[0] + f.u[0] * 70, f.ring[1] + f.u[1] * 70];
        const t = Math.max(0, Math.min(1, ((q.x - a[0]) * (b[0] - a[0]) + (q.y - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)));
        const d = Math.hypot(q.x - a[0] - t * (b[0] - a[0]), q.y - a[1] - t * (b[1] - a[1]));
        if (d < f.w * 0.9 + 30 && d < bd) { bd = d; best = i; }
      });
      return best;
    };
    /** A ring without its worn picture: a gold band round the finger with the ring's jewel on top. */
    function drawnRing(k, f) {
      const w = f.w + 12, th = Math.round(f.w * 0.2), gem = f.w * 0.8;
      const node = el('div', { class: 'sl-worn-ring sl-drawn-ring sl-removable', style: { left: `${f.ring[0] - w / 2}px`, top: `${f.ring[1] - th / 2}px`, width: `${w}px`, height: `${th}px` } });
      node.innerHTML = `<i class="sl-band"></i>${PROPS[k] ? `<img src="${ART + PROPS[k].src}" alt="" draggable="false" style="width:${gem}px;left:${(w - gem) / 2}px;bottom:${th * 0.45 - gem * 0.58}px">` : ''}`;
      rig.slots.top.append(node);
      return node;
    }
    async function putRing(i, k, quiet = false) {
      const spec = HAND.rings?.[k], f = HAND.fingers?.[i];
      if (!f) return null;
      worn.rings[i]?.remove();
      let node, at;
      if (spec) {
        node = await rig.layer('top', spec, 'sl-worn-ring sl-removable');
        const [ax, ay] = spec.at, dx = f.ring[0] - ax, dy = f.ring[1] - ay, sc = f.w / f.w0;
        node.style.transformOrigin = `${ax - spec.x}px ${ay - spec.y}px`;
        at = (back) => `translate(${dx - f.u[0] * back}px, ${dy - f.u[1] * back}px) rotate(${f.ang}deg) scale(${sc})`;
      } else {
        node = drawnRing(k, f);
        const ang = Math.atan2(f.u[1], f.u[0]) * 180 / Math.PI - 90;
        at = (back) => `translate(${-f.u[0] * back}px, ${-f.u[1] * back}px) rotate(${ang}deg)`;
      }
      node.style.transform = at(0);
      node.dataset.finger = i; node.dataset.key = k;
      node.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); ctx.sfx('pop'); delete worn.rings[i]; node.animate([{ transform: at(0), opacity: 1 }, { transform: at(180), opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.then(() => node.remove(), () => node.remove()); });
      worn.rings[i] = node;
      if (!quiet) node.animate([{ transform: at(200), opacity: 0 }, { transform: at(140), opacity: 1, offset: 0.25 }, { transform: at(-6), offset: 0.85 }, { transform: at(0) }], { duration: 650, easing: 'ease-out' });
      return node;
    }
    function wearRing(k, p) {
      const i = fingerAt(p);
      if (i === null) return false;
      putRing(i, k).then(() => { ctx.sfx('sparkle'); const f = HAND.fingers[i], s = rig.stage(...f.ring); ctx.burst(s.x, s.y, { n: 7, spread: 60 }); rig.react('wiggle'); });
      ctx.sfx('slide');
      return true;
    }
    async function putBracelet(k, quiet = false) {
      const spec = HAND.bracelets?.[k], wr = HAND.wrist;
      if (!spec && !(wr && PROPS[k])) return null;
      worn.bracelet?.remove();
      let node;
      if (spec) node = await rig.layer('top', spec, 'sl-worn-bracelet sl-removable');
      else {
        // without its worn picture: the bracelet seen from the side, its far half hidden behind the wrist
        const w = wr.w * 1.12;
        node = el('div', { class: 'sl-worn-bracelet sl-drawn-bracelet sl-removable', style: { left: `${wr.at[0] - w / 2}px`, top: `${wr.at[1] - w / 2}px`, width: `${w}px`, height: `${w}px` } });
        node.innerHTML = `<img src="${ART + PROPS[k].src}" alt="" draggable="false">`;
        rig.slots.top.append(node);
      }
      node.dataset.key = k;
      node.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); ctx.sfx('pop'); worn.bracelet = null; node.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-200px)', opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.then(() => node.remove(), () => node.remove()); });
      worn.bracelet = node;
      if (!quiet) node.animate([{ transform: 'translateY(-520px) scale(1.15)', opacity: 0 }, { transform: 'translateY(-380px) scale(1.12)', opacity: 1, offset: 0.3 }, { transform: 'translateY(8px) scale(1)', offset: 0.85 }, { transform: 'none' }], { duration: 750, easing: 'ease-in' });
      return node;
    }
    function wearBracelet(k, p, moved) {
      const q = rig.local(p), at = HAND.bracelets?.[k]?.at || HAND.wrist?.at || [handBox.w / 2, handBox.h - 200];
      if (moved && !(q.y > at[1] - 420 && q.x > at[0] - 380 && q.x < at[0] + 380)) return false;
      putBracelet(k).then(() => { ctx.sfx('sparkle'); const s = rig.stage(...at); ctx.burst(s.x, s.y, { n: 9, spread: 90 }); rig.react('shake'); });
      ctx.sfx('whoosh');
      return true;
    }
    const open = {
      polish: () => tools(POLISH.map(([k, c, kind]) => ({
        key: k,
        art: productArt(pics, 'pr-polish', c, kind, '', 'polish-pink'),
        ghost: pics['pr-polish-brush'] ? productArt(pics, 'pr-polish-brush', c, kind, 'sl-applicator') : productArt(pics, 'pr-polish', c, kind, '', 'polish-pink'),
      })), {
        size: 150, tip: [0, 66],
        move: (k, p, ghost) => {
          const n = nailIn(p, 14);
          if (!n) return;
          const [, col] = POLISH.find((x) => x[0] === k), layer = polish[n.i];
          if (layer.key !== k) { layer.recoat(); layer.key = k; layer.wet = true; }
          if (oil[n.i] && !oil[n.i].fading) { oil[n.i].fading = true; anim(oil[n.i], 'out', 400, { fill: 'forwards' }); }
          if (!layer.wet) return;
          const q = rig.local(p), c = col === 'rainbow' ? RAINBOW[Math.floor(Math.max(0, Math.min(0.99, (q.y - n.y) / n.h)) * 6)] : Array.isArray(col) ? col[1] : col;
          const cover = layer.dab(q.x, q.y, 24, c, { soft: 0.2, from: ghost.last && nailIn(ghost.last) === n ? rig.local(ghost.last) : null });
          if (Math.random() < 0.1) ctx.sfx('brush');
          if (cover > 0.85) { layer.wet = false; coat(n.i, k); ctx.sfx('sparkle'); const s = rig.stage(n.c[0], n.c[1]); ctx.burst(s.x, s.y, { n: 6, spread: 60 }); }
        },
      }),
      stickers: () => tools(STICKERS.map((k) => ({ key: k, art: prop(k) })), { size: 70, drop: (k, p) => stick(k, p, 0.45) }),
      gems: () => tools(GEMS.map((k) => ({ key: k, art: prop(k) })), { size: 60, drop: (k, p) => stick(k, p, 0.3) }),
      rings: () => tools(RINGS.map((k) => ({ key: k, art: prop(k) })), { size: 110, drop: (k, p) => wearRing(k, p) }),
      bracelets: () => tools(BRACELETS.map((k) => ({ key: k, art: prop(k) })), { size: 160, drop: (k, p, ghost, moved) => wearBracelet(k, p, moved) }),
    };
    shelf.remove();
    const deck = shelf = new Shelf(ctx, {
      color: '#b48cf5', width: SHELF_W,
      tabs: TABS.map(([key, icon, voice]) => ({ key, art: prop(key === 'polish' && PROPS['pr-polish'] ? 'pr-polish' : icon), label: voice })),
      onTab: (key) => { tab = key; ctx.say(TABS.find((t) => t[0] === key)[2]); open[key](); },
    });
    window.__salon.deck = deck;
    window.__salon.polish = polish;
    deck.open('polish', true);
    open.polish();
    window.__salon.worn = () => ({ rings: Object.fromEntries(Object.entries(worn.rings).map(([i, n]) => [i, n.dataset.key])), bracelet: worn.bracelet?.dataset.key || null });
    window.__salon.fingerPoint = (i, t = 1) => { const f = HAND.fingers[i]; return rig.stage(f.c[0] + (f.ring[0] - f.c[0]) * t, f.c[1] + (f.ring[1] - f.c[1]) * t); };
    window.__salon.ring = (i, k) => putRing(i, k, true);
    window.__salon.wrist = HAND.wrist?.at || [handBox.w / 2, handBox.h - 200];
    finishButton(ctx, rig, 'nails', () => ({ nails: { polish: polish.map((p) => (p.key ? p.snapshot('image/png') : null)), deco: deco.map((n) => n.save()), rings: window.__salon.worn().rings, bracelet: worn.bracelet?.dataset.key || null } }), {
      before: async () => { shelf.hide(); await ctx.sleep(450); },
      photo: { all: true },
    });
  },
};

/** A dashed ring on the hand (in the hand's own units). */
function ring(ctx, rig, x, y, r) {
  const node = rig.add('fx', el('div', { class: 'sl-guide sl-guide-in', style: { left: `${x - r}px`, top: `${y - r}px`, width: `${r * 2}px`, height: `${r * 2}px` } }));
  return () => node.remove();
}
