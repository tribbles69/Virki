import { curveValue } from './curve';
import { BUILDING_DATA, type BuildingId } from './data/buildings';
import { RESOURCES, type ResourceId } from './data/resources';
import { BARRACKS_SPEED, RECRUIT_QUEUE_SLOTS, UNIT_DATA, type UnitId } from './data/units';
import { population, storageCap } from './economy';
import { cancel, schedule } from './events';
import type { EventHandler } from './advance';
import type { GameState, RecruitBatch } from './state';

export const RECRUIT_DONE = 'recruit-done';

const MINUTE = 60_000;

/** Milliseconds to train one soldier at a Barracks level. Whole seconds, at least 1 s. */
export function trainTime(unit: UnitId, barracksLevel: number): number {
  const ms = UNIT_DATA[unit].minutes * MINUTE * curveValue(BARRACKS_SPEED, barracksLevel);
  return Math.max(1_000, Math.round(ms / 1_000) * 1_000);
}

export type RecruitBlocker = 'locked' | 'queue-full' | 'bad-count' | 'population' | 'resources';

export interface RecruitInfo {
  unit: UnitId;
  name: string;
  /** Soldiers at home. */
  owned: number;
  /** Soldiers ordered but not yet trained. */
  inTraining: number;
  /** Time per soldier at the current Barracks level. */
  time: number;
  /** Most that could be ordered right now (0 if locked or the queue is full). */
  max: number;
  /** Buildings still needed, if locked. */
  missing?: Partial<Record<BuildingId, number>>;
}

function missingFor(state: GameState, unit: UnitId): Partial<Record<BuildingId, number>> {
  const missing: Partial<Record<BuildingId, number>> = {};
  for (const [b, lvl] of Object.entries(UNIT_DATA[unit].requires) as [BuildingId, number][]) {
    if (state.buildings[b] < lvl) missing[b] = lvl;
  }
  return missing;
}

/** Largest batch affordable with current resources and free population. */
export function maxRecruitable(state: GameState, unit: UnitId): number {
  const def = UNIT_DATA[unit];
  let max = Math.floor(population(state).free / def.pop);
  for (const r of RESOURCES) if (def.cost[r] > 0) max = Math.min(max, Math.floor(state.resources[r] / def.cost[r]));
  return Math.max(0, max);
}

export function recruitInfo(state: GameState, unit: UnitId): RecruitInfo {
  const def = UNIT_DATA[unit];
  const missing = missingFor(state, unit);
  const locked = Object.keys(missing).length > 0;
  const inTraining = state.recruitQueue.filter((b) => b.unit === unit).reduce((n, b) => n + b.count - b.trained, 0);
  const full = state.recruitQueue.length >= RECRUIT_QUEUE_SLOTS;
  return {
    unit,
    name: def.name,
    owned: state.troops[unit],
    inTraining,
    time: trainTime(unit, state.buildings[def.building]),
    max: locked || full ? 0 : maxRecruitable(state, unit),
    ...(locked ? { missing } : {}),
  };
}

/** Why an order of `count` can't go ahead, or undefined if it can. */
export function recruitBlocker(state: GameState, unit: UnitId, count: number): RecruitBlocker | undefined {
  const def = UNIT_DATA[unit];
  if (Object.keys(missingFor(state, unit)).length > 0) return 'locked';
  if (state.recruitQueue.length >= RECRUIT_QUEUE_SLOTS) return 'queue-full';
  if (!Number.isInteger(count) || count < 1) return 'bad-count';
  if (count * def.pop > population(state).free) return 'population';
  if (RESOURCES.some((r) => count * def.cost[r] > state.resources[r])) return 'resources';
  return undefined;
}

export function recruitBlockerText(state: GameState, unit: UnitId, blocker: RecruitBlocker): string {
  switch (blocker) {
    case 'locked':
      return `Needs ${Object.entries(missingFor(state, unit))
        .map(([b, l]) => `${BUILDING_DATA[b as BuildingId].name} level ${l}`)
        .join(', ')}`;
    case 'queue-full':
      return `Training queue is full (${RECRUIT_QUEUE_SLOTS} batches)`;
    case 'bad-count':
      return 'Choose how many to train';
    case 'population':
      return 'Not enough population: upgrade the Farm';
    case 'resources':
      return RESOURCES.some((r) => UNIT_DATA[unit].cost[r] > storageCap(state))
        ? 'Too costly for your Warehouse'
        : 'Not enough resources';
  }
}

/** Start the first soldier of a batch training at `at`. */
function activate(state: GameState, batch: RecruitBatch, at: number) {
  batch.nextAt = at + batch.perUnit;
  batch.eventId = schedule(state, batch.nextAt, RECRUIT_DONE, null);
}

export type RecruitResult = { ok: true; state: GameState } | { ok: false; reason: RecruitBlocker };

/**
 * Order a batch of soldiers, paid in full now. They train one at a time and join
 * the army as each finishes. Batches train in order. Pure; advance first.
 */
export function recruit(state: GameState, unit: UnitId, count: number): RecruitResult {
  const blocker = recruitBlocker(state, unit, count);
  if (blocker) return { ok: false, reason: blocker };

  const def = UNIT_DATA[unit];
  const s = structuredClone(state);
  for (const r of RESOURCES) s.resources[r] -= count * def.cost[r];
  const batch: RecruitBatch = {
    unit,
    count,
    trained: 0,
    perUnit: trainTime(unit, s.buildings[def.building]),
    paidEach: { ...def.cost },
    nextAt: 0,
    eventId: 0,
  };
  s.recruitQueue.push(batch);
  if (s.recruitQueue.length === 1) activate(s, batch, s.time);
  return { ok: true, state: s };
}

/**
 * Cancel a batch by its position in the queue. Soldiers already trained stay;
 * the untrained ones are refunded in full (refunds can exceed the Warehouse cap).
 */
export function cancelRecruit(state: GameState, index: number): { ok: true; state: GameState } | { ok: false } {
  if (!Number.isInteger(index) || index < 0 || index >= state.recruitQueue.length) return { ok: false };
  const s = structuredClone(state);
  const [batch] = s.recruitQueue.splice(index, 1);
  const left = batch.count - batch.trained;
  for (const r of RESOURCES) s.resources[r] += left * batch.paidEach[r as ResourceId];
  if (index === 0) {
    cancel(s, batch.eventId);
    if (s.recruitQueue.length > 0) activate(s, s.recruitQueue[0], s.time);
  }
  return { ok: true, state: s };
}

/** When each batch will be finished, in queue order. */
export function batchEndTimes(state: GameState): number[] {
  const out: number[] = [];
  let t = 0;
  state.recruitQueue.forEach((b, i) => {
    const remaining = b.count - b.trained;
    t = i === 0 ? b.nextAt + (remaining - 1) * b.perUnit : t + remaining * b.perUnit;
    out.push(t);
  });
  return out;
}

/** Event: one soldier finished training. */
export const onRecruitDone: EventHandler = (state, event) => {
  const batch = state.recruitQueue[0];
  if (!batch || batch.eventId !== event.id) return; // stale (batch was cancelled)
  state.troops[batch.unit] += 1;
  batch.trained += 1;
  if (batch.trained < batch.count) {
    activate(state, batch, event.at);
  } else {
    state.recruitQueue.shift();
    if (state.recruitQueue.length > 0) activate(state, state.recruitQueue[0], event.at);
  }
};
