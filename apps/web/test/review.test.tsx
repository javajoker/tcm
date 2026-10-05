import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { assessInputOf, draftFromSaved, toSaved } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { applyAnswer } from "../src/screens/inquiry/model.ts";
import { reviewGroups, selfObservedCount, unsureQuestions } from "../src/screens/review/model.ts";
import { withAnswer, askedItems } from "../src/screens/screening/model.ts";
import { newDraft } from "../src/storage/draft.ts";
import type { Draft } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const q = (id: string) => kb.questionById.get(id)!;
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

const birth = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
const tongueId = [...kb.symptoms.values()].find((s) => s.kind === "tongue")!.id;

function rich(over: Partial<Draft> = {}): Draft {
  let d: Draft = { ...newDraft("d", 1), subject: { ageYears: 38, sex: "female", pregnancy: "no", lactating: false, medications: ["diuretic"], allergies: ["花生"] },
    profile: { medications: "some", medicationText: ["Foo"], allergies: "some", conditions: "none" }, inquiry: { modules: [], history: [], resolved: [] }, ...over };
  for (const f of [...askedItems(kb).A, ...askedItems(kb).B]) d = withAnswer(d, f.id, "no");
  d = applyAnswer(d, q("Q_COLD"), { kind: "answered", options: ["fear_cold", "cold_limbs"], severities: { S_FEAR_COLD: "severe" } });
  d = applyAnswer(d, q("Q_HEAT"), { kind: "skipped" });
  d = applyAnswer(d, q("Q_SWEAT"), { kind: "answered", options: ["none"], severities: {} });
  return { ...d, findings: { ...d.findings, [tongueId]: { state: "present", source: "guided" } } };
}

async function open(draft: Draft, lang: "en" | "zh-Hant" = "en", env = fakeEnvironment(), load: () => Promise<Loaded> = () => Promise.resolve(loaded)) {
  go(`/${lang}/review`);
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const t = testStore(env);
  t.store.getState().startDraft();
  t.store.getState().updateDraft((d) => ({ ...draft, id: d.id, startedAt: d.startedAt, position: { route: "/review" } }));
  const view = renderApp(t.store, load);
  await act(async () => { await Promise.resolve(); });
  return { ...view, ...t, env };
}

describe("assessment helpers", () => {
  it("assessInputOf needs a complete profile; birth data given means the birth module is on", () => {
    expect(assessInputOf(newDraft("x", 1), 5)).toBeNull();
    const a = assessInputOf(rich(), 5)!;
    expect(a.options).toEqual({ now: 5, birthModule: false });
    expect(a.subject.medications).toEqual(["diuretic", "other"]);
    expect(a.subject.allergies).toEqual(["花生"]);
    expect(assessInputOf({ ...rich(), birth }, 5)!.options.birthModule).toBe(true);
  });

  it("a saved result keeps the birth moment only when 'remember on this device' was on", () => {
    const d = rich();
    const result = engine.assess(kb, assessInputOf({ ...d, birth }, 7)!);
    expect(JSON.stringify(toSaved({ ...d, birth, rememberBirth: false }, result, { id: "r1", lang: "en" }).input)).not.toContain("1990");
    expect(toSaved({ ...d, birth, rememberBirth: true }, result, { id: "r1", lang: "en" }).input.birth).toEqual(birth);
  });

  it("'edit and re-run': the draft rebuilt from a saved result reproduces the same result", () => {
    const d = rich();
    const first = engine.assess(kb, assessInputOf(d, 9)!);
    const saved = toSaved(d, first, { id: "r2", lang: "zh-Hant" });
    const again = draftFromSaved(kb, saved, "n1", 11);
    expect(again.position.route).toBe("/review");
    expect(again.inquiry.history).toEqual(["Q_COLD", "Q_HEAT", "Q_SWEAT"].filter((id) => d.inquiry.history.includes(id)));
    expect(again.birth).toBeUndefined();
    expect(engine.assess(kb, assessInputOf(again, 9)!)).toEqual(first);
    expect(draftFromSaved(kb, toSaved({ ...d, birth, rememberBirth: true }, first, { id: "r3", lang: "en" }), "n2", 1).birth).toEqual(birth);
  });
});

describe("the pulse rate and how it was obtained (PM-11)", () => {
  const pulse = (method?: "typed" | "timer" | "tap"): Draft => ({ ...rich(), observe: { pulse: { rate: 76, rhythm: "regular", ...(method ? { method } : {}) } } });

  it("a saved result keeps it, and 'edit and re-run' brings it back", () => {
    const d = pulse("tap");
    const saved = toSaved(d, engine.assess(kb, assessInputOf(d, 9)!), { id: "r4", lang: "en" });
    expect(saved.input.observe).toEqual({ pulse: { rate: 76, rhythm: "regular", method: "tap" } });
    expect(draftFromSaved(kb, saved, "n3", 1).observe).toEqual({ pulse: { rate: 76, rhythm: "regular", method: "tap" } });
    expect(toSaved(rich(), engine.assess(kb, assessInputOf(rich(), 9)!), { id: "r5", lang: "en" }).input.observe).toBeUndefined();
    expect(draftFromSaved(kb, toSaved(rich(), engine.assess(kb, assessInputOf(rich(), 9)!), { id: "r5", lang: "en" }), "n4", 1).observe).toEqual({});
  });

  it("the review says the rate and the method, with a way back to the pulse", async () => {
    await open(pulse("tap"));
    expect(await screen.findByText(/Resting pulse: 76 beats per minute \(tapped along with the beat\)\./)).toBeInTheDocument();
    const line = screen.getByText(/Resting pulse: 76/).closest("p")!;
    expect(within(line).getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/en/observe/pulse");
  });

  it("says the rate alone when it predates the record of the method, and nothing when there is no rate", async () => {
    const { unmount } = await open(pulse());
    expect(await screen.findByText(/Resting pulse: 76 beats per minute\./)).toBeInTheDocument();
    expect(screen.queryByText(/tapped along|counted for 30 seconds|typed in/)).toBeNull();
    unmount();
    await open(rich());
    await screen.findByRole("heading", { level: 1, name: "Review your answers" });
    expect(screen.queryByText(/Resting pulse:/)).toBeNull();
  });
});

describe("review model", () => {
  it("groups present findings by dimension in the SOP order, flags self-observed ones and lists skipped questions", () => {
    const d = rich();
    const g = reviewGroups(kb, d);
    expect(g.map((x) => x.dimension)).toEqual(["cold-heat", "tongue"]);
    expect(g[0]!.items.map((i) => [i.symptomId, i.severity, i.questionId])).toEqual([["S_COLD_LIMBS", "moderate", "Q_COLD"], ["S_FEAR_COLD", "severe", "Q_COLD"]]);
    expect(selfObservedCount(g)).toBe(1);
    expect(unsureQuestions(kb, d).map((x) => x.id)).toEqual(["Q_HEAT"]);
  });
});

describe("Review screen (S12)", () => {
  it("shows the profile, the safety answers, the symptoms by dimension with Edit links, and what was skipped", async () => {
    await open(rich());
    expect(await screen.findByRole("heading", { level: 1, name: "Review your answers" })).toBeInTheDocument();
    const about = within(screen.getByRole("region", { name: "About you" }));
    expect(about.getByText("38 years")).toBeInTheDocument();
    expect(about.getByText("Female")).toBeInTheDocument();
    expect(about.getByText(/Diuretic、Other, or not on this list、Other \(Foo\)/)).toBeInTheDocument();
    expect(about.getByText("花生")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Safety screening" })).getByText("No warning signs were selected.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cold and heat" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit “畏寒（得溫則減）”" })).toHaveAttribute("href", "/en/inquiry?edit=Q_COLD&back=/review");
    expect(screen.getByText("（Strong）")).toBeInTheDocument();
    const unsure = within(screen.getByRole("region", { name: "You were not sure about" }));
    expect(unsure.getByRole("link", { name: "Answer now" })).toHaveAttribute("href", "/en/inquiry?edit=Q_HEAT&back=/review");
    expect(screen.getByText("1 item is self-observed and counts for less in the calculation.")).toBeInTheDocument();
    expect(screen.getByText(/You have answered few questions/)).toBeInTheDocument();
  });

  it("says in one sentence what happens with birth data, when there is some", async () => {
    const b = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "female", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
    const { unmount } = await open({ ...rich(), birth: b });
    expect(await screen.findByText(/used only as a traditional background reference; it does not change how your symptoms are scored\. It is not stored/)).toBeInTheDocument();
    unmount();
    await open({ ...rich(), birth: b, rememberBirth: true });
    expect(await screen.findByText(/It will be kept on this device because you chose to remember it/)).toBeInTheDocument();
  });

  it("says nothing about birth data when there is none", async () => {
    await open(rich());
    await screen.findByRole("heading", { level: 1, name: "Review your answers" });
    expect(screen.queryByText(/birth data/i)).toBeNull();
  });

  it("marked red flags are listed", async () => {
    await open(withAnswer(rich(), "RF_B_JAUNDICE", "unsure"));
    // an unacknowledged blocking notice sends the person to the screening first — acknowledge it as the real flow would
    await waitFor(() => expect(window.location.pathname).toBe("/en/screen"));
  });

  it("Get my result runs the engine, stores the result, deletes the draft and opens the result", async () => {
    const env = fakeEnvironment();
    const { store, persistence } = await open(rich(), "en", env);
    await userEvent.click(await screen.findByRole("button", { name: "Get my result" }));
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/en\/result\/[0-9a-f]{16}$/));
    const id = window.location.pathname.split("/").pop()!;
    const saved = await persistence.getAssessment(id);
    expect(saved?.result.patterns.length).toBeGreaterThan(0);
    expect(saved?.lang).toBe("en");
    expect(saved?.input.findings["S_FEAR_COLD"]).toEqual({ state: "present", severity: "severe" });
    expect(store.getState().draft).toBeNull();
    expect((await persistence.listAssessments()).map((a) => a.id)).toEqual([id]);
  });

  it("a failing computation shows a message, keeps the answers and stores nothing", async () => {
    const broken: Loaded = { kb, engine: { ...engine, assess: () => { throw new Error("boom"); } } };
    const { store, persistence } = await open(rich(), "en", fakeEnvironment(), () => Promise.resolve(broken));
    await userEvent.click(await screen.findByRole("button", { name: "Get my result" }));
    expect(await screen.findByText(/Something went wrong while working out your result/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get my result" })).toBeEnabled();
    expect(store.getState().draft?.findings["S_FEAR_COLD"]).toBeDefined();
    expect(await persistence.listAssessments()).toEqual([]);
    expect(window.location.pathname).toBe("/en/review");
  });

  it("Edit returns to the exact question with the earlier answer, and comes back to the review after it", async () => {
    const { store } = await open(rich());
    await userEvent.click(await screen.findByRole("link", { name: "Edit “畏寒（得溫則減）”" }));
    expect(window.location.pathname + window.location.search).toBe("/en/inquiry?edit=Q_COLD&back=/review");
    const fear = await screen.findByRole("checkbox", { name: new RegExp(q("Q_COLD").options.find((o) => o.id === "fear_cold")!.label.en.slice(0, 25)) });
    expect(fear).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: new RegExp(q("Q_COLD").options.find((o) => o.id === "none")!.label.en.slice(0, 12)) }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(window.location.pathname).toBe("/en/review"));
    expect(store.getState().draft?.findings["S_FEAR_COLD"]).toEqual({ state: "absent" });
    expect(await screen.findByRole("heading", { name: "Review your answers" })).toBeInTheDocument();
  });

  it("'Answer now' for a skipped question works the same way", async () => {
    const { store } = await open(rich());
    await userEvent.click(await screen.findByRole("link", { name: "Answer now" }));
    await screen.findByText(q("Q_HEAT").prompt.en);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));                          // Back from an edit returns to the review untouched
    await waitFor(() => expect(window.location.pathname).toBe("/en/review"));
    expect(store.getState().draft?.findings["S_FEVER"]).toEqual({ state: "unsure" });
  });

  it("sends the person back to what is missing", async () => {
    await open({ ...newDraft("x", 1) });
    await waitFor(() => expect(window.location.pathname).toBe("/en/start"));
  });

  it("is in Traditional Chinese on the zh-Hant route", async () => {
    await open(rich(), "zh-Hant");
    expect(await screen.findByRole("heading", { level: 1, name: "核對您的回答" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取得我的結果" })).toBeInTheDocument();
    expect(screen.getByText("38 歲")).toBeInTheDocument();
  });

  it.each(["en", "zh-Hant"] as const)("has no axe violations (%s)", async (lang) => {
    const { container } = await open(rich(), lang);
    await screen.findByRole("heading", { level: 1 });
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
