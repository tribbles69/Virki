import { hashSeed, type RngState } from './rng';
import type { GameEvent } from './events';

/** Bump when the save shape changes, and add a migration in the save layer. */
export const SAVE_VERSION = 1;

/** The entire game. Plain JSON-safe data only: it is what gets saved. */
export interface GameState {
  version: number;
  /** Save seed chosen at new game; all randomness descends from it. */
  seed: string;
  /** Sim clock in ms since epoch: the moment this state is valid for. */
  time: number;
  /** Current position of the main random stream. */
  rng: RngState;
  /** Next id handed out by schedule(); also breaks ties between same-time events. */
  nextEventId: number;
  /** Pending events, kept sorted by (at, id). */
  events: GameEvent[];
}

export function newGame(seed: string, now: number): GameState {
  return {
    version: SAVE_VERSION,
    seed,
    time: now,
    rng: hashSeed(seed),
    nextEventId: 1,
    events: [],
  };
}
