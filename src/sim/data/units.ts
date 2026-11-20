import type { Curve } from '../curve';
import type { ResourceId } from './resources';
import type { BuildingId } from './buildings';

// ─── Balance tables ───────────────────────────────────────────────────────
// TW-inspired starting stats (DESIGN §6), to be tuned in v0.8. Edit these, not the logic.

export const UNITS = ['spear', 'sword', 'axe'] as const;
export type UnitId = (typeof UNITS)[number];

export interface UnitDef {
  name: string;
  plural: string;
  role: string;
  /** Which building trains it. */
  building: BuildingId;
  /** Buildings needed before it can be trained. */
  requires: Partial<Record<BuildingId, number>>;
  cost: Record<ResourceId, number>;
  /** Population per soldier. */
  pop: number;
  /** Minutes to train one with a level-1 Barracks. */
  minutes: number;
  attack: number;
  /** Defence against infantry, cavalry and archers. */
  defence: { infantry: number; cavalry: number; archer: number };
  /** Minutes per map tile (used from v0.2 marches). */
  speed: number;
  /** Loot each soldier can carry home. */
  carry: number;
}

export const UNIT_DATA: Record<UnitId, UnitDef> = {
  spear: {
    name: 'Spearman',
    plural: 'Spearmen',
    role: 'Defence, strong against cavalry',
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
};

/** Training-time multiplier by Barracks level. L1 = ×1, L10 ≈ ×0.57, L30 ≈ ×0.17, L60 ≈ ×0.09. */
export const BARRACKS_SPEED: Curve = {
  base: 1,
  atZero: 1,
  segments: [
    { upTo: 30, r: 0.94 },
    { upTo: 60, r: 0.98 },
  ],
};

/** Most training batches that can be lined up at once. */
export const RECRUIT_QUEUE_SLOTS = 5;
