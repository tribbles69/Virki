import type { Curve, CurveSegment } from '../curve';
import type { ResourceId } from './resources';

// ─── Balance tables ───────────────────────────────────────────────────────
// Placeholder numbers (TW-like early game), to be tuned with the balance
// simulator in v0.8. Edit these, not the logic.

export const BUILDINGS = ['hall', 'woodcutter', 'quarry', 'farm', 'mine', 'warehouse', 'barracks'] as const;
export type BuildingId = (typeof BUILDINGS)[number];

/** How many builds can run at once. */
export const BUILD_QUEUE_SLOTS = 1;

/** Cost growth per level (DESIGN §5.2). Shared by all buildings; base costs differ. */
export const COST_GROWTH: readonly CurveSegment[] = [
  { upTo: 30, r: 1.26 },
  { upTo: 60, r: 1.1 },
  { upTo: 100, r: 1.06 },
];

/** Build-time growth per level, before the Great Hall speed-up. */
export const TIME_GROWTH: readonly CurveSegment[] = [
  { upTo: 30, r: 1.2 },
  { upTo: 60, r: 1.08 },
  { upTo: 100, r: 1.04 },
];

/**
 * Great Hall speed-up: build times are multiplied by this at the Hall's level.
 * L1 = ×1, L30 ≈ ×0.24, L60 ≈ ×0.15, L100 ≈ ×0.11.
 */
export const HALL_SPEED: Curve = {
  base: 1,
  atZero: 1,
  segments: [
    { upTo: 30, r: 0.952 },
    { upTo: 60, r: 0.985 },
    { upTo: 100, r: 0.993 },
  ],
};

/**
 * Workers each building needs, in total, at a given level (TW-style: buildings
 * take population). Rounded. Growth slows at the same points as the Farm so
 * buildings never outgrow it and leave room for troops.
 */
const pop = (base: number, early: number): Curve => ({
  base,
  atZero: 0,
  segments: [
    { upTo: 30, r: early },
    { upTo: 60, r: 1.03 },
    { upTo: 100, r: 1.015 },
  ],
});

export interface BuildingDef {
  name: string;
  /** Highest level. */
  max: number;
  /** Level a new village starts with. */
  start: number;
  /** Cost of level 1; grows by COST_GROWTH. */
  cost: Record<ResourceId, number>;
  /** Minutes to build level 1 with a level-1 Hall; grows by TIME_GROWTH. */
  minutes: number;
  /** Total population the building uses at each level. */
  pop: Curve;
  /** Other buildings needed first, e.g. { hall: 3 }. */
  requires?: Partial<Record<BuildingId, number>>;
}

export const BUILDING_DATA: Record<BuildingId, BuildingDef> = {
  hall: { name: 'Great Hall', max: 100, start: 1, cost: { wood: 90, stone: 80, ore: 70 }, minutes: 6, pop: pop(5, 1.17) },
  woodcutter: { name: 'Woodcutter', max: 100, start: 1, cost: { wood: 50, stone: 60, ore: 40 }, minutes: 5, pop: pop(5, 1.155) },
  quarry: { name: 'Quarry', max: 100, start: 1, cost: { wood: 65, stone: 50, ore: 40 }, minutes: 5, pop: pop(10, 1.14) },
  farm: { name: 'Farm', max: 100, start: 1, cost: { wood: 45, stone: 40, ore: 30 }, minutes: 7, pop: pop(0, 1) },
  mine: { name: 'Mine', max: 100, start: 1, cost: { wood: 75, stone: 65, ore: 70 }, minutes: 6, pop: pop(10, 1.17) },
  warehouse: { name: 'Warehouse', max: 100, start: 1, cost: { wood: 60, stone: 50, ore: 40 }, minutes: 5, pop: pop(0, 1) },
  barracks: {
    name: 'Barracks',
    max: 60,
    start: 0,
    cost: { wood: 200, stone: 170, ore: 90 },
    minutes: 25,
    pop: pop(7, 1.17),
    requires: { hall: 3 },
  },
};
