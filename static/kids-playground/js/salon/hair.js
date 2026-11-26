// Hair on a customer: a painted hairstyle that can be cut shorter and grown back, dyed in patches
// (half pink, rainbow, coloured tips), sprinkled with glitter, made wet and messy, combed smooth.
// The length is kept as a profile: for every column, how far down the hair still reaches.
import { el, rand } from '../core.js';
import { ART } from './ui.js';
import { image } from './paint.js';
import { tinted } from './tint.js';

const off = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const BIN = 6;                  // width of one column of the length profile, in character units

export class Hair {
  /** rig: the Rig; styles: manifest hair entries ({src, x, y, w, h, top}); o.res: canvas density. */
  constructor(rig, styles, o = {}) {
    this.rig = rig; this.styles = styles; this.res = o.res ?? 1;
    this.canvas = rig.add(o.slot || 'hair', el('canvas', { class: 'sl-hair' }));
    this.fuzz = rig.add(o.slot || 'hair', el('canvas', { class: 'sl-hair sl-fuzz' }));
    this.glits = rig.add('top', el('div', { class: 'sl-glits' }));
    this.dyes = [];
    this.color = null;
    this.key = null;
    this.dirty = true;
    this.messy = 0;
    rig.ctx.loop(() => { if (this.dirty) this.render(); });
  }
  get spec() { return this.styles[this.key]; }
  /** Change style; length, dye and glitter start fresh. */
  async setStyle(key, color = this.color) {
    this.key = key; this.color = color;
    const s = this.spec;
    this.img = await image(ART + s.src);
    if (this.key !== key) return;
    const w = Math.ceil(s.w * this.res), h = Math.ceil(s.h * this.res);
    for (const c of [this.canvas, this.fuzz]) {
      c.width = w; c.height = h;
      Object.assign(c.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px`, height: `${s.h}px` });
    }
    this.cols = new Float32Array(Math.ceil(s.w / BIN) + 1).fill(s.y + s.h);
    this.dyes = [];
    this.glits.innerHTML = '';
    this.dirty = true;
  }
  /** Dye everything one colour (null = the hairstyle's own brown). Earlier patches of dye are kept on top unless `wash`. */
  recolor(color, wash = true) { this.color = color; if (wash) this.dyes = []; this.dirty = true; }
  base() { return this.color ? tinted(this.img, this.color, { scale: this.res }) : this.img; }
  /** How far down the hair reaches at character x. */
  bottom(x) { const i = Math.round((x - this.spec.x) / BIN); return this.cols[Math.max(0, Math.min(this.cols.length - 1, i))]; }
  inHair(x, y) {
    const s = this.spec;
    if (!s || x < s.x || y < s.y || x > s.x + s.w || y > this.bottom(x)) return false;
    const c = this.alphaAt(x, y);
    return c > 60;
  }
  alphaAt(x, y) {
    if (!this.probe) { this.probe = off(1, 1).getContext('2d', { willReadFrequently: true }); }
    const s = this.spec, g = this.probe;
    g.clearRect(0, 0, 1, 1);
    g.drawImage(this.img, (x - s.x) / s.w * this.img.naturalWidth, (y - s.y) / s.h * this.img.naturalHeight, 1, 1, 0, 0, 1, 1);
    return g.getImageData(0, 0, 1, 1).data[3];
  }
  /**
   * Scissors went from a to b (character units): everything under that line is cut off and falls.
   * Hair above `minY` (the top of the head) never gets cut. Returns how much was cut (units²).
   */
  cut(a, b, minY) {
    const s = this.spec;
    if (!s) return 0;
    const [l, r] = a.x < b.x ? [a, b] : [b, a];
    const i0 = Math.max(0, Math.floor((l.x - s.x) / BIN)), i1 = Math.min(this.cols.length - 1, Math.ceil((r.x - s.x) / BIN));
    let cutArea = 0;
    const before = this.cols.slice();
    for (let i = i0; i <= i1; i++) {
      const x = s.x + i * BIN, t = r.x === l.x ? 0.5 : (x - l.x) / (r.x - l.x);
      const y = Math.max(minY, l.y + (r.y - l.y) * Math.max(0, Math.min(1, t)));
      if (y < this.cols[i] - 4) { cutArea += (this.cols[i] - y) * BIN; this.cols[i] = y; }
    }
    if (cutArea > 300) this.drop(before, i0, i1);
    for (const g of [...this.glits.children]) if (+g.dataset.y > this.bottom(+g.dataset.x)) g.remove();
    this.dirty = true;
    return cutArea;
  }
  /** The piece that was cut off falls to the floor. */
  drop(before, i0, i1) {
    const s = this.spec, top = Math.min(...this.cols.slice(i0, i1 + 1)), bot = Math.max(...before.slice(i0, i1 + 1));
    const x0 = s.x + i0 * BIN, w = (i1 - i0 + 1) * BIN, h = bot - top;
    if (w < 4 || h < 4) return;
    const c = off(Math.ceil(w * this.res), Math.ceil(h * this.res)), g = c.getContext('2d');
    g.save();
    g.beginPath();
    for (let i = i0; i <= i1; i++) {
      const x = (i - i0) * BIN * this.res;
      g.rect(x, (this.cols[i] - top) * this.res, BIN * this.res + 0.6, (before[i] - this.cols[i]) * this.res);
    }
    g.clip();
    g.drawImage(this.canvas.width ? this.composite() : this.base(), (s.x - x0) * this.res, (s.y - top) * this.res, s.w * this.res, s.h * this.res);
    g.restore();
    Object.assign(c.style, { position: 'absolute', left: `${x0}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
    this.rig.add('fx', c);
    const dx = rand(-60, 60), turn = rand(-40, 40);
    c.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${dx * 0.4}px, 120px) rotate(${turn * 0.3}deg)`, opacity: 1, offset: 0.35 }, { transform: `translate(${dx}px, 700px) rotate(${turn}deg)`, opacity: 0 }], { duration: 1300, easing: 'cubic-bezier(.4,0,.9,.6)' })
      .finished.then(() => c.remove(), () => c.remove());
  }
  /** Grow tonic at character x: the hair there gets longer, up to the hairstyle's full length. Returns true if anything grew. */
  grow(x, amount, reach = 90) {
    const s = this.spec, full = s.y + s.h;
    let grew = false;
    for (let i = 0; i < this.cols.length; i++) {
      const cx = s.x + i * BIN, d = Math.abs(cx - x);
      if (d > reach || this.cols[i] >= full) continue;
      this.cols[i] = Math.min(full, this.cols[i] + amount * (1 - d / reach));
      grew = true;
    }
    // neighbouring columns follow a little so the ends stay smooth
    for (let i = 1; i < this.cols.length - 1; i++) this.cols[i] = Math.min(full, Math.max(this.cols[i], (this.cols[i - 1] + this.cols[i + 1]) / 2 - 8));
    this.dirty = this.dirty || grew;
    return grew;
  }
  /** Spray dye at (x, y): `col` is a colour, or a list of colours down the hair (ombre / rainbow). */
  dye(x, y, col, r = 70) {
    const key = Array.isArray(col) ? col.join(',') : col;
    let d = this.dyes.find((v) => v.key === key);
    if (!d) {
      d = { key, col, mask: off(this.canvas.width, this.canvas.height) };
      this.dyes.push(d);
    } else if (this.dyes[this.dyes.length - 1] !== d) {
      // the newest dye goes on top
      this.dyes.splice(this.dyes.indexOf(d), 1); this.dyes.push(d);
    }
    // other colours give way where this one goes on
    for (const o of this.dyes) if (o !== d) dab(o.mask, this.spec, this.res, x, y, r, 'destination-out');
    dab(d.mask, this.spec, this.res, x, y, r, 'source-over');
    this.dirty = true;
  }
  /** Stick a sparkle where the glitter landed (only on hair). */
  glitter(x, y, col) {
    if (!this.inHair(x, y) || this.glits.children.length > 90) return false;
    const n = el('i', { class: 'sl-glit', style: { left: `${x}px`, top: `${y}px`, '--c': col, animationDelay: `${-rand(0, 1.6)}s`, transform: `translate(-50%,-50%) scale(${rand(0.6, 1.25)}) rotate(${rand(0, 90)}deg)` } });
    n.dataset.x = x; n.dataset.y = y;
    this.glits.append(n);
    return true;
  }
  /** Wet hair is darker and flatter. */
  wet(on) { this.canvas.classList.toggle('wet', on); }
  /** 0 = smooth, 1 = a mess (a fuzzy, puffed-out copy around the hair). */
  setMessy(v) { this.messy = Math.max(0, Math.min(1, v)); this.fuzz.style.opacity = this.messy; if (this.messy && !this.fuzzDrawn) this.dirty = true; }
  composite() {
    const c = this.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(this.base(), 0, 0, c.width, c.height);
    for (const d of this.dyes) {
      const t = this.scratch || (this.scratch = off(c.width, c.height));
      if (t.width !== c.width || t.height !== c.height) { t.width = c.width; t.height = c.height; }
      const tg = t.getContext('2d');
      tg.globalCompositeOperation = 'source-over';
      tg.clearRect(0, 0, t.width, t.height);
      tg.drawImage(d.mask, 0, 0);
      tg.globalCompositeOperation = 'source-in';
      tg.drawImage(tinted(this.img, d.col, { scale: this.res }), 0, 0, t.width, t.height);
      g.drawImage(t, 0, 0);
    }
    // the length: keep only what is above each column's end
    const s = this.spec;
    g.save();
    g.globalCompositeOperation = 'destination-in';
    g.beginPath();
    for (let i = 0; i < this.cols.length; i++) g.rect(i * BIN * this.res, 0, BIN * this.res + 0.6, (this.cols[i] - s.y) * this.res);
    g.fillStyle = '#000';
    g.fill();
    g.restore();
    return c;
  }
  render() {
    if (!this.img || !this.spec) return;
    this.dirty = false;
    this.composite();
    const f = this.fuzz, fg = f.getContext('2d');
    fg.clearRect(0, 0, f.width, f.height);
    if (this.messy > 0) {
      // the hair drawn again a little bigger and turned both ways: frizz
      for (const [sx, rot] of [[1.035, 0.045], [1.03, -0.05], [1.045, 0.0]]) {
        fg.save();
        fg.globalAlpha = 0.42;
        fg.translate(f.width / 2, f.height * 0.4); fg.rotate(rot); fg.scale(sx, sx * 1.01); fg.translate(-f.width / 2, -f.height * 0.4);
        fg.drawImage(this.canvas, 0, 0);
        fg.restore();
      }
      this.fuzzDrawn = true;
    }
  }
  /** What to remember about her hair. */
  save() {
    return { style: this.key, color: this.color, cols: Array.from(this.cols, (v) => Math.round(v)), dyes: this.dyes.map((d) => ({ col: d.col, mask: d.mask.toDataURL('image/webp', 0.6) })), glits: [...this.glits.children].map((g) => [+g.dataset.x, +g.dataset.y, g.style.getPropertyValue('--c')]) };
  }
  async load(saved) {
    if (!saved?.style || !this.styles[saved.style]) return;
    await this.setStyle(saved.style, saved.color || null);
    if (saved.cols?.length === this.cols.length) this.cols.set(saved.cols);
    for (const d of saved.dyes || []) {
      const mask = off(this.canvas.width, this.canvas.height);
      try { const im = await image(d.mask); mask.getContext('2d').drawImage(im, 0, 0, mask.width, mask.height); } catch { continue; }
      this.dyes.push({ key: Array.isArray(d.col) ? d.col.join(',') : d.col, col: d.col, mask });
    }
    for (const [x, y, c] of saved.glits || []) this.glitter(x, y, c);
    this.dirty = true;
  }
}

function dab(mask, s, res, x, y, r, op) {
  const g = mask.getContext('2d'), px = (x - s.x) * res, py = (y - s.y) * res, pr = r * res;
  g.save();
  g.globalCompositeOperation = op;
  const grad = g.createRadialGradient(px, py, pr * 0.35, px, py, pr);
  grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
  g.restore();
}
