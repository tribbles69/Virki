import { RESOURCES, type ResourceId } from './data/resources';
import { UNITS, UNIT_DATA, type UnitId } from './data/units';
import type { Rng } from './rng';

// ─── Battle rules (DESIGN §7.1) ───────────────────────────────────────────
/** Luck swings the attacker's strength by up to this much either way. */
export const LUCK_RANGE = 0.15;
/** Winner's losses = (loser strength / winner strength) ^ this. */
export const LOSS_EXPONENT = 1.5;

export type Troops = Record<UnitId, number>;

export const noTroops = (): Troops => Object.fromEntries(UNITS.map((u) => [u, 0])) as Troops;

export function troopCount(t: Partial<Troops>): number {
  return UNITS.reduce((n, u) => n + (t[u] ?? 0), 0);
}

/**
 * Defender's strength against this attack. Each unit's defence is weighted by
 * how much of the attack comes from each class (TW-style). All current units
 * are infantry, so today this is just defence vs infantry.
 */
export function defenceAgainst(attackers: Partial<Troops>, defenders: Partial<Troops>): number {
  const attackByClass = { infantry: 0, cavalry: 0, archer: 0 };
  for (const u of UNITS) {
    const cls = UNIT_DATA[u].cls;
    if (cls === 'scout') continue; // scouts don't fight
    attackByClass[cls] += (attackers[u] ?? 0) * UNIT_DATA[u].attack;
  }
  const total = attackByClass.infantry + attackByClass.cavalry + attackByClass.archer;
  if (total <= 0) return 0;
  let defence = 0;
  for (const u of UNITS) {
    const d = UNIT_DATA[u].defence;
    const n = defenders[u] ?? 0;
    defence += n * ((d.infantry * attackByClass.infantry + d.cavalry * attackByClass.cavalry + d.archer * attackByClass.archer) / total);
  }
  return defence;
}

export function attackStrength(attackers: Partial<Troops>): number {
  return UNITS.reduce((n, u) => n + (attackers[u] ?? 0) * UNIT_DATA[u].attack, 0);
}

export interface BattleResult {
  attackerWon: boolean;
  /** −0.15 .. +0.15 */
  luck: number;
  attackStrength: number;
  defenceStrength: number;
  attackerLosses: Troops;
  defenderLosses: Troops;
  attackerSurvivors: Troops;
  defenderSurvivors: Troops;
}

function applyLosses(t: Partial<Troops>, share: number): { lost: Troops; left: Troops } {
  const lost = noTroops();
  const left = noTroops();
  for (const u of UNITS) {
    const n = t[u] ?? 0;
    lost[u] = Math.min(n, Math.round(n * share));
    left[u] = n - lost[u];
  }
  return { lost, left };
}

/**
 * Fight one battle. The side with more strength wins and loses
 * (other/own)^1.5 of its soldiers; the loser loses everyone. A tie goes to the
 * defender. An empty camp is a free win.
 */
export interface DefenceBonus {
  /** Wall multiplier applied to all defence (1 = no wall). */
  multiplier?: number;
  /** Flat defence that doesn't die (the village militia), before the multiplier. */
  base?: number;
}

export function fight(attackers: Partial<Troops>, defenders: Partial<Troops>, rng: Rng, bonus: DefenceBonus = {}): BattleResult {
  const luck = Math.round((rng.next() * 2 - 1) * LUCK_RANGE * 1000) / 1000;
  const att = attackStrength(attackers) * (1 + luck);
  const def = (defenceAgainst(attackers, defenders) + (bonus.base ?? 0)) * (bonus.multiplier ?? 1);
  const attackerWon = att > def;
  const winnerShare = attackerWon ? (att > 0 ? (def / att) ** LOSS_EXPONENT : 0) : def > 0 ? (att / def) ** LOSS_EXPONENT : 0;
  const a = applyLosses(attackers, attackerWon ? winnerShare : 1);
  const d = applyLosses(defenders, attackerWon ? 1 : winnerShare);
  return {
    attackerWon,
    luck,
    attackStrength: att,
    defenceStrength: def,
    attackerLosses: a.lost,
    defenderLosses: d.lost,
    attackerSurvivors: a.left,
    defenderSurvivors: d.left,
  };
}

/** How much loot a group can carry home. */
export function carryCapacity(t: Partial<Troops>): number {
  return UNITS.reduce((n, u) => n + (t[u] ?? 0) * UNIT_DATA[u].carry, 0);
}

/**
 * Take as much as `capacity` allows, spread evenly across resources (TW-style):
 * each resource gets an equal share, and any share a resource can't fill is
 * passed on to the others. Whole units only.
 */
export function takeLoot(stash: Record<ResourceId, number>, capacity: number): Record<ResourceId, number> {
  const taken = Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<ResourceId, number>;
  let room = Math.floor(capacity);
  let open = RESOURCES.filter((r) => Math.floor(stash[r]) > 0);
  while (room > 0 && open.length > 0) {
    const share = Math.max(1, Math.floor(room / open.length));
    for (const r of open) {
      const take = Math.min(share, Math.floor(stash[r]) - taken[r], room);
      taken[r] += take;
      room -= take;
    }
    open = open.filter((r) => Math.floor(stash[r]) - taken[r] > 0);
  }
  return taken;
}
