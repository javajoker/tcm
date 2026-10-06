// The ONE module that touches browser storage (docs/privacy.md §6 rule 4; enforced by an ESLint rule). Every call is wrapped: storage that is missing,
// blocked or full degrades to memory and flips `status` to "memory", which the UI shows as a "Not saved" chip. Nothing here ever throws to a caller.
import type { Environment } from "./browser.ts";
import { createKV, type KV } from "./kv.ts";
import { ConflictError, createMemoryDb, deleteIndexedDb, LOCK_KEY, openIndexedDb, type BatchOptions, type BatchWrite, type Db } from "./db.ts";
import { parseDraft, toStored } from "./draft.ts";
import { allowedAt, createLock, failed, forgiven, isSealed, openLock, openRecord, parseLockRecord, rewrapLock, sealRecord, type DataKey, type LockRecord, type SealedStore } from "./lock.ts";
import { KDF_ITERATIONS } from "./crypto.ts";
import { ASSESSMENT_MIGRATIONS, ASSESSMENT_VERSION, DRAFT_MIGRATIONS, DRAFT_VERSION, migrate, wrap } from "./migrations.ts";
import { parsePrefs, PREFS_KEY, serializePrefs } from "./prefs.ts";
import type { Draft, Prefs, SavedAssessment, StorageStatus, SyncRecord } from "./types.ts";

export { browserEnvironment, type Environment } from "./browser.ts";

export interface EraseReport { readonly indexedDb: boolean; readonly localStorage: boolean; readonly cacheStorage: boolean }

/** `none`: there is no lock. `locked`: there is one and the key is not in memory — nothing of the history is readable or writable. `unlocked`: the key is in memory. */
export type LockPhase = "none" | "locked" | "unlocked";
export interface LockStatus {
  readonly phase: LockPhase;
  /** The moment the next attempt to unlock is allowed (the throttle after five wrong passphrases), or `null` when it is allowed now. */
  readonly allowedAt: number | null;
  readonly failures: number;
  /** A lock record is there but cannot be read: nothing can open it, and the only way forward is to erase. */
  readonly broken: boolean;
}
export type UnlockResult = { readonly ok: true } | { readonly ok: false; readonly reason: "wrong" | "wait" | "broken" | "unavailable"; readonly allowedAt: number | null; readonly failures: number };
/** `wrong`: not the current passphrase. `wait`: too many wrong ones just now. `failed`: nothing was changed (storage refused, or the stored records changed meanwhile and could not be taken in). */
export type LockOutcome = "ok" | "wrong" | "wait" | "failed";

/** The local data lock (docs/post-mvp/design/backup-and-data-lock.md §5): encryption of the stored history under a key a passphrase unlocks. All of it lives in this module, as a codec the persistence functions pass through. */
export interface LockApi {
  /**
   * A synchronous hint that there is a lock, so that the first render of a locked device can wait for the lock record instead of flashing the app: a marker in `localStorage`, kept in step with the real
   * record (`status()` repairs it). It holds nothing but its own existence.
   */
  hint(): boolean;
  status(): Promise<LockStatus>;
  unlock(passphrase: string): Promise<UnlockResult>;
  /** Drops the key from memory at once: from here on nothing is readable or writable. Callers save what is pending first. */
  lockNow(): void;
  /** Turns the lock on: every stored record is encrypted and the lock record written in ONE transaction — all of it or none. */
  enable(passphrase: string): Promise<"ok" | "failed">;
  /** Turns it off: every record decrypted and the lock record deleted in ONE transaction. Needs the passphrase. */
  disable(passphrase: string): Promise<LockOutcome>;
  /** The same data key under a new passphrase: one small write. */
  change(current: string, next: string): Promise<LockOutcome>;
  /** Called when another tab turned the lock on, off or changed it (or erased everything): this tab's idea of the lock is no longer right. */
  onChanged(listener: () => void): () => void;
}

export interface Persistence {
  readonly status: StorageStatus;
  readonly lock: LockApi;
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
  /** The file the person chose to keep an encrypted backup in (PM-32). `save` is `false` where the browser cannot keep it. Never the passphrase. */
  readonly syncFile: { load(): Promise<SyncRecord | null>; save(record: SyncRecord): Promise<boolean>; clear(): Promise<void> };
  /** Called after a saved result was written, changed, deleted or imported: what the file sync watches. */
  onAssessmentsChanged(listener: () => void): () => void;
  /** Deletes IndexedDB, localStorage and Cache Storage. Resolves with what was cleared; the caller reloads. */
  eraseAll(): Promise<EraseReport>;
}

const CURRENT = "current";
/** The key of the file-sync record in the `meta` store (PM-32). */
const SYNC_KEY = "sync";

export interface PersistenceOptions {
  readonly now?: () => number;
  /** The PBKDF2 iteration count of a new lock (default: the current minimum; tests use the smallest a reader accepts). */
  readonly iterations?: number;
}

export function createPersistence(env: Environment, options: PersistenceOptions = {}): Persistence {
  const clock = options.now ?? ((): number => Date.now());
  const iterations = options.iterations ?? KDF_ITERATIONS;
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

  // ── the lock ──────────────────────────────────────────────────────────────
  // `record` is what `meta/lock` holds; `dek` is the data key, in memory only. There is no lock when `record` is null; there is a lock the app cannot open when `broken` is set.
  const lockState: { loaded: boolean; record: LockRecord | null; broken: boolean; dek: DataKey | null } = { loaded: false, record: null, broken: false, dek: null };
  let loading: Promise<void> | null = null;
  const forget = (): void => { lockState.loaded = false; lockState.record = null; lockState.broken = false; lockState.dek = null; loading = null; };
  /** Reads the lock record once (and again after something changed it). Until it has been read nothing is written: a lock may be there. */
  const ready = (): Promise<void> => {
    loading ??= guarded(async (d) => {
      const raw = await d.get<unknown>("meta", LOCK_KEY);
      const record = raw === undefined ? null : parseLockRecord(raw);
      lockState.record = record;
      lockState.broken = raw !== undefined && record === null;
    }, undefined).then(() => { lockState.loaded = true; });
    return loading;
  };
  const HINT_KEY = "tcm.lockHint";
  const setHint = (on: boolean): void => { if (on) kv.set(HINT_KEY, "1"); else kv.remove(HINT_KEY); };
  const phase = (): LockPhase => (lockState.record === null && !lockState.broken ? "none" : lockState.dek !== null ? "unlocked" : "locked");
  /** Records may be read and written only with no lock, or with the key in memory. */
  const usable = (): boolean => phase() !== "locked";
  /** The key id the writer believes is in force: the batch is refused if the stored lock is another one (a tab that did not hear of a change cannot write around it). */
  const believed = (): string | null => lockState.dek?.keyId ?? null;

  const changed = new Set<() => void>();
  const assessmentListeners = new Set<() => void>();
  const assessmentsChanged = (): void => { for (const l of [...assessmentListeners]) { try { l(); } catch { /* a listener must not break a save */ } } };
  let channel: BroadcastChannel | null | undefined;
  const talk = (): BroadcastChannel | null => {
    if (channel === undefined) {
      try {
        channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("tcm-lock");
        channel?.addEventListener("message", () => { forget(); for (const l of changed) l(); });
        (channel as unknown as { unref?: () => void } | null)?.unref?.();
      } catch { channel = null; }
    }
    return channel;
  };
  const announce = (): void => { try { talk()?.postMessage("changed"); } catch { /* the other tabs find out at their next write */ } };
  /** A write found the lock to be another one than this tab believed: forget what it knew, and tell whoever listens. */
  const stale = (): void => { forget(); for (const l of changed) l(); };

  /** One batch under the lock guard. `false` when it was refused because the lock changed (this tab has been told). */
  const commit = async (d: Db, writes: readonly BatchWrite[], batchOptions: BatchOptions = {}): Promise<boolean> => {
    try { await d.batch(writes, { lock: believed(), ...batchOptions }); return true; } catch (e) { if (e instanceof ConflictError && e.kind === "lock") { stale(); return false; } throw e; }
  };

  /** The stored form of a record: sealed under the data key while there is a lock. */
  const seal = (store: SealedStore, key: string, value: unknown): Promise<unknown> => (lockState.dek === null ? Promise.resolve(value) : sealRecord(lockState.dek, store, key, value));
  /** What a stored value is, in the clear: a sealed record is opened (and is absent if it does not open); a record in the clear is as it is — with a lock, only while the key is in memory. */
  const unseal = async (store: SealedStore, key: string, raw: unknown): Promise<unknown> => {
    if (raw === undefined || !usable()) return undefined;
    if (isSealed(raw)) return lockState.dek === null ? undefined : openRecord(lockState.dek, store, key, raw);
    return raw;
  };
  /**
   * A batch of record writes, made under the lock as this tab knows it. If another tab changed the lock meanwhile the batch is refused and this tab forgets what it knew; it then tries once more under the lock
   * as it is now — which writes only when there is no lock (or the key is in memory), never in the clear around one.
   */
  const underLock = (build: () => Promise<BatchWrite[]>): Promise<boolean> =>
    guarded(async (d) => {
      for (let attempt = 0; attempt < 2; attempt++) { await ready(); if (!usable()) return false; if (await commit(d, await build())) return true; }
      return false;
    }, false);
  const writeRecords = (writes: readonly { readonly store: SealedStore; readonly key: string; readonly value: unknown }[]): Promise<boolean> =>
    underLock(() => Promise.all(writes.map(async (w) => ({ store: w.store, key: w.key, value: await seal(w.store, w.key, w.value) }))));
  const deleteRecord = (store: SealedStore, key: string): Promise<boolean> => underLock(async () => [{ store, key, delete: true }]);

  const failure = async (record: LockRecord): Promise<LockRecord> => {
    const next = failed(record, clock());
    if (await guarded((d) => commit(d, [{ store: "meta", key: LOCK_KEY, value: next }], { lock: record.keyId }), false)) lockState.record = next;
    return lockState.record ?? record;
  };

  const lock: LockApi = {
    hint: () => kv.get(HINT_KEY) === "1",
    async status() {
      await ready();
      const r = lockState.record;
      setHint(r !== null || lockState.broken);
      return { phase: phase(), allowedAt: r === null ? null : allowedAt(r, clock()), failures: r?.failures ?? 0, broken: lockState.broken };
    },
    async unlock(passphrase) {
      await ready();
      const r = lockState.record;
      if (lockState.broken) return { ok: false, reason: "broken", allowedAt: null, failures: 0 };
      if (r === null) return { ok: false, reason: "unavailable", allowedAt: null, failures: 0 };
      if (lockState.dek !== null) return { ok: true };
      const wait = allowedAt(r, clock());
      if (wait !== null) return { ok: false, reason: "wait", allowedAt: wait, failures: r.failures };
      const dek = await openLock(r, passphrase);
      if (dek === null) { const next = await failure(r); return { ok: false, reason: "wrong", allowedAt: allowedAt(next, clock()), failures: next.failures }; }
      const cleared = forgiven(r);
      if (cleared !== r && await guarded((d) => commit(d, [{ store: "meta", key: LOCK_KEY, value: cleared }], { lock: r.keyId }), false)) lockState.record = cleared;
      lockState.dek = dek;
      return { ok: true };
    },
    lockNow() { lockState.dek = null; },
    async enable(passphrase) {
      await ready();
      if (status === "memory" || lockState.record !== null || lockState.broken) return "failed";
      let d: Db;
      try { d = await open(); } catch { return "failed"; }
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const snapshot = { drafts: await d.entries<unknown>("drafts"), assessments: await d.entries<unknown>("assessments") };
          const { record, dek } = await createLock(passphrase, iterations);
          const writes: BatchWrite[] = [];
          for (const store of ["drafts", "assessments"] as const) for (const [key, value] of snapshot[store]) writes.push({ store, key, value: isSealed(value) ? value : await sealRecord(dek, store, key, value) });
          writes.push({ store: "meta", key: LOCK_KEY, value: record });
          await d.batch(writes, { lock: null, expect: snapshot });
          lockState.record = record; lockState.dek = dek; lockState.broken = false; lockState.loaded = true;
          setHint(true);
          announce();
          return "ok";
        } catch (e) {
          if (e instanceof ConflictError && e.kind === "changed") continue;       // a record was saved meanwhile: take it in and try again
          if (e instanceof ConflictError) stale();
          return "failed";
        }
      }
      return "failed";
    },
    async disable(passphrase) {
      await ready();
      const r = lockState.record;
      if (r === null) return "failed";
      if (allowedAt(r, clock()) !== null) return "wait";
      const dek = await openLock(r, passphrase);
      if (dek === null) { await failure(r); return "wrong"; }
      let d: Db;
      try { d = await open(); } catch { return "failed"; }
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const snapshot = { drafts: await d.entries<unknown>("drafts"), assessments: await d.entries<unknown>("assessments") };
          const writes: BatchWrite[] = [];
          for (const store of ["drafts", "assessments"] as const) for (const [key, value] of snapshot[store]) {
            if (!isSealed(value)) continue;
            const plain = await openRecord(dek, store, key, value);
            if (plain === undefined) return "failed";                             // a record that does not open is not thrown away: nothing is changed
            writes.push({ store, key, value: plain });
          }
          writes.push({ store: "meta", key: LOCK_KEY, delete: true });
          await d.batch(writes, { lock: r.keyId, expect: snapshot });
          lockState.record = null; lockState.dek = null; lockState.broken = false;
          setHint(false);
          announce();
          return "ok";
        } catch (e) {
          if (e instanceof ConflictError && e.kind === "changed") continue;
          if (e instanceof ConflictError) stale();
          return "failed";
        }
      }
      return "failed";
    },
    async change(current, next) {
      await ready();
      const r = lockState.record;
      if (r === null) return "failed";
      if (allowedAt(r, clock()) !== null) return "wait";
      const wrapped = await rewrapLock(r, current, next, iterations);
      if (wrapped === null) { await failure(r); return "wrong"; }
      try {
        const ok = await guarded((d) => commit(d, [{ store: "meta", key: LOCK_KEY, value: wrapped }], { lock: r.keyId }), false);
        if (!ok) return "failed";
        lockState.record = wrapped;
        announce();
        return "ok";
      } catch { return "failed"; }
    },
    onChanged(listener) { talk(); changed.add(listener); return () => { changed.delete(listener); }; },
  };

  return {
    get status() { return status; },
    lock,
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
    loadPrefs: () => parsePrefs(kv.get(PREFS_KEY)),
    savePrefs: (p) => { kv.set(PREFS_KEY, serializePrefs(p)); },
    async loadDraft() {
      await ready();
      const raw = await guarded((d) => d.get<unknown>("drafts", CURRENT), undefined);
      return parseDraft(migrate(await unseal("drafts", CURRENT, raw), DRAFT_VERSION, DRAFT_MIGRATIONS));
    },
    async saveDraft(draft) { await writeRecords([{ store: "drafts", key: CURRENT, value: wrap(DRAFT_VERSION, toStored(draft)) }]); },
    async clearDraft() { await deleteRecord("drafts", CURRENT); },
    async putAssessment(a) { await writeRecords([{ store: "assessments", key: a.id, value: wrap(ASSESSMENT_VERSION, a) }]); assessmentsChanged(); },
    async getAssessment(id) {
      await ready();
      const raw = await guarded((d) => d.get<unknown>("assessments", id), undefined);
      return (migrate(await unseal("assessments", id, raw), ASSESSMENT_VERSION, ASSESSMENT_MIGRATIONS) as SavedAssessment | null) ?? null;
    },
    async listAssessments() {
      await ready();
      const all = await guarded((d) => d.entries<unknown>("assessments"), []);
      const opened = await Promise.all(all.map(async ([key, raw]) => migrate(await unseal("assessments", key, raw), ASSESSMENT_VERSION, ASSESSMENT_MIGRATIONS) as SavedAssessment | null));
      return opened.filter((a): a is SavedAssessment => a !== null).sort((x, y) => y.createdAt - x.createdAt);
    },
    async deleteAssessment(id) { await deleteRecord("assessments", id); assessmentsChanged(); },
    async applyWrites(writes) {
      try {
        const ok = await underLock(() => Promise.all(writes.map(async (w) => ({ store: w.store, key: w.key, value: await seal(w.store, w.key, w.value) }))));
        if (ok && writes.some((w) => w.store === "assessments")) assessmentsChanged();
        return ok;
      } catch { setStatus("memory"); return false; }
    },
    syncFile: {
      async load() {
        const raw = await guarded((d) => d.get<unknown>("meta", SYNC_KEY), undefined);
        const r = raw as Partial<SyncRecord> | undefined;
        return r !== undefined && r !== null && r.v === 1 && r.handle !== undefined && typeof r.name === "string" && (r.seen === null || typeof r.seen === "string") && (r.writtenAt === null || typeof r.writtenAt === "number")
          ? { v: 1, handle: r.handle, name: r.name, seen: r.seen ?? null, writtenAt: r.writtenAt ?? null } : null;
      },
      // a record that cannot be kept (the browser cannot store the handle) is not a reason to call the whole storage not durable: the sync simply does not outlive the session
      async save(record) { try { await (await open()).put("meta", SYNC_KEY, record); return true; } catch { return false; } },
      async clear() { try { await (await open()).delete("meta", SYNC_KEY); } catch { /* nothing to forget */ } },
    },
    onAssessmentsChanged(l) { assessmentListeners.add(l); return () => { assessmentListeners.delete(l); }; },
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
      forget();
      announce();
      return { indexedDb, localStorage: ls, cacheStorage };
    },
  };
}
