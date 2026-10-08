// One place that decides which trash talk messages are new for this phone
// (v1.5). Messages can arrive three ways: straight over the live channel,
// with the game screen's own refresh, or with the app's background refresh.
// Whichever gets there first shows it; the others see it's already been shown.
// Shown ids are remembered on the phone, so reopening the app doesn't replay
// old messages, while ones sent while you were away still pop up (if recent).
import { serverNow } from './clock';
import { load, save } from './storage';
import type { Slot, Taunt } from './types';

const KEY = 'bbw.tauntsShown';
const RECENT_MS = 10 * 60 * 1000; // don't pop up anything older than 10 minutes
type Shown = Record<string, number[]>; // game id -> taunt ids already shown

let shown: Shown = load<Shown>(KEY, {});
const listeners = new Set<(gameId: string, t: Taunt[]) => void>();

export function onNewTaunts(fn: (gameId: string, t: Taunt[]) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Hand over everything known about a game's trash talk; new messages from the partner pop up. */
export function feedTaunts(gameId: string | undefined, taunts: Taunt[] | undefined, me: Slot | null) {
  if (!gameId || !taunts?.length || !me) return;
  const seen = new Set(shown[gameId] ?? []);
  const fresh: Taunt[] = [];
  let changed = false;
  for (const t of taunts) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    changed = true;
    const at = Date.parse(t.at);
    if (t.from !== me && (!Number.isFinite(at) || serverNow() - at < RECENT_MS)) fresh.push(t);
  }
  if (!changed) return;
  // Keep the record small: the last 60 ids of the last 6 games.
  const next: Shown = { [gameId]: [...seen].slice(-60) };
  for (const [g, ids] of Object.entries(shown)) {
    if (g !== gameId && Object.keys(next).length < 6) next[g] = ids;
  }
  shown = next;
  save(KEY, shown);
  if (fresh.length) for (const l of listeners) l(gameId, fresh.slice(-3));
}
