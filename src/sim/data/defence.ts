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

/** Minutes of warning the Watchtower gives before a raid lands: L1 = 5 min, L30 ≈ 6 h. */
export const WATCHTOWER_WARNING: Curve = {
  base: 5,
  atZero: 0,
  segments: [{ upTo: 30, r: 1.159 }],
};
