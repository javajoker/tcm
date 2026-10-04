import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import type { Draft, SavedAssessment } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview, screenedDraft } from "./interview.ts";

const devKb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const relKb = indexKnowledgeBase(rawChunksFromDisk("release"));
const dev: Loaded = { kb: devKb, engine };
const rel: Loaded = { kb: relKb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

function save(loaded: Loaded, draft: Draft, id = "r0123456789abcdef", over: Partial<SavedAssessment> = {}): SavedAssessment {
  const result = engine.assess(loaded.kb, assessInputOf(draft, Date.UTC(2026, 9, 4, 12))!);
  return { ...toSaved(draft, result, { id, lang: "en" }), ...over };
}

async function open(saved: SavedAssessment | null, loaded: Loaded, lang: "en" | "zh-Hant" = "en", id = saved?.id ?? "nope") {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const t = testStore(env);
  if (saved) await t.persistence.putAssessment(saved);
  go(`/${lang}/result/${id}`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  return { ...view, ...t, env };
}

describe("Result report (S13), part 1", () => {
  const sp1 = interview(devKb, "SP1");
  const saved = save(dev, sp1);

  it("the typical spleen-qi-deficiency patient gets that pattern, confidence, direction of care and formulas", () => {
    expect(saved.result.verdict.status).toBe("established");
    expect(saved.result.verdict.patterns[0]!.id).toBe("SP1");
    expect(saved.result.recommendations.formulas.length + saved.result.recommendations.studyOnly.length).toBeGreaterThan(0);
  });

  it("shows the sections in order: safety and scope, summary, advice, when to see a practitioner, your data, with the disclaimer at the end", async () => {
    await open(saved, dev);
    expect(await screen.findByRole("heading", { level: 1, name: "Your result" })).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Safety and scope", "Summary", "Advice", "When to see a doctor or a practitioner", "Your data"]);
    expect(screen.getByText(/for education and self-understanding only/)).toBeInTheDocument();
    expect(screen.getByText(/Computed .*knowledge base .*engine 0\.1\.0/)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Sections of this page" })).toBeInTheDocument();
  });

  it("the summary names the leading pattern in both languages, its direction of care and the confidence in words and as a meter", async () => {
    await open(saved, dev);
    const summary = within(await screen.findByRole("region", { name: "Summary" }));
    const sp = devKb.patternById.get("SP1")!;
    expect(summary.getByText("Most consistent with")).toBeInTheDocument();
    expect(summary.getByText(sp.name.en)).toBeInTheDocument();
    expect(summary.getByText(sp.name["zh-Hant"])).toHaveAttribute("lang", "zh-Hant");
    expect(summary.getByText(sp.principle)).toBeInTheDocument();
    expect(summary.getAllByText("中").length).toBeGreaterThan(0);                                         // Chinese-only prose is marked in the English UI
    expect(summary.getByRole("progressbar", { name: "Confidence" })).toBeInTheDocument();
    expect(summary.getByRole("progressbar", { name: "Confidence" }).getAttribute("aria-valuetext")).toMatch(/^(High|Medium|Low)$/);
  });

  it("each recommended formula is a card: name, tier, match in words, composition by role, cautions, a citation chip and a link to its detail", async () => {
    await open(saved, dev);
    const advice = within(await screen.findByRole("region", { name: "Advice" }));
    const f = (saved.result.recommendations.formulas[0] ?? saved.result.recommendations.studyOnly[0])!;
    const rec = devKb.formulas.get(f.id)!;
    const card = within(advice.getByRole("heading", { level: 4, name: new RegExp(rec.name.en!.split(" ")[0]!) }).closest("section")!);
    expect(card.getByText(/^Tier [ABC]$/)).toBeInTheDocument();
    expect(card.getByText(/^Match: (good|moderate|partial)$/)).toBeInTheDocument();
    expect(card.getByText(`Source: 《${rec.source.book}》`)).toBeInTheDocument();
    expect(card.getByText("Composition (sovereign, minister, assistant, envoy)")).toBeInTheDocument();
    expect(card.getByText(/Corrects \d+% of the deviation/)).toBeInTheDocument();
    expect(card.getByText(/formulas must be set by a licensed practitioner|Formulas must be set by a licensed practitioner/i)).toBeInTheDocument();
    expect(card.getByRole("link", { name: /Open details/ })).toHaveAttribute("href", `/en/result/${saved.id}/formula/${f.id}`);
    expect(card.getAllByRole("button", { name: /Open source/ }).length).toBeGreaterThan(0);
  });

  it("diet, acupressure, lifestyle and the general regimen follow, with citations that open the sheet", async () => {
    await open(saved, dev);
    expect(await screen.findByRole("heading", { level: 3, name: "Diet (food as medicine)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Acupressure" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Lifestyle and season" })).toBeInTheDocument();
    const chip = screen.getAllByRole("button", { name: /Open source/ }).at(-1)!;
    await userEvent.click(chip);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(document.activeElement).toBe(chip);
  });

  it("a release bundle result shows tier A only, no study formulas and no amounts, and says the content is a draft", async () => {
    const r = save(rel, interview(relKb, "SP1"), "r1111111111111111");
    expect(r.result.recommendations.studyOnly).toEqual([]);
    expect(JSON.stringify(r.result)).not.toMatch(/typicalG|classicalAmount/);
    await open(r, rel);
    await screen.findByRole("heading", { level: 1, name: "Your result" });
    expect(screen.queryByText("For study — not a recommendation")).toBeNull();
    expect(screen.getByText("Draft content: not yet reviewed by a qualified practitioner.")).toBeInTheDocument();
  });

  it("an acknowledged blocking notice is kept as one collapsed line that expands to its text", async () => {
    const d = screenedDraft(relKb, { ageYears: 30, sex: "female", pregnancy: "possible", lactating: false });
    const r = save(rel, interview(relKb, "SP1", d), "r2222222222222222");
    await open(r, rel);
    const line = await screen.findByText("Please talk to your doctor first during pregnancy");
    expect(line.closest("details")).not.toHaveAttribute("open");
    await userEvent.click(line);
    expect(line.closest("details")).toHaveAttribute("open");
    expect(within(line.closest("details")!).getByText(/Many herbs and acupressure points should be avoided in pregnancy/)).toBeInTheDocument();
    expect(r.result.recommendations.formulas).toEqual([]);                                                // pregnancy: no formulas at all (E4)
    expect(screen.getByText("Some advice is not shown because of your situation (see “Safety and scope” above).")).toBeInTheDocument();
  });

  it("what was not shown and why is listed on request", async () => {
    const d = screenedDraft(devKb, { ageYears: 40, sex: "female", pregnancy: "no", lactating: false, medications: ["anticoagulant"] }, { profile: { medications: "some", medicationText: [], allergies: "none", conditions: "none" } });
    const r = save(rel, interview(relKb, "EX1", { ...d, inquiry: { modules: [], history: [], resolved: [] } }), "r3333333333333333");
    await open(r, rel);
    await screen.findByRole("heading", { level: 1, name: "Your result" });
    expect(screen.getByText(/The medicine you listed \(Anticoagulant \/ antiplatelet\) may interact with some herbs/)).toBeInTheDocument();
    if (r.result.suppressed.length > 0) {
      await userEvent.click(screen.getByRole("button", { name: "Why?" }));
      expect(screen.getAllByRole("listitem").some((li) => /^(Formula|Food|Acupoint|Herb)/.test(li.textContent ?? ""))).toBe(true);
    }
  });

  it("insufficient information shows what is missing and offers to answer more (the inputs come back as a new draft)", async () => {
    const thin = screenedDraft(devKb);
    const r = save(dev, thin, "r4444444444444444");
    expect(r.result.verdict.status).toBe("insufficient");
    const { store } = await open(r, dev);
    const summary = within(await screen.findByRole("region", { name: "There is not enough information yet for a leaning" }));
    expect(summary.getAllByRole("listitem").length).toBeGreaterThan(0);
    await userEvent.click(summary.getByRole("button", { name: "Answer more questions" }));
    expect(window.location.pathname).toBe("/en/inquiry");
    expect(store.getState().draft?.subject.sex).toBe("female");
    expect(screen.queryByText("Most consistent with")).toBeNull();
  });

  it("'Edit and re-run' rebuilds a draft from the saved inputs and opens the review", async () => {
    const { store } = await open(saved, dev);
    await userEvent.click(await screen.findByRole("button", { name: "Edit and re-run" }));
    expect(window.location.pathname).toBe("/en/review");
    expect(store.getState().draft?.findings).toEqual(saved.input.findings);
    expect(store.getState().draft?.id).not.toBe(saved.id);
  });

  it("a result computed with another knowledge-base version says so; an unknown id says it cannot be found", async () => {
    await open({ ...saved, kbVersion: "an-older-version" }, dev);
    expect(await screen.findByText(/computed with an older version of the knowledge base/)).toBeInTheDocument();
  });

  it("an unknown id is a friendly page, not an error", async () => {
    await open(null, dev, "en", "does-not-exist");
    expect(await screen.findByRole("heading", { level: 1, name: "We couldn't find this result" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the start" })).toBeInTheDocument();
  });

  it("is in Traditional Chinese on the zh-Hant route", async () => {
    await open(saved, dev, "zh-Hant");
    expect(await screen.findByRole("heading", { level: 1, name: "評估結果" })).toBeInTheDocument();
    expect(screen.getByText("最符合")).toBeInTheDocument();
    expect(screen.getAllByText(devKb.patternById.get("SP1")!.name["zh-Hant"]).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 2, name: "何時該看醫師或中醫師" })).toBeInTheDocument();
  });

  it.each(["en", "zh-Hant"] as const)("has no axe violations (%s)", async (lang) => {
    const { container } = await open(saved, dev, lang);
    await screen.findByRole("heading", { level: 1 });
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

