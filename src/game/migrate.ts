import {
  armyAttack,
  generateMap,
  BUILDINGS,
  BUILDING_DATA,
  CAMP_COUNT,
  MAP_SIZE,
  RESOURCES,
  SAVE_VERSION,
  TERRAIN,
  UNITS,
  MAX_CRAFT_TIER,
  TRACKS,
  newSmithy,
  noMetals,
  newEquipment,
  newVeterancy,
  METALS,
  type GameState,
} from '../sim';

/**
 * Upgrades a save from version N to N+1. Add one entry each time SAVE_VERSION
 * goes up; never edit an old one. Input is untrusted JSON.
 */
type Migration = (save: any) => any;
export const MIGRATIONS: Record<number, Migration> = {
  // v0.2: soldiers and the training queue.
  1: (s) => ({ ...s, version: 2, troops: {}, recruitQueue: [] }),
  // v0.2: the map and its bandit camps, sized to the army the player already has.
  2: (s) => ({ ...s, version: 3, map: generateMap(String(s.seed), armyAttack(isObj(s.troops) ? s.troops : {})) }),
  // v0.2: armies on the march and battle reports.
  3: (s) => ({ ...s, version: 4, marches: [], reports: [] }),
  // v0.3: daily resets. Resets count from the last save, so any 04:00s missed since are caught up.
  4: (s) => ({ ...s, version: 5, resetsScheduledUntil: s.time, dayKey: '', resetsDone: 0 }),
  // v0.3: bandit raids on the village.
  5: (s) => ({ ...s, version: 6, raids: [] }),
  // v0.3: Stable, cavalry and scouts (new units and buildings fill themselves in); scouting intel needs the last reset time.
  6: (s) => ({ ...s, version: 7, lastResetAt: 0 }),
  // v0.4: Smithy research (craft tiers per unit and track).
  7: (s) => ({ ...s, version: 8, smithy: {}, researchQueue: [] }),
  // v0.4: higher-tier ores, ingots and the forge queue.
  8: (s) => ({ ...s, version: 9, ores: {}, ingots: {}, smeltQueue: [] }),
  // v0.4: re-equipping units with metal.
  9: (s) => ({ ...s, version: 10, equipment: {} }),
  // v0.4: veterancy pools.
  10: (s) => ({ ...s, version: 11, veterancy: {} }),
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

  const map = s.map;
  if (!isObj(map) || typeof map.terrain !== 'string' || map.terrain.length !== MAP_SIZE * MAP_SIZE) throw bad('map');
  if (![...map.terrain].every((c) => c in TERRAIN)) throw bad('map terrain');
  // 8 raider camps, plus the daily Warlord once the first reset has run.
  if (!Array.isArray(map.camps) || map.camps.length < CAMP_COUNT || map.camps.length > CAMP_COUNT + 1) throw bad('camps');
  for (const c of map.camps) {
    if (!isObj(c) || !isNum(c.id) || !isNum(c.x) || !isNum(c.y) || !isNum(c.tier) || !isObj(c.troops) || !isObj(c.loot)) {
      throw bad('camps');
    }
    for (const u of UNITS) c.troops[u] = isNum(c.troops[u]) ? c.troops[u] : 0;
    for (const r of RESOURCES) c.loot[r] = isNum(c.loot[r]) ? c.loot[r] : 0;
  }

  if (!Array.isArray(s.marches)) throw bad('marches');
  for (const m of s.marches) {
    if (!isObj(m) || !isNum(m.id) || !isNum(m.campId) || !isObj(m.troops) || !isObj(m.sent) || !isObj(m.loot)) throw bad('marches');
    if (m.phase !== 'outbound' && m.phase !== 'returning') throw bad('marches');
    for (const u of UNITS) {
      (m.troops as Record<string, unknown>)[u] = isNum(m.troops[u]) ? m.troops[u] : 0;
      (m.sent as Record<string, unknown>)[u] = isNum(m.sent[u]) ? m.sent[u] : 0;
    }
  }
  if (!isObj(s.smithy)) throw bad('smithy');
  if (!Array.isArray(s.researchQueue)) throw bad('research queue');
  const smithy = newSmithy();
  for (const u of UNITS) {
    const row = s.smithy[u];
    for (const t of TRACKS) {
      const tier = isObj(row) && row[t] !== undefined ? row[t] : 0;
      if (!isNum(tier) || tier < 0 || tier > MAX_CRAFT_TIER || !Number.isInteger(tier)) throw bad(`smithy ${u}`);
      smithy[u][t] = tier;
    }
  }
  if (!isObj(s.ores)) throw bad('ores');
  if (!isObj(s.ingots)) throw bad('ingots');
  if (!Array.isArray(s.smeltQueue)) throw bad('forge queue');
  const ores = noMetals();
  const ingots = noMetals();
  for (const m of METALS) {
    const o = s.ores[m] ?? 0;
    const i = s.ingots[m] ?? 0;
    if (!isNum(o) || o < 0) throw bad(`${m} ore`);
    if (!isNum(i) || i < 0 || !Number.isInteger(i)) throw bad(`${m} ingots`);
    ores[m] = m === 'copper' ? 0 : o;
    ingots[m] = i;
  }
  for (const b of s.smeltQueue) {
    if (!isObj(b) || !(METALS as readonly unknown[]).includes(b.metal) || !isNum(b.count) || !isNum(b.finishesAt)) throw bad('forge queue');
  }
  if (!isObj(s.equipment)) throw bad('equipment');
  const equipment = newEquipment();
  for (const u of UNITS) {
    const row = s.equipment[u];
    for (const t of TRACKS) {
      const m = isObj(row) && row[t] !== undefined ? row[t] : 'copper';
      if (!(METALS as readonly unknown[]).includes(m)) throw bad(`equipment ${u}`);
      equipment[u][t] = m as (typeof METALS)[number];
    }
  }
  if (!isObj(s.veterancy)) throw bad('veterancy');
  const veterancy = newVeterancy();
  for (const u of UNITS) {
    const v = s.veterancy[u] ?? 0;
    if (!isNum(v) || v < 0) throw bad(`veterancy ${u}`);
    veterancy[u] = v;
  }
  if (!Array.isArray(s.raids)) throw bad('raids');
  for (const r of s.raids) if (!isObj(r) || !isNum(r.id) || !isNum(r.arriveAt) || !isObj(r.troops)) throw bad('raids');
  if (!Array.isArray(s.reports)) throw bad('reports');
  for (const r of s.reports) if (!isObj(r) || !isNum(r.id) || typeof r.won !== 'boolean') throw bad('reports');

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
    map: map as unknown as GameState['map'],
    marches: s.marches as GameState['marches'],
    reports: s.reports as GameState['reports'],
    resetsScheduledUntil: isNum(s.resetsScheduledUntil) ? s.resetsScheduledUntil : s.time,
    dayKey: typeof s.dayKey === 'string' ? s.dayKey : '',
    resetsDone: isNum(s.resetsDone) ? s.resetsDone : 0,
    raids: s.raids as GameState['raids'],
    lastResetAt: isNum(s.lastResetAt) ? s.lastResetAt : 0,
    smithy,
    researchQueue: s.researchQueue as GameState['researchQueue'],
    ores,
    ingots,
    smeltQueue: s.smeltQueue as GameState['smeltQueue'],
    equipment,
    veterancy,
  };
}
