import { describe, expect, it } from 'vitest';
import { blockerText, newGame, upgradeInfo, wallEra, wallMultiplier, watchtowerWarning, WALL_ERAS } from '../src/sim';
import { migrateSave } from '../src/game/migrate';

const MIN = 60_000;

describe('wall', () => {
  it('follows the design curve: ×1.74 at 20, ≈×3.34 at 100', () => {
    expect(wallMultiplier(0)).toBe(1);
    expect(wallMultiplier(1)).toBeCloseTo(1.037);
    expect(wallMultiplier(20)).toBeCloseTo(1.74);
    expect(wallMultiplier(21)).toBeCloseTo(1.76);
    expect(wallMultiplier(100)).toBeCloseTo(3.34);
    for (let L = 1; L <= 100; L++) expect(wallMultiplier(L)).toBeGreaterThan(wallMultiplier(L - 1));
  });

  it('changes era every 10 levels, wooden stakes to mythic citadel', () => {
    expect(wallEra(0)).toBeUndefined();
    expect(wallEra(1)).toEqual({ index: 0, name: 'Wooden stakes', from: 1, next: 10 });
    expect(wallEra(9)?.name).toBe('Wooden stakes');
    expect(wallEra(10)?.name).toBe('Palisade');
    expect(wallEra(59)?.name).toBe('Stone towers');
    expect(wallEra(100)).toEqual({ index: 9, name: 'Mythic citadel', from: 90, next: undefined });
    expect(WALL_ERAS).toHaveLength(10);
  });

  it('needs a Barracks first', () => {
    const s = newGame('w', 0);
    expect(blockerText(upgradeInfo(s, 'wall'))).toBe('Needs Barracks level 1');
    s.buildings.barracks = 1;
    expect(upgradeInfo(s, 'wall').blocker).toBeUndefined();
  });
});

describe('watchtower', () => {
  it('warns 5 minutes ahead at level 1, about 6 hours at 30', () => {
    expect(watchtowerWarning(0)).toBe(0);
    expect(watchtowerWarning(1)).toBe(5 * MIN);
    expect(watchtowerWarning(30)).toBeGreaterThan(5.5 * 60 * MIN);
    expect(watchtowerWarning(30)).toBeLessThan(6.5 * 60 * MIN);
  });

  it('needs Great Hall 5 and stops at level 30', () => {
    const s = newGame('t', 0);
    expect(blockerText(upgradeInfo(s, 'watchtower'))).toBe('Needs Great Hall level 5');
    s.buildings.hall = 5;
    s.buildings.watchtower = 30;
    s.buildings.farm = 30;
    expect(upgradeInfo(s, 'watchtower').blocker).toBe('max-level');
  });
});

describe('older saves', () => {
  it('get the new buildings at level 0', () => {
    const old = JSON.parse(JSON.stringify(newGame('old', 0)));
    delete old.buildings.wall;
    delete old.buildings.watchtower;
    const s = migrateSave(old);
    expect(s.buildings.wall).toBe(0);
    expect(s.buildings.watchtower).toBe(0);
  });
});
