// The browser's own storage objects, picked in one place: each is `null` where it is not there or blocked (reading `localStorage` itself can throw). Kept apart from the persistence layer so that the tiny
// boot script (src/boot.ts) can use it without bringing the layer along.

export interface Environment {
  readonly localStorage?: Storage | null;
  readonly indexedDB?: IDBFactory | null;
  readonly caches?: CacheStorage | null;
}

export function browserEnvironment(): Environment {
  const pick = <T,>(get: () => T): T | null => { try { return get() ?? null; } catch { return null; } };
  return { localStorage: pick(() => window.localStorage), indexedDB: pick(() => window.indexedDB), caches: pick(() => window.caches) };
}
