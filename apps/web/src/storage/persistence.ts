// The ONE module that touches browser storage (docs/privacy.md §6 rule 4; enforced by an ESLint rule). Every call is wrapped: storage that is missing,
// blocked or full degrades to memory and flips `status` to "memory", which the UI shows as a "Not saved" chip. Nothing here ever throws to a caller.
import type { Environment } from "./browser.ts";
import { createKV, type KV } from "./kv.ts";
import { createMemoryDb, deleteIndexedDb, openIndexedDb, type Db } from "./db.ts";
import { parseDraft, toStored } from "./draft.ts";
import { ASSESSMENT_MIGRATIONS, ASSESSMENT_VERSION, DRAFT_MIGRATIONS, DRAFT_VERSION, migrate, wrap } from "./migrations.ts";
import { parsePrefs, PREFS_KEY, serializePrefs } from "./prefs.ts";
import type { Draft, Prefs, SavedAssessment, StorageStatus } from "./types.ts";

export { browserEnvironment, type Environment } from "./browser.ts";

export interface EraseReport { readonly indexedDb: boolean; readonly localStorage: boolean; readonly cacheStorage: boolean }

export interface Persistence {
  readonly status: StorageStatus;
  subscribe(listener: (status: StorageStatus) => void): () => void;
  loadPrefs(): Prefs;
  savePrefs(prefs: Prefs): void;
  loadDraft(): Promise<Draft | null>;
  saveDraft(draft: Draft): Promise<void>;
  clearDraft(): Promise<void>;
  putAssessment(a: SavedAssessment): Promise<void>;
  getAssessment(id: string): Promise<SavedAssessment | null>;
  listAssessments(): Promise<SavedAssessment[]>;
  deleteAssessment(id: string): Promise<void>;
  /**
   * Apply writes (an import's) in ONE transaction: all of them or none. `true` when they were committed; `false` — and nothing changed — when storage could not take them (it is then marked not
   * durable, as for any failed write). The records are written as given: they have been validated by the importer, and are read back through the same migrations as any other.
   */
  applyWrites(writes: readonly { readonly store: "assessments" | "drafts"; readonly key: string; readonly value: unknown }[]): Promise<boolean>;
  /** Deletes IndexedDB, localStorage and Cache Storage. Resolves with what was cleared; the caller reloads. */
  eraseAll(): Promise<EraseReport>;
}

const CURRENT = "current";

export function createPersistence(env: Environment): Persistence {
  const kv: KV = createKV(env.localStorage);
  let status: StorageStatus = "persistent";
  const listeners = new Set<(s: StorageStatus) => void>();
  const setStatus = (s: StorageStatus): void => { if (s !== status) { status = s; for (const l of listeners) l(s); } };

  let db: Promise<Db> | null = null;
  const open = (): Promise<Db> => {
    db ??= (env.indexedDB ? openIndexedDb(env.indexedDB) : Promise.reject(new Error("IndexedDB is not available"))).catch(() => {
      setStatus("memory");
      return createMemoryDb();                       // keep working for this session
    });
    return db;
  };
  /** Run a database operation; a failure marks storage as not durable and the operation's result is the fallback. */
  const guarded = async <T>(op: (d: Db) => Promise<T>, fallback: T): Promise<T> => {
    try { return await op(await open()); } catch { setStatus("memory"); return fallback; }
  };

  // IndexedDB is probed up front so the chip is right from the first render; localStorage failing alone loses only preferences.
  void open();

  return {
    get status() { return status; },
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
    loadPrefs: () => parsePrefs(kv.get(PREFS_KEY)),
    savePrefs: (p) => { kv.set(PREFS_KEY, serializePrefs(p)); },
    async loadDraft() {
      const raw = await guarded((d) => d.get<unknown>("drafts", CURRENT), undefined);
      return parseDraft(migrate(raw, DRAFT_VERSION, DRAFT_MIGRATIONS));
    },
    saveDraft: (draft) => guarded((d) => d.put("drafts", CURRENT, wrap(DRAFT_VERSION, toStored(draft))), undefined),
    clearDraft: () => guarded((d) => d.delete("drafts", CURRENT), undefined),
    putAssessment: (a) => guarded((d) => d.put("assessments", a.id, wrap(ASSESSMENT_VERSION, a)), undefined),
    async getAssessment(id) {
      const raw = await guarded((d) => d.get<unknown>("assessments", id), undefined);
      return (migrate(raw, ASSESSMENT_VERSION, ASSESSMENT_MIGRATIONS) as SavedAssessment | null) ?? null;
    },
    async listAssessments() {
      const all = await guarded((d) => d.getAll<unknown>("assessments"), []);
      return all.map((raw) => migrate(raw, ASSESSMENT_VERSION, ASSESSMENT_MIGRATIONS) as SavedAssessment | null).filter((a): a is SavedAssessment => a !== null).sort((x, y) => y.createdAt - x.createdAt);
    },
    deleteAssessment: (id) => guarded((d) => d.delete("assessments", id), undefined),
    async applyWrites(writes) {
      try { await (await open()).batch(writes.map((w) => ({ store: w.store, key: w.key, value: w.value }))); return true; } catch { setStatus("memory"); return false; }
    },
    async eraseAll() {
      let indexedDb = true;
      let cacheStorage = true;
      try { (await open()).close(); } catch { /* nothing open */ }
      db = null;
      if (env.indexedDB) { try { await deleteIndexedDb(env.indexedDB); } catch { indexedDb = false; } }
      const ls = kv.clear();
      if (env.caches) {
        try { await Promise.all((await env.caches.keys()).map((k) => env.caches!.delete(k))); } catch { cacheStorage = false; }
      }
      return { indexedDb, localStorage: ls, cacheStorage };
    },
  };
}
