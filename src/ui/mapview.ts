import {
  campThreat,
  distanceFromVillage,
  terrainAt,
  travelTime,
  tileIndex,
  MAP_SIZE,
  RESOURCES,
  TERRAIN,
  THREAT_TEXT,
  UNITS,
  UNIT_DATA,
  VILLAGE_POS,
  type Camp,
  type GameState,
} from '../sim';
import { duration, shortNum } from './format';

const RES_ICON = { wood: '\u{1FAB5}', stone: '\u{1FAA8}', ore: '⛏️' } as const;
const TERRAIN_ICON: Record<string, string> = { f: '\u{1F332}', h: '⛰️', w: '', '.': '' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

type Selection = { kind: 'village' } | { kind: 'camp'; id: number } | { kind: 'tile'; x: number; y: number };

/** The Map tab: a 15×15 grid of tiles and a card describing the selected one. */
export class MapView {
  private grid: HTMLElement;
  private tiles: HTMLButtonElement[] = [];
  private detail: HTMLElement;
  private campSig = '';
  private selected: Selection = { kind: 'village' };
  private last?: GameState;

  constructor(root: HTMLElement) {
    const card = el('section', 'card map-card');
    this.grid = el('div', 'map-grid');
    this.grid.setAttribute('role', 'grid');
    this.grid.style.setProperty('--n', String(MAP_SIZE));
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const t = el('button', 'tile');
        t.addEventListener('click', () => this.select(x, y));
        this.grid.append(t);
        this.tiles.push(t);
      }
    }
    card.append(this.grid);
    const legend = el('p', 'legend muted small', '\u{1F3E0} your village  ⛺ bandit camp (number = toughness)  \u{1F332} forest  ⛰️ hills');
    card.append(legend);
    this.detail = el('section', 'card');
    root.append(card, this.detail);
  }

  private select(x: number, y: number) {
    if (!this.last) return;
    const camp = this.last.map.camps.find((c) => c.x === x && c.y === y);
    if (x === VILLAGE_POS.x && y === VILLAGE_POS.y) this.selected = { kind: 'village' };
    else if (camp) this.selected = { kind: 'camp', id: camp.id };
    else this.selected = { kind: 'tile', x, y };
    this.update(this.last);
  }

  update(s: GameState): void {
    this.last = s;
    const sig = s.map.terrain + s.map.camps.map((c) => `${c.id}@${c.x},${c.y}`).join(';');
    if (sig !== this.campSig) {
      this.campSig = sig;
      this.drawTiles(s);
    }
    const selIndex =
      this.selected.kind === 'village'
        ? tileIndex(VILLAGE_POS.x, VILLAGE_POS.y)
        : this.selected.kind === 'tile'
          ? tileIndex(this.selected.x, this.selected.y)
          : (() => {
              const id = (this.selected as { id: number }).id;
              const c = s.map.camps.find((k) => k.id === id);
              return c ? tileIndex(c.x, c.y) : -1;
            })();
    this.tiles.forEach((t, i) => t.classList.toggle('selected', i === selIndex));
    this.drawDetail(s);
  }

  private drawTiles(s: GameState) {
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const t = this.tiles[tileIndex(x, y)];
        const code = terrainAt(s.map, x, y);
        t.className = `tile t-${code === '.' ? 'grass' : code}`;
        t.textContent = TERRAIN_ICON[code];
        t.setAttribute('aria-label', `${TERRAIN[code].name}, ${x},${y}`);
      }
    }
    const v = this.tiles[tileIndex(VILLAGE_POS.x, VILLAGE_POS.y)];
    v.className = 'tile t-grass village';
    v.textContent = '\u{1F3E0}';
    v.setAttribute('aria-label', 'Your village');
    for (const c of s.map.camps) {
      const t = this.tiles[tileIndex(c.x, c.y)];
      t.className = 'tile t-grass camp';
      t.textContent = '⛺';
      t.dataset.tier = String(c.tier);
      t.setAttribute('aria-label', `${c.name}, bandit camp, toughness ${c.tier} of 8`);
    }
  }

  private detailSig = '';

  private drawDetail(s: GameState) {
    // Only rebuild when something shown would change (not every tick).
    const sel = this.selected;
    const sig = JSON.stringify([sel, s.troops, s.map.camps.find((c) => sel.kind === 'camp' && c.id === sel.id) ?? null]);
    if (sig === this.detailSig) return;
    this.detailSig = sig;
    const d = this.detail;
    d.replaceChildren();
    if (sel.kind === 'village') {
      d.append(el('h2', 'b-name', 'Your village'));
      d.append(el('p', 'b-effect', 'The centre of your little world. Tap a bandit camp ⛺ to see what it holds.'));
      return;
    }
    if (sel.kind === 'tile') {
      const code = terrainAt(s.map, sel.x, sel.y);
      d.append(el('h2', 'b-name', TERRAIN[code].name));
      d.append(el('p', 'b-effect', `${distanceFromVillage(sel).toFixed(1)} tiles from your village. Nothing of note here.`));
      return;
    }
    const camp = s.map.camps.find((c) => c.id === sel.id);
    if (!camp) return;
    this.drawCamp(s, camp);
  }

  private drawCamp(s: GameState, camp: Camp) {
    const d = this.detail;
    const head = el('div', 'b-head');
    head.append(el('h2', 'b-name', camp.name), el('span', 'b-level', `Toughness ${camp.tier}/8`));
    d.append(head);

    const dist = distanceFromVillage(camp);
    d.append(el('p', 'b-effect', `Bandit camp · ${dist.toFixed(1)} tiles away`));

    const threat = campThreat(s.troops, camp);
    const t = el('p', `threat threat-${threat}`, THREAT_TEXT[threat]);
    d.append(t);

    const loot = el('div', 'b-costs');
    loot.append(el('span', 'muted', 'Loot about'));
    for (const r of RESOURCES) loot.append(el('span', 'cost', `${RES_ICON[r]} ${shortNum(camp.loot[r])}`));
    d.append(loot);

    const march = el('div', 'b-costs muted small');
    march.style.marginTop = '8px';
    march.append(el('span', undefined, 'March:'));
    const speeds = [...new Set(UNITS.map((u) => UNIT_DATA[u].speed))].sort((a, b) => a - b);
    for (const sp of speeds) {
      const who = UNITS.filter((u) => UNIT_DATA[u].speed === sp).map((u) => UNIT_DATA[u].plural).join(', ');
      const unit = UNITS.find((u) => UNIT_DATA[u].speed === sp)!;
      march.append(el('span', 'cost', `${who} ${duration(travelTime({ [unit]: 1 }, dist))}`));
    }
    d.append(march);
    d.append(el('p', 'b-note', 'Attacking arrives in the next update. Exact numbers need scouts (v0.3).'));
  }
}
