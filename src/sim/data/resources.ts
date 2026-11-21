import type { Curve } from '../curve';

// ─── Balance tables ───────────────────────────────────────────────────────
// Placeholder numbers (TW-like early game), to be tuned with the balance
// simulator in v0.8. Edit these, not the logic.

export const RESOURCES = ['wood', 'stone', 'ore'] as const;
export type ResourceId = (typeof RESOURCES)[number];

/**
 * Metal tiers (DESIGN §4), worst to best. Copper ore is the everyday `ore`
 * resource; the rest are mined once the Mine unlocks them, at a fraction of the
 * copper rate. `gear` is the equipment multiplier (used when re-equipping, v0.4).
 */
export const METALS = ['copper', 'bronze', 'iron', 'steel', 'damascus', 'mithril', 'adamant', 'orichalcum', 'starmetal'] as const;
export type MetalId = (typeof METALS)[number];

export const METAL_DATA: Record<MetalId, { name: string; mine: number; rate: number; gear: number; smeltMinutes: number; fuel: number }> = {
  copper: { name: 'Copper', mine: 1, rate: 1, gear: 1.0, smeltMinutes: 1, fuel: 2 },
  bronze: { name: 'Bronze', mine: 10, rate: 0.5, gear: 1.15, smeltMinutes: 1.5, fuel: 4 },
  iron: { name: 'Iron', mine: 20, rate: 0.3, gear: 1.32, smeltMinutes: 2.5, fuel: 8 },
  steel: { name: 'Steel', mine: 35, rate: 0.18, gear: 1.52, smeltMinutes: 4, fuel: 16 },
  damascus: { name: 'Damascus', mine: 50, rate: 0.1, gear: 1.75, smeltMinutes: 6, fuel: 30 },
  mithril: { name: 'Mithril', mine: 65, rate: 0.06, gear: 2.0, smeltMinutes: 9, fuel: 55 },
  adamant: { name: 'Adamant', mine: 80, rate: 0.035, gear: 2.3, smeltMinutes: 13, fuel: 100 },
  orichalcum: { name: 'Orichalcum', mine: 90, rate: 0.02, gear: 2.65, smeltMinutes: 20, fuel: 180 },
  starmetal: { name: 'Starmetal', mine: 100, rate: 0.012, gear: 3.05, smeltMinutes: 30, fuel: 320 },
};

/** Ore needed per ingot (all metals). Fuel above is wood per ingot, burnt as charcoal. */
export const ORE_PER_INGOT = 4;
/** Most smelting batches lined up at the forge. */
export const SMELT_QUEUE_SLOTS = 3;

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
