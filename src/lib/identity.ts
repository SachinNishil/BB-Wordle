import { load, save } from './storage';
import type { Slot } from './types';

// Who is playing on this device ("I am Sachin / I am Menaka") is a setting.
// Since v1.2 there is no room key or invite link.
const KEY_SLOT = 'bbw.slot';
const KEY_DEVICE = 'bbw.device';

/** Old v1.0/v1.1 invite links (#room=…) still open the app; tidy the address bar. */
export function stripLegacyInvite() {
  if (/room=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  try {
    localStorage.removeItem('bbw.roomKey');
  } catch {
    /* ignore */
  }
}

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
