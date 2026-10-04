import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { assessInputOf, draftFromSaved, toSaved } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { answeredCount, cleared, pages, PAGE_SIZE, quizItems, withAnswer } from "../src/screens/constitution/model.ts";
import { buildSummary } from "../src/screens/result/summaryModel.ts";
import type { Draft, SavedAssessment } from "../src/storage/types.ts";
import { createI18n } from "@tcm/i18n";
import { catalogs, type MessageKey } from "../src/i18n/catalogs.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview, screenedDraft } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });
const base = (): Draft => screenedDraft(kb);
const answersFor = (spec: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(spec)) for (const item of kb.constitutionItems.types.find((t) => t.constitution === id)!.items) out[item.id] = item.reverse ? 6 - v : v;
  return out;
};

describe("quiz model", () => {
  it("interleaves the items across the nine types, five per page", () => {
    const items = quizItems(kb);
    expect(items).toHaveLength(37);
    expect(new Set(items.slice(0, 9).map((i) => i.constitution)).size).toBe(9);                 // the first nine items are one of each type
    expect(items.slice(0, PAGE_SIZE).every((i, k, a) => a.findIndex((x) => x.constitution === i.constitution) === k)).toBe(true);   // no page starts with two of one type
    const p = pages(items);
    expect(p.map((x) => x.length)).toEqual([5, 5, 5, 5, 5, 5, 5, 2]);
    expect(new Set(items.map((i) => i.id)).size).toBe(37);
    expect(quizItems(kb).map((i) => i.id)).toEqual(items.map((i) => i.id));                      // a fixed order, not random
  });

  it("answers are kept in the draft and can be cleared", () => {
    let d = withAnswer(base(), "CI_QIXU_1", 4);
    d = withAnswer(d, "CI_QIXU_2", 2);
    expect(answeredCount(d)).toBe(2);
    expect(withAnswer(d, "CI_QIXU_1", 5).constitutionAnswers["CI_QIXU_1"]).toBe(5);
    expect(cleared(d).constitutionAnswers).toEqual({});
  });
});

async function open(path: string, draft: Draft = base(), lang: "en" | "zh-Hant" = "en") {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const t = testStore(env);
  t.store.getState().startDraft();
  t.store.getState().updateDraft((d) => ({ ...draft, id: d.id, startedAt: d.startedAt, position: { route: "/observe" } }));
  go(`/${lang}${path}`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  return { ...view, ...t };
}
const draftOf = (s: { getState: () => { draft: Draft | null } }): Draft => s.getState().draft!;

describe("Constitution quiz (S11)", () => {
  it("states what it is for, pages through the items on a five-point scale, and never names a type", async () => {
    const { store } = await open("/constitution");
    expect(await screen.findByRole("heading", { level: 1, name: "Constitution questionnaire (optional)" })).toBeInTheDocument();
    expect(screen.getByText(/not at today's symptoms. The result is a tendency, not a label/)).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 8/)).toBeInTheDocument();
    const groups = screen.getAllByRole("group").filter((g) => g.tagName === "FIELDSET");
    expect(groups).toHaveLength(5);
    for (const g of groups) expect(within(g).getAllByRole("radio").map((r) => r.closest("label")!.textContent)).toEqual(expect.arrayContaining(["✓Never", "✓Rarely", "✓Sometimes", "✓Often", "✓Always"]));
    expect(document.body.textContent).not.toMatch(/deficiency|stagnation|phlegm|Damp-heat|blood stasis/i);                // the grouping must not lead the answers
    await userEvent.click(within(groups[0]!).getByRole("radio", { name: "Often" }));
    const first = quizItems(kb)[0]!;
    expect(draftOf(store).constitutionAnswers[first.id]).toBe(4);
    expect(screen.getByText(/1 of 37 question answered/)).toBeInTheDocument();
  });

  it("Next and Previous move through the pages; the last page says Done and returns to the optional steps; the answers stay", async () => {
    const { store } = await open("/constitution");
    await userEvent.click(await screen.findByRole("button", { name: "Next page" }));
    expect(screen.getByText(/Page 2 of 8/)).toBeInTheDocument();
    for (let i = 0; i < 6; i++) await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText(/Page 8 of 8/)).toBeInTheDocument();
    expect(screen.getAllByRole("group").filter((g) => g.tagName === "FIELDSET")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByText(/Page 7 of 8/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(window.location.pathname).toBe("/en/observe");
    expect(answeredCount(draftOf(store))).toBe(0);
  });

  it("the whole questionnaire can be skipped, or cleared after answering; skipping records nothing", async () => {
    const { store } = await open("/constitution", withAnswer(base(), "CI_QIXU_1", 3));
    expect(await screen.findByText(/If you skip it, the result will be less personal/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear my answers" }));
    expect(answeredCount(draftOf(store))).toBe(0);
    expect(screen.queryByRole("button", { name: "Clear my answers" })).toBeNull();
    await userEvent.click(screen.getByRole("link", { name: "Skip the whole questionnaire" }));
    expect(window.location.pathname).toBe("/en/observe");
  });

  it("the optional hub shows the questionnaire with its status", async () => {
    await open("/observe", withAnswer(withAnswer(base(), "CI_QIXU_1", 3), "CI_YANGXU_1", 5));
    const card = within(await screen.findByRole("region", { name: "Constitution questionnaire" }));
    expect(card.getByText("2 questions answered")).toBeInTheDocument();
    expect(card.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/en/constitution");
  });

  it("is in Traditional Chinese, and has no axe violations (both languages)", async () => {
    for (const lang of ["en", "zh-Hant"] as const) {
      const { container, unmount } = await open("/constitution", base(), lang);
      await screen.findByRole("heading", { level: 1 });
      if (lang === "zh-Hant") { expect(screen.getByText(/第 1 頁，共 8 頁/)).toBeInTheDocument(); expect(screen.getAllByRole("radio", { name: "經常" }).length).toBe(5); }
      expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      unmount();
    }
  });
});

describe("the constitution in the review and the result", () => {
  const withQuiz = (spec: Record<string, number>): Draft => ({ ...interview(kb, "SP1"), constitutionAnswers: answersFor(spec) });
  const save = (d: Draft, id: string): SavedAssessment => toSaved(d, engine.assess(kb, assessInputOf(d, Date.UTC(2026, 9, 4, 12))!), { id, lang: "en" });

  it("the answers travel with the saved result and come back with 'edit and re-run'", () => {
    const d = withQuiz({ C_YANGXU: 5, C_QIXU: 4 });
    const saved = save(d, "c1");
    expect(saved.input.constitutionAnswers).toEqual(d.constitutionAnswers);
    expect(draftFromSaved(kb, saved, "n", 1).constitutionAnswers).toEqual(d.constitutionAnswers);
    expect(save({ ...d, constitutionAnswers: {} }, "c2").input.constitutionAnswers).toBeUndefined();
    expect(assessInputOf({ ...d, constitutionAnswers: {} }, 1)!.constitutionAnswers).toBeUndefined();
  });

  it("the summary names the tendency (primary and secondary) with its description, as a tendency and not a label", async () => {
    const saved = save(withQuiz({ C_YANGXU: 5, C_QIXU: 4 }), "c3");
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang: "en" }));
    const t = testStore(env);
    await t.persistence.putAssessment(saved);
    go("/en/result/c3");
    renderApp(t.store, () => Promise.resolve(loaded));
    await act(async () => { await Promise.resolve(); });
    const summary = within(await screen.findByRole("region", { name: "Summary" }));
    expect(summary.getByRole("heading", { level: 3, name: "Constitution tendency" })).toBeInTheDocument();
    expect(summary.getByText(/Your answers lean towards “Yang deficiency”/)).toHaveTextContent(/and secondly towards “Qi deficiency”/);
    expect(summary.getByText(kb.constitutionItems.types.find((x) => x.constitution === "C_YANGXU")!.description.en)).toBeInTheDocument();
    expect(summary.getByText(/not a label, and not the present pattern/)).toBeInTheDocument();
    expect(summary.getByText(/Only part of the questionnaire was answered/)).toBeInTheDocument();
    const transmission = within(screen.getByRole("region", { name: "Spread and susceptibility" }));
    expect(transmission.getByRole("heading", { level: 3, name: "Constitution and season" })).toBeInTheDocument();
  });

  it("a skipped quiz leaves no constitution block, and an unclear one says so", async () => {
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang: "en" }));
    const t = testStore(env);
    await t.persistence.putAssessment(save(interview(kb, "SP1"), "c4"));
    await t.persistence.putAssessment(save(withQuiz({ C_QIXU: 2, C_PINGHE: 2 }), "c5"));
    go("/en/result/c4");
    const view = renderApp(t.store, () => Promise.resolve(loaded));
    await act(async () => { await Promise.resolve(); });
    await screen.findByRole("region", { name: "Summary" });
    expect(screen.queryByRole("heading", { name: "Constitution tendency" })).toBeNull();
    view.unmount();
    go("/en/result/c5");
    renderApp(t.store, () => Promise.resolve(loaded));
    await act(async () => { await Promise.resolve(); });
    expect(await screen.findByText("The questionnaire shows no clear constitutional tendency.")).toBeInTheDocument();
  });

  it("the review has a line for the questionnaire and the practitioner summary names the tendency", async () => {
    const saved = save(withQuiz({ C_YANGXU: 5, C_QIXU: 4 }), "c6");
    const t = createI18n<MessageKey>(catalogs, "en");
    const hyp = buildSummary(saved, kb, t).find((s) => s.id === "hypotheses")!;
    expect(hyp.items!.at(-1)).toBe("Constitution tendency: Yang deficiency, Qi deficiency");
    await open("/review", withQuiz({ C_YANGXU: 5 }));
    const card = within(await screen.findByRole("region", { name: "Constitution questionnaire" }));
    expect(card.getByText(/questions answered/)).toBeInTheDocument();
    expect(card.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/en/constitution");
  });
});
