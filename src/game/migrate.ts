import { BUILDINGS, BUILDING_DATA, RESOURCES, SAVE_VERSION, UNITS, type GameState } from '../sim';

/**
 * Upgrades a save from version N to N+1. Add one entry each time SAVE_VERSION
 * goes up; never edit an old one. Input is untrusted JSON.
 */
type Migration = (save: any) => any;
export const MIGRATIONS: Record<number, Migration> = {
  // v0.2: soldiers and the training queue.
  1: (s) => ({ ...s, version: 2, troops: {}, recruitQueue: [] }),
};

export class SaveError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Turn untrusted save data (from storage or an imported file) into a valid,
 * current-version GameState, or throw SaveError explaining why it can't.
 */
export function migrateSave(raw: unknown): GameState {
  if (!isObj(raw)) throw new SaveError('This is not a Virki save.');
  let save: Record<string, unknown> = structuredClone(raw);
  if (!isNum(save.version) || save.version < 1) throw new SaveError('This save has no version number.');
  if (save.version > SAVE_VERSION) {
    throw new SaveError('This save is from a newer version of Virki. Update the app, then try again.');
  }
  while ((save.version as number) < SAVE_VERSION) {
    const step = MIGRATIONS[save.version as number];
    if (!step) throw new SaveError(`No upgrade path from save version ${save.version}.`);
    save = step(save);
  }
  return normalise(save);
}

/** Validate the shape, and fill in anything added since without a version bump (new buildings etc.). */
function normalise(s: Record<string, unknown>): GameState {
  const bad = (what: string) => new SaveError(`This save is damaged (${what}).`);
  if (typeof s.seed !== 'string' || s.seed === '') throw bad('seed');
  if (!isNum(s.time)) throw bad('time');
  if (!isNum(s.rng)) throw bad('random state');
  if (!isNum(s.nextEventId)) throw bad('event counter');
  if (!Array.isArray(s.events)) throw bad('events');
  for (const e of s.events) {
    if (!isObj(e) || !isNum(e.id) || !isNum(e.at) || typeof e.type !== 'string') throw bad('events');
  }
  if (!isObj(s.resources)) throw bad('resources');
  if (!isObj(s.buildings)) throw bad('buildings');
  if (!Array.isArray(s.buildQueue)) throw bad('build queue');

  const resources = {} as GameState['resources'];
  for (const r of RESOURCES) {
    const v = s.resources[r] ?? 0;
    if (!isNum(v) || v < 0) throw bad(`resource ${r}`);
    resources[r] = v;
  }
  const buildings = {} as GameState['buildings'];
  for (const b of BUILDINGS) {
    const v = s.buildings[b] ?? BUILDING_DATA[b].start;
    if (!isNum(v) || v < 0 || v > BUILDING_DATA[b].max || !Number.isInteger(v)) throw bad(`building ${b}`);
    buildings[b] = v;
  }
  if (!isObj(s.troops)) throw bad('troops');
  if (!Array.isArray(s.recruitQueue)) throw bad('training queue');
  const troops = {} as GameState['troops'];
  for (const u of UNITS) {
    const v = s.troops[u] ?? 0;
    if (!isNum(v) || v < 0 || !Number.isInteger(v)) throw bad(`troops ${u}`);
    troops[u] = v;
  }
  for (const b of s.recruitQueue) {
    if (!isObj(b) || !(UNITS as readonly unknown[]).includes(b.unit) || !isNum(b.count) || !isNum(b.trained)) {
      throw bad('training queue');
    }
  }

  return {
    version: SAVE_VERSION,
    seed: s.seed,
    time: s.time,
    rng: s.rng >>> 0,
    nextEventId: s.nextEventId,
    events: s.events as GameState['events'],
    resources,
    buildings,
    buildQueue: s.buildQueue as GameState['buildQueue'],
    troops,
    recruitQueue: s.recruitQueue as GameState['recruitQueue'],
  };
}
