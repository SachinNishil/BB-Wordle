// Wordle scoring. Pure functions, no dependencies.
//
// The answer never reaches the browser, so the app itself never calls
// evaluate() on a live game: Postgres does that (public.evaluate_guess in
// supabase/schema.sql), and tests/sql checks both implementations agree on
// thousands of word pairs. This file is the readable, tested reference, and
// it powers the keyboard colours and the shareable emoji grids.

/** G = right letter, right spot. Y = in the word, wrong spot. X = not in the word. */
export type Mark = 'G' | 'Y' | 'X';
export type Pattern = string; // five Marks, e.g. "GYXXG"

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;
export const SOLVED: Pattern = 'GGGGG';

/**
 * Score a guess against the answer with standard Wordle duplicate rules:
 *  1. Exact matches are marked green first and use up that copy of the letter.
 *  2. Then, left to right, a letter is yellow only while the answer still has
 *     an unmatched copy of it. Extra copies are gray.
 */
export function evaluate(guess: string, answer: string): Pattern {
  const g = guess.toUpperCase();
  const a = answer.toUpperCase();
  if (!/^[A-Z]{5}$/.test(g) || !/^[A-Z]{5}$/.test(a)) {
    throw new Error('evaluate() expects two 5 letter words');
  }
  const marks: Mark[] = ['X', 'X', 'X', 'X', 'X'];
  const remaining = new Map<string, number>();

  for (let i = 0; i < 5; i++) {
    if (g[i] === a[i]) marks[i] = 'G';
    else remaining.set(a[i], (remaining.get(a[i]) ?? 0) + 1);
  }
  for (let i = 0; i < 5; i++) {
    if (marks[i] === 'G') continue;
    const left = remaining.get(g[i]) ?? 0;
    if (left > 0) {
      marks[i] = 'Y';
      remaining.set(g[i], left - 1);
    }
  }
  return marks.join('');
}

export type KeyState = 'correct' | 'present' | 'absent';

/** Best-known state of each letter, for the on-screen keyboard. Green beats yellow beats gray. */
export function keyboardStates(guesses: { word: string; pattern: Pattern }[]): Record<string, KeyState> {
  const rank: Record<KeyState, number> = { absent: 1, present: 2, correct: 3 };
  const out: Record<string, KeyState> = {};
  for (const { word, pattern } of guesses) {
    for (let i = 0; i < 5; i++) {
      const letter = word[i];
      const state: KeyState = pattern[i] === 'G' ? 'correct' : pattern[i] === 'Y' ? 'present' : 'absent';
      // A gray duplicate (e.g. the second E in SPEED) must not downgrade a letter
      // that is known to be in the word.
      if (!out[letter] || rank[state] > rank[out[letter]]) out[letter] = state;
    }
  }
  return out;
}

export function patternToEmoji(pattern: Pattern, dark = true): string {
  return [...pattern].map((m) => (m === 'G' ? '🟩' : m === 'Y' ? '🟨' : dark ? '⬛' : '⬜')).join('');
}

export function markToClass(m: string): 'correct' | 'present' | 'absent' {
  return m === 'G' ? 'correct' : m === 'Y' ? 'present' : 'absent';
}
