import { describe, expect, it } from 'vitest';
import {
  advance,
  cancelRecruit,
  equip,
  equipBlockerText,
  equipInfo,
  fight,
  maxRecruitable,
  metalMult,
  newGame,
  noTroops,
  playerGear,
  recruit,
  recruitBlocker,
  recruitBlockerText,
  sendAttack,
  soldiersOwned,
  Rng,
  SAVE_VERSION,
  type GameState,
  type Troops,
} from '../src/sim';
import { migrateSave } from '../src/game/migrate';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 23, 12);
const army = (t: Partial<Troops>): Troops => ({ ...noTroops(), ...t }) as Troops;

/** Mine 20 (copper, bronze, iron), Barracks 3, plenty of everything. */
const village = (): GameState => {
  const s = newGame('equip', T0);
  Object.assign(s.buildings, { mine: 20, barracks: 3, smithy: 1, farm: 15, warehouse: 20 });
  s.resources = { wood: 50_000, stone: 50_000, ore: 50_000 };
  s.ingots.bronze = 500;
  s.ingots.iron = 100;
  return s;
};

const arm = (s: GameState, ...a: Parameters<typeof equip> extends [GameState, ...infer R] ? R : never) => {
  const r = equip(s, ...a);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe('equipping', () => {
  it('counts every soldier you have: home, marching and in training', () => {
    let s = village();
    s.troops = army({ axe: 10 });
    const r = sendAttack(s, 1, { axe: 4 });
    if (!r.ok) throw new Error();
    s = r.state;
    const q = recruit(s, 'axe', 5);
    if (!q.ok) throw new Error();
    expect(soldiersOwned(q.state, 'axe')).toBe(15);
  });

  it('costs ingots for each soldier of the type and applies straight away', () => {
    const s = village();
    s.troops = army({ axe: 20 });
    const info = equipInfo(s, 'axe', 'weapon', 'bronze');
    expect(info.ingots).toBe(20);
    const out = arm(s, 'axe', 'weapon', 'bronze');
    expect(out.ingots.bronze).toBe(480);
    expect(out.equipment.axe).toEqual({ weapon: 'bronze', armour: 'copper' });
    expect(playerGear(out).axe).toEqual({ attack: metalMult('bronze'), defence: 1 });
  });

  it('cavalry need more ingots each', () => {
    const s = village();
    s.troops = army({ heavy: 10 });
    expect(equipInfo(s, 'heavy', 'armour', 'bronze').ingots).toBe(30);
  });

  it('craft tier and metal multiply together', () => {
    let s = village();
    s.smithy.axe.weapon = 6; // Plate ×1.9
    s = arm(s, 'axe', 'weapon', 'iron'); // ×1.32, 0 soldiers so free
    expect(playerGear(s).axe!.attack).toBeCloseTo(1.9 * 1.32);
    const bare = fight(army({ axe: 10 }), army({ spear: 30 }), new Rng(1));
    const geared = fight(army({ axe: 10 }), army({ spear: 30 }), new Rng(1), {}, { attacker: playerGear(s) });
    expect(geared.attackStrength / bare.attackStrength).toBeCloseTo(1.9 * 1.32);
  });

  it('going down a metal is free and refunds nothing', () => {
    let s = village();
    s.troops = army({ spear: 10 });
    s = arm(s, 'spear', 'armour', 'iron');
    expect(s.ingots.iron).toBe(90);
    const down = equipInfo(s, 'spear', 'armour', 'bronze');
    expect(down.ingots).toBe(0);
    s = arm(s, 'spear', 'armour', 'bronze');
    expect(s.ingots).toMatchObject({ bronze: 500, iron: 90 });
    expect(arm(s, 'spear', 'armour', 'copper').equipment.spear.armour).toBe('copper');
  });

  it('says why it can’t', () => {
    const s = village();
    s.troops = army({ sword: 200 });
    expect(equipInfo(s, 'sword', 'weapon', 'copper').blocker).toBe('same');
    const steel = equipInfo(s, 'sword', 'weapon', 'steel');
    expect(steel.blocker).toBe('locked');
    expect(equipBlockerText(steel)).toBe('Steel needs Mine level 35');
    const iron = equipInfo(s, 'sword', 'weapon', 'iron');
    expect(iron.blocker).toBe('ingots');
    expect(equipBlockerText(iron)).toBe('Needs 200 Iron ingots');
  });
});

describe('recruits come armed', () => {
  it('new soldiers of an upgraded type cost ingots too, refunded if cancelled', () => {
    let s = village();
    s = arm(s, 'axe', 'weapon', 'bronze');
    s = arm(s, 'axe', 'armour', 'iron');
    const r = recruit(s, 'axe', 10);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.ingots).toMatchObject({ bronze: 490, iron: 90 });
    const c = cancelRecruit(advance(r.state, T0 + MIN), 0);
    if (!c.ok) throw new Error();
    expect(c.state.ingots).toMatchObject({ bronze: 500, iron: 100 });
  });

  it('Max and blockers account for ingots', () => {
    let s = village();
    s.ingots.iron = 7;
    s = arm(s, 'spear', 'weapon', 'iron');
    expect(maxRecruitable(s, 'spear')).toBe(7);
    expect(recruitBlocker(s, 'spear', 8)).toBe('ingots');
    expect(recruitBlockerText(s, 'spear', 'ingots')).toBe('Not enough ingots to arm them (1 Iron each)');
    expect(recruitBlocker(s, 'axe', 8)).toBeUndefined(); // axes still in copper
  });
});

describe('save upgrade v9 → v10', () => {
  it('everyone starts in copper; equipment survives a reload', () => {
    const v9 = JSON.parse(JSON.stringify(newGame('old', T0)));
    v9.version = 9;
    delete v9.equipment;
    const s = migrateSave(v9);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.equipment.heavy).toEqual({ weapon: 'copper', armour: 'copper' });
    const armed = arm(village(), 'light', 'weapon', 'bronze');
    expect(migrateSave(JSON.parse(JSON.stringify(armed)))).toEqual(armed);
  });

  it('rejects an unknown metal', () => {
    const s = JSON.parse(JSON.stringify(newGame('bad', T0)));
    s.equipment.axe.weapon = 'cheese';
    expect(() => migrateSave(s)).toThrow(/equipment axe/);
  });
});
