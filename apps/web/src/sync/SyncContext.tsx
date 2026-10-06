import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useLoadedOptional, type Loaded } from "../app/knowledge.tsx";
import { useAppStore } from "../app/store.tsx";
import { chooseFile, fileOf, syncSupported, type HandleLike } from "./file.ts";
import type * as DepsModule from "./deps.ts";
import type { FileSync, SyncState } from "./session.ts";

// The session and its backup engine are a chunk of their own (`./deps.ts`): the start page needs only to know whether a file has been chosen, and to say so when the saved results change.
const deps = (): Promise<typeof DepsModule> => import("./deps.ts");

const OFF: SyncState = { phase: "off", name: null, writtenAt: null, failure: null, pending: null };

/** The sync session, held outside React so that it can come and go without a render being involved; `getSnapshot` is stable until the session says something. */
function createHolder() {
  let current: FileSync | null = null;
  let unsubscribe: (() => void) | null = null;
  let snapshot: SyncState = OFF;
  const listeners = new Set<() => void>();
  const emit = (): void => { snapshot = current?.getState() ?? OFF; for (const l of [...listeners]) l(); };
  return {
    get sync(): FileSync | null { return current; },
    attach(next: FileSync | null): void { unsubscribe?.(); current = next; unsubscribe = next?.subscribe(emit) ?? null; emit(); },
    subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: (): SyncState => snapshot,
  };
}

export interface SyncApi {
  /** This browser can keep a file the person chose, and this device can remember which: the card is shown at all. */
  readonly supported: boolean;
  readonly state: SyncState;
  /** Ask the person for a file (this must be called from a click) and start keeping it up to date; `passphrase` is the file's. Resolves with where that left things. */
  setup(passphrase: string): Promise<SyncState>;
  allow(): Promise<void>;
  unlock(passphrase: string): Promise<void>;
  writeNow(): Promise<void>;
  stop(): Promise<void>;
  /** While a merge waits: the file's text and the passphrase it was opened with, for the restore dialog. */
  mergeInput(): { readonly text: string; readonly passphrase: string } | null;
  /** The file waiting was merged (or there was nothing to merge): carry on, and write the merged history. */
  merged(): Promise<void>;
}

const Ctx = createContext<SyncApi | null>(null);

export const useSync = (): SyncApi => {
  const api = useContext(Ctx);
  if (api === null) throw new Error("useSync must be used inside <SyncProvider>");
  return api;
};

/**
 * Keeping a file up to date (docs/post-mvp/design/research-tracks.md §4): once for the whole app. On a browser that can choose a file it finds the file remembered from an earlier session — which must be allowed
 * and given its passphrase again, in Settings, never in the background — and tells the session when the saved results change; on any other browser it does nothing, and the manual backup remains.
 */
export function SyncProvider({ children }: { children: ReactNode }): ReactNode {
  const store = useAppStore();
  const loaded = useLoadedOptional();
  const loadedRef = useRef<Loaded | null>(loaded);
  useEffect(() => { loadedRef.current = loaded; }, [loaded]);
  const holder = useMemo(() => createHolder(), []);
  const supported = syncSupported();

  // a file remembered from an earlier session
  useEffect(() => {
    if (!supported) return;
    let alive = true;
    void (async () => {
      const record = await store.syncFile.load();
      if (record === null || !alive || holder.sync !== null) return;
      const file = fileOf(record.handle as HandleLike);
      const permission = await file.permission();
      const { makeSync } = await deps();
      if (alive && holder.sync === null) holder.attach(makeSync(store, () => loadedRef.current, { file, record, permission }));
    })();
    return () => { alive = false; };
  }, [store, holder, supported]);

  // the saved results changed, or the lock engaged
  useEffect(() => store.onAssessmentsChanged(() => { holder.sync?.touch(); }), [store, holder]);
  useEffect(() => store.subscribe((state, before) => { if (state.lock === "locked" && before.lock !== "locked") holder.sync?.forgetPassphrase(); }), [store, holder]);
  useEffect(() => () => { holder.sync?.dispose(); }, [holder]);

  const state = useSyncExternalStore(holder.subscribe, holder.getSnapshot, holder.getSnapshot);
  const api = useMemo<SyncApi>(() => ({
    supported,
    state,
    async setup(passphrase) {
      // the picker first: it needs the click that called this, and nothing may be awaited before it
      const handle = await chooseFile();
      if (handle === null) return holder.getSnapshot();
      const { makeSync } = await deps();
      await holder.sync?.stop();                                                                  // setting up is offered only with no file kept, so this forgets nothing but a session that has ended
      const sync = makeSync(store, () => loadedRef.current, null);
      holder.attach(sync);
      await sync.attach(fileOf(handle), handle, passphrase);
      return sync.getState();
    },
    allow: async () => { await holder.sync?.allow(); },
    unlock: async (passphrase) => { await holder.sync?.unlock(passphrase); },
    writeNow: async () => { await holder.sync?.writeNow(); },
    stop: async () => { await holder.sync?.stop(); holder.attach(null); },
    mergeInput: () => holder.sync?.mergeInput() ?? null,
    merged: async () => { await holder.sync?.merged(); },
  }), [supported, state, holder, store]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
