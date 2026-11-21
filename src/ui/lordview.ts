import { hasLord, lordStatus, type GameState } from '../sim';
import { clockTime, fullNum } from './format';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The Lord's card at the top of the Army tab. */
export class LordView {
  private card: HTMLElement;
  private title: HTMLElement;
  private level: HTMLElement;
  private fill: HTMLElement;
  private meter: HTMLElement;
  private xp: HTMLElement;
  private info: HTMLElement;
  private where: HTMLElement;

  constructor(root: HTMLElement) {
    this.card = el('section', 'card lord-card');
    const head = el('div', 'b-head');
    this.title = el('h2', 'b-name');
    this.level = el('span', 'b-level');
    head.append(this.title, this.level);
    this.meter = el('div', 'meter big');
    this.fill = el('div', 'meter-fill');
    this.meter.append(this.fill);
    this.xp = el('p', 'muted small lord-xp');
    this.info = el('p', 'b-effect');
    this.where = el('p', 'lord-where');
    this.card.append(head, this.meter, this.xp, this.info, this.where);
    root.prepend(this.card);
  }

  update(s: GameState, now: number): void {
    if (!hasLord(s)) {
      this.title.textContent = '\u{1F451} No Lord yet';
      this.level.textContent = '';
      this.meter.hidden = true;
      this.xp.textContent = '';
      this.info.textContent = 'Build the Lord’s Keep (needs Great Hall 10) and a Lord will come to lead your armies and guard your village.';
      this.where.textContent = '';
      return;
    }
    const st = lordStatus(s);
    this.title.textContent = `\u{1F451} ${st.title} ${st.name}`;
    this.level.textContent = `Level ${st.level} of ${st.cap}`;
    this.meter.hidden = false;
    if (st.nextXp !== undefined) {
      const pct = ((st.xp - st.levelXp) / (st.nextXp - st.levelXp)) * 100;
      this.fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      this.xp.textContent = `${fullNum(st.xp - st.levelXp)} / ${fullNum(st.nextXp - st.levelXp)} xp to level ${st.level + 1}`;
    } else {
      this.fill.style.width = '100%';
      this.xp.textContent = st.capped
        ? 'Experience is piling up: upgrade the Lord’s Keep to unlock the next level.'
        : `At the Keep’s limit (level ${st.cap}).`;
    }
    this.info.textContent = `+${Math.round(st.bonus * 100)}% attack for the army your Lord leads, and +${Math.round(st.bonus * 100)}% defence when at home.`;
    const m = s.marches.find((x) => x.lord);
    if (!m) {
      this.where.textContent = 'At home, guarding the village. Tick “Lord leads” when sending an attack from the Map.';
    } else {
      const camp = s.map.camps.find((c) => c.id === m.campId)?.name ?? 'the field';
      this.where.textContent =
        m.phase === 'outbound'
          ? `Leading an army to ${camp} · arrives ${clockTime(m.arriveAt, now)}`
          : `Riding home from ${camp} · back ${clockTime(m.returnAt, now)}`;
    }
  }
}
