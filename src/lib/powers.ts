// v1.21 Sabotage mode: the eighteen powers. The server enforces the ones that change
// the rules (Banned letter, Colour blind, Liar tile, Delayed reveal, Freeze, Speed trap,
// Steal a row, Forced first, Shield, Bounce back); the phone does the screen effects.
import type { PowerId } from './types';

export interface Power {
  id: PowerId;
  emoji: string;
  name: string;
  /** What it does to them, short. */
  what: string;
  group: 'Screen' | 'Keyboard' | 'Colours' | 'Time and moves' | 'Defence';
  /** v1.22: coins it costs (you have BUDGET for your three). Same numbers as _sab_cost on the server. */
  cost: number;
}

export const BUDGET = 8;

export const POWERS: Power[] = [
  { id: 'fog', emoji: '🌫️', name: 'Fog', what: 'Their board and keyboard blur for one guess', group: 'Screen', cost: 2 },
  { id: 'quake', emoji: '🫨', name: 'Earthquake', what: 'Their screen shakes for 10 seconds', group: 'Screen', cost: 1 },
  { id: 'dark', emoji: '🔦', name: 'Lights out', what: 'Dark screen for 15 seconds, just a torch under their finger', group: 'Screen', cost: 2 },
  { id: 'mirror', emoji: '🪞', name: 'Mirror', what: 'Their board shows back to front for one guess', group: 'Screen', cost: 2 },
  { id: 'ban', emoji: '🚫', name: 'Banned letter', what: 'A letter they need is locked for one guess', group: 'Keyboard', cost: 3 },
  { id: 'shuffle', emoji: '🔀', name: 'Shuffle', what: 'Their keyboard letters swap places for one guess', group: 'Keyboard', cost: 2 },
  { id: 'sticky', emoji: '🍯', name: 'Sticky key', what: 'One letter types twice for one guess', group: 'Keyboard', cost: 1 },
  { id: 'ghost', emoji: '👻', name: 'Ghost letter', what: 'A random letter types itself into their row', group: 'Keyboard', cost: 1 },
  { id: 'blind', emoji: '🙈', name: 'Colour blind', what: 'Their next two guesses show grey; colours come back after the third', group: 'Colours', cost: 5 },
  { id: 'liar', emoji: '🤥', name: 'Liar tile', what: 'One tile in their next row shows the wrong colour', group: 'Colours', cost: 4 },
  { id: 'delay', emoji: '⏳', name: 'Delayed reveal', what: "Their next guess doesn't show colours until they play another", group: 'Colours', cost: 3 },
  { id: 'amnesia', emoji: '🫥', name: 'Keyboard amnesia', what: 'Their keyboard forgets its colours for one guess', group: 'Colours', cost: 2 },
  { id: 'freeze', emoji: '❄️', name: 'Freeze', what: "They can't type for 8 seconds", group: 'Time and moves', cost: 2 },
  { id: 'speed', emoji: '⏱️', name: 'Speed trap', what: '20 seconds for their next guess, or that row stays blind', group: 'Time and moves', cost: 3 },
  { id: 'steal', emoji: '🦝', name: 'Steal a row', what: 'They lose one of their six guesses', group: 'Time and moves', cost: 4 },
  { id: 'first', emoji: '🔤', name: 'Forced first', what: "You pick the first letter of their next guess", group: 'Time and moves', cost: 3 },
  { id: 'shield', emoji: '🛡️', name: 'Shield', what: 'Blocks the next sabotage aimed at you', group: 'Defence', cost: 3 },
  { id: 'bounce', emoji: '🪃', name: 'Bounce back', what: 'The next sabotage aimed at you hits them instead', group: 'Defence', cost: 5 },
];

export const costOf = (ids: readonly string[]) => ids.reduce((n, id) => n + (POWERS.find((p) => p.id === id)?.cost ?? 0), 0);
export const powerById = (id: string) => POWERS.find((p) => p.id === id)!;
export const isDefence = (id: string) => id === 'shield' || id === 'bounce';
/** Letters Forced first can pick (the server refuses Q, X and Z). */
export const FIRST_LETTERS = [...'ABCDEFGHIJKLMNOPRSTUVWY'];
