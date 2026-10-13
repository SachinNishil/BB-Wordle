// Badges (v1.15), in the spirit of the NYT Wordle badges (Wordle in 1 / in 2,
// Sea of Greens, Hard Mode, streak and games-played milestones), adapted for the
// two of you: battles and solo games both count. Pure functions, no storage:
// everything is worked out from the games already on the server.
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
  { id: 'in1', emoji: '🎯', name: 'Wordle in 1', how: 'Solve it with your very first guess' },
  { id: 'in2', emoji: '✌️', name: 'Wordle in 2', how: 'Solve it on your second guess' },
  { id: 'sea', emoji: '🟩', name: 'Sea of Greens', how: 'Solve it without a single yellow tile on your board' },
  { id: 'hard', emoji: '🧠', name: 'Hard Mode', how: 'Solve it while reusing every hint: greens stay put, yellows go back in' },
  { id: 'golden', emoji: '🌟', name: 'Golden Start', how: '3 or more greens from your first guess' },
  { id: 'dark', emoji: '🔦', name: 'Out of the Dark', how: 'Solve it after two all-grey guesses' },
  { id: 'lightning', emoji: '⚡', name: 'Lightning', how: 'Solve it in under 30 seconds' },
  { id: 'phew', emoji: '😮‍💨', name: 'Phew!', how: 'Solve it on guess 6' },
];

/** Milestones: each step is earned once, like the NYT streak badges. */
export interface MilestoneDef {
  id: string;
  emoji: string;
  name: (n: number) => string;
  unit: string;
  steps: number[];
}
export const MILESTONES: MilestoneDef[] = [
  { id: 'days', emoji: '📅', name: (n) => `${n}-day streak`, unit: 'days in a row with a game', steps: [3, 7, 14, 30, 60, 100, 365] },
  { id: 'solves', emoji: '🔥', name: (n) => `${n} solved in a row`, unit: 'rounds solved in a row', steps: [5, 10, 25, 50, 100] },
  { id: 'wins', emoji: '🏆', name: (n) => `${n} wins in a row`, unit: 'battles won in a row', steps: [3, 5, 10, 20] },
  { id: 'played', emoji: '🎮', name: (n) => `${n} games`, unit: 'games played (battles and solo)', steps: [10, 25, 50, 100, 250, 500, 1000] },
];

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
  if (n >= 2 && [...pats[0]].filter((c) => c === 'G').length >= 3) out.push('golden');
  if (solved && n >= 3 && pats[0] === 'XXXXX' && pats[1] === 'XXXXX') out.push('dark');
  if (solved && r.duration_ms != null && r.duration_ms < 30000) out.push('lightning');
  if (solved && n === 6) out.push('phew');
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

const dayKey = (ms: number) => { const d = new Date(ms); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000; };

export interface MilestoneProgress {
  def: MilestoneDef;
  /** Best so far (longest run, or the total). */
  value: number;
  earned: number[];
  next: number | null;
}

export interface BadgeSummary {
  counts: Record<string, number>;
  milestones: MilestoneProgress[];
  /** Ids of every milestone step earned, e.g. "days-7". */
  earnedSteps: string[];
}

export function badgeSummary(rounds: Round[]): BadgeSummary {
  const counts: Record<string, number> = Object.fromEntries(ROUND_BADGES.map((b) => [b.id, 0]));
  for (const r of rounds) for (const id of roundBadges(r)) counts[id]++;

  let solveRun = 0, bestSolve = 0;
  for (const r of rounds) { solveRun = r.status === 'solved' ? solveRun + 1 : 0; bestSolve = Math.max(bestSolve, solveRun); }
  let winRun = 0, bestWin = 0;
  for (const r of rounds) if (r.kind === 'battle') { winRun = r.won ? winRun + 1 : 0; bestWin = Math.max(bestWin, winRun); }
  const days = [...new Set(rounds.map((r) => dayKey(r.finishedAt)))].sort((a, b) => a - b);
  let dayRun = 0, bestDay = 0;
  for (let i = 0; i < days.length; i++) { dayRun = i > 0 && days[i] === days[i - 1] + 1 ? dayRun + 1 : 1; bestDay = Math.max(bestDay, dayRun); }

  const values: Record<string, number> = { days: bestDay, solves: bestSolve, wins: bestWin, played: rounds.length };
  const milestones = MILESTONES.map((def) => {
    const value = values[def.id];
    const earned = def.steps.filter((s) => value >= s);
    return { def, value, earned, next: def.steps.find((s) => value < s) ?? null };
  });
  return { counts, milestones, earnedSteps: milestones.flatMap((m) => m.earned.map((s) => `${m.def.id}-${s}`)) };
}

export const badgeById = (id: string) => ROUND_BADGES.find((b) => b.id === id);
