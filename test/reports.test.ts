import { describe, expect, it } from 'vitest';
import {
  advance,
  deleteReport,
  markAllReportsRead,
  markReportRead,
  newGame,
  sendAttack,
  unreadReports,
  type GameState,
} from '../src/sim';
import { migrateSave } from '../src/game/migrate';
import { ago } from '../src/ui/format';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 21, 12);

/** A village that has fought three battles against camp 1. */
function afterThreeBattles(): GameState {
  let s = newGame('reports', T0);
  s.buildings.farm = 10;
  s.troops = { spear: 0, sword: 0, axe: 30 };
  for (let i = 0; i < 3; i++) {
    const r = sendAttack(s, 1, { axe: 10 });
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
  }
  return advance(s, T0 + 600 * MIN);
}

describe('battle report inbox', () => {
  it('new reports arrive unread, with both sides’ strength recorded', () => {
    const s = afterThreeBattles();
    expect(s.reports).toHaveLength(3);
    expect(unreadReports(s)).toBe(3);
    const first = s.reports[s.reports.length - 1];
    expect(first.attackStrength).toBeGreaterThan(0);
    expect(first.defenceStrength).toBe(45); // 3 spearmen × 15
  });

  it('opening one marks just that one read', () => {
    const s = afterThreeBattles();
    const id = s.reports[1].id;
    const out = markReportRead(s, id);
    expect(unreadReports(out)).toBe(2);
    expect(out.reports[1].read).toBe(true);
    expect(s.reports[1].read).toBe(false); // input untouched
    expect(markReportRead(out, id)).toBe(out); // no change, same object
    expect(markReportRead(s, 9999)).toBe(s);
  });

  it('mark all read and delete', () => {
    const s = afterThreeBattles();
    expect(unreadReports(markAllReportsRead(s))).toBe(0);
    const gone = deleteReport(s, s.reports[0].id);
    expect(gone.reports).toHaveLength(2);
    expect(gone.reports.map((r) => r.id)).toEqual(s.reports.slice(1).map((r) => r.id));
    expect(deleteReport(s, 9999)).toBe(s);
  });

  it('read flags survive saving and loading', () => {
    const s = markAllReportsRead(afterThreeBattles());
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(unreadReports(loaded)).toBe(0);
    expect(loaded.reports).toEqual(s.reports);
  });

  it('older reports without strengths still load', () => {
    const s = JSON.parse(JSON.stringify(afterThreeBattles()));
    delete s.reports[0].attackStrength;
    delete s.reports[0].defenceStrength;
    expect(migrateSave(s).reports[0].attackStrength).toBeUndefined();
  });
});

describe('ago', () => {
  it('reads naturally', () => {
    expect(ago(10_000)).toBe('just now');
    expect(ago(5 * MIN)).toBe('5 min ago');
    expect(ago(3 * 60 * MIN)).toBe('3 h ago');
    expect(ago(24 * 60 * MIN)).toBe('1 day ago');
    expect(ago(50 * 60 * MIN)).toBe('2 days ago');
  });
});
