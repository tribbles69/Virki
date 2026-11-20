import type { Curve } from '../curve';

// Building ids and the parts of their data the resource system needs.
// Costs, build times and unlocks arrive with the build queue (next roadmap item).

export const BUILDINGS = ['hall', 'woodcutter', 'quarry', 'farm', 'mine', 'warehouse'] as const;
export type BuildingId = (typeof BUILDINGS)[number];

export const BUILDING_NAMES: Record<BuildingId, string> = {
  hall: 'Great Hall',
  woodcutter: 'Woodcutter',
  quarry: 'Quarry',
  farm: 'Farm',
  mine: 'Mine',
  warehouse: 'Warehouse',
};

/** Levels a new village starts with. */
export const STARTING_LEVELS: Record<BuildingId, number> = {
  hall: 1,
  woodcutter: 1,
  quarry: 1,
  farm: 1,
  mine: 1,
  warehouse: 1,
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

export const POP_PER_BUILDING: Record<BuildingId, Curve> = {
  hall: pop(5, 1.17),
  woodcutter: pop(5, 1.155),
  quarry: pop(10, 1.14),
  farm: pop(0, 1),
  mine: pop(10, 1.17),
  warehouse: pop(0, 1),
};
