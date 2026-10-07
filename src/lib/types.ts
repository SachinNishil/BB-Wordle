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

export type GameStatus = 'waiting' | 'ready' | 'live' | 'player_one_complete' | 'player_two_complete' | 'completed';
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
  /** Only once the whole game is complete. */
  guesses: GuessRow[] | null;
}

export interface GameView {
  id: string;
  number: number;
  status: GameStatus;
  created_by: Slot;
  created_at: string;
  starts_at: string | null;
  completed_at: string | null;
  winner: Slot | null;
  result: GameResult | null;
  /** Null until this player has finished (or the game is over). */
  answer: string | null;
  word_added_by: Slot | null;
  me: MeView;
  partner: PartnerView;
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
  word: string;
  word_added_by: Slot;
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
