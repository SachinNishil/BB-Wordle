import { expect, it } from 'vitest';
import { classify, splitWords } from './bulk';

it('splits pasted lists in many shapes', () => {
  expect(splitWords('CRANE\nhouse,  plant;brick\tmouse')).toEqual(['CRANE', 'house', 'plant', 'brick', 'mouse']);
  expect(splitWords('1. CRANE\n2) HOUSE\n- PLANT\n• BRICK')).toEqual(['CRANE', 'HOUSE', 'PLANT', 'BRICK']);
  expect(splitWords('  \n\n ')).toEqual([]);
});

it('classifies every word', () => {
  const dict = new Set(['CRANE', 'HOUSE', 'PLANT', 'BRICK']);
  const out = classify('crane house HOUSE plant toolong qwxyz ab1de', new Set(['PLANT']), dict);
  expect(out.map((w) => `${w.word}:${w.verdict}`)).toEqual([
    'CRANE:new', 'HOUSE:new', 'HOUSE:repeated', 'PLANT:duplicate', 'TOOLONG:invalid', 'QWXYZ:unknown', 'AB1DE:invalid',
  ]);
});

it('does not flag unknown words when the dictionary failed to load', () => {
  expect(classify('qwxyz', new Set(), new Set())[0].verdict).toBe('new');
});
