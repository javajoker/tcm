import { act, screen, within } from "@testing-library/react";
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
import { interview } from "./interview.ts";

const devKb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const relKb = indexKnowledgeBase(rawChunksFromDisk("release"));
const dev: Loaded = { kb: devKb, engine };
const rel: Loaded = { kb: relKb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

const save = (loaded: Loaded, d: Draft, id: string): SavedAssessment => ({ ...toSaved(d, engine.assess(loaded.kb, assessInputOf(d, 1_700_000_000_000)!), { id, lang: "en" }) });

async function open(saved: SavedAssessment, fid: string, loaded: Loaded, lang: "en" | "zh-Hant" = "en") {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const t = testStore(env);
  await t.persistence.putAssessment(saved);
  go(`/${lang}/result/${saved.id}/formula/${fid}`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  return view;
}
const firstOf = (s: SavedAssessment) => (s.result.recommendations.formulas[0] ?? s.result.recommendations.studyOnly[0])!;

describe("Formula detail (S14)", () => {
  const sp1 = save(dev, interview(devKb, "SP1"), "f1111111111111111");
  const f = firstOf(sp1);
  const rec = devKb.formulas.get(f.id)!;

  it("shows the name in both languages, tier, source with a citation chip, and what was verified", async () => {
    await open(sp1, f.id, dev);
    expect(await screen.findByRole("heading", { level: 1, name: new RegExp(rec.name.en!.split(" ")[0]!) })).toHaveTextContent(rec.name["zh-Hant"]);
    expect(screen.getByText(`Tier ${f.tier}`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Source: 《${rec.source.book}》`))).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Verification" })).toHaveTextContent(/checked against|partly checked/);
    expect(screen.getByText("Proportions are the textbook-typical ones, not the amounts of the original text.")).toBeInTheDocument();
  });

  it("the composition is a table by role with the share of each herb; amounts appear in the dev profile only", async () => {
    await open(sp1, f.id, dev);
    const table = within(await screen.findByRole("table", { name: "Composition and proportions (sovereign, minister, assistant, envoy)" }));
    expect(table.getAllByRole("row").length).toBe(f.composition.length + 1);
    expect(table.getAllByText(/^Sovereign$|^Minister$|^Assistant$|^Envoy$/).length).toBe(f.composition.length);
    expect(table.getByRole("columnheader", { name: "Amount" })).toBeInTheDocument();           // dev: dosage references allowed
    expect(table.getAllByText(/^about \d+(\.\d+)? g$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Sovereign: aims at the main disorder/)).toBeInTheDocument();
  });

  it("a release result has no amounts and no modification section", async () => {
    const r = save(rel, interview(relKb, "SP1"), "f2222222222222222");
    const rf = firstOf(r);
    await open(r, rf.id, rel);
    const table = within(await screen.findByRole("table", { name: /^Composition and proportions/ }));
    expect(table.queryByRole("columnheader", { name: "Amount" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/about \d+(\.\d+)? g\b/);
    expect(screen.queryByRole("region", { name: /^Modifications/ })).toBeNull();
    expect(JSON.stringify(rf.composition)).not.toMatch(/typicalG|classicalAmount/);
  });

  it("how it fits you: match in words, matched and unmatched symptoms, and what it may burden", async () => {
    await open(sp1, f.id, dev);
    const fit = within(await screen.findByRole("region", { name: "How it fits you" }));
    expect(fit.getByText(/^Match: (good|moderate|partial)$/)).toBeInTheDocument();
    expect(fit.getByText(/Corrects \d+% of the deviation/)).toBeInTheDocument();
    if (f.fit.matched.length > 0) expect(fit.getByText(/It addresses these symptoms of yours:/).parentElement).toHaveTextContent("✓");
    expect(fit.getByRole("heading", { name: "What it may burden" })).toBeInTheDocument();
  });

  it("rationale with citation chips; cautions, pregnancy statement and interactions in words; the practitioner line", async () => {
    await open(sp1, f.id, dev);
    const rationale = within(await screen.findByRole("region", { name: "Rationale and basis" }));
    expect(rationale.getByText(rec.rationale_zh)).toBeInTheDocument();
    if (rec.rationale_citations.length > 0) expect(rationale.getAllByRole("button", { name: /Open source/ }).length).toBeGreaterThan(0);
    const cautions = within(screen.getByRole("region", { name: "Cautions and contraindications" }));
    expect(cautions.getByText(/pregnancy/i)).toBeInTheDocument();
    for (const c of rec.cautions) expect(cautions.getByText(c)).toBeInTheDocument();
    if (rec.interactions.length > 0) expect(cautions.getByText("May interact with:")).toBeInTheDocument();
    expect(cautions.getByText(/must be set by a licensed practitioner/)).toBeInTheDocument();
  });

  it("modifications (dev): classical ones first, then the adjustment for the person as a before/after table, always 'for discussion'", async () => {
    const withMods = [sp1.result.recommendations.formulas, sp1.result.recommendations.studyOnly].flat().find((x) => x.classicalModifications.length > 0 || x.residualModification !== null);
    expect(withMods, "SP1's typical patient gets a modification for at least one formula").toBeDefined();
    await open(sp1, withMods!.id, dev);
    const mod = within(await screen.findByRole("region", { name: "Modifications (for discussion with a practitioner)" }));
    if (withMods!.classicalModifications.length > 0) expect(mod.getByRole("heading", { name: "Classical modifications" })).toBeInTheDocument();
    if (withMods!.residualModification) {
      expect(mod.getByRole("heading", { name: "Adjusted for your situation" })).toBeInTheDocument();
      expect(mod.getByRole("table", { name: "Before and after" })).toBeInTheDocument();
    }
    expect(mod.getByText("These adjustments are for discussion with a practitioner; they are not a prescription.")).toBeInTheDocument();
  });

  it("a study-only formula says why it is tier C, in the page language", async () => {
    const ex1 = save(dev, interview(devKb, "EX1"), "f3333333333333333");
    const c = [ex1.result.recommendations.formulas, ex1.result.recommendations.studyOnly].flat().find((x) => x.tier === "C");
    if (c === undefined) return;                                   // nothing of tier C for this patient: nothing to check
    await open(ex1, c.id, dev);
    expect(await screen.findByText("Contains strong or harsh herbs — for study only")).toBeInTheDocument();
    expect(screen.getByText(/^Contains a strong herb: /)).toBeInTheDocument();
  });

  it("a formula that is not part of the result is not shown, whatever the address says", async () => {
    const other = devKb.formulas.get([...devKb.formulas.keys()].find((id) => ![...sp1.result.recommendations.formulas, ...sp1.result.recommendations.studyOnly].some((x) => x.id === id))!)!;
    await open(sp1, other.id, dev);
    expect(await screen.findByText("This formula is not part of the advice in this result, so its details are not shown.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to the result" })).toHaveAttribute("href", `/en/result/${sp1.id}`);
  });

  it("is in Traditional Chinese on the zh-Hant route and has no axe violations (both languages)", async () => {
    await open(sp1, f.id, dev, "zh-Hant");
    expect(await screen.findByRole("heading", { level: 2, name: "和您的關係" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回到結果" })).toBeInTheDocument();
  });

  it.each(["en", "zh-Hant"] as const)("axe (%s)", async (lang) => {
    const { container } = await open(sp1, f.id, dev, lang);
    await screen.findByRole("heading", { level: 1 });
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
