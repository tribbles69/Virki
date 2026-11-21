import { curveValue } from './curve';
import { METALS, METAL_DATA, ORE_PER_INGOT, SMELT_QUEUE_SLOTS, type MetalId } from './data/resources';
import { SMITHY_SPEED } from './data/smithy';
import { productionPerHour, storageCap } from './economy';
import { cancel, schedule } from './events';
import type { EventHandler, System } from './advance';
import type { GameState } from './state';

export const SMELT_DONE = 'smelt-done';
const HOUR = 3_600_000;
const MINUTE = 60_000;

/** A batch of ingots at the forge. The whole batch is ready at once. */
export interface SmeltBatch {
  metal: MetalId;
  count: number;
  startedAt: number;
  finishesAt: number;
  /** What was paid, refunded in full if cancelled. */
  paidOre: number;
  paidWood: number;
  eventId: number;
}

export const noMetals = (): Record<MetalId, number> => Object.fromEntries(METALS.map((m) => [m, 0])) as Record<MetalId, number>;

/** Metals the Mine has unlocked, worst to best. */
export function unlockedMetals(state: GameState): MetalId[] {
  return METALS.filter((m) => state.buildings.mine >= METAL_DATA[m].mine);
}

export const isUnlocked = (state: GameState, m: MetalId) => state.buildings.mine >= METAL_DATA[m].mine;

/** Ore of a metal mined per hour. Copper is the usual ore rate; each higher metal a fraction of it. */
export function orePerHour(state: GameState, m: MetalId): number {
  if (!isUnlocked(state, m)) return 0;
  return productionPerHour(state, 'ore') * METAL_DATA[m].rate;
}

/** Ore of a metal in store. Copper ore is the everyday `ore` resource. */
export function oreStock(state: GameState, m: MetalId): number {
  return m === 'copper' ? state.resources.ore : state.ores[m];
}

/**
 * Continuous mining of the higher ores (copper is handled by `production`).
 * Capped by the Warehouse like other resources; additive like every system.
 */
export const metalProduction: System = (state, from, to) => {
  const hours = (to - from) / HOUR;
  const cap = storageCap(state);
  for (const m of METALS) {
    if (m === 'copper' || !isUnlocked(state, m)) continue;
    const current = state.ores[m];
    if (current >= cap) continue;
    state.ores[m] = Math.min(cap, current + orePerHour(state, m) * hours);
  }
};

/** Milliseconds to smelt one ingot at a Smithy level. */
export function smeltTimePerIngot(m: MetalId, smithyLevel: number): number {
  return Math.max(1_000, Math.round((METAL_DATA[m].smeltMinutes * MINUTE * curveValue(SMITHY_SPEED, smithyLevel)) / 1_000) * 1_000);
}

export type SmeltBlocker = 'no-smithy' | 'locked' | 'queue-full' | 'bad-count' | 'ore' | 'fuel';

export function smeltBlocker(state: GameState, m: MetalId, count: number): SmeltBlocker | undefined {
  if (state.buildings.smithy < 1) return 'no-smithy';
  if (!isUnlocked(state, m)) return 'locked';
  if (state.smeltQueue.length >= SMELT_QUEUE_SLOTS) return 'queue-full';
  if (!Number.isInteger(count) || count < 1) return 'bad-count';
  if (count * ORE_PER_INGOT > oreStock(state, m)) return 'ore';
  if (count * METAL_DATA[m].fuel > state.resources.wood) return 'fuel';
  return undefined;
}

export function smeltBlockerText(m: MetalId, b: SmeltBlocker): string {
  const name = METAL_DATA[m].name;
  switch (b) {
    case 'no-smithy':
      return 'Build a Smithy to smelt ore';
    case 'locked':
      return `${name} needs Mine level ${METAL_DATA[m].mine}`;
    case 'queue-full':
      return `The forge is full (${SMELT_QUEUE_SLOTS} batches)`;
    case 'bad-count':
      return 'Choose how many ingots';
    case 'ore':
      return `Not enough ${name.toLowerCase()} ore`;
    case 'fuel':
      return 'Not enough wood for the furnace';
  }
}

/** Most ingots of a metal the stores can pay for right now. */
export function maxSmeltable(state: GameState, m: MetalId): number {
  if (!isUnlocked(state, m)) return 0;
  return Math.max(0, Math.min(Math.floor(oreStock(state, m) / ORE_PER_INGOT), Math.floor(state.resources.wood / METAL_DATA[m].fuel)));
}

export type SmeltResult = { ok: true; state: GameState } | { ok: false; reason: SmeltBlocker };

/** Queue a batch of ingots, paid up front (ore + wood). Batches run one after another. Pure; advance first. */
export function smelt(state: GameState, m: MetalId, count: number): SmeltResult {
  const blocker = smeltBlocker(state, m, count);
  if (blocker) return { ok: false, reason: blocker };
  const s = structuredClone(state);
  const ore = count * ORE_PER_INGOT;
  const wood = count * METAL_DATA[m].fuel;
  if (m === 'copper') s.resources.ore -= ore;
  else s.ores[m] -= ore;
  s.resources.wood -= wood;
  const last = s.smeltQueue[s.smeltQueue.length - 1];
  const startedAt = last ? Math.max(s.time, last.finishesAt) : s.time;
  const finishesAt = startedAt + count * smeltTimePerIngot(m, s.buildings.smithy);
  const eventId = schedule(s, finishesAt, SMELT_DONE, null);
  s.smeltQueue.push({ metal: m, count, startedAt, finishesAt, paidOre: ore, paidWood: wood, eventId });
  return { ok: true, state: s };
}

/** Cancel the last batch at the forge and refund it in full (refunds can exceed the Warehouse cap). */
export function cancelLastSmelt(state: GameState): { ok: true; state: GameState } | { ok: false } {
  if (state.smeltQueue.length === 0) return { ok: false };
  const s = structuredClone(state);
  const b = s.smeltQueue.pop()!;
  cancel(s, b.eventId);
  if (b.metal === 'copper') s.resources.ore += b.paidOre;
  else s.ores[b.metal] += b.paidOre;
  s.resources.wood += b.paidWood;
  return { ok: true, state: s };
}

/** Event: a batch of ingots comes out of the furnace. */
export const onSmeltDone: EventHandler = (state, event) => {
  const b = state.smeltQueue.find((x) => x.eventId === event.id);
  if (!b) return;
  state.ingots[b.metal] += b.count;
  state.smeltQueue = state.smeltQueue.filter((x) => x !== b);
};
