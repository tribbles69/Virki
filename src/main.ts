import './style.css';
import {
  blockerText,
  cancelLastUpgrade,
  startUpgrade,
  upgradeInfo,
  BUILDINGS,
  BUILDING_DATA,
  RESOURCES,
  RESOURCE_NAMES,
  type GameState,
} from './sim';
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
  const view = new VillageView($('bar'), mainEl, {
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
    last = s;
  });

  const frame = () => view.update(game.tick(), Date.now());
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
      view.update(game.state, Date.now());
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
