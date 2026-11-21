import { METALS, METAL_DATA, type MetalId } from './data/resources';
import type { Track } from './data/smithy';
import { UNITS, type UnitId } from './data/units';
import { isUnlocked } from './metals';
import type { GameState } from './state';

// ─── Equipment: which metal each unit type's weapons and armour are made of (DESIGN §6.1) ──

/** Ingots per soldier, per track, to arm a unit type with a non-copper metal. Edit to rebalance. */
export const INGOTS_PER_SOLDIER: Record<UnitId, number> = {
  spear: 1,
  sword: 1,
  axe: 1,
  scout: 1,
  light: 2,
  heavy: 3,
};

export type Equipment = Record<UnitId, Record<Track, MetalId>>;

export const newEquipment = (): Equipment =>
  Object.fromEntries(UNITS.map((u) => [u, { weapon: 'copper', armour: 'copper' }])) as Equipment;

export const metalMult = (m: MetalId) => METAL_DATA[m].gear;
const rank = (m: MetalId) => METALS.indexOf(m);

/** Soldiers of a type the player has: at home, out marching, and still to be trained. */
export function soldiersOwned(state: GameState, unit: UnitId): number {
  let n = state.troops[unit];
  for (const m of state.marches) n += m.troops[unit];
  for (const b of state.recruitQueue) if (b.unit === unit) n += b.count - b.trained;
  return n;
}

/** Ingots one new soldier of this type needs, for whatever its weapons and armour are made of. */
export function ingotsPerRecruit(state: GameState, unit: UnitId): Partial<Record<MetalId, number>> {
  const out: Partial<Record<MetalId, number>> = {};
  for (const t of ['weapon', 'armour'] as const) {
    const m = state.equipment[unit][t];
    if (m !== 'copper') out[m] = (out[m] ?? 0) + INGOTS_PER_SOLDIER[unit];
  }
  return out;
}

export type EquipBlocker = 'same' | 'locked' | 'ingots';

export interface EquipInfo {
  unit: UnitId;
  track: Track;
  metal: MetalId;
  /** Ingots it would cost (0 for copper or a downgrade). */
  ingots: number;
  soldiers: number;
  blocker?: EquipBlocker;
}

/** What switching a unit type's weapons or armour to a metal would cost, and whether it can. */
export function equipInfo(state: GameState, unit: UnitId, track: Track, metal: MetalId): EquipInfo {
  const soldiers = soldiersOwned(state, unit);
  const current = state.equipment[unit][track];
  const upgrade = metal !== 'copper' && rank(metal) > rank(current);
  const ingots = upgrade ? soldiers * INGOTS_PER_SOLDIER[unit] : 0;
  const info: EquipInfo = { unit, track, metal, ingots, soldiers };
  if (metal === current) info.blocker = 'same';
  else if (!isUnlocked(state, metal)) info.blocker = 'locked';
  else if (ingots > state.ingots[metal]) info.blocker = 'ingots';
  return info;
}

export function equipBlockerText(info: EquipInfo): string {
  const name = METAL_DATA[info.metal].name;
  switch (info.blocker) {
    case 'same':
      return `Already ${name}`;
    case 'locked':
      return `${name} needs Mine level ${METAL_DATA[info.metal].mine}`;
    case 'ingots':
      return `Needs ${info.ingots.toLocaleString('en-GB')} ${name} ingots`;
    default:
      return '';
  }
}

/**
 * Re-arm every soldier of a type (home, away and in training) with a metal.
 * Going up costs ingots for each of them; going down is free (no refund).
 * Instant. Pure.
 */
export function equip(
  state: GameState,
  unit: UnitId,
  track: Track,
  metal: MetalId,
): { ok: true; state: GameState } | { ok: false; reason: EquipBlocker } {
  const info = equipInfo(state, unit, track, metal);
  if (info.blocker) return { ok: false, reason: info.blocker };
  const s = structuredClone(state);
  s.ingots[metal] -= info.ingots;
  s.equipment[unit][track] = metal;
  return { ok: true, state: s };
}
