import './style.css';
import {
  blockerText,
  cancelLastUpgrade,
  cancelRecruit,
  recruit,
  recruitBlockerText,
  startUpgrade,
  upgradeInfo,
  BUILDINGS,
  BUILDING_DATA,
  RESOURCES,
  RESOURCE_NAMES,
  UNIT_DATA,
  type GameState,
} from './sim';
import { BarracksView } from './ui/barracks';
import { MapView } from './ui/mapview';
import { SaveStore } from './game/db';
import { Game, type StartResult } from './game/game';
import { exportFileName } from './game/saveFile';
import { formatDuration, type CatchUpSummary } from './game/summary';
import { VillageView } from './ui/view';
import { fullNum } from './ui/format';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="top">
    <div class="brand"><img src="icon.svg" width="28" height="28" alt="" /><span>VIRKI</span></div>
    <div id="bar"></div>
    <nav class="tabs" role="tablist">
      <button class="tab" role="tab" data-tab="village">Village</button>
      <button class="tab" role="tab" data-tab="barracks">Barracks</button>
      <button class="tab" role="tab" data-tab="map">Map</button>
    </nav>
  </header>
  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
  <main id="main"><p class="muted center">Loading your village…</p></main>
  <footer class="foot">
    <div class="actions">
      <button class="ghost" id="export">Export save</button>
      <button class="ghost" id="import">Import save</button>
      <input id="file" type="file" accept=".json,application/json" hidden />
    </div>
    <div class="muted small" id="status">v${__APP_VERSION__}</div>
  </footer>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const toastEl = $('toast');
let toastTimer = 0;
function toast(text: string, kind: 'info' | 'error' = 'info', ms = 6_000) {
  toastEl.textContent = text;
  toastEl.className = `toast ${kind}`;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), ms);
}
toastEl.addEventListener('click', () => (toastEl.hidden = true));

let offline = 'dev build';
function setStatus() {
  $('status').textContent = `v${__APP_VERSION__} · ${offline} · saved on this device`;
}

function welcome(s: CatchUpSummary | undefined, source: StartResult['source']): string | undefined {
  if (source === 'new' || !s) return 'Welcome, chieftain. Your village awaits: start by upgrading something.';
  if (s.awayMs < 60_000) return undefined;
  const bits = RESOURCES.filter((r) => s.gained[r] > 0).map((r) => `+${fullNum(s.gained[r])} ${RESOURCE_NAMES[r].toLowerCase()}`);
  for (const u of s.upgraded) bits.push(`${u.name} reached level ${u.level}`);
  if (s.trained.length) bits.push(`${s.trained.map((t) => t.label).join(' and ')} trained`);
  return `Away for ${formatDuration(s.awayMs)}.${bits.length ? ` ${bits.join(', ')}.` : ''}`;
}

async function main() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker
      .register('sw.js')
      .then(() => {
        offline = 'works offline';
        setStatus();
      })
      .catch(() => {
        offline = 'offline mode unavailable';
        setStatus();
      });
  }
  // Ask the browser not to clear our storage when space runs low.
  void navigator.storage?.persist?.();

  const started = await Game.start(new SaveStore(), () => Date.now(), () => crypto.randomUUID());
  const game = started.game;
  setStatus();

  const mainEl = $('main');
  mainEl.innerHTML = '';
  const villagePane = document.createElement('div');
  const barracksPane = document.createElement('div');
  const mapPane = document.createElement('div');
  villagePane.className = barracksPane.className = mapPane.className = 'stack';
  mainEl.append(villagePane, barracksPane, mapPane);

  const panes = { village: villagePane, barracks: barracksPane, map: mapPane } as const;
  type Tab = keyof typeof panes;
  const showTab = (tab: Tab) => {
    for (const [name, pane] of Object.entries(panes)) pane.hidden = name !== tab;
    document.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    try {
      localStorage.setItem('virki-tab', tab);
    } catch {
      /* private mode: just don't remember */
    }
    window.scrollTo({ top: 0 });
  };
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab as Tab)));
  let savedTab: string | null = null;
  try {
    savedTab = localStorage.getItem('virki-tab');
  } catch {
    /* ignore */
  }
  showTab(savedTab && savedTab in panes ? (savedTab as Tab) : 'village');
  const mapView = new MapView(mapPane);

  const barracks = new BarracksView(barracksPane, {
    recruit: async (unit, count) => {
      const r = await game.act((s) => recruit(s, unit, count));
      if (!r.ok) toast(recruitBlockerText(game.state, unit, r.reason), 'error', 3_000);
      return r.ok;
    },
    cancel: async (index) => {
      const batch = game.state.recruitQueue[index];
      if (!batch) return;
      const left = batch.count - batch.trained;
      const name = left === 1 ? UNIT_DATA[batch.unit].name : UNIT_DATA[batch.unit].plural;
      if (!confirm(`Cancel training ${left} ${name}? You’ll get a full refund for them.`)) return;
      await game.act((s) => cancelRecruit(s, index));
    },
    goToVillage: () => showTab('village'),
  });

  const view = new VillageView($('bar'), villagePane, {
    upgrade: async (b) => {
      const r = await game.act((s) => startUpgrade(s, b));
      if (!r.ok) toast(blockerText(upgradeInfo(game.state, b)) || 'Can’t build that right now.', 'error', 3_000);
    },
    cancel: async () => {
      const job = game.state.buildQueue[0];
      if (!job) return;
      if (!confirm(`Cancel ${BUILDING_DATA[job.building].name} level ${job.toLevel}? You’ll get a full refund.`)) return;
      await game.act((s) => cancelLastUpgrade(s));
    },
  });

  const greeting = started.warning ?? welcome(started.summary, started.source);
  if (greeting) toast(greeting, started.warning ? 'error' : 'info', 10_000);

  // Announce builds that finish while the app is open.
  let last: GameState = game.state;
  game.subscribe((s) => {
    for (const b of BUILDINGS) {
      if (s.buildings[b] > last.buildings[b]) toast(`${BUILDING_DATA[b].name} reached level ${s.buildings[b]}.`);
    }
    // A training batch finished (the queue shrank while soldiers arrived).
    const prev = last.recruitQueue[0];
    if (prev && s.recruitQueue.length < last.recruitQueue.length && s.troops[prev.unit] > last.troops[prev.unit]) {
      toast(`${prev.count} ${prev.count === 1 ? UNIT_DATA[prev.unit].name : UNIT_DATA[prev.unit].plural} ready for battle.`);
    }
    last = s;
  });

  const frame = () => {
    const s = game.tick();
    const now = Date.now();
    view.update(s, now);
    barracks.update(s, now);
    mapView.update(s);
  };
  frame();
  setInterval(frame, 500);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') frame();
    else void game.save();
  });

  $('export').addEventListener('click', () => {
    const blob = new Blob([game.exportText()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = exportFileName(new Date());
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    toast('Save exported. Keep the file somewhere safe.');
  });

  const file = $<HTMLInputElement>('file');
  $('import').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    if (!confirm('Replace your current village with this save? Your current progress will be lost unless you’ve exported it.')) return;
    try {
      const summary = await game.importText(await f.text());
      last = game.state;
      frame();
      toast(`Save imported. ${welcome(summary, 'save') ?? ''}`.trim());
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  });
}

main().catch((e) => {
  const mainEl = $('main');
  mainEl.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'error center';
  p.textContent = `Couldn’t open your save storage: ${String(e)}`;
  mainEl.append(p);
});
