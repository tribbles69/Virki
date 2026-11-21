import { describe, expect, it } from 'vitest';
import {
  armyAttack,
  campGarrison,
  campThreat,
  distanceFromVillage,
  generateMap,
  newGame,
  terrainAt,
  travelTime,
  CAMP_COUNT,
  MAP_SIZE,
  RUBBER_BAND_MAX,
  SAVE_VERSION,
  VILLAGE_POS,
  noTroops,
} from '../src/sim';
import { migrateSave } from '../src/game/migrate';

const seeds = Array.from({ length: 200 }, (_, i) => `seed-${i}`);

describe('map generation', () => {
  it('the same seed always gives the same map; different seeds differ', () => {
    expect(generateMap('abc')).toEqual(generateMap('abc'));
    expect(generateMap('abc')).not.toEqual(generateMap('abd'));
    expect(newGame('abc', 0).map).toEqual(generateMap('abc'));
  });

  it('is 15×15 with only known terrain', () => {
    const m = generateMap('x');
    expect(m.terrain).toHaveLength(MAP_SIZE * MAP_SIZE);
    expect(m.terrain).toMatch(/^[.fhw]+$/);
  });

  it('across 200 maps: 8 camps, in bounds, spaced out, on open ground, clear of the village', () => {
    for (const seed of seeds) {
      const m = generateMap(seed);
      expect(m.camps).toHaveLength(CAMP_COUNT);
      expect(new Set(m.camps.map((c) => c.name)).size).toBe(CAMP_COUNT);
      for (const c of m.camps) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThan(MAP_SIZE);
        expect(terrainAt(m, c.x, c.y)).toBe('.');
        expect(distanceFromVillage(c)).toBeGreaterThanOrEqual(1.5);
        for (const o of m.camps) {
          if (o !== c) expect(Math.max(Math.abs(o.x - c.x), Math.abs(o.y - c.y)), seed).toBeGreaterThanOrEqual(2);
        }
      }
      expect(terrainAt(m, VILLAGE_POS.x, VILLAGE_POS.y)).toBe('.');
    }
  });

  it('nearer camps are lower tiers, from close by to near a corner', () => {
    for (const seed of seeds) {
      const camps = generateMap(seed).camps;
      const d = camps.map(distanceFromVillage);
      expect(camps.map((c) => c.tier)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]);
      expect(d[0]).toBeLessThan(3.5);
      expect(d[7]).toBeGreaterThan(7.5);
    }
  });

  it('farther camps hold more loot and more bandits', () => {
    const camps = generateMap('loot').camps;
    for (let i = 1; i < camps.length; i++) {
      expect(camps[i].loot.wood).toBeGreaterThan(camps[i - 1].loot.wood);
      expect(armyAttack(camps[i].troops) + camps[i].troops.spear).toBeGreaterThan(armyAttack(camps[i - 1].troops) + camps[i - 1].troops.spear);
    }
  });
});

describe('rubber band', () => {
  it('garrisons grow with your army, but only up to 3× the base', () => {
    expect(campGarrison(1, 0)).toEqual({ ...noTroops(), spear: 3 });
    expect(campGarrison(1, 400).spear).toBe(6);
    expect(campGarrison(1, 1_000_000).spear).toBe(3 * RUBBER_BAND_MAX);
    expect(campGarrison(8, 400).spear).toBeLessThan(campGarrison(8, 1_000_000).spear);
  });
});

describe('travel and threat', () => {
  it('moves at the slowest soldier’s pace', () => {
    expect(travelTime({ spear: 10 }, 1)).toBe(18 * 60_000);
    expect(travelTime({ spear: 10, sword: 1 }, 2)).toBe(44 * 60_000);
    expect(travelTime({}, 5)).toBe(0);
  });

  it('rates camps against your army', () => {
    const camp = generateMap('t').camps[0]; // 3 spearmen: defence 45
    expect(campThreat({}, camp)).toBe('no-army');
    expect(campThreat({ axe: 3 }, camp)).toBe('easy'); // 120 vs 45
    expect(campThreat({ axe: 2 }, camp)).toBe('fair'); // 80 vs 45 = 1.78
    expect(campThreat({ axe: 1, spear: 1 }, camp)).toBe('risky'); // 50 vs 45 = 1.11
    expect(campThreat({ spear: 1 }, camp)).toBe('deadly');
  });
});

describe('save upgrade v2 → v3', () => {
  it('adds a map scaled to the army you already have', () => {
    const s = newGame('upgrade', 0);
    s.troops.axe = 50; // 2,000 attack
    const v2 = JSON.parse(JSON.stringify(s));
    v2.version = 2;
    delete v2.map;
    const loaded = migrateSave(v2);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.map.terrain).toBe(generateMap('upgrade').terrain);
    expect(loaded.map.camps[0].troops.spear).toBe(campGarrison(1, 2_000).spear);
    expect(loaded.troops.axe).toBe(50);
  });

  it('rejects a damaged map', () => {
    const s = JSON.parse(JSON.stringify(newGame('bad', 0)));
    s.map.terrain = 'xx';
    expect(() => migrateSave(s)).toThrow(/map/);
  });
});
