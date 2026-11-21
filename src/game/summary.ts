import {
  BUILDINGS,
  BUILDING_DATA,
  RESOURCES,
  UNITS,
  UNIT_DATA,
  type BuildingId,
  type GameState,
  type ResourceId,
  type UnitId,
} from '../sim';

/** What happened while the player was away, for a "welcome back" message. */
export interface CatchUpSummary {
  awayMs: number;
  /** Change in each resource (can be negative later, e.g. raids). Whole units. */
  gained: Record<ResourceId, number>;
  /** Buildings that went up, with their new level. */
  upgraded: { building: BuildingId; name: string; level: number }[];
  /** Soldiers that finished training, e.g. "12 Spearmen". */
  trained: { unit: UnitId; count: number; label: string }[];
  /** Battles fought while away. */
  battles: { won: number; lost: number };
}

/** Soldiers still to be trained, per unit. */
function inTraining(s: GameState, u: UnitId): number {
  return s.recruitQueue.filter((b) => b.unit === u).reduce((n, b) => n + b.count - b.trained, 0);
}

export function summarise(before: GameState, after: GameState): CatchUpSummary {
  const gained = {} as Record<ResourceId, number>;
  for (const r of RESOURCES) gained[r] = Math.floor(after.resources[r]) - Math.floor(before.resources[r]);
  const upgraded = BUILDINGS.filter((b) => after.buildings[b] > before.buildings[b]).map((b) => ({
    building: b,
    name: BUILDING_DATA[b].name,
    level: after.buildings[b],
  }));
  // Counted from the training queue, not troops at home, so armies coming back don't look "trained".
  const trained = UNITS.map((u) => ({ unit: u, count: inTraining(before, u) - inTraining(after, u) }))
    .filter((t) => t.count > 0)
    .map((t) => ({ ...t, label: `${t.count} ${t.count === 1 ? UNIT_DATA[t.unit].name : UNIT_DATA[t.unit].plural}` }));
  const seen = new Set(before.reports.map((r) => r.id));
  const fresh = after.reports.filter((r) => !seen.has(r.id));
  const battles = { won: fresh.filter((r) => r.won).length, lost: fresh.filter((r) => !r.won).length };
  return { awayMs: Math.max(0, after.time - before.time), gained, upgraded, trained, battles };
}

/** "3 h 20 min", "2 days 4 h", "45 s". */
export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d > 0) return h > 0 ? `${d} day${d > 1 ? 's' : ''} ${h} h` : `${d} day${d > 1 ? 's' : ''}`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}
