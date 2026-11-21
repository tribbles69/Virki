import { playerGear } from './smithy';
import { carryCapacity, fight, noTroops, takeLoot, troopCount, type Troops } from './battle';
import { RESOURCES, type ResourceId } from './data/resources';
import { UNITS } from './data/units';
import { cancel, schedule } from './events';
import { distanceFromVillage, travelTime } from './map';
import type { EventHandler } from './advance';
import type { GameState } from './state';

export const MARCH_ARRIVE = 'march-arrive';
export const MARCH_RETURN = 'march-return';
/** Most battle reports kept; older ones drop off. */
export const MAX_REPORTS = 50;

export interface March {
  /** Unique id (also the report id). */
  id: number;
  campId: number;
  /** Who set out. */
  sent: Troops;
  /** Who is in the group now (survivors once the battle is done). */
  troops: Troops;
  departAt: number;
  arriveAt: number;
  /** When it gets home; 0 until it turns back. */
  returnAt: number;
  phase: 'outbound' | 'returning';
  /** True if called back before arriving. */
  recalled: boolean;
  loot: Record<ResourceId, number>;
  /** The pending arrive/return event. */
  eventId: number;
}

/**
 * A battle, always told from the player's side. For your attacks: sent/lost
 * are your soldiers, defenders are the bandits, loot is what you carried off.
 * For bandit raids (kind 'raid'): sent/lost are the bandits, defenders are
 * your soldiers at home, loot is what they stole, and won = the village held.
 * For scouting missions (kind 'scout'): sent are your scouts, defenders is the
 * camp's exact garrison, seenLoot its exact stash; nothing is fought or taken.
 */
export interface BattleReport {
  id: number;
  kind?: 'raid' | 'scout';
  /** Scouting only: the camp's stash when the scouts saw it. */
  seenLoot?: Record<ResourceId, number>;
  at: number;
  campId: number;
  campName: string;
  campTier: number;
  won: boolean;
  luck: number;
  sent: Troops;
  lost: Troops;
  defenders: Troops;
  defendersLost: Troops;
  loot: Record<ResourceId, number>;
  /** Most the survivors could have carried. */
  capacity: number;
  /** Your attack after luck, and the bandits' defence (missing on reports from before v0.2.4). */
  attackStrength?: number;
  defenceStrength?: number;
  read: boolean;
}

const noLoot = () => Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<ResourceId, number>;

/** A group made only of scouts goes scouting instead of fighting. */
export function isScoutingParty(t: Partial<Troops>): boolean {
  return (t.scout ?? 0) > 0 && UNITS.every((u) => u === 'scout' || (t[u] ?? 0) === 0);
}

export interface CampIntel {
  /** When it was seen. */
  at: number;
  /** How it was seen: a scouting mission, or the aftermath of your own attack. */
  source: 'scout' | 'battle';
  troops: Troops;
  /** The stash, if known (scouting, or what was left after your raid). */
  loot?: Record<ResourceId, number>;
}

/**
 * The freshest exact picture of a camp since the last daily reset: from a
 * scouting report, or from your own battle there (survivors and what's left).
 * Undefined if you haven't looked since the camps respawned.
 */
export function campIntel(state: GameState, campId: number): CampIntel | undefined {
  const r = state.reports.find((x) => x.campId === campId && x.kind !== 'raid' && x.at >= state.lastResetAt);
  if (!r) return undefined;
  if (r.kind === 'scout') return { at: r.at, source: 'scout', troops: { ...r.defenders }, loot: r.seenLoot };
  const left = noTroops();
  for (const u of UNITS) left[u] = r.defenders[u] - r.defendersLost[u];
  return { at: r.at, source: 'battle', troops: left };
}

export type AttackBlocker = 'no-camp' | 'no-troops' | 'not-enough';

export function attackBlocker(state: GameState, campId: number, troops: Partial<Troops>): AttackBlocker | undefined {
  if (!state.map.camps.some((c) => c.id === campId)) return 'no-camp';
  if (UNITS.some((u) => !Number.isInteger(troops[u] ?? 0) || (troops[u] ?? 0) < 0)) return 'no-troops';
  if (troopCount(troops) < 1) return 'no-troops';
  if (UNITS.some((u) => (troops[u] ?? 0) > state.troops[u])) return 'not-enough';
  return undefined;
}

export const ATTACK_BLOCKER_TEXT: Record<AttackBlocker, string> = {
  'no-camp': 'That camp no longer exists',
  'no-troops': 'Choose some soldiers to send',
  'not-enough': 'You don’t have that many soldiers at home',
};

/** Send soldiers from home to attack a camp. Pure; advance to now first. */
export function sendAttack(
  state: GameState,
  campId: number,
  troops: Partial<Troops>,
): { ok: true; state: GameState; marchId: number } | { ok: false; reason: AttackBlocker } {
  const blocker = attackBlocker(state, campId, troops);
  if (blocker) return { ok: false, reason: blocker };
  const s = structuredClone(state);
  const camp = s.map.camps.find((c) => c.id === campId)!;
  const group = noTroops();
  for (const u of UNITS) {
    group[u] = troops[u] ?? 0;
    s.troops[u] -= group[u];
  }
  const arriveAt = s.time + travelTime(group, distanceFromVillage(camp));
  const id = s.nextEventId; // the arrival event's id doubles as the march id
  const eventId = schedule(s, arriveAt, MARCH_ARRIVE, { marchId: id });
  s.marches.push({
    id,
    campId,
    sent: { ...group },
    troops: group,
    departAt: s.time,
    arriveAt,
    returnAt: 0,
    phase: 'outbound',
    recalled: false,
    loot: noLoot(),
    eventId,
  });
  return { ok: true, state: s, marchId: id };
}

/** Call back an army that hasn't arrived yet: it walks home the way it came. */
export function recallMarch(state: GameState, marchId: number): { ok: true; state: GameState } | { ok: false } {
  const m = state.marches.find((x) => x.id === marchId);
  if (!m || m.phase !== 'outbound' || state.time >= m.arriveAt) return { ok: false };
  const s = structuredClone(state);
  const march = s.marches.find((x) => x.id === marchId)!;
  cancel(s, march.eventId);
  march.phase = 'returning';
  march.recalled = true;
  march.returnAt = s.time + (s.time - march.departAt);
  march.eventId = schedule(s, march.returnAt, MARCH_RETURN, { marchId });
  return { ok: true, state: s };
}

/** Event: an army reaches its camp and fights. Survivors grab loot and turn for home. */
export const onMarchArrive: EventHandler = (state, event, ctx) => {
  const { marchId } = event.payload as { marchId: number };
  const march = state.marches.find((m) => m.id === marchId);
  if (!march) return;
  const camp = state.map.camps.find((c) => c.id === march.campId);
  if (!camp) {
    // Camp vanished (e.g. a future map change): just come home.
    march.phase = 'returning';
    march.returnAt = event.at + (event.at - march.departAt);
    march.eventId = ctx.schedule(march.returnAt, MARCH_RETURN, { marchId });
    return;
  }

  // Scouts on their own slip in, count everything and slip out: no fight.
  if (isScoutingParty(march.troops)) {
    state.reports.unshift({
      id: march.id,
      kind: 'scout',
      at: event.at,
      campId: camp.id,
      campName: camp.name,
      campTier: camp.tier,
      won: true,
      luck: 0,
      sent: { ...march.sent },
      lost: noTroops(),
      defenders: { ...camp.troops },
      defendersLost: noTroops(),
      loot: noLoot(),
      seenLoot: { ...camp.loot },
      capacity: 0,
      read: false,
    });
    if (state.reports.length > MAX_REPORTS) state.reports.length = MAX_REPORTS;
    march.phase = 'returning';
    march.returnAt = event.at + travelTime(march.troops, distanceFromVillage(camp));
    march.eventId = ctx.schedule(march.returnAt, MARCH_RETURN, { marchId });
    return;
  }

  const defenders = { ...camp.troops };
  const result = fight(march.troops, defenders, ctx.rng, {}, { attacker: playerGear(state) });
  camp.troops = result.defenderSurvivors;
  march.troops = result.attackerSurvivors;

  let loot = noLoot();
  const capacity = carryCapacity(march.troops);
  if (result.attackerWon) {
    loot = takeLoot(camp.loot, capacity);
    for (const r of RESOURCES) camp.loot[r] -= loot[r];
    march.loot = loot;
  }

  state.reports.unshift({
    id: march.id,
    at: event.at,
    campId: camp.id,
    campName: camp.name,
    campTier: camp.tier,
    won: result.attackerWon,
    luck: result.luck,
    sent: { ...march.sent },
    lost: result.attackerLosses,
    defenders,
    defendersLost: result.defenderLosses,
    loot,
    capacity,
    attackStrength: Math.round(result.attackStrength),
    defenceStrength: Math.round(result.defenceStrength),
    read: false,
  });
  if (state.reports.length > MAX_REPORTS) state.reports.length = MAX_REPORTS;

  if (troopCount(march.troops) === 0) {
    state.marches = state.marches.filter((m) => m.id !== marchId);
    return;
  }
  march.phase = 'returning';
  march.returnAt = event.at + travelTime(march.troops, distanceFromVillage(camp));
  march.eventId = ctx.schedule(march.returnAt, MARCH_RETURN, { marchId });
};

/** Event: an army gets home. Soldiers rejoin the village and loot goes in the stores (all of it, even over the cap). */
export const onMarchReturn: EventHandler = (state, event) => {
  const { marchId } = event.payload as { marchId: number };
  const march = state.marches.find((m) => m.id === marchId);
  if (!march) return;
  for (const u of UNITS) state.troops[u] += march.troops[u];
  for (const r of RESOURCES) state.resources[r] += march.loot[r];
  state.marches = state.marches.filter((m) => m.id !== marchId);
};

/** Soldiers currently away from home, all marches together. */
export function troopsAway(state: GameState): Troops {
  const t = noTroops();
  for (const m of state.marches) for (const u of UNITS) t[u] += m.troops[u];
  return t;
}

/** Plain-English one-liner for a battle (used by toasts until the reports screen lands). */
export function reportHeadline(r: BattleReport): string {
  const lootTotal = RESOURCES.reduce((n, k) => n + r.loot[k], 0);
  if (r.kind === 'scout') {
    const seen = RESOURCES.reduce((n, k) => n + (r.seenLoot?.[k] ?? 0), 0);
    return `Your scouts reached ${r.campName}: ${troopCount(r.defenders).toLocaleString('en-GB')} bandits and ${seen.toLocaleString('en-GB')} loot. See Reports for the full count.`;
  }
  if (r.kind === 'raid') {
    return r.won
      ? `Bandits from ${r.campName} attacked, and your village held!`
      : `Bandits from ${r.campName} broke through${lootTotal > 0 ? ` and stole ${lootTotal.toLocaleString('en-GB')} resources` : ''}.`;
  }
  return r.won
    ? `Victory at ${r.campName}! ${lootTotal > 0 ? `Your soldiers carry ${lootTotal.toLocaleString('en-GB')} loot home.` : 'The camp had nothing left to take.'}`
    : `Defeat at ${r.campName}. None of your ${troopCount(r.sent)} soldiers came back.`;
}
