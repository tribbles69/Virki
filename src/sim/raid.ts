import { carryCapacity, fight, takeLoot, type Troops } from './battle';
import { RAID_SHARE, RAID_TIER_WEIGHTS, RAID_WINDOW_HOURS, RAIDS_NEED_BARRACKS, RAIDS_PER_DAY } from './data/defence';
import { RESOURCES, type ResourceId } from './data/resources';
import { UNITS } from './data/units';
import { hiddenAmount, militia, wallMultiplier, watchtowerWarning } from './defence';
import { schedule } from './events';
import { distanceFromVillage, travelTime } from './map';
import { MAX_REPORTS } from './march';
import type { EventHandler } from './advance';
import type { Rng } from './rng';
import type { GameState } from './state';

export const RAID_ARRIVE = 'raid-arrive';
const HOUR = 3_600_000;

/** A bandit raiding party heading for the village. */
export interface Raid {
  id: number;
  campId: number;
  campName: string;
  campTier: number;
  troops: Troops;
  /** When it set off from its camp. */
  launchAt: number;
  arriveAt: number;
  eventId: number;
}

/**
 * Roll the day's raids, right after the 04:00 respawn (called by the daily
 * reset with that day's seeded RNG). No raids until the player has a Barracks.
 * The raiding party is a share of its camp's garrison; nearer camps raid more.
 */
export function rollRaids(state: GameState, resetAt: number, rng: Rng): void {
  if (state.buildings.barracks < RAIDS_NEED_BARRACKS) return;
  const count = rng.weighted(RAIDS_PER_DAY);
  const camps = state.map.camps.filter((c) => c.kind !== 'warlord');
  for (let i = 0; i < count; i++) {
    const camp = rng.weighted(camps.map((c) => ({ item: c, weight: RAID_TIER_WEIGHTS[c.tier - 1] ?? 1 })));
    const share = RAID_SHARE[0] + rng.next() * (RAID_SHARE[1] - RAID_SHARE[0]);
    const troops = { ...camp.troops };
    for (const u of UNITS) troops[u] = Math.round(camp.troops[u] * share);
    if (UNITS.every((u) => troops[u] === 0)) troops.spear = 1;
    const launchAt = resetAt + Math.round((RAID_WINDOW_HOURS[0] + rng.next() * (RAID_WINDOW_HOURS[1] - RAID_WINDOW_HOURS[0])) * HOUR);
    const arriveAt = launchAt + travelTime(troops, distanceFromVillage(camp));
    const id = state.nextEventId;
    const eventId = schedule(state, arriveAt, RAID_ARRIVE, { raidId: id });
    state.raids.push({ id, campId: camp.id, campName: camp.name, campTier: camp.tier, troops, launchAt, arriveAt, eventId });
  }
  state.raids.sort((a, b) => a.arriveAt - b.arriveAt);
}

/** When the Watchtower first spots a raid (never before it sets off). */
export function raidSpottedAt(state: GameState, raid: Raid): number {
  return Math.max(raid.launchAt, raid.arriveAt - watchtowerWarning(state.buildings.watchtower));
}

/** Raids the player can see coming right now, soonest first. */
export function visibleRaids(state: GameState): Raid[] {
  return state.raids.filter((r) => state.time >= raidSpottedAt(state, r) && state.time < r.arriveAt);
}

/** The defence the village would put up right now: soldiers at home + militia, times the Wall. */
export function villageDefenceBonus(state: GameState) {
  return { multiplier: wallMultiplier(state.buildings.wall), base: militia(state.buildings.wall) };
}

/**
 * Event: a raid lands. Soldiers at home, the militia and the Wall defend. If
 * the bandits win, soldiers at home fall and they carry off what they can.
 * The report is written from the player's side (won = the village held).
 */
export const onRaidArrive: EventHandler = (state, event, ctx) => {
  const { raidId } = event.payload as { raidId: number };
  const raid = state.raids.find((r) => r.id === raidId);
  if (!raid) return;
  state.raids = state.raids.filter((r) => r.id !== raidId);

  const defenders = { ...state.troops };
  const result = fight(raid.troops, defenders, ctx.rng, villageDefenceBonus(state));
  state.troops = result.defenderSurvivors;

  let stolen = Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<ResourceId, number>;
  const capacity = carryCapacity(result.attackerSurvivors);
  if (result.attackerWon) {
    // The Hiding Place keeps some of each resource out of reach.
    const hidden = hiddenAmount(state.buildings.hiding);
    const exposed = { ...state.resources };
    for (const k of RESOURCES) exposed[k] = Math.max(0, state.resources[k] - hidden);
    stolen = takeLoot(exposed, capacity);
    for (const r of RESOURCES) state.resources[r] = Math.max(0, state.resources[r] - stolen[r]);
  }

  state.reports.unshift({
    id: raid.id,
    kind: 'raid',
    at: event.at,
    campId: raid.campId,
    campName: raid.campName,
    campTier: raid.campTier,
    won: !result.attackerWon,
    luck: result.luck,
    sent: { ...raid.troops },
    lost: result.attackerLosses,
    defenders,
    defendersLost: result.defenderLosses,
    loot: stolen,
    capacity,
    attackStrength: Math.round(result.attackStrength),
    defenceStrength: Math.round(result.defenceStrength),
    read: false,
  });
  if (state.reports.length > MAX_REPORTS) state.reports.length = MAX_REPORTS;
};
