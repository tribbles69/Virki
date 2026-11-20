import { deriveSeed, Rng } from './rng';
import {
  CAMP_COUNT,
  CAMP_NAME_FIRST,
  CAMP_NAME_SECOND,
  CAMP_TIERS,
  LOOT_SPLIT,
  MAP_SIZE,
  RUBBER_BAND_ATTACK_PER_TIER,
  RUBBER_BAND_MAX,
  TERRAIN_SEEDS,
  VILLAGE_POS,
  type TerrainCode,
} from './data/map';
import { RESOURCES, type ResourceId } from './data/resources';
import { UNITS, UNIT_DATA, type UnitId } from './data/units';

export interface Camp {
  /** Stable id, 1..CAMP_COUNT. */
  id: number;
  name: string;
  x: number;
  y: number;
  /** 1 (nearest, weakest) .. 8 (farthest, toughest). */
  tier: number;
  /** Current garrison. */
  troops: Record<UnitId, number>;
  /** Resources stashed, ready to be looted. */
  loot: Record<ResourceId, number>;
}

export interface WorldMap {
  /** MAP_SIZE × MAP_SIZE terrain codes, row by row. */
  terrain: string;
  camps: Camp[];
}

export const tileIndex = (x: number, y: number) => y * MAP_SIZE + x;

export function terrainAt(map: WorldMap, x: number, y: number): TerrainCode {
  return map.terrain[tileIndex(x, y)] as TerrainCode;
}

/** Straight-line distance in tiles (TW-style). */
export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceFromVillage(p: { x: number; y: number }): number {
  return distance(VILLAGE_POS, p);
}

/** Ms for a group to travel a distance: it moves at its slowest member's pace. */
export function travelTime(units: Partial<Record<UnitId, number>>, tiles: number): number {
  let slowest = 0;
  for (const u of UNITS) if ((units[u] ?? 0) > 0) slowest = Math.max(slowest, UNIT_DATA[u].speed);
  return Math.round(slowest * tiles * 60) * 1_000;
}

/** Total attack of a group (all classes added for now). */
export function armyAttack(troops: Partial<Record<UnitId, number>>): number {
  let total = 0;
  for (const u of UNITS) total += (troops[u] ?? 0) * UNIT_DATA[u].attack;
  return total;
}

/** Defence of a group against infantry (all current units are infantry). */
export function armyDefence(troops: Partial<Record<UnitId, number>>): number {
  let total = 0;
  for (const u of UNITS) total += (troops[u] ?? 0) * UNIT_DATA[u].defence.infantry;
  return total;
}

/** Garrison for a tier, scaled within its band by the player's army attack. */
export function campGarrison(tier: number, playerAttack: number): Record<UnitId, number> {
  const t = CAMP_TIERS[tier - 1];
  const band = Math.min(RUBBER_BAND_MAX, 1 + Math.max(0, playerAttack) / (RUBBER_BAND_ATTACK_PER_TIER * tier));
  const out = {} as Record<UnitId, number>;
  for (const u of UNITS) out[u] = Math.round((t.troops[u] ?? 0) * band);
  return out;
}

export function campLoot(tier: number): Record<ResourceId, number> {
  const out = {} as Record<ResourceId, number>;
  for (const r of RESOURCES) out[r] = Math.round(CAMP_TIERS[tier - 1].loot * LOOT_SPLIT[r] * 3);
  return out;
}

function generateTerrain(rng: Rng): string[] {
  const tiles: string[] = new Array(MAP_SIZE * MAP_SIZE).fill('.');
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
  for (const [code, share] of Object.entries(TERRAIN_SEEDS) as [TerrainCode, number][]) {
    const blobs = Math.max(1, Math.round(share * MAP_SIZE * MAP_SIZE));
    for (let i = 0; i < blobs; i++) {
      let x = rng.int(0, MAP_SIZE - 1);
      let y = rng.int(0, MAP_SIZE - 1);
      const steps = rng.int(1, 4);
      for (let s = 0; s < steps; s++) {
        if (inBounds(x, y)) tiles[tileIndex(x, y)] = code;
        x += rng.int(-1, 1);
        y += rng.int(-1, 1);
      }
    }
  }
  // Keep the land around the village clear.
  for (let y = VILLAGE_POS.y - 1; y <= VILLAGE_POS.y + 1; y++) {
    for (let x = VILLAGE_POS.x - 1; x <= VILLAGE_POS.x + 1; x++) tiles[tileIndex(x, y)] = '.';
  }
  return tiles;
}

/**
 * Places camps at a spread of distances: camp i aims for a ring between ~2 and
 * ~9.5 tiles out, so tier 1 is close and tier 8 is near a corner.
 */
function placeCamps(rng: Rng, tiles: string[]): { x: number; y: number }[] {
  const placed: { x: number; y: number }[] = [];
  const free = (x: number, y: number) =>
    !(x === VILLAGE_POS.x && y === VILLAGE_POS.y) && placed.every((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) >= 2);
  for (let i = 0; i < CAMP_COUNT; i++) {
    const target = 2.2 + (i * (9.4 - 2.2)) / (CAMP_COUNT - 1);
    for (let slack = 0.6; ; slack += 0.4) {
      const options: { x: number; y: number }[] = [];
      for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
          if (Math.abs(distanceFromVillage({ x, y }) - target) <= slack && free(x, y)) options.push({ x, y });
        }
      }
      if (options.length > 0) {
        const p = rng.pick(options);
        placed.push(p);
        tiles[tileIndex(p.x, p.y)] = '.'; // camps sit on open ground
        break;
      }
      if (slack > MAP_SIZE) throw new Error('placeCamps: no room on the map');
    }
  }
  return placed;
}

function campNames(rng: Rng): string[] {
  const names = new Set<string>();
  while (names.size < CAMP_COUNT) names.add(`${rng.pick(CAMP_NAME_FIRST)} ${rng.pick(CAMP_NAME_SECOND)}`);
  return [...names];
}

/** A new map for a save seed. Same seed, same map. */
export function generateMap(seed: string, playerAttack = 0): WorldMap {
  const rng = new Rng(deriveSeed(seed, 'map'));
  const tiles = generateTerrain(rng);
  const spots = placeCamps(rng, tiles);
  const names = campNames(rng);
  const camps: Camp[] = spots
    .map((p) => ({ ...p, d: distanceFromVillage(p) }))
    .sort((a, b) => a.d - b.d)
    .map((p, i) => ({
      id: i + 1,
      name: names[i],
      x: p.x,
      y: p.y,
      tier: i + 1,
      troops: campGarrison(i + 1, playerAttack),
      loot: campLoot(i + 1),
    }));
  return { terrain: tiles.join(''), camps };
}

export type Threat = 'no-army' | 'easy' | 'fair' | 'risky' | 'deadly';

/** Rough read on a camp compared with the army at home (exact numbers need scouts). */
export function campThreat(homeTroops: Partial<Record<UnitId, number>>, camp: Camp): Threat {
  const attack = armyAttack(homeTroops);
  if (attack <= 0) return 'no-army';
  const ratio = attack / Math.max(1, armyDefence(camp.troops));
  if (ratio >= 2) return 'easy';
  if (ratio >= 1.2) return 'fair';
  if (ratio >= 0.8) return 'risky';
  return 'deadly';
}

export const THREAT_TEXT: Record<Threat, string> = {
  'no-army': 'You have no army yet',
  easy: 'Easy pickings',
  fair: 'A fair fight',
  risky: 'Risky',
  deadly: 'Deadly',
};
