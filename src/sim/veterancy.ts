import { UNITS, UNIT_DATA, type UnitId } from './data/units';
import { soldiersOwned } from './equip';
import type { Troops } from './battle';
import type { GameState } from './state';

// ─── Veterancy (DESIGN §6.2) ──────────────────────────────────────────────
// Each unit type has an experience pool. Survivors add to it; the dead take
// their share away; new recruits arrive with none. The average per soldier
// sets the type's rank. Edit the table to rebalance.

export const VET_RANKS = [
  { name: 'Recruit', from: 0, bonus: 0 },
  { name: 'Regular', from: 1, bonus: 0.06 },
  { name: 'Veteran', from: 3, bonus: 0.12 },
  { name: 'Elite', from: 6, bonus: 0.19 },
  { name: 'Legend', from: 10, bonus: 0.25 },
] as const;

/** Most experience one survivor earns from a battle (a close fight). */
export const XP_PER_BATTLE = 1;

export type Veterancy = Record<UnitId, number>;
export const newVeterancy = (): Veterancy => Object.fromEntries(UNITS.map((u) => [u, 0])) as Veterancy;

/** Average experience per soldier of a type (0 with no soldiers). */
export function averageXp(state: GameState, unit: UnitId): number {
  const n = soldiersOwned(state, unit);
  return n > 0 ? state.veterancy[unit] / n : 0;
}

export interface VetRank {
  index: number;
  name: string;
  bonus: number;
  /** Average experience for the next rank, if there is one. */
  next?: number;
}

export function rankFor(avg: number): VetRank {
  let index = 0;
  for (let i = 0; i < VET_RANKS.length; i++) if (avg >= VET_RANKS[i].from) index = i;
  const r = VET_RANKS[index];
  return { index, name: r.name, bonus: r.bonus, next: VET_RANKS[index + 1]?.from };
}

export function unitRank(state: GameState, unit: UnitId): VetRank {
  return rankFor(averageXp(state, unit));
}

/** Multiplier on a unit type's attack and defence from its rank. */
export function vetMult(state: GameState, unit: UnitId): number {
  return 1 + unitRank(state, unit).bonus;
}

/**
 * Experience a survivor earns: up to XP_PER_BATTLE for a close fight, scaled
 * down for walkovers (ratio = the other side's strength ÷ yours, capped at 1).
 */
export function xpForBattle(ratio: number): number {
  return XP_PER_BATTLE * Math.max(0, Math.min(1, ratio * 2));
}

/** Report field listing rank changes, e.g. { promotions: ['Axemen are now Veterans'] } (empty object if none). */
export function promotionNote(changes: Partial<Record<UnitId, { from: string; to: string }>>): { promotions?: string[] } {
  const lines = (Object.entries(changes) as [UnitId, { from: string; to: string }][]).map(([u, c]) => {
    const up = VET_RANKS.findIndex((r) => r.name === c.to) > VET_RANKS.findIndex((r) => r.name === c.from);
    // "Axemen are now Veterans" / "Axemen are now Elite" / "Axemen fell back to Regular".
    return up ? `${UNIT_DATA[u].plural} are now ${c.to === 'Elite' ? 'Elite' : `${c.to}s`}` : `${UNIT_DATA[u].plural} fell back to ${c.to}`;
  });
  return lines.length ? { promotions: lines } : {};
}

/**
 * Update the pools after one of the player's battles. Call with the state as it
 * was *before* the losses were removed (soldiers still counted), so the dead
 * take away exactly their average share. Returns each type's rank change.
 */
export function recordBattle(
  state: GameState,
  fought: Partial<Troops>,
  lost: Partial<Troops>,
  won: boolean,
  ratio: number,
): Partial<Record<UnitId, { from: string; to: string }>> {
  const changes: Partial<Record<UnitId, { from: string; to: string }>> = {};
  const gain = won ? xpForBattle(ratio) : 0;
  for (const u of UNITS) {
    const n = fought[u] ?? 0;
    if (n === 0) continue;
    const owned = soldiersOwned(state, u);
    const before = rankFor(owned > 0 ? state.veterancy[u] / owned : 0).name;
    const avg = owned > 0 ? state.veterancy[u] / owned : 0;
    const dead = lost[u] ?? 0;
    let pool = state.veterancy[u] - dead * avg + (n - dead) * gain;
    if (owned - dead <= 0) pool = 0;
    state.veterancy[u] = Math.max(0, pool);
    const after = rankFor(owned - dead > 0 ? state.veterancy[u] / (owned - dead) : 0).name;
    if (after !== before) changes[u] = { from: before, to: after };
  }
  return changes;
}
