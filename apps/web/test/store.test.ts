import { describe, expect, it, vi } from "vitest";
import { createAppStore } from "../src/app/store.tsx";
import type { LockApi, Persistence } from "../src/storage/persistence.ts";
import type { Draft } from "../src/storage/types.ts";
import { fakeEnvironment, testStore } from "./helpers.tsx";

const noLock: LockApi = { hint: () => false, status: async () => ({ phase: "none", allowedAt: null, failures: 0, broken: false }), unlock: async () => ({ ok: false, reason: "unavailable", allowedAt: null, failures: 0 }), lockNow: () => undefined, enable: async () => "failed", disable: async () => "failed", change: async () => "failed", onChanged: () => () => undefined };
const stub = (over: Partial<Persistence> = {}): Persistence => ({
  status: "persistent", lock: noLock, subscribe: () => () => undefined, loadPrefs: () => ({ theme: "system", textScale: 1, langOfferDismissed: false, autoAdvance: true }), savePrefs: () => undefined,
  loadDraft: async () => null, saveDraft: async () => undefined, clearDraft: async () => undefined,
  putAssessment: async () => undefined, getAssessment: async () => null, listAssessments: async () => [], deleteAssessment: async () => undefined,
  applyWrites: async () => true,
  eraseAll: async () => ({ indexedDb: true, localStorage: true, cacheStorage: true }), ...over,
});

describe("app store", () => {
  it("starts a draft with the injected id and clock, and stamps updatedAt on every change", () => {
    const { store } = testStore();
    const d = store.getState().startDraft();
    expect(d.id).toMatch(/^id/);
    expect(d.startedAt).toBe(d.updatedAt);
    store.getState().updateDraft((x) => ({ ...x, subject: { ageYears: 33 } }));
    const after = store.getState().draft!;
    expect(after.subject.ageYears).toBe(33);
    expect(after.updatedAt).toBeGreaterThan(d.updatedAt);
    expect(after.startedAt).toBe(d.startedAt);
  });

  it("updateDraft without a draft does nothing", () => {
    const { store } = testStore();
    store.getState().updateDraft((x) => ({ ...x, subject: { ageYears: 1 } }));
    expect(store.getState().draft).toBeNull();
  });

  it("saves the draft once, debounced, with the latest value; flush saves immediately", async () => {
    vi.useFakeTimers();
    try {
      const saveDraft = vi.fn(async (_d: Draft) => undefined);
      const store = createAppStore({ persistence: stub({ saveDraft }), autosaveMs: 250, now: () => 5, newId: () => "x" });
      store.getState().startDraft();
      for (let age = 1; age <= 5; age++) store.getState().updateDraft((d) => ({ ...d, subject: { ageYears: age } }));
      expect(saveDraft).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(249);
      expect(saveDraft).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(saveDraft).toHaveBeenCalledTimes(1);
      expect(saveDraft.mock.calls[0]![0].subject.ageYears).toBe(5);
      store.getState().updateDraft((d) => ({ ...d, subject: { ageYears: 6 } }));
      await store.flush();
      expect(saveDraft).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it("init loads the stored draft (Resume), without replacing one started in this session", async () => {
    const env = fakeEnvironment();
    const first = testStore(env);
    first.store.getState().startDraft();
    first.store.getState().updateDraft((d) => ({ ...d, subject: { ageYears: 41 }, position: { route: "/inquiry", questionId: "Q7" } }));
    await first.store.flush();

    const second = testStore(env);
    expect(second.store.getState().draftLoaded).toBe(false);
    await second.store.getState().init();
    expect(second.store.getState().draftLoaded).toBe(true);
    expect(second.store.getState().draft?.position).toEqual({ route: "/inquiry", questionId: "Q7" });
    expect(second.store.getState().draft?.subject.ageYears).toBe(41);

    const third = testStore(env);
    third.store.getState().startDraft();
    const mine = third.store.getState().draft!.id;
    await third.store.getState().init();
    expect(third.store.getState().draft?.id).toBe(mine);
  });

  it("discard removes the draft from memory and storage and cancels a pending save", async () => {
    const env = fakeEnvironment();
    const a = testStore(env);
    a.store.getState().startDraft();
    await a.store.flush();
    a.store.getState().updateDraft((d) => ({ ...d, subject: { ageYears: 9 } }));
    await a.store.getState().discardDraft();
    await a.store.flush();
    expect(a.store.getState().draft).toBeNull();
    const b = testStore(env);
    await b.store.getState().init();
    expect(b.store.getState().draft).toBeNull();
  });

  it("birth data stays in memory but is not persisted unless remembered", async () => {
    const env = fakeEnvironment();
    const a = testStore(env);
    a.store.getState().startDraft();
    const birth = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
    a.store.getState().updateDraft((d) => ({ ...d, birth }));
    await a.store.flush();
    expect(a.store.getState().draft?.birth).toEqual(birth);
    const b = testStore(env);
    await b.store.getState().init();
    expect(b.store.getState().draft?.birth).toBeUndefined();
    a.store.getState().updateDraft((d) => ({ ...d, rememberBirth: true }));
    await a.store.flush();
    const c = testStore(env);
    await c.store.getState().init();
    expect(c.store.getState().draft?.birth).toEqual(birth);
  });

  it("preferences persist across sessions; chooseLang also retires the English offer", () => {
    const env = fakeEnvironment();
    const a = testStore(env);
    a.store.getState().setPrefs({ theme: "dark", textScale: 1.15 });
    a.store.getState().chooseLang("en");
    const b = testStore(env);
    expect(b.store.getState().prefs).toMatchObject({ theme: "dark", textScale: 1.15, lang: "en", langOfferDismissed: true, autoAdvance: true });
  });

  it("erase everything clears the draft and storage and then reloads", async () => {
    const env = fakeEnvironment();
    const reload = vi.fn();
    const a = testStore(env, { reload });
    a.store.getState().setPrefs({ theme: "dark" });
    a.store.getState().startDraft();
    await a.store.flush();
    await a.store.getState().eraseAll();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(a.store.getState().draft).toBeNull();
    expect(env.localStorage!.length).toBe(0);
    expect(await env.indexedDB!.databases()).toEqual([]);
  });

  it("mirrors the storage status of the persistence layer", async () => {
    let notify: (s: "persistent" | "memory") => void = () => undefined;
    const store = createAppStore({ persistence: stub({ subscribe: (l) => { notify = l; return () => undefined; } }) });
    expect(store.getState().storage).toBe("persistent");
    notify("memory");
    expect(store.getState().storage).toBe("memory");
  });
});
