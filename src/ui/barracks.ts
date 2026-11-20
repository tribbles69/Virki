import {
  batchEndTimes,
  recruitBlocker,
  recruitBlockerText,
  recruitInfo,
  upgradeInfo,
  blockerText,
  RESOURCES,
  RESOURCE_NAMES,
  UNITS,
  UNIT_DATA,
  type GameState,
  type UnitId,
} from '../sim';
import { countdown, duration, fullNum, shortNum } from './format';

const RES_ICON = { wood: '\u{1FAB5}', stone: '\u{1FAA8}', ore: '⛏️' } as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface BarracksHandlers {
  recruit(unit: UnitId, count: number): Promise<boolean>;
  cancel(index: number): void;
  /** Jump to the Village tab (to build the Barracks). */
  goToVillage(): void;
}

/** The Barracks tab: army at home, training queue, and a card per soldier type. */
export class BarracksView {
  private locked: HTMLElement;
  private lockedNote: HTMLElement;
  private body: HTMLElement;
  private army: HTMLElement;
  private queue: HTMLElement;
  private queueList: HTMLElement;
  private queueSig = '';
  private queueRows: { title: HTMLElement; time: HTMLElement; fill?: HTMLElement }[] = [];
  private cards = {} as Record<UnitId, {
    owned: HTMLElement;
    each: Record<(typeof RESOURCES)[number], HTMLElement>;
    time: HTMLElement;
    input: HTMLInputElement;
    maxBtn: HTMLButtonElement;
    train: HTMLButtonElement;
    total: HTMLElement;
    note: HTMLElement;
    card: HTMLElement;
  }>;

  constructor(root: HTMLElement, private handlers: BarracksHandlers) {
    // Shown until the Barracks is built.
    this.locked = el('section', 'card');
    this.locked.append(el('h2', 'b-name', 'No Barracks yet'));
    this.lockedNote = el('p', 'b-effect');
    const go = el('button', 'ghost', 'Go to Village');
    go.addEventListener('click', () => handlers.goToVillage());
    this.locked.append(this.lockedNote, go);
    root.append(this.locked);

    this.body = el('div', 'stack');
    root.append(this.body);

    const armyCard = el('section', 'card');
    armyCard.append(el('h2', 'b-name', 'Army at home'));
    this.army = el('p', 'b-effect');
    armyCard.append(this.army);
    this.body.append(armyCard);

    this.queue = el('section', 'card queue');
    this.queue.append(el('h2', 'b-name', 'Training'));
    this.queueList = el('div', 'stack tight');
    this.queue.append(this.queueList);
    this.body.append(this.queue);

    const list = el('section', 'buildings');
    for (const u of UNITS) {
      const def = UNIT_DATA[u];
      const card = el('article', 'card building');
      const head = el('div', 'b-head');
      head.append(el('h2', 'b-name', def.name));
      const owned = el('span', 'b-level');
      head.append(owned);
      const role = el('p', 'b-effect', def.role);
      const stats = el('div', 'b-costs muted');
      stats.append(
        Object.assign(el('span', 'cost', `⚔️ ${def.attack}`), { title: 'Attack' }),
        Object.assign(el('span', 'cost', `\u{1F6E1}️ ${def.defence.infantry}/${def.defence.cavalry}/${def.defence.archer}`), {
          title: 'Defence vs infantry / cavalry / archers',
        }),
        Object.assign(el('span', 'cost', `\u{1F392} ${def.carry}`), { title: 'Loot carried' }),
      );
      const costs = el('div', 'b-costs');
      const each = {} as (typeof this.cards)[UnitId]['each'];
      for (const r of RESOURCES) {
        each[r] = el('span', 'cost');
        each[r].title = `${RESOURCE_NAMES[r]} each`;
        costs.append(each[r]);
      }
      costs.append(Object.assign(el('span', 'cost', `\u{1F465} ${def.pop}`), { title: 'Population each' }));
      const time = el('span', 'cost');
      time.title = 'Training time each';
      costs.append(time);

      const form = el('div', 'recruit');
      const input = el('input', 'count');
      input.type = 'number';
      input.inputMode = 'numeric';
      input.min = '1';
      input.step = '1';
      input.placeholder = '0';
      input.setAttribute('aria-label', `How many ${def.plural}`);
      const maxBtn = el('button', 'ghost');
      maxBtn.addEventListener('click', () => {
        input.value = maxBtn.dataset.max ?? '';
        input.dispatchEvent(new Event('input'));
      });
      const train = el('button', 'upgrade', 'Train');
      train.addEventListener('click', async () => {
        const n = Number(input.value);
        if (await handlers.recruit(u, n)) input.value = '';
        input.dispatchEvent(new Event('input'));
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') train.click();
      });
      form.append(input, maxBtn, train);
      const total = el('p', 'b-note');
      const note = el('p', 'b-note');
      card.append(head, role, stats, costs, form, total, note);
      list.append(card);
      this.cards[u] = { owned, each, time, input, maxBtn, train, total, note, card };
      input.addEventListener('input', () => this.last && this.updateCard(this.last, u));
    }
    this.body.append(list);
  }

  private last?: GameState;

  update(s: GameState, now: number): void {
    this.last = s;
    const built = s.buildings.barracks > 0;
    this.locked.hidden = built;
    this.body.hidden = !built;
    if (!built) {
      const info = upgradeInfo(s, 'barracks');
      this.lockedNote.textContent =
        info.blocker === 'requirements'
          ? `Build a Barracks in the Village to train soldiers. ${blockerText(info)}.`
          : s.buildQueue.some((j) => j.building === 'barracks')
            ? 'Your Barracks is being built.'
            : 'Build a Barracks in the Village to train soldiers.';
      return;
    }

    const army = UNITS.filter((u) => s.troops[u] > 0).map((u) => `${fullNum(s.troops[u])} ${s.troops[u] === 1 ? UNIT_DATA[u].name : UNIT_DATA[u].plural}`);
    this.army.textContent = army.length ? army.join(' · ') : 'No soldiers yet.';

    this.updateQueue(s, now);
    for (const u of UNITS) this.updateCard(s, u);
  }

  private updateQueue(s: GameState, now: number) {
    this.queue.hidden = s.recruitQueue.length === 0;
    const sig = s.recruitQueue.map((b) => `${b.unit}:${b.count}`).join('|');
    if (sig !== this.queueSig) {
      this.queueSig = sig;
      this.queueList.replaceChildren();
      this.queueRows = s.recruitQueue.map((_, i) => {
        const row = el('div', 'qrow');
        const head = el('div', 'queue-head');
        const title = el('div', 'queue-title');
        const time = el('div', 'queue-time');
        head.append(title, time);
        row.append(head);
        let fill: HTMLElement | undefined;
        if (i === 0) {
          const meter = el('div', 'meter big');
          fill = el('div', 'meter-fill');
          meter.append(fill);
          row.append(meter);
        }
        const cancel = el('button', 'ghost small-btn', 'Cancel');
        cancel.addEventListener('click', () => this.handlers.cancel(i));
        row.append(cancel);
        this.queueList.append(row);
        return { title, time, fill };
      });
    }
    const ends = batchEndTimes(s);
    s.recruitQueue.forEach((b, i) => {
      const r = this.queueRows[i];
      if (!r) return;
      const def = UNIT_DATA[b.unit];
      const left = b.count - b.trained;
      r.title.textContent = `${b.count} ${b.count === 1 ? def.name : def.plural}${b.trained ? ` (${b.trained} ready)` : ''}`;
      if (i === 0) {
        r.time.textContent = `next ${countdown(b.nextAt - now)} · all ${countdown(ends[i] - now)}`;
        r.fill!.style.width = `${Math.min(100, Math.max(0, ((now - (b.nextAt - b.perUnit)) / b.perUnit) * 100))}%`;
      } else {
        r.time.textContent = `${left} waiting · done in ${countdown(ends[i] - now)}`;
      }
    });
  }

  private updateCard(s: GameState, u: UnitId) {
    const c = this.cards[u];
    const def = UNIT_DATA[u];
    const info = recruitInfo(s, u);
    c.owned.textContent = info.inTraining ? `${fullNum(info.owned)} (+${info.inTraining})` : fullNum(info.owned);
    for (const r of RESOURCES) c.each[r].textContent = `${RES_ICON[r]} ${def.cost[r]}`;
    c.time.textContent = `⏱ ${duration(info.time)}`;
    c.maxBtn.dataset.max = String(info.max);
    c.maxBtn.textContent = `Max ${shortNum(info.max)}`;
    c.maxBtn.disabled = info.max === 0;

    const n = Number(c.input.value);
    const typed = c.input.value !== '';
    const blocker = info.missing ? 'locked' : typed ? recruitBlocker(s, u, n) : undefined;
    c.card.classList.toggle('locked', !!info.missing);
    c.input.disabled = !!info.missing;
    c.train.disabled = !typed || !!blocker;
    if (typed && Number.isInteger(n) && n > 0) {
      c.total.textContent = `Total: ${RESOURCES.map((r) => `${RES_ICON[r]} ${shortNum(n * def.cost[r])}`).join('  ')}  ·  ${duration(n * info.time)}`;
    } else {
      c.total.textContent = '';
    }
    c.note.textContent = blocker ? recruitBlockerText(s, u, blocker) : '';
    c.note.classList.toggle('error', !!blocker && blocker !== 'locked');
  }
}
