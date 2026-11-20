import {
  blockerText,
  population,
  productionPerHour,
  storageCap,
  upgradeInfo,
  BUILDINGS,
  BUILDING_DATA,
  RESOURCES,
  RESOURCE_NAMES,
  type BuildingId,
  type GameState,
} from '../sim';
import { effectLine } from './effects';
import { clockTime, countdown, duration, fullNum, shortNum } from './format';

const RES_ICON: Record<(typeof RESOURCES)[number], string> = { wood: '\u{1FAB5}', stone: '\u{1FAA8}', ore: '⛏️' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface ViewHandlers {
  upgrade(b: BuildingId): void;
  cancel(): void;
}

/**
 * The village screen. DOM is built once and only text/attributes change on
 * update, so buttons never get swapped out from under a tap.
 */
export class VillageView {
  private res = {} as Record<(typeof RESOURCES)[number], { amount: HTMLElement; fill: HTMLElement; rate: HTMLElement; box: HTMLElement }>;
  private pop: HTMLElement;
  private popCap: HTMLElement;
  private queue: HTMLElement;
  private queueTitle: HTMLElement;
  private queueTime: HTMLElement;
  private queueFill: HTMLElement;
  private rows = {} as Record<BuildingId, {
    level: HTMLElement;
    effect: HTMLElement;
    costs: Record<(typeof RESOURCES)[number], HTMLElement>;
    time: HTMLElement;
    pop: HTMLElement;
    button: HTMLButtonElement;
    note: HTMLElement;
  }>;

  constructor(bar: HTMLElement, main: HTMLElement, handlers: ViewHandlers) {
    // Resource bar
    bar.className = 'resbar';
    for (const r of RESOURCES) {
      const box = el('div', 'res');
      box.title = RESOURCE_NAMES[r];
      const top = el('div', 'res-top');
      top.append(el('span', 'res-icon', RES_ICON[r]));
      const amount = el('span', 'res-amount');
      top.append(amount);
      const meter = el('div', 'meter');
      const fill = el('div', 'meter-fill');
      meter.append(fill);
      const rate = el('div', 'res-rate');
      box.append(top, meter, rate);
      bar.append(box);
      this.res[r] = { amount, fill, rate, box };
    }
    const popBox = el('div', 'res');
    popBox.title = 'Population';
    const popTop = el('div', 'res-top');
    popTop.append(el('span', 'res-icon', '\u{1F465}'));
    this.pop = el('span', 'res-amount');
    popTop.append(this.pop);
    this.popCap = el('div', 'res-rate');
    popBox.append(popTop, this.popCap);
    bar.append(popBox);

    // Build queue card
    this.queue = el('section', 'card queue');
    const qHead = el('div', 'queue-head');
    this.queueTitle = el('div', 'queue-title');
    this.queueTime = el('div', 'queue-time');
    qHead.append(this.queueTitle, this.queueTime);
    const qMeter = el('div', 'meter big');
    this.queueFill = el('div', 'meter-fill');
    qMeter.append(this.queueFill);
    const cancel = el('button', 'ghost', 'Cancel');
    cancel.addEventListener('click', () => handlers.cancel());
    this.queue.append(qHead, qMeter, cancel);
    main.append(this.queue);

    // Buildings
    const list = el('section', 'buildings');
    this.rows = {} as typeof this.rows;
    for (const b of BUILDINGS) {
      const card = el('article', 'card building');
      const head = el('div', 'b-head');
      head.append(el('h2', 'b-name', BUILDING_DATA[b].name));
      const level = el('span', 'b-level');
      head.append(level);
      const effect = el('p', 'b-effect');
      const costRow = el('div', 'b-costs');
      const costs = {} as (typeof this.rows)[BuildingId]['costs'];
      for (const r of RESOURCES) {
        const c = el('span', 'cost');
        c.title = RESOURCE_NAMES[r];
        costRow.append(c);
        costs[r] = c;
      }
      const pop = el('span', 'cost');
      pop.title = 'Population';
      const time = el('span', 'cost');
      costRow.append(pop, time);
      const foot = el('div', 'b-foot');
      const note = el('span', 'b-note');
      const button = el('button', 'upgrade');
      button.addEventListener('click', () => handlers.upgrade(b));
      foot.append(note, button);
      card.append(head, effect, costRow, foot);
      list.append(card);
      this.rows[b] = { level, effect, costs, time, pop, button, note };
    }
    main.append(list);
  }

  update(s: GameState, now: number): void {
    const cap = storageCap(s);
    for (const r of RESOURCES) {
      const v = this.res[r];
      v.amount.textContent = shortNum(s.resources[r]);
      v.fill.style.width = `${Math.min(100, (s.resources[r] / cap) * 100)}%`;
      const full = s.resources[r] >= cap;
      v.box.classList.toggle('full', full);
      v.rate.textContent = full ? 'Full' : `+${shortNum(productionPerHour(s, r))}/h`;
    }
    const p = population(s);
    this.pop.textContent = shortNum(p.used);
    this.popCap.textContent = `of ${shortNum(p.cap)}`;
    this.popCap.parentElement!.title = `Population: ${fullNum(p.used)} of ${fullNum(p.cap)} (${fullNum(p.free)} free)`;

    const job = s.buildQueue[0];
    this.queue.hidden = !job;
    if (job) {
      this.queueTitle.textContent = `${BUILDING_DATA[job.building].name} → level ${job.toLevel}`;
      this.queueTime.textContent = `${countdown(job.finishesAt - now)} · done ${clockTime(job.finishesAt, now)}`;
      const total = job.finishesAt - job.startedAt;
      this.queueFill.style.width = `${Math.min(100, Math.max(0, ((now - job.startedAt) / total) * 100))}%`;
    }

    for (const b of BUILDINGS) {
      const row = this.rows[b];
      const info = upgradeInfo(s, b);
      const maxed = info.blocker === 'max-level';
      const building = info.nextLevel - 1 > info.level ? ` (building ${info.nextLevel - 1})` : '';
      row.level.textContent = info.level === 0 ? `Not built${building}` : `Level ${info.level}${building}`;
      row.effect.textContent = effectLine(s, b, info.nextLevel, maxed);
      row.costs.wood.parentElement!.hidden = maxed;
      for (const r of RESOURCES) {
        const short = s.resources[r] < info.cost[r];
        row.costs[r].textContent = `${RES_ICON[r]} ${shortNum(info.cost[r])}`;
        row.costs[r].classList.toggle('short', short);
        row.costs[r].title = `${RESOURCE_NAMES[r]}: ${fullNum(info.cost[r])}${short ? ` (you have ${fullNum(s.resources[r])})` : ''}`;
      }
      row.pop.hidden = info.popNeeded === 0;
      row.pop.textContent = `\u{1F465} ${info.popNeeded}`;
      row.pop.classList.toggle('short', info.blocker === 'population');
      row.time.textContent = `⏱ ${duration(info.time)}`;

      row.button.textContent = maxed ? 'Max level' : info.nextLevel === 1 ? 'Build' : `Upgrade to ${info.nextLevel}`;
      row.button.disabled = !!info.blocker;
      if (info.blocker === 'resources' && info.wait !== undefined && Number.isFinite(info.wait)) {
        row.note.textContent = `Enough in ${countdown(info.wait)}`;
      } else if (info.blocker && info.blocker !== 'max-level') {
        row.note.textContent = blockerText(info);
      } else {
        row.note.textContent = '';
      }
    }
  }
}
