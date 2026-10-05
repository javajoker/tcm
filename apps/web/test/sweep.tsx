// The fixtures shared by the sweeps that render every route: the accessibility sweep (axe) and the Simplified-Chinese purity sweep. A route is added once, here.
import { act, screen } from "@testing-library/react";
import * as engine from "@tcm/engine";
import { alignedList, chineseStrings, indexKnowledgeBase, newDisplay } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { afterEach } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { withAnswer } from "../src/screens/screening/model.ts";
import type { Draft, SavedAssessment } from "../src/storage/types.ts";
import { dictionary } from "./hans.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview } from "./interview.ts";

const raw = rawChunksFromDisk("dev");
export const kb = indexKnowledgeBase(raw);
/** The same knowledge base with the Simplified display function, built through the real machinery (the aligned list of the bundler, the display object of the loader). */
export const kbHans = ((): ReturnType<typeof indexKnowledgeBase> => {
  const list = chineseStrings(raw.core, raw.formulas, raw.citations, raw.guidance, raw.herbs);
  const display = newDisplay();
  display.add(list, alignedList(list, dictionary));
  return indexKnowledgeBase(raw, display);
})();
export const loaded: Loaded = { kb, engine };
export const loadedHans: Loaded = { kb: kbHans, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

export const finished: Draft = interview(kb, "SP1");
const result = engine.assess(kb, assessInputOf(finished, Date.UTC(2026, 9, 4, 12))!);
const makeSaved = (id: string, createdAt: number): SavedAssessment => ({ ...toSaved(finished, result, { id, lang: "en" }), createdAt });
export const saved = makeSaved("r0123456789abcdef", Date.UTC(2026, 9, 4, 12));
export const older = makeSaved("r1123456789abcdef", Date.UTC(2026, 8, 1, 12));
export const formulaId = (saved.result.recommendations.formulas[0] ?? saved.result.recommendations.studyOnly[0])!.id;

export type Needs = "nothing" | "draft" | "saved";
/** Every route of App.tsx, with what must be stored for it to show its real content. `path` is the route pattern as written in App.tsx. */
export const ROUTES: { pattern: string; url: string; needs: Needs; dev?: true; state?: (d: Draft) => Draft }[] = [
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
export const STATES: { name: string; url: string; draft: (d: Draft) => Draft }[] = [
  { name: "the screening with an emergency notice", url: "/screen", draft: (d) => withAnswer({ ...d, redFlags: [], inquiry: { modules: null, history: [], resolved: [] }, findings: {} }, "RF_A_CHEST_PAIN", "yes") },
];

export async function render(lang: "en" | "zh-Hant" | "zh-Hans", url: string, needs: Needs, draft: Draft = finished, extra: readonly SavedAssessment[] = []) {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const t = testStore(env);
  if (needs === "saved") { await t.persistence.putAssessment(saved); await t.persistence.putAssessment(older); for (const e of extra) await t.persistence.putAssessment(e); }
  if (needs === "draft") {
    t.store.getState().startDraft();
    t.store.getState().updateDraft((d) => ({ ...draft, id: d.id, startedAt: d.startedAt, position: { route: url } }));
  }
  go(`/${lang}${url}`);
  const view = renderApp(t.store, (script) => Promise.resolve(script === "Hans" ? loadedHans : loaded));
  await act(async () => { await Promise.resolve(); });
  await screen.findByRole("heading", { level: 1 }, { timeout: 4000 });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });             // lazy chunks, effects
  return view;
}
