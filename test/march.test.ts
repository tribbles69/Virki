import { describe, expect, it } from 'vitest';
import {
  advance,
  attackBlocker,
  carryCapacity,
  distanceFromVillage,
  fight,
  newGame,
  population,
  recallMarch,
  sendAttack,
  takeLoot,
  travelTime,
  troopCount,
  troopsAway,
  Rng,
  SAVE_VERSION,
  type GameState,
  type Troops,
} from '../src/sim';
import { migrateSave } from '../src/game/migrate';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 21, 12);

const army = (t: Partial<Troops>): Troops => ({ spear: 0, sword: 0, axe: 0, ...t });

/** A village with soldiers at home and camp 1 set to a known garrison. */
const game = (troops: Partial<Troops>, camp1: Partial<Troops> = { spear: 3 }): GameState => {
  const s = newGame('war', T0);
  Object.assign(s.buildings, { farm: 10 });
  s.troops = army(troops);
  s.map.camps[0].troops = army(camp1);
  return s;
};

const send = (s: GameState, troops: Partial<Troops>, campId = 1) => {
  const r = sendAttack(s, campId, troops);
  if (!r.ok) throw new Error(r.reason);
  return r;
};

describe('fight', () => {
  const rng = () => new Rng(1);

  it('the stronger side wins; winner loses (loser/winner)^1.5', () => {
    // 100 axes (4,000 attack) vs 100 spears (1,500 defence vs infantry).
    const r = fight(army({ axe: 100 }), army({ spear: 100 }), rng());
    expect(r.attackerWon).toBe(true);
    expect(r.defenderSurvivors.spear).toBe(0);
    const share = (r.defenceStrength / r.attackStrength) ** 1.5;
    expect(r.attackerLosses.axe).toBe(Math.round(100 * share));
    expect(r.attackerSurvivors.axe + r.attackerLosses.axe).toBe(100);
  });

  it('a weaker attack is wiped out and dents the defenders', () => {
    // 30 axes (1,200 attack, ±15%) vs 30 swords (1,500 defence): close, but the defenders hold.
    const r = fight(army({ axe: 30 }), army({ sword: 30 }), rng());
    expect(r.attackerWon).toBe(false);
    expect(r.attackerSurvivors.axe).toBe(0);
    expect(r.defenderLosses.sword).toBe(Math.round(30 * (r.attackStrength / r.defenceStrength) ** 1.5));
    expect(r.defenderLosses.sword).toBeGreaterThan(10);
  });

  it('a hopeless attack barely scratches them', () => {
    const r = fight(army({ spear: 10 }), army({ sword: 50 }), rng());
    expect(r.attackerWon).toBe(false);
    expect(r.defenderLosses.sword).toBe(0);
  });

  it('an empty camp is a free win', () => {
    const r = fight(army({ axe: 1 }), army({}), rng());
    expect(r.attackerWon).toBe(true);
    expect(r.attackerLosses.axe).toBe(0);
  });

  it('luck stays within ±15% and is repeatable from the seed', () => {
    const seen: number[] = [];
    const g = new Rng(99);
    for (let i = 0; i < 1_000; i++) seen.push(fight(army({ axe: 1 }), army({ spear: 1 }), g).luck);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(-0.15);
    expect(Math.max(...seen)).toBeLessThanOrEqual(0.15);
    expect(Math.min(...seen)).toBeLessThan(-0.13);
    expect(Math.max(...seen)).toBeGreaterThan(0.13);
    expect(fight(army({ axe: 5 }), army({ spear: 9 }), new Rng(5))).toEqual(fight(army({ axe: 5 }), army({ spear: 9 }), new Rng(5)));
  });
});

describe('loot', () => {
  it('splits evenly and passes unused room on', () => {
    expect(takeLoot({ wood: 1_000, stone: 1_000, ore: 1_000 }, 300)).toEqual({ wood: 100, stone: 100, ore: 100 });
    expect(takeLoot({ wood: 1_000, stone: 1_000, ore: 10 }, 300)).toEqual({ wood: 145, stone: 145, ore: 10 });
    expect(takeLoot({ wood: 50, stone: 20, ore: 0 }, 1_000)).toEqual({ wood: 50, stone: 20, ore: 0 });
    expect(takeLoot({ wood: 1_000, stone: 1_000, ore: 1_000 }, 0)).toEqual({ wood: 0, stone: 0, ore: 0 });
  });

  it('carry capacity comes from the unit table', () => {
    expect(carryCapacity(army({ spear: 2, sword: 1, axe: 3 }))).toBe(2 * 25 + 15 + 3 * 10);
  });
});

describe('marches', () => {
  it('soldiers leave home but still count against population', () => {
    const s0 = game({ axe: 10, spear: 5 });
    const { state: s1 } = send(s0, { axe: 4 });
    expect(s1.troops).toEqual(army({ axe: 6, spear: 5 }));
    expect(troopsAway(s1)).toEqual(army({ axe: 4 }));
    expect(population(s1)).toEqual(population(s0));
    expect(s1.marches[0].arriveAt).toBe(T0 + travelTime({ axe: 4 }, distanceFromVillage(s1.map.camps[0])));
  });

  it('wins, loots, walks home and unloads, all on time', () => {
    const s0 = game({ axe: 10 }); // 400 attack vs 3 spears (45 defence)
    const { state: s1 } = send(s0, { axe: 10 });
    const m = s1.marches[0];
    const camp0 = s1.map.camps[0];

    const arrived = advance(s1, m.arriveAt);
    const rep = arrived.reports[0];
    expect(rep.won).toBe(true);
    expect(rep.campName).toBe(camp0.name);
    expect(arrived.map.camps[0].troops.spear).toBe(0);
    const back = arrived.marches[0];
    expect(back.phase).toBe('returning');
    expect(back.returnAt).toBe(m.arriveAt + travelTime(back.troops, distanceFromVillage(camp0)));
    const carried = rep.loot.wood + rep.loot.stone + rep.loot.ore;
    expect(carried).toBe(Math.min(carryCapacity(back.troops), camp0.loot.wood + camp0.loot.stone + camp0.loot.ore));
    expect(arrived.map.camps[0].loot.wood).toBe(camp0.loot.wood - rep.loot.wood);

    const before = advance(s1, back.returnAt - 1);
    const home = advance(s1, back.returnAt);
    expect(home.marches).toEqual([]);
    expect(home.troops.axe).toBe(10 - rep.lost.axe);
    expect(home.resources.wood - before.resources.wood).toBeCloseTo(rep.loot.wood, 0);
  });

  it('a lost battle sends nobody home and leaves a report', () => {
    const s = game({ spear: 5 }, { sword: 40 });
    const { state } = send(s, { spear: 5 });
    const out = advance(state, state.marches[0].arriveAt);
    expect(out.marches).toEqual([]);
    expect(out.reports[0].won).toBe(false);
    expect(out.reports[0].lost.spear).toBe(5);
    expect(troopCount(out.troops)).toBe(0);
    expect(population(out).troops).toBe(0);
  });

  it('a second attack on an emptied camp finds what loot is left', () => {
    let s = game({ axe: 20 });
    s = send(s, { axe: 10 }).state;
    s = send(s, { axe: 10 }).state;
    const out = advance(s, s.marches[1].arriveAt);
    expect(out.reports).toHaveLength(2);
    expect(out.reports.every((r) => r.won)).toBe(true);
    expect(out.reports[0].lost.axe).toBe(0); // nobody left to fight
  });

  it('recall turns an army round; it is home after the same time again', () => {
    const { state: s1 } = send(game({ spear: 3 }), { spear: 3 });
    const mid = advance(s1, T0 + 10 * MIN);
    const r = recallMarch(mid, mid.marches[0].id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.marches[0]).toMatchObject({ phase: 'returning', recalled: true, returnAt: T0 + 20 * MIN });
    expect(recallMarch(r.state, mid.marches[0].id).ok).toBe(false);
    const home = advance(r.state, T0 + 20 * MIN);
    expect(home.troops.spear).toBe(3);
    expect(home.reports).toEqual([]);
  });

  it('refuses silly orders', () => {
    const s = game({ axe: 2 });
    expect(attackBlocker(s, 1, {})).toBe('no-troops');
    expect(attackBlocker(s, 1, { axe: 3 })).toBe('not-enough');
    expect(attackBlocker(s, 1, { axe: 1.5 })).toBe('no-troops');
    expect(attackBlocker(s, 99, { axe: 1 })).toBe('no-camp');
    expect(attackBlocker(s, 1, { axe: 2 })).toBeUndefined();
  });

  it('a day away resolves battles exactly as if watched live', () => {
    let s = game({ axe: 30, spear: 30 }, { spear: 6, axe: 2 });
    s = send(s, { axe: 15 }, 1).state;
    s = send(s, { axe: 15, spear: 10 }, 2).state;
    s = send(s, { spear: 20 }, 3).state;
    const end = T0 + 24 * 60 * MIN;
    const once = advance(s, end);
    let stepped = s;
    for (let t = T0 + 3 * MIN; t < end; t += 3 * MIN) stepped = advance(stepped, t);
    stepped = advance(stepped, end);
    expect(stepped.reports).toEqual(once.reports);
    expect(stepped.troops).toEqual(once.troops);
    expect(stepped.map.camps).toEqual(once.map.camps);
    for (const r of ['wood', 'stone', 'ore'] as const) expect(stepped.resources[r]).toBeCloseTo(once.resources[r], 6);
  });

  it('keeps at most 50 reports, newest first', () => {
    let s = game({ axe: 60 });
    for (let i = 0; i < 55; i++) s = send(s, { axe: 1 }).state;
    const out = advance(s, T0 + 24 * 60 * MIN);
    expect(out.reports).toHaveLength(50);
    expect(out.reports[0].at).toBeGreaterThanOrEqual(out.reports[49].at);
  });
});

describe('save upgrade v3 → v4', () => {
  it('adds empty marches and reports', () => {
    const v3 = JSON.parse(JSON.stringify(newGame('old', T0)));
    v3.version = 3;
    delete v3.marches;
    delete v3.reports;
    const s = migrateSave(v3);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.marches).toEqual([]);
    expect(s.reports).toEqual([]);
  });

  it('a save with an army on the march reloads and finishes the same', () => {
    const { state } = send(game({ axe: 10 }), { axe: 10 });
    const mid = advance(state, T0 + MIN);
    const reloaded = migrateSave(JSON.parse(JSON.stringify(mid)));
    expect(advance(reloaded, T0 + 300 * MIN)).toEqual(advance(mid, T0 + 300 * MIN));
  });
});

describe('welcome-back summary with armies', () => {
  it('counts battles, and returning soldiers are not "trained"', async () => {
    const { summarise } = await import('../src/game/summary');
    const { state } = send(game({ axe: 10 }), { axe: 10 });
    const after = advance(state, T0 + 300 * MIN);
    const out = summarise(state, after);
    expect(out.battles).toEqual({ won: 1, lost: 0 });
    expect(out.trained).toEqual([]);
    expect(after.troops.axe).toBeGreaterThan(0);
  });
});
