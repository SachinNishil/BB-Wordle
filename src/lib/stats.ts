// Every statistic in the app, computed from completed games. Pure functions.
import { roundBadges, roundsFor } from './badges';
import type { GameMode, HistoryGame, HistoryPlayer, Slot, SoloStats, SoloView } from './types';

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
  /** v1.11: battles won in a row (a draw or a loss ends it). What Stats shows as streaks. */
  currentWinStreak: number;
  longestWinStreak: number;
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
  let longestWin = 0;
  let winRun = 0;
  for (const r of rounds) {
    winRun = r.g.winner === slot ? winRun + 1 : 0;
    longestWin = Math.max(longestWin, winRun);
  }

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
    currentWinStreak: winRun,
    longestWinStreak: longestWin,
    fastestSolveMs: times.length ? Math.min(...times) : null,
    // Ties go to the lower (better) score.
    mostCommonScore: solved.length ? distribution.indexOf(maxCount) + 1 : null,
    distribution,
  };
}

export interface ModeRecord {
  games: number;
  wins: Record<Slot, number>;
  draws: number;
}

export interface HeadToHead {
  wins: Record<Slot, number>;
  draws: number;
  bothFailed: number;
  winStreak: { slot: Slot | null; length: number }; // current run of wins by one player
  byMode: Record<GameMode, ModeRecord>;
}

/** Classic games only: the ones with one shared word from the repository. */
export const classicGames = (games: HistoryGame[]) => games.filter((g) => (g.mode ?? 'classic') === 'classic' && !!g.word);

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
  const byMode = {} as Record<GameMode, ModeRecord>;
  for (const mode of ['classic', 'challenge'] as GameMode[]) {
    const gs = games.filter((g) => (g.mode ?? 'classic') === mode);
    byMode[mode] = {
      games: gs.length,
      wins: { 1: gs.filter((g) => g.winner === 1).length, 2: gs.filter((g) => g.winner === 2).length },
      draws: gs.filter((g) => !g.winner).length,
    };
  }
  return { wins, draws, bothFailed, winStreak: { slot: streakSlot, length }, byMode };
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
  for (const g of classicGames(games)) {
    const e = map.get(g.word!) ?? { addedBy: g.word_added_by as Slot, total: 0, plays: 0 };
    e.total += gameDifficulty(g);
    e.plays++;
    map.set(g.word!, e);
  }
  return [...map.entries()].map(([word, e]) => ({ word, addedBy: e.addedBy, plays: e.plays, avgAttempts: e.total / e.plays }));
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

export function awards(games: HistoryGame[], names: Record<Slot, string>, fmtMs: (ms: number) => string, solo: SoloStats[] = [], soloGames: SoloView[] = []): Award[] {
  const out: Award[] = [];
  const diffs = wordDifficulties(games);
  if (diffs.length) {
    const brutal = [...diffs].sort((a, b) => b.avgAttempts - a.avgAttempts || a.word.localeCompare(b.word))[0];
    const easy = [...diffs].sort((a, b) => a.avgAttempts - b.avgAttempts || a.word.localeCompare(b.word))[0];
    out.push({ id: 'brutal', emoji: '💀', title: 'Most Brutal Word', holder: null, value: brutal.word,
      detail: `${brutal.avgAttempts.toFixed(1)} guesses on average` });
    if (diffs.length > 1) {
      out.push({ id: 'easy', emoji: '💸', title: 'Easy Money', holder: null, value: easy.word,
        detail: `${easy.avgAttempts.toFixed(1)} guesses on average` });
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
  // v1.16: Speed Demon (average solve time) dropped: the Stats table already shows it.
  if (comeback[1] + comeback[2] > 0) {
    const c = leader(comeback, true);
    out.push({ id: 'comeback', emoji: '👑', title: 'Comeback King', holder: c, value: c ? names[c] : 'Tied',
      detail: `Won even though the other finished first · ${names[1]} ${comeback[1]}, ${names[2]} ${comeback[2]}` });
  }
  // Challenge mode: whose picked words gave the other person the hardest time.
  const challenges = games.filter((g) => g.mode === 'challenge');
  if (challenges.length) {
    const toughness = { 1: null, 2: null } as Record<Slot, number | null>;
    for (const setter of [1, 2] as Slot[]) {
      const scores = challenges
        .map((g) => player(g, (3 - setter) as Slot))
        .filter((p): p is HistoryPlayer => !!p)
        .map((p) => (p.status === 'solved' ? p.guess_count : FAIL_SCORE));
      toughness[setter] = avg(scores);
    }
    const t = leader(toughness, true);
    out.push({ id: 'challenger', emoji: '⚔️', title: 'Toughest Challenger', holder: t, value: t ? names[t] : 'Tied',
      detail: `Guesses the other needed on their challenge words · ${names[1]} ${toughness[1]?.toFixed(1) ?? '–'}, ${names[2]} ${toughness[2]?.toFixed(1) ?? '–'}` });
  }
  for (const slot of [1, 2] as Slot[]) {
    const n = nemesisLetter(games, slot);
    if (n) out.push({ id: `nemesis-${slot}`, emoji: '🎯', title: `${names[slot]}'s Nemesis Letter`, holder: slot, value: n.letter,
      detail: `Guessed and missed ${n.count} time${n.count === 1 ? '' : 's'}` });
  }
  out.push(...moreAwards(games, names, fmtMs, solo, soloGames));
  return out;
}

const both = (f: (s: Slot) => number) => ({ 1: f(1), 2: f(2) }) as Record<Slot, number>;
const tally = (names: Record<Slot, string>, v: Record<Slot, number | string>) => `${names[1]} ${v[1]}, ${names[2]} ${v[2]}`;

/** v1.12: more of the Hall of fame. Each one only shows once there's something to show. */
export function moreAwards(games: HistoryGame[], names: Record<Slot, string>, fmtMs: (ms: number) => string, _solo: SoloStats[] = [], soloGames: SoloView[] = []): Award[] {
  const out: Award[] = [];
  const rounds = (slot: Slot) => games.map((g) => player(g, slot)).filter((p): p is HistoryPlayer => !!p);
  const pick = (id: string, emoji: string, title: string, v: Record<Slot, number>, higher: boolean, detail: string) => {
    const l = leader(v, higher);
    out.push({ id, emoji, title, holder: l, value: l ? names[l] : 'Tied', detail });
  };

  // Sharpshooter: solved in 1 or 2 guesses.
  const sharp = both((s) => rounds(s).filter((p) => p.status === 'solved' && p.guess_count <= 2).length);
  if (sharp[1] + sharp[2] > 0) pick('sharp', '🏹', 'Sharpshooter', sharp, true, `Solved in 1 or 2 guesses · ${tally(names, sharp)}`);

  // Fastest solve ever, with the word.
  let fastest: { slot: Slot; ms: number; word: string; n: number } | null = null;
  for (const g of games) for (const p of g.players) {
    if (p.status !== 'solved' || p.duration_ms == null) continue;
    if (!fastest || p.duration_ms < fastest.ms) fastest = { slot: p.slot, ms: p.duration_ms, word: p.slot === 1 ? g.word_for_1 : g.word_for_2, n: g.number };
  }
  if (fastest) out.push({ id: 'rocket', emoji: '🚀', title: 'Fastest Solve Ever', holder: fastest.slot, value: fmtMs(fastest.ms),
    detail: `${names[fastest.slot]} on ${fastest.word} · game #${fastest.n}` });

  // Photo finish: same guesses, decided by the clock, smallest gap.
  let photo: { gap: number; g: HistoryGame } | null = null;
  for (const g of games) {
    const [a, b] = g.players;
    if (!g.winner || a?.status !== 'solved' || b?.status !== 'solved' || a.guess_count !== b.guess_count) continue;
    if (a.duration_ms == null || b.duration_ms == null) continue;
    const gap = Math.abs(a.duration_ms - b.duration_ms);
    if (!photo || gap < photo.gap) photo = { gap, g };
  }
  if (photo) out.push({ id: 'photo', emoji: '📸', title: 'Photo Finish', holder: photo.g.winner, value: fmtMs(photo.gap),
    detail: `Closest clock decider · game #${photo.g.number}, ${names[photo.g.winner!]} by a whisker` });

  // Best opener: most greens and yellows from the first guess, on average.
  const open = { 1: null, 2: null } as Record<Slot, number | null>;
  for (const s of [1, 2] as Slot[]) {
    const firsts = rounds(s).map((p) => p.guesses[0]?.pattern).filter((x): x is string => !!x);
    open[s] = firsts.length ? firsts.reduce((t, pat) => t + [...pat].filter((c) => c === 'G').length * 2 + [...pat].filter((c) => c === 'Y').length, 0) / firsts.length : null;
  }
  if (open[1] != null || open[2] != null) {
    const l = leader(open, true);
    out.push({ id: 'opener', emoji: '🎬', title: 'Best Opener', holder: l, value: l ? names[l] : 'Tied',
      detail: `First-guess score (green 2, yellow 1) · ${names[1]} ${open[1]?.toFixed(1) ?? '–'}, ${names[2]} ${open[2]?.toFixed(1) ?? '–'}` });
  }

  // Each player's go-to first word.
  for (const s of [1, 2] as Slot[]) {
    const counts = new Map<string, number>();
    for (const p of rounds(s)) if (p.guesses[0]) counts.set(p.guesses[0].word, (counts.get(p.guesses[0].word) ?? 0) + 1);
    let top: [string, number] | null = null;
    for (const e of counts) if (!top || e[1] > top[1] || (e[1] === top[1] && e[0] < top[0])) top = e;
    if (top && top[1] > 1) out.push({ id: `goto-${s}`, emoji: '🔁', title: `${names[s]}'s Go-to Opener`, holder: s, value: top[0],
      detail: `Opened with it ${top[1]} times` });
  }

  // Night owl: battles finished between 10 pm and 4 am.
  const owl = both((s) => rounds(s).filter((p) => { if (!p.finished_at) return false; const h = new Date(p.finished_at).getHours(); return h >= 22 || h < 4; }).length);
  if (owl[1] + owl[2] > 0) pick('owl', '🦉', 'Night Owl', owl, true, `Rounds finished after 10 pm · ${tally(names, owl)}`);

  // White flag: give-ups (for fun).
  const flag = both((s) => rounds(s).filter((p) => p.gave_up).length);
  if (flag[1] + flag[2] > 0) pick('flag', '🏳️', 'White Flag', flag, true, `Rounds given up · ${tally(names, flag)}`);

  // v1.16: the badge totals, battles and solo together (the rounds themselves show a chip).
  const badgeCount = (id: string) => both((sl) => roundsFor(sl, games, soloGames).filter((r) => roundBadges(r).includes(id)).length);
  const sea = badgeCount('sea');
  if (sea[1] + sea[2] > 0) pick('sea', '🟩', 'Sea of Greens', sea, true, `Solved without a single yellow · ${tally(names, sea)}`);
  const hard = badgeCount('hard');
  if (hard[1] + hard[2] > 0) pick('hard', '🧠', 'Hard Mode Hero', hard, true, `Solved reusing every hint · ${tally(names, hard)}`);
  const dark = badgeCount('dark');
  if (dark[1] + dark[2] > 0) pick('dark', '🔦', 'Out of the Dark', dark, true, `Solved after two all-grey guesses · ${tally(names, dark)}`);

  // Insights about the two of you (no winner).
  const dayKey = (iso: string) => { const d = new Date(iso); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000; };
  const days = [...new Set(games.map((g) => dayKey(g.completed_at)))].sort((a, b) => a - b);
  let run = 0, best = 0;
  for (let i = 0; i < days.length; i++) { run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); }
  if (best > 1) out.push({ id: 'devotion', emoji: '📅', title: 'Daily Devotion', holder: null, value: `${best} days`,
    detail: `Your longest run of days with a battle${run === best && days.length ? ', still going' : ''}` });
  const perDay = new Map<number, number>();
  for (const g of games) perDay.set(dayKey(g.completed_at), (perDay.get(dayKey(g.completed_at)) ?? 0) + 1);
  let busy: [number, number] | null = null;
  for (const e of perDay) if (!busy || e[1] > busy[1]) busy = e;
  if (busy && busy[1] > 1) out.push({ id: 'busiest', emoji: '🗓️', title: 'Busiest Day', holder: null, value: `${busy[1]} battles`,
    detail: new Date(busy[0] * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) });
  return out;
}
