import {
  armyDefence,
  playerGear,
  hiddenAmount,
  militia,
  troopCount,
  visibleRaids,
  wallMultiplier,
  watchtowerWarning,
  type GameState,
} from '../sim';
import { clockTime, countdown, duration, fullNum } from './format';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** With a Watchtower this high, you can count the raiders (roughly). */
const COUNT_RAIDERS_AT = 5;

/** Roughly how many: "about 20" (rounded to 5). */
const about = (n: number) => (n < 10 ? `${n}` : `about ${Math.round(n / 5) * 5}`);

/** Defence card at the top of the Village tab, plus the red raid banner shown on every tab. */
export class DefenceView {
  private card: HTMLElement;
  private raidsList: HTMLElement;
  private summary: HTMLElement;
  private sig = '';
  private rows: { title: HTMLElement; time: HTMLElement }[] = [];

  constructor(
    root: HTMLElement,
    private banner: HTMLElement,
    goToVillage: () => void,
  ) {
    this.card = el('section', 'card defence');
    const head = el('div', 'b-head');
    head.append(el('h2', 'b-name', 'Defences'));
    this.card.append(head);
    this.raidsList = el('div', 'stack tight');
    this.summary = el('p', 'b-effect');
    this.card.append(this.raidsList, this.summary);
    root.prepend(this.card);
    banner.addEventListener('click', () => goToVillage());
  }

  update(s: GameState, now: number): void {
    // Only worth showing once raids are possible (Barracks built) or something's coming.
    const raids = visibleRaids(s);
    this.card.hidden = s.buildings.barracks === 0 && raids.length === 0;

    const sig = raids.map((r) => r.id).join(',');
    if (sig !== this.sig) {
      this.sig = sig;
      this.raidsList.replaceChildren();
      this.rows = raids.map(() => {
        const row = el('div', 'raid-row');
        const title = el('div', 'raid-title');
        const time = el('div', 'raid-time');
        row.append(title, time);
        this.raidsList.append(row);
        return { title, time };
      });
    }
    raids.forEach((r, i) => {
      const n = troopCount(r.troops);
      const size = s.buildings.watchtower >= COUNT_RAIDERS_AT ? `${about(n)} bandits` : 'size unknown';
      this.rows[i].title.textContent = `⚔️ Raid from ${r.campName} (${size})`;
      this.rows[i].time.textContent = `lands in ${countdown(r.arriveAt - now)} · ${clockTime(r.arriveAt, now)}`;
    });

    const home = armyDefence(s.troops, playerGear(s));
    const wall = s.buildings.wall;
    const total = Math.round((home + militia(wall)) * wallMultiplier(wall));
    const tower = s.buildings.watchtower;
    const parts = [
      `Defence ${fullNum(total)}: soldiers at home ${fullNum(home)} + militia ${fullNum(militia(wall))}, ×${wallMultiplier(wall).toFixed(2)} wall.`,
      tower > 0
        ? `Your Watchtower spots raids ${duration(watchtowerWarning(tower))} ahead.`
        : 'Without a Watchtower you won’t see raids coming.',
    ];
    const hidden = hiddenAmount(s.buildings.hiding);
    if (hidden > 0) parts.push(`Your Hiding Place keeps ${fullNum(hidden)} of each resource safe from raiders.`);
    if (raids.length > 0 && s.marches.length > 0) parts.push('Armies out on the Map can be recalled to help.');
    if (raids.length === 0) parts.unshift('No raids spotted.');
    this.summary.textContent = parts.join(' ');

    // Banner across every tab.
    this.banner.hidden = raids.length === 0;
    if (raids.length > 0) {
      const next = raids[0];
      this.banner.textContent =
        raids.length === 1
          ? `⚠️ Raid incoming from ${next.campName} · ${countdown(next.arriveAt - now)}`
          : `⚠️ ${raids.length} raids incoming · next in ${countdown(next.arriveAt - now)}`;
    }
  }
}
