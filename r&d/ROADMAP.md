# Virki — Roadmap

Work down this list in order. When Aaron says "go", pick up the first unchecked item, build it on a branch and open a PR. Design reference: [DESIGN.md](DESIGN.md).

## v0.1 — The village ticks
- [x] Project scaffold: Vite + TypeScript, PWA manifest + service worker, GitHub Pages deploy
- [x] Pure sim core: `advance(state, now)`, event queue, seeded RNG
- [x] Resources: Wood, Stone, Ore (Copper), Population; production and warehouse cap
- [x] Buildings: Great Hall, Woodcutter, Quarry, Farm, Mine, Warehouse; build queue (1 slot)
- [x] Save/load to IndexedDB, offline catch-up, export/import save file
- [x] Placeholder UI: resource bar, building list with upgrade buttons and timers

## v0.2 — First blood
- [x] Barracks + Spearman, Swordsman, Axeman; recruitment queue
- [x] 15×15 map with 8 bandit camps
- [x] Marches with travel time, TW-style battle resolution, loot carry
- [x] Battle reports

## v0.3 — The bandits fight back
- [x] Daily reset at 04:00 local, seeded camp respawn, daily Warlord camp
- [x] Wall (with era art placeholders) and Watchtower
- [x] Bandit raids on the player with warning time
- [x] Hiding Place, Stable + cavalry, Scouts

## v0.4 — Steel and craft
- [x] Smithy: craft-tier research for weapon and armour tracks per unit
- [x] Mine metal tiers, ore by tier, smelting into ingots
- [x] Re-equip units with metal (ingot cost per soldier)
- [x] Veterancy

## v0.5 — The Lord
- [x] Lord's Keep, Lord unit, XP, levels, titles
- [ ] Skill tree (Raider / Warden / Steward)
- [ ] Wounds and recovery
- [ ] Relic drops, relic slots, relic effects

## v0.6 — The Museum
- [ ] Museum building, display slots, passive bonuses
- [ ] Collection sets and set unlocks
- [ ] Gallery view
- [ ] Market + travelling merchant, Silver uses

## v0.7 — Looks the part
- [ ] Locked pixel art style reference + palette
- [ ] Higgsfield → downscale/quantise pipeline script
- [ ] Building sprites by era, unit sprites by craft × metal, village and map views on canvas

## v0.8 — Built to last
- [ ] Balance simulator (Node, uses the real sim core)
- [ ] Tune cost/time curves to the pacing targets in DESIGN §5.2
- [ ] Workshop, Rams, Catapults; strongholds needing siege

## v0.9 — Expansion
- [ ] Herald + claiming a camp as a second village
- [ ] Multi-village UI
- [ ] Local notifications (build done, raid incoming)

## 1.0
- [ ] Bug sweep, save migration tests, polish

## Parked ideas
- Optional Google Drive save backup
- Hardcore mode (permadeath Lord)
- Ambient audio
