import { curveValue } from './curve';
import { BUILDING_DATA } from './data/buildings';
import { RESOURCES, type ResourceId } from './data/resources';
import {
  CRAFT_TIERS,
  MAX_CRAFT_TIER,
  RESEARCH_COST_FACTOR,
  RESEARCH_COST_GROWTH,
  RESEARCH_MINUTES,
  RESEARCH_SLOTS,
  RESEARCH_TIME_GROWTH,
  SMITHY_SPEED,
  type Track,
} from './data/smithy';
import { UNITS, UNIT_DATA, type UnitId } from './data/units';
import { canAfford, storageCap, timeUntilAffordable } from './economy';
import { metalMult } from './equip';
import { vetMult } from './veterancy';
import { cancel, schedule } from './events';
import type { EventHandler } from './advance';
import type { Gear } from './battle';
import type { GameState } from './state';

export const RESEARCH_COMPLETE = 'research-complete';

/** Craft tier reached on each track, per unit (0 = Rags). */
export type SmithyState = Record<UnitId, Record<Track, number>>;

export interface ResearchJob {
  unit: UnitId;
  track: Track;
  toTier: number;
  startedAt: number;
  finishesAt: number;
  paid: Record<ResourceId, number>;
  eventId: number;
}

export const newSmithy = (): SmithyState =>
  Object.fromEntries(UNITS.map((u) => [u, { weapon: 0, armour: 0 }])) as SmithyState;

export const craftName = (tier: number) => CRAFT_TIERS[Math.max(0, Math.min(MAX_CRAFT_TIER, tier))].name;
export const craftMult = (tier: number) => CRAFT_TIERS[Math.max(0, Math.min(MAX_CRAFT_TIER, tier))].mult;

/** The player's multipliers for battle: craft tier × metal × veterancy (weapons → attack, armour → defence). */
export function playerGear(state: GameState): Gear {
  const gear: Gear = {};
  for (const u of UNITS) {
    const eq = state.equipment[u];
    gear[u] = {
      attack: craftMult(state.smithy[u].weapon) * metalMult(eq.weapon) * vetMult(state, u),
      defence: craftMult(state.smithy[u].armour) * metalMult(eq.armour) * vetMult(state, u),
    };
  }
  return gear;
}

/** Resources to research a tier: the unit's own cost × 20 for tier 1, ×1.9 per tier after. */
export function researchCost(unit: UnitId, tier: number): Record<ResourceId, number> {
  const out = {} as Record<ResourceId, number>;
  for (const r of RESOURCES) out[r] = Math.round(UNIT_DATA[unit].cost[r] * RESEARCH_COST_FACTOR * RESEARCH_COST_GROWTH ** (tier - 1));
  return out;
}

/** Milliseconds to research a tier at a Smithy level. Whole seconds. */
export function researchTime(tier: number, smithyLevel: number): number {
  const minutes = RESEARCH_MINUTES * RESEARCH_TIME_GROWTH ** (tier - 1) * curveValue(SMITHY_SPEED, smithyLevel);
  return Math.max(1_000, Math.round((minutes * 60_000) / 1_000) * 1_000);
}

export type ResearchBlocker = 'max-tier' | 'no-smithy' | 'unit-locked' | 'smithy-level' | 'queue-full' | 'storage' | 'resources';

export interface ResearchInfo {
  unit: UnitId;
  track: Track;
  /** Tier now (0 = Rags). */
  tier: number;
  /** Tier the next research would reach (after anything queued). */
  nextTier: number;
  cost: Record<ResourceId, number>;
  time: number;
  /** Smithy level the next tier needs. */
  needsSmithy: number;
  blocker?: ResearchBlocker;
  /** For 'resources': ms until affordable at current rates. */
  wait?: number;
}

function plannedTier(state: GameState, unit: UnitId, track: Track): number {
  let t = state.smithy[unit][track];
  for (const j of state.researchQueue) if (j.unit === unit && j.track === track) t = Math.max(t, j.toTier);
  return t;
}

export function researchInfo(state: GameState, unit: UnitId, track: Track): ResearchInfo {
  const tier = state.smithy[unit][track];
  const nextTier = plannedTier(state, unit, track) + 1;
  const base = { unit, track, tier, nextTier };
  if (nextTier > MAX_CRAFT_TIER) {
    return { ...base, cost: researchCost(unit, MAX_CRAFT_TIER), time: 0, needsSmithy: CRAFT_TIERS[MAX_CRAFT_TIER].smithy, blocker: 'max-tier' };
  }
  const cost = researchCost(unit, nextTier);
  const time = researchTime(nextTier, state.buildings.smithy);
  const needsSmithy = CRAFT_TIERS[nextTier].smithy;
  const info: ResearchInfo = { ...base, cost, time, needsSmithy };
  if (state.buildings.smithy < 1) info.blocker = 'no-smithy';
  else if (state.buildings[UNIT_DATA[unit].building] < 1) info.blocker = 'unit-locked';
  else if (state.buildings.smithy < needsSmithy) info.blocker = 'smithy-level';
  else if (state.researchQueue.length >= RESEARCH_SLOTS) info.blocker = 'queue-full';
  else if (RESOURCES.some((r) => cost[r] > storageCap(state))) info.blocker = 'storage';
  else if (!canAfford(state, cost)) Object.assign(info, { blocker: 'resources', wait: timeUntilAffordable(state, cost) });
  return info;
}

export function researchBlockerText(info: ResearchInfo): string {
  switch (info.blocker) {
    case 'max-tier':
      return 'Finest craft already';
    case 'no-smithy':
      return 'Build a Smithy first';
    case 'unit-locked':
      return `Build a ${BUILDING_DATA[UNIT_DATA[info.unit].building].name} first`;
    case 'smithy-level':
      return `${craftName(info.nextTier)} needs Smithy level ${info.needsSmithy}`;
    case 'queue-full':
      return 'The smiths are busy';
    case 'storage':
      return 'Too costly for your Warehouse: upgrade it first';
    case 'resources':
      return 'Not enough resources';
    default:
      return '';
  }
}

export type ResearchResult = { ok: true; state: GameState } | { ok: false; reason: ResearchBlocker };

/** Start researching the next craft tier for a unit's weapons or armour. Paid up front. Pure; advance first. */
export function startResearch(state: GameState, unit: UnitId, track: Track): ResearchResult {
  const info = researchInfo(state, unit, track);
  if (info.blocker) return { ok: false, reason: info.blocker };
  const s = structuredClone(state);
  for (const r of RESOURCES) s.resources[r] -= info.cost[r];
  const last = s.researchQueue[s.researchQueue.length - 1];
  const startedAt = last ? Math.max(s.time, last.finishesAt) : s.time;
  const finishesAt = startedAt + info.time;
  const eventId = schedule(s, finishesAt, RESEARCH_COMPLETE, { unit, track, toTier: info.nextTier });
  s.researchQueue.push({ unit, track, toTier: info.nextTier, startedAt, finishesAt, paid: info.cost, eventId });
  return { ok: true, state: s };
}

/** Cancel the latest research and refund it in full. */
export function cancelResearch(state: GameState): { ok: true; state: GameState } | { ok: false } {
  if (state.researchQueue.length === 0) return { ok: false };
  const s = structuredClone(state);
  const job = s.researchQueue.pop()!;
  cancel(s, job.eventId);
  for (const r of RESOURCES) s.resources[r] += job.paid[r];
  return { ok: true, state: s };
}

/** Event: a research finished; the unit's track goes up a tier. */
export const onResearchComplete: EventHandler = (state, event) => {
  const { unit, track, toTier } = event.payload as { unit: UnitId; track: Track; toTier: number };
  state.smithy[unit][track] = Math.max(state.smithy[unit][track], toTier);
  state.researchQueue = state.researchQueue.filter((j) => j.eventId !== event.id);
};

