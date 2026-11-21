import { troopCount, RESOURCES, UNITS, UNIT_DATA, type BattleReport, type GameState } from '../sim';
import { ago, fullNum } from './format';

const RES_ICON = { wood: '\u{1FAB5}', stone: '\u{1FAA8}', ore: '⛏️' } as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface ReportHandlers {
  open(id: number): void;
  markAllRead(): void;
  remove(id: number): void;
  attackAgain(campId: number): void;
}

/** The Reports tab: a list of battles, newest first; tap one to read it. */
export class ReportsView {
  private head: HTMLElement;
  private markAll: HTMLButtonElement;
  private list: HTMLElement;
  private empty: HTMLElement;
  private sig = '';
  private openId: number | null = null;
  private times: { el: HTMLElement; at: number }[] = [];

  constructor(root: HTMLElement, private handlers: ReportHandlers) {
    this.head = el('div', 'reports-head');
    this.head.append(el('h2', 'b-name', 'Battle reports'));
    this.markAll = el('button', 'ghost small-btn', 'Mark all read');
    this.markAll.addEventListener('click', () => handlers.markAllRead());
    this.head.append(this.markAll);
    this.empty = el('section', 'card');
    this.empty.append(el('p', 'b-effect', 'No battles yet. Send an army from the Map tab and its report will appear here.'));
    this.list = el('div', 'stack tight');
    root.append(this.head, this.empty, this.list);
  }

  update(s: GameState, now: number): void {
    const sig = `${this.openId}|` + s.reports.map((r) => `${r.id}:${r.read ? 1 : 0}`).join(',');
    if (sig !== this.sig) {
      this.sig = sig;
      this.draw(s, now);
    }
    for (const t of this.times) t.el.textContent = ago(now - t.at);
  }

  private draw(s: GameState, now: number) {
    this.empty.hidden = s.reports.length > 0;
    this.markAll.hidden = !s.reports.some((r) => !r.read);
    this.list.replaceChildren();
    this.times = [];
    for (const r of s.reports) {
      const card = el('article', `card report${r.read ? '' : ' unread'}${r.won ? ' won' : ' lost'}`);
      const summary = el('button', 'report-summary');
      summary.setAttribute('aria-expanded', String(this.openId === r.id));
      const line1 = el('div', 'report-line');
      const badge = r.kind === 'scout' ? 'Scouted' : r.kind === 'raid' ? (r.won ? 'Held' : 'Raided') : r.won ? 'Victory' : 'Defeat';
      const title = r.kind === 'raid' ? `Raid by ${r.campName}` : r.campName;
      line1.append(el('span', 'report-badge', badge), el('span', 'report-camp', title));
      const when = el('span', 'report-when');
      this.times.push({ el: when, at: r.at });
      line1.append(when);
      const line2 = el('div', 'report-sub', this.subline(r));
      summary.append(line1, line2);
      summary.addEventListener('click', () => {
        this.openId = this.openId === r.id ? null : r.id;
        if (!r.read) this.handlers.open(r.id);
        this.sig = '';
        this.update(s, Date.now());
      });
      card.append(summary);
      if (this.openId === r.id) card.append(this.detail(r, now));
      this.list.append(card);
    }
  }

  private subline(r: BattleReport): string {
    const sent = troopCount(r.sent);
    const lost = troopCount(r.lost);
    const loot = RESOURCES.reduce((n, k) => n + r.loot[k], 0);
    if (r.kind === 'scout') {
      const seen = RESOURCES.reduce((n, k) => n + (r.seenLoot?.[k] ?? 0), 0);
      return `${fullNum(troopCount(r.defenders))} bandits · ${fullNum(seen)} loot in camp`;
    }
    if (r.kind === 'raid') {
      const yours = troopCount(r.defendersLost);
      const fell = yours === 0 ? 'no soldiers lost' : `${fullNum(yours)} soldiers lost`;
      return r.won ? `${fullNum(sent)} bandits beaten off · ${fell}` : `${fell} · ${fullNum(loot)} stolen`;
    }
    if (!r.won) return `All ${fullNum(sent)} soldiers lost`;
    const losses = lost === 0 ? 'no losses' : `${fullNum(lost)} of ${fullNum(sent)} lost`;
    return `${losses} · ${loot > 0 ? `${fullNum(loot)} loot` : 'no loot left'}`;
  }

  private detail(r: BattleReport, now: number): HTMLElement {
    const d = el('div', 'report-detail');
    const when = new Date(r.at);
    const day = when.toDateString() === new Date(now).toDateString() ? 'Today' : when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const hm = when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    d.append(el('p', 'muted small', `${day} at ${hm} · ${r.campTier > 8 ? 'Warlord camp' : `toughness ${r.campTier}/8`}`));
    if (r.kind === 'raid') return this.raidDetail(d, r);
    if (r.kind === 'scout') return this.scoutDetail(d, r);

    d.append(this.table('Your army', ['Sent', 'Lost', 'Back'], r.sent, (u) => [r.sent[u], r.lost[u], r.sent[u] - r.lost[u]]));
    const bandits = troopCount(r.defenders);
    if (bandits > 0) {
      d.append(this.table('Bandits', ['Before', 'Lost', 'Left'], r.defenders, (u) => [r.defenders[u], r.defendersLost[u], r.defenders[u] - r.defendersLost[u]]));
    } else {
      d.append(el('p', 'b-effect', 'The camp was empty: no bandits to fight.'));
    }

    const facts = el('div', 'report-facts');
    const luck = el('span', r.luck >= 0 ? 'good' : 'bad', `${r.luck >= 0 ? '+' : ''}${(r.luck * 100).toFixed(1)}%`);
    const luckLine = el('p');
    luckLine.append('Luck ', luck);
    facts.append(luckLine);
    if (r.attackStrength !== undefined && r.defenceStrength !== undefined) {
      facts.append(el('p', undefined, `Your attack ${fullNum(r.attackStrength)} vs their defence ${fullNum(r.defenceStrength)}`));
    }
    d.append(facts);

    const lootTotal = RESOURCES.reduce((n, k) => n + r.loot[k], 0);
    const loot = el('div', 'b-costs');
    if (r.won) {
      loot.append(el('span', 'muted', 'Loot'));
      for (const k of RESOURCES) loot.append(el('span', 'cost', `${RES_ICON[k]} ${fullNum(r.loot[k])}`));
      loot.append(el('span', 'muted', `(${fullNum(lootTotal)} of ${fullNum(r.capacity)} carried)`));
    } else {
      loot.append(el('span', 'muted', 'No loot: nobody survived to carry it.'));
    }
    d.append(loot);

    const actions = el('div', 'report-actions');
    const again = el('button', 'upgrade small-btn', 'Attack again');
    again.addEventListener('click', () => this.handlers.attackAgain(r.campId));
    const del = el('button', 'ghost small-btn', 'Delete');
    del.addEventListener('click', () => {
      this.openId = null;
      this.handlers.remove(r.id);
    });
    actions.append(again, del);
    d.append(actions);
    return d;
  }

  /** What your scouts saw. */
  private scoutDetail(d: HTMLElement, r: BattleReport): HTMLElement {
    if (troopCount(r.defenders) > 0) {
      d.append(this.table('Bandits in camp', ['Count'], r.defenders, (u) => [r.defenders[u]]));
    } else {
      d.append(el('p', 'b-effect', 'The camp was empty: no bandits at all.'));
    }
    const loot = el('div', 'b-costs');
    loot.append(el('span', 'muted', 'Loot in camp'));
    for (const k of RESOURCES) loot.append(el('span', 'cost', `${RES_ICON[k]} ${fullNum(r.seenLoot?.[k] ?? 0)}`));
    d.append(loot);
    d.append(el('p', 'muted small', 'Exact until the camps respawn at 04:00 (or until someone else fights there).'));
    const actions = el('div', 'report-actions');
    if (r.campTier <= 9) {
      const go = el('button', 'upgrade small-btn', 'Plan an attack');
      go.addEventListener('click', () => this.handlers.attackAgain(r.campId));
      actions.append(go);
    }
    const del = el('button', 'ghost small-btn', 'Delete');
    del.addEventListener('click', () => {
      this.openId = null;
      this.handlers.remove(r.id);
    });
    actions.append(del);
    d.append(actions);
    return d;
  }

  /** A bandit raid on the village, told from your side. */
  private raidDetail(d: HTMLElement, r: BattleReport): HTMLElement {
    d.append(this.table('Bandits', ['Came', 'Lost', 'Left'], r.sent, (u) => [r.sent[u], r.lost[u], r.sent[u] - r.lost[u]]));
    if (troopCount(r.defenders) > 0) {
      d.append(this.table('Your soldiers', ['Home', 'Lost', 'Left'], r.defenders, (u) => [r.defenders[u], r.defendersLost[u], r.defenders[u] - r.defendersLost[u]]));
    } else {
      d.append(el('p', 'b-effect', 'No soldiers were home: only the militia and your Wall stood in the way.'));
    }
    const facts = el('div', 'report-facts');
    const luck = el('span', r.luck <= 0 ? 'good' : 'bad', `${r.luck >= 0 ? '+' : ''}${(r.luck * 100).toFixed(1)}%`);
    const luckLine = el('p');
    luckLine.append('Bandits’ luck ', luck);
    facts.append(luckLine);
    if (r.attackStrength !== undefined && r.defenceStrength !== undefined) {
      facts.append(el('p', undefined, `Their attack ${fullNum(r.attackStrength)} vs your defence ${fullNum(r.defenceStrength)} (with Wall and militia)`));
    }
    d.append(facts);
    const stolen = RESOURCES.reduce((n, k) => n + r.loot[k], 0);
    const loot = el('div', 'b-costs');
    if (r.won) {
      loot.append(el('span', 'muted', 'Nothing was taken.'));
    } else {
      loot.append(el('span', 'muted', 'Stolen'));
      for (const k of RESOURCES) loot.append(el('span', 'cost bad', `${RES_ICON[k]} ${fullNum(r.loot[k])}`));
      if (stolen === 0) loot.append(el('span', 'muted', '(your stores were empty)'));
    }
    d.append(loot);
    const actions = el('div', 'report-actions');
    if (r.campTier <= 8) {
      const back = el('button', 'upgrade small-btn', 'Strike back');
      back.addEventListener('click', () => this.handlers.attackAgain(r.campId));
      actions.append(back);
    }
    const del = el('button', 'ghost small-btn', 'Delete');
    del.addEventListener('click', () => {
      this.openId = null;
      this.handlers.remove(r.id);
    });
    actions.append(del);
    d.append(actions);
    return d;
  }

  private table(title: string, cols: string[], who: Record<string, number>, row: (u: (typeof UNITS)[number]) => number[]): HTMLElement {
    const wrap = el('div', 'report-table');
    const t = el('table');
    const head = el('tr');
    head.append(el('th', undefined, title));
    for (const c of cols) head.append(el('th', 'num', c));
    t.append(head);
    for (const u of UNITS) {
      if (!who[u]) continue;
      const tr = el('tr');
      tr.append(el('td', undefined, UNIT_DATA[u].plural));
      row(u).forEach((n, i) => tr.append(el('td', `num${i === 1 && n > 0 ? ' bad' : ''}`, fullNum(n))));
      t.append(tr);
    }
    wrap.append(t);
    return wrap;
  }
}
