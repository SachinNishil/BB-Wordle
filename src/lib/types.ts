export type Slot = 1 | 2;

export interface Player {
  slot: Slot;
  name: string;
  photo: string | null;
}

export interface Room {
  server_now: string;
  players: Player[];
  active_game_id: string | null;
}

export type GameStatus = 'setting' | 'waiting' | 'ready' | 'live' | 'player_one_complete' | 'player_two_complete' | 'completed';
export type PlayerStatus = 'waiting' | 'ready' | 'playing' | 'solved' | 'failed';
export type GameResult = 'win' | 'draw' | 'both_failed';

export interface GuessRow {
  word: string;
  pattern: string;
}

interface PlayerViewBase {
  slot: Slot;
  status: PlayerStatus;
  joined_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  guess_count: number;
  gave_up: boolean;
}
export interface MeView extends PlayerViewBase {
  guesses: GuessRow[];
}
export interface PartnerView extends PlayerViewBase {
  patterns: string[];
  /** Their words: only once MY round is over (spectator mode) or the game is complete. */
  guesses: GuessRow[] | null;
}

/** Trash talk sent while spectating (v1.4). */
export interface Taunt {
  id: number;
  from: Slot;
  body: string;
  at: string;
}

export type GameMode = 'classic' | 'challenge';

export interface GameView {
  id: string;
  number: number;
  mode: GameMode;
  status: GameStatus;
  created_by: Slot;
  created_at: string;
  starts_at: string | null;
  completed_at: string | null;
  winner: Slot | null;
  result: GameResult | null;
  /** The word this player is solving. Null until they have finished (or the game is over). */
  answer: string | null;
  /** The word the partner is solving: at completion, or (challenge) the word I picked for them. */
  partner_answer: string | null;
  /** Who picked/added the word I solved. Null until I have finished. */
  word_added_by: Slot | null;
  /** Challenge mode: the word I picked for my partner. */
  my_challenge_word: string | null;
  i_have_set: boolean;
  partner_has_set: boolean;
  me: MeView;
  partner: PartnerView;
  /** Trash talk in this game, oldest first (last 40). Missing on older servers. */
  taunts?: Taunt[];
}

export interface GameState {
  server_now: string;
  game: GameView | null;
  already_active?: boolean;
}

export interface GuessResult extends GameState {
  pattern: string;
  attempt: number;
}

export interface HistoryPlayer {
  slot: Slot;
  status: PlayerStatus;
  guess_count: number;
  duration_ms: number | null;
  started_at: string | null;
  finished_at: string | null;
  gave_up: boolean;
  guesses: GuessRow[];
}

export interface HistoryGame {
  id: string;
  number: number;
  created_at: string;
  created_by: Slot;
  starts_at: string | null;
  completed_at: string;
  mode: GameMode;
  /** Classic only. Use word_for_1 / word_for_2 for both modes. */
  word: string | null;
  word_added_by: Slot | null;
  word_for_1: string;
  word_for_2: string;
  winner: Slot | null;
  result: GameResult;
  players: HistoryPlayer[];
}

export interface WordRow {
  id: number;
  word: string;
  added_by: Slot;
  in_dictionary: boolean;
  created_at: string;
  times_played: number;
  last_played_at: string | null;
}

export interface AddWordsResult {
  added: string[];
  duplicates: { word: string; added_by: Slot | null; reason: 'repeated_in_list' | 'already_in_repository' }[];
  invalid: string[];
  unknown: string[];
}
