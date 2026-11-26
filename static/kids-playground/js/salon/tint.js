// Recolouring painted pictures in the browser: hair dye, polish shades, clothes in another colour.
// A gradient map keeps the drawing's light and shade and its darker outlines, and swaps the colours.

const off = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const hex = (h) => { const v = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Dark, mid and light of a colour, for a gradient map. */
export function ramp(col) {
  const c = hex(col);
  return [mix(c, [40, 22, 40], 0.62), c, mix(c, [255, 255, 255], 0.55)];
}

/**
 * A copy of `img` recoloured to `col` (or to a list of colours along the picture's height: an ombre, a rainbow).
 * `keep` leaves pixels alone that are far from the picture's main colour family (a pink bow on the hair).
 */
const cache = new Map();
export function tinted(img, col, { key = img.src, scale = 1 } = {}) {
  const id = `${key}|${Array.isArray(col) ? col.join(',') : col}|${scale}`;
  if (cache.has(id)) return cache.get(id);
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const c = off(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h), d = data.data;
  const cols = Array.isArray(col) ? col : [col];
  const ramps = cols.map(ramp);
  // light levels in the source, so its darkest and brightest map onto the ramp ends
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 200) { const l = lum(d, i); if (l < lo) lo = l; if (l > hi) hi = l; }
  const span = Math.max(1, hi - lo);
  for (let y = 0; y < h; y++) {
    const pick = ramps.length === 1 ? ramps[0] : ramps[Math.min(ramps.length - 1, Math.floor((y / h) * ramps.length))];
    let next = pick, t = 0;
    if (ramps.length > 1) {
      // blend between bands so an ombre has no hard line
      const f = (y / h) * ramps.length - 0.5, k = Math.max(0, Math.min(ramps.length - 2, Math.floor(f)));
      t = Math.max(0, Math.min(1, f - k));
      next = ramps[k + 1];
      const cur = ramps[k];
      for (let x = 0; x < w; x++) mapPixel(d, (y * w + x) * 4, cur, next, t, lo, span);
      continue;
    }
    for (let x = 0; x < w; x++) mapPixel(d, (y * w + x) * 4, pick, next, t, lo, span);
  }
  g.putImageData(data, 0, 0);
  cache.set(id, c);
  return c;
}

/**
 * A copy of a character picture with its skin moved from one tone to another (shading kept),
 * and optionally its eye colour moved too (`eye: [fromHex, toHex]`).
 */
/** k: picture pixels per master unit (pictures may be stored sharper than their box). */
export function reskin(img, from, to, { eye = null, eyeBox = null, at = [0, 0], k = 1 } = {}) {
  const id = `skin|${img.src}|${from}|${to}|${eye}`;
  if (cache.has(id)) return cache.get(id);
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = off(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  if (from === to && !eye) { cache.set(id, c); return c; }
  const data = g.getImageData(0, 0, w, h), d = data.data;
  const f = hex(from), t = hex(to), fl = (f[0] + f[1] + f[2]) / 3 + 1;
  const eyeHsl = eye && hsl(...hex(eye[1]));
  // the warm line-art around her (face edge, ears, fingers) darkens with darker skin, so it never glows orange
  const dark = Math.min(1, (t[0] + t[1] + t[2]) / (f[0] + f[1] + f[2]));
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i], gg = d[i + 1], b = d[i + 2], l = (r + gg + b) / 3 + 1;
    const cd = (Math.abs(r / l - f[0] / fl) + Math.abs(gg / l - f[1] / fl) + Math.abs(b / l - f[2] / fl)) * 100;
    let wgt = Math.max(0, Math.min(1, 1 - (cd - 30) / 30)) * Math.max(0, Math.min(1, (l - 40) / 40));
    if (wgt > 0) {
      d[i] = r + (Math.min(255, r / f[0] * t[0]) - r) * wgt;
      d[i + 1] = gg + (Math.min(255, gg / f[1] * t[1]) - gg) * wgt;
      d[i + 2] = b + (Math.min(255, b / f[2] * t[2]) - b) * wgt;
      continue;
    }
    if (dark < 0.95 && !(eyeBox && inBox(i / 4, w, eyeBox, at, k))) {
      const [hh, ss, ll] = hsl(r, gg, b);
      if (hh > 0.01 && hh < 0.12 && ss > 0.22 && ll < 0.8) {
        const k = Math.min(1, (ss - 0.22) / 0.12) * Math.min(1, (0.8 - ll) / 0.1), m = 1 - (1 - dark) * 0.9 * k;
        d[i] = r * m; d[i + 1] = gg * m; d[i + 2] = b * m;
        continue;
      }
    }
    if (eye && inBox(i / 4, w, eyeBox, at, k)) {
      // the iris: brownish, saturated, mid-dark — turn its hue and saturation to the new eye colour, keep its light
      const [hh, ss, ll] = hsl(r, gg, b);
      if (ss > 0.28 && ll > 0.1 && ll < 0.62 && (hh < 0.12 || hh > 0.95)) {
        const k = Math.min(1, (ss - 0.28) / 0.15) * Math.min(1, (ll - 0.1) / 0.06, (0.62 - ll) / 0.08);
        const [nr, ng, nb] = rgbOf(eyeHsl[0], Math.min(1, eyeHsl[1] * (0.7 + ss * 0.5)), Math.min(0.92, ll * eyeHsl[2] / 0.32));
        d[i] = r + (nr - r) * k; d[i + 1] = gg + (ng - gg) * k; d[i + 2] = b + (nb - b) * k;
      }
    }
  }
  g.putImageData(data, 0, 0);
  cache.set(id, c);
  return c;
}

/** Is pixel number `n` of a picture placed at `at` inside `box` (both in the character's coordinates)? */
function inBox(n, w, box, at, k = 1) {
  if (!box) return true;
  const x = (n % w) / k + at[0], y = Math.floor(n / w) / k + at[1];
  return x >= box[0] && y >= box[1] && x <= box[2] && y <= box[3];
}

const lum = (d, i) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;

function mapPixel(d, i, a, b, t, lo, span) {
  if (!d[i + 3]) return;
  const l = Math.max(0, Math.min(1, (lum(d, i) - lo) / span));
  for (let k = 0; k < 3; k++) {
    const ca = l < 0.5 ? a[0][k] + (a[1][k] - a[0][k]) * l * 2 : a[1][k] + (a[2][k] - a[1][k]) * (l - 0.5) * 2;
    const cb = l < 0.5 ? b[0][k] + (b[1][k] - b[0][k]) * l * 2 : b[1][k] + (b[2][k] - b[1][k]) * (l - 0.5) * 2;
    d[i + k] = ca + (cb - ca) * t;
  }
}

function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function rgbOf(h, s, l) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

export const RAINBOW = ['#ff5f7e', '#ffa53a', '#ffe14d', '#6fd56a', '#4fb4ff', '#a77cf0'];
const urls = new Map();
/**
 * A product picture (a polish bottle, a lipstick) in another colour: its pink part — the product itself —
 * takes `col`, keeping its light and shade. col: '#hex', a list (top to bottom), 'rainbow'; kind: 'glitter' or
 * 'pearl' adds sparkle or sheen. Returns a data URL for an <img>.
 */
export function productTint(img, col, kind = '') {
  const id = `${img.src}|${col}|${kind}`;
  if (urls.has(id)) return urls.get(id);
  const w = img.naturalWidth, h = img.naturalHeight, c = off(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, w, h), d = data.data;
  const list = col === 'rainbow' ? RAINBOW : Array.isArray(col) ? col : [col];
  const hsls = list.map((x) => hsl(...hex(x)));
  // the product's pink is around hue .92 (#ff4fa3): measure its own light so shading maps across
  let ys = [], y0 = h, y1 = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 30) continue;
    const [hh, ss] = hsl(d[i], d[i + 1], d[i + 2]);
    if (ss > 0.32 && (hh > 0.85 || hh < 0.02)) { const y = Math.floor(i / 4 / w); ys.push(y); if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const sel = new Uint8Array(w * h);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 30) continue;
    const [hh, ss, ll] = hsl(d[i], d[i + 1], d[i + 2]);
    const pinkness = ss > 0.32 && (hh > 0.85 || hh < 0.02) ? 1 : ss > 0.18 && (hh > 0.82 || hh < 0.04) ? 0.5 : 0;
    if (!pinkness) continue;
    sel[i / 4] = 1;
    const y = Math.floor(i / 4 / w), t = y1 > y0 ? Math.max(0, Math.min(1, (y - y0) / (y1 - y0))) : 0;
    const k = Math.min(list.length - 1, Math.floor(t * list.length)), [th, ts, tl] = hsls[col === 'rainbow' ? k : list.length > 1 ? Math.round(t * (list.length - 1)) : 0];
    // pink's own light is about .65: lighter pink → lighter colour, darker → darker
    const l2 = Math.max(0.04, Math.min(0.97, tl + (ll - 0.65) * (tl > 0.85 ? 0.35 : tl < 0.2 ? 0.5 : 0.9)));
    const [r, gg, b] = rgbOf(th, ts < 0.08 ? ts : Math.min(1, ts * (0.85 + ss * 0.2)), l2);
    d[i] += (r - d[i]) * pinkness; d[i + 1] += (gg - d[i + 1]) * pinkness; d[i + 2] += (b - d[i + 2]) * pinkness;
  }
  g.putImageData(data, 0, 0);
  if (kind === 'glitter' || kind === 'pearl') {
    g.save();
    const m = off(w, h), mg = m.getContext('2d'), md = mg.createImageData(w, h);
    for (let i = 0; i < sel.length; i++) if (sel[i]) md.data[i * 4 + 3] = 255;
    mg.putImageData(md, 0, 0);
    const fx = off(w, h), fg = fx.getContext('2d');
    if (kind === 'glitter') {
      for (let j = 0; j < (w * h) / 260; j++) { fg.fillStyle = ['#fff', '#fff6c4', '#ffe0f4'][j % 3]; fg.globalAlpha = 0.6 + Math.random() * 0.4; fg.beginPath(); fg.arc(Math.random() * w, Math.random() * h, 0.8 + Math.random() * 1.8, 0, 7); fg.fill(); }
    } else {
      const gr = fg.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(0.5, 'rgba(255,230,250,.1)'); gr.addColorStop(1, 'rgba(220,235,255,.5)');
      fg.fillStyle = gr; fg.fillRect(0, 0, w, h);
    }
    fg.globalCompositeOperation = 'destination-in'; fg.globalAlpha = 1; fg.drawImage(m, 0, 0);
    g.drawImage(fx, 0, 0);
    g.restore();
  }
  const url = c.toDataURL();
  urls.set(id, url);
  void ys;
  return url;
}
