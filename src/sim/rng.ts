// Seeded, serialisable random numbers. The whole generator state is one uint32,
// so it lives inside GameState and a save always replays the same rolls.
// Algorithm: mulberry32 (fast, good enough for game rolls, not for crypto).

export type RngState = number;

/** Hash any string (save seed, date key, camp id...) into a 32-bit seed. FNV-1a. */
export function hashSeed(text: string): RngState {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Derive an independent stream, e.g. deriveSeed(saveSeed, 'daily:2026-11-21'). */
export function deriveSeed(seed: RngState | string, key: string): RngState {
  return hashSeed(`${seed}|${key}`);
}

/**
 * A generator working on a copy of a state. Use it inside one sim step, then
 * write `rng.state` back into GameState.
 */
export class Rng {
  state: RngState;

  constructor(state: RngState) {
    this.state = state >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with the given probability (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Uniform pick from a non-empty list. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty list');
    return items[Math.floor(this.next() * items.length)];
  }

  /** Pick by weight. Weights must be >= 0 with a positive total. */
  weighted<T>(items: readonly { item: T; weight: number }[]): T {
    const total = items.reduce((s, i) => s + i.weight, 0);
    if (!(total > 0)) throw new Error('Rng.weighted: total weight must be > 0');
    let roll = this.next() * total;
    for (const i of items) {
      roll -= i.weight;
      if (roll < 0) return i.item;
    }
    return items[items.length - 1].item;
  }
}
