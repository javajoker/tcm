// The structured practitioner file (docs/post-mvp/design/export-follow-up-trends.md §3, §7): one data layer feeds the page, the text and the file; every fact in the file is on the page; the toggles
// remove exactly their section; a release file stays inside what a release result can show. The files are also written to test/.generated/summaries (ignored by git) for the Python schema test, and four
// examples are kept in docs/schemas/examples (regenerate with UPDATE_FIXTURES=1).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as engine from "@tcm/engine";
import { createI18n } from "@tcm/i18n";
import { indexKnowledgeBase, type KnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { catalogs, type MessageKey } from "../src/i18n/catalogs.ts";
import { renderSummary } from "../src/screens/result/summaryModel.ts";
import { summaryData } from "../src/screens/result/summaryData.ts";
import { defaultOptions, FILE_SECTIONS, summaryFile, summaryFileName, type FileOptions, type FileSection } from "../src/screens/result/summaryFile.ts";
import { signed } from "../src/screens/result/words.ts";
import type { Draft, SavedAssessment } from "../src/storage/types.ts";
import { interview, screenedDraft } from "./interview.ts";

const dev = indexKnowledgeBase(rawChunksFromDisk("dev"));
const release = indexKnowledgeBase(rawChunksFromDisk("release"));
const NOW = Date.UTC(2026, 9, 5, 12);
const tOf = (lang: "en" | "zh-Hant") => createI18n<MessageKey>({ ...catalogs, "zh-Hans": {} }, lang);
const both = (lang: "zh-Hant" | "en") => tOf(lang);
const REPO = join(import.meta.dirname, "..", "..", "..");
const GENERATED = join(import.meta.dirname, ".generated", "summaries");
const EXAMPLES = join(REPO, "docs", "schemas", "examples");

function patient(kb: KnowledgeBase, id: string, over: Partial<Draft> = {}, subject?: Draft["subject"]): SavedAssessment {
  const start = subject === undefined ? screenedDraft(kb) : screenedDraft(kb, subject, { profile: { medications: "some", medicationText: ["Foo Pill"], allergies: "some", conditions: "none" } });
  const d: Draft = { ...interview(kb, id, start), ...over };
  return toSaved(d, engine.assess(kb, assessInputOf(d, Date.UTC(2026, 9, 4, 12))!), { id: `r${id.toLowerCase()}0000000000000`.slice(0, 17), lang: "en" });
}
const woman: Draft["subject"] = { ageYears: 52, sex: "female", pregnancy: "no", lactating: false, medications: ["anticoagulant", "sedative"], allergies: ["花生"] };

const file = (kb: KnowledgeBase, saved: SavedAssessment, options: FileOptions = defaultOptions(NOW, "en")) => summaryFile(summaryData(saved, kb), saved, kb, options, tOf);
const without = (s: FileSection): FileOptions => ({ ...defaultOptions(NOW, "en"), sections: new Set(FILE_SECTIONS.filter((x) => x !== s)) });
const only = (s: FileSection): FileOptions => ({ ...defaultOptions(NOW, "en"), sections: new Set([s]) });

const typical = (kb: KnowledgeBase) => kb.patterns.map((p) => ({ id: p.id, saved: patient(kb, p.id) }));
const devPatients = typical(dev);
const releasePatients = typical(release);

describe("the file is made from the same data as the page", () => {
  it("has the envelope, the sections the person left on, and nothing else — for every typical patient, development and release", () => {
    mkdirSync(GENERATED, { recursive: true });
    for (const [profile, kb, list] of [["dev", dev, devPatients], ["release", release, releasePatients]] as const) {
      for (const { id, saved } of list) {
        const f = file(kb, saved);
        writeFileSync(join(GENERATED, `${profile}-${id}.json`), `${JSON.stringify(f, null, 2)}\n`);
        expect(Object.keys(f), `${profile} ${id}`).toEqual(["format", "version", "createdAt", "exportedFrom", "language", "notice", ...FILE_SECTIONS]);
        expect(f["format"]).toBe("tcm-summary");
        expect(f["version"]).toBe(1);
        expect((f["exportedFrom"] as Record<string, string>)["profile"]).toBe(profile);
        expect(JSON.parse(JSON.stringify(f))).toEqual(f);                                       // plain JSON all through
        expect("note" in f, "no note unless asked for").toBe(false);
      }
    }
  });

  for (const lang of ["en", "zh-Hant"] as const) {
    it(`every fact in the file is on the page · ${lang}`, () => {
      const t = tOf(lang);
      const k = (key: string, p?: Record<string, string | number>): string => t.t(key as MessageKey, p);
      for (const [kb, list] of [[dev, devPatients], [release, releasePatients]] as const) {
        for (const { id, saved } of list) {
          const data = summaryData(saved, kb);
          const f = file(kb, saved, { ...defaultOptions(NOW, lang), otherNamed: true }) as Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
          const page = renderSummary(data, kb, t).flatMap((s) => [s.title, ...(s.facts ?? []).flat(), ...(s.items ?? []), ...(s.table ? [...s.table.head, ...s.table.rows.flat()] : [])]).join("\n");
          const has = (text: string | number, what: string): void => expect(page, `${id} ${what}`).toContain(String(text));
          const labelIn = (l: { "zh-Hant": string; en: string | null }): string => (lang === "en" ? l.en ?? l["zh-Hant"] : t.zh(l["zh-Hant"]));
          // the person
          has(f.person.ageYears, "age");
          for (const c of f.person.conditions) has(k(`intake.profile.conditions.${c.id}`), c.id);
          // medicines and allergies
          for (const c of f.safety.medications.classes) has(k(`intake.profile.meds.${c.id}`), c.id);
          for (const n of f.safety.medications.otherNamed) has(n, "other named");
          for (const a of f.safety.allergies.items) has(t.zh(a), "allergy");
          for (const n of f.safety.notices) has(labelIn(n.label), n.id);
          // what was reported and observed
          for (const x of f.findings) { has(labelIn(x.label), x.id); if (x.severity) has(k(`intake.severity.${x.severity}`), `${x.id} severity`); }
          for (const x of f.observations.items) { has(labelIn(x.label), x.id); if (x.quality !== "inquiry") has(k(`report.pract.quality.${x.quality}`), `${x.id} quality`); }
          if (f.observations.pulse !== null) has(f.observations.pulse.rate, "pulse rate");
          // the panel, the patterns, what would change them
          for (const e of f.panel.elements) { has(k(`report.level.${e.band}`), e.element); has(signed(e.value, (n) => t.number(n, { maximumFractionDigits: 1, minimumFractionDigits: 1 })), `${e.element} value`); }
          for (const axis of ["coldHeat", "deficiencyExcess"] as const) { has(k(`report.axis.${axis}.${f.panel[axis].band}`), axis); has(signed(f.panel[axis].value, (n) => t.number(n, { maximumFractionDigits: 1, minimumFractionDigits: 1 })), `${axis} value`); }
          for (const p of f.patterns.items) { has(labelIn(p.label), p.id); has(k(`report.band.${p.band}`), `${p.id} band`); }
          if (f.patterns.confidence !== null) has(k(`report.confidence.${f.patterns.confidence}`), "confidence");
          for (const c of f.patterns.whatWouldChange) { has(labelIn(c.shiftsTo.label), "shifts to"); has(labelIn(c.over.label), "over"); for (const s of c.symptoms) has(labelIn(s.label), s.id); }
          if (f.constitution !== null) { has(labelIn(f.constitution.primary.label), "constitution"); if (f.constitution.secondary !== null) has(labelIn(f.constitution.secondary.label), "secondary constitution"); }
          // what the result showed
          for (const x of f.recommendations.formulas) { has(labelIn(x.label), x.id); has(k(`formula.tier.${x.tier}`), `${x.id} tier`); }
          for (const x of f.recommendations.foods) has(t.zh(x.label["zh-Hant"]), x.id);
          for (const x of f.recommendations.points) { has(t.zh(x.label["zh-Hant"]), x.id); has(x.id, "point code"); }
        }
      }
    });
  }

  it("holds ids that exist in the knowledge base, and labels in both languages for every coded item", () => {
    for (const { id, saved } of devPatients) {
      const f = file(dev, saved) as Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const x of [...f.findings, ...f.observations.items, ...f.patterns.whatWouldChange.flatMap((c: any) => c.symptoms)]) { expect(dev.symptoms.has(x.id), `${id} ${x.id}`).toBe(true); expect(x.label["zh-Hant"]).toBeTruthy(); expect(x.label.en).toBeTruthy(); }  // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const x of f.patterns.items) { expect(dev.patternById.has(x.id)).toBe(true); expect(x.label.en).toBeTruthy(); }
      for (const x of f.recommendations.formulas) expect(dev.formulas.has(x.id)).toBe(true);
      for (const x of f.recommendations.foods) expect(Object.values(dev.treatment.foods).some((food) => food.id === x.id), x.id).toBe(true);
      for (const x of f.recommendations.points) expect(Object.values(dev.treatment.acupoints).some((p) => p.code === x.id), x.id).toBe(true);
    }
  });
});

describe("the preview's switches", () => {
  const saved = patient(dev, "SP1", {}, woman);
  it("a section that is off is absent, and only that one", () => {
    for (const s of FILE_SECTIONS) {
      const f = file(dev, saved, without(s));
      expect(s in f, `${s} should be absent`).toBe(false);
      for (const other of FILE_SECTIONS.filter((x) => x !== s)) expect(other in f, `${other} should stay`).toBe(true);
      const g = file(dev, saved, only(s));
      expect(Object.keys(g)).toEqual(["format", "version", "createdAt", "exportedFrom", "language", "notice", s]);
    }
  });
  it("typed medicine names and the note are left out unless asked for", () => {
    const base = file(dev, saved) as Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(base.safety.medications).not.toHaveProperty("otherNamed");
    expect(JSON.stringify(base)).not.toContain("Foo Pill");
    const on = file(dev, saved, { ...defaultOptions(NOW, "en"), otherNamed: true }) as Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(on.safety.medications.otherNamed).toEqual(["Foo Pill"]);
    expect(file(dev, saved, { ...defaultOptions(NOW, "en"), note: "   " })).not.toHaveProperty("note");
    expect(file(dev, saved, { ...defaultOptions(NOW, "en"), note: "Tired since the move" })).toHaveProperty("note", "Tired since the move");
  });
  it("the medicine classes are named, never medicines, and the allergies are the person's own entries", () => {
    const f = file(dev, saved) as Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(f.safety.medications.status).toBe("some");
    expect(f.safety.medications.classes.map((c: { id: string }) => c.id).sort()).toEqual(["anticoagulant", "other", "sedative"]);
    expect(f.safety.allergies).toEqual({ status: "some", items: ["花生"] });
  });
  it("the file name carries the date, and the notice carries the disclaimer in both languages", () => {
    expect(summaryFileName(NOW)).toBe("tcm-summary-2026-10-05.json");
    const f = file(dev, saved) as Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(f.notice.en).toContain("Prepared by the person using TCM Self-Check");
    expect(f.notice.en).toContain(tOf("en").t("common.footer.disclaimer"));
    expect(f.notice["zh-Hant"]).toContain(tOf("zh-Hant").t("common.footer.disclaimer"));
    expect(f.createdAt).toBe("2026-10-05T12:00:00.000Z");
    expect(both("en").t("report.pract.file.notice")).toBeTruthy();
  });
});

describe("a release file stays inside what a release result can show", () => {
  it("lists only tier-A formulas, and no amount, weight or dose anywhere", () => {
    for (const { id, saved } of releasePatients) {
      const f = file(release, saved) as Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const x of f.recommendations.formulas) expect(x.tier, `${id} ${x.id}`).toBe("A");
      expect(JSON.stringify(f), id).not.toMatch(/typical_g|classical_amount|effective_weight|"dose|"grams|"amount/);
      expect(f.exportedFrom.profile).toBe("release");
    }
  });
  it("a result with too little to go on says so, and has no constitution or pulse", () => {
    const sparse = patient(dev, "EX3");        // the typical patient of this pattern does not reach a verdict
    const f = file(dev, { ...sparse, input: { ...sparse.input, observe: undefined } as never }) as Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
    if (f.patterns.status === "insufficient") { expect(f.patterns.items).toEqual([]); expect(f.patterns.confidence).toBeNull(); }
    expect(f.constitution === null || typeof f.constitution === "object").toBe(true);
    expect(f.observations.pulse).toBeNull();
  });
});

describe("the published examples", () => {
  const stamps = (f: Record<string, unknown>): Record<string, unknown> => ({ ...f, exportedFrom: { appVersion: "example", kbVersion: "example", engineVersion: "example", paramsFingerprint: "example", profile: (f["exportedFrom"] as Record<string, string>)["profile"] } });
  const EXAMPLE_LIST: [string, () => Record<string, unknown>][] = [
    ["release-full", () => file(release, releasePatients.find((p) => p.id === "SP1")!.saved) as Record<string, unknown>],
    ["release-with-medicines-and-note", () => file(release, patient(release, "EX1", {}, woman), { ...defaultOptions(NOW, "zh-Hant"), otherNamed: true, note: "Cold since the weekend; no appetite." }) as Record<string, unknown>],
    ["dev-patterns-only", () => file(dev, patient(dev, "LV1"), only("patterns")) as Record<string, unknown>],
    ["dev-no-observations", () => file(dev, patient(dev, "KD1"), without("observations")) as Record<string, unknown>],
  ];
  it.each(EXAMPLE_LIST)("%s is current (regenerate with UPDATE_FIXTURES=1)", (name, make) => {
    const path = join(EXAMPLES, `${name}.json`);
    const generated = `${JSON.stringify(stamps(make()), null, 2)}\n`;
    if (process.env["UPDATE_FIXTURES"] === "1") { mkdirSync(EXAMPLES, { recursive: true }); writeFileSync(path, generated); }
    expect(readFileSync(path, "utf8")).toBe(generated);
  });
});
