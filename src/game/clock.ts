import { RESET_HOUR, type ResetTime } from '../sim';

/** Local calendar date as "YYYY-MM-DD". */
export function localDayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Every local RESET_HOUR:00 strictly after `from` and up to `to`, using the
 * device's time zone (so daylight-saving changes are handled by the browser).
 * This is the one place the game turns wall-clock time into game events.
 */
export function localResets(from: number, to: number, hour = RESET_HOUR): ResetTime[] {
  const out: ResetTime[] = [];
  const start = new Date(from);
  // Begin with the reset on the day of `from`, then walk forward a calendar day at a time.
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour, 0, 0, 0);
  for (let guard = 0; guard < 4000; guard++) {
    const at = d.getTime();
    if (at > to) break;
    if (at > from) out.push({ at, dayKey: localDayKey(d) });
    d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
  }
  return out;
}

/** How far ahead to queue resets, so the next one is always known (for the countdown). */
export const RESET_LOOKAHEAD = 26 * 3_600_000;
