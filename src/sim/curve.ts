/**
 * Segmented growth curves (DESIGN §5.2): fast growth early, slower later, so
 * early levels feel quick and late levels become long-term goals.
 *
 *   value(1) = base
 *   value(L) = value(L-1) × r, where r comes from the segment L falls in
 */
export interface CurveSegment {
  /** Last level (inclusive) this growth rate applies to. */
  upTo: number;
  /** Growth factor per level. */
  r: number;
}

export interface Curve {
  base: number;
  segments: readonly CurveSegment[];
  /** Value at level 0 (building not built yet). Defaults to 0. */
  atZero?: number;
}

export function curveValue(curve: Curve, level: number): number {
  if (level <= 0) return curve.atZero ?? 0;
  let value = curve.base;
  for (let L = 2; L <= level; L++) {
    const seg = curve.segments.find((s) => L <= s.upTo) ?? curve.segments[curve.segments.length - 1];
    value *= seg.r;
  }
  return value;
}
