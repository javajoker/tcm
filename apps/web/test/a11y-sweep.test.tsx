// The accessibility sweep (test plan §5.2, task Q-05): axe on every route of the app in both languages, each in a state where the route has something to show, plus a guard that
// fails when a route is added without being listed here. jsdom cannot compute colours, so contrast is checked elsewhere: the token pairs of both colour schemes in tokens.test.ts and
// real rendering in the Playwright / Lighthouse runs (Q-04, Q-06). Manual assistive-technology passes follow docs/accessibility-protocol.md.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, screen } from "@testing-library/react";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { IS_DEV_PROFILE } from "../src/app/profile.ts";
import { withAnswer } from "../src/screens/screening/model.ts";
import type { Draft, SavedAssessment } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

const finished: Draft = interview(kb, "SP1");
const result = engine.assess(kb, assessInputOf(finished, Date.UTC(2026, 9, 4, 12))!);
const makeSaved = (id: string, createdAt: number): SavedAssessment => ({ ...toSaved(finished, result, { id, lang: "en" }), createdAt });
const saved = makeSaved("r0123456789abcdef", Date.UTC(2026, 9, 4, 12));
const older = makeSaved("r1123456789abcdef", Date.UTC(2026, 8, 1, 12));
const formulaId = (saved.result.recommendations.formulas[0] ?? saved.result.recommendations.studyOnly[0])!.id;

type Needs = "nothing" | "draft" | "saved";
/** Every route of App.tsx, with what must be stored for it to show its real content. `path` is the route pattern as written in App.tsx. */
const ROUTES: { pattern: string; url: string; needs: Needs; dev?: true; state?: (d: Draft) => Draft }[] = [
  { pattern: "/", url: "/", needs: "nothing" },
  { pattern: "/start", url: "/start", needs: "draft" },
  { pattern: "/screen", url: "/screen", needs: "draft" },
  { pattern: "/inquiry", url: "/inquiry", needs: "draft" },
  { pattern: "/observe", url: "/observe", needs: "draft" },
  { pattern: "/constitution", url: "/constitution", needs: "draft" },
  { pattern: "/observe/tongue", url: "/observe/tongue", needs: "draft" },
  { pattern: "/observe/pulse", url: "/observe/pulse", needs: "draft" },
  { pattern: "/review", url: "/review", needs: "draft" },
  { pattern: "/history", url: "/history", needs: "saved" },
  { pattern: "/settings", url: "/settings", needs: "nothing" },
  { pattern: "/sources", url: "/sources", needs: "nothing" },
  { pattern: "/result/:id/summary", url: `/result/${saved.id}/summary`, needs: "saved" },
  { pattern: "/result/:id/formula/:fid", url: `/result/${saved.id}/formula/${formulaId}`, needs: "saved" },
  { pattern: "/result/:id", url: `/result/${saved.id}`, needs: "saved" },
  { pattern: "/_dev", url: "/_dev", needs: "draft", dev: true },
  { pattern: "/_dev/components", url: "/_dev/components", needs: "nothing", dev: true },
  { pattern: "*", url: "/no-such-page", needs: "nothing" },
];
/** Extra states of a route that have their own markup: a blocking notice, an unsure answer. */
const STATES: { name: string; url: string; draft: (d: Draft) => Draft }[] = [
  { name: "the screening with an emergency notice", url: "/screen", draft: (d) => withAnswer({ ...d, redFlags: [], inquiry: { modules: null, history: [], resolved: [] }, findings: {} }, "RF_A_CHEST_PAIN", "yes") },
];

async function render(lang: "en" | "zh-Hant", url: string, needs: Needs, draft: Draft = finished) {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const t = testStore(env);
  if (needs === "saved") { await t.persistence.putAssessment(saved); await t.persistence.putAssessment(older); }
  if (needs === "draft") {
    t.store.getState().startDraft();
    t.store.getState().updateDraft((d) => ({ ...draft, id: d.id, startedAt: d.startedAt, position: { route: url } }));
  }
  go(`/${lang}${url}`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  await screen.findByRole("heading", { level: 1 }, { timeout: 4000 });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });             // lazy chunks, effects
  return view;
}
const violations = async (container: Element): Promise<string[]> =>
  (await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

describe("axe on every route (WCAG 2.1 A and AA, both languages)", () => {
  for (const lang of ["en", "zh-Hant"] as const) {
    for (const r of ROUTES.filter((x) => !x.dev || IS_DEV_PROFILE)) {
      it(`${r.pattern} · ${lang}`, async () => {
        const { container } = await render(lang, r.url, r.needs);
        expect(window.location.pathname, "a guard redirected: the sweep would be checking another screen").toBe(`/${lang}${r.url}`);
        expect(await violations(container)).toEqual([]);
        expect(document.documentElement.lang).toBe(lang);
        expect(document.title.length).toBeGreaterThan(0);
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(screen.getAllByRole("main")).toHaveLength(1);
      });
    }
    for (const s of STATES) {
      it(`${s.name} · ${lang}`, async () => {
        const { container } = await render(lang, s.url, "draft", s.draft(finished));
        expect(window.location.pathname).toBe(`/${lang}${s.url}`);
        expect(await violations(container)).toEqual([]);
      });
    }
  }
});

describe("the sweep covers every route", () => {
  it("every <Route path> of App.tsx is in the table", () => {
    const source = readFileSync(join(import.meta.dirname, "..", "src", "app", "App.tsx"), "utf8");
    const inApp = [...source.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]!).sort();
    const inTable = ROUTES.map((r) => r.pattern).filter((p) => p !== "*").sort();
    expect(inTable).toEqual(inApp);
    expect(source).toMatch(/<Route><NotFound \/><\/Route>/);                              // the catch-all is the "*" row
  });
});
