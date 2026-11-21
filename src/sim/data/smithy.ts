import type { Curve } from '../curve';

// ─── Smithy: craft tiers (DESIGN §6.1) ────────────────────────────────────
// Placeholder numbers, tuned in v0.8. Edit these, not the logic.

/** Each unit has two tracks, researched separately. */
export const TRACKS = ['weapon', 'armour'] as const;
export type Track = (typeof TRACKS)[number];

/**
 * Craft tiers, worst to best. `mult` scales attack (weapon track) or defence
 * (armour track). `smithy` is the Smithy level needed to research the tier.
 */
export const CRAFT_TIERS = [
  { name: 'Rags', mult: 1.0, smithy: 0 },
  { name: 'Padded', mult: 1.15, smithy: 1 },
  { name: 'Leather', mult: 1.3, smithy: 3 },
  { name: 'Studded', mult: 1.45, smithy: 6 },
  { name: 'Mail', mult: 1.6, smithy: 10 },
  { name: 'Scale', mult: 1.75, smithy: 15 },
  { name: 'Plate', mult: 1.9, smithy: 25 },
  { name: 'Masterwork', mult: 2.05, smithy: 40 },
  { name: 'Runeforged', mult: 2.2, smithy: 60 },
] as const;
export const MAX_CRAFT_TIER = CRAFT_TIERS.length - 1;

/** Research cost for tier 1 = the unit's own cost × this; each tier after costs RESEARCH_COST_GROWTH× more. */
export const RESEARCH_COST_FACTOR = 20;
export const RESEARCH_COST_GROWTH = 1.9;

/** Research time for tier 1, in minutes; each tier after takes RESEARCH_TIME_GROWTH× longer (before the Smithy speed-up). */
export const RESEARCH_MINUTES = 30;
export const RESEARCH_TIME_GROWTH = 1.7;

/** Research-time multiplier by Smithy level (like the Great Hall for building). */
export const SMITHY_SPEED: Curve = {
  base: 1,
  atZero: 1,
  segments: [
    { upTo: 30, r: 0.95 },
    { upTo: 100, r: 0.99 },
  ],
};

/** How many researches can run at once. */
export const RESEARCH_SLOTS = 1;
