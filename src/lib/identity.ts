import { load, save } from './storage';
import type { Slot } from './types';

// The room key arrives once via the invite link (…/#room=<key>) and is kept
// on this device. The player ("I am Sachin / I am Menaka") is a setting.
const KEY_ROOM = 'bbw.roomKey';
const KEY_SLOT = 'bbw.slot';
const KEY_DEVICE = 'bbw.device';

export function readRoomKeyFromUrl(): string | null {
  const m = location.hash.match(/room=([0-9a-f]{64})/i);
  if (!m) return null;
  // Strip the key from the address bar so it isn't left on screen.
  history.replaceState(null, '', location.pathname + location.search);
  return m[1].toLowerCase();
}

export const getRoomKey = () => load<string | null>(KEY_ROOM, null);
export const setRoomKey = (k: string | null) => save(KEY_ROOM, k);
export const getSlot = () => load<Slot | null>(KEY_SLOT, null);
export const setSlot = (s: Slot | null) => save(KEY_SLOT, s);

export function deviceId(): string {
  let id = load<string | null>(KEY_DEVICE, null);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    save(KEY_DEVICE, id);
  }
  return id;
}

export function inviteLink(key: string) {
  return `${location.origin}${location.pathname}#room=${key}`;
}

/** Accepts a full invite link or a bare key. */
export function parseInvite(text: string): string | null {
  const m = text.trim().match(/([0-9a-f]{64})/i);
  return m ? m[1].toLowerCase() : null;
}
