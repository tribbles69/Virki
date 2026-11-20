# Working on Virki

- The owner (Aaron) manages the project and doesn't read code. Explain changes in plain terms.
- `r&d/` holds everything that isn't the app itself: DESIGN.md, ROADMAP.md, notes, bug lists.
- When Aaron says "go", take the next unchecked item in `r&d/ROADMAP.md`, build it on a branch, open a PR and tick it off in the roadmap.
- When Aaron says "merge" on a PR, that's approval: merge it.
- Non-critical bugs found mid-feature go in `r&d/BUGS.md` to be fixed in a batch.
- Game logic lives in `src/sim/` and must stay pure and deterministic (no Date.now(), no Math.random() inside it; time and RNG are passed in).
- Content (buildings, units, metals, relics) is data-driven; balance by editing tables, not logic.
- British spelling in UI text (armour, defence).
