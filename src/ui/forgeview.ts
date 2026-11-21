import {
  maxSmeltable,
  orePerHour,
  oreStock,
  smeltBlocker,
  smeltBlockerText,
  smeltTimePerIngot,
  unlockedMetals,
  METALS,
  METAL_DATA,
  ORE_PER_INGOT,
  type GameState,
  type MetalId,
} from '../sim';
import { clockTime, compactNum, countdown, duration, fullNum, shortNum } from './format';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface ForgeHandlers {
  smelt(metal: MetalId, count: number): Promise<boolean>;
  cancel(): void;
}

/** The forge: metal stocks, smelting ore into ingots, and the batches in the furnace. */
export class ForgeView {
  private card: HTMLElement;
  private table: HTMLTableSectionElement;
  private tableSig = '';
  private cells: Partial<Record<MetalId, { ore: HTMLElement; rate: HTMLElement; ingots: HTMLElement }>> = {};
  private nextMetal: HTMLElement;
  private select: HTMLSelectElement;
  private input: HTMLInputElement;
  private maxBtn: HTMLButtonElement;
  private go: HTMLButtonElement;
  private total: HTMLElement;
  private note: HTMLElement;
  private queue: HTMLElement;
  private queueSig = '';
  private rows: { title: HTMLElement; time: HTMLElement; fill: HTMLElement }[] = [];
  private last?: GameState;

  constructor(root: HTMLElement, private handlers: ForgeHandlers) {
    this.card = el('section', 'card forge');
    this.card.append(el('h2', 'b-name', 'Forge'));
    this.card.append(el('p', 'b-effect', `Smelt ore into ingots: ${ORE_PER_INGOT} ore and some wood for charcoal per ingot. Ingots will be used to arm your soldiers with better metals.`));

    const t = el('table', 'metal-table');
    const head = el('tr');
    for (const h of ['Metal', 'Ore', 'Per hour', 'Ingots']) head.append(el('th', h === 'Metal' ? undefined : 'num', h));
    const thead = el('thead');
    thead.append(head);
    this.table = el('tbody');
    t.append(thead, this.table);
    this.card.append(t);
    this.nextMetal = el('p', 'muted small');
    this.card.append(this.nextMetal);

    const form = el('div', 'recruit');
    this.select = el('select', 'count metal-select');
    this.select.setAttribute('aria-label', 'Metal to smelt');
    this.input = el('input', 'count');
    this.input.type = 'number';
    this.input.inputMode = 'numeric';
    this.input.min = '1';
    this.input.placeholder = '0';
    this.input.setAttribute('aria-label', 'How many ingots');
    this.maxBtn = el('button', 'ghost');
    this.go = el('button', 'upgrade', 'Smelt');
    form.append(this.select, this.input, this.maxBtn, this.go);
    this.total = el('p', 'b-note');
    this.note = el('p', 'b-note error');
    this.card.append(form, this.total, this.note);

    this.queue = el('div', 'stack tight forge-queue');
    this.card.append(this.queue);
    root.append(this.card);

    const refresh = () => this.last && this.refreshForm(this.last);
    this.select.addEventListener('change', () => {
      this.input.value = '';
      refresh();
    });
    this.input.addEventListener('input', refresh);
    this.maxBtn.addEventListener('click', () => {
      this.input.value = this.maxBtn.dataset.max ?? '';
      refresh();
    });
    this.go.addEventListener('click', async () => {
      if (await handlers.smelt(this.select.value as MetalId, Number(this.input.value))) this.input.value = '';
      refresh();
    });
  }

  update(s: GameState, now: number): void {
    this.last = s;
    this.card.hidden = s.buildings.smithy < 1;
    if (this.card.hidden) return;

    const metals = unlockedMetals(s);
    const sig = metals.join(',');
    if (sig !== this.tableSig) {
      this.tableSig = sig;
      this.table.replaceChildren();
      this.cells = {};
      const chosen = this.select.value;
      this.select.replaceChildren();
      for (const m of metals) {
        const tr = el('tr');
        const ore = el('td', 'num');
        const rate = el('td', 'num muted');
        const ingots = el('td', 'num');
        tr.append(el('td', undefined, METAL_DATA[m].name), ore, rate, ingots);
        this.table.append(tr);
        this.cells[m] = { ore, rate, ingots };
        const opt = el('option', undefined, METAL_DATA[m].name);
        opt.value = m;
        this.select.append(opt);
      }
      if (metals.includes(chosen as MetalId)) this.select.value = chosen;
    }
    for (const m of metals) {
      const c = this.cells[m]!;
      c.ore.textContent = compactNum(oreStock(s, m));
      c.rate.textContent = `+${shortNum(orePerHour(s, m))}`;
      c.ingots.textContent = fullNum(s.ingots[m]);
    }
    const next = METALS.find((m) => !metals.includes(m));
    this.nextMetal.textContent = next ? `Next metal: ${METAL_DATA[next].name} at Mine level ${METAL_DATA[next].mine}.` : 'Every metal unlocked.';

    this.refreshForm(s);
    this.drawQueue(s, now);
  }

  private refreshForm(s: GameState) {
    const m = (this.select.value || 'copper') as MetalId;
    const max = maxSmeltable(s, m);
    this.maxBtn.dataset.max = String(max);
    this.maxBtn.textContent = `Max ${compactNum(max).replace(",", "")}`;
    this.maxBtn.disabled = max === 0;
    const typed = this.input.value !== '';
    const n = Number(this.input.value);
    const blocker = typed ? smeltBlocker(s, m, n) : smeltBlocker(s, m, 1) === 'queue-full' ? 'queue-full' : undefined;
    this.go.disabled = !typed || !!blocker;
    this.total.textContent =
      typed && Number.isInteger(n) && n > 0
        ? `${fullNum(n * ORE_PER_INGOT)} ${METAL_DATA[m].name.toLowerCase()} ore · ${fullNum(n * METAL_DATA[m].fuel)} wood · ${duration(n * smeltTimePerIngot(m, s.buildings.smithy))}`
        : '';
    this.note.textContent = blocker ? smeltBlockerText(m, blocker) : '';
  }

  private drawQueue(s: GameState, now: number) {
    const sig = s.smeltQueue.map((b) => `${b.eventId}`).join(',');
    if (sig !== this.queueSig) {
      this.queueSig = sig;
      this.queue.replaceChildren();
      this.rows = s.smeltQueue.map((_, i) => {
        const row = el('div', 'qrow');
        const head = el('div', 'queue-head');
        const title = el('div', 'queue-title');
        const time = el('div', 'queue-time');
        head.append(title, time);
        const meter = el('div', 'meter big');
        const fill = el('div', 'meter-fill');
        meter.append(fill);
        row.append(head, meter);
        if (i === s.smeltQueue.length - 1) {
          const cancel = el('button', 'ghost small-btn', 'Cancel');
          cancel.addEventListener('click', () => this.handlers.cancel());
          row.append(cancel);
        }
        this.queue.append(row);
        return { title, time, fill };
      });
    }
    s.smeltQueue.forEach((b, i) => {
      const r = this.rows[i];
      if (!r) return;
      r.title.textContent = `${fullNum(b.count)} ${METAL_DATA[b.metal].name} ingot${b.count === 1 ? '' : 's'}`;
      r.time.textContent =
        now < b.startedAt ? `waiting · ready ${clockTime(b.finishesAt, now)}` : `${countdown(b.finishesAt - now)} · ready ${clockTime(b.finishesAt, now)}`;
      r.fill.style.width = `${Math.min(100, Math.max(0, ((now - b.startedAt) / (b.finishesAt - b.startedAt)) * 100))}%`;
    });
  }
}
