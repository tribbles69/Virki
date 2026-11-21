import { describe, expect, it } from 'vitest';
import {
  advance,
  canAfford,
  curveValue,
  newGame,
  population,
  productionPerHour,
  storageCap,
  timeUntilAffordable,
  BUILDINGS,
  STARTING_RESOURCES,
  type GameState,
} from '../src/sim';

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 10, 20, 12);

const game = (levels: Partial<GameState['buildings']> = {}): GameState => {
  const s = newGame('eco', T0);
  Object.assign(s.buildings, levels);
  return s;
};

describe('curves', () => {
  it('grows by each segment rate and slows down later', () => {
    const c = { base: 100, atZero: 7, segments: [{ upTo: 3, r: 2 }, { upTo: 10, r: 1.5 }] };
    expect(curveValue(c, 0)).toBe(7);
    expect(curveValue(c, 1)).toBe(100);
    expect(curveValue(c, 3)).toBe(400);
    expect(curveValue(c, 4)).toBe(600);
    expect(curveValue(c, 12)).toBeCloseTo(400 * 1.5 ** 9);
  });
});

describe('production', () => {
  it('matches the table: 30/h at L1, ~2,400/h at L30, ore at 80%', () => {
    const s = game({ woodcutter: 1, mine: 1 });
    expect(productionPerHour(s, 'wood')).toBe(30);
    expect(productionPerHour(s, 'ore')).toBe(24);
    expect(productionPerHour(game({ woodcutter: 30 }), 'wood')).toBeGreaterThan(2_300);
    expect(productionPerHour(game({ woodcutter: 30 }), 'wood')).toBeLessThan(2_500);
    expect(productionPerHour(game({ quarry: 0 }), 'stone')).toBe(5);
  });

  it('only ever increases with level', () => {
    let prev = -1;
    for (let L = 0; L <= 100; L++) {
      const rate = productionPerHour(game({ woodcutter: L }), 'wood');
      expect(rate).toBeGreaterThan(prev);
      prev = rate;
    }
  });

  it('fills the stockpile over time', () => {
    const out = advance(game(), T0 + 10 * HOUR);
    expect(out.resources.wood).toBeCloseTo(STARTING_RESOURCES.wood + 300);
    expect(out.resources.stone).toBeCloseTo(STARTING_RESOURCES.stone + 300);
    expect(out.resources.ore).toBeCloseTo(STARTING_RESOURCES.ore + 240);
  });

  it('stops at the warehouse cap', () => {
    const s = game();
    const cap = storageCap(s);
    expect(cap).toBe(1_000);
    const out = advance(s, T0 + 1_000 * HOUR);
    for (const r of ['wood', 'stone', 'ore'] as const) expect(out.resources[r]).toBe(cap);
  });

  it('keeps stock already above the cap (e.g. loot) without growing it', () => {
    const s = game();
    s.resources.wood = 5_000;
    expect(advance(s, T0 + 10 * HOUR).resources.wood).toBe(5_000);
  });

  it('a week away equals hourly check-ins, including hitting the cap', () => {
    const s = game({ woodcutter: 10, quarry: 5, mine: 3, warehouse: 8 });
    s.resources = { wood: 0, stone: 0, ore: 0 };
    const end = T0 + 7 * 24 * HOUR;
    const once = advance(s, end);
    let stepped = s;
    for (let t = T0 + HOUR; t <= end; t += HOUR) stepped = advance(stepped, t);
    for (const r of ['wood', 'stone', 'ore'] as const) expect(stepped.resources[r]).toBeCloseTo(once.resources[r], 6);
    expect(once.resources.wood).toBe(storageCap(s));
  });
});

describe('warehouse', () => {
  it('holds ~400k at L30 and keeps growing to L100', () => {
    expect(storageCap(game({ warehouse: 30 }))).toBeGreaterThan(380_000);
    expect(storageCap(game({ warehouse: 30 }))).toBeLessThan(420_000);
    expect(storageCap(game({ warehouse: 100 }))).toBeGreaterThan(storageCap(game({ warehouse: 99 })));
  });
});

describe('population', () => {
  it('starts with room to grow', () => {
    const p = population(game());
    expect(p.cap).toBe(240);
    expect(p.used).toBe(32); // hall 5 + woodcutter 5 + quarry 10 + mine 10 + hiding place 2
    expect(p.free).toBe(208);
  });

  it('a farm level matched to the other buildings always fits them, up to L100', () => {
    for (const L of [1, 10, 30, 60, 100]) {
      const levels = Object.fromEntries(BUILDINGS.map((b) => [b, L])) as GameState['buildings'];
      const p = population(game(levels));
      expect(p.free, `all buildings at L${L}`).toBeGreaterThan(p.cap * 0.5);
    }
  });
});

describe('affordability', () => {
  it('knows what you can pay for and how long until you can', () => {
    const s = game(); // 500 wood, 30/h
    expect(canAfford(s, { wood: 500 })).toBe(true);
    expect(canAfford(s, { wood: 501 })).toBe(false);
    expect(timeUntilAffordable(s, { wood: 500 })).toBe(0);
    expect(timeUntilAffordable(s, { wood: 530 })).toBe(HOUR);
    expect(timeUntilAffordable(s, { wood: 530, ore: 448 })).toBe(2 * HOUR); // ore 24/h, slower
    expect(timeUntilAffordable(s, { stone: 2_000 })).toBe(Infinity); // more than the warehouse holds
  });
});
