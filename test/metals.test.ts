import { describe, expect, it } from 'vitest';
import {
  advance,
  cancelLastSmelt,
  maxSmeltable,
  newGame,
  orePerHour,
  oreStock,
  productionPerHour,
  smelt,
  smeltBlocker,
  smeltBlockerText,
  smeltTimePerIngot,
  storageCap,
  unlockedMetals,
  METALS,
  METAL_DATA,
  SAVE_VERSION,
  type GameState,
} from '../src/sim';
import { migrateSave } from '../src/game/migrate';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 10, 22, 12);

const village = (levels: Partial<GameState['buildings']> = {}): GameState => {
  const s = newGame('metal', T0);
  Object.assign(s.buildings, { smithy: 1, warehouse: 20 }, levels);
  s.resources = { wood: 10_000, stone: 10_000, ore: 10_000 };
  return s;
};

const forge = (s: GameState, m: Parameters<typeof smelt>[1], n: number) => {
  const r = smelt(s, m, n);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe('metal tiers', () => {
  it('nine metals unlocked by Mine level, copper to Starmetal', () => {
    expect(METALS).toHaveLength(9);
    expect(METAL_DATA.starmetal.gear).toBeCloseTo(3.05);
    expect(unlockedMetals(village({ mine: 1 }))).toEqual(['copper']);
    expect(unlockedMetals(village({ mine: 10 }))).toEqual(['copper', 'bronze']);
    expect(unlockedMetals(village({ mine: 35 }))).toEqual(['copper', 'bronze', 'iron', 'steel']);
    expect(unlockedMetals(village({ mine: 100 }))).toHaveLength(9);
  });

  it('each higher ore is mined more slowly than the one below', () => {
    const s = village({ mine: 100 });
    let prev = Infinity;
    for (const m of METALS) {
      expect(orePerHour(s, m)).toBeLessThan(prev);
      prev = orePerHour(s, m);
    }
    expect(orePerHour(s, 'copper')).toBe(productionPerHour(s, 'ore'));
    expect(orePerHour(village({ mine: 9 }), 'bronze')).toBe(0);
  });

  it('bronze ore piles up once the Mine reaches 10, capped by the Warehouse', () => {
    const before = advance(village({ mine: 9 }), T0 + 10 * HOUR);
    expect(before.ores.bronze).toBe(0);
    const s = village({ mine: 10 });
    const out = advance(s, T0 + 10 * HOUR);
    expect(out.ores.bronze).toBeCloseTo(orePerHour(s, 'bronze') * 10);
    const long = advance(s, T0 + 10_000 * HOUR);
    expect(long.ores.bronze).toBe(storageCap(s));
  });

  it('a week of mining in one go equals hourly check-ins', () => {
    const s = village({ mine: 36, warehouse: 30 });
    const end = T0 + 7 * 24 * HOUR;
    const once = advance(s, end);
    let stepped = s;
    for (let t = T0 + HOUR; t <= end; t += HOUR) stepped = advance(stepped, t);
    for (const m of ['bronze', 'iron', 'steel'] as const) expect(stepped.ores[m]).toBeCloseTo(once.ores[m], 6);
  });
});

describe('smelting', () => {
  it('costs 4 ore and some wood per ingot; the batch is ready all at once', () => {
    const s0 = village();
    const s1 = forge(s0, 'copper', 10);
    expect(s1.resources.ore).toBe(10_000 - 40);
    expect(s1.resources.wood).toBe(10_000 - 20);
    const per = smeltTimePerIngot('copper', 1);
    expect(per).toBe(MIN);
    expect(advance(s1, T0 + 10 * per - 1).ingots.copper).toBe(0);
    const done = advance(s1, T0 + 10 * per);
    expect(done.ingots.copper).toBe(10);
    expect(done.smeltQueue).toEqual([]);
  });

  it('higher metals use their own ore, more fuel and more time', () => {
    const s = village({ mine: 20 });
    s.ores.iron = 100;
    const out = forge(s, 'iron', 5);
    expect(out.ores.iron).toBe(80);
    expect(out.resources.ore).toBe(10_000);
    expect(out.resources.wood).toBe(10_000 - 5 * METAL_DATA.iron.fuel);
    expect(smeltTimePerIngot('iron', 1)).toBeGreaterThan(smeltTimePerIngot('copper', 1));
    expect(oreStock(out, 'iron')).toBe(80);
  });

  it('batches run one after another; up to three queued', () => {
    let s = village();
    s = forge(s, 'copper', 2);
    s = forge(s, 'copper', 3);
    expect(s.smeltQueue[1].startedAt).toBe(s.smeltQueue[0].finishesAt);
    s = forge(s, 'copper', 1);
    expect(smeltBlocker(s, 'copper', 1)).toBe('queue-full');
    expect(advance(s, s.smeltQueue[2].finishesAt).ingots.copper).toBe(6);
  });

  it('says why it can’t smelt', () => {
    expect(smeltBlocker(village({ smithy: 0 }), 'copper', 1)).toBe('no-smithy');
    expect(smeltBlocker(village({ mine: 5 }), 'bronze', 1)).toBe('locked');
    expect(smeltBlockerText('bronze', 'locked')).toBe('Bronze needs Mine level 10');
    const poor = village({ mine: 10 });
    expect(smeltBlocker(poor, 'bronze', 1)).toBe('ore');
    expect(smeltBlockerText('bronze', 'ore')).toBe('Not enough bronze ore');
    poor.resources.wood = 1;
    expect(smeltBlocker(poor, 'copper', 1)).toBe('fuel');
    expect(smeltBlocker(village(), 'copper', 0)).toBe('bad-count');
  });

  it('Max is limited by ore and by fuel', () => {
    const s = village();
    s.resources = { wood: 100, stone: 0, ore: 1_000 }; // fuel: 50 ingots; ore: 250
    expect(maxSmeltable(s, 'copper')).toBe(50);
    s.resources.wood = 10_000;
    expect(maxSmeltable(s, 'copper')).toBe(250);
    expect(maxSmeltable(s, 'bronze')).toBe(0);
  });

  it('cancelling the last batch refunds ore and wood', () => {
    const s0 = village({ mine: 10 });
    s0.ores.bronze = 50;
    const s1 = forge(s0, 'bronze', 10);
    const c = cancelLastSmelt(s1);
    if (!c.ok) throw new Error();
    expect(c.state.ores.bronze).toBe(50);
    expect(c.state.resources).toEqual(s0.resources);
    expect(c.state.events).toEqual([]);
  });
});

describe('save upgrade v8 → v9', () => {
  it('starts with no higher ore or ingots; a busy forge survives a reload', () => {
    const v8 = JSON.parse(JSON.stringify(newGame('old', T0)));
    v8.version = 8;
    delete v8.ores;
    delete v8.ingots;
    delete v8.smeltQueue;
    const s = migrateSave(v8);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.ingots.starmetal).toBe(0);
    expect(s.smeltQueue).toEqual([]);
    const busy = advance(forge(village(), 'copper', 5), T0 + MIN);
    expect(migrateSave(JSON.parse(JSON.stringify(busy)))).toEqual(busy);
  });
});

describe('welcome back', () => {
  it('mentions ingots smelted while away', async () => {
    const { summarise } = await import('../src/game/summary');
    const s = forge(village(), 'copper', 7);
    expect(summarise(s, advance(s, T0 + HOUR)).smelted).toEqual(['7 Copper']);
  });
});
