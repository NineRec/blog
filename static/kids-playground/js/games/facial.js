// 美容 SPA — a facial, step by step: wash the face with a soapy puff, wipe the foam away, paint on a mask
// (it goes on stroke by stroke), lay cucumber slices on the eyes, steam, take everything off again,
// then dab on cream and rub it in. The customer closes her eyes when something comes near them.
import { pick, el, rand, clamp, anim } from '../core.js';
import { P, R, E, C, L, sparkle, nextId } from '../art/base.js';
import { clientFace, bust, turban, CLIENTS, HEAD, EYES, TOOLS, TIP, spaRoom, foamArt, MASKS, jarArt, maskBrushArt, cucumberArt, plateArt, steamerArt } from '../art/salon.js';
import { tray } from './kit.js';
import { toolbox, spray, Paint, svgEl } from './salonkit.js';

const K = 0.86;
const STEPS = ['wash', 'rinse', 'mask', 'cucumber', 'relax', 'peel', 'cream'];
const VOICE = { wash: 'facial-wash', rinse: 'facial-rinse', mask: 'facial-mask', cucumber: 'facial-cucumber', relax: 'facial-relax', peel: 'facial-peel', cream: 'facial-cream' };
// in face units
const DIRT = [[218, 286, 1], [398, 296, 0.8], [158, 452, 0.9], [440, 446, 1], [300, 424, 0.6], [338, 552, 0.7]];
const CREAM = [[300, 272], [172, 448], [428, 448], [300, 426], [300, 552]];
const HOLES = [[218, 360, 54, 52], [382, 360, 54, 52], [300, 506, 62, 36]];
const BELOW = 'M-20 800 L-20 300 L78 300 C118 244 196 218 300 218 C404 218 482 244 522 300 L620 300 L620 800Z';   // the face under the towel
const blob = (x, y, s) => `<g class="dirt-spot" transform="translate(${x} ${y}) scale(${s})"><path d="M0 -42 C20 -46 42 -28 38 -6 C48 12 34 40 10 38 C-6 50 -36 40 -36 16 C-50 -2 -34 -32 0 -42Z" fill="#8a5a36"/><circle cx="-14" cy="-8" r="8" fill="#a8744a"/><circle cx="14" cy="14" r="6" fill="#a8744a"/></g>`;

let lastWho = null;

export default {
  id: 'facial', name: '美容SPA', colors: ['#dff5ec', '#a9e6cf'], intro: 'facial-intro',
  icon: () => `<svg viewBox="0 0 230 200">${C(115, 24, 26, '#ff8fc4')}${E(115, 70, 84, 58, '#ff9ecb')}${E(115, 122, 64, 68, '#f3c6a2')}${E(115, 126, 56, 58, '#a8dc7a')}` +
    `${P('M40 104 C34 36 196 36 190 104 C166 76 64 76 40 104Z', '#ff9ecb')}${C(89, 116, 20, '#7dbb4e')}${C(89, 116, 15, '#d9f2a8')}${C(141, 116, 20, '#7dbb4e')}${C(141, 116, 15, '#d9f2a8')}` +
    `${E(115, 160, 18, 10, '#f3c6a2')}${L('M106 158 q9 7 18 0', 3.5, '#b8475a')}${sparkle(196, 46, 16, '#fff')}${sparkle(30, 150, 11, '#fff')}</svg>`,

  start(ctx) {
    const { W } = ctx;
    const hx = Math.round(W * 0.47), hy = 404, ox = hx - 300 * K, oy = hy - 339 * K;
    let who = pick(CLIENTS); while (who === lastWho) who = pick(CLIENTS); lastWho = who;
    ctx.scene(spaRoom(W, hx));
    const toFace = (pt) => ({ x: (pt.x - ox) / K, y: (pt.y - oy) / K });
    const toStage = (x, y) => ({ x: ox + x * K, y: oy + y * K });
    const onFace = (f) => ((f.x - 300) / 212) ** 2 + ((f.y - 339) / 232) ** 2 < 1 && f.y > 214 + 82 * ((f.x - 300) / 222) ** 2;

    const clipHead = nextId(), clipBelow = nextId(), holes = nextId();
    const holder = ctx.add(el('div', { class: 'salon-holder', html:
      `<svg class="salon-svg" viewBox="0 0 ${W} 800" width="${W}" height="800"><g class="salon-face" data-eyes="open" data-mouth="smile" transform="translate(${ox.toFixed(1)} ${oy.toFixed(1)}) scale(${K})">` +
      bust(who, 'robe') + clientFace(who) + `<g class="dirt">${DIRT.map(([x, y, s]) => blob(x, y, s)).join('')}</g>` +
      `<clipPath id="${clipHead}"><path d="${HEAD}"/></clipPath><clipPath id="${clipBelow}"><path d="${BELOW}"/></clipPath>` +
      `<mask id="${holes}" maskUnits="userSpaceOnUse" x="-20" y="0" width="640" height="800"><rect x="-20" y="0" width="640" height="800" fill="#fff"/>${HOLES.map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#000"/>`).join('')}<g class="erase"></g></mask>` +
      `<g clip-path="url(#${clipHead})"><g clip-path="url(#${clipBelow})"><g mask="url(#${holes})"><g class="mask-paint"></g></g></g></g>` +
      `<g class="guides"></g><g class="creams"></g><g class="glow"></g>${turban(who)}</g></svg>` }));
    const root = holder.firstElementChild, faceG = root.querySelector('.salon-face'), pupils = [...root.querySelectorAll('.pupil')];
    const dirt = [...root.querySelectorAll('.dirt-spot')].map((node, i) => ({ node, x: DIRT[i][0], y: DIRT[i][1], hp: 1 }));
    const guidesG = root.querySelector('.guides'), creamsG = root.querySelector('.creams'), glowG = root.querySelector('.glow');
    // sample points over the part of the face a mask covers
    const samples = [];
    for (let x = 110; x <= 490; x += 38) for (let y = 244; y <= 552; y += 36) {
      const f = { x, y };
      if (((x - 300) / 196) ** 2 + ((y - 339) / 218) ** 2 < 1 && y > 232 + 82 * ((x - 300) / 222) ** 2 && !HOLES.some(([cx, cy, rx, ry]) => ((x - cx) / (rx + 8)) ** 2 + ((y - cy) / (ry + 8)) ** 2 < 1) && onFace(f)) samples.push([x, y]);
    }
    const mask = new Paint(root.querySelector('.mask-paint'), samples, 34, root.querySelector('.erase'));
    const onSkin = ctx.add(el('div', { class: 'layer' }));

    let moodTimer = 0;
    const mood = (eyes, mouth, ms = 0) => {
      clearTimeout(moodTimer);
      if (eyes) faceG.dataset.eyes = eyes;
      if (mouth) faceG.dataset.mouth = mouth;
      if (ms) moodTimer = ctx.after(ms, () => { faceG.dataset.mouth = 'smile'; if (faceG.dataset.eyes === 'joy') faceG.dataset.eyes = 'open'; });
    };
    const lastTick = {};
    const tick = (name, gap) => { const now = performance.now(); if (now - (lastTick[name] || 0) < gap) return false; lastTick[name] = now; return true; };

    let index = -1, foams = [], flavour = MASKS[0], jars = null, slices = [], plate = null, steamer = null, puffs = 0, dots = [], rubbing = false, finger = null;
    const step = () => STEPS[index];

    /* ---------- puff, towel and cream ---------- */
    const box = toolbox(ctx, (key, pt, dt, tool) => {
      const f = toFace(pt);
      if (key === 'puff' && step() === 'wash') {
        if (!onFace(f)) return;
        mood('shut', 'smile');
        for (const d of dirt) if (d.hp > 0 && Math.hypot(d.x - f.x, d.y - f.y) < 84) { d.hp -= dt * 1.7; d.node.style.opacity = Math.max(0, d.hp); }
        if (tick('foam', 100) && foams.length < 24) {
          const at = { x: pt.x + rand(-34, 34), y: pt.y + rand(-30, 30) };
          if (onFace(toFace(at))) {
            const s = rand(62, 96), puff = ctx.sprite(foamArt(), at.x, at.y, s, s * 0.8, 'foam');
            puff.el.style.pointerEvents = 'none'; puff.el.style.animationDelay = `${-rand(0, 2)}s`; onSkin.append(puff.el); puff.anim('in', 240); foams.push(puff);
            ctx.sfx('bubble'); spray(ctx, pt.x, pt.y, { n: 1, shape: 'bubble', angle: 270, cone: 60, reach: 110, size: 26, ms: 900 });
          }
        }
        if (dirt.every((d) => d.hp <= 0) && foams.length >= 11) next();
      } else if (key === 'towel' && step() === 'rinse') {
        const before = foams.length;
        foams = foams.filter((puff) => {
          if (Math.hypot(puff.cx - pt.x, puff.cy - pt.y) > 86) return true;
          anim(puff.el, 'out', 220, { fill: 'forwards' }).then(() => puff.remove());
          return false;
        });
        if (foams.length < before && tick('wipe', 130)) { ctx.sfx('brush'); spray(ctx, pt.x, pt.y, { n: 2, shape: 'drop', color: '#9fdcff', angle: 90, cone: 60, reach: 60, size: 16, ms: 500, fall: 30 }); }
        if (!foams.length) next();
      } else if (key === 'towel' && step() === 'peel') {
        if (!onFace(f) || mask.cover === 0) return;
        const left = mask.wipe(f.x, f.y, 46);
        if (tick('wipe', 130)) { ctx.sfx('brush'); spray(ctx, pt.x, pt.y, { n: 1, shape: 'dot', color: flavour.col, angle: 90, cone: 80, reach: 50, size: 14, ms: 450, fall: 30 }); }
        if (left <= 0.08) { mask.clear(); ctx.sfx('star'); peeled(); }
      } else if (key === 'cream' && step() === 'cream' && !rubbing) {
        const spot = dots.find((d) => !d.on && Math.hypot(d.at.x - pt.x, d.at.y - pt.y) < 46);
        if (!spot) return;
        spot.on = true; spot.hp = 1; spot.guide.remove();
        spot.node = svgEl('g', { transform: `translate(${spot.x} ${spot.y})` });
        spot.node.innerHTML = `<g class="acc-in"><circle cy="3" r="19" fill="#fff"/><circle cx="-3" cy="-8" r="11" fill="#fff"/><circle cx="-7" cy="-3" r="5" fill="#ffe9f2"/></g>`;
        creamsG.append(spot.node);
        ctx.sfx('squirt'); tool.anim('pop', 200); ctx.note(dots.filter((d) => d.on).length);
        if (dots.every((d) => d.on)) {
          rubbing = true; box.enable();
          ctx.help = () => ctx.say('facial-rub');
          ctx.after(500, () => ctx.say('facial-rub'));
        }
      }
    });

    /* ---------- what a finger does: paint the mask, rub the cream in ---------- */
    const brush = ctx.sprite(maskBrushArt(), 0, 0, 120, 120, 'paint-cursor');
    brush.el.style.display = 'none';
    ctx.rub((pt) => {
      if (box.held) return;
      finger = pt;
      const f = toFace(pt);
      if (step() === 'mask') {
        brush.el.style.display = ''; brush.set(pt.x + 44, pt.y - 44);
        if (!onFace(f) || mask.cover === 1) return;
        const cover = mask.dab(f.x, f.y, flavour.col);
        if (tick('brush', 130)) ctx.sfx('brush');
        if (cover >= 0.88) {
          mask.fill(flavour.col, true);
          ctx.sfx('sparkle'); brush.el.style.display = 'none';
          ctx.after(400, next);
        }
      } else if (step() === 'cream' && rubbing) {
        for (const d of dots) {
          if (d.hp <= 0 || Math.hypot(d.at.x - pt.x, d.at.y - pt.y) > 62) continue;
          d.hp -= 0.09;
          d.node.firstChild.style.transform = `scale(${(1 + (1 - d.hp) * 1.5).toFixed(2)})`; d.node.style.opacity = Math.max(0, d.hp);     // the cream spreads out and sinks in
          if (tick('rub', 140)) ctx.sfx('brush');
          if (d.hp > 0) continue;
          d.node.remove();
          glowG.insertAdjacentHTML('beforeend', sparkle(d.x - 12, d.y - 10, 20, '#fff') + sparkle(d.x + 18, d.y + 12, 11, '#fff'));
          ctx.sfx('star'); ctx.burst(d.at.x, d.at.y, { n: 5, shapes: ['star'], colors: ['#fff', '#fff36b'], spread: 80, size: 26, ms: 600 });
          if (dots.every((n) => n.hp <= 0)) finish();
        }
      }
    }, () => { finger = null; brush.el.style.display = 'none'; });

    /* ---------- the steps ---------- */
    function next() {
      index += 1;
      const now = step();
      ctx.progress(index, STEPS.length);
      if (index > 0) { ctx.sfx('great'); ctx.burst(hx, hy - 60, { n: 10, spread: 260 }); }
      ctx.help = () => ctx.say(VOICE[now]);
      ctx.after(index ? 600 : 2500, () => { if (step() === now) ctx.say(VOICE[now]); });
      if (now === 'wash') box.enable('puff');
      else if (now === 'rinse') box.enable('towel');
      else if (now === 'mask') {
        box.enable(); mood('open', 'happy', 1200);
        for (let i = 0; i < 5; i++) ctx.after(i * 120, () => { const at = toStage(rand(150, 450), rand(260, 520)); spray(ctx, at.x, at.y, { n: 1, shape: 'spark', color: '#fff', cone: 180, reach: 16, size: 40, ms: 700 }); });
        jars = tray(ctx, 130, 560, MASKS.map((m) => ({ key: m.key, html: jarArt(m) })), (item, chip) => {
          flavour = MASKS.find((m) => m.key === item.key); ctx.sfx('pop'); anim(chip, 'pop', 300);
          brush.el.style.setProperty('--dye', flavour.col);
        }, { width: 226, cls: 'spa-jars' });
        jars.select(flavour.key); brush.el.style.setProperty('--dye', flavour.col);
        anim(jars.el, 'fade', 300);
      } else if (now === 'cucumber') {
        anim(jars.el, 'out', 250, { fill: 'forwards' }).then(() => jars.el.remove());
        plate = ctx.sprite(plateArt(), W - 126, 664, 220, 120); plate.el.style.pointerEvents = 'none'; plate.anim('in', 350);
        slices = [-1, 1].map((s) => {
          const slice = ctx.sprite(cucumberArt(), W - 126 + s * 46, 650, 96, 96, 'shadowed pulse');
          slice.anim('in', 350);
          return ctx.drag(slice, { enabled: () => step() === 'cucumber' && !slice.eye, end: () => {
            const eye = EYES.map(([x, y], i) => ({ i, at: toStage(x, y) })).filter((e) => !slices.some((n) => n.eye === e.i + 1)).find((e) => Math.hypot(e.at.x - slice.cx, e.at.y - slice.cy) < 90);
            if (!eye) { ctx.sfx('drop'); slice.goHome(); return; }
            slice.eye = eye.i + 1; slice.el.classList.remove('pulse', 'shadowed');
            slice.glide(eye.at.x, eye.at.y, 200); ctx.sfx('pop'); mood('shut', 'smile'); ctx.note(slices.filter((n) => n.eye).length * 2);
            if (slices.every((n) => n.eye)) ctx.after(500, next);
          } });
        });
      } else if (now === 'relax') {
        steamer = ctx.sprite(steamerArt(), 128, 540, 190, 266, 'pulse');
        steamer.anim('in', 400);
        steamer.tap(() => {
          if (step() !== 'relax' || !tick('steam', 650) || puffs >= 3) return;
          steamer.el.querySelectorAll('.lamp')[puffs].setAttribute('fill', '#ffd23f');
          puffs += 1;
          ctx.sfx('steam'); ctx.note(puffs * 2); steamer.anim('pop', 300);
          const from = { x: steamer.cx + 85, y: steamer.cy - 110 }, a = Math.atan2(hy - 30 - from.y, hx - from.x) * 180 / Math.PI;
          for (let i = 0; i < 5; i++) ctx.after(i * 150, () => spray(ctx, from.x, from.y, { n: 3, shape: 'puff', color: '#fff', angle: a, cone: 16, reach: Math.hypot(hx - from.x, hy - from.y) * 1.1, size: 76, ms: 1700, opacity: 0.8, grow: 2 }));
          mood('shut', 'happy', 1500);
          if (puffs === 3) { steamer.el.classList.remove('pulse'); ctx.after(1700, next); }
        });
      } else if (now === 'peel') {
        anim(steamer.el, 'out', 250, { fill: 'forwards' }).then(() => steamer.remove());
        box.enable('towel');
        // the slices come off with a tap and fly back to the plate
        for (const slice of slices) {
          slice.el.classList.add('pulse');
          slice.tap(() => {
            if (!slice.eye || step() !== 'peel') return;
            slice.eye = 0; slice.el.classList.remove('pulse');
            ctx.sfx('pop'); slice.goHome(350).then(() => slice.el.classList.add('shadowed'));
            if (slices.every((n) => !n.eye)) mood('open', 'smile');
            peeled();
          });
        }
      } else if (now === 'cream') {
        anim(plate.el, 'out', 250, { fill: 'forwards' }).then(() => plate.remove()); slices.forEach((n) => anim(n.el, 'out', 250, { fill: 'forwards' }).then(() => n.remove()));
        box.enable('cream'); mood('open', 'happy', 1200);
        dots = CREAM.map(([x, y]) => {
          const guide = svgEl('circle', { class: 'guide', cx: x, cy: y, r: 24, fill: 'none', stroke: '#ff6fa8', 'stroke-width': 5, 'stroke-dasharray': '4 12', 'stroke-linecap': 'round' });
          guidesG.append(guide);
          return { x, y, at: toStage(x, y), on: false, hp: 1, guide };
        });
      }
    }
    function peeled() { if (step() === 'peel' && mask.cover === 0 && slices.every((n) => !n.eye)) ctx.after(350, () => { if (step() === 'peel') next(); }); }

    function finish() {
      ctx.progress(STEPS.length, STEPS.length);
      box.clear();
      mood('joy', 'happy');
      root.querySelectorAll('.cheek').forEach((n) => n.setAttribute('opacity', '.75'));
      anim(holder, 'jump', 700);
      ctx.sfx('great');
      ctx.burst(hx, hy - 20, { n: 24, shapes: ['heart', 'star'], spread: 400, size: 44 });
      ctx.win({ voice: 'facial-done', delay: 1500 });
    }

    // her eyes follow the tool or the finger
    const look = { x: 0, y: 0 };
    ctx.loop((dt) => {
      const at = box.held ? box.held.point() : finger;
      const tx = at ? clamp((at.x - hx) / 44, -8, 8) : 0, ty = at ? clamp((at.y - (hy + 20)) / 44, -11, 5) : 0;
      look.x += (tx - look.x) * Math.min(1, dt * 8); look.y += (ty - look.y) * Math.min(1, dt * 8);
      for (const node of pupils) node.style.transform = `translate(${look.x.toFixed(1)}px, ${look.y.toFixed(1)}px)`;
    });

    ['puff', 'towel', 'cream'].forEach((k, i) => box.add(k, TOOLS[k], W - 126, 196 + i * 144, 124, k === 'towel' ? 114 : 124, { tip: [TIP[k][0] * 124, TIP[k][1] * 124] }));
    next();
  },
};
