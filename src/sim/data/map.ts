import type { ResourceId } from './resources';
import type { UnitId } from './units';

// ─── Map & bandit tables (DESIGN §7) ──────────────────────────────────────
// Placeholder numbers, tuned in v0.8. Edit these, not the logic.

export const MAP_SIZE = 15;
/** The player's village sits in the middle. */
export const VILLAGE_POS = { x: 7, y: 7 } as const;
export const CAMP_COUNT = 8;

/** Terrain codes as stored in the save (one character per tile). */
export const TERRAIN = {
  '.': { name: 'Grassland', passable: true },
  f: { name: 'Forest', passable: true },
  h: { name: 'Hills', passable: true },
  w: { name: 'Lake', passable: false },
} as const;
export type TerrainCode = keyof typeof TERRAIN;

/** Share of tiles that start as each feature (before clumping). */
export const TERRAIN_SEEDS = { f: 0.1, h: 0.06, w: 0.025 } as const;

export interface CampTier {
  /** Garrison at the bottom of the band (a brand-new player). */
  troops: Partial<Record<UnitId, number>>;
  /** Size of the stash: the camp holds 3× this in total, split by LOOT_SPLIT. */
  loot: number;
}

/**
 * Camps get tougher with distance: tier 1 is the nearest, tier 8 the farthest.
 * The rubber band (DESIGN §7) scales a garrison up to RUBBER_BAND_MAX× as your
 * army grows, so near camps stay farmable and far ones stay a challenge.
 */
export const CAMP_TIERS: readonly CampTier[] = [
  { troops: { spear: 3 }, loot: 100 },
  { troops: { spear: 6, axe: 2 }, loot: 200 },
  { troops: { spear: 10, sword: 4 }, loot: 350 },
  { troops: { spear: 15, sword: 8, axe: 5 }, loot: 550 },
  { troops: { spear: 25, sword: 15, axe: 10 }, loot: 900 },
  { troops: { spear: 40, sword: 25, axe: 20 }, loot: 1_400 },
  { troops: { spear: 60, sword: 40, axe: 35 }, loot: 2_200 },
  { troops: { spear: 90, sword: 60, axe: 55 }, loot: 3_500 },
  // Tier 9: the daily Warlord camp.
  { troops: { spear: 140, sword: 100, axe: 90 }, loot: 6_000 },
];

// ─── Daily reset (DESIGN §7) ──────────────────────────────────────────────
/** Local hour the camps respawn. */
export const RESET_HOUR = 4;
/** Each day's garrisons and loot vary by up to this much either way. */
export const DAILY_VARIATION = 0.1;
/** Id and tier of the daily Warlord camp. */
export const WARLORD_ID = 9;
export const WARLORD_TIER = 9;
/** The Warlord pitches camp at least this far from your village. */
export const WARLORD_MIN_DISTANCE = 4;
export const WARLORD_TITLES = ['the Red', 'the Cruel', 'Ironhand', 'the Grey', 'Oathbreaker', 'the Wolf', 'Bloodaxe', 'the Hollow'] as const;
export const WARLORD_NAMES = ['Hrafn', 'Ulfar', 'Skarde', 'Brand', 'Grimkel', 'Thorvald', 'Ketil', 'Asgaut'] as const;

export const RUBBER_BAND_MAX = 3;
/** Your army attack at which a tier's garrison reaches the top of its band, per tier. */
export const RUBBER_BAND_ATTACK_PER_TIER = 400;

/** Loot is split between resources in this ratio. */
export const LOOT_SPLIT: Record<ResourceId, number> = { wood: 0.4, stone: 0.35, ore: 0.25 };

export const CAMP_NAME_FIRST = ['Wolf', 'Raven', 'Ash', 'Bone', 'Crow', 'Thorn', 'Black', 'Grim', 'Frost', 'Red', 'Stag', 'Iron', 'Mire', 'Hollow'] as const;
export const CAMP_NAME_SECOND = ['Den', 'Hollow', 'Camp', 'Ridge', 'Ford', 'Barrow', 'Hold', 'Watch', 'Gully', 'Lair'] as const;
