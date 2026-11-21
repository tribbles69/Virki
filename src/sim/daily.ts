import { deriveSeed, Rng } from './rng';
import {
  DAILY_VARIATION,
  MAP_SIZE,
  WARLORD_ID,
  WARLORD_MIN_DISTANCE,
  WARLORD_NAMES,
  WARLORD_TIER,
  WARLORD_TITLES,
} from './data/map';
import { RESOURCES } from './data/resources';
import { UNITS } from './data/units';
import { armyAttack, campGarrison, campLoot, distanceFromVillage, terrainAt, type Camp } from './map';
import { troopsAway } from './march';
import { rollRaids } from './raid';
import { schedule } from './events';
import type { EventHandler } from './advance';
import type { GameState } from './state';

export const DAILY_RESET = 'daily-reset';

export interface DailyResetPayload {
  /** Local calendar date of this reset, e.g. "2026-11-22". Seeds the day's rolls. */
  dayKey: string;
}

/** One upcoming reset, worked out from the device clock by the app (the sim never reads clocks). */
export interface ResetTime {
  at: number;
  dayKey: string;
}

/**
 * Queue any resets the app has worked out that aren't queued yet. Pure:
 * returns a new state (or the same one if nothing to add).
 */
export function scheduleResets(state: GameState, resets: readonly ResetTime[]): GameState {
  const fresh = resets.filter((r) => r.at > state.resetsScheduledUntil).sort((a, b) => a.at - b.at);
  if (fresh.length === 0) return state;
  const s = structuredClone(state);
  for (const r of fresh) {
    const payload: DailyResetPayload = { dayKey: r.dayKey };
    schedule(s, r.at, DAILY_RESET, payload);
    s.resetsScheduledUntil = r.at;
  }
  return s;
}

/** When the next reset happens, if one is queued. */
export function nextResetAt(state: GameState): number | undefined {
  return state.events.find((e) => e.type === DAILY_RESET)?.at;
}

/** Scale a number by a day's random wobble, ±DAILY_VARIATION. */
const wobble = (n: number, rng: Rng) => Math.round(n * (1 + (rng.next() * 2 - 1) * DAILY_VARIATION));

function freshGarrison(tier: number, playerAttack: number, rng: Rng): Camp['troops'] {
  const base = campGarrison(tier, playerAttack);
  const out = { ...base };
  for (const u of UNITS) out[u] = base[u] > 0 ? Math.max(1, wobble(base[u], rng)) : 0;
  return out;
}

function freshLoot(tier: number, rng: Rng): Camp['loot'] {
  const base = campLoot(tier);
  const out = { ...base };
  for (const r of RESOURCES) out[r] = wobble(base[r], rng);
  return out;
}

/** Pick an open tile for the Warlord: grassland, well away from home, not on or next to another camp. */
function warlordSpot(state: GameState, rng: Rng): { x: number; y: number } {
  const others = state.map.camps.filter((c) => c.id !== WARLORD_ID);
  const options: { x: number; y: number }[] = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (terrainAt(state.map, x, y) !== '.') continue;
      if (distanceFromVillage({ x, y }) < WARLORD_MIN_DISTANCE) continue;
      if (others.some((c) => Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) < 2)) continue;
      options.push({ x, y });
    }
  }
  // A map always has room (tested across many seeds); fall back to a corner just in case.
  return options.length > 0 ? rng.pick(options) : { x: 0, y: 0 };
}

/**
 * Event: the 04:00 reset. Every camp respawns with fresh bandits and a full
 * stash, sized to the player's whole army right now (rubber band) with a
 * seeded daily wobble, and a new Warlord pitches camp somewhere on the map.
 * Rolls come from the save seed + date, so a given day is always the same.
 */
export const onDailyReset: EventHandler = (state, event) => {
  const { dayKey } = event.payload as DailyResetPayload;
  const rng = new Rng(deriveSeed(state.seed, `day:${dayKey}`));
  const away = troopsAway(state);
  const all = { ...state.troops };
  for (const u of UNITS) all[u] += away[u];
  const attack = armyAttack(all);

  const camps = state.map.camps.filter((c) => c.id !== WARLORD_ID);
  for (const c of camps) {
    c.troops = freshGarrison(c.tier, attack, rng);
    c.loot = freshLoot(c.tier, rng);
  }
  const spot = warlordSpot(state, rng);
  camps.push({
    id: WARLORD_ID,
    kind: 'warlord',
    name: `${rng.pick(WARLORD_NAMES)} ${rng.pick(WARLORD_TITLES)}`,
    x: spot.x,
    y: spot.y,
    tier: WARLORD_TIER,
    troops: freshGarrison(WARLORD_TIER, attack, rng),
    loot: freshLoot(WARLORD_TIER, rng),
  });
  state.map.camps = camps;
  state.dayKey = dayKey;
  state.resetsDone += 1;
  state.lastResetAt = event.at;
  rollRaids(state, event.at, rng);
};

/** True for the daily Warlord camp. */
export const isWarlord = (c: Camp) => c.id === WARLORD_ID;
