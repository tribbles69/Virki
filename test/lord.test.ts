import { describe, expect, it } from 'vitest';
import {
  advance,
  attackBlocker,
  blockerText,
  hasLord,
  levelFromXp,
  lordAvailable,
  lordStatus,
  newGame,
  newLord,
  noTroops,
  recallMarch,
  sendAttack,
  upgradeInfo,
  xpForLevel,
  ATTACK_BLOCKER_TEXT,
  SAVE_VERSION,
  type GameState,
  type Troops,
} from '../src/sim';
import { migrateSave } from '../src/game/migrate';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 24, 12);
const army = (t: Partial<Troops>): Troops => ({ ...noTroops(), ...t }) as Troops;

const village = (keep = 1): GameState => {
  const s = newGame('lord', T0);
  Object.assign(s.buildings, { hall: 10, barracks: 3, farm: 15, warehouse: 20, keep });
  s.troops = army({ axe: 30 });
  return s;
};

const go = (s: GameState, troops: Partial<Troops>, lord: boolean, camp = 1) => {
  const r = sendAttack(s, camp, troops, lord);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe('the Lord', () => {
  it('arrives with the Keep, which needs Great Hall 10', () => {
    const s = newGame('x', T0);
    expect(hasLord(s)).toBe(false);
    expect(blockerText(upgradeInfo(s, 'keep'))).toBe('Needs Great Hall level 10');
    expect(hasLord(village())).toBe(true);
    expect(lordStatus(village())).toMatchObject({ level: 1, title: 'Thane', bonus: 0.05, away: false });
  });

  it('has a name from the save seed', () => {
    expect(newLord('abc')).toEqual(newLord('abc'));
    expect(newLord('abc').xp).toBe(0);
  });

  it('levels by experience: 100 for level 2, ×1.15 a level after', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(215);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(215)).toBe(3);
  });

  it('titles: Thane, Hersir at 10, Jarl 20, High Jarl 30, King 40', () => {
    const s = village(50);
    for (const [lvl, title, bonus] of [[9, 'Thane', 0.05], [10, 'Hersir', 0.1], [20, 'Jarl', 0.15], [30, 'High Jarl', 0.2], [40, 'King', 0.25]] as const) {
      s.lord.xp = xpForLevel(lvl);
      expect(lordStatus(s)).toMatchObject({ level: lvl, title, bonus });
    }
  });

  it('the Keep caps the level; extra experience waits for it', () => {
    const s = village(3);
    s.lord.xp = xpForLevel(8);
    expect(lordStatus(s)).toMatchObject({ level: 3, cap: 3, capped: true, nextXp: undefined });
    s.buildings.keep = 10;
    expect(lordStatus(s).level).toBe(8);
  });
});

describe('leading an army', () => {
  it('only one army at a time, and only with a Keep', () => {
    expect(attackBlocker(village(0), 1, { axe: 1 }, true)).toBe('lord-busy');
    const s = go(village(), { axe: 5 }, true);
    expect(lordAvailable(s)).toBe(false);
    expect(lordStatus(s).away).toBe(true);
    expect(attackBlocker(s, 2, { axe: 5 }, true)).toBe('lord-busy');
    expect(ATTACK_BLOCKER_TEXT['lord-busy']).toMatch(/isn’t at home/);
    expect(attackBlocker(s, 2, { axe: 5 }, false)).toBeUndefined();
  });

  it('adds the title bonus to the army’s attack and earns experience', () => {
    const base = village();
    base.map.camps[0].troops = army({ spear: 20 });
    const without = go(base, { axe: 10 }, false);
    const withLord = go(base, { axe: 10 }, true);
    const a = advance(without, without.marches[0].arriveAt).reports[0];
    const b = advance(withLord, withLord.marches[0].arriveAt);
    expect(b.reports[0].attackStrength! / (1 + b.reports[0].luck)).toBeCloseTo((a.attackStrength! / (1 + a.luck)) * 1.05, 0);
    expect(b.reports[0].lord).toBe(true);
    expect(b.lord.xp).toBe(Math.round(b.reports[0].defenceStrength! / 10));
  });

  it('comes home with the army, then is free again', () => {
    const s = go(village(), { axe: 10 }, true);
    const home = advance(s, T0 + 600 * MIN);
    expect(home.marches).toEqual([]);
    expect(lordAvailable(home)).toBe(true);
  });

  it('never dies: if the army falls, the Lord rides home alone', () => {
    const s = village();
    s.map.camps[0].troops = army({ sword: 200 });
    const r = go(s, { axe: 3 }, true);
    const fought = advance(r, r.marches[0].arriveAt);
    expect(fought.reports[0].won).toBe(false);
    expect(fought.marches).toHaveLength(1);
    expect(fought.marches[0]).toMatchObject({ phase: 'returning', lord: true });
    expect(fought.lord.xp).toBeGreaterThan(0); // a little, for the lesson
    const home = advance(fought, fought.marches[0].returnAt);
    expect(home.marches).toEqual([]);
    expect(lordAvailable(home)).toBe(true);
  });

  it('a recalled army brings the Lord back too', () => {
    const s = go(village(), { axe: 5 }, true);
    const r = recallMarch(advance(s, T0 + MIN), s.marches[0].id);
    if (!r.ok) throw new Error();
    expect(lordAvailable(advance(r.state, T0 + 2 * MIN))).toBe(true);
  });

  it('levels up and the report says so', () => {
    const s = village(10);
    s.lord.xp = 95;
    s.map.camps[0].troops = army({ spear: 30 }); // 450 defence → 45 xp
    const r = go(s, { axe: 20 }, true);
    const out = advance(r, r.marches[0].arriveAt);
    expect(lordStatus(out).level).toBe(2);
    expect(out.reports[0].promotions).toContain(`Thane ${s.lord.name} reached level 2`);
  });
});

describe('defending at home', () => {
  it('the Lord at home strengthens the defence and learns from raids', () => {
    const plant = (s: GameState) => {
      const id = s.nextEventId++;
      s.events.push({ id, at: T0 + MIN, type: 'raid-arrive', payload: { raidId: id } });
      s.raids.push({ id, campId: 1, campName: 'X', campTier: 1, troops: army({ axe: 10 }), launchAt: T0, arriveAt: T0 + MIN, eventId: id });
      return s;
    };
    const withLord = plant(village());
    withLord.troops = army({ spear: 20 });
    const noKeep = plant(village(0));
    noKeep.troops = army({ spear: 20 });
    const a = advance(withLord, T0 + MIN);
    const b = advance(noKeep, T0 + MIN);
    expect(a.reports[0].defenceStrength!).toBeGreaterThan(b.reports[0].defenceStrength!);
    expect(a.reports[0].lord).toBe(true);
    expect(a.lord.xp).toBeGreaterThan(0);
    expect(b.lord.xp).toBe(0);
  });
});

describe('save upgrade v11 → v12', () => {
  it('gives every village its Lord; a Lord on the march survives a reload', () => {
    const v11 = JSON.parse(JSON.stringify(newGame('old', T0)));
    v11.version = 11;
    delete v11.lord;
    delete v11.buildings.keep;
    const s = migrateSave(v11);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.lord).toEqual(newLord('old'));
    expect(s.buildings.keep).toBe(0);
    const away = advance(go(village(), { axe: 5 }, true), T0 + MIN);
    expect(migrateSave(JSON.parse(JSON.stringify(away)))).toEqual(away);
  });
});
