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
- `build.ts`: building costs and times, `upgradeInfo` (cost, time, population, and why it is blocked), `startUpgrade`, `cancelLastUpgrade`, and the `build-complete` event handler. Commands are pure: advance to now first, then apply.
- `recruit.ts`: training soldiers. `recruit` pays for a batch up front; soldiers train one at a time (one `recruit-done` event in flight) and batches run in order. `cancelRecruit` refunds the untrained ones. Troops (home and in training) count against population.
- `map.ts`: `generateMap(seed, playerAttack)` makes the 15×15 terrain and 8 camps (tier 1 nearest .. 8 farthest), seeded from the save. Also `distance`, `travelTime`, `armyAttack` / `armyDefence`, the rubber-band `campGarrison`, `campLoot` and `campThreat`.
- `battle.ts`: `fight` (TW-style: attack vs class-weighted defence, ±15% seeded luck, loser loses all, winner loses (loser/winner)^1.5), `carryCapacity`, `takeLoot` (even split across resources).
- `march.ts`: `sendAttack`, `recallMarch`, `march-arrive` (battle, loot, report, turn for home) and `march-return` (soldiers and loot home) handlers. Soldiers away still use population. Reports are capped at 50.
- `reports.ts`: report inbox commands: `unreadReports`, `markReportRead`, `markAllReportsRead`, `deleteReport`.
- `daily.ts`: the 04:00 reset. `scheduleResets` queues reset times the app works out from the device clock (the sim never reads clocks); the `daily-reset` handler respawns every camp (rubber band on the whole army, seeded ±10% by date) and places the day's Warlord camp.
- `defence.ts`: `wallMultiplier` (×1.74 at L20, ≈×3.34 at L100), `wallEra` (10 looks, DESIGN §5.1), `watchtowerWarning` (5 min at L1 → ~6 h at L30). Used by bandit raids.
- `raid.ts`: bandit raids. `rollRaids` (called by the daily reset with the day's RNG; none before a Barracks) and the `raid-arrive` handler (soldiers at home + militia, × Wall; losers lose all; raiders steal up to their carry). `visibleRaids` / `raidSpottedAt` use the Watchtower warning.
- Units have a class (infantry / cavalry / scout): defence is weighted by the attacker's mix. All-scout marches go scouting instead of fighting (`isScoutingParty`); `campIntel` gives the freshest exact picture of a camp since the last reset. The Barracks and Stable each train their own queue at the same time (`queueFor`). The Hiding Place (`hiddenAmount`) keeps some of each resource out of raiders' reach.
- `smithy.ts`: craft-tier research per unit and track (weapon → attack, armour → defence; DESIGN §6.1). `researchInfo` / `startResearch` / `cancelResearch` and the `research-complete` handler; `playerGear` turns tiers into the `Gear` multipliers that `fight`, threat ratings and the rubber band use. Bandits fight with no gear.
- `metals.ts`: nine metal tiers unlocked by Mine level (DESIGN §4). Higher ores are mined alongside copper at a fraction of its rate (`metalProduction`, capped by the Warehouse); the forge (`smelt`, `cancelLastSmelt`, `smelt-done`) turns 4 ore + wood into an ingot. Copper ore stays the everyday `ore` resource.
- `equip.ts`: the metal of each unit type's weapons and armour. `equip` re-arms every soldier of the type (home, marching, in training) for `INGOTS_PER_SOLDIER` each; downgrades are free. New recruits of an upgraded type cost ingots (`ingotsPerRecruit`). `playerGear` multiplies craft tier × metal.
