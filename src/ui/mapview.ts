import {
  attackBlocker,
  campIntel,
  isScoutingParty,
  campThreat,
  carryCapacity,
  isWarlord,
  nextResetAt,
  RESET_HOUR,
  distanceFromVillage,
  terrainAt,
  travelTime,
  tileIndex,
  troopCount,
  ATTACK_BLOCKER_TEXT,
  MAP_SIZE,
  RESOURCES,
  TERRAIN,
  THREAT_TEXT,
  UNITS,
  UNIT_DATA,
  VILLAGE_POS,
  type Camp,
  type GameState,
  type Troops,
  type UnitId,
} from '../sim';
import { ago, clockTime, countdown, duration, fullNum, shortNum } from './format';

const RES_ICON = { wood: '\u{1FAB5}', stone: '\u{1FAA8}', ore: '⛏️' } as const;
const TERRAIN_ICON: Record<string, string> = { f: '\u{1F332}', h: '⛰️', w: '', '.': '' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const unitLabel = (u: UnitId, n: number) => `${fullNum(n)} ${n === 1 ? UNIT_DATA[u].name : UNIT_DATA[u].plural}`;
const groupLabel = (t: Troops) =>
  UNITS.filter((u) => t[u] > 0)
    .map((u) => unitLabel(u, t[u]))
    .join(', ');

type Selection = { kind: 'village' } | { kind: 'camp'; id: number } | { kind: 'tile'; x: number; y: number };

export interface MapHandlers {
  attack(campId: number, troops: Partial<Troops>): Promise<boolean>;
  recall(marchId: number): void;
}

/** The Map tab: armies on the move, a 15×15 grid of tiles, and a card for the selected tile. */
export class MapView {
  private moving: HTMLElement;
  private movingList: HTMLElement;
  private movingSig = '';
  private movingRows: { title: HTMLElement; time: HTMLElement }[] = [];
  private grid: HTMLElement;
  private tiles: HTMLButtonElement[] = [];
  private detail: HTMLElement;
  private campSig = '';
  private detailSig = '';
  private selected: Selection = { kind: 'village' };
  private last?: GameState;
  /** What the player has typed in the attack form, kept across redraws. */
  private draft: Partial<Record<UnitId, string>> = {};
  private formSummary?: HTMLElement;
  private formNote?: HTMLElement;
  private sendBtn?: HTMLButtonElement;
  private resetLine: HTMLElement;

  constructor(root: HTMLElement, private handlers: MapHandlers) {
    this.moving = el('section', 'card queue');
    this.moving.append(el('h2', 'b-name', 'Armies on the move'));
    this.movingList = el('div', 'stack tight');
    this.moving.append(this.movingList);

    const card = el('section', 'card map-card');
    this.resetLine = el('p', 'reset-line');
    card.append(this.resetLine);
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
    card.append(
      el('p', 'legend muted small', '\u{1F3E0} your village  ⛺ bandit camp (number = toughness)  ☠️ daily Warlord  \u{1F332} forest  ⛰️ hills'),
    );
    this.detail = el('section', 'card');
    root.append(this.moving, card, this.detail);
  }

  /** Select a camp (e.g. "Attack again" from a report) and bring its card into view. */
  selectCamp(id: number) {
    const camp = this.last?.map.camps.find((c) => c.id === id);
    if (!camp) return;
    this.select(camp.x, camp.y);
    requestAnimationFrame(() => this.detail.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  private select(x: number, y: number) {
    if (!this.last) return;
    const camp = this.last.map.camps.find((c) => c.x === x && c.y === y);
    if (x === VILLAGE_POS.x && y === VILLAGE_POS.y) this.selected = { kind: 'village' };
    else if (camp) this.selected = { kind: 'camp', id: camp.id };
    else this.selected = { kind: 'tile', x, y };
    this.draft = {};
    this.update(this.last, Date.now());
  }

  update(s: GameState, now: number): void {
    this.last = s;
    const sig = s.map.terrain + s.map.camps.map((c) => `${c.id}@${c.x},${c.y}`).join(';');
    if (sig !== this.campSig) {
      this.campSig = sig;
      this.drawTiles(s);
    }
    const targeted = new Set(s.marches.filter((m) => m.phase === 'outbound').map((m) => m.campId));
    for (const c of s.map.camps) this.tiles[tileIndex(c.x, c.y)].classList.toggle('targeted', targeted.has(c.id));

    const sel = this.selected;
    const selIndex =
      sel.kind === 'village'
        ? tileIndex(VILLAGE_POS.x, VILLAGE_POS.y)
        : sel.kind === 'tile'
          ? tileIndex(sel.x, sel.y)
          : (() => {
              const c = s.map.camps.find((k) => k.id === sel.id);
              return c ? tileIndex(c.x, c.y) : -1;
            })();
    this.tiles.forEach((t, i) => t.classList.toggle('selected', i === selIndex));
    this.drawMoving(s, now);
    const next = nextResetAt(s);
    this.resetLine.textContent =
      next !== undefined
        ? `Camps respawn in ${countdown(next - now)} (${String(RESET_HOUR).padStart(2, '0')}:00)${s.map.camps.some(isWarlord) ? '' : ' · a Warlord arrives with them'}`
        : '';
    this.drawDetail(s);
  }

  private drawMoving(s: GameState, now: number) {
    this.moving.hidden = s.marches.length === 0;
    const sig = s.marches.map((m) => `${m.id}:${m.phase}`).join('|');
    if (sig !== this.movingSig) {
      this.movingSig = sig;
      this.movingList.replaceChildren();
      this.movingRows = s.marches.map((m) => {
        const row = el('div', 'qrow');
        const head = el('div', 'queue-head');
        const title = el('div', 'queue-title');
        const time = el('div', 'queue-time');
        head.append(title, time);
        row.append(head);
        if (m.phase === 'outbound') {
          const recall = el('button', 'ghost small-btn', 'Recall');
          recall.addEventListener('click', () => this.handlers.recall(m.id));
          row.append(recall);
        }
        this.movingList.append(row);
        return { title, time };
      });
    }
    s.marches.forEach((m, i) => {
      const r = this.movingRows[i];
      if (!r) return;
      const camp = s.map.camps.find((c) => c.id === m.campId);
      const where = camp?.name ?? 'a camp';
      if (m.phase === 'outbound') {
        r.title.textContent = `⚔️ ${groupLabel(m.troops)} → ${where}`;
        r.time.textContent = `arrive ${countdown(m.arriveAt - now)} · ${clockTime(m.arriveAt, now)}`;
      } else {
        const loot = RESOURCES.filter((k) => m.loot[k] > 0).map((k) => `${RES_ICON[k]} ${shortNum(m.loot[k])}`).join(' ');
        r.title.textContent = `↩️ ${groupLabel(m.troops)} from ${where}${m.recalled ? ' (recalled)' : ''}${loot ? ` · ${loot}` : ''}`;
        r.time.textContent = `home ${countdown(m.returnAt - now)} · ${clockTime(m.returnAt, now)}`;
      }
    });
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
      if (isWarlord(c)) {
        t.className = 'tile t-grass camp warlord';
        t.textContent = '☠️';
        t.dataset.tier = 'W';
        t.setAttribute('aria-label', `${c.name}, Warlord camp, leaves at the next reset`);
      } else {
        t.className = 'tile t-grass camp';
        t.textContent = '⛺';
        t.dataset.tier = String(c.tier);
        t.setAttribute('aria-label', `${c.name}, bandit camp, toughness ${c.tier} of 8`);
      }
    }
  }

  private drawDetail(s: GameState) {
    // Only rebuild when something shown would change (not every tick).
    const sel = this.selected;
    const camp = sel.kind === 'camp' ? s.map.camps.find((c) => c.id === sel.id) : undefined;
    const intel = camp ? campIntel(s, camp.id) : undefined;
    // Minute granularity for the "scouted N min ago" line.
    const sig = JSON.stringify([sel, s.troops, camp ?? null, intel ?? null, Math.floor(s.time / 60_000)]);
    if (sig === this.detailSig) return;
    this.detailSig = sig;
    const d = this.detail;
    d.replaceChildren();
    this.formSummary = this.formNote = this.sendBtn = undefined;
    if (sel.kind === 'village') {
      d.append(el('h2', 'b-name', 'Your village'));
      d.append(el('p', 'b-effect', 'The centre of your little world. Tap a bandit camp ⛺ to see what it holds and send an attack.'));
      return;
    }
    if (sel.kind === 'tile') {
      const code = terrainAt(s.map, sel.x, sel.y);
      d.append(el('h2', 'b-name', TERRAIN[code].name));
      d.append(el('p', 'b-effect', `${distanceFromVillage(sel).toFixed(1)} tiles from your village. Nothing of note here.`));
      return;
    }
    if (camp) this.drawCamp(s, camp);
  }

  private drawCamp(s: GameState, camp: Camp) {
    const d = this.detail;
    const head = el('div', 'b-head');
    const warlord = isWarlord(camp);
    head.append(el('h2', 'b-name', camp.name), el('span', 'b-level', warlord ? 'Warlord' : `Toughness ${camp.tier}/8`));
    d.append(head);
    const dist = distanceFromVillage(camp);
    d.append(
      el(
        'p',
        'b-effect',
        warlord
          ? `Today’s Warlord · ${dist.toFixed(1)} tiles away · moves on at ${String(RESET_HOUR).padStart(2, '0')}:00`
          : `Bandit camp · ${dist.toFixed(1)} tiles away`,
      ),
    );

    const emptied = troopCount(camp.troops) === 0;
    const threat = campThreat(s.troops, camp);
    d.append(el('p', `threat threat-${emptied ? 'easy' : threat}`, emptied ? 'Cleared: no bandits left' : THREAT_TEXT[threat]));

    // Exact numbers if you've scouted (or fought) here since the camps last respawned.
    const intel = campIntel(s, camp.id);
    if (intel) {
      const box = el('div', 'intel');
      const who = troopCount(intel.troops) === 0 ? 'no bandits' : groupLabel(intel.troops);
      box.append(
        el('p', 'intel-head', `${intel.source === 'scout' ? 'Scouted' : 'Seen after your attack'} ${ago(s.time - intel.at)}`),
        el('p', 'intel-body', `Bandits: ${who}`),
      );
      d.append(box);
    }

    const loot = el('div', 'b-costs');
    const exactLoot = intel?.loot;
    loot.append(el('span', 'muted', exactLoot ? 'Loot (scouted)' : emptied ? 'Loot left' : 'Loot about'));
    for (const r of RESOURCES) loot.append(el('span', 'cost', `${RES_ICON[r]} ${shortNum((exactLoot ?? camp.loot)[r])}`));
    d.append(loot);

    // Attack form
    const home = UNITS.filter((u) => s.troops[u] > 0);
    const form = el('div', 'attack');
    form.append(el('h3', 'attack-title', 'Send an attack'));
    if (home.length === 0) {
      form.append(el('p', 'b-note', 'No soldiers at home. Train some in the Barracks.'));
      d.append(form);
      return;
    }
    for (const u of home) {
      const row = el('div', 'attack-row');
      const label = el('label', 'attack-label');
      label.append(el('span', undefined, UNIT_DATA[u].plural), el('span', 'muted small', ` ${fullNum(s.troops[u])} home`));
      const input = el('input', 'count');
      input.type = 'number';
      input.inputMode = 'numeric';
      input.min = '0';
      input.max = String(s.troops[u]);
      input.placeholder = '0';
      input.value = this.draft[u] ?? '';
      input.setAttribute('aria-label', `${UNIT_DATA[u].plural} to send`);
      label.htmlFor = input.id = `atk-${u}`;
      input.addEventListener('input', () => {
        this.draft[u] = input.value;
        this.refreshForm(camp);
      });
      const all = el('button', 'ghost small-btn', 'All');
      all.addEventListener('click', () => {
        input.value = String(this.last?.troops[u] ?? 0);
        this.draft[u] = input.value;
        this.refreshForm(camp);
      });
      row.append(label, input, all);
      form.append(row);
    }
    this.formSummary = el('p', 'b-note');
    this.formNote = el('p', 'b-note error');
    this.sendBtn = el('button', 'upgrade send', 'Send attack');
    this.sendBtn.addEventListener('click', async () => {
      const troops = this.draftTroops();
      if (await this.handlers.attack(camp.id, troops)) {
        this.draft = {};
        this.detailSig = '';
        if (this.last) this.drawDetail(this.last);
      }
    });
    form.append(this.formSummary, this.formNote, this.sendBtn);
    d.append(form);
    this.refreshForm(camp);
  }

  private draftTroops(): Partial<Troops> {
    const t: Partial<Troops> = {};
    for (const u of UNITS) {
      const v = this.draft[u];
      if (v !== undefined && v !== '') t[u] = Number(v);
    }
    return t;
  }

  private refreshForm(camp: Camp) {
    if (!this.last || !this.formSummary || !this.formNote || !this.sendBtn) return;
    const troops = this.draftTroops();
    const n = troopCount(troops);
    const blocker = attackBlocker(this.last, camp.id, troops);
    const scouting = isScoutingParty(troops);
    if (n > 0 && Number.isFinite(n)) {
      const t = travelTime(troops, distanceFromVillage(camp));
      this.formSummary.textContent = scouting
        ? `Scouting mission · ${fullNum(n)} scout${n === 1 ? '' : 's'} · no fighting · arrive in ${duration(t)}`
        : `${fullNum(n)} soldier${n === 1 ? '' : 's'} · carry ${fullNum(carryCapacity(troops))} · arrive in ${duration(t)}`;
    } else {
      this.formSummary.textContent = '';
    }
    this.formNote.textContent = blocker && n > 0 ? ATTACK_BLOCKER_TEXT[blocker] : '';
    this.sendBtn.disabled = !!blocker;
    this.sendBtn.textContent = scouting ? 'Send scouts' : 'Send attack';
  }
}
