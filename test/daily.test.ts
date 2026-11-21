import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  advance,
  campGarrison,
  distanceFromVillage,
  isWarlord,
  nextResetAt,
  newGame,
  scheduleResets,
  sendAttack,
  terrainAt,
  troopCount,
  CAMP_COUNT,
  SAVE_VERSION,
  WARLORD_ID,
  WARLORD_MIN_DISTANCE,
  type GameState,
  type ResetTime,
} from '../src/sim';
import { catchUp, Game } from '../src/game/game';
import { localDayKey, localResets } from '../src/game/clock';
import { SaveStore } from '../src/game/db';
import { migrateSave } from '../src/game/migrate';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** 21 Nov 2026, 12:00 local. */
const T0 = new Date(2026, 10, 21, 12, 0, 0).getTime();

/** Resets at a fixed 24 h spacing for sim tests (the app's real ones come from localResets). */
const resets = (from: number, days: number): ResetTime[] =>
  Array.from({ length: days }, (_, i) => ({ at: from + (i + 1) * DAY - 8 * HOUR, dayKey: `2026-11-${22 + i}` }));

const withResets = (s: GameState, days: number) => scheduleResets(s, resets(s.time, days));

describe('local 04:00 resets (device clock)', () => {
  it('lists every 04:00 after a moment, all at 04:00 local, a day apart', () => {
    const list = localResets(T0, T0 + 3 * DAY);
    expect(list).toHaveLength(3);
    expect(list[0].dayKey).toBe('2026-11-22');
    for (const r of list) {
      const d = new Date(r.at);
      expect([d.getHours(), d.getMinutes()]).toEqual([4, 0]);
      expect(localDayKey(d)).toBe(r.dayKey);
    }
  });

  it('includes a reset exactly at the end, excludes one exactly at the start', () => {
    const four = new Date(2026, 10, 22, 4).getTime();
    expect(localResets(four, four + DAY).map((r) => r.dayKey)).toEqual(['2026-11-23']);
    expect(localResets(four - 1, four).map((r) => r.dayKey)).toEqual(['2026-11-22']);
  });

  it('stays on 04:00 local through a whole year, daylight saving included', () => {
    const year = localResets(new Date(2026, 0, 1).getTime(), new Date(2027, 0, 1).getTime());
    expect(year).toHaveLength(365);
    for (const r of year) expect(new Date(r.at).getHours()).toBe(4);
    expect(new Set(year.map((r) => r.dayKey)).size).toBe(365);
  });
});

describe('scheduling resets', () => {
  it('queues each reset once, however often it is asked', () => {
    const s0 = newGame('d', T0);
    const s1 = withResets(s0, 2);
    expect(s1.events.filter((e) => e.type === 'daily-reset')).toHaveLength(2);
    expect(withResets(s1, 2)).toBe(s1);
    expect(nextResetAt(s1)).toBe(resets(T0, 1)[0].at);
    expect(s0.events).toEqual([]);
  });
});

describe('the reset', () => {
  it('refills camps that were cleared and puts a Warlord on the map', () => {
    let s = newGame('reset', T0);
    s.buildings.farm = 10;
    s.troops = { spear: 0, sword: 0, axe: 50 };
    const r = sendAttack(s, 1, { axe: 50 });
    if (!r.ok) throw new Error(r.reason);
    s = advance(r.state, T0 + 2 * HOUR);
    expect(troopCount(s.map.camps[0].troops)).toBe(0);

    s = advance(withResets(s, 1), T0 + DAY);
    expect(s.resetsDone).toBe(1);
    expect(s.dayKey).toBe('2026-11-22');
    expect(troopCount(s.map.camps[0].troops)).toBeGreaterThan(0);
    expect(s.map.camps[0].loot.wood).toBeGreaterThan(0);
    expect(s.map.camps).toHaveLength(CAMP_COUNT + 1);
    const w = s.map.camps.find(isWarlord)!;
    expect(w.kind).toBe('warlord');
    expect(w.tier).toBe(9);
    expect(troopCount(w.troops)).toBeGreaterThan(troopCount(s.map.camps[7].troops));
  });

  it('the same day always rolls the same; different days differ', () => {
    const a = advance(withResets(newGame('same', T0), 1), T0 + DAY);
    const b = advance(withResets(newGame('same', T0), 1), T0 + DAY);
    expect(a.map).toEqual(b.map);
    const c = advance(withResets(newGame('same', T0), 2), T0 + 2 * DAY);
    expect(c.map.camps.find(isWarlord)).not.toEqual(a.map.camps.find(isWarlord));
  });

  it('only ever one Warlord, on open ground, away from home and other camps (many seeds and days)', () => {
    for (let i = 0; i < 60; i++) {
      const s = advance(withResets(newGame(`w${i}`, T0), 5), T0 + 6 * DAY);
      const warlords = s.map.camps.filter(isWarlord);
      expect(warlords).toHaveLength(1);
      const w = warlords[0];
      expect(w.id).toBe(WARLORD_ID);
      expect(terrainAt(s.map, w.x, w.y)).toBe('.');
      expect(distanceFromVillage(w)).toBeGreaterThanOrEqual(WARLORD_MIN_DISTANCE);
      for (const c of s.map.camps) if (c !== w) expect(Math.max(Math.abs(c.x - w.x), Math.abs(c.y - w.y))).toBeGreaterThanOrEqual(2);
    }
  });

  it('camps grow with your whole army, including soldiers out marching', () => {
    const weak = advance(withResets(newGame('band', T0), 1), T0 + DAY);
    let strong = newGame('band', T0);
    strong.buildings.farm = 15;
    strong.troops = { spear: 0, sword: 0, axe: 100 }; // 4,000 attack
    const r = sendAttack(strong, 8, { axe: 60 });
    if (!r.ok) throw new Error();
    strong = advance(withResets(r.state, 1), T0 + DAY);
    const spears = (s: GameState) => s.map.camps[0].troops.spear;
    expect(spears(strong)).toBeGreaterThan(spears(weak));
    expect(spears(weak)).toBeLessThanOrEqual(Math.round(campGarrison(1, 0).spear * 1.1));
  });

  it('a week away runs seven resets', () => {
    const s = advance(withResets(newGame('week', T0), 7), T0 + 7 * DAY + HOUR);
    expect(s.resetsDone).toBe(7);
    expect(s.dayKey).toBe('2026-11-28');
  });
});

describe('the app layer', () => {
  it('catchUp queues resets from the device clock, including the next one ahead', () => {
    const s = catchUp(newGame('app', T0), T0 + 3 * DAY);
    expect(s.resetsDone).toBe(3);
    const next = nextResetAt(s)!;
    expect(next).toBeGreaterThan(T0 + 3 * DAY);
    expect(new Date(next).getHours()).toBe(4);
  });

  it('reopening after three days catches up three resets and says so', async () => {
    const store = new SaveStore(new IDBFactory());
    const clock = { t: T0 };
    await Game.start(store, () => clock.t, () => 'reopen');
    clock.t = T0 + 3 * DAY;
    const r = await Game.start(store, () => clock.t, () => 'unused');
    expect(r.game.state.resetsDone).toBe(3);
    expect(r.summary?.resets).toBe(3);
    expect(r.summary?.warlord).toBe(r.game.state.map.camps.find(isWarlord)!.name);
  });
});

describe('save upgrade v4 → v5', () => {
  it('counts resets from the last save, so missed 04:00s are caught up on load', () => {
    const v4 = JSON.parse(JSON.stringify(newGame('old', T0)));
    v4.version = 4;
    delete v4.resetsScheduledUntil;
    delete v4.dayKey;
    delete v4.resetsDone;
    const s = migrateSave(v4);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.resetsScheduledUntil).toBe(T0);
    expect(catchUp(s, T0 + 2 * DAY).resetsDone).toBe(2);
  });

  it('a save with a Warlord on the map reloads', () => {
    const s = catchUp(newGame('wl', T0), T0 + DAY);
    expect(migrateSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
