import { describe, expect, it, vi } from "vitest";
import { createAutosaver } from "../src/storage/autosave.ts";
import { createKV } from "../src/storage/kv.ts";
import { newDraft, parseDraft, toStored } from "../src/storage/draft.ts";
import { migrate } from "../src/storage/migrations.ts";
import { parsePrefs } from "../src/storage/prefs.ts";
import { createPersistence } from "../src/storage/persistence.ts";
import type { SavedAssessment } from "../src/storage/types.ts";
import { blockedEnvironment, fakeEnvironment } from "./helpers.tsx";

const birth = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
const draftWithBirth = (remember: boolean) => ({ ...newDraft("d1", 5), birth, rememberBirth: remember, subject: { ageYears: 40 }, redFlags: ["RF1"], findings: { C01: { state: "present" as const, severity: "light" as const } } });
const saved = (id: string, createdAt: number): SavedAssessment => ({ id, createdAt, appVersion: "0", kbVersion: "k", engineVersion: "e", paramsFingerprint: "f", profile: "release", lang: "en", seasonModel: "solar", input: { subject: {}, profile: { medicationText: [] }, screening: { answers: {}, corrected: [], acknowledgedAt: {} }, redFlags: [], findings: {}, context: {} }, result: {} as never });

describe("kv", () => {
  it("stores durably when localStorage works", () => {
    const env = fakeEnvironment();
    const kv = createKV(env.localStorage);
    expect(kv.durable).toBe(true);
    expect(kv.set("a", "1")).toBe(true);
    expect(env.localStorage.getItem("a")).toBe("1");
    kv.remove("a");
    expect(kv.get("a")).toBeNull();
  });
  it("never throws: blocked or missing storage keeps the value in memory", () => {
    for (const storage of [blockedEnvironment().localStorage, null, undefined]) {
      const kv = createKV(storage);
      expect(kv.durable).toBe(false);
      expect(kv.set("a", "1")).toBe(false);
      expect(kv.get("a")).toBe("1");
      kv.remove("a");
      expect(kv.get("a")).toBeNull();
      expect(() => kv.clear()).not.toThrow();
    }
  });
  it("a write that fails later (quota) falls back to memory", () => {
    const env = fakeEnvironment();
    const kv = createKV(env.localStorage);
    vi.spyOn(env.localStorage, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    expect(kv.set("a", "1")).toBe(false);
    expect(kv.get("a")).toBe("1");
    expect(kv.durable).toBe(false);
  });
});

describe("prefs", () => {
  it("defaults on absent, corrupt or foreign values", () => {
    for (const raw of [null, "", "{", "[]", "42", "null"]) expect(parsePrefs(raw)).toEqual({ theme: "system", textScale: 1, langOfferDismissed: false, autoAdvance: true });
  });
  it("keeps valid fields and drops invalid ones", () => {
    const p = parsePrefs(JSON.stringify({ lang: "en", theme: "purple", textScale: 1.15, disclaimerAck: { version: "1", at: 7 }, langOfferDismissed: true, extra: 1 }));
    expect(p).toEqual({ lang: "en", theme: "system", textScale: 1.15, disclaimerAck: { version: "1", at: 7 }, langOfferDismissed: true, autoAdvance: true });
    expect(parsePrefs(JSON.stringify({ lang: "fr", disclaimerAck: { version: 1 } })).lang).toBeUndefined();
  });
});

describe("draft", () => {
  it("birth data reaches storage only when 'remember on this device' is on", () => {
    expect(toStored(draftWithBirth(false)).birth).toBeUndefined();
    expect(toStored(draftWithBirth(true)).birth).toEqual(birth);
    expect(JSON.stringify(toStored(draftWithBirth(false)))).not.toContain("1990");
  });
  it("parseDraft accepts a stored draft and rejects malformed ones", () => {
    const d = draftWithBirth(true);
    expect(parseDraft(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(parseDraft({ ...d, id: "" })).toBeNull();
    expect(parseDraft({ ...d, redFlags: [1] })).toBeNull();
    expect(parseDraft({ ...d, position: {} })).toBeNull();
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft({ ...d, rememberBirth: false })?.birth).toBeUndefined();     // a stored birth without the opt-in is ignored
  });
});

describe("migrations", () => {
  it("returns the data of a current envelope and refuses anything it cannot understand", () => {
    expect(migrate({ v: 1, data: { a: 1 } }, 1, {})).toEqual({ a: 1 });
    expect(migrate({ v: 2, data: {} }, 1, {})).toBeNull();            // from a newer app: left alone, treated as absent
    for (const bad of [null, undefined, 3, "x", {}, { v: "1", data: 1 }, { v: 0, data: 1 }, { v: 1.5, data: 1 }, { v: 1 }]) expect(migrate(bad, 1, {})).toBeNull();
  });
  it("runs forward steps in order (scaffold fixture: v1 → v2 → v3)", () => {
    const table = { 1: (d: unknown) => ({ ...(d as object), b: 2 }), 2: (d: unknown) => ({ ...(d as object), c: 3 }) };
    expect(migrate({ v: 1, data: { a: 1 } }, 3, table)).toEqual({ a: 1, b: 2, c: 3 });
    expect(migrate({ v: 2, data: { a: 1 } }, 3, table)).toEqual({ a: 1, c: 3 });
  });
  it("a missing or throwing step means 'absent', never a crash", () => {
    expect(migrate({ v: 1, data: {} }, 3, { 1: (d) => d })).toBeNull();
    expect(migrate({ v: 1, data: {} }, 2, { 1: () => { throw new Error("boom"); } })).toBeNull();
  });
});

describe("persistence on IndexedDB", () => {
  it("round-trips the draft and the saved assessments (newest first)", async () => {
    const p = createPersistence(fakeEnvironment());
    expect(await p.loadDraft()).toBeNull();
    await p.saveDraft(draftWithBirth(true));
    expect(await p.loadDraft()).toEqual(draftWithBirth(true));
    await p.clearDraft();
    expect(await p.loadDraft()).toBeNull();
    for (const a of [saved("a", 1), saved("b", 3), saved("c", 2)]) await p.putAssessment(a);
    expect((await p.listAssessments()).map((a) => a.id)).toEqual(["b", "c", "a"]);
    expect((await p.getAssessment("c"))?.createdAt).toBe(2);
    await p.deleteAssessment("c");
    expect(await p.getAssessment("c")).toBeNull();
    expect(p.status).toBe("persistent");
  });
  it("persists the draft without the birth moment when 'remember' is off, and reloads it from a new session", async () => {
    const env = fakeEnvironment();
    await createPersistence(env).saveDraft(draftWithBirth(false));
    const reloaded = await createPersistence(env).loadDraft();
    expect(reloaded?.birth).toBeUndefined();
    expect(reloaded?.subject).toEqual({ ageYears: 40 });
  });
  it("a corrupt stored draft is 'no draft'", async () => {
    const env = fakeEnvironment();
    const p = createPersistence(env);
    await p.saveDraft({ ...draftWithBirth(false), id: "" });          // structurally invalid once read back
    expect(await createPersistence(env).loadDraft()).toBeNull();
  });
  it("erase everything empties IndexedDB, localStorage and Cache Storage (E14)", async () => {
    const deleted: string[] = [];
    const caches = { keys: async () => ["a", "b"], delete: async (k: string) => { deleted.push(k); return true; } } as unknown as CacheStorage;
    const env = fakeEnvironment({ caches });
    const p = createPersistence(env);
    p.savePrefs({ theme: "dark", textScale: 1, langOfferDismissed: true, autoAdvance: true });
    await p.saveDraft(draftWithBirth(true));
    await p.putAssessment(saved("a", 1));
    expect(env.localStorage.length).toBeGreaterThan(0);
    const report = await p.eraseAll();
    expect(report).toEqual({ indexedDb: true, localStorage: true, cacheStorage: true });
    expect(env.localStorage.length).toBe(0);
    expect(deleted).toEqual(["a", "b"]);
    expect(await env.indexedDB!.databases()).toEqual([]);
    const fresh = createPersistence(env);
    expect(await fresh.loadDraft()).toBeNull();
    expect(await fresh.listAssessments()).toEqual([]);
  });
});

describe("persistence when storage is blocked (E20)", () => {
  it("works in memory for the session, reports 'memory' and tells subscribers", async () => {
    const p = createPersistence(blockedEnvironment());
    const seen: string[] = [];
    p.subscribe((s) => seen.push(s));
    await expect(p.saveDraft(draftWithBirth(false))).resolves.toBeUndefined();
    expect(p.status).toBe("memory");
    expect(seen).toEqual(["memory"]);
    expect((await p.loadDraft())?.id).toBe("d1");                   // still available within the session
    p.savePrefs({ theme: "dark", textScale: 1, langOfferDismissed: false, autoAdvance: true });
    expect(p.loadPrefs().theme).toBe("dark");
    await expect(p.eraseAll()).resolves.toBeDefined();
  });
  it("a missing IndexedDB is the same", async () => {
    const p = createPersistence({ localStorage: null, indexedDB: null, caches: null });
    await p.putAssessment(saved("a", 1));
    expect(p.status).toBe("memory");
    expect((await p.listAssessments()).length).toBe(1);
  });
  it("localStorage failing alone loses preferences but not the answers", async () => {
    const p = createPersistence(fakeEnvironment({ localStorage: blockedEnvironment().localStorage }));
    await p.saveDraft(draftWithBirth(false));
    expect(p.status).toBe("persistent");
  });
});

describe("autosave", () => {
  const manual = () => {
    const jobs: { fn: () => void; ms: number; id: number }[] = [];
    let n = 0;
    return { jobs, timers: { set: (fn: () => void, ms: number) => { jobs.push({ fn, ms, id: ++n }); return n; }, clear: (h: unknown) => { const i = jobs.findIndex((j) => j.id === h); if (i >= 0) jobs.splice(i, 1); } } };
  };
  it("debounces: only the last value is saved, after the delay", async () => {
    const save = vi.fn(async () => undefined);
    const m = manual();
    const a = createAutosaver<number>(save, 250, m.timers);
    a.schedule(1); a.schedule(2); a.schedule(3);
    expect(m.jobs.length).toBe(1);
    expect(m.jobs[0]!.ms).toBe(250);
    m.jobs[0]!.fn();
    await Promise.resolve();
    expect(save.mock.calls).toEqual([[3]]);
  });
  it("flush saves now; cancel drops the pending value", async () => {
    const save = vi.fn(async () => undefined);
    const m = manual();
    const a = createAutosaver<number>(save, 250, m.timers);
    a.schedule(1);
    await a.flush();
    expect(save.mock.calls).toEqual([[1]]);
    expect(m.jobs.length).toBe(0);
    a.schedule(2);
    a.cancel();
    await a.flush();
    expect(save.mock.calls.length).toBe(1);
  });
});
