// Application state (tech spec §8.2): preferences, the draft, the storage status. Persistence is injected so tests and the dev inspector can supply
// their own; derived values (policy, assessment) are computed from the draft, never stored here.
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import type { Lang } from "@tcm/i18n";
import { createAutosaver, type Autosaver } from "../storage/autosave.ts";
import type { BackupPrefs, Source as BackupSource, Write } from "../storage/backup/index.ts";
import { newDraft } from "../storage/draft.ts";
import { randomId } from "../storage/ids.ts";
import type { LockOutcome, LockStatus, Persistence, UnlockResult } from "../storage/persistence.ts";
import type { Draft, Prefs, SavedAssessment, StorageStatus } from "../storage/types.ts";

export interface AppState {
  readonly prefs: Prefs;
  readonly draft: Draft | null;
  /** False until the stored draft has been read; the Resume card must not decide before that. */
  readonly draftLoaded: boolean;
  readonly storage: StorageStatus;
  /** The local data lock (design §5): `unknown` until the lock record has been read; `locked` — nothing of the history is read or shown; `unlocked` — the key is in memory; `none` — there is no lock. */
  readonly lock: "unknown" | "none" | "locked" | "unlocked";
  /** What the lock screen needs: how many wrong passphrases in a row, when the next try is allowed, whether the lock record is unreadable. */
  readonly lockStatus: LockStatus | null;
  /** Reads the lock and, unless it is locked, the stored draft. Call once at start-up. */
  init(): Promise<void>;
  /** Try a passphrase; on success the history is read. */
  unlock(passphrase: string): Promise<UnlockResult>;
  /** Save what is pending, drop the key and show the lock screen (and reload, so that nothing of the history stays in memory). */
  lockNow(): Promise<void>;
  enableLock(passphrase: string): Promise<"ok" | "failed">;
  disableLock(passphrase: string): Promise<LockOutcome>;
  changePassphrase(current: string, next: string): Promise<LockOutcome>;
  setPrefs(patch: Partial<Prefs>): void;
  /** The user explicitly chose a language (toggle or the English offer): remember it. */
  chooseLang(lang: Lang): void;
  startDraft(): Draft;
  /** Replace the draft by this one (e.g. "edit and re-run" from a saved result). */
  adoptDraft(draft: Draft): void;
  /** Store a finished result; the draft is deleted once it is saved (tech spec §8.3). */
  saveAssessment(saved: SavedAssessment): Promise<void>;
  loadAssessment(id: string): Promise<SavedAssessment | null>;
  listAssessments(): Promise<SavedAssessment[]>;
  putAssessment(saved: SavedAssessment): Promise<void>;
  deleteAssessment(id: string): Promise<void>;
  /** Change the draft; `updatedAt` is stamped and the change is saved after a short debounce. */
  updateDraft(change: (d: Draft) => Draft): void;
  discardDraft(): Promise<void>;
  /** Erase everything on this device, then reload. */
  eraseAll(): Promise<void>;
  /** Everything a backup can hold, as stored (the unfinished assessment is written first, so it is the latest). */
  backupSource(): Promise<BackupSource>;
  /** Apply an import's writes in ONE transaction, then bring what the screens hold up to date; the preferences of the file (if chosen) are applied after, one by one. `false`: nothing changed. */
  applyImport(writes: readonly Write[], prefs: BackupPrefs | null): Promise<boolean>;
}

export interface StoreDeps {
  readonly persistence: Persistence;
  readonly now?: () => number;
  readonly newId?: () => string;
  /** Called after an erase; the browser default navigates to `/`. */
  readonly reload?: () => void;
  /** Called after the app locked, or when another tab changed the lock: the page is loaded again where it is, and finds the lock (default: reload the page). */
  readonly refresh?: () => void;
  /** Removes the offline copy and the service worker, so that an erased device does not keep an empty-cache worker (default: nothing to remove). */
  readonly removeOfflineCopy?: () => Promise<void>;
  readonly autosaveMs?: number;
}

export type AppStore = StoreApi<AppState> & { readonly flush: () => Promise<void> };

export function createAppStore({ persistence, now = () => Date.now(), newId = randomId, reload = () => { window.location.assign("/"); }, refresh = () => { window.location.reload(); }, removeOfflineCopy = () => Promise.resolve(), autosaveMs = 250 }: StoreDeps): AppStore {
  const saver: Autosaver<Draft> = createAutosaver((d) => persistence.saveDraft(d), autosaveMs);
  const store = createStore<AppState>()((set, get) => ({
    prefs: persistence.loadPrefs(),
    draft: null,
    draftLoaded: false,
    storage: persistence.status,
    lock: persistence.lock.hint() ? "unknown" : "none",           // a device known to have a lock waits for its record; any other shows the app at once, and `init` corrects it if the hint was wrong
    lockStatus: null,
    async init() {
      const lockStatus = await persistence.lock.status();
      if (lockStatus.phase === "locked") { set({ lock: "locked", lockStatus, draft: null, draftLoaded: false, storage: persistence.status }); return; }      // nothing of the history is read while locked
      const draft = await persistence.loadDraft();
      set((s) => ({ lock: lockStatus.phase, lockStatus, draft: s.draft ?? draft, draftLoaded: true, storage: persistence.status }));
    },
    async unlock(passphrase) {
      const result = await persistence.lock.unlock(passphrase);
      if (result.ok) await get().init();
      else set({ lockStatus: { phase: "locked", allowedAt: result.allowedAt, failures: result.failures, broken: result.reason === "broken" } });
      return result;
    },
    async lockNow() {
      await saver.flush();                      // a write in flight is awaited before the key is dropped
      saver.cancel();
      persistence.lock.lockNow();
      set({ lock: "locked", lockStatus: await persistence.lock.status(), draft: null, draftLoaded: false });
      refresh();
    },
    async enableLock(passphrase) {
      await saver.flush();
      const result = await persistence.lock.enable(passphrase);
      if (result === "ok") set({ lock: "unlocked", lockStatus: await persistence.lock.status() });
      return result;
    },
    async disableLock(passphrase) {
      await saver.flush();
      const result = await persistence.lock.disable(passphrase);
      set({ lock: result === "ok" ? "none" : get().lock, lockStatus: await persistence.lock.status() });
      return result;
    },
    async changePassphrase(current, next) {
      const result = await persistence.lock.change(current, next);
      set({ lockStatus: await persistence.lock.status() });
      return result;
    },
    setPrefs(patch) {
      const prefs = { ...get().prefs, ...patch };
      persistence.savePrefs(prefs);
      set({ prefs });
    },
    chooseLang(lang) { get().setPrefs({ lang, langOfferDismissed: true }); },
    startDraft() {
      const fresh = newDraft(newId(), now());
      const draft = get().prefs.rememberBirthDefault === true ? { ...fresh, rememberBirth: true } : fresh;
      set({ draft });
      saver.schedule(draft);
      return draft;
    },
    adoptDraft(draft) {
      set({ draft });
      saver.schedule(draft);
    },
    async saveAssessment(saved) {
      await persistence.putAssessment(saved);
      saver.cancel();
      set({ draft: null });
      await persistence.clearDraft();
    },
    loadAssessment: (id) => persistence.getAssessment(id),
    listAssessments: () => persistence.listAssessments(),
    putAssessment: (saved) => persistence.putAssessment(saved),
    deleteAssessment: (id) => persistence.deleteAssessment(id),
    updateDraft(change) {
      const current = get().draft;
      if (current === null) return;
      const draft = { ...change(current), updatedAt: now() };
      set({ draft });
      saver.schedule(draft);
    },
    async discardDraft() {
      saver.cancel();
      set({ draft: null });
      await persistence.clearDraft();
    },
    async backupSource() {
      await saver.flush();
      return { assessments: await persistence.listAssessments(), draft: await persistence.loadDraft(), prefs: get().prefs };
    },
    async applyImport(writes, prefs) {
      const ok = await persistence.applyWrites(writes);
      if (!ok) return false;
      if (writes.some((w) => w.store === "drafts")) set({ draft: await persistence.loadDraft() });
      if (prefs !== null) get().setPrefs(prefs);
      return true;
    },
    async eraseAll() {
      saver.cancel();
      await persistence.eraseAll();
      try { await removeOfflineCopy(); } catch { /* the rest is erased; a worker left behind has an empty cache and is removed with the next visit's "Remove offline copy" or erase */ }
      set({ draft: null });
      reload();
    },
  }));
  persistence.subscribe((storage) => store.setState({ storage }));
  let reloading = false;
  persistence.lock.onChanged(() => { saver.cancel(); if (!reloading) { reloading = true; refresh(); } });      // another tab turned the lock on, off or changed it: load again, once, and find the lock as it now is
  const flush = (): Promise<void> => saver.flush();
  return Object.assign(store, { flush });
}

const Ctx = createContext<AppStore | null>(null);

export function StoreProvider({ store, children }: { store: AppStore; children: ReactNode }): ReactNode {
  // a draft change in the last few hundred ms must not be lost when the tab is hidden or closed
  useEffect(() => {
    const onHide = (): void => { void store.flush(); };
    const onVisibility = (): void => { if (document.visibilityState === "hidden") onHide(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("pagehide", onHide); document.removeEventListener("visibilitychange", onVisibility); };
  }, [store]);
  useEffect(() => { void store.getState().init(); }, [store]);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useApp<T>(selector: (s: AppState) => T): T {
  const store = useContext(Ctx);
  if (store === null) throw new Error("useApp must be used inside <StoreProvider>");
  return useStore(store, selector);
}
