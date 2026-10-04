// A tiny promise wrapper over IndexedDB (database `tcm-app`, schema version 1: stores `drafts`, `assessments`, `meta`), plus an in-memory twin used when
// IndexedDB is unavailable (private windows, blocked storage) and in tests. Every method may reject; `persistence.ts` turns rejections into the "Not saved" state.

export const DB_NAME = "tcm-app";
export const DB_VERSION = 1;
export const STORES = ["drafts", "assessments", "meta"] as const;
export type StoreName = (typeof STORES)[number];

export interface Db {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  getAll<T>(store: StoreName): Promise<T[]>;
  /** Closes the connection (so a delete can proceed); the Db is unusable afterwards. */
  close(): void;
}

const request = <T>(r: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed")); });
const done = (t: IDBTransaction): Promise<void> => new Promise((resolve, reject) => { t.oncomplete = () => resolve(); t.onerror = () => reject(t.error ?? new Error("IndexedDB transaction failed")); t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted")); });

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
    close() { /* nothing to release */ },
  };
}
