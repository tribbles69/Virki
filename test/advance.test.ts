import { describe, expect, it } from 'vitest';
import { advance, newGame, schedule, cancel, nextOfType, type GameState, type Rules } from '../src/sim';

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 10, 20, 12);

// Test-only state extras. The real game adds real fields to GameState.
type TestState = GameState & { log: string[]; wood: number; rolls: number[] };

const start = (): TestState => ({ ...newGame('test-seed', T0), log: [], wood: 0, rolls: [] });
const hours = (t: number) => (t - T0) / HOUR;

// A small toy game: wood grows 10/hour; "tick" reschedules itself hourly and rolls a die.
const rules: Rules = {
  systems: [
    (s, from, to) => {
      (s as TestState).wood += (10 * (to - from)) / HOUR;
    },
  ],
  handlers: {
    note: (s, e) => {
      (s as TestState).log.push(`${e.payload as string}@${hours(e.at)}h`);
    },
    tick: (s, e, ctx) => {
      (s as TestState).rolls.push(ctx.rng.int(1, 6));
      ctx.schedule(e.at + HOUR, 'tick', null);
    },
    wood: (s) => {
      (s as TestState).log.push(`wood=${(s as TestState).wood.toFixed(1)}@${hours(s.time)}h`);
    },
  },
};

describe('advance', () => {
  it('runs events in time order, ties in scheduling order', () => {
    const s = start();
    schedule(s, T0 + 3 * HOUR, 'note', 'c');
    schedule(s, T0 + 1 * HOUR, 'note', 'a');
    schedule(s, T0 + 3 * HOUR, 'note', 'd');
    schedule(s, T0 + 2 * HOUR, 'note', 'b');
    const out = advance(s, T0 + 10 * HOUR, rules) as TestState;
    expect(out.log).toEqual(['a@1h', 'b@2h', 'c@3h', 'd@3h']);
    expect(out.events).toEqual([]);
    expect(out.time).toBe(T0 + 10 * HOUR);
  });

  it('leaves future events queued', () => {
    const s = start();
    schedule(s, T0 + 1 * HOUR, 'note', 'now');
    schedule(s, T0 + 5 * HOUR, 'note', 'later');
    const out = advance(s, T0 + 2 * HOUR, rules) as TestState;
    expect(out.log).toEqual(['now@1h']);
    expect(nextOfType(out, 'note')?.payload).toBe('later');
  });

  it('runs continuous systems up to each event before it fires', () => {
    const s = start();
    schedule(s, T0 + 3 * HOUR, 'wood', null);
    const out = advance(s, T0 + 5 * HOUR, rules) as TestState;
    expect(out.log).toEqual(['wood=30.0@3h']);
    expect(out.wood).toBeCloseTo(50);
  });

  it('a week of catch-up in one go equals checking in every 7 minutes', () => {
    const s = start();
    schedule(s, T0, 'tick', null);
    schedule(s, T0 + 50 * HOUR, 'wood', null);
    const end = T0 + 7 * 24 * HOUR;

    const once = advance(s, end, rules) as TestState;

    let stepped: GameState = s;
    for (let t = T0 + 7 * 60_000; t < end; t += 7 * 60_000) stepped = advance(stepped, t, rules);
    stepped = advance(stepped, end, rules);
    const st = stepped as TestState;

    expect(st.rolls).toEqual(once.rolls);
    expect(st.log).toEqual(once.log);
    expect(st.wood).toBeCloseTo(once.wood, 6);
    expect(st.rng).toBe(once.rng);
    expect(st.events).toEqual(once.events);
    expect(once.rolls.length).toBe(7 * 24 + 1);
  });

  it('same save + same time gives the same result (determinism)', () => {
    const make = () => {
      const s = start();
      schedule(s, T0 + HOUR, 'tick', null);
      return advance(s, T0 + 100 * HOUR, rules);
    };
    expect(make()).toEqual(make());
  });

  it('never mutates the state it was given', () => {
    const s = start();
    schedule(s, T0 + HOUR, 'tick', null);
    const before = structuredClone(s);
    advance(s, T0 + 10 * HOUR, rules);
    expect(s).toEqual(before);
  });

  it('ignores a clock that went backwards', () => {
    const s = start();
    expect(advance(s, T0 - HOUR, rules)).toBe(s);
    expect(advance(s, T0, rules)).toBe(s);
    expect(advance(s, Number.NaN, rules)).toBe(s);
  });

  it('runs events scheduled in the past at the current time', () => {
    const s = start();
    s.time = T0 + 2 * HOUR;
    schedule(s, T0, 'wood', null);
    const out = advance(s, T0 + 3 * HOUR, rules) as TestState;
    expect(out.log).toEqual(['wood=0.0@2h']);
    expect(out.wood).toBeCloseTo(10);
  });

  it('cancel removes a pending event', () => {
    const s = start();
    const id = schedule(s, T0 + HOUR, 'note', 'gone');
    schedule(s, T0 + HOUR, 'note', 'kept');
    expect(cancel(s, id)).toBe(true);
    expect(cancel(s, id)).toBe(false);
    expect((advance(s, T0 + 2 * HOUR, rules) as TestState).log).toEqual(['kept@1h']);
  });

  it('fails loudly on an unknown event type or a runaway loop', () => {
    const s = start();
    schedule(s, T0 + HOUR, 'nope', null);
    expect(() => advance(s, T0 + 2 * HOUR, rules)).toThrow(/no handler/);

    const loop: Rules = {
      systems: [],
      handlers: {
        spin: (_s, e, ctx) => {
          ctx.schedule(e.at, 'spin', null);
        },
      },
    };
    const s2 = start();
    schedule(s2, T0 + HOUR, 'spin', null);
    expect(() => advance(s2, T0 + 2 * HOUR, loop)).toThrow(/too many events/);
  });

  it('state survives a JSON round trip (save file)', () => {
    const s = start();
    schedule(s, T0 + HOUR, 'tick', null);
    const mid = advance(s, T0 + 5 * HOUR, rules);
    const reloaded = JSON.parse(JSON.stringify(mid)) as GameState;
    expect(advance(reloaded, T0 + 20 * HOUR, rules)).toEqual(advance(mid, T0 + 20 * HOUR, rules));
  });
});
