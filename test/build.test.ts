import { describe, expect, it } from 'vitest';
import {
  advance,
  allUpgrades,
  blockerText,
  buildCost,
  buildTime,
  cancelLastUpgrade,
  newGame,
  population,
  productionPerHour,
  startUpgrade,
  storageCap,
  upgradeInfo,
  BUILDINGS,
  BUILDING_DATA,
  type GameState,
} from '../src/sim';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 10, 20, 12);

const game = (levels: Partial<GameState['buildings']> = {}): GameState => {
  const s = newGame('build', T0);
  Object.assign(s.buildings, levels);
  return s;
};

const start = (s: GameState, b: Parameters<typeof startUpgrade>[1]) => {
  const r = startUpgrade(s, b);
  if (!r.ok) throw new Error(`could not start ${b}: ${r.reason}`);
  return r.state;
};

describe('costs and times', () => {
  it('level costs follow the table and grow 26% a level early on', () => {
    expect(buildCost('hall', 1)).toEqual({ wood: 90, stone: 80, ore: 70 });
    expect(buildCost('hall', 2)).toEqual({ wood: 113, stone: 101, ore: 88 });
    expect(buildCost('woodcutter', 10).wood).toBe(Math.round(50 * 1.26 ** 9));
  });

  it('level 2 woodcutter takes 6 minutes; a bigger Great Hall builds faster', () => {
    expect(buildTime('woodcutter', 2, 1)).toBe(6 * MIN);
    expect(buildTime('woodcutter', 2, 10)).toBeLessThan(buildTime('woodcutter', 2, 1));
    expect(buildTime('woodcutter', 20, 20)).toBeLessThan(buildTime('woodcutter', 20, 19));
  });

  it('every level of every building fits in a Warehouse one level lower', () => {
    for (const b of BUILDINGS) {
      for (let L = 2; L <= BUILDING_DATA[b].max; L++) {
        const cap = storageCap(game({ warehouse: L - 1 }));
        const cost = buildCost(b, L);
        expect(Math.max(cost.wood, cost.stone, cost.ore), `${b} L${L}`).toBeLessThanOrEqual(cap);
      }
    }
  });
});

describe('building', () => {
  it('pays up front, finishes on time, and the level goes up', () => {
    const s0 = game();
    const s1 = start(s0, 'woodcutter');
    expect(s1.resources.wood).toBe(s0.resources.wood - 63);
    expect(s1.buildQueue).toHaveLength(1);
    expect(s1.buildQueue[0]).toMatchObject({ building: 'woodcutter', toLevel: 2, finishesAt: T0 + 6 * MIN });
    expect(s0.buildQueue).toHaveLength(0); // input untouched

    const almost = advance(s1, T0 + 6 * MIN - 1);
    expect(almost.buildings.woodcutter).toBe(1);
    const done = advance(s1, T0 + 6 * MIN);
    expect(done.buildings.woodcutter).toBe(2);
    expect(done.buildQueue).toHaveLength(0);
    expect(done.events).toHaveLength(0);
  });

  it('production speeds up at the exact moment a build lands, even during catch-up', () => {
    const s = start(game(), 'woodcutter'); // done at +6 min, then 30/h → 35/h
    const later = advance(s, T0 + 6 * MIN + 2 * HOUR);
    const expected = s.resources.wood + 30 * (6 / 60) + 2 * productionPerHour(later, 'wood');
    expect(later.resources.wood).toBeCloseTo(expected, 6);

    let stepped = s;
    for (let t = T0 + MIN; t <= T0 + 6 * MIN + 2 * HOUR; t += 7 * MIN) stepped = advance(stepped, t);
    stepped = advance(stepped, T0 + 6 * MIN + 2 * HOUR);
    const { resources: a, ...restStepped } = stepped;
    const { resources: b, ...restOnce } = later;
    expect(restStepped).toEqual(restOnce);
    for (const r of ['wood', 'stone', 'ore'] as const) expect(a[r]).toBeCloseTo(b[r], 6);
  });

  it('allows one build at a time', () => {
    const s = start(game(), 'quarry');
    const info = upgradeInfo(s, 'mine');
    expect(info.blocker).toBe('queue-full');
    expect(blockerText(info)).toBe('Builders are busy');
    expect(startUpgrade(s, 'mine')).toEqual({ ok: false, reason: 'queue-full' });
    const after = advance(s, s.buildQueue[0].finishesAt);
    expect(startUpgrade(after, 'mine').ok).toBe(true);
  });

  it('says how long until you can afford it', () => {
    const s = game({ hall: 5 });
    s.resources = { wood: 0, stone: 1_000, ore: 1_000 };
    const info = upgradeInfo(s, 'hall');
    expect(info.blocker).toBe('resources');
    expect(info.wait).toBe(Math.ceil((buildCost('hall', 6).wood / 30) * HOUR));
    expect(startUpgrade(s, 'hall')).toEqual({ ok: false, reason: 'resources' });
  });

  it('needs free population, except for Farm and Warehouse', () => {
    const s = game({ farm: 1, mine: 20 });
    expect(population(s).free).toBeLessThan(upgradeInfo(s, 'mine').popNeeded);
    expect(upgradeInfo(s, 'mine').blocker).toBe('population');
    expect(blockerText(upgradeInfo(s, 'mine'))).toMatch(/Farm/);
    expect(upgradeInfo(s, 'farm').popNeeded).toBe(0);
    expect(upgradeInfo(s, 'warehouse').popNeeded).toBe(0);
  });

  it('reserves population for a level while it is being built', () => {
    const s0 = game();
    const s1 = start(s0, 'quarry');
    expect(population(s1).used).toBe(population(s0).used + upgradeInfo(s0, 'quarry').popNeeded);
  });

  it('blocks a level the Warehouse could never hold', () => {
    const s = game({ hall: 40, farm: 40, warehouse: 1 });
    s.resources = { wood: 1_000, stone: 1_000, ore: 1_000 };
    expect(upgradeInfo(s, 'hall').blocker).toBe('storage');
  });

  it('stops at the top level', () => {
    const s = game({ quarry: 100, farm: 100 });
    expect(upgradeInfo(s, 'quarry').blocker).toBe('max-level');
    expect(blockerText(upgradeInfo(s, 'quarry'))).toBe('Fully upgraded');
  });

  it('cancelling refunds everything and frees the builders', () => {
    const s0 = game();
    const s1 = start(s0, 'hall');
    const c = cancelLastUpgrade(s1);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.state.resources).toEqual(s0.resources);
    expect(c.state.buildQueue).toEqual([]);
    expect(c.state.events).toEqual([]);
    expect(population(c.state)).toEqual(population(s0));
    expect(advance(c.state, T0 + HOUR).buildings.hall).toBe(1);
    expect(cancelLastUpgrade(c.state).ok).toBe(false);
  });

  it('a save mid-build reloads and finishes the same', () => {
    const s = advance(start(game(), 'farm'), T0 + MIN);
    const reloaded = JSON.parse(JSON.stringify(s)) as GameState;
    expect(advance(reloaded, T0 + HOUR)).toEqual(advance(s, T0 + HOUR));
    expect(advance(reloaded, T0 + HOUR).buildings.farm).toBe(2);
  });

  it('lists all six buildings for the UI, ready to build at the start', () => {
    const list = allUpgrades(game());
    expect(list.map((u) => u.name)).toEqual(['Great Hall', 'Woodcutter', 'Quarry', 'Farm', 'Mine', 'Warehouse']);
    expect(list.every((u) => u.blocker === undefined)).toBe(true);
  });
});
