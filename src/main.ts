import './style.css';
import {
  blockerText,
  cancelLastUpgrade,
  cancelRecruit,
  recruit,
  recruitBlockerText,
  cancelResearch,
  craftName,
  researchBlockerText,
  researchInfo,
  startResearch,
  cancelLastSmelt,
  smelt,
  smeltBlockerText,
  METAL_DATA,
  METALS,
  startUpgrade,
  upgradeInfo,
  BUILDINGS,
  BUILDING_DATA,
  RESOURCES,
  RESOURCE_NAMES,
  UNIT_DATA,
  ATTACK_BLOCKER_TEXT,
  recallMarch,
  reportHeadline,
  sendAttack,
  deleteReport,
  markAllReportsRead,
  markReportRead,
  unreadReports,
  visibleRaids,
  type GameState,
} from './sim';
import { clockTime } from './ui/format';
import { BarracksView } from './ui/barracks';
import { SmithyView } from './ui/smithyview';
import { ForgeView } from './ui/forgeview';
import { MapView } from './ui/mapview';
import { ReportsView } from './ui/reports';
import { DefenceView } from './ui/defences';
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
      <button class="tab" role="tab" data-tab="barracks">Army</button>
      <button class="tab" role="tab" data-tab="map">Map</button>
      <button class="tab" role="tab" data-tab="reports">Reports<span class="badge" id="unread" hidden></span></button>
    </nav>
    <button class="raid-banner" id="raid-banner" hidden></button>
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
  const fought = s.battles.won + s.battles.lost;
  if (fought) bits.push(`${fought} battle${fought === 1 ? '' : 's'} fought (${s.battles.won} won)`);
  const raided = s.raids.held + s.raids.lost;
  if (raided) {
    bits.push(
      s.raids.lost === 0
        ? `bandits raided you ${raided === 1 ? 'once' : `${raided} times`} and your village held`
        : `bandits raided you ${raided === 1 ? 'once' : `${raided} times`} (${s.raids.lost} got through: see Reports)`,
    );
  }
  if (s.smelted.length) bits.push(`${s.smelted.join(' and ')} ingots smelted`);
  if (s.researched.length) bits.push(`the smiths finished ${s.researched.join(' and ')}`);
  if (s.resets) bits.push(`the bandit camps are back${s.warlord ? ` and ${s.warlord} has made camp` : ''}`);
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
  const reportsPane = document.createElement('div');
  villagePane.className = barracksPane.className = mapPane.className = reportsPane.className = 'stack';
  mainEl.append(villagePane, barracksPane, mapPane, reportsPane);

  const panes = { village: villagePane, barracks: barracksPane, map: mapPane, reports: reportsPane } as const;
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
  const mapView = new MapView(mapPane, {
    attack: async (campId, troops) => {
      const r = await game.act((s) => sendAttack(s, campId, troops));
      if (!r.ok) {
        toast(ATTACK_BLOCKER_TEXT[r.reason], 'error', 3_000);
        return false;
      }
      const m = game.state.marches.find((x) => x.id === r.marchId);
      const camp = game.state.map.camps.find((c) => c.id === campId);
      if (m && camp) toast(`Your army marches on ${camp.name}. It arrives at ${clockTime(m.arriveAt, Date.now())}.`);
      return true;
    },
    recall: async (marchId) => {
      const m = game.state.marches.find((x) => x.id === marchId);
      if (!m) return;
      if (!confirm('Call this army back? It will turn round and walk home.')) return;
      await game.act((s) => recallMarch(s, marchId));
    },
  });

  const unreadBadge = $('unread');
  const reportsView = new ReportsView(reportsPane, {
    open: (id) => void game.act((s) => ({ ok: true, state: markReportRead(s, id) })),
    markAllRead: () => void game.act((s) => ({ ok: true, state: markAllReportsRead(s) })),
    remove: async (id) => {
      if (!confirm('Delete this report?')) return;
      await game.act((s) => ({ ok: true, state: deleteReport(s, id) }));
    },
    attackAgain: (campId) => {
      showTab('map');
      mapView.selectCamp(campId);
    },
  });

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
  const smithyView = new SmithyView(barracksPane, {
    research: async (unit, track) => {
      const r = await game.act((s) => startResearch(s, unit, track));
      if (!r.ok) toast(researchBlockerText(researchInfo(game.state, unit, track)) || 'Can’t research that right now.', 'error', 3_000);
    },
    cancel: async () => {
      const job = game.state.researchQueue[0];
      if (!job) return;
      if (!confirm(`Cancel ${UNIT_DATA[job.unit].name} ${job.track === 'weapon' ? 'weapons' : 'armour'} research? You’ll get a full refund.`)) return;
      await game.act((s) => cancelResearch(s));
    },
  });
  const forgeView = new ForgeView(barracksPane, {
    smelt: async (metal, count) => {
      const r = await game.act((s) => smelt(s, metal, count));
      if (!r.ok) toast(smeltBlockerText(metal, r.reason), 'error', 3_000);
      return r.ok;
    },
    cancel: async () => {
      const b = game.state.smeltQueue[game.state.smeltQueue.length - 1];
      if (!b) return;
      if (!confirm(`Cancel smelting ${b.count} ${METAL_DATA[b.metal].name} ingots? You’ll get the ore and wood back.`)) return;
      await game.act((s) => cancelLastSmelt(s));
    },
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
  const defenceView = new DefenceView(villagePane, $('raid-banner'), () => showTab('village'));

  const greeting = started.warning ?? welcome(started.summary, started.source);
  if (greeting) toast(greeting, started.warning ? 'error' : 'info', 10_000);

  // Announce builds that finish while the app is open.
  let last: GameState = game.state;
  game.subscribe((s) => {
    for (const b of BUILDINGS) {
      if (s.buildings[b] > last.buildings[b]) toast(`${BUILDING_DATA[b].name} reached level ${s.buildings[b]}.`);
    }
    // Ingots out of the furnace, and newly unlocked metals.
    for (const m of METALS) {
      const made = s.ingots[m] - last.ingots[m];
      if (made > 0) toast(`The forge cooled: ${made} ${METAL_DATA[m].name} ingot${made === 1 ? '' : 's'} ready.`);
      if (s.buildings.mine >= METAL_DATA[m].mine && last.buildings.mine < METAL_DATA[m].mine && m !== 'copper') {
        toast(`Your miners struck ${METAL_DATA[m].name.toLowerCase()} ore! It will trickle in from now on.`, 'info', 10_000);
      }
    }
    // Smithy research finished.
    for (const u of Object.keys(s.smithy) as (keyof typeof s.smithy)[]) {
      if (s.smithy[u].weapon > last.smithy[u].weapon) toast(`The smiths finished: ${UNIT_DATA[u].plural} now carry ${craftName(s.smithy[u].weapon)} weapons.`);
      if (s.smithy[u].armour > last.smithy[u].armour) toast(`The smiths finished: ${UNIT_DATA[u].plural} now wear ${craftName(s.smithy[u].armour)} armour.`);
    }
    // A training batch finished (the queue shrank while soldiers arrived).
    const prev = last.recruitQueue[0];
    if (prev && s.recruitQueue.length < last.recruitQueue.length && s.troops[prev.unit] > last.troops[prev.unit]) {
      toast(`${prev.count} ${prev.count === 1 ? UNIT_DATA[prev.unit].name : UNIT_DATA[prev.unit].plural} ready for battle.`);
    }
    // The Watchtower spots a raid.
    const seenRaids = new Set(visibleRaids(last).map((r) => r.id));
    for (const r of visibleRaids(s)) {
      if (!seenRaids.has(r.id)) toast(`⚠️ Watchtower: bandits from ${r.campName} are coming! They land at ${clockTime(r.arriveAt, Date.now())}.`, 'error', 10_000);
    }
    // A daily reset while the app is open.
    if (s.resetsDone > last.resetsDone) {
      const w = s.map.camps.find((c) => c.kind === 'warlord');
      toast(`A new day: the bandit camps are back${w ? `, and the Warlord ${w.name} has made camp` : ''}.`, 'info', 10_000);
    }
    // Battles fought and armies home since the last update.
    const seen = new Set(last.reports.map((r) => r.id));
    const fresh = s.reports.filter((r) => !seen.has(r.id));
    if (fresh.length === 1) toast(reportHeadline(fresh[0]), fresh[0].won ? 'info' : 'error', 8_000);
    else if (fresh.length > 1) toast(`${fresh.length} battles fought: ${fresh.filter((r) => r.won).length} won.`, 'info', 8_000);
    const homeNow = last.marches.filter((m) => m.phase === 'returning' && !s.marches.some((x) => x.id === m.id));
    if (homeNow.length > 0 && fresh.length === 0) {
      const camp = s.map.camps.find((c) => c.id === homeNow[0].campId);
      toast(homeNow.length === 1 ? `Your army is home from ${camp?.name ?? 'the field'}.` : `${homeNow.length} armies are home.`);
    }
    last = s;
  });

  const frame = () => {
    const s = game.tick();
    const now = Date.now();
    view.update(s, now);
    barracks.update(s, now);
    smithyView.update(s, now);
    forgeView.update(s, now);
    mapView.update(s, now);
    reportsView.update(s, now);
    defenceView.update(s, now);
    const unread = unreadReports(s);
    unreadBadge.hidden = unread === 0;
    unreadBadge.textContent = unread > 99 ? '99+' : String(unread);
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
