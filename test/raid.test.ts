import { describe, expect, it } from 'vitest';
import {
  advance,
  fight,
  militia,
  newGame,
  raidSpottedAt,
  scheduleResets,
  visibleRaids,
  wallMultiplier,
  watchtowerWarning,
  Rng,
  SAVE_VERSION,
  type GameState,
  type Raid,
  type ResetTime,
  type Troops,
  noTroops,
} from '../src/sim';
import { migrateSave } from '../src/game/migrate';
import { summarise } from '../src/game/summary';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 10, 21, 12);

const army = (t: Partial<Troops>): Troops => ({ ...noTroops(), ...t }) as Troops;

/** A village with a Barracks, advanced through `days` resets (resets at T0 + n·DAY − 8 h). */
function village(levels: Partial<GameState['buildings']> = {}, seed = 'raid'): GameState {
  const s = newGame(seed, T0);
  Object.assign(s.buildings, { barracks: 1, farm: 10, warehouse: 10 }, levels);
  return s;
}
const resets = (days: number): ResetTime[] =>
  Array.from({ length: days }, (_, i) => ({ at: T0 + (i + 1) * DAY - 8 * HOUR, dayKey: `2026-11-${22 + i}` }));

/** Hand-place a raid arriving at `at`. */
function plantRaid(s: GameState, troops: Partial<Troops>, arriveAt: number, launchAt = s.time): GameState {
  const out = structuredClone(s);
  const id = out.nextEventId;
  const eventId = out.nextEventId++;
  out.events.push({ id: eventId, at: arriveAt, type: 'raid-arrive', payload: { raidId: id } });
  out.events.sort((a, b) => a.at - b.at || a.id - b.id);
  const raid: Raid = { id, campId: 1, campName: 'Test Den', campTier: 1, troops: army(troops), launchAt, arriveAt, eventId };
  out.raids.push(raid);
  return out;
}

describe('defence bonus', () => {
  it('the wall multiplies soldiers and militia', () => {
    const r = fight(army({ axe: 1 }), army({ spear: 10 }), new Rng(1), { multiplier: 2, base: 20 });
    expect(r.defenceStrength).toBe((150 + 20) * 2);
  });

  it('militia grows with the wall', () => {
    expect(militia(0)).toBe(20);
    expect(militia(10)).toBe(170);
  });
});

describe('rolling raids', () => {
  it('no raids before a Barracks exists', () => {
    const s = advance(scheduleResets(village({ barracks: 0 }), resets(10)), T0 + 10 * DAY);
    expect(s.reports.filter((r) => r.kind === 'raid')).toEqual([]);
    expect(s.raids).toEqual([]);
  });

  it('0–2 a day, set off within the day’s window, from raider camps only', () => {
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const s = scheduleResets(village({}, `r${i}`), resets(1));
      const after = advance(s, resets(1)[0].at);
      expect(after.raids.length).toBeLessThanOrEqual(2);
      total += after.raids.length;
      for (const r of after.raids) {
        expect(r.launchAt).toBeGreaterThanOrEqual(resets(1)[0].at + HOUR);
        expect(r.launchAt).toBeLessThanOrEqual(resets(1)[0].at + 22 * HOUR);
        expect(r.arriveAt).toBeGreaterThan(r.launchAt);
        expect(r.campTier).toBeLessThanOrEqual(8);
      }
    }
    expect(total).toBeGreaterThan(20); // about 0.9 a day on average
    expect(total).toBeLessThan(60);
  });

  it('the same day always brings the same raids', () => {
    const a = advance(scheduleResets(village(), resets(1)), resets(1)[0].at);
    const b = advance(scheduleResets(village(), resets(1)), resets(1)[0].at);
    expect(a.raids).toEqual(b.raids);
  });
});

describe('the Watchtower', () => {
  it('without one, a raid is only seen when it lands', () => {
    const s = plantRaid(village(), { spear: 5 }, T0 + 2 * HOUR);
    expect(visibleRaids(advance(s, T0 + 2 * HOUR - 1))).toEqual([]);
  });

  it('spots a raid its warning time ahead, but never before it sets off', () => {
    const s = plantRaid(village({ watchtower: 10 }), { spear: 5 }, T0 + 2 * HOUR, T0 + 30 * MIN);
    const warn = watchtowerWarning(10);
    expect(raidSpottedAt(s, s.raids[0])).toBe(T0 + 2 * HOUR - warn);
    expect(visibleRaids(advance(s, T0 + 2 * HOUR - warn - 1))).toEqual([]);
    expect(visibleRaids(advance(s, T0 + 2 * HOUR - warn))).toHaveLength(1);
    const big = plantRaid(village({ watchtower: 30 }), { spear: 5 }, T0 + 2 * HOUR, T0 + 30 * MIN);
    expect(raidSpottedAt(big, big.raids[0])).toBe(T0 + 30 * MIN);
  });
});

describe('a raid lands', () => {
  it('a strong garrison holds: bandits wiped out, nothing stolen', () => {
    const s = village({ wall: 5 });
    s.troops = army({ spear: 30 });
    const out = advance(plantRaid(s, { axe: 5 }, T0 + HOUR), T0 + HOUR);
    const r = out.reports[0];
    expect(r.kind).toBe('raid');
    expect(r.won).toBe(true);
    expect(r.lost.axe).toBe(5);
    expect(r.loot).toEqual({ wood: 0, stone: 0, ore: 0 });
    expect(out.raids).toEqual([]);
    expect(r.defenceStrength).toBe(Math.round((30 * 15 + militia(5)) * wallMultiplier(5)));
  });

  it('a weak village is robbed and its soldiers at home fall', () => {
    const s = village();
    s.troops = army({ spear: 2 });
    s.resources = { wood: 5_000, stone: 5_000, ore: 5_000 };
    const out = advance(plantRaid(s, { axe: 40 }, T0 + HOUR), T0 + HOUR);
    const r = out.reports[0];
    expect(r.won).toBe(false);
    expect(out.troops.spear).toBe(0);
    const stolen = r.loot.wood + r.loot.stone + r.loot.ore;
    expect(stolen).toBe(r.capacity);
    expect(out.resources.wood).toBeCloseTo(5_000 + 30 - r.loot.wood, 0);
  });

  it('the wall alone (militia) sees off a tiny raid', () => {
    const s = village({ wall: 10 });
    s.troops = army({});
    const out = advance(plantRaid(s, { spear: 3 }, T0 + HOUR), T0 + HOUR);
    expect(out.reports[0].won).toBe(true);
  });

  it('soldiers out marching do not defend', () => {
    const s = village();
    s.troops = army({});
    s.resources = { wood: 1_000, stone: 1_000, ore: 1_000 };
    const out = advance(plantRaid(s, { axe: 10 }, T0 + HOUR), T0 + HOUR);
    expect(out.reports[0].won).toBe(false);
  });

  it('a week away, raids included, matches frequent check-ins', () => {
    let s = village({ wall: 3 }, 'week');
    s.troops = army({ spear: 20, axe: 10 });
    s = scheduleResets(s, resets(7));
    const end = T0 + 7 * DAY;
    const once = advance(s, end);
    let stepped = s;
    for (let t = T0 + 13 * MIN; t < end; t += 13 * MIN) stepped = advance(stepped, t);
    stepped = advance(stepped, end);
    expect(stepped.reports).toEqual(once.reports);
    expect(stepped.troops).toEqual(once.troops);
    expect(once.reports.some((r) => r.kind === 'raid')).toBe(true);
  });

  it('welcome back counts raids separately from your attacks', () => {
    const s = village();
    s.troops = army({ spear: 50 });
    const before = plantRaid(s, { spear: 2 }, T0 + HOUR);
    const out = summarise(before, advance(before, T0 + 2 * HOUR));
    expect(out.raids).toEqual({ held: 1, lost: 0 });
    expect(out.battles).toEqual({ won: 0, lost: 0 });
  });
});

describe('save upgrade v5 → v6', () => {
  it('adds an empty raid list; a save with a raid on the way reloads', () => {
    const v5 = JSON.parse(JSON.stringify(newGame('old', T0)));
    v5.version = 5;
    delete v5.raids;
    const s = migrateSave(v5);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.raids).toEqual([]);
    const withRaid = plantRaid(village(), { axe: 3 }, T0 + HOUR);
    expect(migrateSave(JSON.parse(JSON.stringify(withRaid)))).toEqual(withRaid);
  });
});
