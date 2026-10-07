// The personalised prescription in the app (PM-41): made with the saved record where the build can make one, shown on the formula page and in the practitioner
// summary as it was made, carried through a backup, and absent wherever the knowledge base has no herb records (every release build).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { act, screen, within } from "@testing-library/react";
import * as engine from "@tcm/engine";
import { createI18n } from "@tcm/i18n";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { afterEach, describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { attachPrescription } from "../src/app/prescription.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { catalogs, type MessageKey } from "../src/i18n/catalogs.ts";
import { rxI18n } from "../src/prescription/catalog.ts";
import { prescriptionOf, withPrescription } from "../src/prescription/compute.ts";
import { prescriptionFile, prescriptionSection } from "../src/prescription/summary.ts";
import { rxView } from "../src/prescription/view.ts";
import { summaryData } from "../src/screens/result/summaryData.ts";
import { defaultOptions, FILE_SECTIONS, summaryFile, type SummaryFile } from "../src/screens/result/summaryFile.ts";
import { validateAssessment } from "../src/storage/backup/validate.ts";
import type { Draft, SavedAssessment } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview } from "./interview.ts";

const devKb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const relKb = indexKnowledgeBase(rawChunksFromDisk("release"));
const dev: Loaded = { kb: devKb, engine };
const rel: Loaded = { kb: relKb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

const save = (loaded: Loaded, d: Draft, id: string): SavedAssessment => toSaved(d, engine.assess(loaded.kb, assessInputOf(d, 1_700_000_000_000)!), { id, lang: "en" });
const tOf = (lang: "en" | "zh-Hant" | "zh-Hans") => createI18n<MessageKey>(catalogs, lang);

async function open(saved: SavedAssessment, path: string, loaded: Loaded, lang: "en" | "zh-Hant" = "en") {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const t = testStore(env);
  await t.persistence.putAssessment(saved);
  go(`/${lang}${path}`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  return view;
}

describe("making it with the saved record", () => {
  it("a development build keeps the prescription of the recommended formula with the record; it is the engine's own, made from the record's inputs", async () => {
    const saved = save(dev, interview(devKb, "SP1"), "rx11111111111111");
    const withRx = await attachPrescription(devKb, saved);
    expect(withRx.prescription).toBeDefined();
    expect(withRx.prescription!.base.formula).toBe(saved.result.recommendations.formulas.find((r) => !r.studyOnly)!.id);
    expect(withRx.prescription).toEqual(prescriptionOf(devKb, saved));
    expect({ ...withRx, prescription: undefined }).toEqual({ ...saved, prescription: undefined });
    expect(withRx.result).toBe(saved.result);                                // the result is untouched
  });

  it("nothing where the knowledge base has no herb records (a release build)", async () => {
    const saved = save(rel, interview(relKb, "SP1"), "rx22222222222222");
    expect(relKb.prescription).toBeNull();
    expect(prescriptionOf(relKb, saved)).toBeNull();
    expect(await attachPrescription(relKb, saved)).toBe(saved);
  });
});

describe("the card on the formula page", () => {
  const saved = withPrescription(devKb, save(dev, interview(devKb, "SP1"), "rx33333333333333"));
  const p = saved.prescription!;

  it("shows the changes, the composition with grams, what adjusted each, the practitioner's judgement and the draft status — in English", async () => {
    await open(saved, `/result/${saved.id}/formula/${p.base.formula}`, dev);
    const card = within(await screen.findByRole("region", { name: "Modifications for this person (for a practitioner)" }));
    expect(card.getByText(/for a licensed practitioner's judgement only/)).toBeInTheDocument();
    expect(card.getByText(/drafts that no practitioner or pharmacist has reviewed/)).toBeInTheDocument();
    const table = within(card.getByRole("table", { name: "The composition after modification, with quantities" }));
    expect(table.getAllByRole("row").length).toBe(p.composition.length + 1);
    expect(table.getAllByText(/^\d+(\.\d+)? g$/).length).toBe(p.composition.length);
    expect(table.getAllByText(/deviation ×/).length).toBe(p.composition.length);            // severity adjusts every herb
    expect(card.getByText(/do not make it up yourself from this page/)).toBeInTheDocument();
  });

  it("speaks Traditional Chinese with the same facts", async () => {
    await open(saved, `/result/${saved.id}/formula/${p.base.formula}`, dev, "zh-Hant");
    const card = within(await screen.findByRole("region", { name: "因人加減（供中醫師參考）" }));
    const table = within(card.getByRole("table", { name: "加減後的組成與份量" }));
    expect(table.getAllByText(/^\d+(\.\d+)? 克$/).length).toBe(p.composition.length);
    expect(card.getByText(/請不要依照本頁自行配藥/)).toBeInTheDocument();
  });

  it("is absent on another formula's page", async () => {
    const other = saved.result.recommendations.formulas.find((r) => r.id !== p.base.formula)!;
    expect(other).toBeDefined();
    await open(saved, `/result/${saved.id}/formula/${other.id}`, dev);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("region", { name: "Modifications for this person (for a practitioner)" })).toBeNull();
  });

  it("is absent for a record without a prescription", async () => {
    const plain = save(dev, interview(devKb, "SP1"), "rx44444444444444");
    await open(plain, `/result/${plain.id}/formula/${p.base.formula}`, dev);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("region", { name: "Modifications for this person (for a practitioner)" })).toBeNull();
  });

  it("every text of the card exists in all three languages: no message key is ever shown", () => {
    for (const lang of ["en", "zh-Hant", "zh-Hans"] as const) {
      const v = rxView(p, devKb, tOf(lang), rxI18n(lang));
      const texts = [v.title, v.intro, v.draft, v.base, v.footer, v.version, ...v.changes, ...v.cautions, ...v.why, ...v.rows.flatMap((r) => [r.role, r.herb, r.grams, r.range, r.why])];
      for (const s of texts) expect(s, `${lang}: ${s}`).not.toMatch(/\brx\.[a-z]/);
    }
  });

  it("a withheld prescription says why, and lists nothing", () => {
    const f = devKb.formulas.get(p.base.formula)!;
    const jun = devKb.herbs!.get(f.composition.find((c) => c.role === "君")!.herb)!;
    const allergic = { ...saved.input, subject: { ...saved.input.subject, allergies: [jun.name["zh-Hant"]] }, profile: { ...saved.input.profile, allergies: "some" as const } };
    const q = prescriptionOf(devKb, { ...saved, input: allergic })!;
    expect(q.withheld).toEqual({ herb: jun.id, rule: "yinren.allergy" });
    const v = rxView(q, devKb, tOf("en"), rxI18n("en"));
    expect(v.withheld).toMatch(/is the sovereign herb of this formula, and it matches an allergy you listed/);
    expect(v.rows).toEqual([]);
  });
});

describe("the practitioner summary", () => {
  const saved = withPrescription(devKb, save(dev, interview(devKb, "HT1"), "rx55555555555555"));
  const p = saved.prescription!;

  it("the page and the text copy get a section with the same table as the card", () => {
    const s = prescriptionSection(saved, devKb, tOf("en"))!;
    expect(s.title).toBe("Modifications for this person (for a practitioner)");
    expect(s.table!.rows.length).toBe(p.composition.length);
    expect(s.items![0]).toMatch(/^Starting from /);
    expect(prescriptionSection(save(dev, interview(devKb, "HT1"), "rx66666666666666"), devKb, tOf("en"))).toBeNull();
  });

  it("the file holds the prescription only when it is kept in — and is then version 2; every herb has labels in both languages and every gram is the card's", () => {
    const data = summaryData(saved, devKb);
    const rx = prescriptionFile(p, devKb);
    const both = (l: "zh-Hant" | "en") => tOf(l);
    const withIt = summaryFile(data, saved, devKb, { ...defaultOptions(1, "en"), sections: new Set([...FILE_SECTIONS, "prescription"]) }, both, rx) as Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(withIt.version).toBe(2);
    expect(withIt.prescription.composition.map((r: { grams: number }) => r.grams)).toEqual(p.composition.map((r) => r.amountG));
    for (const r of withIt.prescription.composition) expect(r.herb.label["zh-Hant"].length).toBeGreaterThan(0);
    const without = summaryFile(data, saved, devKb, defaultOptions(1, "en"), both, rx) as Record<string, unknown>;
    expect(without.version).toBe(1);
    expect("prescription" in without).toBe(false);
  });
});

describe("a backup carries it", () => {
  const saved = withPrescription(devKb, save(dev, interview(devKb, "SP3"), "rx77777777777777"));

  it("a record with its prescription passes the importer unchanged", () => {
    const v = validateAssessment(JSON.parse(JSON.stringify(saved)));
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value).toEqual(saved);
  });

  it("a prescription that is not the app's is refused with its record: an amount out of bounds, a foreign version, a script in a herb id", () => {
    const tamper = (f: (p: any) => void): SavedAssessment => { const c = JSON.parse(JSON.stringify(saved)); f(c.prescription); return c; };     // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(validateAssessment(tamper((p) => { p.composition[0].amountG = 5000; })).ok).toBe(false);
    expect(validateAssessment(tamper((p) => { p.version.kb = "another"; })).ok).toBe(false);
    expect(validateAssessment(tamper((p) => { p.composition[0].herb = "<img src=x>"; })).ok).toBe(false);
  });
});

describe("the version-2 file, for the schema test and the published example", () => {
  const GENERATED = join(import.meta.dirname, ".generated", "summaries");
  const EXAMPLE = join(import.meta.dirname, "..", "..", "..", "docs", "schemas", "examples", "dev-with-prescription.json");
  const fileOf = (saved: SavedAssessment): SummaryFile => {
    const rx = saved.prescription ? prescriptionFile(saved.prescription, devKb) : null;
    return summaryFile(summaryData(saved, devKb), saved, devKb, { ...defaultOptions(Date.UTC(2026, 9, 7, 12), "en"), sections: new Set([...FILE_SECTIONS, "prescription"]) }, (l) => tOf(l), rx);
  };

  it("is written for every typical patient of the development profile that has a prescription", () => {
    mkdirSync(GENERATED, { recursive: true });
    let written = 0;
    for (const pattern of devKb.patterns) {
      const saved = withPrescription(devKb, save(dev, interview(devKb, pattern.id), `rx${pattern.id.toLowerCase()}000000000000`.slice(0, 16)));
      if (!saved.prescription) continue;
      const f = fileOf(saved);
      expect(f.version).toBe(2);
      writeFileSync(join(GENERATED, `dev-rx-${pattern.id}.json`), `${JSON.stringify(f, null, 2)}\n`);
      written++;
    }
    expect(written).toBeGreaterThanOrEqual(15);
  });

  it("the published example is current (regenerate with UPDATE_FIXTURES=1)", () => {
    const saved = withPrescription(devKb, save(dev, interview(devKb, "HT1"), "rxexample00000000"));
    const f = fileOf(saved) as Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
    const from = f.exportedFrom as Record<string, string>;
    const stamped = { ...f, exportedFrom: { appVersion: "example", kbVersion: "example", engineVersion: "example", paramsFingerprint: "example", profile: from["profile"], ...(from["seasonModel"] !== undefined ? { seasonModel: from["seasonModel"] } : {}), ...(from["seasons"] !== undefined ? { seasons: from["seasons"] } : {}) },
      prescription: { ...f.prescription, version: { engine: "example", kb: "example", params: "example" } } };
    const generated = `${JSON.stringify(stamped, null, 2)}\n`;
    if (process.env["UPDATE_FIXTURES"] === "1") writeFileSync(EXAMPLE, generated);
    expect(readFileSync(EXAMPLE, "utf8")).toBe(generated);
  });
});
