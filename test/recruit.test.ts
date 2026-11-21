import { describe, expect, it } from 'vitest';
import {
  advance,
  batchEndTimes,
  cancelRecruit,
  newGame,
  population,
  recruit,
  recruitBlocker,
  recruitBlockerText,
  recruitInfo,
  trainTime,
  SAVE_VERSION,
  UNIT_DATA,
  type GameState,
  noTroops,
} from '../src/sim';
import { migrateSave } from '../src/game/migrate';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 10, 20, 12);

const game = (levels: Partial<GameState['buildings']> = {}): GameState => {
  const s = newGame('army', T0);
  Object.assign(s.buildings, { hall: 3, barracks: 3, farm: 10, warehouse: 10 }, levels);
  s.resources = { wood: 10_000, stone: 10_000, ore: 10_000 };
  return s;
};

const order = (s: GameState, unit: Parameters<typeof recruit>[1], n: number) => {
  const r = recruit(s, unit, n);
  if (!r.ok) throw new Error(`could not recruit: ${r.reason}`);
  return r.state;
};

describe('recruiting', () => {
  it('a spearman takes 15 minutes at Barracks 1, faster with a bigger Barracks', () => {
    expect(trainTime('spear', 1)).toBe(15 * MIN);
    expect(trainTime('spear', 10)).toBeLessThan(trainTime('spear', 9));
    expect(trainTime('spear', 60)).toBeGreaterThanOrEqual(1_000);
  });

  it('pays for the whole batch up front and reserves population', () => {
    const s0 = game({ barracks: 1 });
    const s1 = order(s0, 'spear', 10);
    expect(s1.resources).toEqual({ wood: 10_000 - 500, stone: 10_000 - 300, ore: 10_000 - 100 });
    expect(population(s1).troops).toBe(10);
    expect(population(s1).used).toBe(population(s0).used + 10);
    expect(s0.recruitQueue).toEqual([]);
  });

  it('soldiers join one at a time as each finishes', () => {
    const s = order(game({ barracks: 1 }), 'spear', 3);
    expect(advance(s, T0 + 15 * MIN - 1).troops.spear).toBe(0);
    expect(advance(s, T0 + 15 * MIN).troops.spear).toBe(1);
    expect(advance(s, T0 + 30 * MIN).troops.spear).toBe(2);
    const done = advance(s, T0 + 45 * MIN);
    expect(done.troops.spear).toBe(3);
    expect(done.recruitQueue).toEqual([]);
    expect(done.events).toEqual([]);
    expect(population(done).troops).toBe(3); // still counted once home
  });

  it('batches train in order, the next starting when the last soldier is done', () => {
    let s = order(game({ barracks: 3 }), 'spear', 2);
    s = order(s, 'axe', 2);
    const sp = trainTime('spear', 3);
    const ax = trainTime('axe', 3);
    expect(batchEndTimes(s)).toEqual([T0 + 2 * sp, T0 + 2 * sp + 2 * ax]);
    const mid = advance(s, T0 + 2 * sp + ax);
    expect(mid.troops).toMatchObject({ spear: 2, axe: 1 });
    expect(advance(s, T0 + 2 * sp + 2 * ax).troops).toMatchObject({ spear: 2, axe: 2 });
  });

  it('a day away gives the same army as checking in often', () => {
    let s = order(game({ barracks: 2 }), 'spear', 40);
    s = order(s, 'sword', 25);
    const end = T0 + 24 * HOUR;
    const once = advance(s, end);
    let stepped = s;
    for (let t = T0 + 7 * MIN; t < end; t += 7 * MIN) stepped = advance(stepped, t);
    stepped = advance(stepped, end);
    expect(stepped.troops).toEqual(once.troops);
    expect(stepped.recruitQueue).toEqual(once.recruitQueue);
    expect(stepped.events).toEqual(once.events);
  });

  it('cancelling refunds untrained soldiers and keeps the trained ones', () => {
    const s = order(game({ barracks: 1 }), 'spear', 4);
    const mid = advance(s, T0 + 31 * MIN); // 2 trained
    const c = cancelRecruit(mid, 0);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.state.troops.spear).toBe(2);
    expect(c.state.recruitQueue).toEqual([]);
    expect(c.state.events).toEqual([]);
    expect(c.state.resources.wood).toBeCloseTo(mid.resources.wood + 2 * 50);
    expect(advance(c.state, T0 + 3 * HOUR).troops.spear).toBe(2);
  });

  it('cancelling the batch in progress starts the next one straight away', () => {
    let s = order(game({ barracks: 3 }), 'spear', 5);
    s = order(s, 'axe', 1);
    const c = cancelRecruit(advance(s, T0 + MIN), 0);
    if (!c.ok) throw new Error();
    expect(c.state.recruitQueue).toHaveLength(1);
    expect(c.state.recruitQueue[0].nextAt).toBe(T0 + MIN + trainTime('axe', 3));
    expect(advance(c.state, T0 + MIN + trainTime('axe', 3)).troops.axe).toBe(1);
  });

  it('cancelling a waiting batch leaves the one in progress alone', () => {
    let s = order(game(), 'spear', 2);
    s = order(s, 'sword', 3);
    const c = cancelRecruit(s, 1);
    if (!c.ok) throw new Error();
    expect(c.state.recruitQueue).toHaveLength(1);
    expect(c.state.recruitQueue[0]).toEqual(s.recruitQueue[0]);
    expect(c.state.resources.ore).toBe(s.resources.ore + 3 * UNIT_DATA.sword.cost.ore);
    expect(cancelRecruit(s, 5).ok).toBe(false);
  });

  it('explains why it cannot recruit', () => {
    const noBarracks = game({ barracks: 0 });
    expect(recruitBlocker(noBarracks, 'spear', 1)).toBe('locked');
    expect(recruitBlockerText(noBarracks, 'spear', 'locked')).toBe('Needs Barracks level 1');
    expect(recruitBlocker(game({ barracks: 2 }), 'axe', 1)).toBe('locked');
    expect(recruitBlockerText(game({ barracks: 2 }), 'axe', 'locked')).toBe('Needs Barracks level 3');
    expect(recruitBlocker(game(), 'spear', 0)).toBe('bad-count');
    expect(recruitBlocker(game(), 'spear', 2.5)).toBe('bad-count');
    expect(recruitBlocker(game({ farm: 1 }), 'spear', 500)).toBe('population');
    const poor = game();
    poor.resources = { wood: 99, stone: 1_000, ore: 1_000 };
    expect(recruitBlocker(poor, 'spear', 2)).toBe('resources');
    let full = game();
    for (let i = 0; i < 5; i++) full = order(full, 'spear', 1);
    expect(recruitBlocker(full, 'spear', 1)).toBe('queue-full');
  });

  it('works out the most you can order', () => {
    const s = game();
    s.resources = { wood: 500, stone: 10_000, ore: 10_000 }; // wood allows 10 spearmen
    expect(recruitInfo(s, 'spear').max).toBe(10);
    s.buildings.farm = 1; // 240 people, ~70 used by buildings at these levels
    s.resources.wood = 100_000;
    expect(recruitInfo(s, 'spear').max).toBe(population(s).free);
    expect(recruitInfo(game({ barracks: 0 }), 'spear').max).toBe(0);
  });
});

describe('save upgrade from v1', () => {
  it('a v0.1 save loads with an empty army and keeps everything else', () => {
    const fresh = newGame('old', T0);
    fresh.buildings.woodcutter = 7;
    fresh.resources.wood = 812;
    const v1 = JSON.parse(JSON.stringify(fresh));
    v1.version = 1;
    delete v1.troops;
    delete v1.recruitQueue;
    delete v1.map;
    delete v1.buildings.barracks;

    const loaded = migrateSave(v1);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.map).toEqual(fresh.map);
    expect(loaded.troops).toEqual(noTroops());
    expect(loaded.recruitQueue).toEqual([]);
    expect(loaded.buildings.barracks).toBe(0);
    expect(loaded.buildings.woodcutter).toBe(7);
    expect(loaded.resources.wood).toBe(812);
  });
});

describe('welcome-back summary', () => {
  it('reports soldiers trained while away', async () => {
    const { summarise } = await import('../src/game/summary');
    const s = order(game({ barracks: 1 }), 'spear', 3);
    const out = summarise(s, advance(s, T0 + 31 * MIN));
    expect(out.trained).toEqual([{ unit: 'spear', count: 2, label: '2 Spearmen' }]);
  });
});
