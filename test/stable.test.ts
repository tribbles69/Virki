import { describe, expect, it } from 'vitest';
import {
  advance,
  batchEndTimes,
  blockerText,
  cancelRecruit,
  campIntel,
  campThreat,
  defenceAgainst,
  hiddenAmount,
  isScoutingParty,
  newGame,
  noTroops,
  recruit,
  recruitBlocker,
  recruitBlockerText,
  scheduleResets,
  sendAttack,
  trainTime,
  upgradeInfo,
  RECRUIT_QUEUE_SLOTS,
  SAVE_VERSION,
  type GameState,
  type Raid,
  type Troops,
} from '../src/sim';
import { migrateSave } from '../src/game/migrate';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 10, 21, 12);
const army = (t: Partial<Troops>): Troops => ({ ...noTroops(), ...t }) as Troops;

const village = (levels: Partial<GameState['buildings']> = {}): GameState => {
  const s = newGame('stable', T0);
  Object.assign(s.buildings, { hall: 10, barracks: 5, farm: 20, warehouse: 15 }, levels);
  s.resources = { wood: 50_000, stone: 50_000, ore: 50_000 };
  return s;
};

const order = (s: GameState, u: Parameters<typeof recruit>[1], n: number) => {
  const r = recruit(s, u, n);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe('Stable', () => {
  it('needs Great Hall 10 and Barracks 5', () => {
    const s = newGame('x', T0);
    expect(blockerText(upgradeInfo(s, 'stable'))).toBe('Needs Great Hall level 10, Barracks level 5');
    expect(upgradeInfo(village(), 'stable').blocker).toBeUndefined();
  });

  it('unlocks Scouts at 1, Light Cavalry at 3, Heavy Cavalry at 10', () => {
    const s = village({ stable: 3 });
    expect(recruitBlocker(s, 'scout', 1)).toBeUndefined();
    expect(recruitBlocker(s, 'light', 1)).toBeUndefined();
    expect(recruitBlocker(s, 'heavy', 1)).toBe('locked');
    expect(recruitBlockerText(s, 'heavy', 'locked')).toBe('Needs Stable level 10');
  });

  it('Barracks and Stable train at the same time, each through its own queue', () => {
    let s = village({ stable: 3 });
    s = order(s, 'spear', 2);
    s = order(s, 'light', 2);
    s = order(s, 'axe', 1);
    const sp = trainTime('spear', 5);
    const lc = trainTime('light', 3);
    const ax = trainTime('axe', 5);
    expect(batchEndTimes(s)).toEqual([T0 + 2 * sp, T0 + 2 * lc, T0 + 2 * sp + ax]);
    const out = advance(s, T0 + Math.max(2 * sp + ax, 2 * lc));
    expect(out.troops).toMatchObject({ spear: 2, light: 2, axe: 1 });
    expect(out.recruitQueue).toEqual([]);
  });

  it('a full Barracks queue doesn’t block the Stable', () => {
    let s = village({ stable: 1 });
    for (let i = 0; i < RECRUIT_QUEUE_SLOTS; i++) s = order(s, 'spear', 1);
    expect(recruitBlocker(s, 'spear', 1)).toBe('queue-full');
    expect(recruitBlockerText(s, 'spear', 'queue-full')).toMatch(/^Barracks queue is full/);
    expect(recruitBlocker(s, 'scout', 1)).toBeUndefined();
  });

  it('cancelling the Stable’s batch leaves the Barracks training', () => {
    let s = village({ stable: 3 });
    s = order(s, 'spear', 3);
    s = order(s, 'light', 3);
    s = order(s, 'scout', 2);
    const c = cancelRecruit(advance(s, T0 + MIN), 1);
    if (!c.ok) throw new Error();
    const spear = c.state.recruitQueue.find((b) => b.unit === 'spear')!;
    expect(spear).toEqual(s.recruitQueue[0]);
    const scout = c.state.recruitQueue.find((b) => b.unit === 'scout')!;
    expect(scout.nextAt).toBe(T0 + MIN + trainTime('scout', 3)); // started straight away
  });
});

describe('cavalry in battle', () => {
  it('bandit Spearmen defend three times better against cavalry than infantry', () => {
    const vsInfantry = defenceAgainst(army({ axe: 10 }), army({ spear: 10 }));
    const vsCavalry = defenceAgainst(army({ light: 10 }), army({ spear: 10 }));
    expect(vsInfantry).toBe(150);
    expect(vsCavalry).toBe(450);
    expect(defenceAgainst(army({ axe: 10, light: 10 }), army({ spear: 10 }))).toBeCloseTo((400 * 15 + 1_300 * 45) / 1_700 * 10);
  });

  it('the threat rating weighs your mix', () => {
    const s = village();
    const camp = { ...s.map.camps[0], troops: army({ spear: 10 }) };
    expect(campThreat(army({ axe: 6 }), camp)).toBe('fair'); // 240 vs 150
    // Same-ish attack, but cavalry run onto spears: 260 vs 450 = 0.58.
    expect(campThreat(army({ light: 2 }), camp)).toBe('deadly');
  });
});

describe('Hiding Place', () => {
  it('keeps 150 safe at level 1, ~1,600 at 10, ~300k at 30', () => {
    expect(hiddenAmount(1)).toBe(150);
    expect(hiddenAmount(10)).toBeGreaterThan(1_500);
    expect(hiddenAmount(10)).toBeLessThan(1_700);
    expect(hiddenAmount(30)).toBeGreaterThan(250_000);
    expect(newGame('h', 0).buildings.hiding).toBe(1);
  });

  it('raiders can’t touch what is hidden', () => {
    const s = village({ hiding: 10 });
    s.troops = noTroops();
    s.resources = { wood: 1_000, stone: 1_000, ore: 1_000 };
    const raid: Raid = { id: s.nextEventId, campId: 1, campName: 'X', campTier: 1, troops: army({ axe: 200 }), launchAt: T0, arriveAt: T0 + HOUR, eventId: s.nextEventId };
    s.events.push({ id: s.nextEventId++, at: T0 + HOUR, type: 'raid-arrive', payload: { raidId: raid.id } });
    s.raids.push(raid);
    const out = advance(s, T0 + HOUR);
    expect(out.reports[0].won).toBe(false);
    expect(out.reports[0].loot).toEqual({ wood: 0, stone: 0, ore: 0 }); // 1,000 < 1,593 hidden
  });
});

describe('scouting', () => {
  const scoutVillage = () => {
    const s = village({ stable: 1 });
    s.troops = army({ scout: 3, axe: 5 });
    return s;
  };

  it('only an all-scout group goes scouting', () => {
    expect(isScoutingParty(army({ scout: 2 }))).toBe(true);
    expect(isScoutingParty(army({ scout: 2, axe: 1 }))).toBe(false);
    expect(isScoutingParty(army({ axe: 1 }))).toBe(false);
  });

  it('scouts bring back exact numbers and loot without a fight, and come home', () => {
    const s = scoutVillage();
    const camp = s.map.camps[3];
    const r = sendAttack(s, camp.id, { scout: 1 });
    if (!r.ok) throw new Error(r.reason);
    const m = r.state.marches[0];
    expect(m.arriveAt - T0).toBe(Math.round(9 * Math.hypot(camp.x - 7, camp.y - 7) * 60) * 1_000);
    const seen = advance(r.state, m.arriveAt);
    const rep = seen.reports[0];
    expect(rep.kind).toBe('scout');
    expect(rep.defenders).toEqual(camp.troops);
    expect(rep.seenLoot).toEqual(camp.loot);
    expect(seen.map.camps[3].troops).toEqual(camp.troops); // untouched
    const home = advance(r.state, seen.marches[0].returnAt);
    expect(home.troops.scout).toBe(3);
  });

  it('intel lasts until the camps respawn', () => {
    const s = scoutVillage();
    const r = sendAttack(s, 2, { scout: 1 });
    if (!r.ok) throw new Error();
    let out = advance(r.state, T0 + 3 * HOUR);
    expect(campIntel(out, 2)?.source).toBe('scout');
    expect(campIntel(out, 2)?.troops).toEqual(s.map.camps[1].troops);
    expect(campIntel(out, 3)).toBeUndefined();
    out = advance(scheduleResets(out, [{ at: T0 + DAY - 8 * HOUR, dayKey: '2026-11-22' }]), T0 + DAY);
    expect(campIntel(out, 2)).toBeUndefined();
  });

  it('your own attack also tells you who is left', () => {
    const s = scoutVillage();
    s.map.camps[0].troops = army({ spear: 2 });
    const r = sendAttack(s, 1, { axe: 5 });
    if (!r.ok) throw new Error();
    const out = advance(r.state, r.state.marches[0].arriveAt);
    expect(campIntel(out, 1)).toMatchObject({ source: 'battle', troops: army({}) });
  });
});

describe('save upgrade v6 → v7', () => {
  it('adds new units at 0, the Hiding Place at 1, the Stable at 0, and the reset time', () => {
    const v6 = JSON.parse(JSON.stringify(newGame('old', T0)));
    v6.version = 6;
    delete v6.lastResetAt;
    delete v6.troops.scout;
    delete v6.troops.light;
    delete v6.troops.heavy;
    delete v6.buildings.hiding;
    delete v6.buildings.stable;
    const s = migrateSave(v6);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.lastResetAt).toBe(0);
    expect(s.troops).toEqual(noTroops());
    expect(s.buildings.hiding).toBe(1);
    expect(s.buildings.stable).toBe(0);
  });
});
