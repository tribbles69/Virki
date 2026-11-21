import { describe, expect, it } from 'vitest';
import {
  advance,
  averageXp,
  newGame,
  noTroops,
  playerGear,
  rankFor,
  recordBattle,
  recruit,
  sendAttack,
  unitRank,
  vetMult,
  xpForBattle,
  SAVE_VERSION,
  type GameState,
  type Troops,
} from '../src/sim';
import { migrateSave } from '../src/game/migrate';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 23, 12);
const army = (t: Partial<Troops>): Troops => ({ ...noTroops(), ...t }) as Troops;

const village = (): GameState => {
  const s = newGame('vet', T0);
  Object.assign(s.buildings, { barracks: 3, farm: 15, warehouse: 20 });
  s.resources = { wood: 50_000, stone: 50_000, ore: 50_000 };
  return s;
};

describe('ranks', () => {
  it('Recruit → Regular → Veteran → Elite → Legend, +0% to +25%', () => {
    expect(rankFor(0).name).toBe('Recruit');
    expect(rankFor(0.99).name).toBe('Recruit');
    expect(rankFor(1)).toMatchObject({ name: 'Regular', bonus: 0.06, next: 3 });
    expect(rankFor(3).name).toBe('Veteran');
    expect(rankFor(6).name).toBe('Elite');
    expect(rankFor(10)).toMatchObject({ name: 'Legend', bonus: 0.25, next: undefined });
  });

  it('a close fight teaches a full point; a walkover much less', () => {
    expect(xpForBattle(0.9)).toBe(1);
    expect(xpForBattle(0.5)).toBe(1);
    expect(xpForBattle(0.1)).toBeCloseTo(0.2);
    expect(xpForBattle(0)).toBe(0);
  });
});

describe('the pool', () => {
  it('survivors add to it; the rank is the average per soldier', () => {
    const s = village();
    s.troops = army({ axe: 10 });
    recordBattle(s, army({ axe: 10 }), army({}), true, 0.8);
    expect(s.veterancy.axe).toBe(10);
    expect(averageXp(s, 'axe')).toBe(1);
    expect(unitRank(s, 'axe').name).toBe('Regular');
    expect(vetMult(s, 'axe')).toBeCloseTo(1.06);
    expect(playerGear(s).axe!.attack).toBeCloseTo(1.06);
  });

  it('the dead take their share away; a lost battle teaches nothing', () => {
    const s = village();
    s.troops = army({ axe: 10 });
    s.veterancy.axe = 40; // avg 4: Veteran
    recordBattle(s, army({ axe: 5 }), army({ axe: 5 }), false, 2);
    expect(s.veterancy.axe).toBe(20);
    s.troops.axe = 5;
    expect(averageXp(s, 'axe')).toBe(4); // survivors keep their average
  });

  it('new recruits dilute it', () => {
    const s = village();
    s.troops = army({ spear: 10 });
    s.veterancy.spear = 30; // Veteran
    expect(unitRank(s, 'spear').name).toBe('Veteran');
    const r = recruit(s, 'spear', 20);
    if (!r.ok) throw new Error();
    expect(averageXp(r.state, 'spear')).toBe(1);
    expect(unitRank(r.state, 'spear').name).toBe('Regular');
  });

  it('losing everyone resets the pool', () => {
    const s = village();
    s.troops = army({ sword: 5 });
    s.veterancy.sword = 50;
    recordBattle(s, army({ sword: 5 }), army({ sword: 5 }), false, 3);
    expect(s.veterancy.sword).toBe(0);
  });

  it('reports promotions', () => {
    const s = village();
    s.troops = army({ axe: 10 });
    s.veterancy.axe = 25;
    const changes = recordBattle(s, army({ axe: 10 }), army({}), true, 1);
    expect(changes.axe).toEqual({ from: 'Regular', to: 'Veteran' });
  });
});

describe('in real battles', () => {
  it('a won raid on a camp grows the pool and the report says who was promoted', () => {
    let s = village();
    s.troops = army({ axe: 10 });
    s.veterancy.axe = 9.5; // just short of Regular
    s.map.camps[0].troops = army({ spear: 15 }); // 225 defence vs 400 attack: a proper fight
    const r = sendAttack(s, 1, { axe: 10 });
    if (!r.ok) throw new Error();
    s = advance(r.state, r.state.marches[0].arriveAt);
    const rep = s.reports[0];
    expect(rep.won).toBe(true);
    expect(s.veterancy.axe).toBeGreaterThan(9.5);
    expect(rep.promotions).toEqual(['Axemen are now Regulars']);
  });

  it('defending a raid counts for the soldiers at home', () => {
    const s = village();
    s.troops = army({ spear: 30 });
    const id = s.nextEventId++;
    s.events.push({ id, at: T0 + MIN, type: 'raid-arrive', payload: { raidId: id } });
    s.raids.push({ id, campId: 1, campName: 'X', campTier: 1, troops: army({ axe: 8 }), launchAt: T0, arriveAt: T0 + MIN, eventId: id });
    const out = advance(s, T0 + MIN);
    expect(out.reports[0].won).toBe(true);
    expect(out.veterancy.spear).toBeGreaterThan(0);
  });
});

describe('save upgrade v10 → v11', () => {
  it('everyone starts as Recruits; pools survive a reload', () => {
    const v10 = JSON.parse(JSON.stringify(newGame('old', T0)));
    v10.version = 10;
    delete v10.veterancy;
    const s = migrateSave(v10);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.veterancy.axe).toBe(0);
    const v = village();
    v.veterancy.light = 12.5;
    expect(migrateSave(JSON.parse(JSON.stringify(v))).veterancy.light).toBe(12.5);
  });
});

describe('welcome back', () => {
  it('mentions promotions earned while away', async () => {
    const { summarise } = await import('../src/game/summary');
    const s = village();
    s.troops = army({ axe: 10 });
    s.veterancy.axe = 9.5;
    s.map.camps[0].troops = army({ spear: 15 });
    const r = sendAttack(s, 1, { axe: 10 });
    if (!r.ok) throw new Error();
    expect(summarise(r.state, advance(r.state, T0 + 600 * MIN)).promotions).toEqual(['Axemen are now Regulars']);
  });
});
