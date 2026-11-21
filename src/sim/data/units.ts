import type { Curve } from '../curve';
import type { ResourceId } from './resources';
import type { BuildingId } from './buildings';

// ─── Balance tables ───────────────────────────────────────────────────────
// TW-inspired starting stats (DESIGN §6), to be tuned in v0.8. Edit these, not the logic.

export const UNITS = ['spear', 'sword', 'axe', 'scout', 'light', 'heavy'] as const;
export type UnitId = (typeof UNITS)[number];

/** Attack class: decides which of the defender's defence values counts against it. Scouts don't fight. */
export type UnitClass = 'infantry' | 'cavalry' | 'scout';

export interface UnitDef {
  name: string;
  plural: string;
  role: string;
  cls: UnitClass;
  /** Which building trains it. */
  building: 'barracks' | 'stable';
  /** Buildings needed before it can be trained. */
  requires: Partial<Record<BuildingId, number>>;
  cost: Record<ResourceId, number>;
  /** Population per soldier. */
  pop: number;
  /** Minutes to train one with its building at level 1. */
  minutes: number;
  attack: number;
  /** Defence against infantry, cavalry and archers. */
  defence: { infantry: number; cavalry: number; archer: number };
  /** Minutes per map tile. */
  speed: number;
  /** Loot each soldier can carry home. */
  carry: number;
}

export const UNIT_DATA: Record<UnitId, UnitDef> = {
  spear: {
    name: 'Spearman',
    plural: 'Spearmen',
    role: 'Defence, strong against cavalry',
    cls: 'infantry',
    building: 'barracks',
    requires: { barracks: 1 },
    cost: { wood: 50, stone: 30, ore: 10 },
    pop: 1,
    minutes: 15,
    attack: 10,
    defence: { infantry: 15, cavalry: 45, archer: 20 },
    speed: 18,
    carry: 25,
  },
  sword: {
    name: 'Swordsman',
    plural: 'Swordsmen',
    role: 'Defence, strong against infantry',
    cls: 'infantry',
    building: 'barracks',
    requires: { barracks: 2 },
    cost: { wood: 30, stone: 30, ore: 70 },
    pop: 1,
    minutes: 22,
    attack: 25,
    defence: { infantry: 50, cavalry: 15, archer: 40 },
    speed: 22,
    carry: 15,
  },
  axe: {
    name: 'Axeman',
    plural: 'Axemen',
    role: 'Attack',
    cls: 'infantry',
    building: 'barracks',
    requires: { barracks: 3 },
    cost: { wood: 60, stone: 30, ore: 40 },
    pop: 1,
    minutes: 19,
    attack: 40,
    defence: { infantry: 10, cavalry: 5, archer: 10 },
    speed: 18,
    carry: 10,
  },
  scout: {
    name: 'Scout',
    plural: 'Scouts',
    role: 'Sent alone, brings back exact bandit numbers and loot',
    cls: 'scout',
    building: 'stable',
    requires: { stable: 1 },
    cost: { wood: 50, stone: 50, ore: 20 },
    pop: 2,
    minutes: 10,
    attack: 0,
    defence: { infantry: 2, cavalry: 1, archer: 2 },
    speed: 9,
    carry: 0,
  },
  light: {
    name: 'Light Cavalry',
    plural: 'Light Cavalry',
    role: 'Fast raider, carries lots of loot',
    cls: 'cavalry',
    building: 'stable',
    requires: { stable: 3 },
    cost: { wood: 125, stone: 100, ore: 250 },
    pop: 4,
    minutes: 20,
    attack: 130,
    defence: { infantry: 30, cavalry: 40, archer: 30 },
    speed: 10,
    carry: 80,
  },
  heavy: {
    name: 'Heavy Cavalry',
    plural: 'Heavy Cavalry',
    role: 'All-rounder, strong in attack and defence',
    cls: 'cavalry',
    building: 'stable',
    requires: { stable: 10 },
    cost: { wood: 200, stone: 150, ore: 600 },
    pop: 6,
    minutes: 40,
    attack: 150,
    defence: { infantry: 200, cavalry: 80, archer: 180 },
    speed: 11,
    carry: 50,
  },
};

/** Training-time multiplier by Barracks / Stable level. L1 = ×1, L10 ≈ ×0.57, L30 ≈ ×0.17, L60 ≈ ×0.09. */
export const BARRACKS_SPEED: Curve = {
  base: 1,
  atZero: 1,
  segments: [
    { upTo: 30, r: 0.94 },
    { upTo: 60, r: 0.98 },
  ],
};
export const STABLE_SPEED = BARRACKS_SPEED;

/** Most training batches that can be lined up at once, per building. */
export const RECRUIT_QUEUE_SLOTS = 5;
