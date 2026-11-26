// Pictures for the salon games: a customer whose face can look around, close her eyes and smile,
// the tools of the trade, and the rooms. Faces are drawn in the same 600×730 box as the makeup face.
import { E, C, P, R, e, c, p, L, tube, shade, starPath, heartPath, sparkle, nextId } from './base.js';
import { room, band } from './scenes.js';

export const HEAD = 'M300 110 C440 110 508 214 508 350 C508 482 420 568 300 568 C180 568 92 482 92 350 C92 214 160 110 300 110Z';
export const EYES = [[218, 364], [382, 364]];
export const CLIENTS = [
  { skin: '#f3c6a2', hair: '#2b2529', eye: '#6b4433' },
  { skin: '#f8d6ba', hair: '#f2c14e', eye: '#4f8fd0' },
  { skin: '#d9a273', hair: '#5a3b2e', eye: '#5a3b2e' },
  { skin: '#f6ccae', hair: '#c9603c', eye: '#4c9a5a' },
  { skin: '#b57a52', hair: '#33221c', eye: '#3b2a25' },
  { skin: '#8f5c3e', hair: '#4a2f24', eye: '#5a3b2e' },
];

/**
 * The face (ears, head, eyes, nose, mouth). Put it inside <g class="salon-face" data-eyes data-mouth>:
 * data-eyes = open | shut | joy, data-mouth = smile | o | happy. The pupils are `.pupil` groups to move about.
 */
export function clientFace(who) {
  const { skin, eye } = who, dark = shade(skin, -0.14), line = '#3b2a25';
  const one = ([cx, cy], s) =>
    `<g class="eye-open"><g class="eye"><ellipse cx="${cx}" cy="${cy}" rx="30" ry="36" fill="${line}"/><g class="pupil"><ellipse cx="${cx}" cy="${cy + 8}" rx="19" ry="22" fill="${eye}"/><circle cx="${cx - 10}" cy="${cy - 14}" r="12" fill="#fff"/><circle cx="${cx + 11}" cy="${cy + 14}" r="6" fill="#fff" opacity=".85"/></g></g>` +
    L(`M${cx - s * 34} ${cy - 22} l${-s * 12} -8`, 5, line) + `</g>` +
    `<g class="eye-shut">${L(`M${cx - 30} ${cy + 4} Q${cx} ${cy + 30} ${cx + 30} ${cy + 4}`, 7, line)}${L(`M${cx - s * 26} ${cy + 16} l${-s * 10} 9`, 5, line)}</g>` +
    `<g class="eye-joy">${L(`M${cx - 30} ${cy + 14} Q${cx} ${cy - 24} ${cx + 30} ${cy + 14}`, 8, line)}</g>`;
  return E(96, 380, 28, 38, skin) + E(504, 380, 28, 38, skin) + e(96, 382, 13, 20, dark) + e(504, 382, 13, 20, dark) + P(HEAD, skin) +
    `<ellipse class="cheek" cx="168" cy="452" rx="42" ry="27" fill="#f08f7c" opacity=".45"/><ellipse class="cheek" cx="432" cy="452" rx="42" ry="27" fill="#f08f7c" opacity=".45"/>` +
    L('M186 304 Q218 288 250 302 M350 302 Q382 288 414 304', 6, shade(who.hair, 0.1), 'opacity=".55"') +
    one(EYES[0], 1) + one(EYES[1], -1) + L('M291 440 q9 8 18 0', 4, shade(skin, -0.24)) +
    `<g class="mouth-smile">${L('M262 494 Q300 528 338 494', 7, '#b8475a')}</g>` +
    `<g class="mouth-o"><ellipse cx="300" cy="508" rx="17" ry="21" fill="#9c3b46"/></g>` +
    `<g class="mouth-happy"><path d="M254 488 Q300 504 346 488 Q338 548 300 548 Q262 548 254 488Z" fill="#9c3b46"/><ellipse cx="300" cy="535" rx="22" ry="10" fill="#f0808e"/><path d="M262 491 Q300 505 338 491 L336 501 Q300 513 264 501Z" fill="#fff"/></g>`;
}

/** Neck and shoulders, wrapped in a salon cape or a soft robe; runs down past the bottom of the stage. */
export function bust(who, kind = 'cape', col = '#7fd3ff') {
  const neck = R(258, 520, 84, 130, 30, shade(who.skin, -0.09));
  const body = 'M30 1100 C30 740 150 616 300 616 C450 616 570 740 570 1100Z';
  if (kind === 'robe') {
    return neck + P(body, '#ffffff') + P('M246 618 L300 716 L354 618 Q300 640 246 618Z', shade(who.skin, -0.05)) +
      L('M240 620 L300 730 L360 620', 16, '#ffd3e4') + L('M300 730 V1100', 5, '#f1e4ec') + R(248, 800, 104, 26, 13, '#ffd3e4');
  }
  let stars = '';
  for (const [x, y, r] of [[150, 760, 13], [236, 820, 9], [380, 790, 12], [456, 860, 10], [300, 900, 13], [120, 900, 9], [206, 960, 12], [410, 970, 10]]) stars += `<path d="${starPath(x, y, r, r * 0.45)}" fill="#fff" opacity=".8"/>`;
  return neck + P(body, col) + stars + L('M232 628 Q300 676 368 628', 18, shade(col, -0.14)) + C(300, 664, 12, '#ffd447');
}

/** A towel wrapped around the hair (the spa), with a little of the hair showing under it. */
export const turban = (who, col = '#ff9ecb') =>
  P('M84 322 C56 150 166 34 300 34 C434 34 544 150 516 322 C480 262 402 236 300 236 C198 236 120 262 84 322Z', who.hair) +
  P('M78 300 C50 140 162 20 300 20 C438 20 550 140 522 300 C482 244 404 218 300 218 C196 218 118 244 78 300Z', col) +
  E(300, 26, 78, 44, shade(col, -0.08)) + L('M250 22 Q300 60 350 22', 7, shade(col, -0.2)) +
  L('M128 200 Q210 120 300 112 M472 200 Q390 120 300 112', 6, shade(col, 0.35)) + L('M104 286 Q200 222 300 222 Q400 222 496 286', 7, shade(col, -0.12));

/* ---------- tools ---------- */

const svg = (box, inner) => `<svg viewBox="${box}">${inner}</svg>`;
const METAL = '#b4bed4', STEEL = '#7c869c';

export const TOOLS = {
  // the blades point left; they open and close while the scissors are held
  scissors: svg('0 0 140 120',
    `<g class="blade-a">${P('M74 62 L10 40 Q2 46 8 56Z', METAL)}${L('M74 62 L102 80', 11, '#ff6fa8')}<circle cx="114" cy="90" r="16" fill="none" stroke="#ff6fa8" stroke-width="10"/></g>` +
    `<g class="blade-b">${P('M74 58 L10 80 Q2 74 8 64Z', '#cdd5e4')}${L('M74 58 L102 40', 11, '#ff6fa8')}<circle cx="114" cy="30" r="16" fill="none" stroke="#ff6fa8" stroke-width="10"/></g>` + C(74, 60, 6, STEEL)),
  potion: svg('0 0 120 120', R(40, 50, 58, 64, 16, '#7ed957') + R(40, 50, 22, 64, 11, '#9be27a') + P(starPath(70, 84, 16, 7), '#fff36b') + R(58, 34, 22, 20, 4, '#fff') +
    P('M40 14 h46 q8 0 8 8 v14 h-54z', '#33a650') + R(26, 18, 18, 12, 4, '#33a650') + P('M86 36 l12 18 h-12z', '#2a8a43') + c(52, 62, 5, '#fff') + sparkle(98, 94, 9, '#fff36b')),
  curler: svg('0 0 140 120', R(6, 46, 90, 28, 14, '#ff8fc4') + R(12, 50, 78, 8, 4, '#ffc4e0') + L('M10 78 Q50 86 92 78', 6, STEEL) + R(90, 42, 46, 36, 14, '#7a5bdb') + C(112, 60, 7, '#c9b8ff') +
    L('M26 34 q4 -8 0 -16 M50 34 q4 -8 0 -16 M74 34 q4 -8 0 -16', 4, '#ffb4d6')),
  iron: svg('0 0 140 120', P('M92 38 L8 46 q-6 2 -2 10 L92 58Z', '#ffb347') + P('M92 82 L8 74 q-6 -2 -2 -10 L92 62Z', '#ffb347') + R(14, 50, 70, 5, 2.5, '#fff') + R(14, 65, 70, 5, 2.5, '#fff') +
    R(86, 32, 50, 56, 18, '#3fb4ff') + C(112, 60, 8, '#bfe8ff')),
  // the can takes the colour that is picked: --dye, or rainbow stripes
  spray: svg('0 0 120 120', `<rect x="42" y="42" width="52" height="72" rx="13" fill="var(--dye, #ff6fa8)"/>` +
    `<g class="can-rainbow">${['#ff5a6e', '#ff9d2e', '#ffd23f', '#4fc56a', '#3fb4ff', '#9a7bf5'].map((col, i) => `<rect x="42" y="${42 + i * 12}" width="52" height="${i === 5 ? 12 : 13}" ${i === 0 ? 'rx="6"' : ''} fill="${col}"/>`).join('')}</g>` +
    R(42, 42, 16, 72, 8, 'rgba(255,255,255,.3)') + R(42, 62, 52, 22, 0, 'rgba(255,255,255,.85)') + P(heartPath(68, 73, 7), 'var(--dye, #ff6fa8)') + R(52, 28, 32, 16, 6, METAL) + R(42, 16, 26, 14, 5, STEEL) + c(42, 23, 3, '#fff')),
  dryer: svg('0 0 120 110', R(52, 50, 26, 54, 10, '#7a5bdb') + R(20, 14, 86, 50, 24, '#9a7bf5') + R(4, 24, 24, 30, 6, '#7a5bdb') + C(72, 39, 13, '#c9b8ff') + R(58, 76, 14, 8, 4, '#ffd447')),
  comb: svg('0 0 120 100', R(10, 14, 100, 30, 12, '#ff9d2e') + [20, 34, 48, 62, 76, 90].map((x) => R(x, 40, 8, 44, 4, '#ff9d2e')).join('') + R(10, 14, 100, 10, 5, '#ffc078')),
  // tips over and pours when it is held
  shampoo: svg('0 0 120 120', R(34, 44, 52, 68, 18, '#ff9ecb') + R(34, 44, 18, 68, 9, '#ffc4e0') + C(60, 82, 15, '#fff') + P(heartPath(60, 82, 8), '#ff6fa8') + R(50, 30, 20, 16, 4, '#fff') + P('M46 14 h28 l5 18 h-38z', '#e64f8b')),
  shower: svg('0 0 120 120', tube('M96 108 V50 Q96 20 62 20', '#b6bfd3', 10) + P('M18 44 Q60 -6 102 44Z', '#3fb4ff') + R(14, 40, 92, 16, 8, '#1f94e0') + [30, 45, 60, 75, 90].map((x) => c(x, 56, 3, '#bfe8ff')).join('')),
  towel: svg('0 0 120 110', R(14, 10, 92, 92, 16, '#7fd3ff') + R(14, 26, 92, 14, 0, '#fff') + R(14, 72, 92, 14, 0, '#fff') + R(60, 10, 46, 92, 16, 'rgba(31,26,58,.07)')),
  // nail clipper, jaws on the left
  clipper: svg('0 0 130 110', P('M12 70 Q10 60 20 60 L112 64 q10 2 8 12 q-2 8 -12 8 L20 76 q-8 -1 -8 -6Z', METAL) + `<g class="lever">${P('M22 56 L110 26 q10 -3 12 7 q1 8 -8 11 L30 64Z', '#b6bfd3')}${C(104, 38, 6, '#fff')}</g>` + C(40, 62, 6, STEEL) + P('M12 58 l10 -2 v6z', STEEL)),
  file: svg('0 0 150 100', `<g transform="rotate(-16 75 50)">${R(8, 38, 106, 24, 12, '#ffb4d6')}${R(14, 42, 94, 16, 8, '#ff8fc4')}${[24, 38, 52, 66, 80, 94].map((x) => c(x, 50, 2.5, '#ffd9ec')).join('')}${R(104, 34, 40, 32, 14, '#7a5bdb')}${C(126, 50, 6, '#c9b8ff')}</g>`),
  puff: svg('0 0 120 120', C(60, 64, 46, '#ff9ecb') + C(60, 64, 34, '#ffb4d6') + L('M30 64 Q60 44 90 64', 5, '#ff7fb0') + C(34, 30, 15, '#fff') + C(58, 22, 18, '#fff') + C(84, 32, 14, '#fff') + c(54, 20, 5, '#dff4ff')),
  // a shaker of glitter: stars come out of the top (on the left) when it is tipped over the hair
  glitter: svg('0 0 120 120', `<g transform="rotate(-38 60 66)">${R(36, 40, 50, 70, 16, '#ffe26a')}${R(36, 40, 16, 70, 8, '#fff3a8')}${R(32, 24, 58, 22, 9, '#ff8fc4')}${[44, 56, 68, 80].map((x) => c(x, 32, 3, '#fff')).join('')}${P(starPath(61, 78, 15, 6.5), '#fff')}</g>` + P(starPath(20, 22, 9, 4), '#ffd23f') + P(starPath(34, 44, 6, 2.7), '#ff8fc4') + sparkle(12, 50, 7, '#fff')),
  // a soapy sponge for hands
  sponge: svg('0 0 120 120', R(16, 40, 88, 62, 22, '#ffd447') + R(16, 40, 88, 22, 11, '#ffe26a') + [[38, 74, 7], [62, 86, 5], [80, 68, 8], [56, 62, 4]].map(([x, y, r]) => c(x, y, r, '#f2b632')).join('') + C(36, 34, 15, '#fff') + C(60, 26, 18, '#fff') + C(86, 36, 14, '#fff') + c(56, 24, 5, '#dff4ff')),
  cream: svg('0 0 120 120', P('M32 34 h56 l-7 74 q-1 6 -7 6 h-28 q-6 0 -7 -6z', '#9fdcff') + P('M32 34 h18 l-3 80 h-1 q-6 0 -7 -6z', '#c4eaff') + P('M34 52 h52 l-2 24 h-48z', '#fff') + P(heartPath(60, 64, 8), '#ff6fa8') + R(46, 14, 28, 22, 6, '#ff6fa8') + R(46, 14, 10, 22, 5, '#ff8fc4')),
};

/** Where the working end of each tool is, from the middle of its picture, as a share of its width and height. */
export const TIP = {
  scissors: [-0.3, 0], potion: [-0.5, -0.3], curler: [-0.18, 0], iron: [-0.2, 0], spray: [-0.52, -0.31], dryer: [-0.47, -0.15], comb: [0, 0.14],
  glitter: [-0.34, -0.3], sponge: [0, 0.1], shampoo: [-0.28, 0.25], shower: [0, 0.1], towel: [0, 0], clipper: [-0.4, 0.06], file: [-0.2, 0.08], puff: [0, 0.05], cream: [-0.27, 0.24],
};

export const foamArt = () => `<svg viewBox="0 0 100 80">${C(30, 46, 26, '#fff')}${C(62, 40, 30, '#fff')}${C(46, 26, 20, '#fff')}${c(24, 38, 6, '#dff4ff')}${c(66, 30, 7, '#dff4ff')}${c(48, 52, 5, '#eaf7ff')}</svg>`;
export const dollopArt = (col = '#ff9ecb') => `<svg viewBox="0 0 100 80">${P('M10 60 C4 36 26 30 34 40 C36 10 70 10 70 40 C84 30 98 44 90 62 C84 76 16 76 10 60Z', col)}${e(42, 34, 8, 5, '#fff', 'opacity=".7"')}</svg>`;
export const shineArt = () => `<svg viewBox="-20 -20 40 40">${sparkle(0, 0, 17, '#fff')}</svg>`;

/* ---------- nail salon ---------- */

export const bottleArt = (col, glitter = false) => `<svg viewBox="0 0 80 100">${R(28, 2, 24, 44, 8, '#38334d')}${R(28, 2, 9, 44, 4.5, '#5a5470')}${R(12, 42, 56, 54, 18, col)}${R(12, 42, 18, 54, 9, 'rgba(255,255,255,.3)')}` +
  (glitter ? [[30, 60], [52, 56], [44, 78], [26, 84], [58, 82]].map(([x, y]) => sparkle(x, y, 6, '#fff')).join('') : e(54, 62, 5, 9, '#fff', 'opacity=".5"')) + `</svg>`;
/** The brush that follows the finger; its tip (bottom left) carries the colour. */
export const brushArt = () => `<svg viewBox="0 0 100 100">${L('M90 10 L48 52', 22, '#38334d')}${L('M86 10 L52 44', 6, '#5a5470')}${L('M46 54 L36 64', 14, METAL)}<path d="M40 58 L14 90 Q10 92 10 86 L28 50Z" fill="var(--dye, #ff6fa8)"/></svg>`;
export const DECALS = {
  heart: `<path d="${heartPath(0, 0, 11)}" fill="#ff4f7b"/>`,
  star: `<path d="${starPath(0, 0, 14, 6.2)}" fill="#ffd23f"/>`,
  flower: [0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-8" rx="5.500" ry="7" fill="#fff" transform="rotate(${a})"/>`).join('') + '<circle r="5" fill="#ffd23f"/>',
  bow: `<path d="M0 0 C-6 -10 -17 -10 -16 0 C-17 10 -6 10 0 0Z M0 0 C6 -10 17 -10 16 0 C17 10 6 10 0 0Z" fill="#9a7bf5"/><circle r="4" fill="#7a5bdb"/>`,
  gem: `<path d="M0 -13 L11 -3 L0 13 L-11 -3Z" fill="#3fb4ff"/><path d="M0 -13 L11 -3 L0 -1Z" fill="#9fdcff"/><path d="M0 -13 L-11 -3 L0 -1Z" fill="#6fcaf7"/>`,
  pearls: `<circle cy="-10" r="5.500" fill="#fff"/><circle cy="2" r="5.500" fill="#fff"/><circle cy="13" r="4" fill="#ffd23f"/>`,
};
export const decalArt = (key) => `<svg viewBox="-20 -20 40 40">${DECALS[key]}</svg>`;
/** Rings are drawn across a finger of width w, centred on (0, 0). */
export const RINGS = {
  ruby: (w) => R(-w / 2 - 3, -8, w + 6, 16, 8, '#ffc21f') + R(-w / 2 - 3, -8, w + 6, 6, 3, '#ffe07a') + C(0, 0, 14, '#ffc21f') + C(0, 0, 10, '#ff4f7b') + c(-3, -3, 3, '#ffb3c6'),
  flower: (w) => R(-w / 2 - 3, -7, w + 6, 14, 7, '#cfd6e6') + [0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-10" rx="7" ry="9" fill="#ff9ecb" transform="rotate(${a})"/>`).join('') + C(0, 0, 7, '#ffd23f'),
  star: (w) => R(-w / 2 - 3, -7, w + 6, 14, 7, '#9a7bf5') + `<path d="${starPath(0, 0, 17, 7.5)}" fill="#ffd23f"/>`,
};
export const ringArt = (key) => `<svg viewBox="-34 -24 68 48">${RINGS[key](46)}</svg>`;
/** Bracelets are drawn across a wrist of width w, centred on (0, 0). */
export const BRACELETS = {
  pearls: (w) => Array.from({ length: 9 }, (_, i) => { const t = i / 8, x = -w / 2 + t * w, y = 14 * 4 * t * (1 - t) - 7; return C(+x.toFixed(1), +y.toFixed(1), 12, i % 2 ? '#ffd9ec' : '#fff'); }).join(''),
  charms: (w) => L(`M${-w / 2} -6 Q0 22 ${w / 2} -6`, 8, '#ffc21f') + `<path d="${heartPath(-w * 0.25, 18, 11)}" fill="#ff4f7b"/><path d="${starPath(0, 26, 14, 6)}" fill="#3fb4ff"/><path d="${heartPath(w * 0.25, 18, 11)}" fill="#9a7bf5"/>`,
};
export const braceletArt = (key) => `<svg viewBox="-70 -26 140 70">${BRACELETS[key](120)}</svg>`;

/* ---------- the spa ---------- */

export const MASKS = [
  { key: 'cucumber', col: '#a8dc7a', glyph: C(50, 62, 15, '#7dbb4e') + C(50, 62, 10, '#d9f2a8') },
  { key: 'berry', col: '#ff9ec4', glyph: P(heartPath(50, 62, 13), '#ff4f7b') + c(45, 60, 2, '#fff') + c(55, 60, 2, '#fff') + c(50, 68, 2, '#fff') },
  { key: 'choco', col: '#a9714b', glyph: R(37, 49, 26, 26, 6, '#7a4a2c') + L('M50 51 v22 M39 62 h22', 3, '#a9714b') },
  { key: 'honey', col: '#ffd65c', glyph: P('M50 46 C60 60 64 66 64 70 a14 14 0 0 1 -28 0 C36 66 40 60 50 46Z', '#ffb21f') },
  { key: 'lavender', col: '#c4adff', glyph: [[50, 50], [44, 60], [56, 60], [50, 70]].map(([x, y]) => C(x, y, 6.5, '#8a6be0')).join('') },
];
export const jarArt = (m) => `<svg viewBox="0 0 100 100">${R(14, 34, 72, 58, 18, '#fff')}${R(14, 34, 72, 16, 0, m.col)}${R(8, 18, 84, 22, 9, shade(m.col, -0.18))}${R(8, 18, 84, 8, 4, shade(m.col, 0.15))}${m.glyph}</svg>`;
/** The mask brush that follows the finger; the bristles (bottom left) carry the colour. */
export const maskBrushArt = () => `<svg viewBox="0 0 100 100">${L('M90 10 L50 50', 16, '#b88a5e')}${L('M52 48 L40 60', 22, METAL)}<path d="M50 46 L60 56 L22 92 Q6 96 10 80Z" fill="var(--dye, #a8dc7a)"/></svg>`;
export const cucumberArt = () => `<svg viewBox="-50 -50 100 100">${C(0, 0, 46, '#7dbb4e')}${C(0, 0, 39, '#d9f2a8')}${[0, 60, 120, 180, 240, 300].map((a) => `<ellipse cx="0" cy="-20" rx="5" ry="9" fill="#b9e07e" transform="rotate(${a})"/>`).join('')}${C(0, 0, 8, '#c8ea96')}</svg>`;
export const plateArt = () => `<svg viewBox="0 0 220 120">${E(110, 70, 104, 44, '#fff')}${E(110, 66, 80, 30, '#eef3f8')}</svg>`;
export const steamerArt = () => `<svg viewBox="0 0 200 280">${E(100, 264, 74, 14, STEEL)}${R(90, 130, 20, 132, 10, '#b6bfd3')}${tube('M150 86 Q186 70 190 34', '#b6bfd3', 12)}${R(176, 16, 28, 22, 8, STEEL)}${R(32, 56, 128, 90, 38, '#7fd3ff')}${R(32, 56, 128, 34, 17, '#a9e2ff')}` +
  `${[68, 100, 132].map((x) => `<circle class="lamp" cx="${x}" cy="112" r="11" fill="#fff"/>`).join('')}${c(60, 74, 6, '#fff')}</svg>`;
/* mixing a mask: something to put in the bowl, the bowl (its mix takes the colour --mix), and the spoon */
export const tokenArt = (m) => `<svg viewBox="0 0 100 100">${C(50, 50, 46, '#fff')}${C(50, 50, 38, shade(m.col, 0.55))}<g transform="translate(-10 -28) scale(1.2)">${m.glyph}</g></svg>`;
export const bowlArt = () => `<svg viewBox="0 0 250 190">${E(125, 70, 116, 34, '#bfe8ff')}<ellipse cx="125" cy="74" rx="104" ry="27" fill="var(--mix, #f1e9ff)" style="transition:fill .5s"/><g class="blobs"></g>` +
  `<g class="swirl" opacity="0"><path d="M60 74 Q92 56 125 74 T190 74" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".55"/><path d="M84 84 Q106 72 128 84 T172 84" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".4"/></g>` +
  `${P('M9 72 Q125 118 241 72 C236 150 190 182 125 182 C60 182 14 150 9 72Z', '#7fd3ff')}${P('M9 72 Q125 118 241 72 C240 96 236 110 230 124 Q125 152 20 124 C14 110 10 96 9 72Z', '#9fdcff')}${e(60, 132, 9, 18, '#fff', 'opacity=".5" transform="rotate(24 60 132)"')}${P(starPath(125, 148, 16, 7), '#fff')}</svg>`;
export const spoonArt = () => `<svg viewBox="0 0 60 170">${R(22, 8, 16, 112, 8, '#c98a5c')}${R(22, 8, 6, 112, 3, '#dba777')}${E(30, 134, 24, 32, '#c98a5c')}${e(26, 130, 12, 18, '#dba777')}</svg>`;
/** A little germ with a worried face: it runs away from soap. */
export const germArt = (col) => { const d = shade(col, -0.16);
  return [0, 51, 103, 154, 206, 257, 309].map((a) => `<circle cx="${(25 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(25 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="7" fill="${d}"/>`).join('') +
    C(0, 0, 23, col) + c(-8, -4, 5.5, '#fff') + c(8, -4, 5.5, '#fff') + c(-7, -3, 2.8, '#38334d') + c(9, -3, 2.8, '#38334d') + `<ellipse class="d" cx="0" cy="9" rx="5" ry="4" fill="#38334d"/>`; };
export const mudArt = (s = 1) => `<g transform="scale(${s})"><path d="M0 -30 C16 -34 32 -20 28 -4 C36 10 24 30 6 28 C-6 36 -28 28 -28 10 C-38 -4 -24 -24 0 -30Z" fill="#8a5a36"/><circle cx="-10" cy="-6" r="6" fill="#a8744a"/><circle cx="10" cy="10" r="4.500" fill="#a8744a"/></g>`;
export const creamDotArt = () => `<svg viewBox="-20 -20 40 40">${C(0, 2, 15, '#fff')}${C(-2, -6, 9, '#fff')}${c(-5, -3, 4, '#ffe9f2')}</svg>`;

/* ---------- rooms ---------- */

/** The hair salon: a big mirror with lights behind the chair. */
export function hairRoom(W, cx) {
  let out = room(W, '#efe3ff', '#e2d2fb', '#cdb5ee', 668);
  out += R(cx - 310, 66, 620, 640, 112, '#ffd447') + R(cx - 282, 94, 564, 584, 88, '#e6f5ff') +
    `<path d="M${cx - 230} 124 l76 0 l-160 250 l-44 0z" fill="#fff" opacity=".55"/><path d="M${cx + 130} 140 l36 0 l-120 190 l-22 0z" fill="#fff" opacity=".4"/>`;
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) out += `<circle class="twinkle" style="animation-delay:${-((i * 3 + (s > 0 ? 2 : 0)) % 7) * 0.26}s" cx="${cx + s * 310}" cy="${128 + i * 66}" r="14" fill="#fff6c9"/>`;
  // the chair
  out += R(cx - 176, 440, 352, 500, 76, '#ff7fb0') + R(cx - 146, 468, 292, 480, 56, '#ff9ac2') + R(cx - 250, 640, 70, 34, 17, '#e64f8b') + R(cx + 180, 640, 70, 34, 17, '#e64f8b');
  return out;
}
/** The nail table, seen from above: a soft cushion for the hand. */
export function nailTable(W, cx) {
  let out = room(W, '#ffe9f2', '#ffd6e6', '#ffe9f2', 3000);
  out += R(cx - 350, 150, 700, 900, 110, 'rgba(31,26,58,.07)') + R(cx - 340, 132, 680, 900, 104, '#ffffff') + R(cx - 306, 166, 612, 860, 78, '#f1e9ff') +
    `<rect x="${cx - 306}" y="166" width="612" height="860" rx="78" fill="none" stroke="#d9c9ff" stroke-width="5" stroke-dasharray="4 16" stroke-linecap="round"/>`;
  for (const [fx, y, r, col] of [[0.06, 150, 16, '#ffd447'], [0.94, 200, 13, '#ff9ecb'], [0.9, 660, 15, '#b79cff'], [0.08, 640, 12, '#7fd3ff']]) out += `<path class="twinkle" d="${starPath(W * fx, y, r, r * 0.45)}" fill="${col}"/>`;
  return out;
}
/** The spa: a calm green room with a window on the left and the chair in the middle. */
export function spaRoom(W, cx) {
  let out = room(W, '#dff5ec', '#cdeee0', '#b9dfcf', 690, 'stripes');
  const wx = 130;
  out += R(wx - 104, 86, 208, 252, 104, '#fff') + R(wx - 88, 102, 176, 236, 88, '#a9e2ff') + C(wx + 26, 168, 26, '#fff7a8') + `<path d="M${wx - 88} 300 q46 -48 88 -10 q38 -32 88 10 v38 h-176z" fill="#9be0a8"/>` + R(wx - 120, 330, 240, 18, 9, '#fff') +
    [[-60, '#ff9ecb'], [0, '#fff36b'], [60, '#c4adff']].map(([dx, col]) => R(wx + dx - 9, 300, 18, 30, 5, col) + `<path class="flame" d="M${wx + dx} 280 q8 10 0 18 q-8 -8 0 -18z" fill="#ffb21f"/>`).join('');
  // the chair
  out += R(cx - 210, 250, 420, 700, 120, '#9be0c8') + R(cx - 176, 282, 352, 680, 92, '#b9eddc');
  return out;
}
export { band };
