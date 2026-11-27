// The customers and what each of them has had done. One customer at a time is in the salon;
// every room reads her look when it opens and writes back what it changed when she leaves.
import { store } from '../core.js';

/** Six customers: one drawing, six people (skin, eyes, the hair they walk in with). */
export const CUSTOMERS = [
  { name: '朵朵', skin: '#fcc9b1', eyeCol: '#55230c', hair: 'bob', hairCol: '#8a5233', freckles: true },
  { name: '米雅', skin: '#fbd6c0', eyeCol: '#3f7fd0', hair: 'long', hairCol: '#e8c25a' },
  { name: '可可', skin: '#8f5c3e', eyeCol: '#4a2a18', hair: 'curly', hairCol: '#2e2422' },
  { name: '小桃', skin: '#e9b48c', eyeCol: '#3f9a5a', hair: 'pigtails', hairCol: '#d0612e', freckles: true },
  { name: '艾拉', skin: '#c98d64', eyeCol: '#a8742a', hair: 'buns', hairCol: '#4a2e22' },
  { name: '露露', skin: '#b57a52', eyeCol: '#5a3220', hair: 'ponytail', hairCol: '#3a2840' },
];

const data = () => store.data.salon2 || (store.data.salon2 = { who: 0, looks: {} });

export const whoIndex = () => data().who % CUSTOMERS.length;
export const customer = () => CUSTOMERS[whoIndex()];
export function nextCustomer() { return setWho(whoIndex() + 1); }
/** Make customer i the one in the salon. */
export function setWho(i) { data().who = ((i % CUSTOMERS.length) + CUSTOMERS.length) % CUSTOMERS.length; store.save(); return customer(); }
/** Customer i's look, without making her the one in the salon. */
export function lookOf(i) { const s = data(); return s.looks[i] || { done: {} }; }

/** Everything the customer of the moment has had done so far. */
export function look() {
  const s = data(), i = whoIndex();
  return s.looks[i] || (s.looks[i] = { done: {} });
}
/** A room is finished: keep what it changed (a shallow merge per part). */
export function saveLook(zone, patch = {}) {
  keepLook(patch);
  look().done = { ...look().done, [zone]: true };
  try { store.save(); } catch { /* storage full: the look lives on until the page closes */ }
}
/** Keep a change as it happens, before the room is finished (clothes stay on if she leaves the room and comes back). */
export function keepLook(patch = {}) {
  const l = look();
  for (const [k, v] of Object.entries(patch)) l[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(l[k] || {}), ...v } : v;
  try { store.save(); } catch { /* storage full: the look lives on until the page closes */ }
}
/** What each room changes on her: playing a room again starts that part over. */
const ZONES = { facial: { face: ['glow'] }, hair: ['hair', 'hairAcc'], makeup: { face: ['shadow', 'blush', 'lips', 'gloss', 'brows', 'lashes', 'lens', 'stickers'] }, nails: ['nails'], dressup: ['wear'] };
export function clearZone(zone) {
  const l = look(), z = ZONES[zone];
  if (!z) return;
  if (Array.isArray(z)) for (const k of z) delete l[k];
  else for (const [k, list] of Object.entries(z)) if (l[k]) for (const x of list) delete l[k][x];
  try { store.save(); } catch { /* storage full */ }
}
export function resetLook() { data().looks[whoIndex()] = { done: {} }; store.save(); }
/** Her hair as the hair module expects it: what she walked in with, unless a stylist changed it. */
export function hairOf(l = look(), c = customer()) { return l.hair || { style: c.hair, color: c.hairCol }; }
