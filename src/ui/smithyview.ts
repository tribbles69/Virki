import {
  craftMult,
  craftName,
  researchBlockerText,
  researchInfo,
  BUILDING_DATA,
  RESOURCES,
  TRACKS,
  UNITS,
  equipBlockerText,
  equipInfo,
  metalMult,
  unlockedMetals,
  INGOTS_PER_SOLDIER,
  METAL_DATA,
  type MetalId,
  UNIT_DATA,
  type GameState,
  type Track,
  type UnitId,
} from '../sim';
import { clockTime, countdown, duration, shortNum } from './format';

const RES_ICON = { wood: '\u{1FAB5}', stone: '\u{1FAA8}', ore: '⛏️' } as const;
const TRACK_LABEL: Record<Track, string> = { weapon: 'Weapons', armour: 'Armour' };
const TRACK_STAT: Record<Track, string> = { weapon: 'attack', armour: 'defence' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface SmithyHandlers {
  research(unit: UnitId, track: Track): void;
  cancel(): void;
  equip(unit: UnitId, track: Track, metal: MetalId): void;
}

interface Row {
  now: HTMLElement;
  next: HTMLElement;
  cost: HTMLElement;
  note: HTMLElement;
  button: HTMLButtonElement;
  metalSelect: HTMLSelectElement;
  equipBtn: HTMLButtonElement;
  equipNote: HTMLElement;
}

/** Smithy section of the Army tab: research in progress, then weapons and armour for each unit. */
export class SmithyView {
  private head: HTMLElement;
  private intro: HTMLElement;
  private body: HTMLElement;
  private job: HTMLElement;
  private jobTitle: HTMLElement;
  private jobTime: HTMLElement;
  private jobFill: HTMLElement;
  private rows = {} as Record<UnitId, Record<Track, Row>>;
  private metalsSig = '';
  private last?: GameState;

  constructor(root: HTMLElement, handlers: SmithyHandlers) {
    this.head = el('h2', 'group-head', 'Smithy');
    this.intro = el('p', 'muted small smithy-intro');
    root.append(this.head, this.intro);

    this.body = el('div', 'stack tight');
    root.append(this.body);

    this.job = el('section', 'card queue');
    const jh = el('div', 'queue-head');
    this.jobTitle = el('div', 'queue-title');
    this.jobTime = el('div', 'queue-time');
    jh.append(this.jobTitle, this.jobTime);
    const meter = el('div', 'meter big');
    this.jobFill = el('div', 'meter-fill');
    meter.append(this.jobFill);
    const cancel = el('button', 'ghost small-btn', 'Cancel');
    cancel.addEventListener('click', () => handlers.cancel());
    this.job.append(jh, meter, cancel);
    this.body.append(this.job);

    for (const u of UNITS) {
      const card = el('article', 'card smithy-unit');
      card.append(el('h3', 'smithy-name', UNIT_DATA[u].name));
      this.rows[u] = {} as Record<Track, Row>;
      for (const t of TRACKS) {
        const row = el('div', 'smithy-row');
        const text = el('div', 'smithy-text');
        const now = el('div', 'smithy-now');
        const next = el('div', 'smithy-next');
        const cost = el('div', 'smithy-cost');
        const note = el('div', 'b-note');
        text.append(now, next, cost, note);
        const button = el('button', 'upgrade small-btn', 'Research');
        button.addEventListener('click', () => handlers.research(u, t));
        row.append(text, button);
        // Metal: pick what this track is made of; ingots for every soldier of the type.
        const equipRow = el('div', 'equip-row');
        const metalSelect = el('select', 'count metal-select');
        metalSelect.setAttribute('aria-label', `${UNIT_DATA[u].name} ${TRACK_LABEL[t].toLowerCase()} metal`);
        const equipBtn = el('button', 'ghost small-btn', 'Equip');
        const equipNote = el('div', 'b-note');
        equipRow.append(metalSelect, equipBtn);
        metalSelect.addEventListener('change', () => this.last && this.refreshEquip(this.last, u, t));
        equipBtn.addEventListener('click', () => handlers.equip(u, t, metalSelect.value as MetalId));
        card.append(row, equipRow, equipNote);
        this.rows[u][t] = { now, next, cost, note, button, metalSelect, equipBtn, equipNote };
      }
      this.body.append(card);
    }
  }

  update(s: GameState, now: number): void {
    const lvl = s.buildings.smithy;
    this.head.textContent = lvl > 0 ? `Smithy · level ${lvl}` : 'Smithy · not built yet';
    this.intro.textContent =
      lvl > 0
        ? 'Research better weapons (attack) and armour (defence) for each unit. Higher craft tiers need a bigger Smithy.'
        : `Build a Smithy in the Village (needs ${Object.entries(BUILDING_DATA.smithy.requires ?? {})
            .map(([b, l]) => `${BUILDING_DATA[b as keyof typeof BUILDING_DATA].name} ${l}`)
            .join(', ')}) to research better weapons and armour.`;
    this.last = s;
    this.body.hidden = lvl === 0;
    if (lvl === 0) return;

    // Rebuild the metal pickers only when a new metal unlocks.
    const metals = unlockedMetals(s);
    const metalsSig = metals.join(',');
    if (metalsSig !== this.metalsSig) {
      this.metalsSig = metalsSig;
      for (const u of UNITS) {
        for (const t of TRACKS) {
          const sel = this.rows[u][t].metalSelect;
          sel.replaceChildren(...metals.map((m) => Object.assign(el('option', undefined, METAL_DATA[m].name), { value: m })));
          sel.value = s.equipment[u][t];
        }
      }
    }

    const job = s.researchQueue[0];
    this.job.hidden = !job;
    if (job) {
      this.jobTitle.textContent = `${UNIT_DATA[job.unit].name} ${TRACK_LABEL[job.track].toLowerCase()} → ${craftName(job.toTier)}`;
      this.jobTime.textContent = `${countdown(job.finishesAt - now)} · done ${clockTime(job.finishesAt, now)}`;
      this.jobFill.style.width = `${Math.min(100, Math.max(0, ((now - job.startedAt) / (job.finishesAt - job.startedAt)) * 100))}%`;
    }

    for (const u of UNITS) {
      for (const t of TRACKS) {
        const r = this.rows[u][t];
        const info = researchInfo(s, u, t);
        const metal = s.equipment[u][t];
        r.now.textContent = `${TRACK_LABEL[t]}: ${craftName(info.tier)} ${METAL_DATA[metal].name} (×${(craftMult(info.tier) * metalMult(metal)).toFixed(2)} ${TRACK_STAT[t]})`;
        this.refreshEquip(s, u, t);
        const maxed = info.blocker === 'max-tier';
        const researching = s.researchQueue.some((j) => j.unit === u && j.track === t);
        r.next.textContent = maxed
          ? 'Finest craft reached'
          : `Next: ${craftName(info.nextTier)} ×${craftMult(info.nextTier).toFixed(2)}${researching ? ' (after current research)' : ''}`;
        r.cost.textContent = maxed ? '' : `${RESOURCES.map((k) => `${RES_ICON[k]} ${shortNum(info.cost[k])}`).join('  ')}  ⏱ ${duration(info.time)}`;
        r.cost.hidden = maxed;
        r.button.disabled = !!info.blocker;
        r.button.hidden = maxed;
        r.note.textContent =
          info.blocker === 'resources' && info.wait !== undefined && Number.isFinite(info.wait)
            ? `Enough in ${countdown(info.wait)}`
            : info.blocker && !maxed
              ? researchBlockerText(info)
              : '';
      }
    }
  }

  private refreshEquip(s: GameState, u: UnitId, t: Track) {
    const r = this.rows[u][t];
    const metal = (r.metalSelect.value || 'copper') as MetalId;
    const info = equipInfo(s, u, t, metal);
    const current = s.equipment[u][t];
    r.equipBtn.disabled = !!info.blocker;
    r.equipBtn.textContent = info.blocker === 'same' ? `In ${METAL_DATA[current].name}` : info.ingots > 0 ? `Equip · ${shortNum(info.ingots)} ingots` : 'Equip';
    r.equipNote.textContent =
      info.blocker === 'same'
        ? ''
        : info.blocker
          ? equipBlockerText(info)
          : info.ingots > 0
            ? `Arms all ${shortNum(info.soldiers)} ${UNIT_DATA[u].plural} (${INGOTS_PER_SOLDIER[u]} ingot${INGOTS_PER_SOLDIER[u] === 1 ? '' : 's'} each) · ${METAL_DATA[metal].name} ×${metalMult(metal).toFixed(2)}`
            : `Switch to ${METAL_DATA[metal].name} ×${metalMult(metal).toFixed(2)} (free, no refund)`;
  }
}
