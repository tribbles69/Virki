import { hashSeed, type RngState } from './rng';
import type { GameEvent } from './events';
import { STARTING_RESOURCES, type ResourceId } from './data/resources';
import { BUILDINGS, BUILDING_DATA, type BuildingId } from './data/buildings';
import { UNITS, type UnitId } from './data/units';
import { generateMap, type WorldMap } from './map';
import type { BattleReport, March } from './march';
import type { Raid } from './raid';
import { newSmithy, type ResearchJob, type SmithyState } from './smithy';
import { noMetals, type SmeltBatch } from './metals';
import type { MetalId } from './data/resources';
import { newEquipment, type Equipment } from './equip';
import { newVeterancy, type Veterancy } from './veterancy';

/** Bump when the save shape changes, and add a migration in src/game/migrate.ts. */
export const SAVE_VERSION = 11;

/** The entire game. Plain JSON-safe data only: it is what gets saved. */
export interface GameState {
  version: number;
  /** Save seed chosen at new game; all randomness descends from it. */
  seed: string;
  /** Sim clock in ms since epoch: the moment this state is valid for. */
  time: number;
  /** Current position of the main random stream. */
  rng: RngState;
  /** Next id handed out by schedule(); also breaks ties between same-time events. */
  nextEventId: number;
  /** Pending events, kept sorted by (at, id). */
  events: GameEvent[];
  /** Stockpile. Fractional internally so slow trickles aren't lost; show floor(). */
  resources: Record<ResourceId, number>;
  /** Current level of each building (0 = not built). */
  buildings: Record<BuildingId, number>;
  /** Builds in progress, in the order they'll finish. */
  buildQueue: BuildJob[];
  /** Soldiers at home. */
  troops: Record<UnitId, number>;
  /** Training batches; only the first is in progress. */
  recruitQueue: RecruitBatch[];
  /** The 15×15 map and its bandit camps. */
  map: WorldMap;
  /** Armies out on the map (going or coming back). */
  marches: March[];
  /** Battle results, newest first. */
  reports: BattleReport[];
  /** Time of the latest daily reset already queued (the app queues them from the device clock). */
  resetsScheduledUntil: number;
  /** Local date of the last reset that ran, e.g. "2026-11-22" ('' before the first). */
  dayKey: string;
  /** How many daily resets have run. */
  resetsDone: number;
  /** When the camps last respawned (0 before the first reset). Scouting intel counts from here. */
  lastResetAt: number;
  /** Bandit raids on their way to the village (seen or not yet spotted). */
  raids: Raid[];
  /** Craft tier per unit, per track (Smithy research). */
  smithy: SmithyState;
  /** Smithy research in progress. */
  researchQueue: ResearchJob[];
  /** Higher-tier ore in store (copper ore is `resources.ore`; `ores.copper` stays 0). */
  ores: Record<MetalId, number>;
  /** Smelted ingots of every metal. */
  ingots: Record<MetalId, number>;
  /** Batches at the forge, in the order they'll finish. */
  smeltQueue: SmeltBatch[];
  /** Metal of each unit type's weapons and armour. */
  equipment: Equipment;
  /** Experience pool per unit type (veterancy). */
  veterancy: Veterancy;
}

export interface BuildJob {
  building: BuildingId;
  /** Level it becomes when done. */
  toLevel: number;
  startedAt: number;
  finishesAt: number;
  /** What was paid; refunded in full if cancelled. */
  paid: Record<ResourceId, number>;
  /** The queued 'build-complete' event. */
  eventId: number;
}

export interface RecruitBatch {
  unit: UnitId;
  count: number;
  /** How many have finished training and joined the army. */
  trained: number;
  /** Ms to train one, fixed when ordered. */
  perUnit: number;
  /** Price of one, for refunds. */
  paidEach: Record<ResourceId, number>;
  /** Ingots paid per soldier to arm them (refunded with them). Missing on batches from before v0.4.3. */
  ingotsEach?: Partial<Record<MetalId, number>>;
  /** When the soldier in training finishes (first batch only; 0 while waiting). */
  nextAt: number;
  /** The queued 'recruit-done' event (first batch only; 0 while waiting). */
  eventId: number;
}

export function newGame(seed: string, now: number): GameState {
  return {
    version: SAVE_VERSION,
    seed,
    time: now,
    rng: hashSeed(seed),
    nextEventId: 1,
    events: [],
    resources: { ...STARTING_RESOURCES },
    buildings: Object.fromEntries(BUILDINGS.map((b) => [b, BUILDING_DATA[b].start])) as Record<BuildingId, number>,
    buildQueue: [],
    troops: Object.fromEntries(UNITS.map((u) => [u, 0])) as Record<UnitId, number>,
    recruitQueue: [],
    map: generateMap(seed),
    marches: [],
    reports: [],
    resetsScheduledUntil: now,
    dayKey: '',
    resetsDone: 0,
    lastResetAt: 0,
    raids: [],
    smithy: newSmithy(),
    researchQueue: [],
    ores: noMetals(),
    ingots: noMetals(),
    smeltQueue: [],
    equipment: newEquipment(),
    veterancy: newVeterancy(),
  };
}
