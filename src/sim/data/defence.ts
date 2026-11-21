import type { Curve } from '../curve';

// ─── Wall & Watchtower (DESIGN §5, §5.1) ─────────────────────────────────
// Edit these, not the logic.

/** Wall bonus per level up to WALL_FAST_LEVELS, then WALL_SLOW_STEP per level after. */
export const WALL_FAST_STEP = 0.037;
export const WALL_FAST_LEVELS = 20;
export const WALL_SLOW_STEP = 0.02;

/** The wall's look changes every 10 levels (DESIGN §5.1). `from` is the first level of each era. */
export const WALL_ERAS = [
  { from: 1, name: 'Wooden stakes' },
  { from: 10, name: 'Palisade' },
  { from: 20, name: 'Earth rampart' },
  { from: 30, name: 'Dry-stone wall' },
  { from: 40, name: 'Mortared stone' },
  { from: 50, name: 'Stone towers' },
  { from: 60, name: 'Curtain wall & moat' },
  { from: 70, name: 'Concentric walls' },
  { from: 80, name: 'Star fort' },
  { from: 90, name: 'Mythic citadel' },
] as const;

/** Village militia: flat defence that never dies, before the wall multiplier (TW-style basic defence). */
export const MILITIA_BASE = 20;
export const MILITIA_PER_WALL_LEVEL = 15;

// ─── Bandit raids (DESIGN §7) ─────────────────────────────────────────────
/** Raids start once the player has a Barracks of this level. */
export const RAIDS_NEED_BARRACKS = 1;
/** How many raids a day, by weight. */
export const RAIDS_PER_DAY = [
  { item: 0, weight: 30 },
  { item: 1, weight: 50 },
  { item: 2, weight: 20 },
] as const;
/** Raids set off between these many hours after the 04:00 reset. */
export const RAID_WINDOW_HOURS = [1, 22] as const;
/** A raiding party is this share of its camp's garrison. */
export const RAID_SHARE = [0.3, 0.6] as const;
/** Chance weight of each tier raiding: nearer camps raid more often. Index 0 = tier 1. */
export const RAID_TIER_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

/** Minutes of warning the Watchtower gives before a raid lands: L1 = 5 min, L30 ≈ 6 h. */
export const WATCHTOWER_WARNING: Curve = {
  base: 5,
  atZero: 0,
  segments: [{ upTo: 30, r: 1.159 }],
};
