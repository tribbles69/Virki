import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { SaveStore } from '../src/game/db';
import { Game } from '../src/game/game';
import { migrateSave, SaveError } from '../src/game/migrate';
import { exportFileName, exportSaveText, parseSaveText } from '../src/game/saveFile';
import { formatDuration } from '../src/game/summary';
import { advance, newGame, startUpgrade, buildTime, SAVE_VERSION, type GameState } from '../src/sim';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 10, 20, 12);

const freshStore = () => new SaveStore(new IDBFactory());

/** A controllable clock. */
const clockAt = (t: number) => {
  const c = { t, now: () => c.t };
  return c;
};

let seeds = 0;
const seed = () => `seed-${++seeds}`;

describe('migrateSave', () => {
  it('accepts a current save unchanged', () => {
    const s = newGame('x', T0);
    expect(migrateSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('fills in buildings and resources added since the save was made', () => {
    const s = JSON.parse(JSON.stringify(newGame('x', T0)));
    delete s.buildings.mine;
    delete s.resources.ore;
    const out = migrateSave(s);
    expect(out.buildings.mine).toBe(1);
    expect(out.resources.ore).toBe(0);
  });

  it('rejects junk, damage and saves from the future with a readable reason', () => {
    expect(() => migrateSave(null)).toThrow(SaveError);
    expect(() => migrateSave({ version: SAVE_VERSION + 1 })).toThrow(/newer version/);
    const s = JSON.parse(JSON.stringify(newGame('x', T0)));
    s.resources.wood = -5;
    expect(() => migrateSave(s)).toThrow(/damaged \(resource wood\)/);
    const t = JSON.parse(JSON.stringify(newGame('x', T0)));
    t.buildings.hall = 101;
    expect(() => migrateSave(t)).toThrow(/building hall/);
  });
});

describe('save file', () => {
  it('round-trips through export and import', () => {
    const s = advance(newGame('x', T0), T0 + HOUR);
    expect(parseSaveText(exportSaveText(s, new Date(T0)))).toEqual(s);
  });

  it('rejects files that are not Virki saves', () => {
    expect(() => parseSaveText('not json')).toThrow(/valid JSON/);
    expect(() => parseSaveText('{"hello":1}')).toThrow(/isn.t a Virki save/);
  });

  it('names files by date and time', () => {
    expect(exportFileName(new Date(2026, 10, 21, 9, 5))).toBe('virki-save-2026-11-21-0905.json');
  });
});

describe('SaveStore', () => {
  it('keeps the latest save and the one before as a backup', async () => {
    const store = freshStore();
    expect(await store.read()).toEqual({ current: undefined, previous: undefined });
    await store.write({ n: 1 }, 1);
    await store.write({ n: 2 }, 2);
    expect(await store.read()).toEqual({ current: { state: { n: 2 }, savedAt: 2 }, previous: { state: { n: 1 }, savedAt: 1 } });
    await store.clear();
    expect((await store.read()).current).toBeUndefined();
  });
});

describe('Game', () => {
  it('starts a new village when there is no save, and saves it', async () => {
    const store = freshStore();
    const r = await Game.start(store, () => T0, seed);
    expect(r.source).toBe('new');
    expect(r.summary).toBeUndefined();
    expect((await store.read()).current?.state).toEqual(r.game.state);
  });

  it('catches up on time away when reopened, finishing builds and filling stock', async () => {
    const store = freshStore();
    const clock = clockAt(T0);
    const first = (await Game.start(store, clock.now, seed)).game;
    const res = await first.act((s) => startUpgrade(s, 'woodcutter'));
    expect(res.ok).toBe(true);

    clock.t = T0 + 3 * HOUR; // app closed for 3 hours
    const back = await Game.start(store, clock.now, seed);
    expect(back.source).toBe('save');
    expect(back.game.state.buildings.woodcutter).toBe(2);
    expect(back.game.state.time).toBe(T0 + 3 * HOUR);
    expect(back.summary?.awayMs).toBe(3 * HOUR);
    expect(back.summary?.upgraded).toEqual([{ building: 'woodcutter', name: 'Woodcutter', level: 2 }]);
    expect(back.summary?.gained.stone).toBe(90);
  });

  it('gives the same result as if the app had stayed open', async () => {
    const store = freshStore();
    const clock = clockAt(T0);
    const g = (await Game.start(store, clock.now, seed)).game;
    await g.act((s) => startUpgrade(s, 'mine'));
    const live = advance(g.state, T0 + 10 * HOUR);

    clock.t = T0 + 10 * HOUR;
    const reopened = (await Game.start(store, clock.now, seed)).game.state;
    expect(reopened.buildings).toEqual(live.buildings);
    for (const r of ['wood', 'stone', 'ore'] as const) expect(reopened.resources[r]).toBeCloseTo(live.resources[r], 6);
  });

  it('saves on every action, so a crash right after loses nothing', async () => {
    const store = freshStore();
    const clock = clockAt(T0);
    const g = (await Game.start(store, clock.now, seed)).game;
    clock.t = T0 + MIN;
    await g.act((s) => startUpgrade(s, 'farm'));
    const saved = migrateSave((await store.read()).current?.state);
    expect(saved.buildQueue).toHaveLength(1);
    expect(saved.buildQueue[0].finishesAt).toBe(T0 + MIN + buildTime('farm', 2, 1));
  });

  it('does not save a failed action', async () => {
    const store = freshStore();
    const g = (await Game.start(store, () => T0, seed)).game;
    await g.act((s) => startUpgrade(s, 'farm'));
    const before = await store.read();
    const r = await g.act((s) => startUpgrade(s, 'quarry'));
    expect(r.ok).toBe(false);
    expect(await store.read()).toEqual(before);
  });

  it('falls back to the backup if the latest save is damaged', async () => {
    const store = freshStore();
    const g = (await Game.start(store, () => T0, seed)).game;
    await g.act((s) => startUpgrade(s, 'hall'));
    await store.write({ version: 1, seed: '' }, T0); // damaged write; the good save becomes the backup
    const r = await Game.start(store, () => T0 + MIN, seed);
    expect(r.source).toBe('backup');
    expect(r.warning).toMatch(/previous one was loaded/);
    expect(r.game.state.buildQueue).toHaveLength(1);
  });

  it('starts fresh with a warning if both saves are damaged', async () => {
    const store = freshStore();
    await store.write({ junk: true }, 1);
    await store.write({ junk: true }, 2);
    const r = await Game.start(store, () => T0, seed);
    expect(r.source).toBe('new');
    expect(r.warning).toMatch(/new village was started/);
  });

  it('imports an exported save and catches it up to now', async () => {
    const a = (await Game.start(freshStore(), () => T0, seed)).game;
    await a.act((s) => startUpgrade(s, 'quarry'));
    const text = a.exportText();

    const b = (await Game.start(freshStore(), () => T0 + 2 * HOUR, seed)).game;
    const summary = await b.importText(text);
    expect(b.state.seed).toBe(a.state.seed);
    expect(b.state.buildings.quarry).toBe(2);
    expect(summary.awayMs).toBe(2 * HOUR);
    await expect(b.importText('{"game":"other"}')).rejects.toThrow(SaveError);
    expect(b.state.buildings.quarry).toBe(2); // failed import leaves the game alone
  });

  it('notifies the screen on change and reset wipes the village', async () => {
    const store = freshStore();
    const clock = clockAt(T0);
    const g = (await Game.start(store, clock.now, seed)).game;
    const seen: GameState[] = [];
    g.subscribe((s) => seen.push(s));
    clock.t += HOUR;
    g.tick();
    expect(seen).toHaveLength(1);
    await g.act((s) => startUpgrade(s, 'farm'));
    await g.reset('brand-new');
    expect(g.state.seed).toBe('brand-new');
    expect(g.state.buildQueue).toEqual([]);
    expect(migrateSave((await store.read()).current?.state).seed).toBe('brand-new');
  });
});

describe('formatDuration', () => {
  it('reads naturally', () => {
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(5 * MIN)).toBe('5 min');
    expect(formatDuration(3 * HOUR + 20 * MIN)).toBe('3 h 20 min');
    expect(formatDuration(52 * HOUR)).toBe('2 days 4 h');
    expect(formatDuration(24 * HOUR)).toBe('1 day');
  });
});
