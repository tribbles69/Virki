import {
  curveValue,
  population,
  productionPerHour,
  storageCap,
  HALL_SPEED,
  BARRACKS_SPEED,
  PRODUCERS,
  RESOURCES,
  RESOURCE_NAMES,
  wallMultiplier,
  watchtowerWarning,
  type BuildingId,
  type GameState,
} from '../sim';
import { duration, fullNum } from './format';

const withLevel = (s: GameState, b: BuildingId, level: number): GameState => ({
  ...s,
  buildings: { ...s.buildings, [b]: level },
});

/**
 * One line saying what the next upgrade brings, compared with the level before
 * it (which is the level under construction, if one is).
 */
export function effectLine(state: GameState, b: BuildingId, nextLevel: number, maxed: boolean): string {
  const s = maxed ? state : withLevel(state, b, nextLevel - 1);
  const next = withLevel(state, b, nextLevel);
  const arrow = (now: string, then: string) => (maxed ? now : `${now} → ${then}`);

  const produced = RESOURCES.find((r) => PRODUCERS[r].building === b);
  if (produced) {
    const name = RESOURCE_NAMES[produced].toLowerCase();
    return `${arrow(fullNum(productionPerHour(s, produced)), fullNum(productionPerHour(next, produced)))} ${name}/h`;
  }
  switch (b) {
    case 'warehouse':
      return `Stores ${arrow(fullNum(storageCap(s)), fullNum(storageCap(next)))} of each`;
    case 'farm':
      return `Feeds ${arrow(fullNum(population(s).cap), fullNum(population(next).cap))} people`;
    case 'hall': {
      const now = curveValue(HALL_SPEED, s.buildings.hall);
      const then = curveValue(HALL_SPEED, nextLevel);
      return maxed
        ? `Builds ${(1 / now).toFixed(1)}× faster`
        : `Builds ${Math.max(1, Math.round((now / then - 1) * 100))}% faster next level`;
    }
    case 'barracks': {
      if (nextLevel === 1) return 'Trains Spearmen, Swordsmen and Axemen';
      const now = curveValue(BARRACKS_SPEED, s.buildings.barracks);
      const then = curveValue(BARRACKS_SPEED, nextLevel);
      return maxed
        ? `Trains soldiers ${(1 / now).toFixed(1)}× faster`
        : `Trains soldiers ${Math.max(1, Math.round((now / then - 1) * 100))}% faster next level`;
    }
    case 'wall': {
      if (nextLevel === 1) return `Raises your defence against bandit raids (×${wallMultiplier(1).toFixed(2)} at level 1)`;
      const now = wallMultiplier(s.buildings.wall);
      return maxed ? `Defence ×${now.toFixed(2)}` : `Defence ×${now.toFixed(2)} → ×${wallMultiplier(nextLevel).toFixed(2)}`;
    }
    case 'watchtower': {
      const fmt = (ms: number) => duration(ms);
      if (nextLevel === 1) return `Spots raids before they land (${fmt(watchtowerWarning(1))} warning at level 1)`;
      const now = watchtowerWarning(s.buildings.watchtower);
      return maxed ? `Spots raids ${fmt(now)} ahead` : `Spots raids ${fmt(now)} → ${fmt(watchtowerWarning(nextLevel))} ahead`;
    }
    default:
      return '';
  }
}
