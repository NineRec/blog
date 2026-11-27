// 美颜 SPA — her face is muddy and spotty and she is sad. Wash it with face wash and a sponge, rinse,
// pat it dry, put patches on the spots, mix a mask from fruit in a bowl, brush it on, rest with cucumbers,
// wipe the mask away to a glowing face, and finish with cream.
import { el, rand, pick, anim } from '../core.js';
import { spray, pointer } from './salonkit.js';
import { PROPS, BUST } from '../salon/manifest.js';
import { PaintLayer, image } from '../salon/paint.js';
import { Shelf, ART, img, guide, bubble } from '../salon/ui.js';
import { bustRoom, prop, finishButton, faceSave, visibleFace, SHELF_W } from '../salon/room.js';

const STEPS = 9;
/** What goes in the mask bowl, and the colour each one gives. */
const FOOD = [['strawberry', '#ff8fa8'], ['cucumber', '#a8e07a'], ['lemon', '#ffe066'], ['avocado', '#9ccc5a'], ['blueberry', '#8f8cf0'], ['rose', '#ff9ec8'], ['honey', '#ffc247'], ['oats', '#e8d3a8'], ['kiwi', '#8fd16a']];
const PATCHES = ['patch-star', 'patch-heart', 'patch-flower', 'patch-cloud'];
/** The colour of fruit stirred together: their average, kept bright and creamy (never a muddy grey). */
function mixCol(cols) {
  const rgb = [0, 2, 4].map((i) => cols.reduce((s, c) => s + parseInt(c.slice(1 + i, 3 + i), 16), 0) / cols.length / 255);
  const mx = Math.max(...rgb), mn = Math.min(...rgb), d = mx - mn || 1e-6;
  let h = mx === rgb[0] ? ((rgb[1] - rgb[2]) / d) % 6 : mx === rgb[1] ? (rgb[2] - rgb[0]) / d + 2 : (rgb[0] - rgb[1]) / d + 4;
  h = ((h * 60) + 360) % 360;
  return `hsl(${Math.round(h)} 70% 74%)`;
}

export default {
  id: 'facial',
  name: '美颜 SPA',
  colors: ['#c9f5e0', '#7fd8b4'],
  intro: 'sl-spa-hi',
  icon: () => img(PROPS.sponge?.src || ''),
  async start(ctx) {
    const room = await bustRoom(ctx, { bg: 'spa', headband: true }), { rig, face } = room;
    const A = BUST.anchors, faceBox = BUST.masks.face;
    rig.settle('sad');
    const shelf = new Shelf(ctx, { color: '#7fd8b4', width: SHELF_W });
    const onFace = (p) => { const q = rig.local(p); return q.x > faceBox.x && q.x < faceBox.x + faceBox.w && q.y > faceBox.y && q.y < faceBox.y + faceBox.h; };
    let step = 0;
    const next = () => { step++; ctx.progress(step, STEPS); ctx.sfx('star'); };
    ctx.progress(0, STEPS);
    const faceImg = await visibleFace(room);
    const layer = (cls, o = {}) => { const l = new PaintLayer(rig.slots.skin, faceBox, { res: 0.5, cls, ...o }); l.setMask(faceImg); return l; };

    /* ---- the mess: mud on the face, three spots ---- */
    const dirt = layer('pl-dirt');
    const muds = await Promise.all(['mud1', 'mud2', 'smudge'].map((k) => image(ART + PROPS[k].src)));
    for (const [x, y] of [[A.browL[0] + 40, A.browL[1] + 10], [A.cheekL[0] + 10, A.cheekL[1] + 40], [A.cheekR[0] - 10, A.cheekR[1] + 20], [A.mouth[0] + 70, A.chin[1] - 60], [A.browR[0] - 30, A.browR[1] + 20]]) {
      const m = pick(muds), s = rand(150, 210);
      dirt.stamp(m, x, y, s, s * m.naturalHeight / m.naturalWidth, rand(-0.6, 0.6));
    }
    const dirt0 = dirt.measure();
    const spots = [[A.cheekL[0] + 40, A.cheekL[1] + 30], [A.cheekR[0] - 20, A.cheekR[1] + 50], [A.mouth[0] - 90, A.chin[1] - 50]].map(([x, y]) => {
      const s = 46;
      return rig.add('skin', el('div', { class: 'sl-spot', html: prop('pimple'), style: { left: `${x - s / 2}px`, top: `${y - s / 2}px`, width: `${s}px`, height: `${s}px` } }));
    });

    /** A tool on the shelf: pull it onto her and use it. Resolves when `use` says the job is done. */
    const job = (items, use, o = {}) => new Promise((done) => {
      let fin = false, last = null;
      const finish = (v) => { if (fin) return; fin = true; done(v); };
      shelf.setItems(items.map((k) => ({ key: k, art: prop(k) })), {
        drag: {
          size: o.size || 150, tip: o.tip || [0, 0],
          start: (k, p) => { last = null; o.start?.(k, p); },
          move: (k, p, ghost) => { if (!fin) { const r = use(k, p, last, ghost, false); last = p; if (r) finish(r); } },
          drop: (k, p, ghost, moved) => {
            if (fin) return false;
            const r = use(k, p, last, ghost, true, moved);
            last = null;
            if (!r) return false;
            setTimeout(() => ghost.remove(), 260);         // the thing was used up (a patch, a squeeze of face wash)
            if (r === true) finish(true);
            return true;
          },
        },
      });
      if (o.hint) { const stop = pointer(ctx, o.hint.map(([x, y]) => rig.stage(x, y))); ctx.cleanups.push(stop); }
    });

    /* ---- 1. face wash, then the sponge ---- */
    ctx.say('sl-spa-wash');
    const ring = guide(ctx, rig.anchor('face').x, rig.anchor('face').y, 230, 270);
    let washed = false;
    const blobs = [];
    await job(['wash'], (k, p, last, ghost, up) => {
      if (!up || !onFace(p)) return false;
      ghost.animate([{ transform: 'scale(1,1)' }, { transform: 'scale(1.15,.82)' }, { transform: 'scale(1,1)' }], { duration: 300 });
      ctx.sfx('squirt');
      const q = rig.local(p);
      for (const [dx, dy] of [[0, 0], [-120, 60], [130, 40]]) blobs.push(rig.add('fx', el('div', { class: 'sl-blob', style: { left: `${q.x + dx - 50}px`, top: `${q.y + dy - 40}px` } })));
      rig.mood('surprise', 700);
      washed = true;
      return true;
    }, { hint: [[A.nose[0], A.nose[1] - 100]] });
    const foam = [];
    const addFoam = (q) => {
      if (foam.length > 70) return;
      const s = rand(36, 80);
      foam.push(rig.add('fx', el('div', { class: 'sl-foam', style: { left: `${q.x - s / 2 + rand(-30, 30)}px`, top: `${q.y - s / 2 + rand(-30, 30)}px`, width: `${s}px`, height: `${s}px` } })));
    };
    let tickle = 0;
    await job(['sponge'], (k, p, last) => {
      if (!washed || !last || !onFace(p)) return false;
      const q = rig.local(p), from = rig.local(last);
      if (Math.hypot(q.x - from.x, q.y - from.y) < 3) return false;
      dirt.erase(q.x, q.y, 80, { strength: 0.5 });
      if (Math.random() < 0.35) addFoam(q);
      blobs.forEach((b) => { b.style.opacity = Math.max(0, (+b.style.opacity || 1) - 0.02); });
      if ((tickle += Math.hypot(q.x - from.x, q.y - from.y)) > 900) { tickle = 0; rig.mood('giggle', 900); rig.react('giggle'); ctx.sfx('bubble'); }
      if (Math.random() < 0.08) { ctx.sfx('brush'); }
      return dirt.measure() < dirt0 * 0.25;       // clean enough: what is left goes with the rinse
    }, { size: 170, hint: [[A.cheekL[0], A.cheekL[1]], [A.cheekR[0], A.cheekR[1]], [A.forehead[0], A.forehead[1] + 40]] });
    blobs.forEach((b) => b.remove());
    dirt.clear();
    ring();
    rig.settle('idle');
    next();

    /* ---- 2. rinse the foam away ---- */
    ctx.say('sl-spa-rinse');
    await job(['shower'], (k, p) => {
      spray(ctx, p.x - 30, p.y + 50, { n: 3, angle: 100, cone: 14, reach: 230, size: 14, color: ['#9fdcff', '#e3f6ff'], shape: 'drop', fall: 40, ms: 420 });
      if (Math.random() < 0.2) ctx.sfx('water');
      const q = rig.local({ x: p.x - 30, y: p.y + 120 });
      rig.mood('shut', 500);
      for (const f of foam) {
        if (f.gone) continue;
        const fx = parseFloat(f.style.left), fy = parseFloat(f.style.top);
        if (Math.abs(fx - q.x) < 160 && fy > q.y - 260 && fy < q.y + 200) {
          f.gone = true;
          f.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${rand(160, 300)}px)`, opacity: 0 }], { duration: 700, easing: 'ease-in', fill: 'forwards' }).finished.then(() => f.remove(), () => f.remove());
        }
      }
      return foam.every((f) => f.gone);
    }, { tip: [-30, 50], hint: [[A.forehead[0] - 150, A.forehead[1] - 120], [A.forehead[0] + 150, A.forehead[1] - 120]] });
    next();

    /* ---- 3. pat dry ---- */
    ctx.say('sl-spa-towel');
    const drops = [];
    for (let i = 0; i < 9; i++) {
      const x = rand(faceBox.x + 90, faceBox.x + faceBox.w - 90), y = rand(faceBox.y + 120, faceBox.y + faceBox.h - 90);
      drops.push(rig.add('fx', el('div', { class: 'sl-drop', style: { left: `${x}px`, top: `${y}px`, animationDelay: `${-rand(0, 2)}s` } })));
    }
    await job(['towel'], (k, p) => {
      const q = rig.local(p);
      for (const d of drops) {
        if (d.gone || Math.hypot(parseFloat(d.style.left) - q.x, parseFloat(d.style.top) - q.y) > 110) continue;
        d.gone = true; ctx.sfx('puff');
        anim(d, 'out', 200, { fill: 'forwards' }).then(() => d.remove());
      }
      return drops.every((d) => d.gone);
    }, { size: 170 });
    rig.mood('giggle', 900);
    next();

    /* ---- 4. patches on the spots ---- */
    ctx.say('sl-spa-patch');
    const spotRings = spots.map((s) => { const r = rig.stage(parseFloat(s.style.left) + 23, parseFloat(s.style.top) + 23); return guide(ctx, r.x, r.y, 46); });
    await job(PATCHES, (k, p, last, ghost, up) => {
      if (!up) return false;
      const q = rig.local(p);
      const i = spots.findIndex((s) => !s.patched && Math.hypot(parseFloat(s.style.left) + 23 - q.x, parseFloat(s.style.top) + 23 - q.y) < 110);
      if (i < 0) return false;
      const s = spots[i];
      s.patched = true; s.classList.add('patched'); spotRings[i]();
      const patch = rig.add('fx', el('div', { class: 'sl-patch', html: prop(k), style: { left: `${parseFloat(s.style.left) - 32}px`, top: `${parseFloat(s.style.top) - 32}px` } }));
      anim(patch, 'squash', 350);
      ctx.sfx('pop');
      rig.mood('surprise', 500);
      // a moment later the patch peels off and the spot is gone
      ctx.after(1300, () => {
        s.remove();
        ctx.sfx('whoosh');
        patch.animate([{ transform: 'rotate(0) translate(0,0)', opacity: 1 }, { transform: 'rotate(-40deg) translate(-40px,-120px)', opacity: 0 }], { duration: 600, easing: 'ease-in', fill: 'forwards' }).finished.then(() => patch.remove(), () => patch.remove());
        const c = rig.stage(parseFloat(s.style.left) + 23, parseFloat(s.style.top) + 23);
        ctx.burst(c.x, c.y, { n: 6, spread: 60 });
      });
      return spots.every((v) => v.patched) ? true : 'used';
    }, { size: 110 });
    await ctx.sleep(1500);
    rig.mood('love', 1000);
    next();

    /* ---- 5. mix a mask in the bowl ---- */
    ctx.say('sl-spa-mix');
    const bx = 150, by = 640;
    const bowl = ctx.add(el('div', { class: 'sl-bowl', html: `${prop('bowl')}<div class="sl-bowl-mix"><b class="sl-bowl-swirl"></b></div>`, style: { left: `${bx - 120}px`, top: `${by - 100}px` } }));
    anim(bowl, 'in', 400);
    const mixNode = bowl.querySelector('.sl-bowl-mix'), swirl = mixNode.firstElementChild;
    const picked = [];
    let spoon = null;
    const inBowl = (p) => Math.hypot(p.x - bx, p.y - (by - 10)) < 130;
    await new Promise((done) => {
      const refresh = () => shelf.setItems(FOOD.map(([k]) => ({ key: k, art: prop(k), cls: picked.includes(k) ? 'used' : '' })), {
        drag: {
          size: 120,
          drop: (k, p, ghost) => {
            if (!inBowl(p) || picked.length >= 4 || picked.includes(k)) return false;
            picked.push(k);
            const col = FOOD.find((f) => f[0] === k)[1];
            ghost.dataset.keep = 1;
            ghost.animate([{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: `translate(${bx - p.x}px, ${by - p.y}px) scale(.5)`, opacity: 0 }], { duration: 320, easing: 'ease-in', fill: 'forwards' }).finished.then(() => ghost.remove(), () => ghost.remove());
            ctx.after(300, () => {
              ctx.sfx('splash');
              spray(ctx, bx, by - 20, { n: 8, angle: 270, cone: 60, reach: 90, size: 16, color: col, shape: 'drop', fall: 70 });
              swirl.insertAdjacentHTML('beforeend', `<i style="--c:${col};left:${rand(22, 58)}%;top:${rand(22, 58)}%"></i>`);
              mixNode.classList.add('on');
            });
            if (picked.length === 2) {
              ctx.say('sl-spa-stir');
              spoon = ctx.sprite(prop('spoon'), bx + 150, by - 120, 140, 120, 'sl-spoon');
              anim(spoon.el, 'in', 400);
              let turn = 0, lastA = null, lastQ = null;
              // the hand shows it: pick up the spoon, round and round in the bowl
              const ring = Array.from({ length: 9 }, (_, i) => ({ x: bx + Math.cos(i * 0.8) * 70, y: by - 20 + Math.sin(i * 0.8) * 30 }));
              const hint = pointer(ctx, [{ x: spoon.cx, y: spoon.cy }, ...ring], { ms: 2400 });
              ctx.drag(spoon, {
                move: (s, q) => {
                  hint();
                  const a = Math.atan2(q.y - by, q.x - bx);
                  if (lastA !== null && Math.hypot(q.x - bx, q.y - by) < 170) {
                    let d = a - lastA; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
                    // round and round, or back and forth: a child stirs either way
                    turn += Math.max(Math.abs(d), Math.hypot(q.x - lastQ.x, q.y - lastQ.y) / 80);
                    swirl.style.setProperty('--turn', `${turn * 57}deg`);
                    if (Math.random() < 0.1) ctx.sfx('brush');
                    const t = Math.min(1, turn / (Math.PI * 4));
                    mixNode.style.setProperty('--blend', t);
                    mixNode.style.background = mixCol(picked.map((k2) => FOOD.find((f) => f[0] === k2)[1]));
                    if (t >= 1 && !mixNode.done) { mixNode.done = true; mixNode.classList.add('done'); ctx.sfx('sparkle'); ctx.burst(bx, by - 30, { n: 10, spread: 120 }); done(); }
                  }
                  lastA = a; lastQ = q;
                },
                end: () => { lastA = null; lastQ = null; spoon.goHome(); },
              });
            }
            refresh();
            return true;
          },
        },
      });
      refresh();
      pointer(ctx, [{ x: ctx.W - SHELF_W, y: 220 }, { x: bx, y: by - 20 }]);
    });
    const maskCol = mixCol(picked.map((k) => FOOD.find((f) => f[0] === k)[1]));
    spoon.el.style.pointerEvents = 'none';
    anim(spoon.el, 'out', 250, { fill: 'forwards' }).then(() => spoon.remove());
    next();

    /* ---- 6. brush the mask on ---- */
    ctx.say('sl-spa-mask');
    const mask = layer('pl-mask');
    const ring2 = guide(ctx, rig.anchor('face').x, rig.anchor('face').y, 230, 270);
    await job(['brush'], (k, p, last) => {
      if (!onFace(p)) return false;
      const q = rig.local(p);
      rig.mood('shut', 600);
      if (Math.random() < 0.15) ctx.sfx('brush');
      const c = mask.dab(q.x, q.y, 62, maskCol, { soft: 0.2, from: last && onFace(last) ? rig.local(last) : null });
      if (c > 0.82) {
        mask.fill((g, w, h) => {
          g.fillStyle = maskCol; g.fillRect(0, 0, w, h);
          const gr = g.createLinearGradient(0, 0, w * 0.4, h);         // a creamy shine across the top
          gr.addColorStop(0, 'rgba(255,255,255,.45)'); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.06)');
          g.fillStyle = gr; g.fillRect(0, 0, w, h);
        });
        mask.canvas.classList.add('set');
        return true;
      }
      return false;
    }, { size: 160, tip: [-40, -60], hint: [[A.cheekL[0], A.cheekL[1]], [A.forehead[0], A.forehead[1] + 30], [A.cheekR[0], A.cheekR[1]]] });
    ring2();
    anim(bowl, 'out', 300, { fill: 'forwards' }).then(() => bowl.remove());
    ctx.sfx('sparkle');
    next();

    /* ---- 7. cucumbers on the eyes, and rest ---- */
    ctx.say('sl-spa-cucumber');
    const eyeSpots = [A.eyeL, A.eyeR].map(([x, y]) => ({ x, y, on: null }));
    const eyeRings = eyeSpots.map((e) => { const r = rig.stage(e.x, e.y); return guide(ctx, r.x, r.y, 60); });
    rig.mood('shut');
    rig.rest = 'shut';
    await job(['cucumber'], (k, p, last, ghost, up) => {
      if (!up) return false;
      const q = rig.local(p), e = eyeSpots.find((v) => !v.on && Math.hypot(v.x - q.x, v.y - q.y) < 150);
      if (!e) return false;
      e.on = rig.add('top', el('div', { class: 'sl-cuke', html: prop('cucumber'), style: { left: `${e.x - 85}px`, top: `${e.y - 85}px` } }));
      anim(e.on, 'squash', 350);
      ctx.sfx('pop');
      eyeRings[eyeSpots.indexOf(e)]();
      return eyeSpots.every((v) => v.on) ? true : 'used';
    }, { size: 130 });
    shelf.setItems([]);
    ctx.say('sl-spa-relax');
    const zz = bubble(ctx, rig.anchor('crown').x + 170, rig.anchor('crown').y + 60, 'Zzz…', 3200);
    zz.classList.add('sl-zzz');
    const clock = ctx.add(el('div', { class: 'sl-clock', style: { left: `${ctx.W - SHELF_W + 40}px`, top: '360px' } }));
    anim(clock, 'in', 300);
    await ctx.sleep(3400);
    ctx.sfx('bell');
    anim(clock, 'out', 250, { fill: 'forwards' }).then(() => clock.remove());
    for (const e of eyeSpots) {
      e.on.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${e.x < rig.W / 2 ? -160 : 160}px, -200px) rotate(${e.x < rig.W / 2 ? -60 : 60}deg)`, opacity: 0 }], { duration: 600, easing: 'ease-in', fill: 'forwards' }).finished.then(() => e.on.remove(), () => e.on.remove());
    }
    ctx.sfx('whoosh');
    rig.settle('idle');
    next();

    /* ---- 8. wipe the mask away: she glows ---- */
    ctx.say('sl-spa-wipe');
    mask.canvas.classList.remove('set');
    await job(['cotton'], (k, p, last) => {
      if (!onFace(p)) return false;
      const q = rig.local(p);
      mask.erase(q.x, q.y, 70, { strength: 0.8 });
      if (Math.random() < 0.1) ctx.sfx('brush');
      return mask.measure() < 0.06;
    }, { size: 140 });
    mask.remove();
    face.glow.fill((g, w, h) => { const gr = g.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.45, w * 0.6); gr.addColorStop(0, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,240,230,.15)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    face.glow.painted = true;
    const shine = rig.add('fx', el('div', { class: 'sl-shine', style: { left: `${faceBox.x}px`, top: `${faceBox.y}px`, width: `${faceBox.w}px`, height: `${faceBox.h}px`, '--mask': `url(${ART}${faceBox.src})` } }));
    ctx.after(1400, () => shine.remove());
    ctx.sfx('sparkle');
    rig.mood('love', 1400);
    rig.react('hop');
    for (const n of ['forehead', 'cheekL', 'cheekR', 'nose']) { const a = rig.anchor(n); ctx.burst(a.x, a.y, { n: 5, spread: 80 }); }
    ctx.say('sl-spa-glow');
    next();

    /* ---- 9. cream ---- */
    await ctx.sleep(1200);
    ctx.say('sl-spa-cream');
    // the jar leaves thick white dollops where it touches; rubbing on spreads them thin into a shine
    const sheen = layer('pl-sheen', { blend: 'screen', opacity: 0.7 });
    const cream = new PaintLayer(rig.slots.face, faceBox, { res: 0.5, cls: 'pl-cream' });     // over her features, as cream is
    cream.setMask(faceImg);
    cream.canvas.style.filter = 'drop-shadow(0 3px 2px rgba(190, 120, 110, .45))';
    const dollops = [];
    await job(['cream'], (k, p, last) => {
      if (!onFace(p)) return false;
      const q = rig.local(p);
      if (!dollops.some((d) => Math.hypot(d.x - q.x, d.y - q.y) < 130)) {
        dollops.push(q);
        for (let i = 0; i < 3; i++) cream.dab(q.x + rand(-18, 18), q.y + rand(-12, 12), rand(40, 50), '#f7f2f4', { soft: 0.1, alpha: 1 });
        cream.dab(q.x - 12, q.y - 14, 24, '#ffffff', { soft: 0.4, alpha: 1 });          // the shine on top of the dollop
        ctx.sfx('squirt');
        const E = BUST.eyeBox;
        if (E && q.x > E[0] && q.x < E[2] && q.y > E[1] - 60 && q.y < E[3]) rig.mood('shut', 1200); else if (Math.random() < 0.4) rig.mood('giggle', 600);
        return false;
      }
      if (!last) return false;
      const from = onFace(last) ? rig.local(last) : null;
      if (dollops.some((d) => Math.hypot(d.x - q.x, d.y - q.y) < 160)) cream.dab(q.x, q.y, 36, '#f7f2f4', { soft: 0.6, alpha: 0.12, from });   // smeared about
      cream.erase(q.x, q.y, 55, { strength: 0.06 });
      if (Math.random() < 0.1) ctx.sfx('brush');
      if (Math.random() < 0.06) { rig.mood('giggle', 600); }
      return sheen.dab(q.x, q.y, 70, 'rgba(255,255,255,.6)', { soft: 0.8, from }) > 0.6;
    }, { size: 140 });
    cream.canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' }).finished.then(() => cream.remove(), () => cream.remove());
    const glint = rig.add('fx', el('div', { class: 'sl-shine', style: { left: `${faceBox.x}px`, top: `${faceBox.y}px`, width: `${faceBox.w}px`, height: `${faceBox.h}px`, '--mask': `url(${ART}${faceBox.src})` } }));
    ctx.after(1400, () => glint.remove());
    for (const n of ['forehead', 'cheekL', 'cheekR']) { const a = rig.anchor(n); ctx.burst(a.x, a.y, { n: 4, spread: 60 }); }
    sheen.fill('rgba(255,255,255,.35)');
    next();
    ctx.sfx('great');
    shelf.hide();
    rig.settle('idle');
    rig.mood('love', 1600);
    ctx.say('sl-spa-done');
    finishButton(ctx, rig, 'facial', () => ({ face: faceSave(face, ['glow']) }));
  },
};
