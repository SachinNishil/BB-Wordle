import { syncClock } from './clock';
import { supabase } from './supabase';
import type { AddWordsResult, GameMode, GameState, GuessResult, HistoryGame, Room, Slot, WordRow } from './types';

/** An error from the server, with a code from supabase/schema.sql (e.g. "not_a_word"). */
export class ApiError extends Error {
  code: string;
  detail: string;
  network: boolean;
  constructor(code: string, detail = '', network = false) {
    super(code);
    this.code = code;
    this.detail = detail;
    this.network = network;
  }
}

const FRIENDLY: Record<string, string> = {
  bad_player: 'Pick who you are in Settings first.',
  no_words: 'Add some words to the repository first.',
  not_started: "The game hasn't started yet.",
  too_early: 'Hold on, the countdown is still running.',
  not_a_word: 'Not in word list',
  invalid_guess: 'Not enough letters',
  stale_attempt: 'Updated from your other device.',
  already_finished: "You've already finished this round.",
  game_over: 'This game is over.',
  game_not_found: 'That game no longer exists.',
  cannot_cancel: 'Someone has already guessed, so this game can only be finished.',
  cannot_delete_word: 'You can only remove words you added.',
  words_locked: 'Both words are already in.',
  not_a_challenge: 'This game is not a challenge.',
  no_room: 'The database needs setting up. Run schema.sql in Supabase.',
  bad_photo: "That photo couldn't be used.",
  bad_name: 'Names need 1 to 24 characters.',
  too_many_words: 'Paste up to 5,000 words at a time.',
};

export function friendlyError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.network) return "Can't reach the server. Check your connection.";
    return FRIENDLY[e.code] ?? 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new ApiError('not_configured');
  const sent = Date.now();
  let res;
  try {
    res = await supabase.rpc(fn, args);
  } catch {
    throw new ApiError('network', '', true);
  }
  const { data, error } = res;
  if (error) {
    // PostgREST passes our RAISE message through as-is; fetch failures don't have a code.
    const network = !error.code && /fetch|network|load failed/i.test(error.message ?? '');
    throw new ApiError(network ? 'network' : error.message, (error as { details?: string }).details ?? '', network);
  }
  const maybe = data as { server_now?: string } | null;
  if (maybe && typeof maybe === 'object' && 'server_now' in maybe) syncClock(maybe.server_now, sent, Date.now());
  return data as T;
}

// The database functions still take a p_key argument (room keys were removed
// in v1.2); it is ignored, so we always send an empty string.
const K = { p_key: '' };

export const api = {
  getRoom: () => call<Room>('get_room', K),
  updatePlayer: (slot: Slot, name: string | null, photo: string | null, clearPhoto = false) =>
    call<Room>('update_player', { ...K, p_slot: slot, p_name: name, p_photo: photo, p_clear_photo: clearPhoto }),

  listWords: () => call<WordRow[]>('list_words', K),
  addWords: (slot: Slot, words: string[], allowUnknown = false) =>
    call<AddWordsResult>('add_words', { ...K, p_slot: slot, p_words: words, p_allow_unknown: allowUnknown }),
  deleteWord: (slot: Slot, id: number) => call<boolean>('delete_word', { ...K, p_slot: slot, p_word_id: id }),

  getGameState: (slot: Slot, gameId: string | null = null) =>
    call<GameState>('get_game_state', { ...K, p_slot: slot, p_game_id: gameId }),
  startGame: (slot: Slot, mode: GameMode = 'classic') => call<GameState>('start_game', { ...K, p_slot: slot, p_mode: mode }),
  setChallengeWord: (slot: Slot, gameId: string, word: string) =>
    call<GameState>('set_challenge_word', { ...K, p_slot: slot, p_game_id: gameId, p_word: word }),
  joinGame: (slot: Slot, gameId: string, playNow = false) =>
    call<GameState>('join_game', { ...K, p_slot: slot, p_game_id: gameId, p_play_now: playNow }),
  beginRound: (slot: Slot, gameId: string) => call<GameState>('begin_round', { ...K, p_slot: slot, p_game_id: gameId }),
  submitGuess: (slot: Slot, gameId: string, guess: string, attempt: number) =>
    call<GuessResult>('submit_guess', { ...K, p_slot: slot, p_game_id: gameId, p_guess: guess, p_attempt: attempt }),
  giveUp: (slot: Slot, gameId: string) => call<GameState>('give_up', { ...K, p_slot: slot, p_game_id: gameId }),
  cancelGame: (slot: Slot, gameId: string) => call<boolean>('cancel_game', { ...K, p_slot: slot, p_game_id: gameId }),
  getHistory: (limit: number | null = null) => call<HistoryGame[]>('get_history', { ...K, p_limit: limit }),
};
