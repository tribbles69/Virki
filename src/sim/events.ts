import type { GameState } from './state';

/**
 * Something that will happen at a known moment: a build finishing, an army
 * arriving, the daily reset. `type` picks the handler in Rules; `payload` is
 * plain data for it.
 */
export interface GameEvent<P = unknown> {
  id: number;
  at: number;
  type: string;
  payload: P;
}

// These mutate the state they're given. Inside the sim that is always the
// private working copy made by advance(), never the caller's state.

/** Add an event to the queue and return its id. Same-time events run in schedule order. */
export function schedule<P>(state: GameState, at: number, type: string, payload: P): number {
  if (!Number.isFinite(at)) throw new Error(`schedule: bad time for "${type}"`);
  const event: GameEvent<P> = { id: state.nextEventId++, at, type, payload };
  // Binary search for the insert point; ids only grow, so ties land after existing events.
  const q = state.events;
  let lo = 0;
  let hi = q.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (q[mid].at <= at) lo = mid + 1;
    else hi = mid;
  }
  q.splice(lo, 0, event);
  return event.id;
}

/** Remove a pending event. Returns false if it wasn't queued (already run or never existed). */
export function cancel(state: GameState, id: number): boolean {
  const i = state.events.findIndex((e) => e.id === id);
  if (i < 0) return false;
  state.events.splice(i, 1);
  return true;
}

/** Earliest pending event of a type, if any (e.g. "when does the current build finish?"). */
export function nextOfType(state: GameState, type: string): GameEvent | undefined {
  return state.events.find((e) => e.type === type);
}
