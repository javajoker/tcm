// Application state (tech spec §8.2): preferences, the draft, the storage status. Persistence is injected so tests and the dev inspector can supply
// their own; derived values (policy, assessment) are computed from the draft, never stored here.
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import type { Lang } from "@tcm/i18n";
import { createAutosaver, type Autosaver } from "../storage/autosave.ts";
import { newDraft } from "../storage/draft.ts";
import { randomId } from "../storage/ids.ts";
import type { Persistence } from "../storage/persistence.ts";
import type { Draft, Prefs, SavedAssessment, StorageStatus } from "../storage/types.ts";

export interface AppState {
  readonly prefs: Prefs;
  readonly draft: Draft | null;
  /** False until the stored draft has been read; the Resume card must not decide before that. */
  readonly draftLoaded: boolean;
  readonly storage: StorageStatus;
  /** Reads the stored draft. Call once at start-up. */
  init(): Promise<void>;
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
}

export interface StoreDeps {
  readonly persistence: Persistence;
  readonly now?: () => number;
  readonly newId?: () => string;
  /** Called after an erase; the browser default navigates to `/`. */
  readonly reload?: () => void;
  readonly autosaveMs?: number;
}

export type AppStore = StoreApi<AppState> & { readonly flush: () => Promise<void> };

export function createAppStore({ persistence, now = () => Date.now(), newId = randomId, reload = () => { window.location.assign("/"); }, autosaveMs = 250 }: StoreDeps): AppStore {
  const saver: Autosaver<Draft> = createAutosaver((d) => persistence.saveDraft(d), autosaveMs);
  const store = createStore<AppState>()((set, get) => ({
    prefs: persistence.loadPrefs(),
    draft: null,
    draftLoaded: false,
    storage: persistence.status,
    async init() {
      const draft = await persistence.loadDraft();
      set((s) => ({ draft: s.draft ?? draft, draftLoaded: true, storage: persistence.status }));
    },
    setPrefs(patch) {
      const prefs = { ...get().prefs, ...patch };
      persistence.savePrefs(prefs);
      set({ prefs });
    },
    chooseLang(lang) { get().setPrefs({ lang, langOfferDismissed: true }); },
    startDraft() {
      const draft = newDraft(newId(), now());
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
    async eraseAll() {
      saver.cancel();
      await persistence.eraseAll();
      set({ draft: null });
      reload();
    },
  }));
  persistence.subscribe((storage) => store.setState({ storage }));
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
