// Device storage for the save, in IndexedDB. Keeps the previous save too, so a
// damaged write (crash mid-save, storage glitch) never loses the game.

const DB_NAME = 'virki';
const STORE = 'saves';
const CURRENT = 'current';
const PREVIOUS = 'previous';

export interface StoredSave {
  /** Raw save data; validated by migrateSave on load. */
  state: unknown;
  /** Wall-clock ms when written. */
  savedAt: number;
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Save storage is busy in another tab.'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Save aborted'));
  });
}

function get<T>(store: IDBObjectStore, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export class SaveStore {
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private conn(): Promise<IDBDatabase> {
    this.db ??= open(this.factory);
    return this.db;
  }

  /** Write a save; the one it replaces becomes the backup. One transaction, so it's all-or-nothing. */
  async write(state: unknown, savedAt: number): Promise<void> {
    const db = await this.conn();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const prev = await get<StoredSave>(store, CURRENT);
    if (prev) store.put(prev, PREVIOUS);
    store.put({ state, savedAt } satisfies StoredSave, CURRENT);
    await done(tx);
  }

  /** The latest save and the one before it (either may be missing). */
  async read(): Promise<{ current?: StoredSave; previous?: StoredSave }> {
    const db = await this.conn();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const [current, previous] = await Promise.all([get<StoredSave>(store, CURRENT), get<StoredSave>(store, PREVIOUS)]);
    await done(tx);
    return { current, previous };
  }

  /** Delete everything (new game). */
  async clear(): Promise<void> {
    const db = await this.conn();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await done(tx);
  }

  close(): void {
    void this.db?.then((d) => d.close());
    this.db = null;
  }
}
