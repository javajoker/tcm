import { IDBFactory } from "fake-indexeddb";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { App } from "../src/app/App.tsx";
import type { Loader } from "../src/app/knowledge.tsx";
import { createAppStore, StoreProvider, type AppStore, type StoreDeps } from "../src/app/store.tsx";
import { createPersistence, type Environment, type Persistence } from "../src/storage/persistence.ts";

let seq = 0;      // draft ids are unique across the stores of one test run

/** A storage environment backed by a fresh fake IndexedDB and a Map-backed localStorage. */
export function fakeEnvironment(over: Partial<Environment> = {}): Environment & { readonly localStorage: Storage } {
  const data = new Map<string, string>();
  const ls: Storage = {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => { data.set(k, String(v)); },
  };
  return { localStorage: ls, indexedDB: new IDBFactory(), caches: null, ...over } as Environment & { readonly localStorage: Storage };
}

/** Storage that throws on every use: blocked cookies / private windows / quota. */
export const blockedEnvironment = (): Environment & { readonly localStorage: Storage } => ({
  localStorage: new Proxy({} as Storage, { get() { throw new DOMException("denied", "SecurityError"); } }),
  indexedDB: { open() { throw new DOMException("denied", "SecurityError"); }, deleteDatabase() { throw new DOMException("denied", "SecurityError"); } } as unknown as IDBFactory,
  caches: null,
});

export function testStore(env: Environment = fakeEnvironment(), deps: Partial<StoreDeps> = {}): { store: AppStore; persistence: Persistence; env: Environment } {
  const persistence = createPersistence(env);
  let n = 0;
  const store = createAppStore({ persistence, now: () => 1_000 + n++, newId: () => `id${seq++}`, reload: () => undefined, ...deps });
  return { store, persistence, env };
}

export function renderApp(store: AppStore = testStore().store, load?: Loader): ReturnType<typeof render> & { store: AppStore } {
  const ui: ReactNode = <StoreProvider store={store}><App {...(load ? { load } : {})} /></StoreProvider>;
  return { ...render(ui), store };
}
