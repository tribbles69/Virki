import type { Curve } from '../curve';

// ─── Balance tables ───────────────────────────────────────────────────────
// Placeholder numbers (TW-like early game), to be tuned with the balance
// simulator in v0.8. Edit these, not the logic.

export const RESOURCES = ['wood', 'stone', 'ore'] as const;
export type ResourceId = (typeof RESOURCES)[number];

/** Metal tiers (DESIGN §4). Only copper is produced until v0.4. */
export const METALS = ['copper'] as const;
export type MetalId = (typeof METALS)[number];

export const RESOURCE_NAMES: Record<ResourceId, string> = {
  wood: 'Wood',
  stone: 'Stone',
  ore: 'Copper ore',
};

/** Units per hour by producer building level. */
const PRODUCTION: Curve = {
  base: 30,
  atZero: 5, // a trickle even before the building exists
  segments: [
    { upTo: 30, r: 1.163 }, // L30 ≈ 2,400/h, like TW's max
    { upTo: 60, r: 1.06 },
    { upTo: 100, r: 1.03 },
  ],
};

/** Which building produces each resource, and a multiplier on the shared curve. */
export const PRODUCERS: Record<ResourceId, { building: 'woodcutter' | 'quarry' | 'mine'; curve: Curve; multiplier: number }> = {
  wood: { building: 'woodcutter', curve: PRODUCTION, multiplier: 1 },
  stone: { building: 'quarry', curve: PRODUCTION, multiplier: 1 },
  ore: { building: 'mine', curve: PRODUCTION, multiplier: 0.8 }, // ore is scarcer
};

/** Storage cap per resource, by Warehouse level. */
export const WAREHOUSE_CAPACITY: Curve = {
  base: 1_000,
  atZero: 1_000,
  segments: [
    { upTo: 30, r: 1.229 }, // L30 ≈ 400,000
    { upTo: 60, r: 1.1 }, // after L30, grows as fast as building costs so every level stays affordable
    { upTo: 100, r: 1.06 },
  ],
};

/** Population cap by Farm level. */
export const FARM_CAPACITY: Curve = {
  base: 240,
  atZero: 0,
  segments: [
    { upTo: 30, r: 1.172 }, // L30 ≈ 24,000
    { upTo: 60, r: 1.04 },
    { upTo: 100, r: 1.02 },
  ],
};

/** Starting stockpile for a new village. */
export const STARTING_RESOURCES: Record<ResourceId, number> = {
  wood: 500,
  stone: 500,
  ore: 400,
};
