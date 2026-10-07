// Every statistic in the app, computed from completed games. Pure functions.
import type { HistoryGame, HistoryPlayer, Slot, WordRow } from './types';

/** A failed round counts as 7 guesses for difficulty averages. */
export const FAIL_SCORE = 7;

export interface PlayerStats {
  slot: Slot;
  played: number;
  solved: number;
  failed: number;
  solveRate: number | null; // 0..1
  battlesWon: number;
  battleWinRate: number | null; // 0..1
  avgGuesses: number | null; // solved rounds only
  avgSolveMs: number | null; // solved rounds only
  currentStreak: number; // solved in a row, most recent first
  longestStreak: number;
  fastestSolveMs: number | null;
  mostCommonScore: number | null;
  distribution: number[]; // index 0..5 = solved in 1..6
}

const player = (g: HistoryGame, slot: Slot): HistoryPlayer | undefined => g.players.find((p) => p.slot === slot);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const byOldest = (games: HistoryGame[]) => [...games].sort((a, b) => a.number - b.number);

export function playerStats(games: HistoryGame[], slot: Slot): PlayerStats {
  const rounds = byOldest(games)
    .map((g) => ({ g, p: player(g, slot) }))
    .filter((r): r is { g: HistoryGame; p: HistoryPlayer } => !!r.p);
  const solved = rounds.filter((r) => r.p.status === 'solved');
  const distribution = [0, 0, 0, 0, 0, 0];
  for (const r of solved) distribution[r.p.guess_count - 1]++;

  let longest = 0;
  let run = 0;
  for (const r of rounds) {
    run = r.p.status === 'solved' ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let current = 0;
  for (let i = rounds.length - 1; i >= 0 && rounds[i].p.status === 'solved'; i--) current++;

  const times = solved.map((r) => r.p.duration_ms).filter((t): t is number => t != null);
  const maxCount = Math.max(...distribution);
  const battlesWon = rounds.filter((r) => r.g.winner === slot).length;

  return {
    slot,
    played: rounds.length,
    solved: solved.length,
    failed: rounds.length - solved.length,
    solveRate: rounds.length ? solved.length / rounds.length : null,
    battlesWon,
    battleWinRate: rounds.length ? battlesWon / rounds.length : null,
    avgGuesses: avg(solved.map((r) => r.p.guess_count)),
    avgSolveMs: avg(times),
    currentStreak: current,
    longestStreak: longest,
    fastestSolveMs: times.length ? Math.min(...times) : null,
    // Ties go to the lower (better) score.
    mostCommonScore: solved.length ? distribution.indexOf(maxCount) + 1 : null,
    distribution,
  };
}

export interface HeadToHead {
  wins: Record<Slot, number>;
  draws: number;
  bothFailed: number;
  winStreak: { slot: Slot | null; length: number }; // current run of wins by one player
}

export function headToHead(games: HistoryGame[]): HeadToHead {
  const wins: Record<Slot, number> = { 1: 0, 2: 0 };
  let draws = 0;
  let bothFailed = 0;
  for (const g of games) {
    if (g.winner) wins[g.winner]++;
    else if (g.result === 'draw') draws++;
    else bothFailed++;
  }
  const newest = byOldest(games).reverse();
  let streakSlot: Slot | null = null;
  let length = 0;
  for (const g of newest) {
    if (!g.winner) break;
    if (streakSlot === null) streakSlot = g.winner;
    if (g.winner !== streakSlot) break;
    length++;
  }
  return { wins, draws, bothFailed, winStreak: { slot: streakSlot, length } };
}

// ---------------------------------------------------------------- difficulty

/** Average attempts on a game across both players (failed = 7). */
export function gameDifficulty(g: HistoryGame): number {
  const scores = g.players.map((p) => (p.status === 'solved' ? p.guess_count : FAIL_SCORE));
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export interface WordDifficulty {
  word: string;
  addedBy: Slot;
  plays: number;
  avgAttempts: number;
}

export function wordDifficulties(games: HistoryGame[]): WordDifficulty[] {
  const map = new Map<string, { addedBy: Slot; total: number; plays: number }>();
  for (const g of games) {
    const e = map.get(g.word) ?? { addedBy: g.word_added_by, total: 0, plays: 0 };
    e.total += gameDifficulty(g);
    e.plays++;
    map.set(g.word, e);
  }
  return [...map.entries()].map(([word, e]) => ({ word, addedBy: e.addedBy, plays: e.plays, avgAttempts: e.total / e.plays }));
}

export interface SetterStats {
  slot: Slot;
  contributed: number;
  played: number;
  /** Both players' average attempts on this person's words. */
  avgAttempts: number | null;
  /** Only the partner's attempts on this person's words (the setter may remember them). */
  avgAttemptsForPartner: number | null;
  partnerFails: number;
}

export function setterStats(games: HistoryGame[], words: WordRow[], slot: Slot): SetterStats {
  const mine = games.filter((g) => g.word_added_by === slot);
  const partnerScores = mine
    .map((g) => player(g, (3 - slot) as Slot))
    .filter((p): p is HistoryPlayer => !!p)
    .map((p) => (p.status === 'solved' ? p.guess_count : FAIL_SCORE));
  return {
    slot,
    contributed: words.filter((w) => w.added_by === slot).length,
    played: mine.length,
    avgAttempts: avg(mine.map(gameDifficulty)),
    avgAttemptsForPartner: avg(partnerScores),
    partnerFails: partnerScores.filter((s) => s === FAIL_SCORE).length,
  };
}

export interface RepoStats {
  total: number;
  bySlot: Record<Slot, number>;
  played: number;
  neverPlayed: number;
}

export function repoStats(words: WordRow[]): RepoStats {
  return {
    total: words.length,
    bySlot: { 1: words.filter((w) => w.added_by === 1).length, 2: words.filter((w) => w.added_by === 2).length },
    played: words.filter((w) => w.times_played > 0).length,
    neverPlayed: words.filter((w) => w.times_played === 0).length,
  };
}

// ---------------------------------------------------------------- fun awards

export interface Award {
  id: string;
  emoji: string;
  title: string;
  holder: Slot | null; // null = a word award, or a tie
  value: string; // the headline, e.g. "CRANE" or "3 games"
  detail: string;
}

/** Letter this player most often wastes a guess on (marked gray). */
export function nemesisLetter(games: HistoryGame[], slot: Slot): { letter: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const g of games) {
    const p = player(g, slot);
    if (!p) continue;
    for (const guess of p.guesses) {
      const grays = new Set<string>();
      for (let i = 0; i < 5; i++) if (guess.pattern[i] === 'X') grays.add(guess.word[i]);
      // A letter gray here but green/yellow elsewhere in the same guess is a duplicate, not a miss.
      for (let i = 0; i < 5; i++) if (guess.pattern[i] !== 'X') grays.delete(guess.word[i]);
      for (const l of grays) counts.set(l, (counts.get(l) ?? 0) + 1);
    }
  }
  let best: { letter: string; count: number } | null = null;
  for (const [letter, count] of counts) if (!best || count > best.count || (count === best.count && letter < best.letter)) best = { letter, count };
  return best;
}

function leader(values: Record<Slot, number | null>, higherIsBetter: boolean): Slot | null {
  const a = values[1];
  const b = values[2];
  if (a == null && b == null) return null;
  if (a == null) return 2;
  if (b == null) return 1;
  if (a === b) return null;
  return (higherIsBetter ? a > b : a < b) ? 1 : 2;
}

export function awards(games: HistoryGame[], words: WordRow[], names: Record<Slot, string>, fmtMs: (ms: number) => string): Award[] {
  const out: Award[] = [];
  const diffs = wordDifficulties(games);
  if (diffs.length) {
    const brutal = [...diffs].sort((a, b) => b.avgAttempts - a.avgAttempts || a.word.localeCompare(b.word))[0];
    const easy = [...diffs].sort((a, b) => a.avgAttempts - b.avgAttempts || a.word.localeCompare(b.word))[0];
    out.push({ id: 'brutal', emoji: '💀', title: 'Most Brutal Word', holder: null, value: brutal.word,
      detail: `${brutal.avgAttempts.toFixed(1)} guesses on average · set by ${names[brutal.addedBy]}` });
    if (diffs.length > 1) {
      out.push({ id: 'easy', emoji: '💸', title: 'Easy Money', holder: null, value: easy.word,
        detail: `${easy.avgAttempts.toFixed(1)} guesses on average · set by ${names[easy.addedBy]}` });
    }
  }

  // Clutch: battles won after reaching guess 5 or 6.
  const clutch = { 1: 0, 2: 0 } as Record<Slot, number>;
  // Comeback: won the battle even though the partner finished first on the clock.
  const comeback = { 1: 0, 2: 0 } as Record<Slot, number>;
  for (const g of games) {
    if (!g.winner) continue;
    const w = player(g, g.winner);
    const l = player(g, (3 - g.winner) as Slot);
    if (w && w.guess_count >= 5) clutch[g.winner]++;
    if (w?.finished_at && l?.finished_at && Date.parse(l.finished_at) < Date.parse(w.finished_at)) comeback[g.winner]++;
  }
  const clutchLeader = leader(clutch, true);
  if (clutch[1] + clutch[2] > 0) {
    out.push({ id: 'clutch', emoji: '🧊', title: 'Clutch Player', holder: clutchLeader,
      value: clutchLeader ? names[clutchLeader] : 'Tied',
      detail: `Wins after reaching guess 5 or 6 · ${names[1]} ${clutch[1]}, ${names[2]} ${clutch[2]}` });
  }
  const speed = { 1: playerStats(games, 1).avgSolveMs, 2: playerStats(games, 2).avgSolveMs };
  const speedLeader = leader(speed, false);
  if (speed[1] != null || speed[2] != null) {
    out.push({ id: 'speed', emoji: '⚡', title: 'Speed Demon', holder: speedLeader,
      value: speedLeader ? names[speedLeader] : 'Tied',
      detail: `Fastest average solve · ${names[1]} ${speed[1] != null ? fmtMs(speed[1]) : '–'}, ${names[2]} ${speed[2] != null ? fmtMs(speed[2]) : '–'}` });
  }
  if (comeback[1] + comeback[2] > 0) {
    const c = leader(comeback, true);
    out.push({ id: 'comeback', emoji: '👑', title: 'Comeback King', holder: c, value: c ? names[c] : 'Tied',
      detail: `Won even though the other finished first · ${names[1]} ${comeback[1]}, ${names[2]} ${comeback[2]}` });
  }
  const contributed = { 1: words.filter((w) => w.added_by === 1).length, 2: words.filter((w) => w.added_by === 2).length };
  if (contributed[1] + contributed[2] > 0) {
    const s = leader(contributed, true);
    out.push({ id: 'setter', emoji: '📚', title: 'Word Setter', holder: s, value: s ? names[s] : 'Tied',
      detail: `Most words added · ${names[1]} ${contributed[1]}, ${names[2]} ${contributed[2]}` });
  }
  const hard = { 1: setterStats(games, words, 1).avgAttempts, 2: setterStats(games, words, 2).avgAttempts };
  if (hard[1] != null && hard[2] != null) {
    const h = leader(hard, true);
    out.push({ id: 'hardest', emoji: '🧠', title: 'Hardest Word Setter', holder: h, value: h ? names[h] : 'Tied',
      detail: `Average guesses on their words · ${names[1]} ${hard[1].toFixed(1)}, ${names[2]} ${hard[2].toFixed(1)}` });
  }
  for (const slot of [1, 2] as Slot[]) {
    const n = nemesisLetter(games, slot);
    if (n) out.push({ id: `nemesis-${slot}`, emoji: '🎯', title: `${names[slot]}'s Nemesis Letter`, holder: slot, value: n.letter,
      detail: `Guessed and missed ${n.count} time${n.count === 1 ? '' : 's'}` });
  }
  return out;
}
