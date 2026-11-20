/** 1,234 below 100k, then 123k / 4.56M. */
export function shortNum(n: number): string {
  const v = Math.floor(n);
  if (v < 100_000) return v.toLocaleString('en-GB');
  if (v < 1_000_000) return `${Math.floor(v / 1_000)}k`;
  if (v < 100_000_000) return `${(v / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  return `${Math.floor(v / 1_000_000)}M`;
}

export function fullNum(n: number): string {
  return Math.floor(n).toLocaleString('en-GB');
}

/** Countdown: "45s", "4:05", "1:02:03", "2d 4h". */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}:${p(m)}:${p(sec)}`;
  if (m > 0) return `${m}:${p(sec)}`;
  return `${sec}s`;
}

/** Build length: "6 min", "1 h 5 min", "3 days 2 h". */
export function duration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return `${Math.max(1, Math.round(ms / 1000))} s`;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} days ${h % 24} h` : `${d} days`;
}

/** Local clock time a build lands, e.g. "14:05" or "Sat 09:30" if not today. */
export function clockTime(at: number, now: number): string {
  const when = new Date(at);
  const hm = when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (new Date(now).toDateString() === when.toDateString()) return hm;
  return `${when.toLocaleDateString('en-GB', { weekday: 'short' })} ${hm}`;
}
