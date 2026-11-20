import { curveValue } from './curve';
import { BUILDINGS, POP_PER_BUILDING } from './data/buildings';
import { FARM_CAPACITY, PRODUCERS, RESOURCES, WAREHOUSE_CAPACITY, type ResourceId } from './data/resources';
import type { GameState } from './state';
import type { System } from './advance';

const HOUR = 3_600_000;

/** Units per hour of a resource at the village's current building levels. */
export function productionPerHour(state: GameState, resource: ResourceId): number {
  const p = PRODUCERS[resource];
  return curveValue(p.curve, state.buildings[p.building]) * p.multiplier;
}

/** Most of each resource the Warehouse can hold. */
export function storageCap(state: GameState): number {
  return Math.round(curveValue(WAREHOUSE_CAPACITY, state.buildings.warehouse));
}

export interface Population {
  /** Farm capacity. */
  cap: number;
  /** Taken by buildings (troops join in v0.2). */
  used: number;
  free: number;
}

export function population(state: GameState): Population {
  const cap = Math.round(curveValue(FARM_CAPACITY, state.buildings.farm));
  let used = 0;
  for (const b of BUILDINGS) used += Math.round(curveValue(POP_PER_BUILDING[b], state.buildings[b]));
  return { cap, used, free: cap - used };
}

/** True if the stockpile covers a cost. */
export function canAfford(state: GameState, cost: Partial<Record<ResourceId, number>>): boolean {
  return RESOURCES.every((r) => state.resources[r] >= (cost[r] ?? 0));
}

/** Milliseconds until a cost is affordable at current rates; Infinity if it never will be (over cap). */
export function timeUntilAffordable(state: GameState, cost: Partial<Record<ResourceId, number>>): number {
  const cap = storageCap(state);
  let wait = 0;
  for (const r of RESOURCES) {
    const need = (cost[r] ?? 0) - state.resources[r];
    if (need <= 0) continue;
    const rate = productionPerHour(state, r);
    if ((cost[r] ?? 0) > cap || rate <= 0) return Infinity;
    wait = Math.max(wait, Math.ceil((need / rate) * HOUR));
  }
  return wait;
}

/**
 * Continuous production: rate × elapsed, capped by the Warehouse.
 * Additive because rates only change at events, and min(cap, ·) composes:
 * min(cap, min(cap, x + a) + b) = min(cap, x + a + b) for a, b ≥ 0.
 * Stock already above the cap (e.g. from loot) is kept but doesn't grow.
 */
export const production: System = (state, from, to) => {
  const hours = (to - from) / HOUR;
  const cap = storageCap(state);
  for (const r of RESOURCES) {
    const current = state.resources[r];
    if (current >= cap) continue;
    state.resources[r] = Math.min(cap, current + productionPerHour(state, r) * hours);
  }
};
