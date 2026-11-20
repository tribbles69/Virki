import { curveValue } from './curve';
import { BUILDINGS, BUILDING_DATA, BUILD_QUEUE_SLOTS, COST_GROWTH, HALL_SPEED, TIME_GROWTH, type BuildingId } from './data/buildings';
import { RESOURCES, type ResourceId } from './data/resources';
import { buildingPop, canAfford, plannedLevel, population, storageCap, timeUntilAffordable } from './economy';
import { cancel, schedule } from './events';
import type { EventHandler } from './advance';
import type { BuildJob, GameState } from './state';

export const BUILD_COMPLETE = 'build-complete';

export interface BuildCompletePayload {
  building: BuildingId;
  toLevel: number;
}

const MINUTE = 60_000;

/** Resources needed to build a level. */
export function buildCost(building: BuildingId, level: number): Record<ResourceId, number> {
  const base = BUILDING_DATA[building].cost;
  const out = {} as Record<ResourceId, number>;
  for (const r of RESOURCES) out[r] = Math.round(curveValue({ base: base[r], segments: COST_GROWTH }, level));
  return out;
}

/** Milliseconds to build a level with the Great Hall at `hallLevel`. Whole seconds. */
export function buildTime(building: BuildingId, level: number, hallLevel: number): number {
  const minutes = curveValue({ base: BUILDING_DATA[building].minutes, segments: TIME_GROWTH }, level);
  const ms = minutes * MINUTE * curveValue(HALL_SPEED, hallLevel);
  return Math.max(1_000, Math.round(ms / 1_000) * 1_000);
}

export type BuildBlocker = 'max-level' | 'queue-full' | 'requirements' | 'population' | 'resources' | 'storage';

export interface UpgradeInfo {
  building: BuildingId;
  name: string;
  /** Level it is now. */
  level: number;
  /** Level the next upgrade would reach (after anything already queued). */
  nextLevel: number;
  cost: Record<ResourceId, number>;
  /** Build time in ms at the current Great Hall level. */
  time: number;
  /** Extra population the next level needs. */
  popNeeded: number;
  /** Why it can't start right now, if it can't. Most fundamental reason first. */
  blocker?: BuildBlocker;
  /** For 'requirements': what's missing. */
  missing?: Partial<Record<BuildingId, number>>;
  /** For 'resources': ms until affordable at current rates. */
  wait?: number;
}

/** Everything the UI needs to show an upgrade button. */
export function upgradeInfo(state: GameState, building: BuildingId): UpgradeInfo {
  const def = BUILDING_DATA[building];
  const level = state.buildings[building];
  const nextLevel = plannedLevel(state, building) + 1;
  const base = { building, name: def.name, level, nextLevel };

  if (nextLevel > def.max) {
    return { ...base, cost: buildCost(building, def.max), time: 0, popNeeded: 0, blocker: 'max-level' };
  }

  const cost = buildCost(building, nextLevel);
  const time = buildTime(building, nextLevel, state.buildings.hall);
  const popNeeded = buildingPop(building, nextLevel) - buildingPop(building, nextLevel - 1);
  const info: UpgradeInfo = { ...base, cost, time, popNeeded };

  const missing: Partial<Record<BuildingId, number>> = {};
  for (const [req, lvl] of Object.entries(def.requires ?? {}) as [BuildingId, number][]) {
    if (state.buildings[req] < lvl) missing[req] = lvl;
  }

  if (state.buildQueue.length >= BUILD_QUEUE_SLOTS) info.blocker = 'queue-full';
  else if (Object.keys(missing).length > 0) Object.assign(info, { blocker: 'requirements', missing });
  else if (popNeeded > population(state).free) info.blocker = 'population';
  else if (RESOURCES.some((r) => cost[r] > storageCap(state))) info.blocker = 'storage';
  else if (!canAfford(state, cost)) Object.assign(info, { blocker: 'resources', wait: timeUntilAffordable(state, cost) });

  return info;
}

/** Plain-English reason for the UI (British spelling). */
export function blockerText(info: UpgradeInfo): string {
  switch (info.blocker) {
    case 'max-level':
      return 'Fully upgraded';
    case 'queue-full':
      return 'Builders are busy';
    case 'requirements':
      return `Needs ${Object.entries(info.missing ?? {})
        .map(([b, l]) => `${BUILDING_DATA[b as BuildingId].name} level ${l}`)
        .join(', ')}`;
    case 'population':
      return 'Not enough population: upgrade the Farm';
    case 'storage':
      return 'Too costly for your Warehouse: upgrade it first';
    case 'resources':
      return 'Not enough resources';
    default:
      return '';
  }
}

export type CommandResult = { ok: true; state: GameState } | { ok: false; reason: BuildBlocker };

/**
 * Start upgrading a building at the state's current time. Pure: returns a new
 * state. Call advance(state, now) first so resources are up to date.
 */
export function startUpgrade(state: GameState, building: BuildingId): CommandResult {
  const info = upgradeInfo(state, building);
  if (info.blocker) return { ok: false, reason: info.blocker };

  const s = structuredClone(state);
  for (const r of RESOURCES) s.resources[r] -= info.cost[r];

  // Jobs run one after another: a new one starts when the last queued one ends.
  const last = s.buildQueue[s.buildQueue.length - 1];
  const startedAt = last ? Math.max(s.time, last.finishesAt) : s.time;
  const finishesAt = startedAt + info.time;
  const payload: BuildCompletePayload = { building, toLevel: info.nextLevel };
  const eventId = schedule(s, finishesAt, BUILD_COMPLETE, payload);
  const job: BuildJob = { building, toLevel: info.nextLevel, startedAt, finishesAt, paid: info.cost, eventId };
  s.buildQueue.push(job);
  return { ok: true, state: s };
}

/**
 * Cancel the most recently queued build and refund it in full (refunds can
 * exceed the Warehouse cap, like loot). Only the last job can be cancelled so
 * that later jobs never depend on a level that won't happen.
 */
export function cancelLastUpgrade(state: GameState): { ok: true; state: GameState } | { ok: false } {
  if (state.buildQueue.length === 0) return { ok: false };
  const s = structuredClone(state);
  const job = s.buildQueue.pop()!;
  cancel(s, job.eventId);
  for (const r of RESOURCES) s.resources[r] += job.paid[r];
  return { ok: true, state: s };
}

/** Event: a build finished, so the level goes up and the job leaves the queue. */
export const onBuildComplete: EventHandler = (state, event) => {
  const { building, toLevel } = event.payload as BuildCompletePayload;
  state.buildings[building] = Math.max(state.buildings[building], toLevel);
  state.buildQueue = state.buildQueue.filter((j) => j.eventId !== event.id);
};

/** Every building's upgrade info, in display order. */
export function allUpgrades(state: GameState): UpgradeInfo[] {
  return BUILDINGS.map((b) => upgradeInfo(state, b));
}
