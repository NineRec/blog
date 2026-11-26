// The customer from head to toe, for the style studio and the lobby: the full-body picture without its
// own head, and on its neck the bust head with everything the other rooms did to her (hair, makeup,
// accessories). Clothes, shoes, hats, glasses, things in her hand and on her back go on as layers.
import { el, anim } from '../core.js';
import { BODY, BUST, PROPS } from './manifest.js';
import { ART } from './ui.js';
import { Rig } from './rig.js';
import { dressBust, placeOn } from './room.js';

/** Where the two pictures meet (body and bust units): chin, the neck's middle, and where each is cut. */
const NECK = { body: { x: 510, chin: 557, cut: 566 }, bust: { x: 623, chin: 860, cut: 898, fade: 18 } };
/** The bust head drawn on the body this much smaller. */
const HEAD_K = 0.7;
/** Body landmarks (body units). */
export const BODY_ANCHORS = { handR: [842, 968], handL: [180, 968], feet: [510, 1460], waist: [510, 960], chest: [510, 720], head: [510, 300], neck: [510, 590] };
/** Layer order on the body, bottom to top. */
const BODY_SLOTS = ['back', 'held', 'base', 'shoes', 'bottom', 'top', 'dress', 'neck', 'head', 'hand', 'fx'];

/** What can be worn and where it goes. */
export const WEAR = {
  dress: keys('dress-'), top: keys('top-'), bottom: keys('bottom-'), shoes: keys('shoes-'), back: keys('back-'),
  hat: ['hat-sun', 'hat-beret', 'hat-party', 'hat-cap', 'hat-beanie', 'hat-unicorn', 'tiara', 'catears'].filter((k) => PROPS[k]),
  glasses: Object.keys(PROPS).filter((k) => k.startsWith('gl-')),
  hand: Object.keys(PROPS).filter((k) => k.startsWith('hold-')),
};
function keys(prefix) { return Object.keys(BODY.wear || {}).filter((k) => k.startsWith(prefix)); }

/** Hats: width, where the lower edge sits (bust units) and a tilt. */
const HATS = {
  'hat-sun': [880, 385, -4], 'hat-beret': [660, 335, -8], 'hat-party': [300, 250, -10], 'hat-cap': [680, 385, 0], 'hat-beanie': [680, 405, 0],
  'hat-unicorn': [700, 470, 0], tiara: [400, 300, 0], catears: [720, 470, 0],
};
/** Things to hold: width (body units) and where the hand grips it (0 top .. 1 bottom of the picture). */
const HOLD = { 'hold-balloon': [360, 0.98], 'hold-umbrella': [500, 0.92], 'hold-flowers': [320, 0.86], 'hold-wand': [240, 0.86], 'hold-lollipop': [250, 0.88], 'hold-icecream': [220, 0.86], 'hold-bag': [330, 0.12], 'hold-teddy': [340, 0.3] };
/**
 * How a prop sits on her: rig ('head' or 'body'), slot, {x, y} centre, width in that rig's units, tilt. Things in her
 * hand go behind the body picture, so her fingers close over the stick, string or handle.
 */
const PLACE = {
  hat: (k) => { const [w, bottom, r] = HATS[k] || [700, 320, 0], h = w * PROPS[k].h / PROPS[k].w; return { rig: 'head', slot: 'top', x: 627, y: bottom - h / 2, w, r }; },
  glasses: () => ({ rig: 'head', slot: 'top', x: 624, y: 600, w: 600 }),
  hand: (k) => { const [w, grip] = HOLD[k] || [220, 0.85], h = w * PROPS[k].h / PROPS[k].w; return { rig: 'body', slot: 'held', x: BODY_ANCHORS.handR[0] + 4, y: BODY_ANCHORS.handR[1] + 10 - h * (grip - 0.5), w }; },
};

export class Doll {
  /** place: {cx, bottom, height} on the stage; who: the customer; look: her look. */
  constructor(ctx, place, who, look) {
    this.ctx = ctx; this.who = who; this.look = look;
    this.body = new Rig(ctx, { ...BODY, slots: BODY_SLOTS, anchors: BODY_ANCHORS }, { ...place, cls: `sl-doll ${place.cls || ''}` }, { skin: who.skin });
    this.body.blinking = false;
    this.worn = {};
    this.nodes = {};
    this.ready = this.build();
  }
  async build() {
    const { ctx, body } = this;
    await body.ready;
    // her own head goes: the body is cut just under its chin
    const bs = body.slots.base.style;
    bs.webkitMaskImage = bs.maskImage = `linear-gradient(to bottom, transparent ${NECK.body.cut - 8}px, #000 ${NECK.body.cut + 8}px)`;
    const [W, H] = BUST.size, k = HEAD_K;
    this.head = new Rig(ctx, BUST, { parent: body.slots.head, cls: 'sl-head', cx: NECK.body.x + k * (W / 2 - NECK.bust.x), bottom: NECK.body.chin + k * (H - NECK.bust.chin), height: H * k },
      { skin: this.who.skin, eyeCol: this.look.face?.lens || this.who.eyeCol });
    await this.head.ready;
    // the bust is cut just under its chin too, and fades into the body's neck
    const b = this.head.slots.base.style, cut = NECK.bust.cut;
    b.clipPath = `inset(0 0 ${H - cut}px 0)`;
    b.webkitMaskImage = b.maskImage = `linear-gradient(to bottom, #000 ${cut - NECK.bust.fade}px, transparent ${cut}px)`;
    const { face, hair } = await dressBust(this.head, this.who, this.look);
    this.face = face; this.hair = hair;
    for (const [slot, key] of Object.entries(this.look.wear || {})) if (key) await this.wear(slot, key, true);
  }
  /** Put something on (replacing what was in that slot); quiet = no animation. Returns the node. */
  async wear(slot, key, quiet = false) {
    this.off(slot, true);
    if (slot === 'dress') { this.off('top', true); this.off('bottom', true); }
    if (slot === 'top' || slot === 'bottom') this.off('dress', true);
    let node;
    const hat = slot === 'hat' && BUST.hats?.[key], hold = slot === 'hand' && BODY.hold?.[key];
    if (BODY.wear?.[key]) {
      node = await this.body.layer(slot, BODY.wear[key], `sl-wear sl-wear-${slot}`);
      // a cape is the whole cape behind her plus the part over her shoulders (its knot), above her clothes
      if (BODY.wear[key].front) node.front = await this.body.layer('neck', BODY.wear[key].front, `sl-wear sl-wear-${slot}-front`);
      // a fitted dress: the vest and shorts of the body picture that would show beside it are hidden
      if (BODY.wear[key].keep) this.mask(this.body, ['base'], BODY.wear[key].keep, slot);
    } else if (hat) {
      // drawn on her head, and the hair it covers is hidden
      node = await this.head.layer('top', { ...hat, skin: false }, `sl-wear sl-wear-${slot}`);
      this.mask(this.head, ['hair', 'back'], hat.keep, 'hat');
    } else if (hold) {
      // drawn in her hand, fingers closed round it; the open hand of the body picture is hidden
      node = await this.body.layer('hand', hold, `sl-wear sl-wear-${slot}`);
      this.mask(this.body, ['base'], hold.keep, 'hand');
    } else {
      const p = PLACE[slot](key), rig = p.rig === 'head' ? this.head : this.body;
      node = placeOn(rig, p.slot, { key, x: p.x, y: p.y, s: 1, r: p.r || 0 }, p.w);
      node.classList.add('sl-wear', `sl-wear-${slot}`);
    }
    if (slot === 'hat') this.crown(false);
    node.dataset.slot = slot;
    node.dataset.key = key;
    this.worn[slot] = key;
    this.nodes[slot] = node;
    if (!quiet) { anim(node, 'squash', 420); if (node.front) anim(node.front, 'squash', 420); }
    return node;
  }
  /**
   * Hide part of some slots with a keep picture (opaque where they still show), on behalf of `owner` (the slot of
   * the thing worn); src null takes that owner's picture away. Several owners' pictures are intersected (a fitted
   * dress and a balloon in her hand both hide part of the body). The body's base picture is masked itself (the keep
   * picture covers just it), so the neck cut on its slot stays.
   */
  mask(rig, slots, src, owner = '') {
    for (const name of slots) {
      const n = name === 'base' ? rig.slots.base.firstElementChild : rig.slots[name];
      if (!n) continue;
      const keeps = (n.keeps ||= {});
      if (src) keeps[owner] = src; else delete keeps[owner];
      const all = Object.values(keeps), st = n.style;
      st.webkitMaskImage = st.maskImage = all.map((s) => `url("${ART + s}")`).join(', ');
      st.webkitMaskSize = st.maskSize = all.map(() => '100% 100%').join(', ');
      st.webkitMaskRepeat = st.maskRepeat = all.map(() => 'no-repeat').join(', ');
      st.maskComposite = all.map(() => 'intersect').join(', ');
      st.webkitMaskComposite = all.map(() => 'source-in').join(', ');
    }
  }
  /** Show or hide the hair room's things on top of her head (a tiara, a bow): a hat goes on instead of them. */
  crown(show) {
    for (const n of this.head?.slots.top.querySelectorAll('.sl-stuck:not(.sl-wear)') || []) if (n.save && n.save().y < 420) n.style.visibility = show ? '' : 'hidden';
  }
  /** Take off what is in a slot. */
  off(slot, quiet = false) {
    if (slot === 'hat' && this.nodes.hat) this.crown(true);
    if (slot === 'hat' && BUST.hats?.[this.worn.hat]) this.mask(this.head, ['hair', 'back'], null, 'hat');
    if (slot === 'hand' && BODY.hold?.[this.worn.hand]) this.mask(this.body, ['base'], null, 'hand');
    if (BODY.wear?.[this.worn[slot]]?.keep) this.mask(this.body, ['base'], null, slot);
    const node = this.nodes[slot];
    delete this.worn[slot];
    delete this.nodes[slot];
    if (!node) return;
    for (const n of [node, node.front].filter(Boolean)) {
      if (quiet) n.remove();
      else anim(n, 'out', 220, { fill: 'forwards' }).then(() => n.remove());
    }
  }
  /** Which slot's clothes are under a stage point (topmost first), or null. */
  slotAt(p) {
    const order = ['hand', 'glasses', 'hat', 'dress', 'top', 'bottom', 'shoes', 'back'];
    for (const slot of order) {
      const n = this.nodes[slot];
      if (!n) continue;
      const r = n.getBoundingClientRect(), a = this.ctx.point({ clientX: r.left, clientY: r.top }), b = this.ctx.point({ clientX: r.right, clientY: r.bottom });
      if (p.x > a.x && p.x < b.x && p.y > a.y && p.y < b.y && opaqueAt(n, (p.x - a.x) / (b.x - a.x), (p.y - a.y) / (b.y - a.y))) return slot;
    }
    return null;
  }
  mood(name, ms) { this.head?.mood(name, ms); }
  react(kind) { return this.body.react(kind); }
  /** A stage point for a body landmark. */
  anchor(name) { return this.body.anchor(name); }
  /** A stage point on the head (bust units). */
  headPoint(x, y) { const p = this.head.stage(x, y); return this.body.stage(p.x, p.y); }
  remove() { this.body.remove(); }
  get node() { return this.body.node; }
  /** A spin: she twirls round once (squeezes thin and back). */
  spin() { return this.body.pose.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(-1)' }, { transform: 'scaleX(1)' }], { duration: 700, easing: 'ease-in-out' }).finished.catch(() => {}); }
}

/** Is the picture solid at (u, v) (0..1 across it)? Clothes are tapped only where they are drawn. */
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
function opaqueAt(node, u, v) {
  const src = node.tagName === 'IMG' || node.tagName === 'CANVAS' ? node : node.querySelector('img');
  if (!src || (src.tagName === 'IMG' && !src.complete)) return true;
  const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
  probe.canvas.width = 1; probe.canvas.height = 1;
  probe.clearRect(0, 0, 1, 1);
  try { probe.drawImage(src, Math.floor(u * w), Math.floor(v * h), 1, 1, 0, 0, 1, 1); return probe.getImageData(0, 0, 1, 1).data[3] > 40; } catch { return true; }
}

void el;
