import { curveValue } from './curve';
import {
  MILITIA_BASE,
  MILITIA_PER_WALL_LEVEL,
  WALL_ERAS,
  WALL_FAST_LEVELS,
  WALL_FAST_STEP,
  WALL_SLOW_STEP,
  WATCHTOWER_WARNING,
} from './data/defence';

/** The village's own militia defence (before the wall multiplier). */
export function militia(wallLevel: number): number {
  return MILITIA_BASE + MILITIA_PER_WALL_LEVEL * wallLevel;
}

/** Defence multiplier from the Wall. L0 = ×1, L20 = ×1.74, L100 ≈ ×3.34. */
export function wallMultiplier(level: number): number {
  const fast = Math.min(level, WALL_FAST_LEVELS);
  const slow = Math.max(0, level - WALL_FAST_LEVELS);
  return 1 + fast * WALL_FAST_STEP + slow * WALL_SLOW_STEP;
}

export interface WallEra {
  /** 0-based era number (0 = Wooden stakes). */
  index: number;
  name: string;
  /** First level of this era, and of the next (undefined at the last era). */
  from: number;
  next?: number;
}

/** Which era a wall level belongs to; undefined at level 0 (no wall). */
export function wallEra(level: number): WallEra | undefined {
  if (level <= 0) return undefined;
  let index = 0;
  for (let i = 0; i < WALL_ERAS.length; i++) if (level >= WALL_ERAS[i].from) index = i;
  return { index, name: WALL_ERAS[index].name, from: WALL_ERAS[index].from, next: WALL_ERAS[index + 1]?.from };
}

/** Milliseconds of warning before a raid lands, by Watchtower level (0 = none). Whole seconds. */
export function watchtowerWarning(level: number): number {
  return Math.round(curveValue(WATCHTOWER_WARNING, level) * 60) * 1_000;
}
