import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase, type Question } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";
import type { Loaded } from "../src/app/knowledge.tsx";
import { KnowledgeProvider } from "../src/app/knowledge.tsx";
import { QuestionCard } from "../src/screens/inquiry/QuestionCard.tsx";
import { applyAnswer, pickNext, type Answer } from "../src/screens/inquiry/model.ts";
import { withAnswer, askedItems } from "../src/screens/screening/model.ts";
import { newDraft } from "../src/storage/draft.ts";
import type { Draft } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const q = (id: string): Question => kb.questionById.get(id)!;
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

const screened = (over: Partial<Draft> = {}, female = false): Draft => {
  let d: Draft = { ...newDraft("d", 1), subject: female ? { ageYears: 30, sex: "female", pregnancy: "no", lactating: false } : { ageYears: 40, sex: "male" },
    profile: { medications: "none", medicationText: [], allergies: "none", conditions: "none" }, ...over };
  for (const f of [...askedItems(kb).A, ...askedItems(kb).B]) d = withAnswer(d, f.id, "no");
  return d;
};

async function open(draft: Draft, lang: "en" | "zh-Hant" = "en", env = fakeEnvironment()): Promise<ReturnType<typeof renderApp> & { env: ReturnType<typeof fakeEnvironment> }> {
  go(`/${lang}/inquiry`);
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const { store } = testStore(env);
  store.getState().startDraft();
  store.getState().updateDraft((d) => ({ ...draft, id: d.id, startedAt: d.startedAt, position: { route: "/inquiry" } }));
  const view = renderApp(store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  return { ...view, env };
}
const text = (id: string, field: "prompt" | "hint" = "prompt", lang: "en" | "zh-Hant" = "en"): string => q(id)[field]![lang];
const optionLabel = (qid: string, oid: string, lang: "en" | "zh-Hant" = "en"): string => q(qid).options.find((o) => o.id === oid)!.label[lang];
const choice = (label: string): HTMLElement => screen.getByRole(/* radio or checkbox */ "checkbox", { name: new RegExp(label.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
const draftOf = (store: { getState: () => { draft: Draft | null } }): Draft => store.getState().draft!;

describe("guards", () => {
  it("an incomplete profile goes back to the profile; an unfinished screening goes back to the screening", async () => {
    await open({ ...newDraft("x", 1) });
    await vi.waitFor(() => expect(window.location.pathname).toBe("/en/start"));
  });
  it("unanswered red flags send the person to the screening", async () => {
    await open({ ...newDraft("x", 1), subject: { ageYears: 40, sex: "male" }, profile: { medications: "none", medicationText: [], allergies: "none", conditions: "none" } });
    await vi.waitFor(() => expect(window.location.pathname).toBe("/en/screen"));
  });
  it("an unacknowledged blocking notice sends the person to the screening", async () => {
    await open(withAnswer(screened(), "RF_B_JAUNDICE", "yes"));
    await vi.waitFor(() => expect(window.location.pathname).toBe("/en/screen"));
  });
});

describe("S06 module chooser", () => {
  it("offers the eight modules to a woman who is not pregnant, seven to a man, plus 'nothing in particular'", async () => {
    await open(screened({}, true));
    await screen.findByRole("heading", { level: 1, name: "What bothers you most right now?" });
    expect(screen.getAllByRole("checkbox").length).toBe(9);
    expect(screen.getByRole("checkbox", { name: /Women's cycle|menstru/i })).toBeInTheDocument();
  });

  it("men do not see the women's-cycle module; Start needs a choice, and 'general' and modules replace each other", async () => {
    const { store } = await open(screened());
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getAllByRole("checkbox").length).toBe(8);
    const start = screen.getByRole("button", { name: "Start the questions" });
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription("Choose at least one.");
    await userEvent.click(screen.getByRole("checkbox", { name: /Sleep/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Nothing in particular/ }));
    expect(screen.getByRole("checkbox", { name: /Sleep/ })).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: /Fatigue/ }));
    expect(screen.getByRole("checkbox", { name: /Nothing in particular/ })).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: /Fatigue/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Sleep/ }));
    await userEvent.click(start);
    expect(draftOf(store).inquiry.modules).toEqual(["sleep"]);
    expect(await screen.findByText(text("Q_HEAT"))).toBeInTheDocument();                      // the chosen modules come first
  });

  it("'nothing in particular' starts a general check with the standard order", async () => {
    const { store } = await open(screened());
    await userEvent.click(await screen.findByRole("checkbox", { name: /Nothing in particular/ }));
    await userEvent.click(screen.getByRole("button", { name: "Start the questions" }));
    expect(draftOf(store).inquiry.modules).toEqual([]);
    expect(await screen.findByText(text("Q_COLD"))).toBeInTheDocument();
  });
});

describe("S07 question card", () => {
  const startGeneral = async (draft = screened()): Promise<ReturnType<typeof open>> => open({ ...draft, inquiry: { modules: [], history: [], resolved: [] } });

  it("shows the plain-language prompt and hint, the options with their TCM terms, and what is left", async () => {
    await startGeneral();
    expect(await screen.findByText(text("Q_COLD"))).toBeInTheDocument();
    expect(screen.getByText(text("Q_COLD", "hint"))).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: new RegExp(optionLabel("Q_COLD", "aversion_cold").slice(0, 25)) })).toBeInTheDocument();
    expect(screen.getByText("惡寒（加衣被仍冷）")).toBeInTheDocument();                          // the term, secondary
    expect(screen.getByRole("progressbar", { name: "Inquiry progress" })).toHaveAttribute("aria-valuetext", expect.stringMatching(/^About \d+ questions? left$/));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
  });

  it("an answer records present (graded: moderate by default, changeable) and absent, then moves on with focus on the new question", async () => {
    const { store } = await startGeneral();
    await userEvent.click(await screen.findByRole("checkbox", { name: new RegExp(optionLabel("Q_COLD", "aversion_cold").slice(0, 25)) }));
    const strength = screen.getByRole("group", { name: /How strong is “惡寒/ });
    expect(within(strength).getByRole("radio", { name: "Moderate" })).toBeChecked();
    await userEvent.click(within(strength).getByRole("radio", { name: "Strong" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    const f = draftOf(store).findings;
    expect(f["S_AVERSION_COLD"]).toEqual({ state: "present", severity: "severe" });
    expect(f["S_FEAR_COLD"]).toEqual({ state: "absent" });
    expect(draftOf(store).inquiry.history).toEqual(["Q_COLD"]);
    const legend = await screen.findByText(text("Q_HEAT"));
    expect(document.activeElement).toBe(legend);
  });

  it("'None of these' and the other options replace each other; exclusive options replace each other with the reason", async () => {
    await startGeneral();
    await screen.findByText(text("Q_COLD"));
    await userEvent.click(choice(optionLabel("Q_COLD", "cold_limbs")));
    await userEvent.click(choice(optionLabel("Q_COLD", "none")));
    expect(choice(optionLabel("Q_COLD", "cold_limbs"))).not.toBeChecked();
    expect(choice(optionLabel("Q_COLD", "none"))).toBeChecked();
    await userEvent.click(choice(optionLabel("Q_COLD", "aversion_cold")));
    expect(choice(optionLabel("Q_COLD", "none"))).not.toBeChecked();
    await userEvent.click(choice(optionLabel("Q_COLD", "fear_cold")));                         // the other kind of "cold": exclusive with the first
    expect(choice(optionLabel("Q_COLD", "aversion_cold"))).not.toBeChecked();
    expect(choice(optionLabel("Q_COLD", "fear_cold"))).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(/We changed your choice: Aversion to cold/);
  });

  it("'Not sure / skip' records the symptoms as unsure and moves on; the question is not asked again", async () => {
    const { store } = await startGeneral();
    await screen.findByText(text("Q_COLD"));
    await userEvent.click(screen.getByRole("button", { name: "Not sure / skip" }));
    expect(draftOf(store).findings["S_AVERSION_COLD"]).toEqual({ state: "unsure" });
    expect(await screen.findByText(text("Q_HEAT"))).toBeInTheDocument();
    expect(screen.queryByText(text("Q_COLD"))).toBeNull();
  });

  it("Back shows the earlier answer for editing and Next then walks forward again; Back at the first question returns to the chooser", async () => {
    const { store } = await startGeneral();
    await userEvent.click(await screen.findByRole("checkbox", { name: new RegExp(optionLabel("Q_COLD", "fear_cold").slice(0, 25)) }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText(text("Q_HEAT"));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText(text("Q_COLD"))).toBeInTheDocument();
    expect(choice(optionLabel("Q_COLD", "fear_cold"))).toBeChecked();
    await userEvent.click(choice(optionLabel("Q_COLD", "none")));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(draftOf(store).findings["S_FEAR_COLD"]).toEqual({ state: "absent" });
    expect(await screen.findByText(text("Q_HEAT"))).toBeInTheDocument();                       // forward again, to the next unanswered question
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { level: 1, name: "What bothers you most right now?" })).toBeInTheDocument();
  });

  it("'Why am I asked this?' explains without naming a pattern", async () => {
    await open({ ...screened(), inquiry: { modules: ["sleep"], history: [], resolved: [] } });
    await screen.findByText(text("Q_HEAT"));
    await userEvent.click(screen.getByRole("button", { name: "Why am I asked this?" }));
    expect(screen.getByRole("note")).toHaveTextContent("You chose “Sleep”, so we ask about it first.");
  });

  it("the rail lists what is recorded, grouped, with no pattern names", async () => {
    const d = applyAnswer({ ...screened(), inquiry: { modules: [], history: [], resolved: [] } }, q("Q_COLD"), { kind: "answered", options: ["fear_cold"], severities: {} });
    await open(d);
    const rail = await screen.findByRole("complementary", { name: "What we have recorded" });
    expect(within(rail).getByText("Cold and heat")).toBeInTheDocument();
    expect(within(rail).getByText("畏寒（得溫則減）")).toBeInTheDocument();
  });

  it("a reload mid-inquiry resumes at the next question with every answer intact (E12)", async () => {
    const env = fakeEnvironment();
    const first = await startGeneral();
    first.unmount();
    const a = testStore(env);
    a.store.getState().startDraft();
    let d: Draft = { ...screened(), inquiry: { modules: [], history: [], resolved: [] } };
    d = applyAnswer(d, q("Q_COLD"), { kind: "answered", options: ["fear_cold"], severities: {} });
    a.store.getState().updateDraft((x) => ({ ...d, id: x.id, startedAt: x.startedAt, position: { route: "/inquiry" } }));
    await a.store.flush();
    go("/en/inquiry");
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang: "en" }));
    renderApp(testStore(env).store, () => Promise.resolve(loaded));
    expect(await screen.findByText(text("Q_HEAT"))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(choice(optionLabel("Q_COLD", "fear_cold"))).toBeChecked();
  });
});

describe("single-choice auto-advance", () => {
  const one = kb.questions.find((x) => x.select === "one" && x.graded.length === 0)!;
  const props = (autoAdvance: boolean, onSubmit: (a: Answer) => void) => ({ kb, question: one, initial: null, reason: null, modules: [], left: 3, coverage: 0.2, autoAdvance, canBack: true, focusOnArrival: false, onSubmit, onBack: () => undefined });
  const wrap = (ui: React.ReactNode): React.ReactNode => <I18nProvider lang="en" setLang={() => undefined}><KnowledgeProvider load={() => Promise.resolve(loaded)}>{ui}</KnowledgeProvider></I18nProvider>;

  it("moves on right after the choice when it is on", async () => {
    const onSubmit = vi.fn();
    render(wrap(<QuestionCard {...props(true, onSubmit)} />));
    expect(screen.getByText(/we move on automatically/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("radio")[0]!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ kind: "answered" });
  });

  it("waits for Next when it is off", async () => {
    const onSubmit = vi.fn();
    render(wrap(<QuestionCard {...props(false, onSubmit)} />));
    expect(screen.queryByText(/we move on automatically/)).toBeNull();
    await userEvent.click(screen.getAllByRole("radio")[0]!);
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("contradictions", () => {
  it("are followed up with the reason and a choice — never a silent pick", async () => {
    const d: Draft = { ...screened(), inquiry: { modules: [], history: ["Q_COLD"], resolved: [] }, findings: { S_AVERSION_COLD: { state: "present" }, S_FEAR_COLD: { state: "present" } } };
    const { store } = await open(d);
    expect(await screen.findByRole("heading", { name: "Let's double-check" })).toBeInTheDocument();
    expect(screen.getByText(/different; choose the one that fits/)).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: /Only “畏寒/ }));
    await userEvent.click(confirm);
    expect(draftOf(store).findings["S_AVERSION_COLD"]).toEqual({ state: "absent" });
    expect(draftOf(store).inquiry.resolved.length).toBe(1);
    expect(screen.queryByRole("heading", { name: "Let's double-check" })).toBeNull();
  });

  it("'possible together' contradictions offer 'both are true'", async () => {
    const d: Draft = { ...screened(), inquiry: { modules: [], history: ["Q_SWEAT"], resolved: [] }, findings: { S_NO_SWEAT: { state: "present" }, S_SPONTANEOUS_SWEAT: { state: "present" } } };
    const { store } = await open(d);
    await userEvent.click(await screen.findByRole("radio", { name: "Both are true (in different situations)" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(draftOf(store).findings["S_NO_SWEAT"]).toEqual({ state: "present" });
    expect(draftOf(store).findings["S_SPONTANEOUS_SWEAT"]).toEqual({ state: "present" });
  });
});

describe("the end of the inquiry", () => {
  /** A draft whose answers already satisfy the stop rule (a typical patient, every question answered). */
  const finished = (stopAt: "enough" | "all"): Draft => {
    let d: Draft = { ...screened(), inquiry: { modules: [], history: [], resolved: [] } };
    d = applyAnswer(d, q("Q_COURSE"), { kind: "answered", options: [q("Q_COURSE").options.find((o) => o.context?.course === "chronic")!.id], severities: {} });
    const patient = new Set(Object.entries(kb.patternById.get("SP1")!.weights).filter(([s, w]) => w >= 2 && s.startsWith("S_")).map(([s]) => s));   // the typical 脾氣虛 patient
    for (let i = 0; i < 60; i++) {
      const n = pickNext(kb, d)!;
      if (n.suggestion === null || (stopAt === "enough" && n.done === "enough")) break;
      const question = kb.questionById.get(n.suggestion.questionId)!;
      const chosen = question.options.filter((o) => !o.none && !o.context && o.symptoms.length > 0 && o.symptoms.every((s) => patient.has(s))).map((o) => o.id);
      d = applyAnswer(d, question, { kind: "answered", options: chosen.length > 0 ? chosen : [question.options.find((o) => o.none)?.id ?? question.options[0]!.id], severities: {} });
    }
    return d;
  };

  it("says honestly that there is enough for a first result, and offers to answer more", async () => {
    const d = finished("enough");
    expect(pickNext(kb, d)?.done).toBe("enough");
    const { store } = await open(d);
    expect(await screen.findByRole("heading", { name: "We have enough for a first result" })).toBeInTheDocument();
    const before = draftOf(store).inquiry.history.length;
    await userEvent.click(screen.getByRole("button", { name: "Answer a few more" }));
    expect(screen.queryByRole("heading", { name: "We have enough for a first result" })).toBeNull();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(draftOf(store).inquiry.history.length).toBe(before);
  });

  it("continues to the next step", async () => {
    await open(finished("enough"));
    await userEvent.click(await screen.findByRole("button", { name: "Finish the questions and continue" }));
    expect(window.location.pathname).toBe("/en/observe");
  });

  it("when everything is answered there is nothing more to offer", async () => {
    const d = finished("all");
    expect(pickNext(kb, d)?.done).not.toBeNull();
    await open(d);
    await screen.findByRole("button", { name: "Finish the questions and continue" });
    expect(screen.queryByRole("button", { name: "Answer a few more" })).toBeNull();
  });
});

describe("accessibility and language", () => {
  it.each(["en", "zh-Hant"] as const)("has no axe violations on the chooser and on a question with its severity step (%s)", async (lang) => {
    const { container } = await open(screened(), lang);
    await screen.findByRole("heading", { level: 1 });
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await userEvent.click(screen.getAllByRole("checkbox").at(-1)!);                              // general check
    await userEvent.click(screen.getAllByRole("button").find((b) => b.className.includes("primary") || /開始問診|Start the questions/.test(b.textContent ?? ""))!);
    await screen.findByText(text("Q_COLD", "prompt", lang));
    await userEvent.click(screen.getByRole("checkbox", { name: new RegExp(optionLabel("Q_COLD", "aversion_cold", lang).slice(0, 8)) }));
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  it("speaks Traditional Chinese on the zh-Hant route", async () => {
    await open({ ...screened(), inquiry: { modules: [], history: [], resolved: [] } }, "zh-Hant");
    expect(await screen.findByText(text("Q_COLD", "prompt", "zh-Hant"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "不確定／略過" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "問診進度" })).toHaveAttribute("aria-valuetext", expect.stringMatching(/^約剩 \d+ 題$/));
  });
});

void fireEvent;
