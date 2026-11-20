# sim

Pure, deterministic game logic. No `Date.now()`, no `Math.random()`, no timers, no DOM.
Time and randomness are passed in. `test/sim-purity.test.ts` enforces this. See CLAUDE.md and r&d/DESIGN.md §3 and §11.

- `state.ts`: `GameState` (the whole save, plain JSON) and `newGame(seed, now)`.
- `events.ts`: the event queue: `schedule`, `cancel`, `nextOfType`. Same-time events run in the order they were scheduled.
- `advance.ts`: `advance(state, now, rules?)` resolves every due event in time order and returns a new state. Between events it runs the continuous **systems** (e.g. production). Systems must be additive so that catching up a week in one go equals live play.
- `rules.ts`: the live game's systems and event handlers. Features register here.
- `rng.ts`: seeded `Rng` (mulberry32) whose state is saved in `GameState.rng`; `deriveSeed(seed, key)` gives independent streams (e.g. per day).
- `curve.ts`: segmented growth curves (DESIGN §5.2) used by every balance table.
- `economy.ts`: production per hour, Warehouse cap, population (Farm cap vs buildings), `canAfford`, `timeUntilAffordable`, and the `production` system.
- `data/`: balance tables (resources, buildings). Tune numbers here, not in the logic.
