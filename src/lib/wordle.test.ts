import { describe, expect, it } from 'vitest';
import { evaluate, keyboardStates, patternToEmoji } from './wordle';

describe('evaluate: basics', () => {
  it('solved', () => expect(evaluate('CRANE', 'CRANE')).toBe('GGGGG'));
  it('nothing in common', () => expect(evaluate('BUMPY', 'CRANE')).toBe('XXXXX'));
  it('all present, none placed', () => expect(evaluate('NACER', 'CRANE')).toBe('YYYYY'));
  it('is case-insensitive', () => expect(evaluate('crane', 'Crane')).toBe('GGGGG'));
  it('rejects bad input', () => {
    expect(() => evaluate('CRAN', 'CRANE')).toThrow();
    expect(() => evaluate('CRAN3', 'CRANE')).toThrow();
  });
});

describe('evaluate: duplicate letters', () => {
  // Guess has two of a letter, answer has one.
  it('second copy is gray when the first is already yellow', () => {
    expect(evaluate('SPEED', 'ABIDE')).toBe('XXYXY'); // only one E in ABIDE
  });
  it('first copy green, second copy yellow, extra copy gray', () => {
    expect(evaluate('LLAMA', 'LOCAL')).toBe('GYYXX');
  });
  it('answer has a double: one copy green, the other yellow', () => {
    expect(evaluate('KEBAB', 'ABBEY')).toBe('XYGYY');
  });
  it('earlier copy is gray when the only copy is matched green later', () => {
    // Answer has one E (pos 5). Guess EERIE has E at 1, 2, 5.
    expect(evaluate('EERIE', 'CRANE')).toBe('XXYXG');
  });
  it('two copies in both words, none placed', () => {
    expect(evaluate('ERASE', 'SPEED')).toBe('YXXYY');
  });
  it('three copies guessed, two in answer', () => {
    // Answer EERIE has E at 1,2,5. Guess EMCEE has E at 1,4,5.
    expect(evaluate('EMCEE', 'EERIE')).toBe('GXXYG');
  });
  it('answer has a double, guess has a single', () => {
    expect(evaluate('PLANT', 'APPLE')).toBe('YYYXX');
  });
  it('answer has a double, guess has both in wrong places', () => {
    expect(evaluate('HELLO', 'LLAMA')).toBe('XXYYX');
  });
  it('triple in guess, single in answer', () => {
    expect(evaluate('BOBBY', 'ROBIN')).toBe('XGGXX');
  });
  it('yellow allocation is left to right', () => {
    // Answer has one O (pos 3). Guess OOZES: O at 1 is yellow, O at 2 is gray.
    expect(evaluate('OOZES', 'BLOCK')).toBe('YXXXX');
  });
  it('guess has a double: one green, one yellow', () => {
    expect(evaluate('ABBEY', 'KEBAB')).toBe('YYGYX');
  });
});

describe('keyboardStates', () => {
  it('green beats yellow beats gray and duplicates never downgrade', () => {
    const states = keyboardStates([
      { word: 'SPEED', pattern: evaluate('SPEED', 'ABIDE') }, // E yellow then E gray
      { word: 'ABIDE', pattern: 'GGGGG' },
    ]);
    expect(states.E).toBe('correct');
    expect(states.S).toBe('absent');
    expect(states.D).toBe('correct');
  });
  it('a gray second copy does not hide a yellow', () => {
    const states = keyboardStates([{ word: 'SPEED', pattern: evaluate('SPEED', 'ABIDE') }]);
    expect(states.E).toBe('present');
  });
});

it('patternToEmoji', () => {
  expect(patternToEmoji('GYXXG')).toBe('🟩🟨⬛⬛🟩');
});
