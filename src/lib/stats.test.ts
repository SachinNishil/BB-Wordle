import { describe, expect, it } from 'vitest';
import { awards, headToHead, nemesisLetter, playerStats, repoStats, setterStats, wordDifficulties } from './stats';
import type { HistoryGame, HistoryPlayer, Slot, WordRow } from './types';
import { evaluate } from './wordle';

let n = 0;
function round(slot: Slot, answer: string, guesses: string[], ms: number, finishedAt: number): HistoryPlayer {
  const rows = guesses.map((w) => ({ word: w, pattern: evaluate(w, answer) }));
  const solved = guesses[guesses.length - 1] === answer;
  return { slot, status: solved ? 'solved' : 'failed', guess_count: guesses.length, duration_ms: ms,
    started_at: new Date(finishedAt - ms).toISOString(), finished_at: new Date(finishedAt).toISOString(), gave_up: false, guesses: rows };
}
function game(answer: string, addedBy: Slot, p1: HistoryPlayer, p2: HistoryPlayer): HistoryGame {
  n++;
  const s = (p: HistoryPlayer) => (p.status === 'solved' ? p.guess_count : 99);
  const winner = s(p1) < s(p2) ? 1 : s(p2) < s(p1) ? 2 : null;
  const result = winner ? 'win' : p1.status === 'solved' ? 'draw' : 'both_failed';
  return { id: String(n), number: n, created_at: new Date(2026, 9, n).toISOString(), created_by: 1, starts_at: null,
    completed_at: new Date(2026, 9, n).toISOString(), mode: 'classic', word: answer, word_added_by: addedBy, word_for_1: answer, word_for_2: answer, winner: winner as Slot | null, result, players: [p1, p2] };
}
const T = 1_800_000_000_000;
const games: HistoryGame[] = [
  // 1: Sachin 3 guesses beats Menaka 4, but Menaka finished first on the clock -> comeback for Sachin
  game('CRANE', 1, round(1, 'CRANE', ['SLATE', 'TRACE', 'CRANE'], 120_000, T + 120_000), round(2, 'CRANE', ['AUDIO', 'SLATE', 'GRACE', 'CRANE'], 60_000, T + 60_000)),
  // 2: draw in 4
  game('HOUSE', 2, round(1, 'HOUSE', ['AUDIO', 'MOUSE', 'LOUSE', 'HOUSE'], 90_000, T), round(2, 'HOUSE', ['TRAIN', 'MOUSE', 'DOUSE', 'HOUSE'], 80_000, T)),
  // 3: Sachin fails, Menaka solves in 5 (clutch)
  game('JAZZY', 2, round(1, 'JAZZY', ['AUDIO', 'TRAIN', 'PIZZA', 'FIZZY', 'DIZZY', 'TIZZY'], 300_000, T), round(2, 'JAZZY', ['AUDIO', 'TRAIN', 'PIZZA', 'FIZZY', 'JAZZY'], 200_000, T)),
  // 4: both fail
  game('NYMPH', 1, round(1, 'NYMPH', ['AUDIO', 'TRAIN', 'SLATE', 'CLOUD', 'BRICK', 'FUZZY'], 400_000, T), round(2, 'NYMPH', ['AUDIO', 'TRAIN', 'SLATE', 'CLOUD', 'BRICK', 'FUZZY'], 420_000, T)),
  // 5: Sachin solves in 2
  game('PLANT', 1, round(1, 'PLANT', ['SLANT', 'PLANT'], 30_000, T), round(2, 'PLANT', ['AUDIO', 'TRAIN', 'PLANT'], 45_000, T)),
];
const words: WordRow[] = ['CRANE', 'NYMPH', 'PLANT', 'BRICK', 'HOUSE', 'JAZZY'].map((w, i) => ({
  id: i, word: w, added_by: (['BRICK', 'HOUSE', 'JAZZY'].includes(w) ? 2 : 1) as Slot, in_dictionary: true,
  created_at: '', times_played: w === 'BRICK' ? 0 : 1, last_played_at: null,
}));

describe('playerStats', () => {
  const s = playerStats(games, 1);
  const m = playerStats(games, 2);
  it('counts', () => {
    expect([s.played, s.solved, s.failed]).toEqual([5, 3, 2]);
    expect(s.solveRate).toBeCloseTo(0.6);
    expect(s.battlesWon).toBe(2);
    expect(m.battlesWon).toBe(1);
  });
  it('averages only solved rounds', () => {
    expect(s.avgGuesses).toBeCloseTo((3 + 4 + 2) / 3);
    expect(s.avgSolveMs).toBeCloseTo((120_000 + 90_000 + 30_000) / 3);
    expect(s.fastestSolveMs).toBe(30_000);
  });
  it('streaks', () => {
    expect(s.currentStreak).toBe(1); // solved game 5, failed game 4
    expect(s.longestStreak).toBe(2);
    expect(m.currentStreak).toBe(1);
    expect(m.longestStreak).toBe(3);
  });
  it('distribution and most common score (ties go to the better score)', () => {
    expect(s.distribution).toEqual([0, 1, 1, 1, 0, 0]);
    expect(s.mostCommonScore).toBe(2);
    expect(m.distribution).toEqual([0, 0, 1, 2, 1, 0]);
    expect(m.mostCommonScore).toBe(4);
  });
  it('empty history', () => {
    const e = playerStats([], 1);
    expect([e.played, e.solveRate, e.avgGuesses, e.mostCommonScore, e.currentStreak]).toEqual([0, null, null, null, 0]);
  });
});

it('headToHead', () => {
  const h = headToHead(games);
  expect(h.wins).toEqual({ 1: 2, 2: 1 });
  expect(h.draws).toBe(1);
  expect(h.bothFailed).toBe(1);
  expect(h.winStreak).toEqual({ slot: 1, length: 1 });
});

it('difficulty treats a fail as 7', () => {
  const d = Object.fromEntries(wordDifficulties(games).map((w) => [w.word, w.avgAttempts]));
  expect(d.NYMPH).toBe(7);
  expect(d.JAZZY).toBe(6); // 7 + 5
  expect(d.PLANT).toBe(2.5);
});

it('setter stats', () => {
  const s1 = setterStats(games, words, 1); // CRANE 3.5, NYMPH 7, PLANT 2.5
  expect(s1.contributed).toBe(3);
  expect(s1.played).toBe(3);
  expect(s1.avgAttempts).toBeCloseTo((3.5 + 7 + 2.5) / 3);
  expect(s1.avgAttemptsForPartner).toBeCloseTo((4 + 7 + 3) / 3);
  expect(s1.partnerFails).toBe(1);
});

it('repoStats', () => {
  expect(repoStats(words)).toEqual({ total: 6, bySlot: { 1: 3, 2: 3 }, played: 5, neverPlayed: 1 });
});

it('nemesis letter ignores gray duplicates of letters that are in the word', () => {
  // Answer ABIDE, guess SPEED: second E is gray but E is in the word -> not a miss.
  const g = game('ABIDE', 1, round(1, 'ABIDE', ['SPEED', 'ABIDE'], 1, T), round(2, 'ABIDE', ['ABIDE'], 1, T));
  const miss = nemesisLetter([g], 1);
  expect(miss?.letter).toBe('P'); // P and S both missed once, alphabetical tie-break
  expect(nemesisLetter([g], 2)).toBeNull();
});

it('awards', () => {
  const a = Object.fromEntries(awards(games, words, { 1: 'Sachin', 2: 'Menaka' }, (ms) => `${ms / 1000}s`).map((x) => [x.id, x]));
  expect(a.brutal.value).toBe('NYMPH');
  expect(a.easy.value).toBe('PLANT');
  expect(a.clutch.value).toBe('Menaka');
  expect(a.comeback.value).toBe('Sachin');
  expect(a.speed.value).toBe('Sachin'); // 80s vs 96.25s
  expect(a.setter.value).toBe('Tied');
  expect(a.hardest.value).toBe('Menaka'); // HOUSE 4, JAZZY 6 -> 5 vs 4.33
});

describe('challenge mode', () => {
  // Sachin picked JAZZY for Menaka (she failed); Menaka picked CRANE for Sachin (he took 3).
  const ch: HistoryGame = {
    id: 'c1', number: 99, created_at: '', created_by: 1, starts_at: null, completed_at: new Date(2026, 9, 20).toISOString(),
    mode: 'challenge', word: null, word_added_by: null, word_for_1: 'CRANE', word_for_2: 'JAZZY', winner: 1, result: 'win',
    players: [round(1, 'CRANE', ['SLATE', 'TRACE', 'CRANE'], 50_000, T), round(2, 'JAZZY', ['AUDIO', 'TRAIN', 'PIZZA', 'FIZZY', 'DIZZY', 'TIZZY'], 90_000, T)],
  };
  const all = [...games, ch];
  it('is left out of word difficulty and setter stats', () => {
    expect(wordDifficulties(all).find((w) => w.word === 'CRANE')?.plays).toBe(1);
    expect(setterStats(all, words, 1).played).toBe(3);
  });
  it('counts in player stats and head to head, split by mode', () => {
    expect(playerStats(all, 1).played).toBe(6);
    const h = headToHead(all);
    expect(h.wins[1]).toBe(3);
    expect(h.byMode.challenge).toEqual({ games: 1, wins: { 1: 1, 2: 0 }, draws: 0 });
    expect(h.byMode.classic.games).toBe(5);
  });
  it('awards the toughest challenger', () => {
    const a = Object.fromEntries(awards(all, words, { 1: 'Sachin', 2: 'Menaka' }, (ms) => `${ms}`).map((x) => [x.id, x]));
    expect(a.challenger.value).toBe('Sachin'); // Menaka needed 7 (failed) vs Sachin 3
  });
});
