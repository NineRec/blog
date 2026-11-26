// 美甲沙龙 — a hand rests on the cushion. Scrub the mud and the germs off and rinse it, clip the long nails, file them round, paint each one with the
// brush (the polish really goes on stroke by stroke), then put stickers on the nails, rings on the fingers
// and a bracelet on the wrist. Every finger is its own little frame, so things land exactly where they are dropped.
import { pick, el, rand, anim } from '../core.js';
import { shade, R, L, sparkle, nextId } from '../art/base.js';
import { TOOLS, TIP, nailTable, bottleArt, brushArt, DECALS, decalArt, RINGS, ringArt, BRACELETS, braceletArt, germArt, mudArt, foamArt } from '../art/salon.js';
import { client } from '../salon.js';
import { tray } from './kit.js';
import { toolbox, spray, Paint, svgEl, pointer } from './salonkit.js';

// where each finger starts on the hand (from the middle of the palm), how it leans, how long and wide it is
const FINGERS = [
  { bx: -112, by: 70, ang: -40, len: 168, w: 72 },     // thumb, out to the side
  { bx: -94, by: -96, ang: -7, len: 228, w: 62 },
  { bx: -30, by: -104, ang: -2, len: 256, w: 64 },
  { bx: 34, by: -100, ang: 4, len: 236, w: 62 },
  { bx: 94, by: -84, ang: 11, len: 186, w: 56 },
];
const TAPER = 0.84;     // a fingertip is a little narrower than the base of the finger
/** A long slim finger: a soft swell at the middle joint, then narrowing to a round tip. */
const fingerShape = (w, l) => { const t = w * TAPER / 2;
  return `M${-w / 2} 46 C${-w / 2} ${-l * 0.2} ${-w * 0.45} ${-l * 0.3} ${-w * 0.47} ${-l * 0.47} C${-w * 0.49} ${-l * 0.6} ${-t} ${-l * 0.72} ${-t} ${-l + t} A${t} ${t} 0 0 1 ${t} ${-l + t} C${t} ${-l * 0.72} ${w * 0.49} ${-l * 0.6} ${w * 0.47} ${-l * 0.47} C${w * 0.45} ${-l * 0.3} ${w / 2} ${-l * 0.2} ${w / 2} 46Z`; };
const POLISH = ['#ff4f7b', '#ff8fc4', '#ff9d2e', '#ffd23f', '#4fc56a', '#3fb4ff', '#9a7bf5', 'glitter', 'rainbow'];
const RAINBOW = ['#ff5a6e', '#ff9d2e', '#ffd23f', '#4fc56a', '#3fb4ff', '#9a7bf5'];
const STEPS = ['wash', 'rinse', 'clip', 'file', 'polish', 'deco'];
// mud and germs on the hand, from the middle of the palm: [x, y, size]
const MUD = [[-30, 60, 1.5], [52, 150, 1.2], [-98, -210, 0.8], [-34, -250, 0.8], [40, -230, 0.8], [106, -160, 0.7], [-150, 20, 0.8]];
const GERMS = [[30, -10, '#7ed957'], [-66, 130, '#c4adff'], [70, 70, '#ffd447']];
const ZOOM = 2.1;
const VOICE = { wash: 'nails-wash', rinse: 'spa-shower', clip: 'nails-clip', file: 'nails-file', polish: 'nails-polish', deco: 'nails-deco' };

export default {
  id: 'nails', name: '美甲沙龙', colors: ['#ffe9f2', '#ffc4dc'], intro: 'nails-intro',
  icon: () => `<svg viewBox="0 0 230 200">${R(40, 112, 112, 120, 44, '#f3c6a2')}${R(42, 46, 24, 100, 12, '#f3c6a2')}${R(70, 26, 24, 120, 12, '#f3c6a2')}${R(98, 32, 24, 120, 12, '#f3c6a2')}${R(126, 54, 22, 100, 11, '#f3c6a2')}` +
    `<g transform="rotate(-50 40 150)">${R(14, 110, 26, 70, 13, '#f3c6a2')}${R(18, 114, 18, 22, 8, '#4fc56a')}</g>` +
    `${R(45, 50, 18, 24, 8, '#ff4f7b')}${R(73, 30, 18, 24, 8, '#ffd23f')}${R(101, 36, 18, 24, 8, '#3fb4ff')}${R(128, 58, 17, 22, 8, '#9a7bf5')}` +
    `${bottleArt('#ff4f7b').replace('<svg ', '<svg x="150" y="92" width="76" height="95" ')}${sparkle(190, 50, 17, '#fff')}${sparkle(24, 60, 10, '#fff')}</svg>`,

  start(ctx) {
    const { W } = ctx;
    const root0 = (h) => h.firstElementChild;
    const px = Math.round(W * 0.48), py = 536;
    const skin = client().skin, dark = shade(skin, -0.13), glitter = nextId(), rainbow = nextId();
    ctx.scene(nailTable(W, px));

    const fingers = FINGERS.map((f, i) => {
      const a = f.ang * Math.PI / 180, nw = f.w * 0.74, nh = f.w, y0 = -f.len + f.w * 0.1;       // big nails: easy to paint
      return { ...f, i, X: px + f.bx, Y: py + f.by, cos: Math.cos(a), sin: Math.sin(a), nw, nh, y0, state: 'long', filed: 0, clip: nextId() };
    });
    const toLocal = (f, pt) => { const dx = pt.x - f.X, dy = pt.y - f.Y; return { x: dx * f.cos + dy * f.sin, y: -dx * f.sin + dy * f.cos }; };
    const toStage = (f, x, y) => ({ x: f.X + x * f.cos - y * f.sin, y: f.Y + x * f.sin + y * f.cos });
    const plate = (f) => { const { nw: w, nh: h, y0 } = f; return `M${-w / 2} ${y0 + h} V${y0 + w * 0.45} Q${-w / 2} ${y0} 0 ${y0} Q${w / 2} ${y0} ${w / 2} ${y0 + w * 0.45} V${y0 + h} Q0 ${y0 + h + w * 0.28} ${-w / 2} ${y0 + h}Z`; };
    const fingerMarkup = (f) => {
      const { nw: w, nh: h, y0, len } = f;
      return `<g transform="translate(${f.X} ${f.Y}) rotate(${f.ang})"><g class="finger" data-finger="${f.i}" style="animation-delay:${-f.i * 0.7}s">` +
        `<path d="${fingerShape(f.w, len)}" fill="${skin}"/>` + L(`M${-f.w * 0.24} ${-len * 0.44} q${f.w * 0.24} 9 ${f.w * 0.48} 0 M${-f.w * 0.2} ${-len * 0.44 + 12} q${f.w * 0.2} 7 ${f.w * 0.4} 0`, 3.5, dark) +
        `<g class="ring-slot"></g>` +
        // grown far too long, with a ragged end
        `<path class="over" d="M${-w / 2} ${y0 + w * 0.5} L${-w / 2} ${y0 - 14} L${-w * 0.22} ${y0 - 34} L0 ${y0 - 20} L${w * 0.24} ${y0 - 38} L${w / 2} ${y0 - 12} L${w / 2} ${y0 + w * 0.5}Z" fill="#fff3ea"/>` +
        // after clipping: a short rough edge that the file takes off
        `<path class="rough" style="display:none" d="M${-w * 0.42} ${y0 + 14} L${-w * 0.42} ${y0 + 2} L${-w * 0.28} ${y0 - 9} L${-w * 0.14} ${y0 - 1} L0 ${y0 - 11} L${w * 0.14} ${y0 - 2} L${w * 0.28} ${y0 - 10} L${w * 0.42} ${y0 + 2} L${w * 0.42} ${y0 + 14}Z" fill="#fff3ea"/>` +
        `<path class="plate" d="${plate(f)}" fill="#ffd9d2"/><ellipse cx="0" cy="${y0 + h - 2}" rx="${w * 0.3}" ry="${w * 0.16}" fill="#ffece8"/>` + L(`M${-w * 0.34} ${y0 + w * 0.24} Q0 ${y0 + 1} ${w * 0.34} ${y0 + w * 0.24}`, 5, '#fff') +
        `<clipPath id="${f.clip}"><path d="${plate(f)}"/></clipPath><g clip-path="url(#${f.clip})"><g class="paint"></g></g>` +
        `<path class="shine" style="display:none" d="M${-w * 0.24} ${y0 + h * 0.24} v${h * 0.42}" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".6"/>` +
        `<g class="decal"></g></g></g>`;
    };
    const holder = ctx.add(el('div', { class: 'salon-holder', html:
      `<svg class="salon-svg" viewBox="0 0 ${W} 800" width="${W}" height="800"><defs><pattern id="${glitter}" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#ff9ecb"/><circle cx="4" cy="5" r="2.200" fill="#fff"/><circle cx="13" cy="12" r="2.600" fill="#fff36b"/><circle cx="13" cy="3" r="1.300" fill="#fff"/><circle cx="5" cy="14" r="1.500" fill="#fff36b"/></pattern>` +
      `<linearGradient id="${rainbow}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="78" spreadMethod="repeat">${RAINBOW.map((col, i) => `<stop offset="${(i / 6).toFixed(3)}" stop-color="${col}"/><stop offset="${((i + 1) / 6).toFixed(3)}" stop-color="${col}"/>`).join('')}</linearGradient></defs>` +
      `<g class="zoomer"><g class="hand" style="transform-origin:${px}px ${py + 250}px"><g transform="translate(${px} ${py})">${R(-84, 226, 172, 460, 20, skin)}` +
      // the back of the hand: widest at the knuckles, a soft bulge under the thumb, narrowing to the wrist
      `<path d="M-118 -80 L-30 -92 L114 -70 C126 -28 128 60 100 140 C92 164 88 190 88 240 L-84 240 C-84 196 -92 170 -110 150 C-140 116 -134 40 -122 -10Z" fill="${skin}"/>` +
      `<path d="M-121 -58 Q-127 -9 -152 -27 L-162 -17 L-124 26 L-96 30 L-96 -60Z" fill="${skin}"/>` +     // the web between thumb and first finger
      [-94, -30, 34, 94].map((bx, i) => L(`M${bx - 15} ${[-78, -86, -82, -68][i]} q15 -9 30 0`, 3.5, dark)).join('') + `</g>` +
      `<g class="wrist-slot"></g>${fingers.map(fingerMarkup).join('')}` +
      `<g class="grime">${MUD.map(([x, y, k], i) => `<g class="mud" data-i="${i}" transform="translate(${px + x} ${py + y})">${mudArt(k)}</g>`).join('')}${GERMS.map(([x, y, col], i) => `<g transform="translate(${px + x} ${py + y})"><g class="germ" data-i="${i}" style="animation-delay:${-i * 0.4}s">${germArt(col)}</g></g>`).join('')}</g>` +
      `</g></g><g class="fly"></g></svg>` }));
    const zoomer = root0(holder).querySelector('.zoomer');
    const onHand = ctx.add(el('div', { class: 'layer' }));       // soap foam sits on the hand
    const root = holder.firstElementChild, hand = root.querySelector('.hand'), flyG = root.querySelector('.fly'), wristG = root.querySelector('.wrist-slot');
    for (const f of fingers) {
      f.g = root.querySelector(`[data-finger="${f.i}"]`);
      for (const k of ['over', 'rough', 'paint', 'shine', 'decal', 'ring-slot']) f[k] = f.g.querySelector(`.${k}`);
      const pts = [];
      for (const fx of [-0.32, -0.11, 0.11, 0.32]) for (const fy of [0.14, 0.32, 0.5, 0.68, 0.86]) pts.push([fx * f.nw, f.y0 + fy * f.nh]);
      f.coatOf = new Paint(f.paint, pts, 14);
      f.edge = toStage(f, 0, f.y0 - 6);
      f.mid = toStage(f, 0, f.y0 + f.nh / 2);
    }
    const wiggle = (f) => f.g.animate([0, -6, 6, -4, 3, 0].map((r) => ({ transform: `rotate(${r}deg)` })), { duration: 520, easing: 'ease-in-out' });
    /* ---------- zooming in on one nail ---------- */
    const zoom = { s: 1, tx: 0, ty: 0, f: null };
    let ring = null, zoomOut = null, skip = false;
    const unzoom = (pt) => ({ x: (pt.x - zoom.tx) / zoom.s, y: (pt.y - zoom.ty) / zoom.s });
    const zoomed = (pt) => ({ x: pt.x * zoom.s + zoom.tx, y: pt.y * zoom.s + zoom.ty });
    function zoomTo(f) {
      if (zoom.f === f) return;
      zoom.f = f; zoom.s = f ? ZOOM : 1;
      zoom.tx = f ? px - f.mid.x * ZOOM : 0; zoom.ty = f ? 390 - f.mid.y * ZOOM : 0;
      zoomer.style.transform = `translate(${zoom.tx.toFixed(1)}px, ${zoom.ty.toFixed(1)}px) scale(${zoom.s})`;
      ring?.remove(); ring = null; zoomOut?.remove(); zoomOut = null;
      ctx.sfx(f ? 'slide' : 'whoosh');
      if (!f) return;
      ring = el('div', { class: 'zoom-ring', style: { left: `${px - 170}px`, top: '220px', width: '340px', height: '340px' } });
      holder.after(ring);
      zoomOut = ctx.button('back', 96, 706, 'blue', '看整只手', () => zoomTo(null));
    }
    const glint = (f) => { const at = zoomed(f.mid); ctx.burst(at.x, at.y, { n: 6, shapes: ['star'], colors: ['#fff', '#fff36b', '#ff9ecb'], spread: 80, size: 26, ms: 600 }); };

    const lastTick = {};
    const tick = (name, gap) => { const now = performance.now(); if (now - (lastTick[name] || 0) < gap) return false; lastTick[name] = now; return true; };
    let index = -1, was = null, foams = [], washed = false, rinsed = false;
    const step = () => STEPS[index];
    const grime = [...MUD.map(([x, y], i) => ({ x: px + x, y: py + y, hp: 1, germ: false, node: root.querySelector(`.mud[data-i="${i}"]`) })),
      ...GERMS.map(([x, y], i) => ({ x: px + x, y: py + y, hp: 1, germ: true, node: root.querySelector(`.germ[data-i="${i}"]`) }))];

    /* ---------- clipper and file ---------- */
    const box = toolbox(ctx, (key, pt, dt, tool) => {
      const moved = was ? Math.hypot(pt.x - was.x, pt.y - was.y) : 0;
      was = { x: pt.x, y: pt.y };
      if (key === 'sponge' && step() === 'wash') {
        if (Math.abs(pt.x - px) > 230 || pt.y < py - 330 || pt.y > py + 300) return;
        for (const g of grime) {
          if (g.hp <= 0 || Math.hypot(g.x - pt.x, g.y - pt.y) > (g.germ ? 78 : 70)) continue;
          g.hp -= moved / (g.germ ? 300 : 240);
          if (!g.germ) g.node.style.opacity = Math.max(0, g.hp).toFixed(2);
          else if (g.hp > 0 && tick('eek', 260)) { ctx.sfx('squeak'); g.node.animate([0, -14, 14, -9, 9, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 300 }); }
          if (g.hp > 0) continue;
          if (g.germ) {       // off it runs
            const dir = g.x < px ? -1 : 1;
            g.node.style.animation = 'none';
            g.node.animate([{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: 'translate(0, -40px) scale(1.25)', opacity: 1, offset: 0.25 }, { transform: `translate(${dir * 520}px, -160px) scale(.5) rotate(${dir * 300}deg)`, opacity: 0 }], { duration: 800, easing: 'ease-in', fill: 'forwards' });
            ctx.sfx('pop'); ctx.note(grime.filter((n) => n.germ && n.hp <= 0).length * 2 + 2);
            spray(ctx, g.x, g.y, { n: 6, shape: 'bubble', angle: 270, cone: 180, reach: 90, size: 26, ms: 700 });
          } else g.node.remove();
        }
        if (moved > 1 && tick('foam', 90) && foams.length < 26) {
          const k = rand(56, 92), f = ctx.sprite(foamArt(), pt.x + rand(-24, 24), pt.y + rand(-20, 20), k, k * 0.8, 'foam');
          f.el.style.pointerEvents = 'none'; f.el.style.animationDelay = `${-rand(0, 2)}s`; onHand.append(f.el); f.anim('in', 240); foams.push(f);
          ctx.sfx('bubble');
        }
        if (grime.every((g) => g.hp <= 0) && !washed) { washed = true; ctx.after(350, next); }
      } else if (key === 'shower' && step() === 'rinse') {
        if (tick('water', 45)) spray(ctx, pt.x + rand(-40, 40), pt.y + 4, { n: 2, shape: 'streak', color: ['#8fd6ff', '#bfe8ff'], angle: 90, cone: 3, reach: 330, size: 24, ms: 430, grow: 1 });
        if (tick('water-sound', 200)) ctx.sfx('water');
        foams = foams.filter((f) => {
          if (Math.abs(f.cx - pt.x) > 90 || f.cy < pt.y) return true;
          f.el.animate([{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: 'translateY(130px) scale(.6)', opacity: 0 }], { duration: 520, easing: 'ease-in', fill: 'forwards' });
          ctx.after(520, () => f.remove());
          return false;
        });
        if (!foams.length && !rinsed) { rinsed = true; hand.animate([0, -5, 5, -4, 4, 0].map((r) => ({ transform: `rotate(${r}deg)` })), { duration: 700, easing: 'ease-in-out' }); ctx.after(450, next); }    // the clean hand shakes the drops off
      } else if (key === 'clipper' && step() === 'clip') {
        const f = fingers.find((n) => n.state === 'long' && Math.hypot(n.edge.x - pt.x, n.edge.y - pt.y) < 46);
        if (!f || !tick('clip', 320)) return;
        f.state = 'rough';
        // the long end flies off and drops
        const piece = svgEl('g');
        piece.innerHTML = `<g transform="translate(${f.X} ${f.Y}) rotate(${f.ang})"></g>`;
        piece.firstChild.append(f.over); flyG.append(piece);
        piece.style.transformBox = 'fill-box'; piece.style.transformOrigin = 'center';
        const dir = rand(-1, 1);
        piece.animate([{ transform: 'translate(0, 0) rotate(0)', opacity: 1 }, { transform: `translate(${dir * 60}px, -90px) rotate(${dir * 200}deg)`, opacity: 1, offset: 0.35, easing: 'ease-in' }, { transform: `translate(${dir * 150}px, 420px) rotate(${dir * 620}deg)`, opacity: 0 }],
          { duration: 950, easing: 'ease-out' }).finished.then(() => piece.remove(), () => piece.remove());
        f.rough.style.display = '';
        ctx.sfx('snip'); tool.anim('pop', 200); wiggle(f);
        ctx.note(fingers.filter((n) => n.state !== 'long').length);
        if (fingers.every((n) => n.state !== 'long')) ctx.after(500, next);
      } else if (key === 'file' && step() === 'file') {
        const f = fingers.find((n) => n.state === 'rough' && Math.hypot(n.edge.x - pt.x, n.edge.y - pt.y) < 54);
        if (!f || moved < 0.5) return;
        f.filed = Math.min(1, f.filed + moved / 340);
        f.rough.style.transform = `translateY(${(f.filed * 17).toFixed(1)}px)`;      // the ragged edge is worn down
        if (tick('file', 80)) { ctx.sfx('file'); spray(ctx, f.edge.x, f.edge.y, { n: 2, shape: 'dot', color: ['#fff3ea', '#ffe0d0'], angle: 90, cone: 70, reach: 50, size: 9, ms: 500, fall: 40 }); }
        if (f.filed < 1) return;
        f.state = 'smooth'; f.rough.style.display = 'none';
        ctx.sfx('star'); glint(f); wiggle(f);
        if (fingers.every((n) => n.state === 'smooth')) ctx.after(500, next);
      }
    });
    box.onDrop = () => { was = null; };

    /* ---------- polish: pick a bottle, paint with the brush ---------- */
    let polish = POLISH[0], bottles = null, okay = null, coated = 0;
    const fillOf = (key) => (key === 'glitter' ? `url(#${glitter})` : key === 'rainbow' ? `url(#${rainbow})` : key);
    const brush = ctx.sprite(brushArt(), 0, 0, 112, 112, 'paint-cursor');
    brush.el.style.display = 'none';
    const nailAt = (q, slack) => fingers.find((f) => { const l = toLocal(f, q); return Math.abs(l.x) < f.nw / 2 + slack && l.y > f.y0 - slack && l.y < f.y0 + f.nh + slack; });
    ctx.rub((pt, ev, first) => {
      if (step() !== 'polish') return;
      if (first) {       // a tap on a nail brings it up close; a tap beside it goes back to the whole hand
        skip = false;
        const hit = nailAt(unzoom(pt), 16);
        if (zoom.f ? !hit : !!hit) { zoomTo(zoom.f ? null : hit); skip = true; }
      }
      if (skip) return;
      brush.el.style.display = ''; brush.set(pt.x + 43, pt.y - 43);
      const q = unzoom(pt);
      for (const f of fingers) {
        const l = toLocal(f, q);
        if (Math.abs(l.x) > f.nw / 2 + 13 || l.y < f.y0 - 13 || l.y > f.y0 + f.nh + 16 || f.coat === polish) continue;
        if (f.coat) { f.coat = null; f.coatOf.recoat(); }        // a new colour goes over the old one
        const cover = f.coatOf.dab(l.x, l.y, fillOf(polish));
        if (tick('brush', 120)) ctx.sfx('brush');
        if (cover < 0.8) continue;
        f.coatOf.fill(fillOf(polish)); f.coat = polish; f.shine.style.display = '';
        anim(f.shine, 'fade', 400); glint(f); wiggle(f); ctx.sfx('sparkle');
        if (zoom.f === f) ctx.after(900, () => { if (zoom.f === f) zoomTo(null); });
        if (f.done) continue;
        f.done = true; ctx.note(++coated);
        if (coated === fingers.length) {
          ctx.say('good-2');
          okay = ctx.button('check', W - 132, 706, 'green pulse', '涂好了', () => next());
        }
      }
    }, () => { brush.el.style.display = 'none'; });

    /* ---------- stickers, rings and bracelets: drag them where they go ---------- */
    function decorate() {
      bottles?.el.remove(); okay?.remove(); brush.el.style.display = 'none'; zoomTo(null);
      const panelL = ctx.add(el('div', { class: 'tray nl-panel', style: { left: '26px', top: '176px', width: '208px', height: '318px' } }));
      const panelR = ctx.add(el('div', { class: 'tray nl-panel', style: { left: `${W - 236}px`, top: '150px', width: '208px', height: '478px' } }));
      anim(panelL, 'fade', 300); anim(panelR, 'fade', 300);
      const piece = (kind, key, html, cx, cy, w, h) => {
        const s = ctx.sprite(html, cx, cy, w, h, 'shadowed');
        s.anim('in', 350);
        ctx.drag(s, { end: () => {
          if (drop(kind, key, s.cx, s.cy)) { s.set(s.home.cx, s.home.cy); s.anim('in', 300); }   // a new one appears on the tray
          else { ctx.sfx('drop'); s.goHome(); }
        } });
      };
      Object.keys(DECALS).forEach((k, i) => piece('decal', k, decalArt(k), 84 + (i % 2) * 92, 236 + Math.floor(i / 2) * 98, 74, 74));
      Object.keys(RINGS).forEach((k, i) => piece('ring', k, ringArt(k), W - 132, 212 + i * 92, 108, 76));
      Object.keys(BRACELETS).forEach((k, i) => piece('bracelet', k, braceletArt(k), W - 132, 482 + i * 88, 150, 75));
      ctx.button('camera', W - 132, 706, 'pink', '拍照', async () => {
        ctx.sfx('camera');
        const flash = ctx.add(el('div', { class: 'flash' }));
        await ctx.sleep(450); flash.remove();
        ctx.progress(STEPS.length, STEPS.length);
        hand.animate([0, -7, 7, -6, 6, -3, 0].map((r) => ({ transform: `rotate(${r}deg)` })), { duration: 1300, easing: 'ease-in-out' });    // the hand waves
        fingers.forEach((f, i) => ctx.after(i * 130, () => { glint(f); ctx.note(i + 3); }));
        ctx.win({ voice: 'nails-done', delay: 1500 });
      });
    }
    function drop(kind, key, x, y) {
      if (kind === 'decal') {
        const f = fingers.map((n) => ({ n, d: Math.hypot(n.mid.x - x, n.mid.y - y) })).sort((a, b) => a.d - b.d)[0];
        if (f.d > 62) return false;
        f.n.decal.innerHTML = `<g transform="translate(0 ${(f.n.y0 + f.n.nh * 0.52).toFixed(1)}) scale(${(f.n.nw / 42).toFixed(2)})"><g class="acc-in">${DECALS[key]}</g></g>`;
        ctx.sfx('sparkle'); glint(f.n); wiggle(f.n);
        return true;
      }
      if (kind === 'ring') {
        const f = fingers.map((n) => ({ n, l: toLocal(n, { x, y }) })).filter(({ n, l }) => Math.abs(l.x) < n.w / 2 + 30 && l.y > -n.len && l.y < 24).sort((a, b) => Math.abs(a.l.x) - Math.abs(b.l.x))[0];
        if (!f) return false;
        f.n['ring-slot'].innerHTML = `<g transform="translate(0 ${(-f.n.len * 0.29).toFixed(1)})"><g class="ring-on">${RINGS[key](f.n.w)}</g></g>`;    // it slides down the finger
        ctx.sfx('slide'); ctx.after(380, () => { ctx.sfx('sparkle'); const at = toStage(f.n, 0, -f.n.len * 0.29); ctx.burst(at.x, at.y, { n: 6, shapes: ['star'], colors: ['#fff', '#fff36b'], spread: 70, size: 24, ms: 600 }); });
        return true;
      }
      if (y < py + 90 || Math.abs(x - px) > 190) return false;
      wristG.innerHTML = `<g transform="translate(${px + 2} ${py + 206})"><g class="acc-in">${BRACELETS[key](186)}</g></g>`;
      ctx.sfx('sparkle'); ctx.burst(px, py + 206, { n: 8, shapes: ['star', 'heart'], spread: 150, size: 28 });
      return true;
    }

    function next() {
      index += 1;
      const now = step();
      ctx.progress(index, STEPS.length);
      if (index > 0) { ctx.sfx('great'); ctx.burst(px, py - 160, { n: 10, spread: 260 }); }
      ctx.help = () => ctx.say(VOICE[now]);
      ctx.after(index ? 600 : 2500, () => { if (step() === now) ctx.say(VOICE[now]); });
      if (now === 'wash') { box.enable('sponge'); hint('sponge', [[-20, 40], [60, 150], [-90, -160], [40, -200], [-40, 80]]); }
      else if (now === 'rinse') { box.enable('shower'); hint('shower', [[-90, -330], [90, -330]]); }
      else if (now === 'clip') { box.remove('sponge'); box.remove('shower'); box.enable('clipper'); hint('clipper', [[fingers[2].edge.x - px, fingers[2].edge.y - py]]); }
      else if (now === 'file') box.enable('file');
      else if (now === 'polish') {
        box.clear();
        bottles = tray(ctx, 124, 400, POLISH.map((k) => ({ key: k, html: bottleArt(k === 'glitter' ? '#ff9ecb' : fillOf(k), k === 'glitter') })), (item, chip) => {
          polish = item.key; ctx.sfx('bubble'); anim(chip, 'pop', 300);
          brush.el.style.setProperty('--dye', item.key === 'glitter' ? '#ff9ecb' : item.key === 'rainbow' ? '#ff9d2e' : item.key);
        }, { width: 214, cls: 'nl-polish' });
        ctx.after(700, () => { if (step() === 'polish' && !zoom.f) stopHint = pointer(ctx, [fingers[2].mid, fingers[2].mid], { ms: 900 }); });      // tap a nail to see it up close
        bottles.select(polish); brush.el.style.setProperty('--dye', polish);
        anim(bottles.el, 'fade', 300);
      } else if (now === 'deco') decorate();
    }

    let stopHint = null;
    /** Show how the tool that is next moves over the hand (points are from the middle of the palm). */
    function hint(key, pts) { stopHint?.(); const t = box.tools.get(key); stopHint = pointer(ctx, [{ x: t.cx, y: t.cy }, ...pts.map(([x, y]) => ({ x: px + x, y: py + y }))]); }
    ['sponge', 'shower', 'clipper', 'file'].forEach((k, i) => { const h = k === 'clipper' ? 110 : k === 'file' ? 90 : 116, w = k === 'sponge' || k === 'shower' ? 116 : 136;
      box.add(k, TOOLS[k], W - 114, 150 + i * 142, w, h, { tip: [TIP[k][0] * w, TIP[k][1] * h] }); });
    next();
  },
};
