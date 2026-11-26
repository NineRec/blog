// The frame every salon room shares: a painted room behind, a shelf down the right side with tabs
// and things to pick, a big green tick to finish, a dashed ring that shows where to work next.
import { el, anim, icon, roundButton } from '../core.js';
import { sfx, unlock } from '../audio.js';

export const ART = 'assets/salon/';
export const img = (name, cls = '') => `<img class="${cls}" src="${ART}${name}" alt="" draggable="false">`;

/** The room picture behind everything. */
export function backdrop(ctx, name) {
  const node = ctx.add(el('div', { class: 'sl-backdrop', html: img(name) }));
  node.style.width = `${ctx.W}px`;
  return node;
}

/**
 * The shelf on the right. tabs: [{key, art, label}]. setItems() fills the grid for the open tab.
 * An item is either tapped (a hairstyle, a dress) or pulled out onto the stage (a sticker, a brush).
 */
export class Shelf {
  constructor(ctx, { tabs, color = '#ff8fc4', onTab, width = 300 } = {}) {
    this.ctx = ctx;
    this.node = ctx.add(el('div', { class: 'sl-shelf no-rub', style: { '--shelf': color, left: `${ctx.W - width - 18}px`, width: `${width}px` } }));
    this.grid = this.node.appendChild(el('div', { class: 'sl-items' }));
    this.tabsNode = this.node.appendChild(el('div', { class: 'sl-tabs' }));
    this.onTab = onTab;
    this.tab = null;
    this.tabs = tabs || [];
    for (const t of this.tabs) {
      const b = this.tabsNode.appendChild(el('button', { class: 'sl-tab', type: 'button', 'aria-label': t.label || t.key, 'data-tab': t.key, html: t.art }));
      b.addEventListener('click', () => { unlock(); this.open(t.key); });
    }
    if (!this.tabs.length) this.node.classList.add('no-tabs');
    anim(this.node, 'slide-in', 420);
  }
  open(key, quiet = false) {
    if (this.tab === key) return;
    this.tab = key;
    if (!quiet) sfx('tap');
    for (const b of this.tabsNode.children) b.classList.toggle('on', b.dataset.tab === key);
    this.onTab?.(key);
  }
  /**
   * list: [{key, art, cls}]. o.tap(key, node) for tapped items; o.drag = {start, move, drop} for pulled ones,
   * where drop(key, point, ghost) returns true when the thing was used (the ghost then fades, unless the caller sets ghost.dataset.keep).
   * o.on = key of the item that is chosen now.
   */
  setItems(list, o = {}) {
    this.grid.innerHTML = '';
    this.grid.scrollTop = 0;
    this.itemOpts = o;
    list.forEach((it, i) => {
      const b = this.grid.appendChild(el('button', { class: `sl-item ${it.cls || ''} ${o.on === it.key ? 'on' : ''}`, type: 'button', 'data-item': it.key, html: it.art }));
      b.animate([{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 320, delay: i * 28, easing: 'ease-out', fill: 'backwards' });
      if (o.drag) this.pullable(b, it, o.drag);
      else b.addEventListener('click', () => { unlock(); this.select(it.key); o.tap?.(it.key, b); });
    });
  }
  select(key) { for (const b of this.grid.children) b.classList.toggle('on', b.dataset.item === key); }
  item(key) { return this.grid.querySelector(`[data-item="${key}"]`); }
  pullable(b, it, { start, move, drop, size = 120, tip = [0, 0] }) {
    const ctx = this.ctx;
    b.addEventListener('pointerdown', (ev) => {
      if (!ctx.alive) return;
      ev.preventDefault();
      unlock();
      const p0 = ctx.point(ev);
      const ghost = ctx.add(el('div', { class: 'sl-ghost', html: it.ghost || it.art, style: { width: `${size}px`, height: `${size}px` } }));
      const place = (p) => { ghost.style.left = `${p.x - size / 2 - tip[0]}px`; ghost.style.top = `${p.y - size / 2 - tip[1]}px`; };
      place(p0);
      anim(ghost, 'in', 220);
      sfx('pick');
      this.select(it.key);
      start?.(it.key, p0, ghost);
      let last = p0, moved = false;
      const onMove = (e) => {
        const p = ctx.point(e);
        if (Math.hypot(p.x - p0.x, p.y - p0.y) > 8) moved = true;
        place(p); last = p;
        move?.(it.key, p, ghost);
      };
      const onUp = (e) => {
        removeEventListener('pointermove', onMove);
        removeEventListener('pointerup', onUp);
        removeEventListener('pointercancel', onUp);
        if (!ctx.alive) return;
        const p = e.type === 'pointercancel' ? last : ctx.point(e);
        const used = drop?.(it.key, p, ghost, moved);
        // used: the thing went where it was put (the room drew it there), so the one in the hand fades away,
        // unless the room took the ghost over (ghost.dataset.keep)
        if (used) setTimeout(() => { if (!ghost.dataset.keep) ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }).finished.then(() => ghost.remove(), () => ghost.remove()); }, 140);
        if (!used) {
          const r = b.getBoundingClientRect(), s = ctx.scale;
          const home = ctx.point({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
          ghost.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${home.x - p.x}px, ${home.y - p.y}px) scale(.4)`, opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' })
            .finished.then(() => ghost.remove(), () => ghost.remove());
          void s;
        }
      };
      addEventListener('pointermove', onMove);
      addEventListener('pointerup', onUp);
      addEventListener('pointercancel', onUp);
    });
  }
  hide(on = true) { this.node.classList.toggle('away', on); }
  remove() { this.node.remove(); }
}

/** The big green tick that finishes the room. */
export function doneButton(ctx, fn, x = 92, y = ctx.H - 96) {
  const b = ctx.button('check', x, y, 'green sl-done', '做好啦', fn);
  b.classList.add('big');
  anim(b, 'in', 400);
  return b;
}

/** A dashed ring that turns slowly around the place to work on. */
export function guide(ctx, x, y, rx, ry = rx) {
  const node = ctx.add(el('div', { class: 'sl-guide', style: { left: `${x - rx}px`, top: `${y - ry}px`, width: `${rx * 2}px`, height: `${ry * 2}px` } }));
  anim(node, 'in', 300);
  return () => anim(node, 'out', 200, { fill: 'forwards' }).then(() => node.remove());
}

/** A soft word bubble over the customer ("好舒服～"). */
export function bubble(ctx, x, y, text, ms = 1600) {
  const node = ctx.add(el('div', { class: 'sl-bubble', html: text, style: { left: `${x}px`, top: `${y}px` } }));
  anim(node, 'in', 300);
  ctx.after(ms, () => anim(node, 'out', 220, { fill: 'forwards' }).then(() => node.remove()));
  return node;
}

/** A round colour chip for the shelf: plain, two-tone, rainbow or glitter. */
export function chip(col, kind = 'plain') {
  const bg = kind === 'rainbow' ? 'conic-gradient(#ff6b8a,#ffb347,#ffe45c,#7ed957,#5ec8ff,#a78bff,#ff6b8a)'
    : kind === 'glitter' ? `radial-gradient(circle at 30% 30%, #fff 0 8%, transparent 9%), radial-gradient(circle at 70% 60%, #fff 0 6%, transparent 7%), radial-gradient(circle at 45% 75%, #fff 0 5%, transparent 6%), ${col}`
      : Array.isArray(col) ? `linear-gradient(160deg, ${col.join(',')})` : col;
  return `<span class="sl-chip ${kind}" style="background:${bg}"></span>`;
}

export const tick = () => icon('check');
export { roundButton };
