// 美甲沙龙 — a hand rests on the cushion. Clip the long nails, file them round, paint each one with the
// brush (the polish really goes on stroke by stroke), then put stickers on the nails, rings on the fingers
// and a bracelet on the wrist. Every finger is its own little frame, so things land exactly where they are dropped.
import { pick, el, rand, anim } from '../core.js';
import { shade, R, L, sparkle, nextId } from '../art/base.js';
import { CLIENTS, TOOLS, TIP, nailTable, bottleArt, brushArt, DECALS, decalArt, RINGS, ringArt, BRACELETS, braceletArt } from '../art/salon.js';
import { tray } from './kit.js';
import { toolbox, spray, Paint, svgEl } from './salonkit.js';

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
const POLISH = ['#ff4f7b', '#ff8fc4', '#ff9d2e', '#ffd23f', '#4fc56a', '#3fb4ff', '#9a7bf5', 'glitter'];
const STEPS = ['clip', 'file', 'polish', 'deco'];
const VOICE = { clip: 'nails-clip', file: 'nails-file', polish: 'nails-polish', deco: 'nails-deco' };

export default {
  id: 'nails', name: '美甲沙龙', colors: ['#ffe9f2', '#ffc4dc'], intro: 'nails-intro',
  icon: () => `<svg viewBox="0 0 230 200">${R(40, 112, 112, 120, 44, '#f3c6a2')}${R(42, 46, 24, 100, 12, '#f3c6a2')}${R(70, 26, 24, 120, 12, '#f3c6a2')}${R(98, 32, 24, 120, 12, '#f3c6a2')}${R(126, 54, 22, 100, 11, '#f3c6a2')}` +
    `<g transform="rotate(-50 40 150)">${R(14, 110, 26, 70, 13, '#f3c6a2')}${R(18, 114, 18, 22, 8, '#4fc56a')}</g>` +
    `${R(45, 50, 18, 24, 8, '#ff4f7b')}${R(73, 30, 18, 24, 8, '#ffd23f')}${R(101, 36, 18, 24, 8, '#3fb4ff')}${R(128, 58, 17, 22, 8, '#9a7bf5')}` +
    `${bottleArt('#ff4f7b').replace('<svg ', '<svg x="150" y="92" width="76" height="95" ')}${sparkle(190, 50, 17, '#fff')}${sparkle(24, 60, 10, '#fff')}</svg>`,

  start(ctx) {
    const { W } = ctx;
    const px = Math.round(W * 0.48), py = 536;
    const skin = pick(CLIENTS).skin, dark = shade(skin, -0.13), glitter = nextId();
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
      `<svg class="salon-svg" viewBox="0 0 ${W} 800" width="${W}" height="800"><defs><pattern id="${glitter}" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#ff9ecb"/><circle cx="4" cy="5" r="2.200" fill="#fff"/><circle cx="13" cy="12" r="2.600" fill="#fff36b"/><circle cx="13" cy="3" r="1.300" fill="#fff"/><circle cx="5" cy="14" r="1.500" fill="#fff36b"/></pattern></defs>` +
      `<g class="hand" style="transform-origin:${px}px ${py + 250}px"><g transform="translate(${px} ${py})">${R(-84, 226, 172, 460, 20, skin)}` +
      // the back of the hand: widest at the knuckles, a soft bulge under the thumb, narrowing to the wrist
      `<path d="M-118 -80 L-30 -92 L114 -70 C126 -28 128 60 100 140 C92 164 88 190 88 240 L-84 240 C-84 196 -92 170 -110 150 C-140 116 -134 40 -122 -10Z" fill="${skin}"/>` +
      `<path d="M-121 -58 Q-127 -9 -152 -27 L-162 -17 L-124 26 L-96 30 L-96 -60Z" fill="${skin}"/>` +     // the web between thumb and first finger
      [-94, -30, 34, 94].map((bx, i) => L(`M${bx - 15} ${[-78, -86, -82, -68][i]} q15 -9 30 0`, 3.5, dark)).join('') + `</g>` +
      `<g class="wrist-slot"></g>${fingers.map(fingerMarkup).join('')}</g><g class="fly"></g></svg>` }));
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
    const glint = (f) => { const at = f.mid; ctx.burst(at.x, at.y, { n: 6, shapes: ['star'], colors: ['#fff', '#fff36b', '#ff9ecb'], spread: 80, size: 26, ms: 600 }); };

    const lastTick = {};
    const tick = (name, gap) => { const now = performance.now(); if (now - (lastTick[name] || 0) < gap) return false; lastTick[name] = now; return true; };
    let index = -1, was = null;
    const step = () => STEPS[index];

    /* ---------- clipper and file ---------- */
    const box = toolbox(ctx, (key, pt, dt, tool) => {
      const moved = was ? Math.hypot(pt.x - was.x, pt.y - was.y) : 0;
      was = { x: pt.x, y: pt.y };
      if (key === 'clipper' && step() === 'clip') {
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
    const fillOf = (key) => (key === 'glitter' ? `url(#${glitter})` : key);
    const brush = ctx.sprite(brushArt(), 0, 0, 112, 112, 'paint-cursor');
    brush.el.style.display = 'none';
    ctx.rub((pt) => {
      if (step() !== 'polish') return;
      brush.el.style.display = ''; brush.set(pt.x + 43, pt.y - 43);
      for (const f of fingers) {
        const l = toLocal(f, pt);
        if (Math.abs(l.x) > f.nw / 2 + 13 || l.y < f.y0 - 13 || l.y > f.y0 + f.nh + 16 || f.coat === polish) continue;
        if (f.coat) { f.coat = null; f.coatOf.recoat(); }        // a new colour goes over the old one
        const cover = f.coatOf.dab(l.x, l.y, fillOf(polish));
        if (tick('brush', 120)) ctx.sfx('brush');
        if (cover < 0.8) continue;
        f.coatOf.fill(fillOf(polish)); f.coat = polish; f.shine.style.display = '';
        anim(f.shine, 'fade', 400); glint(f); wiggle(f); ctx.sfx('sparkle');
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
      bottles?.el.remove(); okay?.remove(); brush.el.style.display = 'none';
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
      if (now === 'clip') box.enable('clipper');
      else if (now === 'file') box.enable('file');
      else if (now === 'polish') {
        box.clear();
        bottles = tray(ctx, 130, 420, POLISH.map((k) => ({ key: k, html: bottleArt(k === 'glitter' ? '#ff9ecb' : k, k === 'glitter') })), (item, chip) => {
          polish = item.key; ctx.sfx('bubble'); anim(chip, 'pop', 300);
          brush.el.style.setProperty('--dye', item.key === 'glitter' ? '#ff9ecb' : item.key);
        }, { width: 214, cls: 'nl-polish' });
        bottles.select(polish); brush.el.style.setProperty('--dye', polish);
        anim(bottles.el, 'fade', 300);
      } else if (now === 'deco') decorate();
    }

    ['clipper', 'file'].forEach((k, i) => box.add(k, TOOLS[k], W - 122, 320 + i * 170, 150, k === 'clipper' ? 127 : 100, { tip: [TIP[k][0] * 150, TIP[k][1] * (k === 'clipper' ? 127 : 100)] }));
    next();
  },
};
