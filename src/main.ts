import './style.css';
import { BUILDINGS, BUILDING_DATA, RESOURCES, RESOURCE_NAMES, productionPerHour, storageCap } from './sim';
import { SaveStore } from './game/db';
import { Game, type StartResult } from './game/game';
import { exportFileName } from './game/saveFile';
import { formatDuration, type CatchUpSummary } from './game/summary';

const app = document.querySelector<HTMLDivElement>('#app')!;
const fmt = (n: number) => Math.floor(n).toLocaleString('en-GB');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

app.innerHTML = `
  <img src="icon.svg" width="72" height="72" alt="" />
  <h1>VIRKI</h1>
  <p id="message">Loading your village…</p>
  <div class="panel" id="village" hidden></div>
  <div class="actions" id="actions" hidden>
    <button id="export">Export save</button>
    <button id="import">Import save</button>
    <input id="file" type="file" accept=".json,application/json" hidden />
  </div>
  <div class="status" id="status">v${__APP_VERSION__}</div>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const message = $('message');
const village = $('village');
const status = $('status');
let offline = 'dev build';

function welcome(s: CatchUpSummary | undefined, source: StartResult['source']): string {
  if (source === 'new' || !s) return 'A new village. Building starts soon.';
  if (s.awayMs < 60_000) return 'Welcome back.';
  const bits = RESOURCES.filter((r) => s.gained[r] > 0).map((r) => `+${fmt(s.gained[r])} ${RESOURCE_NAMES[r].toLowerCase()}`);
  for (const u of s.upgraded) bits.push(`${u.name} reached level ${u.level}`);
  return `Away for ${formatDuration(s.awayMs)}.${bits.length ? ` ${bits.join(', ')}.` : ''}`;
}

function render(game: Game) {
  const s = game.state;
  const cap = storageCap(s);
  village.innerHTML = `
    <table>
      ${RESOURCES.map(
        (r) => `<tr><th>${RESOURCE_NAMES[r]}</th><td>${fmt(s.resources[r])} / ${fmt(cap)}</td><td class="muted">+${fmt(productionPerHour(s, r))}/h</td></tr>`,
      ).join('')}
    </table>
    <p class="muted small">${BUILDINGS.map((b) => `${BUILDING_DATA[b].name} ${s.buildings[b]}`).join(' · ')}</p>
  `;
  status.textContent = `v${__APP_VERSION__} · ${offline} · saved on this device`;
}

async function main() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker
      .register('sw.js')
      .then(() => (offline = 'works offline'))
      .catch(() => (offline = 'offline mode unavailable'));
  }
  // Ask the browser not to clear our storage when space runs low.
  void navigator.storage?.persist?.();

  const started = await Game.start(new SaveStore(), () => Date.now(), () => crypto.randomUUID());
  const game = started.game;
  message.textContent = started.warning ?? welcome(started.summary, started.source);
  village.hidden = false;
  $('actions').hidden = false;

  game.subscribe(() => render(game));
  render(game);
  setInterval(() => game.tick(), 1_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') game.tick();
    else void game.save();
  });

  $('export').addEventListener('click', () => {
    const blob = new Blob([game.exportText()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = exportFileName(new Date());
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    message.textContent = 'Save exported. Keep the file somewhere safe.';
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
      message.textContent = `Save imported. ${welcome(summary, 'save')}`;
    } catch (e) {
      message.innerHTML = `<span class="error">${esc(e instanceof Error ? e.message : String(e))}</span>`;
    }
  });
}

main().catch((e) => {
  message.innerHTML = `<span class="error">Couldn’t open your save storage: ${esc(String(e))}</span>`;
});
