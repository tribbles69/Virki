# Virki — Design Doc

*Virki* (Icelandic: fortress, stronghold). A single-player, real-time village builder in the spirit of Tribal Wars and Travian. There are no other players, no tribes and no Discord politics. You get one village, a tiny map, bandits that respawn daily and a progression curve built to last years.

Status: **draft v0.1** (20 Nov 2026). All numbers are starting points and will be tuned with the balance simulator (see §12).

---

## 1. Pillars

1. **Check in, not grind.** Sessions of 1–5 minutes: queue builds, send raids, collect loot, close the app. Everything runs on the real clock while you're away.
2. **Always something ticking.** There's always a build, a research, a march or a daily reset about to land.
3. **Years of progression.** The game has many building levels, two gear axes per unit, a levelling Lord, relics and a museum. Progress slows down but never stops.
4. **You can see your progress.** Walls, buildings and troop sprites all change as they upgrade.
5. **Your data stays yours.** Offline-first PWA with saves on the device and export/backup to your own drive. No server.

---

## 2. Core loop

```
Resources tick up → spend on buildings / troops / research
        ↓
Train troops → raid bandit camps on the map → loot + XP + relic chance
        ↓
Daily reset (04:00 local) → camps respawn, new daily Warlord camp
        ↓
Bandits occasionally raid you → walls, watchtower and defence matter
        ↓
Relics → Lord's slots or the Museum → permanent bonuses → stronger raids
```

---

## 3. Time model

- All actions use **real timestamps** (build finishes at `t`, army arrives at `t`).
- When the app opens, the game **catches up**: it resolves every event in time order (production, finished builds, arrivals, battles) since the last save. The game logic is a pure function `advance(state, now)` with no setInterval drift.
- Production is continuous, `rate × elapsed`, capped by warehouse storage.
- **No offline cap** beyond storage limits. Being away for a week costs you nothing except overflow.
- Notifications (later): local push when a build finishes or an incoming raid is spotted.

---

## 4. Resources

| Resource | Source | Used for |
|---|---|---|
| **Wood** | Woodcutter | Buildings, bows, siege |
| **Stone** | Quarry | Buildings, walls |
| **Ore** (by metal tier) | Mine | Smelted into ingots for gear |
| **Food / Population** | Farm | Population cap, as in TW: buildings and troops take pop |
| **Silver** | Raid loot, Market | Lord, museum, relic restoration, merchant |

**Metal tiers** (unlocked by Mine level). Ore for each tier is produced at a slower rate than the tier below:

| # | Metal | Mine level | Gear multiplier |
|---|---|---|---|
| 1 | Copper | 1 | ×1.00 |
| 2 | Bronze | 10 | ×1.15 |
| 3 | Iron | 20 | ×1.32 |
| 4 | Steel | 35 | ×1.52 |
| 5 | Damascus | 50 | ×1.75 |
| 6 | Mithril | 65 | ×2.00 |
| 7 | Adamant | 80 | ×2.30 |
| 8 | Orichalcum | 90 | ×2.65 |
| 9 | Starmetal | 100 | ×3.05 |

---

## 5. Buildings

Many more levels than TW (where most buildings capped at 20–30). Art changes at **every era** (marked ★).

| Building | Max | Purpose | Visual eras |
|---|---|---|---|
| **Great Hall** | 100 | Unlocks buildings, speeds construction | ★ every 10 |
| Woodcutter | 100 | Wood | ★ every 20 |
| Quarry | 100 | Stone | ★ every 20 |
| Farm | 100 | Population cap | ★ every 20 |
| **Mine** | 100 | Ore, unlocks metal tiers | ★ per metal |
| Warehouse | 100 | Storage cap | ★ every 20 |
| Hiding Place | 30 | Protects some resources from bandit raids | — |
| Barracks | 60 | Infantry, archers | ★ every 15 |
| Stable | 60 | Cavalry | ★ every 15 |
| Workshop | 40 | Rams, catapults | ★ every 10 |
| **Smithy** | 100 | Craft-tier research per unit (armour & weapons) | ★ every 20 |
| **Wall** | 100 | Defence bonus, see §5.1 | ★ every 10 |
| Watchtower | 30 | Early warning on incoming raids, scouting range | ★ every 10 |
| Market | 40 | Travelling merchant: trade resources, buy rare items | — |
| **Lord's Keep** | 50 | Lord level cap, relic slots | ★ every 10 |
| **Museum** | 60 | Relic display slots, see §9 | ★ every 10 |

### 5.1 Wall eras
| Levels | Look |
|---|---|
| 1–9 | Wooden stakes |
| 10–19 | Palisade |
| 20–29 | Earth rampart + palisade |
| 30–39 | Dry-stone wall |
| 40–49 | Mortared stone + wooden towers |
| 50–59 | Stone towers + gatehouse |
| 60–69 | Curtain wall + moat |
| 70–79 | Concentric walls |
| 80–89 | Star fort bastions |
| 90–100 | Mythic citadel (rune-carved, glowing) |

Wall defence bonus: `1 + 0.037 × level` up to L20 (TW-like), then a slower `+0.02/level`, so L100 gives ≈ ×3.34.

### 5.2 Cost & time curves (draft)
Three segments so early levels feel quick and late levels become long-term goals:

```
cost(L)  = base × r^(L-1)
  L 1–30:   r = 1.26   (classic TW feel)
  L 31–60:  r = 1.10   (slower growth, but times stretch)
  L 61–100: r = 1.06
time(L)  = baseTime × t^(L-1) × hallSpeed(hallLevel)
```

Target pacing for an active player (2–4 check-ins/day):
- Week 1: everything to around L10, first raids.
- Month 1: Hall ~25, Bronze, first relic.
- Month 3: Hall ~40, Iron/Steel, museum filling up.
- Year 1: Hall ~65, Mithril.
- Year 3+: Hall 100, Starmetal, full museum sets.

---

## 6. Troops

| Unit | Role | Building | Speed (min/tile) | Carry |
|---|---|---|---|---|
| Spearman | Anti-cavalry defence | Barracks | 18 | 25 |
| Swordsman | Infantry defence | Barracks | 22 | 15 |
| Axeman | Infantry attack | Barracks | 18 | 10 |
| Archer | Ranged defence | Barracks | 18 | 10 |
| Scout | Intel | Stable | 9 | 0 |
| Light Cavalry | Fast raider | Stable | 10 | 80 |
| Heavy Cavalry | All-rounder | Stable | 11 | 50 |
| Ram | Wall breaker | Workshop | 30 | 0 |
| Catapult | Building damage (bandit strongholds) | Workshop | 30 | 0 |
| Herald | Claims a camp as a 2nd village (late game) | Lord's Keep | 35 | 0 |

Base stats are TW-inspired (attack, defence vs infantry / cavalry / archers).

### 6.1 Gear: two axes per unit
Each unit type has a **weapon** track and an **armour** track. Each track has:

- **Craft tier**, researched in the Smithy, per unit:
  `Rags → Padded → Leather → Studded → Mail → Scale → Plate → Masterwork → Runeforged`
  (multiplier ×1.00 → ×2.20)
- **Metal tier**, picked from the metals the Mine has unlocked. Re-equipping a unit type costs ingots per soldier, so upgrading a big army is a real sink.

```
attack  = base_att × craft_weapon_mult × metal_weapon_mult × veterancy
defence = base_def × craft_armour_mult × metal_armour_mult × veterancy
```

So "Bronze Plate" and "Mithril Leather" are both valid builds, and **Starmetal Runeforged** is the multi-year goal. Each craft × metal pair gets its own sprite variant (palette swap on metal, silhouette change on craft).

### 6.2 Veterancy
Surviving units add to a per-type veterancy pool: Recruit → Regular → Veteran → Elite → Legend (+0% → +25%). Losses dilute it, which rewards not wasting troops.

---

## 7. Map & bandits

- **15 × 15 tile map**, your village in the centre.
- **8 bandit camps** at varied distances, plus 1 **Warlord camp** each day.
- **Daily reset at 04:00 local**: all camps respawn with fresh troops and loot. Seeded by date, so a given day is reproducible.
- Camp strength scales with **your** power (a rubber band) within a band per camp, so near camps are easy farms and far camps are tough.
- Camp types: Raider camp (loot), Outlaw fort (needs rams), Bandit stronghold (catapults, relic chance), Warlord camp (daily boss, highest relic chance).
- **Bandit raids**: from time to time a camp attacks you. The Watchtower gives warning (L1 = 5 min → L30 = several hours), so you can recall troops, hide resources or just trust the wall.
- **Late game**: send a Herald to claim a camp as a **second village**, TW nobling style, with loyalty dropping per Herald hit. More villages mean more map and more production, without needing a prestige reset.

### 7.1 Battle (TW-style)
- Attacker's total attack (split by unit class) vs defender's defence for that class, with the wall multiplier.
- Rams reduce wall level before the battle.
- Luck ±15% (seeded).
- The loser loses everything. The winner loses `(loser_power / winner_power)^1.5` of their units.
- A battle report shows both sides, losses, loot and any relic.

---

## 8. The Lord (Hersir)

- One unique hero who can travel with an army. He doesn't die. If his army loses, he's **wounded** (recovery takes real time and can be sped up with silver).
- **Levels** from battle XP. The level cap is set by the Lord's Keep.
- **Titles** by level: Thane → Hersir → Jarl → High Jarl → King (cosmetic + bonuses).
- **Skill tree**, three branches:
  - *Raider*: carry, march speed, loot
  - *Warden*: defence, wall bonus, early warning
  - *Steward*: production, build speed, merchant prices
- **Relic slots**: 1 at the start, up to 4 via the Lord's Keep. Relics only work while equipped or on display in the Museum (§9).

---

## 9. Relics & the Museum

**Relics** are the uniques. They drop from camps (chance rising with camp difficulty; the Warlord camp is best), sometimes come from the travelling merchant, and appear as rare daily events.

- Rarity: Common → Rare → Epic → Legendary → Mythic.
- Each one has a name, pixel art, a short flavour text and an effect, e.g. *Ulfr's Notched Axe*: +8% Axeman attack.
- Some drop **damaged** and need silver plus time to restore.

**The Museum**
- Displayed relics give a **permanent passive** at 25% of their equipped effect.
- Display slots come from Museum level.
- **Collection sets**: complete a set (e.g. *The Bandit King's Regalia*: crown, blade, banner, ring) for a big unlock such as a new troop skin, extra Lord slot, metal discount or a special building.
- There's a gallery view to browse your whole collection, which is the long-term trophy cabinet.

---

## 10. Art direction

- **Pixel art.** 32×32 for units and icons, 64×64 for building tiles, with a fixed palette (~32 colours).
- Village view: a top-down/isometric-ish plot where every building sprite updates by era.
- **Pipeline:** generate in Higgsfield from one locked style reference → script downscales to a true pixel grid and quantises to the palette → manual touch-ups if needed. Placeholder art (simple coloured shapes) until then.
- Audio (later): light ambient village sounds, horn for incoming raids. ElevenLabs placeholders are an option.

---

## 11. Tech

- **Installable PWA** (Android home screen, offline). Hosted on GitHub Pages.
- **Vanilla TypeScript + Vite**, no heavy framework. DOM UI plus a `<canvas>` for the village/map views.
- **Game logic is a pure, deterministic module** (`src/sim/`): state in, events in, state out. The UI never mutates state directly. This makes catch-up, testing and the balance simulator all use the same code.
- **Seeded RNG** (date + save seed) for daily rolls, luck and loot.
- **Saves**: IndexedDB, autosave on every action, versioned schema with migrations. Export/import a save file; later, optional backup to the player's own Google Drive.
- **Data-driven content**: buildings, units, metals, relics and camps live in JSON/TS tables so balancing is just editing numbers.

---

## 12. Balance simulator

A Node script that plays a scripted "reasonable player" (3 check-ins/day) for N simulated days using the real game logic, and outputs when milestones are reached (Hall levels, metals, first relic, museum sets). It's used to tune the curves in §5.2 to hit the pacing targets *before* anyone has to play for years to find out.

---

## 13. Open questions

1. Village view: proper isometric, or a flat top-down plot?
2. Should the Lord be able to permanently die (hardcore option) or only be wounded?
3. Second village: in v1, or save it for later?
4. Night/day cycle tied to real time?
5. Any Gnostic/Norse flavour in relic names and lore, or keep it generic fantasy-medieval?
