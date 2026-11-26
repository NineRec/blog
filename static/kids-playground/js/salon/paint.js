// Paint that goes on one dab at a time, and only inside its shape: makeup on a cheek, polish on a nail,
// a face mask, mud that is washed away. A layer is a <canvas> laid over a picture in the picture's own
// coordinates; the shape is a mask (a Path2D, a picture, or nothing for "anywhere").

const off = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

export class PaintLayer {
  /**
   * box = {x, y, w, h} where the layer sits in its parent's coordinates.
   * o.mask: Path2D (in the parent's coordinates) | HTMLImageElement/canvas covering the box | null
   * o.res: canvas pixels per unit (keep it under 1 for big layers)
   * o.blend: CSS mix-blend-mode of the layer
   */
  constructor(parent, box, o = {}) {
    this.box = box;
    this.res = o.res ?? 1;
    const w = Math.ceil(box.w * this.res), h = Math.ceil(box.h * this.res);
    this.canvas = off(w, h);
    this.canvas.className = `paint-layer ${o.cls || ''}`;
    Object.assign(this.canvas.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px`, mixBlendMode: o.blend || 'normal', opacity: o.opacity ?? 1 });
    if (o.before) parent.insertBefore(this.canvas, o.before); else parent.append(this.canvas);
    this.g = this.canvas.getContext('2d');
    this.mask = null;
    if (o.mask) this.setMask(o.mask);
    this.samples = null;
    this.covered = null;
  }
  /** Units → canvas pixels. */
  px(x, y) { return [(x - this.box.x) * this.res, (y - this.box.y) * this.res]; }
  setMask(mask) {
    const m = off(this.canvas.width, this.canvas.height), g = m.getContext('2d');
    if (mask instanceof Path2D) {
      g.setTransform(this.res, 0, 0, this.res, -this.box.x * this.res, -this.box.y * this.res);
      g.fillStyle = '#fff';
      g.fill(mask);
    } else {
      g.drawImage(mask, 0, 0, m.width, m.height);
    }
    this.mask = m;
    this.samples = null;
  }
  /** Points inside the shape, used to tell how much of it is covered. */
  sample(step = 14) {
    const pts = [];
    const data = this.mask ? this.mask.getContext('2d').getImageData(0, 0, this.mask.width, this.mask.height).data : null;
    for (let y = step / 2; y < this.box.h; y += step) {
      for (let x = step / 2; x < this.box.w; x += step) {
        if (data) {
          const i = (Math.floor(y * this.res) * this.mask.width + Math.floor(x * this.res)) * 4 + 3;
          if (data[i] < 128) continue;
        }
        pts.push([x + this.box.x, y + this.box.y]);
      }
    }
    this.samples = pts;
    this.covered = new Uint8Array(pts.length);
    return pts;
  }
  get cover() {
    if (!this.samples) this.sample();
    if (!this.samples.length) return 1;
    let n = 0;
    for (const c of this.covered) n += c;
    return n / this.samples.length;
  }
  mark(x, y, r, on) {
    if (!this.samples) this.sample();
    const r2 = r * r;
    for (let i = 0; i < this.samples.length; i++) {
      const [sx, sy] = this.samples[i];
      if ((sx - x) ** 2 + (sy - y) ** 2 < r2) this.covered[i] = on ? 1 : 0;
    }
  }
  /** Read what is painted now (after stamping or rubbing) to know the coverage. */
  measure() {
    if (!this.samples) this.sample();
    const d = this.g.getImageData(0, 0, this.canvas.width, this.canvas.height).data, W = this.canvas.width;
    this.samples.forEach(([x, y], i) => {
      const px = Math.min(W - 1, Math.floor((x - this.box.x) * this.res)), py = Math.min(this.canvas.height - 1, Math.floor((y - this.box.y) * this.res));
      this.covered[i] = d[(py * W + px) * 4 + 3] > 40 ? 1 : 0;
    });
    return this.cover;
  }
  inside(x, y) {
    if (!this.mask) return x >= this.box.x && y >= this.box.y && x <= this.box.x + this.box.w && y <= this.box.y + this.box.h;
    const [px, py] = this.px(x, y);
    if (px < 0 || py < 0 || px >= this.mask.width || py >= this.mask.height) return false;
    return this.mask.getContext('2d').getImageData(px | 0, py | 0, 1, 1).data[3] > 100;
  }
  /** Keep only what lies inside the shape, around (x, y). */
  clip(x, y, r) {
    if (!this.mask) return;
    const [px, py] = this.px(x, y), pr = r * this.res + 2;
    const g = this.g;
    g.save();
    g.beginPath(); g.rect(px - pr, py - pr, pr * 2, pr * 2); g.clip();
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(this.mask, 0, 0);
    g.restore();
  }
  /**
   * One dab. `paint` is a colour, a CanvasGradient/pattern made with this.g, or a function (g, px, py, pr) that draws it.
   * soft: 0 = hard edge, 1 = fully feathered. Returns the coverage now.
   */
  dab(x, y, r, paint, { soft = 0.35, alpha = 1, from = null } = {}) {
    const g = this.g, [px, py] = this.px(x, y), pr = r * this.res;
    g.save();
    g.globalAlpha = alpha;
    const pts = [[px, py]];
    if (from) {
      // fill the gap since the last dab so a fast stroke stays solid
      const [fx, fy] = this.px(from.x, from.y), d = Math.hypot(px - fx, py - fy), n = Math.floor(d / (pr * 0.35));
      for (let i = 1; i < n; i++) pts.push([fx + (px - fx) * i / n, fy + (py - fy) * i / n]);
    }
    for (const [qx, qy] of pts) {
      if (typeof paint === 'function') { paint(g, qx, qy, pr); continue; }
      if (soft > 0 && typeof paint === 'string') {
        const grad = g.createRadialGradient(qx, qy, pr * (1 - soft), qx, qy, pr);
        grad.addColorStop(0, paint); grad.addColorStop(1, transparent(paint));
        g.fillStyle = grad;
      } else g.fillStyle = paint;
      g.beginPath(); g.arc(qx, qy, pr, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    const span = from ? Math.max(Math.abs(x - from.x), Math.abs(y - from.y)) / 2 + r : r;
    this.clip((from ? (x + from.x) / 2 : x), (from ? (y + from.y) / 2 : y), span + 2);
    this.mark(x, y, r * 0.95, true);
    if (from) this.mark((x + from.x) / 2, (y + from.y) / 2, r * 0.95, true);
    return this.cover;
  }
  /** Rub paint away around (x, y). Returns how much is still covered. */
  erase(x, y, r, { soft = 0.4, strength = 1 } = {}) {
    const g = this.g, [px, py] = this.px(x, y), pr = r * this.res;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    const grad = g.createRadialGradient(px, py, pr * (1 - soft), px, py, pr);
    grad.addColorStop(0, `rgba(0,0,0,${strength})`); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
    g.restore();
    if (strength >= 0.5) this.mark(x, y, r * 0.8, false);
    return this.cover;
  }
  /** One even coat over the whole shape (a colour, a gradient made with this.g, or a draw function). */
  fill(paint) {
    const g = this.g;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (typeof paint === 'function') paint(g, this.canvas.width, this.canvas.height);
    else { g.fillStyle = paint; g.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    if (this.mask) { g.save(); g.globalCompositeOperation = 'destination-in'; g.drawImage(this.mask, 0, 0); g.restore(); }
    if (!this.samples) this.sample();
    this.covered.fill(1);
  }
  /** Draw a picture into the layer (a sticker on a nail), clipped to the shape. */
  stamp(img, x, y, w, h, rot = 0) {
    const g = this.g, [px, py] = this.px(x, y);
    g.save();
    g.translate(px, py); g.rotate(rot);
    g.drawImage(img, -w * this.res / 2, -h * this.res / 2, w * this.res, h * this.res);
    g.restore();
    this.clip(x, y, Math.max(w, h));
  }
  clear() {
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.covered) this.covered.fill(0);
  }
  /** Start measuring again (a new colour is going over the old one) without wiping the old paint. */
  recoat() { if (this.covered) this.covered.fill(0); }
  /** A copy of what is painted, to keep with the customer's look. */
  snapshot(type = 'image/webp') { return this.canvas.toDataURL(type, 0.85); }
  restore(url) {
    return new Promise((done) => {
      if (!url) { done(); return; }
      const img = new Image();
      img.onload = () => { this.g.drawImage(img, 0, 0, this.canvas.width, this.canvas.height); if (!this.samples) this.sample(); this.covered.fill(1); done(); };
      img.onerror = done;
      img.src = url;
    });
  }
  remove() { this.canvas.remove(); }
}

/** The same colour with no opacity (for soft brush edges). */
export function transparent(col) {
  if (col.startsWith('#')) {
    const v = col.length === 4 ? col.slice(1).split('').map((c) => c + c).join('') : col.slice(1, 7);
    return `rgba(${parseInt(v.slice(0, 2), 16)},${parseInt(v.slice(2, 4), 16)},${parseInt(v.slice(4, 6), 16)},0)`;
  }
  if (col.startsWith('rgba')) return col.replace(/,[^,]*\)$/, ',0)');
  if (col.startsWith('rgb')) return col.replace('rgb', 'rgba').replace(')', ',0)');
  return 'rgba(0,0,0,0)';
}

/** Load a picture once and keep it (for masks, stamps and canvas work). */
const cache = new Map();
export function image(src) {
  if (!cache.has(src)) {
    cache.set(src, new Promise((done, fail) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => done(img);
      img.onerror = () => fail(new Error(`missing ${src}`));
      img.src = src;
    }));
  }
  return cache.get(src);
}
