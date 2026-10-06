// A tiny promise wrapper over IndexedDB (database `tcm-app`, schema version 1: stores `drafts`, `assessments`, `meta`), plus an in-memory twin used when
// IndexedDB is unavailable (private windows, blocked storage) and in tests. Every method may reject; `persistence.ts` turns rejections into the "Not saved" state.

export const DB_NAME = "tcm-app";
export const DB_VERSION = 1;
export const STORES = ["drafts", "assessments", "meta"] as const;
export type StoreName = (typeof STORES)[number];

export type BatchWrite = { readonly store: StoreName; readonly key: string; readonly value: unknown } | { readonly store: StoreName; readonly key: string; readonly delete: true };

/** The key of the lock record in the `meta` store (docs/post-mvp/design/backup-and-data-lock.md §5.3). */
export const LOCK_KEY = "lock";

/**
 * Conditions a batch is made under, checked INSIDE its transaction, so that nothing is written when one fails:
 *  - `lock`: the id of the data key the writer believes is in force (`null`: no lock). A tab that does not know the lock was turned on, off or replaced cannot write around it;
 *  - `expect`: the exact entries a store still holds, for "encrypt everything" and "decrypt everything" — a record saved by another tab in the meantime makes the batch fail, never be overwritten.
 */
export interface BatchOptions {
  readonly lock?: string | null;
  readonly expect?: { readonly [S in StoreName]?: readonly (readonly [string, unknown])[] };
}

/** A batch was refused because a condition no longer held; nothing was written. */
export class ConflictError extends Error {
  readonly kind: "lock" | "changed";
  constructor(kind: "lock" | "changed") { super(kind === "lock" ? "the lock changed" : "the stored records changed"); this.name = "ConflictError"; this.kind = kind; }
}

/** The key id inside a stored lock record, if it has one. */
export const keyIdOf = (record: unknown): string | null => (typeof record === "object" && record !== null && typeof (record as { keyId?: unknown }).keyId === "string" ? (record as { keyId: string }).keyId : null);

/** The same entries? Keys and values (as JSON: records are plain data, and both sides were read the same way). */
const sameEntries = (a: readonly (readonly [string, unknown])[], b: readonly (readonly [string, unknown])[]): boolean => {
  if (a.length !== b.length) return false;
  const mine = new Map(a.map(([k, v]) => [k, JSON.stringify(v)] as const));
  return b.every(([k, v]) => mine.get(k) === JSON.stringify(v));
};

export interface Db {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  getAll<T>(store: StoreName): Promise<T[]>;
  /** Every key with its value, read in one transaction (a consistent snapshot). */
  entries<T>(store: StoreName): Promise<[string, T][]>;
  /** Several writes in ONE transaction (across stores): all of them or none. With `options`, only if the conditions still hold — otherwise it rejects with a `ConflictError` and nothing is written. */
  batch(writes: readonly BatchWrite[], options?: BatchOptions): Promise<void>;
  /** Closes the connection (so a delete can proceed); the Db is unusable afterwards. */
  close(): void;
}

const request = <T>(r: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed")); });
const done = (t: IDBTransaction): Promise<void> => new Promise((resolve, reject) => { t.oncomplete = () => resolve(); t.onerror = () => reject(t.error ?? new Error("IndexedDB transaction failed")); t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted")); });

/**
 * One readwrite transaction: first the conditions (the lock record, the expected entries), read by requests whose callbacks run while the transaction is active, then — only if they all hold — the writes,
 * issued from the callback of the last check. Nothing awaits anything else in between (a promise from another subsystem, such as WebCrypto, would let the transaction finish), so the whole is atomic.
 */
function runBatch(db: IDBDatabase, writes: readonly BatchWrite[], options: BatchOptions): Promise<void> {
  const expect = Object.entries(options.expect ?? {}) as [StoreName, readonly (readonly [string, unknown])[]][];
  const names = new Set<StoreName>(writes.map((w) => w.store));
  if (options.lock !== undefined) names.add("meta");
  for (const [store] of expect) names.add(store);
  if (names.size === 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction([...names], "readwrite");
    let conflict: ConflictError | null = null;
    t.oncomplete = () => resolve();
    t.onerror = () => reject(conflict ?? t.error ?? new Error("IndexedDB transaction failed"));
    t.onabort = () => reject(conflict ?? t.error ?? new Error("IndexedDB transaction aborted"));
    const refuse = (kind: "lock" | "changed"): void => { conflict ??= new ConflictError(kind); try { t.abort(); } catch { /* already finished */ } };
    let waiting = 0;
    const apply = (): void => {
      try {
        for (const w of writes) { if ("delete" in w) t.objectStore(w.store).delete(w.key); else t.objectStore(w.store).put(w.value, w.key); }
      } catch (e) { try { t.abort(); } catch { /* already finished */ } reject(e); }
    };
    const checked = (): void => { waiting -= 1; if (waiting === 0 && conflict === null) apply(); };
    if (options.lock !== undefined) {
      waiting += 1;
      const r = t.objectStore("meta").get(LOCK_KEY);
      r.onsuccess = () => { if (keyIdOf(r.result) !== options.lock) refuse("lock"); else checked(); };
    }
    for (const [store, expected] of expect) {
      waiting += 1;
      const os = t.objectStore(store);
      const keysRequest = os.getAllKeys();
      const valuesRequest = os.getAll();
      let keys: IDBValidKey[] | null = null;
      let values: unknown[] | null = null;
      const compare = (): void => {
        if (keys === null || values === null) return;
        if (!sameEntries(keys.map((k, i) => [String(k), values![i]] as const), expected)) refuse("changed"); else checked();
      };
      keysRequest.onsuccess = () => { keys = keysRequest.result; compare(); };
      valuesRequest.onsuccess = () => { values = valuesRequest.result; compare(); };
    }
    if (waiting === 0) apply();
  });
}

export function openIndexedDb(factory: IDBFactory): Promise<Db> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try { req = factory.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);     // out-of-line keys: one shape for every store
    };
    req.onblocked = () => reject(new Error("IndexedDB open blocked"));
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();       // another tab is deleting or upgrading: step aside rather than block it
      resolve({
        async get<T>(store: StoreName, key: string) { return (await request(db.transaction(store, "readonly").objectStore(store).get(key))) as T | undefined; },
        async put(store, key, value) { const t = db.transaction(store, "readwrite"); t.objectStore(store).put(value, key); await done(t); },
        async delete(store, key) { const t = db.transaction(store, "readwrite"); t.objectStore(store).delete(key); await done(t); },
        async getAll<T>(store: StoreName) { return (await request(db.transaction(store, "readonly").objectStore(store).getAll())) as T[]; },
        async entries<T>(store: StoreName) {
          const t = db.transaction(store, "readonly");
          const os = t.objectStore(store);
          const [keys, values] = await Promise.all([request(os.getAllKeys()), request(os.getAll())]);
          return keys.map((k, i) => [String(k), values[i] as T] as [string, T]);
        },
        batch(writes, options = {}) { return runBatch(db, writes, options); },
        close() { db.close(); },
      });
    };
  });
}

/** Deletes the whole database. Resolves when it is gone (or never existed). */
export function deleteIndexedDb(factory: IDBFactory): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = factory.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("IndexedDB delete failed"));
    req.onblocked = () => resolve();      // a connection in another tab will close on `versionchange`; the delete then completes on its own
  });
}

export function createMemoryDb(): Db {
  const data = new Map<StoreName, Map<string, unknown>>(STORES.map((s) => [s, new Map()]));
  const store = (s: StoreName): Map<string, unknown> => data.get(s)!;
  return {
    async get<T>(s: StoreName, key: string) { return structuredClone(store(s).get(key)) as T | undefined; },
    async put(s, key, value) { store(s).set(key, structuredClone(value)); },
    async delete(s, key) { store(s).delete(key); },
    async getAll<T>(s: StoreName) { return [...store(s).values()].map((v) => structuredClone(v) as T); },
    async entries<T>(s: StoreName) { return [...store(s).entries()].map(([k, v]) => [k, structuredClone(v) as T] as [string, T]); },
    async batch(writes, options = {}) {
      // the conditions first, then all or nothing, as a transaction is: build the result on copies, and only if every write succeeded swap them in
      if (options.lock !== undefined && keyIdOf(store("meta").get(LOCK_KEY)) !== options.lock) throw new ConflictError("lock");
      for (const [st, expected] of Object.entries(options.expect ?? {}) as [StoreName, readonly (readonly [string, unknown])[]][]) if (!sameEntries([...store(st).entries()], expected)) throw new ConflictError("changed");
      const next = new Map<StoreName, Map<string, unknown>>(STORES.map((st) => [st, new Map(store(st))]));
      for (const w of writes) { const m = next.get(w.store)!; if ("delete" in w) m.delete(w.key); else m.set(w.key, structuredClone(w.value)); }
      for (const st of STORES) data.set(st, next.get(st)!);
    },
    close() { /* nothing to release */ },
  };
}
