import { Rng } from './rng';
import { schedule, cancel, type GameEvent } from './events';
import type { GameState } from './state';
import { defaultRules } from './rules';

/** Tools a handler gets while an event runs. */
export interface StepContext {
  /** The main random stream; its position is saved back into the state. */
  rng: Rng;
  schedule<P>(at: number, type: string, payload: P): number;
  cancel(id: number): boolean;
}

/** Reacts to one event at its exact time. May change state and schedule more events. */
export type EventHandler = (state: GameState, event: GameEvent, ctx: StepContext) => void;

/**
 * Continuous change between two moments (e.g. production = rate × elapsed).
 * Must be additive: running from→mid then mid→to must equal from→to, so a
 * week of catch-up gives the same result as a week of live play.
 */
export type System = (state: GameState, from: number, to: number) => void;

export interface Rules {
  systems: readonly System[];
  handlers: Readonly<Record<string, EventHandler>>;
}

/** Hard stop against a handler that keeps rescheduling itself at the same moment. */
const MAX_EVENTS_PER_ADVANCE = 1_000_000;

/**
 * Bring the game forward to `now`, resolving every due event in time order.
 * Pure: returns a new state and never touches the one passed in. If `now` is
 * not after the state's time (clock moved backwards), the state is returned as is.
 */
export function advance(state: GameState, now: number, rules: Rules = defaultRules): GameState {
  if (!(now > state.time)) return state;

  const s = structuredClone(state);
  const rng = new Rng(s.rng);
  const ctx: StepContext = {
    rng,
    schedule: (at, type, payload) => schedule(s, at, type, payload),
    cancel: (id) => cancel(s, id),
  };

  const runSystems = (to: number) => {
    if (to > s.time) for (const system of rules.systems) system(s, s.time, to);
    if (to > s.time) s.time = to;
  };

  let processed = 0;
  while (s.events.length > 0 && s.events[0].at <= now) {
    if (++processed > MAX_EVENTS_PER_ADVANCE) {
      throw new Error('advance: too many events; a handler is probably rescheduling itself in a loop');
    }
    const event = s.events.shift()!;
    // Events scheduled in the past (e.g. "finish now") run at the current time.
    runSystems(event.at);
    const handler = rules.handlers[event.type];
    if (!handler) throw new Error(`advance: no handler for event type "${event.type}"`);
    handler(s, event, ctx);
  }

  runSystems(now);
  s.rng = rng.state;
  return s;
}
