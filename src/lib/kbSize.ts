// v1.20: how big the Wordle keyboard is on this phone (Settings › Keyboard size).
// The board fills whatever room is left, so it grows or shrinks to match.
import { load, save } from './storage';

const KEY = 'bbw.kbScale';
export const KB_MIN = 0.8;
export const KB_MAX = 1.3;

export function getKbScale(): number {
  const v = Number(load<number>(KEY, 1));
  return Number.isFinite(v) ? Math.min(KB_MAX, Math.max(KB_MIN, v)) : 1;
}

export function applyKbScale(v = getKbScale()) {
  document.documentElement.style.setProperty('--kscale', String(v));
}

export function setKbScale(v: number) {
  const x = Math.round(Math.min(KB_MAX, Math.max(KB_MIN, v)) * 100) / 100;
  save(KEY, x);
  applyKbScale(x);
}
