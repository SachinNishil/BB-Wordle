import { syncClock } from './clock';
import { supabase } from './supabase';
import type { GameMode, GameState, GuessResult, PowerId, HistoryGame, Room, Slot, SoloState, SoloStats, SoloView, WordSettingsInfo } from './types';

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
  no_words: 'The word list is missing. Run dictionary.sql in Supabase.',
  not_started: "The game hasn't started yet.",
  too_early: 'Hold on, the countdown is still running.',
  not_a_word: 'Not in word list',
  invalid_guess: 'Not enough letters',
  stale_attempt: 'Updated from your other device.',
  already_finished: "You've already finished this round.",
  game_over: 'This game is over.',
  game_not_found: 'That game no longer exists.',
  cannot_cancel: 'Someone has already guessed, so this game can only be finished.',
  words_locked: 'Both words are already in.',
  not_a_challenge: 'This game is not a challenge.',
  no_room: 'The database needs setting up. Run schema.sql in Supabase.',
  bad_photo: "That photo couldn't be used.",
  bad_name: 'Names need 1 to 24 characters.',
  not_your_turn_to_talk: 'Messages open up once you finish. Until then, use the emoji soundboard.',
  bad_taunt: 'Keep it to 60 characters.',
  too_fast: 'Easy, easy. Give it a second.',
  dictionary_outdated: 'The word list needs updating. Run the new dictionary.sql in Supabase.',
  bad_status: 'Keep it to 80 characters.',
  too_many_guesses: "That's 100 guesses. Time to give up?",
  frozen: "You're frozen ❄️ Hang on a few seconds.",
  banned_letter: 'That letter is banned for this guess 🚫',
  forced_letter: 'Your guess has to start with the forced letter',
  cooldown: 'Give it a moment: one power every 30 seconds',
  partner_busy: 'They already have a sabotage on them. Wait for it to wear off.',
  power_used: 'You already used that one',
  power_not_yours: "That isn't one of your powers",
  partner_done: 'Their round is already over',
  not_playing: 'Powers only work while you are playing',
  already_armed: 'You already have a defence armed',
  pick_three: 'Pick three different powers',
  over_budget: 'That hand costs more than 8 coins',
  powers_locked: 'Powers are locked once the countdown starts',
  bad_letter: 'Pick another letter',
  telegram_not_set_up: 'Telegram is not set up yet (see the README).',
  telegram_unavailable: 'Turn on the pg_net extension in Supabase first (Database › Extensions).',
};
type SoloOne = { server_now: string; solo: SoloView };
export interface TelegramStatus { configured: boolean; bot?: string; link?: string; me?: boolean; partner?: boolean }

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

  getWordSettings: () => call<WordSettingsInfo>('get_word_settings', K),
  setWordSettings: (slot: Slot, ed: boolean, plural: boolean, uncommon: boolean) =>
    call<WordSettingsInfo>('set_word_settings', { ...K, p_slot: slot, p_ed: ed, p_plural: plural, p_uncommon: uncommon }),
  setStatus: (slot: Slot, text: string) => call<Room>('set_status', { ...K, p_slot: slot, p_text: text }),

  getGameState: (slot: Slot, gameId: string | null = null) =>
    call<GameState>('get_game_state', { ...K, p_slot: slot, p_game_id: gameId }),
  startGame: (slot: Slot, mode: GameMode = 'classic') => call<GameState>('start_game', { ...K, p_slot: slot, p_mode: mode }),
  setChallengeWord: (slot: Slot, gameId: string, word: string) =>
    call<GameState>('set_challenge_word', { ...K, p_slot: slot, p_game_id: gameId, p_word: word }),
  joinGame: (slot: Slot, gameId: string, playNow = false) =>
    call<GameState>('join_game', { ...K, p_slot: slot, p_game_id: gameId, p_play_now: playNow }),
  pauseRound: (slot: Slot, gameId: string, paused: boolean) =>
    call<GameState>('pause_round', { ...K, p_slot: slot, p_game_id: gameId, p_paused: paused }),
  sabotageLoadout: (slot: Slot, gameId: string, powers: PowerId[] | null) =>
    call<GameState>('sabotage_loadout', { ...K, p_slot: slot, p_game_id: gameId, p_powers: powers }),
  sabotageSend: (slot: Slot, gameId: string, power: PowerId, letter: string | null = null) =>
    call<GameState & { blocked?: boolean; bounced?: boolean }>('sabotage_send', { ...K, p_slot: slot, p_game_id: gameId, p_power: power, p_letter: letter }),
  lobby: (slot: Slot, gameId: string, here = true) =>
    call<GameState>('lobby', { ...K, p_slot: slot, p_game_id: gameId, p_here: here }),
  beginRound: (slot: Slot, gameId: string) => call<GameState>('begin_round', { ...K, p_slot: slot, p_game_id: gameId }),
  submitGuess: (slot: Slot, gameId: string, guess: string, attempt: number) =>
    call<GuessResult>('submit_guess', { ...K, p_slot: slot, p_game_id: gameId, p_guess: guess, p_attempt: attempt }),
  sendTaunt: (slot: Slot, gameId: string, body: string, kind: 'chat' | 'boom' = 'chat') =>
    call<GameState>('send_taunt', { ...K, p_slot: slot, p_game_id: gameId, p_body: body, p_kind: kind }),
  setDraft: (slot: Slot, gameId: string, row: number, text: string) =>
    call<boolean>('set_draft', { ...K, p_slot: slot, p_game_id: gameId, p_row: row, p_text: text }),
  markTauntsSeen: (slot: Slot, gameId: string, upto: number) =>
    call<boolean>('mark_taunts_seen', { ...K, p_slot: slot, p_game_id: gameId, p_upto: upto }),
  giveUp: (slot: Slot, gameId: string) => call<GameState>('give_up', { ...K, p_slot: slot, p_game_id: gameId }),
  cancelGame: (slot: Slot, gameId: string) => call<boolean>('cancel_game', { ...K, p_slot: slot, p_game_id: gameId }),
  getHistory: (limit: number | null = null) => call<HistoryGame[]>('get_history', { ...K, p_limit: limit }),

  // Solo (v1.10)
  soloStart: (slot: Slot) => call<SoloOne>('solo_start', { ...K, p_slot: slot }),
  soloGuess: (slot: Slot, id: string, guess: string, attempt: number) =>
    call<SoloOne & { pattern: string }>('solo_guess', { ...K, p_slot: slot, p_id: id, p_guess: guess, p_attempt: attempt }),
  soloGiveUp: (slot: Slot, id: string) => call<SoloOne>('solo_give_up', { ...K, p_slot: slot, p_id: id }),
  soloDraft: (slot: Slot, id: string, text: string) => call<boolean>('solo_draft', { ...K, p_slot: slot, p_id: id, p_text: text }),
  soloState: (slot: Slot, id: string | null = null) => call<SoloState>('solo_state', { ...K, p_slot: slot, p_id: id }),
  soloTaunt: (slot: Slot, id: string, body: string, kind: 'chat' | 'boom' = 'chat') =>
    call<SoloOne>('solo_taunt', { ...K, p_slot: slot, p_id: id, p_body: body, p_kind: kind }),
  soloPause: (slot: Slot, id: string) => call<SoloOne>('solo_pause', { ...K, p_slot: slot, p_id: id }),
  soloResume: (slot: Slot, id: string) => call<SoloOne>('solo_resume', { ...K, p_slot: slot, p_id: id }),
  soloHistory: (limit = 1000) => call<SoloView[]>('solo_history', { ...K, p_limit: limit }),
  soloStats: () => call<SoloStats[]>('solo_stats', K),
  // Telegram invites (v1.17)
  telegramStatus: (slot: Slot) => call<TelegramStatus>('telegram_status', { ...K, p_slot: slot }),
  telegramCheck: (slot: Slot) => call<{ request_id: number }>('telegram_check', { ...K, p_slot: slot }),
  telegramCheckResult: (slot: Slot, requestId: number) =>
    call<{ status: 'pending' | 'connected' | 'not_found' | 'error' }>('telegram_check_result', { ...K, p_slot: slot, p_request_id: requestId }),
  telegramDisconnect: (slot: Slot) => call<boolean>('telegram_disconnect', { ...K, p_slot: slot }),
  seen: (slot: Slot) => call<boolean>('seen', { ...K, p_slot: slot }),
};
