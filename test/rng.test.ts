import { describe, expect, it } from 'vitest';
import { Rng, deriveSeed, hashSeed } from '../src/sim';

describe('Rng', () => {
  it('replays the same sequence from the same state', () => {
    const a = new Rng(hashSeed('virki'));
    const b = new Rng(hashSeed('virki'));
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('resumes exactly from a saved state', () => {
    const a = new Rng(123);
    for (let i = 0; i < 10; i++) a.next();
    const saved = a.state;
    const expected = [a.next(), a.next(), a.next()];
    const resumed = new Rng(saved);
    expect([resumed.next(), resumed.next(), resumed.next()]).toEqual(expected);
  });

  it('gives different streams for different seeds and keys', () => {
    expect(new Rng(hashSeed('a')).next()).not.toBe(new Rng(hashSeed('b')).next());
    expect(deriveSeed('save', 'daily:2026-11-21')).not.toBe(deriveSeed('save', 'daily:2026-11-22'));
    expect(deriveSeed('save', 'daily:2026-11-21')).toBe(deriveSeed('save', 'daily:2026-11-21'));
  });

  it('stays in range and is roughly uniform', () => {
    const r = new Rng(42);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      counts[r.int(1, 6) - 1]++;
    }
    for (const c of counts) {
      expect(c).toBeGreaterThan(9_500);
      expect(c).toBeLessThan(10_500);
    }
  });

  it('weighted picks follow the weights', () => {
    const r = new Rng(7);
    let rare = 0;
    for (let i = 0; i < 20_000; i++) {
      if (r.weighted([{ item: 'common', weight: 9 }, { item: 'rare', weight: 1 }]) === 'rare') rare++;
    }
    expect(rare / 20_000).toBeGreaterThan(0.08);
    expect(rare / 20_000).toBeLessThan(0.12);
    expect(() => r.weighted([])).toThrow();
    expect(() => r.pick([])).toThrow();
  });
});
