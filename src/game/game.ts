import { advance, newGame, type GameState } from '../sim';
import type { SaveStore } from './db';
import { migrateSave, SaveError } from './migrate';
import { exportSaveText, parseSaveText } from './saveFile';
import { summarise, type CatchUpSummary } from './summary';

export type LoadSource = 'new' | 'save' | 'backup';

export interface StartResult {
  game: Game;
  source: LoadSource;
  /** Set when a save existed; describes the offline catch-up. */
  summary?: CatchUpSummary;
  /** Set when the main save was damaged and the backup (or a new game) was used. */
  warning?: string;
}

/** Autosave at most this often while just ticking (actions always save immediately). */
const TICK_SAVE_INTERVAL = 30_000;

/**
 * The running game: owns the current state, brings it up to date with the real
 * clock, applies player actions, and saves. The sim stays pure; this is where
 * the clock and storage live.
 */
export class Game {
  private listeners = new Set<(s: GameState) => void>();
  private saving: Promise<void> = Promise.resolve();
  private lastSavedAt = 0;

  private constructor(
    private _state: GameState,
    private readonly store: SaveStore,
    private readonly clock: () => number,
  ) {}

  get state(): GameState {
    return this._state;
  }

  /** Load the save (or backup, or start fresh) and catch up to now. */
  static async start(store: SaveStore, clock: () => number, newSeed: () => string): Promise<StartResult> {
    const now = clock();
    const { current, previous } = await store.read();
    let loaded: GameState | undefined;
    let source: LoadSource = 'new';
    let warning: string | undefined;

    for (const [slot, src] of [[current, 'save'], [previous, 'backup']] as const) {
      if (!slot) continue;
      try {
        loaded = migrateSave(slot.state);
        source = src;
        break;
      } catch (e) {
        warning = e instanceof SaveError ? e.message : String(e);
      }
    }
    if (source === 'save') warning = undefined;
    else if (source === 'backup') warning = `Your latest save was damaged, so the previous one was loaded. (${warning})`;
    else if (warning) warning = `Your save couldn’t be loaded, so a new village was started. (${warning})`;

    const before = loaded ?? newGame(newSeed(), now);
    const state = advance(before, now);
    const game = new Game(state, store, clock);
    await game.save();
    return { game, source, warning, summary: loaded ? summarise(before, state) : undefined };
  }

  /** Bring the state up to the current time. Call on a timer and when the app regains focus. */
  tick(): GameState {
    this.setState(advance(this._state, this.clock()));
    if (this.clock() - this.lastSavedAt >= TICK_SAVE_INTERVAL) void this.save();
    return this._state;
  }

  /**
   * Apply a player action (e.g. s => startUpgrade(s, 'quarry')). Catches up
   * first so it sees current resources, then saves straight away.
   */
  async act<R extends { ok: boolean; state?: GameState }>(command: (s: GameState) => R): Promise<R> {
    const current = advance(this._state, this.clock());
    const result = command(current);
    this.setState(result.ok && result.state ? result.state : current);
    if (result.ok) await this.save();
    return result;
  }

  /** Replace the game with an imported save file (after the player confirms). Throws SaveError if invalid. */
  async importText(text: string): Promise<CatchUpSummary> {
    const before = parseSaveText(text);
    const after = advance(before, this.clock());
    this.setState(after);
    await this.save();
    return summarise(before, after);
  }

  exportText(): string {
    return exportSaveText(this.tick(), new Date(this.clock()));
  }

  /** Start over: wipes the save. */
  async reset(newSeed: string): Promise<void> {
    this.setState(newGame(newSeed, this.clock()));
    await this.store.clear();
    await this.save();
  }

  /** Writes are queued so they always land in order. */
  save(): Promise<void> {
    const snapshot = this._state;
    const at = this.clock();
    this.lastSavedAt = at;
    this.saving = this.saving.catch(() => undefined).then(() => this.store.write(snapshot, at));
    return this.saving;
  }

  subscribe(fn: (s: GameState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setState(s: GameState) {
    if (s === this._state) return;
    this._state = s;
    for (const fn of this.listeners) fn(s);
  }
}
