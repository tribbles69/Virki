import type { GameState } from './state';

// Small pure commands for the battle-report inbox. Each returns a new state.

export function unreadReports(state: GameState): number {
  return state.reports.reduce((n, r) => n + (r.read ? 0 : 1), 0);
}

export function markReportRead(state: GameState, id: number): GameState {
  const r = state.reports.find((x) => x.id === id);
  if (!r || r.read) return state;
  const s = structuredClone(state);
  s.reports.find((x) => x.id === id)!.read = true;
  return s;
}

export function markAllReportsRead(state: GameState): GameState {
  if (unreadReports(state) === 0) return state;
  const s = structuredClone(state);
  for (const r of s.reports) r.read = true;
  return s;
}

export function deleteReport(state: GameState, id: number): GameState {
  if (!state.reports.some((x) => x.id === id)) return state;
  const s = structuredClone(state);
  s.reports = s.reports.filter((x) => x.id !== id);
  return s;
}
