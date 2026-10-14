// Round badges (v1.15, trimmed in v1.16), in the spirit of the NYT Wordle badges:
// the rare things one round can earn, shown as chips right after it. Battles and
// solo games both count. Pure functions, worked out from the games on the server.
import type { GuessRow, HistoryGame, Slot, SoloView } from './types';

export interface RoundLike {
  status: string;
  duration_ms: number | null;
  /** Patterns are enough for most badges; Hard Mode needs the words too. */
  patterns: string[];
  guesses?: GuessRow[] | null;
}

export interface BadgeDef {
  id: string;
  emoji: string;
  name: string;
  how: string;
}

/** Earned in a single round, as often as you like (shown with a count). */
export const ROUND_BADGES: BadgeDef[] = [
  { id: 'in1', emoji: '🎯', name: 'Wordle in 1', how: 'Solved with the very first guess' },
  { id: 'in2', emoji: '✌️', name: 'Wordle in 2', how: 'Solved on the second guess' },
  { id: 'sea', emoji: '🟩', name: 'Sea of Greens', how: 'Solved without a single yellow tile' },
  { id: 'hard', emoji: '🧠', name: 'Hard Mode', how: 'Solved while reusing every hint: greens stay put, yellows go back in' },
  { id: 'dark', emoji: '🔦', name: 'Out of the Dark', how: 'Solved after two all-grey guesses' },
];
// v1.16: the milestone tracks (day/solve/win streaks, games played) and the Stats shelf
// are gone: they repeated the Stats table. The cumulative side of these badges now
// lives in the Hall of fame (stats.ts › moreAwards).

/** Did every guess after the first reuse all the hints so far (the NYT Hard Mode rule)? */
export function isHardMode(guesses: GuessRow[]): boolean {
  for (let i = 1; i < guesses.length; i++) {
    const w = guesses[i].word;
    for (let j = 0; j < i; j++) {
      const prev = guesses[j];
      const need = new Map<string, number>();
      for (let k = 0; k < 5; k++) {
        if (prev.pattern[k] === 'G' && w[k] !== prev.word[k]) return false;
        if (prev.pattern[k] !== 'X') need.set(prev.word[k], (need.get(prev.word[k]) ?? 0) + 1);
      }
      for (const [letter, n] of need) if ([...w].filter((c) => c === letter).length < n) return false;
    }
  }
  return true;
}

/** Badges one round earned. */
export function roundBadges(r: RoundLike): string[] {
  const pats = r.patterns ?? [];
  const n = pats.length;
  const solved = r.status === 'solved';
  const out: string[] = [];
  if (solved && n === 1) out.push('in1');
  if (solved && n === 2) out.push('in2');
  if (solved && n >= 2 && pats.every((p) => !p.includes('Y'))) out.push('sea');
  if (solved && n >= 2 && r.guesses && r.guesses.length === n && isHardMode(r.guesses)) out.push('hard');
  if (solved && n >= 3 && pats[0] === 'XXXXX' && pats[1] === 'XXXXX') out.push('dark');
  return out;
}

export interface Round extends RoundLike {
  kind: 'battle' | 'solo';
  finishedAt: number;
  /** Battles only: did this player win it? */
  won?: boolean;
}

/** Every finished round one player has played, oldest first. */
export function roundsFor(slot: Slot, battles: HistoryGame[], solo: SoloView[]): Round[] {
  const out: Round[] = [];
  for (const g of battles) {
    const p = g.players.find((x) => x.slot === slot);
    if (!p) continue;
    out.push({ kind: 'battle', status: p.status, duration_ms: p.duration_ms, patterns: p.guesses.map((x) => x.pattern), guesses: p.guesses,
      finishedAt: Date.parse(p.finished_at ?? g.completed_at) || 0, won: g.winner === slot });
  }
  for (const s of solo) {
    if (s.slot !== slot || s.status === 'playing') continue;
    out.push({ kind: 'solo', status: s.status, duration_ms: s.duration_ms, patterns: s.guesses.map((x) => x.pattern), guesses: s.guesses,
      finishedAt: Date.parse(s.finished_at ?? s.started_at) || 0 });
  }
  return out.sort((a, b) => a.finishedAt - b.finishedAt);
}

export const badgeById = (id: string) => ROUND_BADGES.find((b) => b.id === id);
