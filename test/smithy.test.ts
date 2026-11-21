import { describe, expect, it } from 'vitest';
import {
  advance,
  armyAttack,
  blockerText,
  cancelResearch,
  craftMult,
  craftName,
  fight,
  newGame,
  noTroops,
  playerGear,
  researchBlockerText,
  researchCost,
  researchInfo,
  researchTime,
  sendAttack,
  startResearch,
  upgradeInfo,
  CRAFT_TIERS,
  Rng,
  SAVE_VERSION,
  type GameState,
  type Troops,
} from '../src/sim';
import { migrateSave } from '../src/game/migrate';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 22, 12);
const army = (t: Partial<Troops>): Troops => ({ ...noTroops(), ...t }) as Troops;

const village = (levels: Partial<GameState['buildings']> = {}): GameState => {
  const s = newGame('smithy', T0);
  Object.assign(s.buildings, { hall: 5, barracks: 1, smithy: 1, warehouse: 20, farm: 10 }, levels);
  s.resources = { wood: 100_000, stone: 100_000, ore: 100_000 };
  return s;
};

const research = (s: GameState, u: Parameters<typeof startResearch>[1], t: Parameters<typeof startResearch>[2]) => {
  const r = startResearch(s, u, t);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe('craft tiers', () => {
  it('nine tiers from Rags ×1.00 to Runeforged ×2.20', () => {
    expect(CRAFT_TIERS).toHaveLength(9);
    expect(craftName(0)).toBe('Rags');
    expect(craftName(8)).toBe('Runeforged');
    expect(craftMult(0)).toBe(1);
    expect(craftMult(8)).toBeCloseTo(2.2);
    for (let t = 1; t <= 8; t++) expect(craftMult(t)).toBeGreaterThan(craftMult(t - 1));
  });

  it('research costs the unit’s price ×20 for tier 1, then ×1.9 a tier; time grows ×1.7', () => {
    expect(researchCost('spear', 1)).toEqual({ wood: 1_000, stone: 600, ore: 200 });
    expect(researchCost('spear', 2).wood).toBe(1_900);
    expect(researchTime(1, 1)).toBe(30 * MIN);
    expect(researchTime(2, 1)).toBe(51 * MIN);
    expect(researchTime(2, 20)).toBeLessThan(researchTime(2, 19));
  });
});

describe('Smithy', () => {
  it('needs Great Hall 5 and a Barracks', () => {
    const s = newGame('x', T0);
    expect(blockerText(upgradeInfo(s, 'smithy'))).toBe('Needs Great Hall level 5, Barracks level 1');
  });

  it('explains what stops a research', () => {
    expect(researchInfo(village({ smithy: 0 }), 'spear', 'weapon').blocker).toBe('no-smithy');
    expect(researchInfo(village(), 'light', 'weapon').blocker).toBe('unit-locked');
    expect(researchBlockerText(researchInfo(village(), 'light', 'weapon'))).toBe('Build a Stable first');
    const s = village();
    s.smithy.spear.weapon = 2;
    const info = researchInfo(s, 'spear', 'weapon');
    expect(info.blocker).toBe('smithy-level');
    expect(researchBlockerText(info)).toBe('Studded needs Smithy level 6');
    s.smithy.spear.weapon = 8;
    expect(researchInfo(s, 'spear', 'weapon').blocker).toBe('max-tier');
  });

  it('pays up front, finishes on time, raises the tier', () => {
    const s0 = village();
    const s1 = research(s0, 'axe', 'weapon');
    expect(s1.resources.wood).toBe(100_000 - 1_200);
    expect(s1.researchQueue[0]).toMatchObject({ unit: 'axe', track: 'weapon', toTier: 1, finishesAt: T0 + 30 * MIN });
    expect(advance(s1, T0 + 30 * MIN - 1).smithy.axe.weapon).toBe(0);
    const done = advance(s1, T0 + 30 * MIN);
    expect(done.smithy.axe.weapon).toBe(1);
    expect(done.researchQueue).toEqual([]);
    expect(done.smithy.axe.armour).toBe(0);
  });

  it('one research at a time; cancelling refunds in full', () => {
    const s1 = research(village(), 'spear', 'armour');
    expect(researchInfo(s1, 'sword', 'weapon').blocker).toBe('queue-full');
    expect(researchBlockerText(researchInfo(s1, 'sword', 'weapon'))).toBe('The smiths are busy');
    const c = cancelResearch(s1);
    if (!c.ok) throw new Error();
    expect(c.state.resources).toEqual(village().resources);
    expect(c.state.events).toEqual([]);
    expect(advance(c.state, T0 + 60 * MIN).smithy.spear.armour).toBe(0);
  });
});

describe('gear in battle', () => {
  it('weapon tiers raise attack, armour tiers raise defence', () => {
    const s = village();
    s.smithy.axe.weapon = 4; // Mail ×1.6
    s.smithy.spear.armour = 2; // Leather ×1.3
    const gear = playerGear(s);
    expect(armyAttack(army({ axe: 10 }), gear)).toBeCloseTo(640);
    const a = fight(army({ axe: 10 }), army({ spear: 10 }), new Rng(3), {}, { attacker: gear });
    const b = fight(army({ axe: 10 }), army({ spear: 10 }), new Rng(3));
    expect(a.attackStrength / b.attackStrength).toBeCloseTo(1.6);
    const d = fight(army({ axe: 10 }), army({ spear: 10 }), new Rng(3), {}, { defender: gear });
    expect(d.defenceStrength).toBeCloseTo(150 * 1.3);
  });

  it('better weapons win battles that bare hands lose', () => {
    let s = village();
    s.troops = army({ axe: 5 });
    s.map.camps[0].troops = army({ spear: 12 }); // 180 defence vs 200 attack: coin-flip on luck
    s.smithy.axe.weapon = 3; // ×1.45 → 290, enough even with the worst luck (246)
    const r = sendAttack(s, 1, { axe: 5 });
    if (!r.ok) throw new Error();
    s = advance(r.state, r.state.marches[0].arriveAt);
    expect(s.reports[0].won).toBe(true);
    expect(s.reports[0].attackStrength).toBeGreaterThan(240);
  });

  it('raids meet your armour', () => {
    const s = village({ wall: 0 });
    s.troops = army({ spear: 20 });
    s.smithy.spear.armour = 8;
    const id = s.nextEventId++;
    s.events.push({ id, at: T0 + MIN, type: 'raid-arrive', payload: { raidId: id } });
    s.raids.push({ id, campId: 1, campName: 'X', campTier: 1, troops: army({ axe: 12 }), launchAt: T0, arriveAt: T0 + MIN, eventId: id });
    const out = advance(s, T0 + MIN);
    expect(out.reports[0].defenceStrength).toBe(Math.round((20 * 15 * 2.2 + 20) * 1));
    expect(out.reports[0].won).toBe(true);
  });
});

describe('save upgrade v7 → v8', () => {
  it('everyone starts in Rags; tiers and research survive a reload', () => {
    const v7 = JSON.parse(JSON.stringify(newGame('old', T0)));
    v7.version = 7;
    delete v7.smithy;
    delete v7.researchQueue;
    delete v7.buildings.smithy;
    const s = migrateSave(v7);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.smithy.heavy).toEqual({ weapon: 0, armour: 0 });
    expect(s.buildings.smithy).toBe(0);
    const busy = advance(research(village(), 'sword', 'armour'), T0 + MIN);
    expect(migrateSave(JSON.parse(JSON.stringify(busy)))).toEqual(busy);
  });

  it('rejects a damaged tier', () => {
    const s = JSON.parse(JSON.stringify(newGame('bad', T0)));
    s.smithy.axe.weapon = 12;
    expect(() => migrateSave(s)).toThrow(/smithy axe/);
  });
});

describe('welcome back', () => {
  it('mentions research finished while away', async () => {
    const { summarise } = await import('../src/game/summary');
    const s = research(village(), 'axe', 'weapon');
    expect(summarise(s, advance(s, T0 + 60 * MIN)).researched).toEqual(['Axemen: Padded weapons']);
  });
});
