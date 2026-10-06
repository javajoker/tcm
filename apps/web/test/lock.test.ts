// @vitest-environment node
// The local data lock (docs/post-mvp/design/backup-and-data-lock.md §5, §7; task PM-20), below the screens: the cryptography of the lock record and of a sealed record, the throttle, and the persistence layer as a
// codec — turn on, open locked, unlock, change the passphrase, turn off — with the raw store read from outside, and a database that fails at every step and a second tab that does not know what the first one did.
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { IDBObjectStore } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { LIMITS } from "../src/storage/backup/limits.ts";
import { toBase64 } from "../src/storage/crypto.ts";
import { ConflictError, LOCK_KEY, openIndexedDb, STORES, type Db } from "../src/storage/db.ts";
import { allowedAt, createLock, failed, FREE_ATTEMPTS, isSealed, MAX_WAIT_MS, openLock, openRecord, parseLockRecord, rewrapLock, sealRecord, waitAfter, type LockRecord } from "../src/storage/lock.ts";
import { createPersistence, type Environment, type Persistence } from "../src/storage/persistence.ts";
import type { Draft, SavedAssessment } from "../src/storage/types.ts";
import { newDraft } from "../src/storage/draft.ts";
import { fakeEnvironment } from "./helpers.tsx";
import { interview } from "./interview.ts";

afterEach(() => { vi.restoreAllMocks(); });

const ITER = LIMITS.minIterations;                 // the smallest count a reader accepts: the tests make many locks
const PASS = "correct horse battery staple";
const OTHER = "another long passphrase 42";
const dev = indexKnowledgeBase(rawChunksFromDisk("dev"));

// ── the records ─────────────────────────────────────────────────────────────

describe("the lock record", () => {
  it("makes a data key that cannot be exported, and the passphrase opens it again", async () => {
    const { record, dek } = await createLock(PASS, ITER);
    expect(dek.key.extractable).toBe(false);
    expect(dek.key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    await expect(globalThis.crypto.subtle.exportKey("raw", dek.key)).rejects.toThrow();
    expect(parseLockRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
    expect(record.keyId).toBe(dek.keyId);
    expect(record.failures).toBe(0);
    const again = await openLock(record, PASS);
    expect(again?.keyId).toBe(record.keyId);
    expect(again?.key.extractable).toBe(false);
    // the same data key: what one seals the other opens
    const sealed = await sealRecord(dek, "assessments", "r1", { v: 1, data: { x: 1 } });
    expect(await openRecord(again!, "assessments", "r1", sealed)).toEqual({ v: 1, data: { x: 1 } });
  });

  it("a wrong passphrase, and any change to the record, give one answer: not open", async () => {
    const { record } = await createLock(PASS, ITER);
    expect(await openLock(record, "wrong passphrase!")).toBeNull();
    expect(await openLock(record, "")).toBeNull();
    const flip = (b64: string): string => { const raw = atob(b64); return btoa(String.fromCharCode(raw.charCodeAt(0) ^ 1) + raw.slice(1)); };
    for (const damaged of [
      { ...record, wrapped: { ...record.wrapped, ct: flip(record.wrapped.ct) } },
      { ...record, wrapped: { ...record.wrapped, iv: flip(record.wrapped.iv) } },
      { ...record, salt: flip(record.salt) },
      { ...record, iterations: record.iterations + 1 },
      { ...record, keyId: "another-key" },
    ] satisfies LockRecord[]) expect(await openLock(damaged, PASS)).toBeNull();
    // the counters are not authenticated: they are for the person at the keyboard
    expect(await openLock({ ...record, failures: 7, lastFailureAt: 5 }, PASS)).not.toBeNull();
  });

  it("the passphrase is normalised (NFKC): the same characters typed another way are the same passphrase", async () => {
    const { record } = await createLock("ｃｏｒｒｅｃｔ ｈｏｒｓｅ ｂａｔｔｅｒｙ", ITER);       // full-width
    expect(await openLock(record, "correct horse battery")).not.toBeNull();
  });

  it("is read back only if every field is right, with the iteration count bounded on both sides; unknown fields are ignored", async () => {
    const { record } = await createLock(PASS, ITER);
    const bad = (patch: object): LockRecord | null => parseLockRecord({ ...record, ...patch });
    expect(bad({})).toEqual(record);
    expect(parseLockRecord({ ...record, extra: "ignored" })).toEqual(record);
    for (const patch of [
      { v: 2 }, { kdf: "scrypt" }, { keyId: "" }, { keyId: "x".repeat(65) }, { keyId: 5 },
      { iterations: LIMITS.minIterations - 1 }, { iterations: LIMITS.maxIterations + 1 }, { iterations: 1.5 }, { iterations: "600000" },
      { salt: "AAAA" }, { salt: "not base64!" }, { salt: 3 },
      { wrapped: { iv: record.wrapped.iv } }, { wrapped: { ...record.wrapped, iv: "AAAA" } }, { wrapped: { ...record.wrapped, ct: "AAAA" } }, { wrapped: null },
      { failures: -1 }, { failures: 1.5 }, { failures: 2_000_000 }, { lastFailureAt: "yesterday" }, { lastFailureAt: -5 },
    ]) expect(bad(patch), JSON.stringify(patch).slice(0, 60)).toBeNull();
    for (const raw of [null, undefined, "lock", 5, [], {}]) expect(parseLockRecord(raw)).toBeNull();
  });

  it("changing the passphrase re-wraps the same data key under a new salt and IV, and starts the counters again", async () => {
    const { record, dek } = await createLock(PASS, ITER);
    const worn = failed(failed(record, 1_000), 2_000);
    const next = await rewrapLock(worn, PASS, OTHER, ITER);
    expect(next).not.toBeNull();
    expect(next!.keyId).toBe(record.keyId);
    expect(next!.salt).not.toBe(record.salt);
    expect(next!.wrapped.iv).not.toBe(record.wrapped.iv);
    expect(next!.wrapped.ct).not.toBe(record.wrapped.ct);
    expect([next!.failures, next!.lastFailureAt]).toEqual([0, null]);
    expect(await openLock(next!, PASS)).toBeNull();
    const reopened = await openLock(next!, OTHER);
    const sealed = await sealRecord(dek, "drafts", "current", { v: 1, data: "kept" });
    expect(await openRecord(reopened!, "drafts", "current", sealed)).toEqual({ v: 1, data: "kept" });     // the records did not need touching
    expect(await rewrapLock(record, "wrong passphrase!", OTHER, ITER)).toBeNull();
  });
});

describe("a sealed record", () => {
  it("keeps its version and holds nothing in the clear; every write has a fresh IV", async () => {
    const { dek } = await createLock(PASS, ITER);
    const value = { v: 1, data: { note: "SECRET-NOTE", findings: { S_FATIGUE: { state: "present" } } } };
    const a = await sealRecord(dek, "assessments", "r1", value), b = await sealRecord(dek, "assessments", "r1", value);
    expect(isSealed(a)).toBe(true);
    expect(a.v).toBe(1);
    expect(JSON.stringify(a)).not.toMatch(/SECRET|S_FATIGUE|note|findings/);
    expect(a.enc.iv).not.toBe(b.enc.iv);
    expect(a.enc.ct).not.toBe(b.enc.ct);
    expect(await openRecord(dek, "assessments", "r1", a)).toEqual(value);
  });

  it("is bound to its place: copied to another id, store or version it does not open", async () => {
    const { dek } = await createLock(PASS, ITER);
    const sealed = await sealRecord(dek, "assessments", "r1", { v: 1, data: "x" });
    expect(await openRecord(dek, "assessments", "r2", sealed)).toBeUndefined();
    expect(await openRecord(dek, "drafts", "r1", sealed)).toBeUndefined();
    expect(await openRecord(dek, "assessments", "r1", { ...sealed, v: 2 })).toBeUndefined();
    expect(await openRecord(dek, "assessments", "r1", sealed)).toEqual({ v: 1, data: "x" });
  });

  it("does not open under another key or with a changed byte", async () => {
    const { dek } = await createLock(PASS, ITER);
    const { dek: other } = await createLock(PASS, ITER);
    const sealed = await sealRecord(dek, "assessments", "r1", { v: 1, data: "x" });
    expect(await openRecord(other, "assessments", "r1", sealed)).toBeUndefined();
    const raw = atob(sealed.enc.ct);
    const flipped = btoa(raw.slice(0, -1) + String.fromCharCode(raw.charCodeAt(raw.length - 1) ^ 1));
    expect(await openRecord(dek, "assessments", "r1", { ...sealed, enc: { ...sealed.enc, ct: flipped } })).toBeUndefined();
    expect(await openRecord(dek, "assessments", "r1", { ...sealed, enc: { iv: "short", ct: sealed.enc.ct } })).toBeUndefined();
    expect(await openRecord(dek, "assessments", "r1", { ...sealed, enc: { iv: sealed.enc.iv, ct: "not base64!" } })).toBeUndefined();
  });

  it("a damaged record that is not an envelope is sealed whole and comes back whole — nothing stays in the clear", async () => {
    const { dek } = await createLock(PASS, ITER);
    for (const value of ["plain string with SECRET", 42, null, { no: "envelope", note: "SECRET" }, [1, 2]]) {
      const sealed = await sealRecord(dek, "assessments", "r1", value);
      expect(JSON.stringify(sealed)).not.toContain("SECRET");
      expect(sealed.raw).toBe(true);
      expect(await openRecord(dek, "assessments", "r1", sealed)).toEqual(value);
    }
  });
});

describe("the throttle", () => {
  it("nothing for the first five wrong passphrases, then 2, 4, 8 … seconds, up to five minutes", () => {
    expect(FREE_ATTEMPTS).toBe(5);
    expect([0, 1, 2, 3, 4].map(waitAfter)).toEqual([0, 0, 0, 0, 0]);
    expect([5, 6, 7, 8, 9, 10, 11, 12].map(waitAfter)).toEqual([2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000]);
    expect(waitAfter(13)).toBe(MAX_WAIT_MS);
    expect(waitAfter(50)).toBe(MAX_WAIT_MS);
    expect(MAX_WAIT_MS).toBe(300_000);
  });

  it("is a moment after the last failure, and passes", async () => {
    const { record } = await createLock(PASS, ITER);
    let r: LockRecord = record;
    for (let i = 0; i < 4; i++) r = failed(r, 10_000);
    expect(allowedAt(r, 10_000)).toBeNull();                 // four wrong: still free
    r = failed(r, 10_000);
    expect(allowedAt(r, 10_000)).toBe(12_000);              // five: two seconds
    expect(allowedAt(r, 11_999)).toBe(12_000);
    expect(allowedAt(r, 12_000)).toBeNull();
    r = failed(r, 20_000);
    expect(allowedAt(r, 20_000)).toBe(24_000);              // six: four seconds
    expect(allowedAt({ ...r, lastFailureAt: null }, 0)).toBeNull();
  });
});

// ── the persistence layer as a codec ────────────────────────────────────────

const SECRET_NOTE = "SECRET-NOTE-12345";
const SECRET_ALLERGY = "SECRET-ALLERGY-花生XYZ";

function saved(id: string, at: number, extra: Partial<SavedAssessment> = {}): SavedAssessment {
  const d = interview(dev, "SP1");
  const s = toSaved(d, engine.assess(dev, assessInputOf(d, at)!), { id, lang: "en" });
  return { ...s, createdAt: at, ...extra };
}
const draftWithSecrets = (): Draft => ({ ...newDraft("d1", 5_000), subject: { ageYears: 41, sex: "female", allergies: [SECRET_ALLERGY] }, profile: { medicationText: ["SECRET-MEDICINE"] }, rememberBirth: true, birth: { year: 1987, month: 6, day: 5, hour: 3, minute: 21, sex: "female", timeZone: "Asia/Shanghai", longitude: 121.4 } });
const records = (): SavedAssessment[] => [saved("ra0000000000000a", 1_000_000, { userNote: SECRET_NOTE }), saved("rb0000000000000b", 2_000_000, { input: { ...saved("x", 1).input, subject: { ...saved("x", 1).input.subject, allergies: [SECRET_ALLERGY] } } }), saved("rc0000000000000c", 3_000_000)];
const MARKERS = [SECRET_NOTE, SECRET_ALLERGY, "SECRET-MEDICINE", "S_FATIGUE", "findings", "verdict", "ageYears", "allergies", "userNote", "Asia/Shanghai", "kbVersion", "recommendations"];       // long enough not to turn up by chance in base64

/** The whole database as text, read from outside the persistence layer. */
async function dump(env: Environment): Promise<{ text: string; entries: Record<string, [string, unknown][]> }> {
  const db = await openIndexedDb(env.indexedDB!);
  const entries: Record<string, [string, unknown][]> = {};
  for (const s of STORES) entries[s] = await db.entries(s);
  db.close();
  return { text: JSON.stringify(entries), entries };
}
async function rawDb(env: Environment): Promise<Db> { return openIndexedDb(env.indexedDB!); }

const fresh = (env: Environment, now?: () => number): Persistence => createPersistence(env, { iterations: ITER, ...(now ? { now } : {}) });
async function populated(): Promise<{ env: Environment; p: Persistence; items: SavedAssessment[] }> {
  const env = fakeEnvironment();
  const p = fresh(env);
  const items = records();
  for (const s of items) await p.putAssessment(s);
  await p.saveDraft(draftWithSecrets());
  return { env, p, items };
}
const sortedNew = (list: SavedAssessment[]): SavedAssessment[] => [...list].sort((a, b) => b.createdAt - a.createdAt);

describe("turning the lock on", () => {
  it("encrypts every stored record, keeps the version of each, and leaves nothing of the history in the raw store", async () => {
    const { env, p, items } = await populated();
    const before = await dump(env);
    for (const m of [SECRET_NOTE, SECRET_ALLERGY, "SECRET-MEDICINE", "S_FATIGUE", "ageYears"]) expect(before.text, m).toContain(m);     // the scan can see what it looks for
    expect(await p.lock.enable(PASS)).toBe("ok");
    const after = await dump(env);
    for (const m of MARKERS) expect(after.text, `the raw store still shows ${m}`).not.toContain(m);
    for (const [key, value] of [...after.entries["assessments"]!, ...after.entries["drafts"]!]) { expect(isSealed(value), key).toBe(true); expect((value as { v: number }).v).toBe(1); }
    expect(after.entries["assessments"]!.map(([k]) => k).sort()).toEqual(items.map((i) => i.id).sort());
    const lockRecord = after.entries["meta"]!.find(([k]) => k === LOCK_KEY)![1];
    expect(parseLockRecord(lockRecord)).not.toBeNull();
    expect(JSON.stringify(lockRecord)).not.toContain(PASS);
    expect((await p.lock.status()).phase).toBe("unlocked");
    // while the key is in memory the history reads as before, and a write is sealed
    expect(await p.listAssessments()).toEqual(sortedNew(items));
    expect((await p.loadDraft())?.subject.allergies).toEqual([SECRET_ALLERGY]);
    await p.putAssessment(saved("rd0000000000000d", 4_000_000, { userNote: "ANOTHER-SECRET" }));
    expect((await dump(env)).text).not.toContain("ANOTHER-SECRET");
    expect((await p.getAssessment("rd0000000000000d"))?.userNote).toBe("ANOTHER-SECRET");
  });

  it("is refused where there is no durable storage, and when there is a lock already", async () => {
    const memory = fresh(fakeEnvironment({ indexedDB: null }));
    expect(await memory.lock.enable(PASS)).toBe("failed");
    expect((await memory.lock.status()).phase).toBe("none");
    const { p } = await populated();
    expect(await p.lock.enable(PASS)).toBe("ok");
    expect(await p.lock.enable(OTHER)).toBe("failed");
  });

  it("works with nothing stored yet, and then protects the first thing saved", async () => {
    const env = fakeEnvironment();
    const p = fresh(env);
    expect(await p.lock.enable(PASS)).toBe("ok");
    expect(await p.listAssessments()).toEqual([]);
    await p.saveDraft(draftWithSecrets());
    expect((await dump(env)).text).not.toContain(SECRET_ALLERGY);
  });

  it("a record saved by another tab while the key is being made is taken in, never overwritten and never left in the clear", async () => {
    const { env, p } = await populated();
    const other = fresh(env);
    const subtle = globalThis.crypto.subtle;
    const real = subtle.deriveKey.bind(subtle);
    let first = true;
    vi.spyOn(subtle, "deriveKey").mockImplementation(async (...args: Parameters<SubtleCrypto["deriveKey"]>) => {
      if (first) { first = false; await other.putAssessment(saved("rl0000000000000l", 9_000_000, { userNote: "LATE-SECRET" })); }       // between the snapshot and the write
      return real(...args);
    });
    expect(await p.lock.enable(PASS)).toBe("ok");
    const after = await dump(env);
    expect(after.text).not.toContain("LATE-SECRET");
    expect(after.entries["assessments"]!.map(([k]) => k)).toContain("rl0000000000000l");
    expect((await p.getAssessment("rl0000000000000l"))?.userNote).toBe("LATE-SECRET");
  });
});

describe("a database that fails at every step", () => {
  /** Makes the n-th write (put or delete) of the next transactions throw, once. */
  function failAt(n: number): () => number {
    let calls = 0;
    const put = IDBObjectStore.prototype.put, del = IDBObjectStore.prototype.delete;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) { if (++calls === n) throw new DOMException("injected", "DataError"); return put.apply(this, args); });
    vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["delete"]>) { if (++calls === n) throw new DOMException("injected", "DataError"); return del.apply(this, args); });
    return () => calls;
  }

  it("turning on: whichever write fails, the store is as it was — plain, and without a lock", async () => {
    const { env, items } = await populated();
    const baseline = (await dump(env)).text;
    const writes = items.length + 1 + 1;                          // the records, the draft, the lock record
    for (let n = 1; n <= writes; n++) {
      vi.restoreAllMocks();
      const p = fresh(env);
      failAt(n);
      expect(await p.lock.enable(PASS), `write ${n}`).toBe("failed");
      vi.restoreAllMocks();
      expect((await dump(env)).text, `write ${n}`).toBe(baseline);
      expect((await fresh(env).lock.status()).phase).toBe("none");
    }
    const p = fresh(env);
    expect(await p.lock.enable(PASS)).toBe("ok");                // and then it works
    expect((await dump(env)).text).not.toContain(SECRET_NOTE);
  });

  it("turning off: whichever write fails, the store is as it was — encrypted, with its lock", async () => {
    const { env, p, items } = await populated();
    expect(await p.lock.enable(PASS)).toBe("ok");
    const baseline = (await dump(env)).text;
    const writes = items.length + 1 + 1;
    for (let n = 1; n <= writes; n++) {
      vi.restoreAllMocks();
      const q = fresh(env);
      failAt(n);
      expect(await q.lock.disable(PASS), `write ${n}`).toBe("failed");
      vi.restoreAllMocks();
      const now = await dump(env);
      expect(now.text, `write ${n}`).toBe(baseline);
      expect(now.text).not.toContain(SECRET_NOTE);
    }
    expect(await fresh(env).lock.disable(PASS)).toBe("ok");
    expect((await dump(env)).text).toContain(SECRET_NOTE);
  });

  it("changing the passphrase: the one write either happens or the old passphrase still opens everything", async () => {
    const { env, p, items } = await populated();
    expect(await p.lock.enable(PASS)).toBe("ok");
    const before = await dump(env);
    const q = fresh(env);
    failAt(1);
    expect(await q.lock.change(PASS, OTHER)).toBe("failed");
    vi.restoreAllMocks();
    expect((await dump(env)).text).toBe(before.text);
    const r = fresh(env);
    expect((await r.lock.unlock(PASS)).ok).toBe(true);
    expect(await r.listAssessments()).toEqual(sortedNew(items));
  });
});

describe("a locked store", () => {
  async function locked() {
    const { env, p, items } = await populated();
    expect(await p.lock.enable(PASS)).toBe("ok");
    const reloaded = fresh(env);                                   // a reload: the key is gone
    return { env, items, reloaded, before: (await dump(env)).text };
  }

  it("shows nothing of the history, writes nothing, and says it is locked", async () => {
    const { env, reloaded, before } = await locked();
    const status = await reloaded.lock.status();
    expect(status).toMatchObject({ phase: "locked", allowedAt: null, failures: 0, broken: false });
    expect(await reloaded.listAssessments()).toEqual([]);
    expect(await reloaded.getAssessment("ra0000000000000a")).toBeNull();
    expect(await reloaded.loadDraft()).toBeNull();
    await reloaded.putAssessment(saved("rz0000000000000z", 5_000_000, { userNote: "WRITTEN-WHILE-LOCKED" }));
    await reloaded.saveDraft(draftWithSecrets());
    await reloaded.deleteAssessment("ra0000000000000a");
    await reloaded.clearDraft();
    expect(await reloaded.applyWrites([{ store: "assessments", key: "rz", value: { v: 1, data: { note: "WRITTEN-WHILE-LOCKED" } } }])).toBe(false);
    const after = await dump(env);
    expect(after.text).toBe(before);                               // not a byte changed; nothing in the clear, nothing deleted
  });

  it("a wrong passphrase is counted and kept across reloads; the right one opens everything and clears the count", async () => {
    const { env, items, reloaded } = await locked();
    const r = await reloaded.lock.unlock("not the passphrase");
    expect(r).toMatchObject({ ok: false, reason: "wrong", failures: 1, allowedAt: null });
    expect((await fresh(env).lock.status()).failures).toBe(1);
    expect((await reloaded.lock.unlock(PASS)).ok).toBe(true);
    expect((await reloaded.lock.status())).toMatchObject({ phase: "unlocked", failures: 0 });
    expect((await fresh(env).lock.status()).failures).toBe(0);
    expect(await reloaded.listAssessments()).toEqual(sortedNew(items));
  });

  it("after five wrong passphrases each next try waits longer — and a try during the wait is not even looked at", async () => {
    const { env } = await locked();
    let now = 1_000_000;
    const p = fresh(env, () => now);
    for (let i = 1; i <= 5; i++) expect(await p.lock.unlock(`wrong ${i}`)).toMatchObject({ ok: false, reason: "wrong", failures: i });
    now += 500;
    expect(await p.lock.unlock(PASS)).toMatchObject({ ok: false, reason: "wait", allowedAt: 1_002_000 });      // the right one too: no oracle during the wait
    expect(await p.lock.status()).toMatchObject({ phase: "locked", allowedAt: 1_002_000, failures: 5 });
    now = 1_002_000;
    expect(await p.lock.unlock("wrong 6")).toMatchObject({ ok: false, reason: "wrong", failures: 6, allowedAt: 1_006_000 });
    expect(await fresh(env, () => now).lock.status()).toMatchObject({ allowedAt: 1_006_000, failures: 6 });    // a reload does not reset it
    now = 1_006_000;
    expect((await p.lock.unlock(PASS)).ok).toBe(true);
    expect((await p.lock.status()).failures).toBe(0);
  });

  it("a ciphertext moved to another id does not open as that record", async () => {
    const { env, reloaded } = await locked();
    expect((await reloaded.lock.unlock(PASS)).ok).toBe(true);
    const db = await rawDb(env);
    const original = (await db.entries<unknown>("assessments")).find(([k]) => k === "ra0000000000000a")![1];
    await db.put("assessments", "rq0000000000000q", original);
    db.close();
    expect(await reloaded.getAssessment("rq0000000000000q")).toBeNull();
    expect((await reloaded.getAssessment("ra0000000000000a"))?.userNote).toBe(SECRET_NOTE);
  });

  it("a lock record that cannot be read is a lock nothing can open: erase is the way forward, and it works", async () => {
    const { env } = await populated();
    const db = await rawDb(env);
    await db.put("meta", LOCK_KEY, { v: 1, garbage: true });
    db.close();
    const p = fresh(env);
    expect(await p.lock.status()).toMatchObject({ phase: "locked", broken: true });
    expect(await p.lock.unlock(PASS)).toMatchObject({ ok: false, reason: "broken" });
    expect(await p.listAssessments()).toEqual([]);
    await p.eraseAll();
    const after = fresh(env);
    expect((await after.lock.status()).phase).toBe("none");
    expect(await after.listAssessments()).toEqual([]);
  });

  it("Erase everything works while locked, and takes the lock with it", async () => {
    const { env, reloaded } = await locked();
    const report = await reloaded.eraseAll();
    expect(report.indexedDb).toBe(true);
    const after = fresh(env);
    expect((await after.lock.status()).phase).toBe("none");
    expect((await dump(env)).entries["meta"]).toEqual([]);
    expect(await after.listAssessments()).toEqual([]);
  });
});

describe("changing the passphrase and turning the lock off", () => {
  it("changing it is one small write: the records are not touched, the new passphrase opens them, the old one does not", async () => {
    const { env, p, items } = await populated();
    expect(await p.lock.enable(PASS)).toBe("ok");
    const before = (await dump(env)).entries;
    expect(await p.lock.change("not the passphrase", OTHER)).toBe("wrong");
    expect((await fresh(env).lock.status()).failures).toBe(1);
    expect(await p.lock.change(PASS, OTHER)).toBe("ok");
    const after = (await dump(env)).entries;
    expect(after["assessments"]).toEqual(before["assessments"]);
    expect(after["drafts"]).toEqual(before["drafts"]);
    expect(after["meta"]).not.toEqual(before["meta"]);
    const q = fresh(env);
    expect((await q.lock.unlock(PASS)).ok).toBe(false);
    expect((await q.lock.unlock(OTHER)).ok).toBe(true);
    expect(await q.listAssessments()).toEqual(sortedNew(items));
    expect(await q.lock.status()).toMatchObject({ failures: 0 });
  });

  it("turning it off needs the passphrase and makes every record plain again", async () => {
    const { env, p, items } = await populated();
    expect(await p.lock.enable(PASS)).toBe("ok");
    expect(await p.lock.disable("nope nope nope")).toBe("wrong");
    expect((await dump(env)).text).not.toContain(SECRET_NOTE);
    expect(await p.lock.disable(PASS)).toBe("ok");
    const after = await dump(env);
    expect(after.entries["meta"]).toEqual([]);
    expect(after.text).toContain(SECRET_NOTE);
    expect((await p.lock.status()).phase).toBe("none");
    const q = fresh(env);
    expect((await q.lock.status()).phase).toBe("none");
    expect(await q.listAssessments()).toEqual(sortedNew(items));
  });

  it("turning it off does not throw away a record that does not open: nothing is changed", async () => {
    const { env, p } = await populated();
    expect(await p.lock.enable(PASS)).toBe("ok");
    const db = await rawDb(env);
    const [key, value] = (await db.entries<{ v: number; enc: { iv: string; ct: string } }>("assessments"))[0]!;
    await db.put("assessments", key, { ...value, enc: { ...value.enc, ct: toBase64(new Uint8Array(40)) } });       // damaged
    db.close();
    const before = (await dump(env)).text;
    expect(await p.lock.disable(PASS)).toBe("failed");
    expect((await dump(env)).text).toBe(before);
  });

  it("the throttle applies to a wrong current passphrase too", async () => {
    const { env, p } = await populated();
    expect(await p.lock.enable(PASS)).toBe("ok");
    let now = 5_000_000;
    const q = fresh(env, () => now);
    for (let i = 0; i < 5; i++) expect(await q.lock.disable(`wrong ${i}`)).toBe("wrong");
    expect(await q.lock.disable(PASS)).toBe("wait");
    expect(await q.lock.change(PASS, OTHER)).toBe("wait");
    now += 2_000;
    expect(await q.lock.disable(PASS)).toBe("ok");
  });
});

describe("the other tab", () => {
  it("a tab that does not know the lock was turned on cannot write around it: its write is refused, nothing is left in the clear, and it is told", async () => {
    const { env } = await populated();
    const stale = fresh(env);
    expect((await stale.lock.status()).phase).toBe("none");
    const told = vi.fn();
    stale.lock.onChanged(told);
    const owner = fresh(env);
    expect(await owner.lock.enable(PASS)).toBe("ok");
    await stale.putAssessment(saved("rs0000000000000s", 6_000_000, { userNote: "STALE-TAB-SECRET" }));
    await stale.saveDraft(draftWithSecrets());
    expect((await dump(env)).text).not.toContain("STALE-TAB-SECRET");
    expect((await dump(env)).text).not.toContain(SECRET_ALLERGY);
    expect(told).toHaveBeenCalled();
    expect((await stale.lock.status()).phase).toBe("locked");        // it has found out
  });

  it("a tab holding the key of a lock that was turned off, or replaced, is refused too", async () => {
    const { env, p } = await populated();
    expect(await p.lock.enable(PASS)).toBe("ok");
    const second = fresh(env);
    expect((await second.lock.unlock(PASS)).ok).toBe(true);
    expect(await p.lock.disable(PASS)).toBe("ok");                   // the first tab turns it off
    await second.putAssessment(saved("rt0000000000000t", 7_000_000, { userNote: "AFTER-OFF" }));
    expect((await dump(env)).text).toContain(SECRET_NOTE);           // plain now, by the first tab's doing
    expect((await second.listAssessments()).some((s) => s.id === "rt0000000000000t")).toBe(true);   // the refused write is retried by nobody; the tab has been told and reads the store as it is
  });

  it("another tab changing the passphrase does not stop this one from writing: it holds the same data key", async () => {
    const { env, p } = await populated();
    expect(await p.lock.enable(PASS)).toBe("ok");
    const second = fresh(env);
    expect((await second.lock.unlock(PASS)).ok).toBe(true);
    expect(await p.lock.change(PASS, OTHER)).toBe("ok");
    await second.putAssessment(saved("ru0000000000000u", 8_000_000, { userNote: "STILL-SEALED" }));
    expect((await dump(env)).text).not.toContain("STILL-SEALED");
    expect((await second.getAssessment("ru0000000000000u"))?.userNote).toBe("STILL-SEALED");
  });
});

describe("importing into a locked store", () => {
  it("what a restore writes is sealed with the data key while unlocked, and refused while locked", async () => {
    const { env, p } = await populated();
    expect(await p.lock.enable(PASS)).toBe("ok");
    const imported = saved("ri0000000000000i", 8_500_000, { userNote: "IMPORTED-SECRET" });
    expect(await p.applyWrites([{ store: "assessments", key: imported.id, value: { v: 1, data: imported } }])).toBe(true);
    expect((await dump(env)).text).not.toContain("IMPORTED-SECRET");
    expect((await p.getAssessment(imported.id))?.userNote).toBe("IMPORTED-SECRET");
    const reloaded = fresh(env);
    expect(await reloaded.applyWrites([{ store: "assessments", key: "rj", value: { v: 1, data: imported } }])).toBe(false);
  });
});

describe("the database's own conditions", () => {
  it("a batch under a lock id is refused when the stored lock is another, and a batch that expects entries is refused when they changed — in both, nothing is written", async () => {
    const env = fakeEnvironment();
    const db = await rawDb(env);
    await db.put("assessments", "a", { v: 1, data: 1 });
    const snapshot = await db.entries("assessments");
    await expect(db.batch([{ store: "assessments", key: "b", value: 2 }], { lock: "someone" })).rejects.toMatchObject({ name: "ConflictError", kind: "lock" });
    await db.put("assessments", "c", { v: 1, data: 3 });
    await expect(db.batch([{ store: "assessments", key: "b", value: 2 }], { expect: { assessments: snapshot } })).rejects.toBeInstanceOf(ConflictError);
    expect((await db.entries("assessments")).map(([k]) => k)).toEqual(["a", "c"]);
    await db.batch([{ store: "assessments", key: "b", value: 2 }], { lock: null, expect: { assessments: await db.entries("assessments") } });
    expect((await db.entries("assessments")).map(([k]) => k)).toEqual(["a", "b", "c"]);
    db.close();
  });
});
