// 美发沙龙 — wash the hair (shampoo, lather, rinse), blow it dry and comb it, then be the hairdresser:
// cut, grow, curl, straighten and colour it, and finish with something pretty.
// The hair is made of strands. They hang and sway, go dark and limp when wet, fly in the dryer's wind,
// and can be cut anywhere along their length — so every tool does to the hair what it does in real life.
import { pick, el, rand, clamp, anim } from '../core.js';
import { shade, P, R, E, C, L, c, p, starPath, heartPath, sparkle, nextId } from '../art/base.js';
import { clientFace, bust, CLIENTS, HEAD, TOOLS, TIP, hairRoom, foamArt, dollopArt } from '../art/salon.js';
import { tray } from './kit.js';
import { toolbox, spray, svgEl } from './salonkit.js';

const K = 0.68;                 // the face is drawn in a 600×730 box and shown at this size
const A = 141, B = 156;         // half the width and height of the head on the stage
const SEG = 20;                 // a strand is a chain of points this far apart
const END_L = -Math.PI + 0.1, END_R = -0.1;   // where the hair leaves the head and hangs (just above the ears)
const DYES = ['#2b2529', '#8a5a36', '#f2c14e', '#ff6fa8', '#9a7bf5', '#3fb4ff', '#4fc56a', 'rainbow'];
const RAINBOW = ['#ff5a6e', '#ff9d2e', '#ffd23f', '#4fc56a', '#3fb4ff', '#9a7bf5'];
const RAINBOW_CSS = `linear-gradient(${RAINBOW.join(',')})`;
const CAPES = ['#7fd3ff', '#9be27a', '#ffb347', '#c4adff'];
const STEPS = ['shampoo', 'lather', 'rinse', 'dry', 'comb', 'style', 'deco'];
const VOICE = { shampoo: 'hair-shampoo', lather: 'hair-lather', rinse: 'hair-rinse', dry: 'hair-dry', comb: 'hair-comb', style: 'hair-style', deco: 'hair-deco' };
const TOOL_VOICE = { scissors: 'hair-snip', potion: 'hair-grow', curler: 'hair-curl', iron: 'hair-straight', spray: 'hair-color' };

// everything above the hairline is hair (in face units)
const CAP = 'M20 310 L20 20 L580 20 L580 310 C520 220 400 196 300 196 C200 196 80 220 20 310Z';

const bowAt = (x, y, col, s, dark) => `<g transform="translate(${x} ${y}) scale(${s})">${P('M0 0 C-30 -46 -84 -44 -78 0 C-84 44 -30 46 0 0Z', col)}${P('M0 0 C30 -46 84 -44 78 0 C84 44 30 46 0 0Z', col)}${R(-17, -20, 34, 40, 12, dark)}</g>`;
const flowerAt = (x, y, col, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-15" rx="10" ry="13" fill="${col}" transform="rotate(${a})"/>`).join('')}<circle r="9" fill="#ffd447"/></g>`;
// things for the hair, in face units; one from the top and one from the side can be worn together
const GOLD = '#ffc21f', CROWN_VIEW = '180 -6 240 150';
const WEAR = {
  tiara: { slot: 'top', view: CROWN_VIEW, art: () => P('M196 124 L212 50 L250 96 L276 26 L300 84 L324 26 L350 96 L388 50 L404 124 Q300 100 196 124Z', '#ffd447') + C(276, 34, 10, '#ff5c8a') + C(324, 34, 10, '#7fd3ff') + C(300, 96, 12, '#b388ff') + C(212, 56, 8, '#fff') + C(388, 56, 8, '#fff') },
  // a queen's crown: red velvet under golden arches
  royal: { slot: 'top', view: CROWN_VIEW, art: () => P('M212 104 C206 28 394 28 388 104Z', '#e8364f') + L('M214 100 C226 44 286 36 300 30 C314 36 374 44 386 100', 12, GOLD) + L('M300 32 V100', 12, GOLD) + C(300, 20, 13, GOLD) + c(296, 16, 4, '#fff3a8') +
    P('M200 96 Q300 76 400 96 L404 128 Q300 106 196 128Z', GOLD) + C(240, 106, 8, '#3fb4ff') + C(300, 99, 10, '#fff') + C(360, 106, 8, '#4fc56a') + c(270, 101, 4, '#fff3a8') + c(330, 101, 4, '#fff3a8') },
  // pink, with hearts
  hearts: { slot: 'top', view: CROWN_VIEW, art: () => L('M198 122 Q300 94 402 122', 15, '#ff8fc4') + L('M236 104 V84 M364 104 V84 M300 96 V70', 8, '#ff8fc4') + P(heartPath(300, 50, 30), '#ff4f7b') + c(288, 40, 6, '#ffb3c6') +
    P(heartPath(236, 72, 17), '#ff9ecb') + P(heartPath(364, 72, 17), '#ff9ecb') + C(200, 122, 9, '#fff') + C(400, 122, 9, '#fff') + C(268, 104, 6, '#fff') + C(332, 104, 6, '#fff') },
  // ice crystals, for a snow queen
  ice: { slot: 'top', view: CROWN_VIEW, art: () => P('M198 126 L220 60 L246 102 L266 30 L290 94 L300 6 L310 94 L334 30 L354 102 L380 60 L402 126 Q300 100 198 126Z', '#8fd6ff') +
    p('M300 6 L310 94 L300 108 L290 94Z', '#e3f6ff') + p('M266 30 L290 94 L272 104Z', '#bfe8ff') + p('M334 30 L310 94 L328 104Z', '#bfe8ff') + p('M220 60 L246 102 L228 112Z', '#bfe8ff') + p('M380 60 L354 102 L372 112Z', '#bfe8ff') +
    sparkle(300, 60, 12, '#fff') + sparkle(236, 96, 7, '#fff') + sparkle(364, 96, 7, '#fff') },
  // a silver band with stars standing on it
  stars: { slot: 'top', view: CROWN_VIEW, art: () => L('M198 124 Q300 98 402 124', 13, '#cfd6e6') + L('M232 108 V78 M368 108 V78 M300 100 V64 M266 104 V92 M334 104 V92', 6, '#cfd6e6') + P(starPath(300, 40, 32, 14), '#ffd447') +
    P(starPath(232, 62, 21, 9.5), '#fff36b') + P(starPath(368, 62, 21, 9.5), '#fff36b') + C(266, 86, 7, '#ff8fc4') + C(334, 86, 7, '#ff8fc4') + c(292, 32, 5, '#fff7c2') },
  // a small crown worn to one side
  mini: { slot: 'top', view: '200 20 170 140', art: () => `<g transform="rotate(-16 250 110)">${P('M214 122 L206 62 L234 88 L254 44 L274 88 L302 62 L294 122 Q254 110 214 122Z', '#ffd447')}${R(212, 106, 84, 18, 9, '#ff8fc4')}${C(254, 52, 9, '#ff4f7b')}${C(208, 66, 7, '#fff')}${C(300, 66, 7, '#fff')}${C(254, 115, 6, '#fff')}</g>` },
  flowers: { slot: 'top', view: '100 40 400 160', art: () => [[136, 160, '#ff9ec0'], [204, 104, '#fff'], [300, 82, '#ff7a8a'], [396, 104, '#b388ff'], [464, 160, '#ffd447']].map(([x, y, col], i) => flowerAt(x, y, col, i === 2 ? 1.6 : 1.3)).join('') +
    [[166, 128], [248, 88], [352, 88], [434, 128]].map(([x, y]) => p(`M${x - 14} ${y} q14 -18 30 -4 q-14 16 -30 4z`, '#7ed957')).join('') },
  ears: { slot: 'top', view: '110 -10 380 180', art: () => L('M132 150 Q300 6 468 150', 16, '#ff9ec0') + P('M150 126 L128 6 L240 62Z', '#fff') + p('M160 104 L148 36 L212 68Z', '#ffc2d1') + P('M450 126 L472 6 L360 62Z', '#fff') + p('M440 104 L452 36 L388 68Z', '#ffc2d1') },
  // a unicorn horn between two little ears
  unicorn: { slot: 'top', view: '200 -40 200 170', art: () => P('M232 112 L224 52 L268 86Z', '#fff') + p('M238 100 L234 68 L256 86Z', '#ffc2d1') + P('M368 112 L376 52 L332 86Z', '#fff') + p('M362 100 L366 68 L344 86Z', '#ffc2d1') +
    P('M280 104 L300 -30 L320 104Z', '#fff36b') + L('M286 76 L314 60 M290 46 L310 34 M294 16 L305 9', 6, '#ffb347') + flowerAt(268, 108, '#ff9ec0', 1.1) + flowerAt(332, 108, '#b388ff', 1.1) + flowerAt(300, 114, '#fff', 1.2) },
  bow: { slot: 'side', view: '340 76 220 130', art: () => bowAt(450, 140, '#ff6fa8', 1.2, '#e64f8b') },
  clips: { slot: 'side', view: '380 110 150 130', art: () => P(starPath(424, 150, 26, 12), '#ffd447') + P(starPath(466, 190, 20, 9), '#fff36b') + P(heartPath(486, 142, 13), '#ff5c8a') },
  butterfly: { slot: 'side', view: '380 96 150 120', art: () => E(428, 138, 26, 32, '#b388ff', 'transform="rotate(-24 428 138)"') + E(482, 138, 26, 32, '#b388ff', 'transform="rotate(24 482 138)"') + E(436, 176, 18, 20, '#7fd3ff', 'transform="rotate(20 436 176)"') + E(474, 176, 18, 20, '#7fd3ff', 'transform="rotate(-20 474 176)"') +
    c(428, 136, 8, '#fff') + c(482, 136, 8, '#fff') + R(450, 120, 10, 70, 5, '#38334d') },
};

let lastWho = null;

export default {
  id: 'hair', name: '美发沙龙', colors: ['#efe3ff', '#cdb5ee'], intro: 'hair-intro',
  icon: () => { const hair = '#9a7bf5';
    return `<svg viewBox="0 0 230 200">${P('M34 112 C28 40 68 22 98 22 C128 22 168 40 162 112 L162 178 L34 178Z', hair)}${R(86, 146, 24, 30, 8, '#e3ae88')}${P('M46 204 C50 172 76 164 98 164 C120 164 146 172 150 204Z', '#7fd3ff')}` +
      `${E(98, 106, 46, 50, '#f3c6a2')}${P('M52 100 C50 58 74 44 98 44 C122 44 146 58 144 100 C134 82 118 76 98 76 C78 76 62 82 52 100Z', hair)}${R(30, 92, 28, 92, 14, hair)}${R(138, 92, 28, 92, 14, hair)}${C(44, 186, 16, hair)}${C(152, 186, 16, hair)}` +
      `${c(80, 114, 6, '#3b2a25')}${c(116, 114, 6, '#3b2a25')}${c(68, 130, 8, '#f08f7c', 'opacity=".5"')}${c(128, 130, 8, '#f08f7c', 'opacity=".5"')}${L('M88 134 q10 9 20 0', 3.5, '#b8475a')}` +
      `${TOOLS.scissors.replace('<svg ', '<svg x="126" y="20" width="104" height="90" ')}${sparkle(196, 150, 15, '#fff')}${sparkle(20, 40, 10, '#fff')}</svg>`; },

  start(ctx) {
    const { W } = ctx;
    const hx = Math.round(W * 0.45), hy = 336, ox = hx - 300 * K, oy = hy - 339 * K;
    let who = pick(CLIENTS); while (who === lastWho) who = pick(CLIENTS); lastWho = who;
    ctx.scene(hairRoom(W, hx));

    const clipHead = nextId(), clipCap = nextId(), face = `translate(${ox.toFixed(1)} ${oy.toFixed(1)}) scale(${K})`;
    const holder = ctx.add(el('div', { class: 'salon-holder', html:
      `<svg class="salon-svg" viewBox="0 0 ${W} 800" width="${W}" height="800">` +
      `<g class="salon-face" data-eyes="open" data-mouth="smile" transform="${face}">${bust(who, 'cape', pick(CAPES))}${clientFace(who)}` +
      `<clipPath id="${clipHead}"><path d="${HEAD}"/></clipPath><clipPath id="${clipCap}"><path d="${CAP}"/></clipPath>` +
      `<g clip-path="url(#${clipHead})"><g class="cap" clip-path="url(#${clipCap})">${Array.from({ length: 6 }, (_, i) => `<rect x="${80 + i * 73.4}" y="0" width="74.4" height="330" fill="${who.hair}"/>`).join('')}</g></g></g>` +
      `<g class="strands" data-kind="drape"></g><g class="strands" data-kind="fringe"></g><g class="wear" transform="${face}"></g><g class="cut"></g></svg>` }));
    const root = holder.firstElementChild, faceG = root.querySelector('.salon-face');
    const bands = [...root.querySelectorAll('.cap rect')].map((node) => ({ node, base: who.hair })), pupils = [...root.querySelectorAll('.pupil')];
    const drapeG = root.querySelector('[data-kind="drape"]'), fringeG = root.querySelector('[data-kind="fringe"]'), wearG = root.querySelector('.wear'), cutG = root.querySelector('.cut');
    const onHair = ctx.add(el('div', { class: 'layer' }));     // shampoo and foam sit on the hair

    /* ---------- the strands ---------- */
    const strands = [];
    const strand = (o) => {
      const g = svgEl('g', { 'stroke-width': o.width });
      (o.kind === 'fringe' ? fringeG : drapeG).append(g);
      const st = { curl: 0, mess: 0, wet: 0, wind: 0, phase: rand(0, 6.28), noise: Array.from({ length: 48 }, () => rand(-1, 1)), cols: Array(48).fill(who.hair), pts: [], paths: [], g, shown: o.width, ...o };
      strands.push(st);
      return st;
    };
    // The long hair parts in the middle, lies over the head and hangs down on both sides.
    // Strands by the ears go first, so the ones from the parting lie on top.
    for (let i = 0; i < 12; i++) for (const side of [-1, 1]) {
      const f = i / 11, th = -Math.PI / 2 + side * (0.1 + (1 - f) * 1.12), d = 6 + 34 * f;
      // how far it runs over the head before it hangs free
      let dome = 0;
      for (let a = th; side < 0 ? a > END_L : a < END_R; a += side * 0.02) dome += 0.02 * Math.hypot((A + d) * Math.sin(a), (B + d) * Math.cos(a));
      strand({ kind: 'drape', side, th, d, width: 34, len: dome + 205 + rand(-9, 9), max: dome + 335, min: 26 });
    }
    // the fringe hangs straight down from the hairline
    for (let i = 0; i < 9; i++) {
      const dx = (i - 4) * 26;
      strand({ kind: 'fringe', side: 0, x: hx + dx, y: hy - 101 + 20 * (dx / 104) ** 2, width: 30, len: 44 + Math.abs(i - 4) * 3 + rand(0, 7), max: 236, min: 16 });
    }

    /** Where every point of a strand is right now. */
    function layout(st, t) {
      const pts = st.pts; pts.length = 0;
      const calm = 1 - st.wet * 0.75, amp = 12 * st.curl * (1 - st.wet * 0.6), sn = st.side || 1, gust = Math.abs(st.wind);
      let s = 0, j = 0, hung = 0, th = st.th, hanging = st.kind === 'fringe', x = st.x, y = st.y, nx = 1, ny = 0;
      for (;;) {
        if (!hanging) {
          const d = 8 + (st.d - 8) * Math.min(1, s / 90);
          nx = Math.cos(th); ny = Math.sin(th);
          x = hx + (A + d) * nx; y = hy + (B + d) * ny;
        }
        const off = j ? amp * Math.sin(j * 1.9 + st.phase) + st.mess * st.noise[j] * 11 : 0;
        pts.push(x + nx * off, y + ny * off);
        if (s >= st.len - 0.5 || j > 46) break;
        const step = Math.min(SEG, st.len - s); s += step; j++;
        if (!hanging) {
          const d = 8 + (st.d - 8) * Math.min(1, s / 90);
          th += st.side * step / Math.hypot((A + d) * ny, (B + d) * nx);
          if (st.side < 0 ? th <= END_L : th >= END_R) {
            hanging = true; th = st.side < 0 ? END_L : END_R;
            x = hx + (A + st.d) * Math.cos(th); y = hy + (B + st.d) * Math.sin(th);
          }
        } else {
          const k = Math.min(1, ++hung / 3);
          const phi = st.side * 0.03 + st.wind * k + Math.sin(t * 1.4 + st.phase + hung * 0.35) * 0.05 * calm * k + (gust > 0.05 ? Math.sin(t * 21 + hung * 1.3 + st.phase) * 0.14 * gust : 0);
          x += step * Math.sin(phi); y += step * Math.cos(phi);
          nx = sn * Math.cos(phi); ny = -sn * Math.sin(phi);
        }
      }
    }
    /** A smooth line through points a…b of a strand. */
    function curve(pts, a, b) {
      const X = (i) => pts[i * 2], Y = (i) => pts[i * 2 + 1];
      let d = `M${X(a).toFixed(1)} ${Y(a).toFixed(1)}`;
      for (let i = a + 1; i < b; i++) d += `Q${X(i).toFixed(1)} ${Y(i).toFixed(1)} ${((X(i) + X(i + 1)) / 2).toFixed(1)} ${((Y(i) + Y(i + 1)) / 2).toFixed(1)}`;
      return d + `L${X(b).toFixed(1)} ${Y(b).toFixed(1)}`;
    }
    /** Draw a strand: one path for every stretch of the same colour. */
    function draw(st) {
      const n = st.pts.length / 2;
      const width = st.width - 7 * st.wet;
      if (Math.abs(width - st.shown) > 0.4) { st.shown = width; st.g.setAttribute('stroke-width', width.toFixed(1)); }
      let run = 0, from = 0;
      for (let j = 1; j < n; j++) {
        if (j < n - 1 && st.cols[j] === st.cols[from]) continue;
        const path = st.paths[run] || (st.paths[run] = st.g.appendChild(svgEl('path')));
        path.setAttribute('d', curve(st.pts, from, j));
        const col = st.wet > 0.02 ? shade(st.cols[from], -0.26 * st.wet) : st.cols[from];
        if (path.shade !== col) { path.shade = col; path.setAttribute('stroke', col); }
        run++; from = j;
      }
      while (st.paths.length > run) st.paths.pop().remove();
    }
    const touches = (st, pt, r) => { for (let i = 0; i < st.pts.length; i += 2) if (Math.hypot(st.pts[i] - pt.x, st.pts[i + 1] - pt.y) < r) return true; return false; };
    const tipOf = (st) => ({ x: st.pts[st.pts.length - 2], y: st.pts[st.pts.length - 1] });

    /* ---------- the customer ---------- */
    let moodTimer = 0;
    const mood = (eyes, mouth, ms = 0) => {
      clearTimeout(moodTimer);
      if (eyes) faceG.dataset.eyes = eyes;
      if (mouth) faceG.dataset.mouth = mouth;
      if (ms) moodTimer = ctx.after(ms, () => { faceG.dataset.mouth = 'smile'; if (faceG.dataset.eyes === 'joy') faceG.dataset.eyes = 'open'; });
    };
    const look = { x: 0, y: 0 };

    /* ---------- sounds that repeat while a tool is used ---------- */
    const lastTick = {};
    const tick = (name, gap) => { const now = performance.now(); if (now - (lastTick[name] || 0) < gap) return false; lastTick[name] = now; return true; };

    let index = -1, dye = DYES[3], dollops = [], foams = [], dyes = null, extra = [], capWet = 0;
    const step = () => STEPS[index];
    const dyeAt = (y) => (dye === 'rainbow' ? RAINBOW[Math.floor(Math.max(0, y - (hy - 230)) / 38) % 6] : dye);

    /* ---------- what each tool does, every frame it is held ---------- */
    const box = toolbox(ctx, (key, pt, dt, tool) => {
      if (key === 'shampoo') {
        if (step() !== 'shampoo' || Math.abs(pt.x - hx) > 210 || pt.y > hy + 30 || !tick('squirt', 330)) return;
        const x = clamp(pt.x + rand(-18, 18), hx - 104, hx + 104);
        const y = hy - (B + 14) * Math.sqrt(1 - ((x - hx) / (A + 30)) ** 2) + rand(6, 44);
        const d = ctx.sprite(dollopArt(), pt.x, pt.y, 62, 50, 'pulse');
        d.el.style.pointerEvents = 'none'; d.hp = 1; onHair.append(d.el); dollops.push(d);
        ctx.sfx('squirt'); tool.anim('pop', 220);
        d.glide(x, y, 260, 'ease-in').then(() => { d.anim('pop', 260); ctx.sfx('drop'); });
        mood('shut', 'smile');
        if (dollops.length >= 5) ctx.after(450, () => { if (step() === 'shampoo') next(); });
      } else if (key === 'shower') {
        if (tick('water', 45)) spray(ctx, pt.x + rand(-40, 40), pt.y + 4, { n: 2, shape: 'streak', color: ['#8fd6ff', '#bfe8ff'], angle: 90, cone: 3, reach: 330, size: 24, ms: 430, grow: 1 });
        if (tick('water-sound', 200)) ctx.sfx('water');
        for (const st of strands) for (let i = 0; i < st.pts.length; i += 2) if (Math.abs(st.pts[i] - pt.x) < 76 && st.pts[i + 1] > pt.y) { st.wet = Math.min(1, st.wet + dt * 4); break; }
        foams = foams.filter((f) => {
          if (Math.abs(f.cx - pt.x) > 84 || f.cy < pt.y) return true;
          f.el.animate([{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: 'translateY(120px) scale(.6)', opacity: 0 }], { duration: 520, easing: 'ease-in', fill: 'forwards' });
          ctx.after(520, () => f.remove());
          return false;
        });
        if (step() === 'rinse' && !foams.length) next();
      } else if (key === 'dryer') {
        if (tick('air', 60)) spray(ctx, pt.x, pt.y, { n: 2, shape: 'streak', color: '#fff', angle: 180, cone: 14, reach: 170, size: 26, ms: 320, opacity: 0.7, turn: 0 });
        if (tick('air-sound', 240)) ctx.sfx('whoosh');
      } else if (key === 'comb') {
        let combed = false;
        for (const st of strands) if (st.mess > 0 && touches(st, pt, 54)) { st.mess = Math.max(0, st.mess - dt * 2.6); combed = true; }
        if (combed && tick('comb', 150)) { ctx.sfx('brush'); spray(ctx, pt.x, pt.y, { n: 1, shape: 'spark', color: ['#fff', '#fff36b'], angle: 270, cone: 80, reach: 60, size: 22, ms: 500 }); }
        if (step() === 'comb' && strands.every((st) => st.mess < 0.1)) { strands.forEach((st) => { st.mess = 0; }); next(); }
      } else if (key === 'scissors') {
        for (const st of strands) {
          const n = st.pts.length / 2;
          for (let j = Math.ceil(st.min / SEG); j < n; j++) {
            if (j * SEG > st.len - 8) break;
            if (Math.hypot(st.pts[j * 2] - pt.x, st.pts[j * 2 + 1] - pt.y) < 23) { snip(st, j); break; }
          }
        }
      } else if (key === 'potion') {
        let grew = false;
        for (const st of strands) if (st.len < st.max && touches(st, pt, 62)) { st.len = Math.min(st.max, st.len + 150 * dt); grew = true; }
        if (tick('mist', 70)) spray(ctx, pt.x + 34, pt.y + 2, { n: 2, shape: 'dot', color: ['#b9f0a8', '#e6ffd9'], angle: 185, cone: 26, reach: 80, size: 14, ms: 380 });
        if (tick('mist-sound', 180)) ctx.sfx('spray');
        if (grew && tick('grow', 260)) { ctx.sfx('sparkle'); spray(ctx, pt.x, pt.y, { n: 2, shape: 'spark', color: ['#fff36b', '#9be27a'], angle: 270, cone: 180, reach: 70, size: 24, ms: 600 }); }
      } else if (key === 'curler' || key === 'iron') {
        let done = false;
        for (const st of strands) {
          if (!touches(st, pt, 46)) continue;
          if (key === 'curler' && st.curl < 1) { st.curl = Math.min(1, st.curl + dt * 1.9); done = true; }
          if (key === 'iron' && (st.curl > 0 || st.mess > 0)) { st.curl = Math.max(0, st.curl - dt * 2.5); st.mess = Math.max(0, st.mess - dt * 2.5); done = true; }
        }
        if (done && tick('steam', 170)) { ctx.sfx('steam'); spray(ctx, pt.x, pt.y - 10, { n: 2, shape: 'puff', color: '#fff', angle: 270, cone: 30, reach: 80, size: 30, ms: 700, opacity: 0.75, grow: 1.6 }); }
      } else if (key === 'spray') {
        let hit = false;
        for (const st of strands) for (let j = 0; j < st.pts.length / 2; j++) {
          if (Math.hypot(st.pts[j * 2] - pt.x, st.pts[j * 2 + 1] - pt.y) > 42) continue;
          const col = dyeAt(st.pts[j * 2 + 1]);
          if (st.cols[j] !== col) { st.cols[j] = col; hit = true; }
        }
        bands.forEach((band, i) => {
          if (Math.hypot(hx + (i - 2.5) * 73.4 * K - pt.x, hy - 122 - pt.y) > 64) return;
          const col = dye === 'rainbow' ? RAINBOW[i] : dye;
          if (band.base !== col) { band.base = col; band.node.setAttribute('fill', shade(col, -0.26 * capWet)); hit = true; }
        });
        if (tick('mist', 60)) spray(ctx, pt.x + 36, pt.y, { n: 3, shape: 'dot', color: dye === 'rainbow' ? RAINBOW : [dye, shade(dye, 0.3)], angle: 180, cone: 30, reach: 78, size: 15, ms: 360 });
        if (tick('mist-sound', 170)) ctx.sfx('spray');
        if (hit && tick('dyed', 320)) ctx.sfx('sparkle');
      }
    });
    box.onPick = (t) => { if (TOOL_VOICE[t.key] && !t.said) { t.said = true; ctx.say(TOOL_VOICE[t.key]); } };

    /** Cut a strand at point j: the rest of it falls to the floor. */
    function snip(st, j) {
      const n = st.pts.length / 2;
      const piece = svgEl('path', { d: curve(st.pts, j, n - 1), stroke: st.cols[j], 'stroke-width': st.width, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      piece.style.transformBox = 'fill-box'; piece.style.transformOrigin = 'center';
      cutG.append(piece);
      piece.animate([{ transform: 'translate(0, 0) rotate(0)', opacity: 1 }, { transform: `translate(${rand(-50, 50)}px, 140px) rotate(${rand(-50, 50)}deg)`, opacity: 1, offset: 0.4 }, { transform: `translate(${rand(-80, 80)}px, 520px) rotate(${rand(-120, 120)}deg)`, opacity: 0 }],
        { duration: 900, easing: 'ease-in' }).finished.then(() => piece.remove(), () => piece.remove());
      st.len = j * SEG;
      for (let i = j; i < st.cols.length; i++) st.cols[i] = st.cols[j - 1];    // what grows back matches the new end
      if (tick('snip', 60)) ctx.sfx('snip');
      mood(null, 'o', 500);
    }

    /* ---------- rubbing the shampoo into a lather with a finger ---------- */
    ctx.rub((pt) => {
      if (step() !== 'lather' || box.held) return;
      const onTop = ((pt.x - hx) / (A + 62)) ** 2 + ((pt.y - hy) / (B + 62)) ** 2 < 1 && pt.y < hy - 36;
      if (!onTop && !strands.some((st) => touches(st, pt, 46))) return;
      dollops = dollops.filter((d) => {
        if (Math.hypot(d.cx - pt.x, d.cy - pt.y) > 86) return true;
        d.hp -= 0.2; d.el.style.opacity = Math.max(0.15, d.hp);
        if (d.hp > 0) return true;
        anim(d.el, 'out', 200, { fill: 'forwards' }).then(() => d.remove());
        return false;
      });
      if (tick('foam', 85) && foams.length < 34) {
        const s = rand(64, 104), f = ctx.sprite(foamArt(), pt.x + rand(-26, 26), pt.y + rand(-22, 22), s, s * 0.8, 'foam');
        f.el.style.pointerEvents = 'none'; f.el.style.animationDelay = `${-rand(0, 2)}s`; onHair.append(f.el); f.anim('in', 240); foams.push(f);
        ctx.sfx('bubble');
        spray(ctx, pt.x, pt.y, { n: 1, shape: 'bubble', angle: 270, cone: 50, reach: 110, size: 26, ms: 900 });
      }
      if (!dollops.length && foams.length >= 15) next();
    });

    /* ---------- the steps ---------- */
    const shelf = (keys, cols) => keys.forEach((k, i) => {
      const col = cols === 1 ? 0 : i % 2, row = cols === 1 ? i : Math.floor(i / 2), rows = Math.ceil(keys.length / cols);
      const w = 126, h = 118;
      box.add(k, TOOLS[k], cols === 1 ? W - 110 : W - 252 + col * 156, (cols === 1 ? 400 : 356) + (row - (rows - 1) / 2) * 150, w, h, { tip: [TIP[k][0] * w, TIP[k][1] * h] });
    });

    function next() {
      index += 1;
      const now = step();
      ctx.progress(index, STEPS.length);
      if (index > 0) { ctx.sfx('great'); ctx.burst(hx, hy - 130, { n: 10, spread: 240 }); }
      ctx.help = () => ctx.say(VOICE[now]);
      ctx.after(index ? 600 : 2500, () => { if (step() === now) ctx.say(VOICE[now]); });
      if (now === 'shampoo') box.enable('shampoo');
      else if (now === 'lather') box.enable();
      else if (now === 'rinse') box.enable('shower');
      else if (now === 'dry') { box.enable('dryer'); mood('open', 'smile'); strands.forEach((st) => { st.wet = Math.max(st.wet, 0.85); }); }   // the water has run all through the hair
      else if (now === 'comb') box.enable('comb');
      else if (now === 'style') style();
      else if (now === 'deco') decorate();
    }

    function style() {
      box.clear();
      mood('joy', 'happy', 1400);
      for (let i = 0; i < 6; i++) ctx.after(i * 130, () => spray(ctx, hx + rand(-190, 190), hy + rand(-170, 160), { n: 1, shape: 'spark', color: '#fff', angle: 270, cone: 180, reach: 20, size: 46, ms: 800 }));
      ctx.after(350, () => {
        shelf(['scissors', 'potion', 'curler', 'iron', 'spray', 'dryer'], 2);
        const can = box.tools.get('spray');
        const setDye = (col) => { dye = col; can.el.style.setProperty('--dye', col === 'rainbow' ? RAINBOW[0] : col); can.el.classList.toggle('rainbow', col === 'rainbow'); };
        dyes = tray(ctx, 84, 432, DYES.map((col) => ({ key: col, color: col === 'rainbow' ? RAINBOW_CSS : col })), (item) => { ctx.sfx('tap'); setDye(item.key); can.anim('wiggle', 400); }, { width: 96, cls: 'hair-dyes' });
        dyes.select(dye); setDye(dye);
        anim(dyes.el, 'fade', 300);
        extra.push(ctx.button('check', W - 174, 716, 'green', '做好了', () => next()));
      });
    }

    function decorate() {
      box.clear();
      dyes?.el.remove();
      extra.forEach((b) => b.remove()); extra = [];
      const worn = new Map();
      const picks = tray(ctx, W - 178, 356, Object.keys(WEAR).map((k) => ({ key: k, html: `<svg viewBox="${WEAR[k].view}">${WEAR[k].art()}</svg>` })), (item) => {
        const on = !worn.has(item.key);
        if (on) for (const [k, node] of worn) if (WEAR[k].slot === WEAR[item.key].slot) { node.remove(); worn.delete(k); }
        if (on) {
          wearG.insertAdjacentHTML('beforeend', `<g class="acc-in">${WEAR[item.key].art()}</g>`);
          worn.set(item.key, wearG.lastElementChild);
          ctx.sfx('sparkle'); ctx.burst(hx, hy - 150, { n: 7, spread: 200 }); mood('joy', 'happy', 900);
        } else { worn.get(item.key).remove(); worn.delete(item.key); ctx.sfx('drop'); }
        for (const [k, chip] of picks.chips) chip.classList.toggle('on', worn.has(k));
      }, { width: 312, select: false });
      anim(picks.el, 'fade', 300);
      ctx.button('camera', W - 178, 706, 'pink', '拍照', async () => {
        picks.el.remove();
        ctx.sfx('camera');
        const flash = ctx.add(el('div', { class: 'flash' }));
        await ctx.sleep(450); flash.remove();
        ctx.progress(STEPS.length, STEPS.length);
        mood('joy', 'happy');
        anim(holder, 'jump', 700);
        ctx.burst(hx, hy - 40, { n: 24, shapes: ['heart', 'star'], spread: 380, size: 44 });
        ctx.win({ voice: 'hair-done', delay: 1200 });
      });
    }

    /* ---------- every frame ---------- */
    ctx.loop((dt, t) => {
      const held = box.held, blower = held && held.key === 'dryer' ? held.point() : null;
      let wet = 0;
      for (const st of strands) {
        let power = 0;
        if (blower && st.pts.length) {
          // the dryer blows to the left, in a cone that widens with distance
          const n = st.pts.length / 2, m = Math.floor(n / 2);
          for (const i of [n - 1, m]) {
            const dx = blower.x - st.pts[i * 2], dy = Math.abs(st.pts[i * 2 + 1] - blower.y);
            if (dx > -30) power = Math.max(power, clamp(1 - dx / 470, 0, 1) * clamp(1 - dy / (95 + Math.max(0, dx) * 0.4), 0, 1));
            if (Math.hypot(dx, dy) < 150) power = Math.max(power, 0.7);
          }
        }
        st.wind += (-1.25 * power - st.wind) * Math.min(1, dt * 7);
        if (power > 0.12 && st.wet > 0) {
          st.wet = Math.max(0, st.wet - dt * 1.5 * power);
          if (step() === 'dry') st.mess = Math.max(st.mess, 0.9 * (1 - st.wet));     // blow-dried hair is frizzy until it is combed
          if (Math.random() < dt * 5) { const end = tipOf(st); spray(ctx, end.x, end.y, { n: 1, shape: 'drop', color: '#8fd6ff', angle: 190, cone: 30, reach: 90, size: 18, ms: 450, fall: 40 }); }
        }
        if (st.wet > 0.05) wet++;
        layout(st, t);
        draw(st);
      }
      if (wet && step() === 'dry' && Math.random() < dt * 2.5) {     // wet hair drips
        const st = pick(strands.filter((s) => s.wet > 0.3)); if (st) { const end = tipOf(st); spray(ctx, end.x, end.y + 8, { n: 1, shape: 'drop', color: '#8fd6ff', angle: 90, cone: 4, reach: 90, size: 18, ms: 600 }); }
      }
      if (step() === 'dry' && !wet) { strands.forEach((st) => { st.wet = 0; }); next(); }
      // the hair on top of the head is as wet as the fringe that grows from it
      const top = strands.reduce((sum, st) => sum + (st.kind === 'fringe' ? st.wet : 0), 0) / 9;
      if (Math.abs(top - capWet) > 0.03 || (!top && capWet)) { capWet = top; for (const band of bands) band.node.setAttribute('fill', shade(band.base, -0.26 * capWet)); }
      // her eyes follow the tool in your hand
      const at = held ? held.point() : null;
      const tx = at ? clamp((at.x - hx) / 40, -8, 8) : 0, ty = at ? clamp((at.y - (hy + 16)) / 40, -11, 5) : 0;
      look.x += (tx - look.x) * Math.min(1, dt * 8); look.y += (ty - look.y) * Math.min(1, dt * 8);
      for (const node of pupils) node.style.transform = `translate(${look.x.toFixed(1)}px, ${look.y.toFixed(1)}px)`;
    });

    shelf(['shampoo', 'shower', 'dryer', 'comb'], 1);
    next();
  },
};
