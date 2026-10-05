// Privacy tests (test plan §5.1 E14, E19, E20; privacy.md): what the app does with health data, checked from the outside — requests, URL and history, title, cookies, the console,
// what is written to storage — and from the inside — a scan of the source for APIs that could leak. Marker values are typed into the person's data and must never show up anywhere
// they should not. (A real-browser network test is part of the Playwright suite, Q-04; this one runs the same flow in jsdom.)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessInputOf, toSaved, withoutBirthMoment } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { openIndexedDb, STORES } from "../src/storage/db.ts";
import type { Draft } from "../src/storage/types.ts";
import { blockedEnvironment, fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview, screenedDraft } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
const popstate = (path: string): void => { act(() => { go(path); window.dispatchEvent(new PopStateEvent("popstate")); }); };

/** Distinctive values that stand for the person's health data and birth data. */
const ALLERGY = "Zq7-almond", MEDICINE = "Zq7-pill", BIRTH_YEAR = "1987", BIRTH_LON = "113.2641";
const MARKERS = [ALLERGY, MEDICINE, BIRTH_LON, "1987-03-09"];
const BIRTH = { year: 1987, month: 3, day: 9, hour: 14, minute: 41, sex: "male", timeZone: "Asia/Shanghai", longitude: 113.2641 } as const;

function markedDraft(over: Partial<Draft> = {}): Draft {
  const subject: Draft["subject"] = { ageYears: 36, sex: "male", pregnancy: "not-applicable", lactating: false, medications: ["other"], allergies: [ALLERGY] };
  const start = screenedDraft(kb, subject, { profile: { medications: "some", medicationText: [MEDICINE], allergies: "some", conditions: "none" }, birth: BIRTH, rememberBirth: false, ...over });
  return interview(kb, "SP1", start);
}

async function open(draft: Draft, env = fakeEnvironment(), route = "/en/review") {
  try { env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang: "en" })); } catch { /* blocked storage: the defaults apply */ }
  const t = testStore(env);
  t.store.getState().startDraft();
  t.store.getState().updateDraft((d) => ({ ...draft, id: d.id, startedAt: d.startedAt, position: { route: "/review" } }));
  go(route);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  return { ...view, ...t, env };
}

/** Everything written to the device: localStorage as text, and every record of every IndexedDB store. */
async function dumpStorage(env: ReturnType<typeof fakeEnvironment>): Promise<{ local: string; idb: string }> {
  const local = [...Array(env.localStorage.length).keys()].map((i) => { const k = env.localStorage.key(i)!; return `${k}=${env.localStorage.getItem(k)}`; }).join("\n");
  const db = await openIndexedDb(env.indexedDB!);
  const rows = (await Promise.all(STORES.map((s) => db.getAll(s)))).flat();
  db.close();
  return { local, idb: JSON.stringify(rows) };
}

const consoleCalls: unknown[][] = [];
const requests: string[] = [];
beforeEach(() => {
  consoleCalls.length = 0;
  requests.length = 0;
  for (const m of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { consoleCalls.push(args); });
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => { requests.push(String(input instanceof Request ? input.url : input)); return Promise.reject(new Error("no network in tests")); });
  vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation((_method: string, url: string | URL) => { requests.push(String(url)); });
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: (url: string) => { requests.push(`beacon ${url}`); return false; } });
  vi.stubGlobal("WebSocket", class { constructor(url: string) { requests.push(`websocket ${url}`); } });
});
afterEach(() => { go("/"); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const textOf = (calls: unknown[][]): string => calls.map((c) => c.map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ""}` : typeof a === "string" ? a : JSON.stringify(a))).join(" ")).join("\n");

describe("E19: nothing leaves the device and nothing leaks into the address, the title, cookies or the console", () => {
  it("a full flow — result, summary, history, settings, sources — makes no request and shows no marker outside the screen", async () => {
    const { persistence } = await open(markedDraft());
    await userEvent.click(await screen.findByRole("button", { name: "Get my result" }));
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/en\/result\/[0-9a-f]{16}$/));
    const id = window.location.pathname.split("/").pop()!;
    await screen.findByRole("heading", { level: 1, name: "Your result" });
    for (const path of [`/en/result/${id}/summary`, "/en/history", "/en/settings", "/en/sources", `/en/result/${id}`]) {
      popstate(path);
      await screen.findByRole("heading", { level: 1 });
      const where = `${window.location.href} ${JSON.stringify(window.history.state)} ${document.title}`;
      for (const m of [...MARKERS, BIRTH_YEAR]) expect(where, `${m} at ${path}`).not.toContain(m);
    }
    expect(requests).toEqual([]);                                                       // the knowledge base is injected here; in the real app its own requests go to the same origin only
    expect(document.cookie).toBe("");
    const logged = textOf(consoleCalls);
    for (const m of MARKERS) expect(logged).not.toContain(m);
    expect((await persistence.listAssessments()).length).toBe(1);
  });

  it("every request the real knowledge loader makes is to the same origin", async () => {
    const { loadKnowledgeBase } = await import("@tcm/kb");
    const seen: string[] = [];
    const fetcher = (url: string): Promise<Response> => { seen.push(url); return Promise.reject(new Error("stop")); };
    await loadKnowledgeBase({ baseUrl: `${import.meta.env.BASE_URL}kb`, fetch: fetcher as unknown as typeof fetch }).catch(() => undefined);
    expect(seen.length).toBeGreaterThan(0);
    for (const url of seen) expect(new URL(url, window.location.origin).origin, url).toBe(window.location.origin);
  });
});

describe("what is written to the device", () => {
  it("birth data is not stored unless the person chose to remember it; the answers are stored, in IndexedDB only", async () => {
    const { env, persistence } = await open(markedDraft({ rememberBirth: false }));
    await userEvent.click(await screen.findByRole("button", { name: "Get my result" }));
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/en\/result\//));
    await screen.findByRole("heading", { level: 1, name: "Your result" });
    const saved = (await persistence.listAssessments())[0]!;
    expect(saved.input.birth).toBeUndefined();
    const { local, idb } = await dumpStorage(env);
    for (const m of [BIRTH_LON, "1987-03-09"]) { expect(idb).not.toContain(m); expect(local).not.toContain(m); }
    expect(idb).not.toContain('"longitude":113.2641');
    expect(idb).toContain(ALLERGY);                                                    // the person's own list is kept (privacy §2), but only in IndexedDB
    expect(local).not.toContain(ALLERGY);
    expect(local).not.toContain(MEDICINE);
    expect(Object.keys(JSON.parse(env.localStorage.getItem("tcm.prefs")!)).sort()).toEqual(["disclaimerAck", "lang"]);
  });

  it("remembered birth data is kept in the draft and the saved result — and never in localStorage", async () => {
    const { env, persistence } = await open(markedDraft({ rememberBirth: true }));
    await userEvent.click(await screen.findByRole("button", { name: "Get my result" }));
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/en\/result\//));
    await screen.findByRole("heading", { level: 1, name: "Your result" });
    expect((await persistence.listAssessments())[0]!.input.birth).toMatchObject({ year: 1987, longitude: 113.2641 });
    const { local, idb } = await dumpStorage(env);
    expect(idb).toContain("113.2641");
    expect(local).not.toContain("113.2641");
  });

  it("the assessment in progress is stored without birth data when it is not remembered", async () => {
    const { env } = await open(markedDraft({ rememberBirth: false }));
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });          // let the autosave run
    const { idb } = await dumpStorage(env);
    expect(idb).toContain(ALLERGY);    // sanity: the draft itself is stored, or the next line would pass vacuously
    expect(idb).not.toContain("113.2641");
  });
});

describe("a saved result and the birth moment (privacy §3)", () => {
  const draft = markedDraft({ rememberBirth: false });
  const result = engine.assess(kb, assessInputOf(draft, Date.UTC(2026, 9, 4, 12))!);

  it("the engine's result does carry the birth moment (the pillars and the true solar time) — which is why a result is redacted before it is stored", () => {
    expect(result.reference?.birth.used).toBe(true);
    expect(result.reference?.birth.pillars).not.toBeNull();
    expect(result.reference?.birth.trueSolarTime).toContain("1987-03-09");
  });

  it("not remembered: the saved result keeps the derived panel and the flag that birth data was used, not the pillars or the time", () => {
    const saved = toSaved(draft, result, { id: "r0123456789abcdef", lang: "en" });
    const b = saved.result.reference!.birth;
    expect([b.used, b.requested, b.pillars, b.trueSolarTime]).toEqual([true, true, null, null]);
    expect(saved.result.reference!.innate).toEqual(result.reference!.innate);
    expect(saved.result.reference!.panel).toEqual(result.reference!.panel);
    expect(saved.input.birth).toBeUndefined();
    expect(JSON.stringify(saved)).not.toMatch(/1987-03-09|113\.2641/);
    expect(result.reference!.birth.pillars).not.toBeNull();                                 // the original is untouched
  });

  it("remembered: the person asked for it, so the result is kept whole", () => {
    const saved = toSaved({ ...draft, rememberBirth: true }, result, { id: "r0123456789abcdef", lang: "en" });
    expect(saved.input.birth).toMatchObject({ year: 1987 });
    expect(saved.result.reference!.birth.trueSolarTime).toContain("1987-03-09");
  });

  it("a result without a reference block is left alone", () => {
    const none = { ...result, reference: null };
    expect(withoutBirthMoment(none)).toBe(none);
  });
});

describe("E14: erase everything", () => {
  it("empties localStorage, IndexedDB and Cache Storage, and reloads", async () => {
    const caches = new Map<string, true>([["tcm-shell", true], ["kb-v1", true]]);
    const env = fakeEnvironment({ caches: { keys: async () => [...caches.keys()], delete: async (k: string) => caches.delete(k) } as unknown as CacheStorage });
    const reload = vi.fn();
    const t = testStore(env, { reload });
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang: "en" }));
    t.store.getState().startDraft();
    t.store.getState().updateDraft(() => ({ ...markedDraft(), id: "d1", startedAt: 1, position: { route: "/review" } }));
    await t.persistence.putAssessment({ id: "r0123456789abcdef", createdAt: 1, appVersion: "t", kbVersion: "k", engineVersion: "e", paramsFingerprint: "p", profile: "dev", lang: "en", seasonModel: "x", input: { subject: {}, profile: { medicationText: [] }, screening: { answers: {}, corrected: [], acknowledgedAt: {} }, redFlags: [], findings: {}, context: {} }, result: {} } as never);
    go("/en/settings");
    renderApp(t.store, () => Promise.resolve(loaded));
    await act(async () => { await Promise.resolve(); });
    expect(env.localStorage.length).toBeGreaterThan(0);
    expect((await env.indexedDB!.databases()).length).toBe(1);
    await userEvent.click(await screen.findByRole("button", { name: "Erase everything…" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Erase everything" }));
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(env.localStorage.length).toBe(0);
    expect(await env.indexedDB!.databases()).toEqual([]);
    expect(caches.size).toBe(0);
  });
});

describe("E20: storage blocked", () => {
  it("the flow reaches the result with a visible 'Not saved' chip, and nothing sensitive reaches the console", async () => {
    await open(markedDraft(), blockedEnvironment() as ReturnType<typeof fakeEnvironment>);
    await userEvent.click(await screen.findByRole("button", { name: "Get my result" }));
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/en\/result\//));
    expect(await screen.findByRole("heading", { level: 1, name: "Your result" })).toBeInTheDocument();
    expect((await screen.findAllByTestId("not-saved")).length).toBeGreaterThan(0);
    const logged = textOf(consoleCalls);
    for (const m of MARKERS) expect(logged).not.toContain(m);
  });
});

// ── the source ──────────────────────────────────────────────────────────────

const repo = join(import.meta.dirname, "..", "..", "..");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === "node_modules" || n === "generated" ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
const sources = ["apps/web/src", "packages/kb/src", "packages/engine/src", "packages/wuxing/src", "packages/i18n/src"].flatMap((d) => walk(join(repo, d))).map((p) => ({ path: relative(repo, p), text: readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1") }));
const offenders = (re: RegExp, allowed: (path: string) => boolean = () => false): string[] => sources.filter((s) => !allowed(s.path) && re.test(s.text)).map((s) => s.path);

describe("the source cannot leak (test plan §5.6)", () => {
  it("browser storage is used only by the storage layer — and Cache Storage only by the service worker, for the files of the build", () => {
    // (the offline controller and the boot guard take a cache storage as a parameter; the browser's own is picked by the storage layer, as for everything else)
    expect(offenders(/\b(localStorage|sessionStorage|indexedDB|document\.cookie|caches\.(open|keys|match))\b/, (p) => p.startsWith("apps/web/src/storage/") || p.startsWith("apps/web/src/sw/") || p === "apps/web/src/offline/worker.ts" || p === "apps/web/src/offline/boot.ts" || p === "apps/web/src/offline/index.ts")).toEqual([]);
    // …and nothing but the storage layer reaches for the browser's own storage objects: the offline code receives them (index.ts reads the storage layer's environment)
    expect(offenders(/\b(window\.(localStorage|sessionStorage|indexedDB)|document\.cookie|globalThis\.caches|\bnew IDBRequest)\b/, (p) => p.startsWith("apps/web/src/storage/"))).toEqual([]);
  });
  it("the only network access is the knowledge-base loader — and the service worker, which fetches the files of its own build", () => {
    expect(offenders(/\b(fetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket|EventSource|importScripts|navigator\.geolocation|new\s+Image\s*\()/, (p) => p === "packages/kb/src/loader.ts" || p.startsWith("apps/web/src/sw/"))).toEqual([]);
    // the worker names no address and no cross-origin API, and takes no part of a request but its method, mode and path
    const worker = sources.filter((s) => s.path.startsWith("apps/web/src/sw/"));
    expect(worker.length).toBeGreaterThanOrEqual(3);
    for (const s of worker) expect(/https?:\/\/|XMLHttpRequest|sendBeacon|WebSocket|importScripts|\.cookies?\b|\.headers\b|\.text\(\)|\.json\(\)|\.formData\(\)|\.clone\(\)/.test(s.text.replace(/\/\/[^\n]*/g, "")), s.path).toBe(false);
  });
  it("no raw HTML injection, eval or document.write, and no absolute web address in code", () => {
    expect(offenders(/\b(dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new\s+Function\s*\()/)).toEqual([]);
    expect(offenders(/["'`]https?:\/\//)).toEqual([]);
  });
  it("the page loads scripts and styles from its own origin only", () => {
    const html = readFileSync(join(repo, "apps/web/index.html"), "utf8");
    for (const m of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)) expect(m[1]!.startsWith("http"), m[1]).toBe(false);
  });
});
