// The prescription model, part 3 (PM-40): the personalised prescription by 三因制宜.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { DoseBands, Herb, Pairings, Prescription as PrescriptionFile, Processing, Sanyin, Yinjing } from "@tcm/kb";
import { assess, type Assessment, type Findings, type Subject } from "../src/index.ts";
import { personalise, isOfNature, type PersonaliseInput, type PrescriptionTables } from "../src/prescription/index.ts";
import { forAll } from "./gen.ts";
import { dev, release } from "./kbs.ts";
import { PARITY } from "./parity.ts";

const data = <T>(rel: string): T => JSON.parse(readFileSync(new URL(`../../../data/${rel}`, import.meta.url), "utf8")) as T;
const tables: PrescriptionTables = {
  params: data<PrescriptionFile>("treatment/prescription.json").params, pairings: data<Pairings>("herbs/pairings.json").items,
  processing: data<Processing>("herbs/processing.json").methods, doseBands: data<DoseBands>("herbs/dose-bands.json").items, yinjing: data<Yinjing>("herbs/yinjing.json").channels,
};
const sanyin = data<Sanyin>("treatment/sanyin.json");
const NOW = Date.UTC(2026, 9, 7, 12);
const person = (over: Partial<Subject> = {}): Subject => ({ ageYears: 40, sex: "female", pregnancy: "no", lactating: false, medications: [], allergies: [], seriousChronicDisease: false, ...over });
const typical = (pid: string): Findings => PARITY.cases.find((c) => c.id === `typical-${pid}`)!.findings as Findings;
const assessed = (pid: string, s: Partial<Subject> = {}, kb = dev): { a: Assessment; subject: Subject } => {
  const subject = person(s);
  return { a: assess(kb, { subject, redFlags: new Set(), findings: typical(pid), options: { now: NOW, birthModule: false } }), subject };
};
const run = (a: Assessment, subject: Subject, kb = dev): ReturnType<typeof personalise> => personalise({ kb, assessment: a, subject, tables, sanyin } satisfies PersonaliseInput);
const herb = (id: string): Herb => dev.herbs!.get(id)!;
const withConstitution = (a: Assessment, primary: string): Assessment => ({ ...a, constitution: { result: { scores: [], primary, secondary: null, balanced: "no", complete: true }, susceptibility: null } });
const withSeason = (a: Assessment, element: "木" | "火" | "土" | "金" | "水"): Assessment =>
  ({ ...a, reference: { ...a.reference!, enabled: { ...a.reference!.enabled, season: true }, panel: { ...a.reference!.panel, season: { ...a.reference!.panel.season, element } } } });
const factor = (p: NonNullable<ReturnType<typeof personalise>>, herbId: string, rule: string): number | undefined =>
  p.composition.find((r) => r.herb === herbId)?.factors.find((f) => f.rule === rule)?.factor;

test("a typical 脾氣虛 adult: the first recommended formula, personalised; the 君 at the middle of its range; every amount within its range; the 方解 of what is prescribed", () => {
  const { a, subject } = assessed("SP1");
  const p = run(a, subject)!;
  assert.equal(p.base.formula, a.recommendations.formulas.find((r) => !r.studyOnly)!.id);
  assert.equal(p.withheld, null);
  assert.ok(p.amounts && p.composition.length >= 3);
  for (const r of p.composition) {
    assert.ok(r.amountG !== null && r.amountG > 0, r.herb);
    if (r.rangeG) assert.ok(r.amountG! <= r.rangeG[1] + 1e-9 && r.amountG! >= r.rangeG[0] - 1e-9, `${r.herb} ${r.amountG} in ${r.rangeG}`);
    assert.ok(Math.abs(r.amountG! * 2 - Math.round(r.amountG! * 2)) < 1e-9 || (r.rangeG !== null && r.rangeG[1] <= 1), "rounded to 0.5 g");
  }
  assert.ok(Math.abs(p.composition.reduce((s, r) => s + r.proportion, 0) - 1) < 1e-9);
  const jun = p.composition.find((r) => r.role === "君" && r.source === "formula")!;
  const mid = (jun.rangeG![0] + jun.rangeG![1]) / 2;
  assert.ok(Math.abs(jun.amountG! - mid * sanyin.severity[p.base.strength]) <= 0.5 + 1e-9 || jun.factors.some((f) => f.rule.startsWith("range")), "the 君 at the middle of its range × severity");
  assert.ok(p.mechanism && p.mechanism.costAfter <= p.mechanism.costBefore);
  assert.deepEqual(run(a, subject), p, "deterministic");
});

test("nothing in a bundle without herb records, and the assessment is never changed", () => {
  const { a, subject } = assessed("SP1", {}, release);
  assert.equal(run(a, subject, release), null);
  const d = assessed("SP1");
  const before = JSON.stringify(d.a);
  run(d.a, d.subject);
  assert.equal(JSON.stringify(d.a), before);
});

test("因人 — an allergy to the 君 withholds the prescription and says why; an allergy to another herb removes only it", () => {
  const { a } = assessed("SP1");
  const f = dev.formulas.get(a.recommendations.formulas.find((r) => !r.studyOnly)!.id)!;
  const jun = herb(f.composition.find((c) => c.role === "君")!.herb);
  const p = run(a, person({ allergies: [jun.name["zh-Hant"]] }))!;
  assert.deepEqual(p.withheld, { herb: jun.id, rule: "yinren.allergy" });
  assert.deepEqual(p.composition, []);
  const other = herb(f.composition.find((c) => c.role !== "君")!.herb);
  const q = run(a, person({ allergies: [other.name["zh-Hant"]] }))!;
  assert.equal(q.withheld, null);
  assert.ok(!q.composition.some((r) => r.herb === other.id));
  assert.ok(q.changes.some((c) => c.op === "remove" && c.herb === other.id && c.rule === "yinren.allergy"));
});

test("因人 — the constitution: for 陽虛質 the cold herbs of the formula are given at 0.8 and none is added unless the heat that remains asks for it", () => {
  const { a, subject } = assessed("SP5");                      // 濕熱: cold herbs in the formula
  const plain = run(a, subject)!, yang = run(withConstitution(a, "C_YANGXU"), subject)!;
  const cold = yang.composition.filter((r) => r.source === "formula" && isOfNature(herb(r.herb), "寒涼"));
  assert.ok(cold.length > 0);
  for (const r of cold) assert.equal(factor(yang, r.herb, "constitution:C_YANGXU"), 0.8);
  const addedCold = yang.changes.filter((c) => c.op === "add" && c.rule === "jiajian.residual" && isOfNature(herb(c.herb), "寒涼"));
  if (addedCold.length > 0) assert.ok((a.panel.observed["liuxie.火"] ?? 0) > sanyin.heat_demand, "a cold herb was added only because the heat asks for it");
  assert.notDeepEqual(plain.composition, yang.composition);
});

test("因時 — 用熱遠熱 in summer, 用寒遠寒 in winter; the 君 keeps its amount whatever the season (發表不遠熱，攻裡不遠寒)", () => {
  const { a, subject } = assessed("SP2");                      // 脾陽虛: warm herbs
  const summer = run(withSeason(a, "火"), subject)!;
  const warm = summer.composition.filter((r) => herb(r.herb).temperature >= 1 && r.role !== "君");
  assert.ok(warm.length > 0, "a warm herb besides the 君");
  for (const r of warm) assert.equal(factor(summer, r.herb, "season:火"), 0.85);
  for (const r of summer.composition.filter((x) => x.role === "君")) assert.equal(factor(summer, r.herb, "season:火"), undefined);
  const { a: hot, subject: s2 } = assessed("LG2");             // 肺陰虛: cold herbs
  const winter = run(withSeason(hot, "水"), s2)!;
  for (const r of winter.composition.filter((x) => herb(x.herb).temperature <= -1 && x.role !== "君")) assert.equal(factor(winter, r.herb, "season:水"), 0.85);
  const longSummer = run(withSeason(a, "土"), subject)!;
  assert.ok(longSummer.composition.every((r) => !r.factors.some((f) => f.rule.startsWith("season:"))), "長夏 has no rule of its own in 六元正紀大論's four");
});

test("因人 — age: a child of five takes half, below the adult range if need be; a person of seventy two thirds", () => {
  const { a } = assessed("SP1");
  const child = run(a, person({ ageYears: 5 }))!, elder = run(a, person({ ageYears: 70 }))!;
  for (const r of child.composition) {
    assert.equal(factor(child, r.herb, "age:幼兒"), 0.5);
    assert.ok(!r.factors.some((f) => f.rule === "range-bottom"), "a child's amount is not lifted to the adult minimum");
  }
  for (const r of elder.composition) assert.ok(Math.abs(factor(elder, r.herb, "age:elderly")! - 2 / 3) < 1e-12);
});

test("a toxic herb is never raised: a strong prescription keeps its amount at the base", () => {
  const { a, subject } = assessed("SP4");
  const strong = { ...a, recommendations: { ...a.recommendations, formulas: a.recommendations.formulas.map((r) => ({ ...r, strength: "strong" as const })) } };
  const p = run(strong, subject)!;
  const toxic = p.composition.filter((r) => herb(r.herb).props.toxicity !== "無毒");
  assert.ok(toxic.length > 0, "a toxic herb in the formula (半夏)");
  for (const r of toxic) assert.ok(r.factors.reduce((x, f) => x * f.factor, 1) <= 1 + 1e-12, `${r.herb}: ${JSON.stringify(r.factors)}`);
});

test("property: over every pattern's typical patient and random people, no herb the person must not take appears, amounts never leave their range, at most three herbs are added, and the result is deterministic", () => {
  const patterns = dev.patterns.map((p) => p.id).filter((id) => PARITY.cases.some((c) => c.id === `typical-${id}`));
  const curated = [...dev.herbs!.values()];
  const meds: Subject["medications"][number][] = ["anticoagulant", "antidiabetic", "antihypertensive", "diuretic", "immunosuppressant", "sedative", "MAOI"];
  const constitutions = ["C_YANGXU", "C_QIXU", "C_YINXU", "C_SHIRE", "C_TANSHI", "C_TEBING", null];
  forAll("personalised prescriptions", 120, (rng) => ({
    pid: rng.pick(patterns),
    over: {
      ageYears: rng.pick([3, 10, 25, 40, 70, 85]),
      pregnancy: (rng.chance(0.3) ? "yes" : "no") as Subject["pregnancy"],
      allergies: rng.chance(0.4) ? [rng.pick(curated).name["zh-Hant"]] : [],
      medications: rng.chance(0.4) ? [rng.pick(meds)] : [],
    },
    constitution: rng.pick(constitutions),
    season: rng.pick(["木", "火", "土", "金", "水"] as const),
  }), ({ pid, over, constitution, season }) => {
    const { a, subject } = assessed(pid, over);
    const shaped = withSeason(constitution ? withConstitution(a, constitution) : a, season);
    const p = run(shaped, subject);
    if (!p || p.withheld) return;
    const hard = new Set<string>();
    for (const m of subject.medications) for (const rule of dev.safety.rules) {
      const t = rule.target as { herb_interaction?: string }, ap = rule.applies_to as { medication_class?: string[]; condition?: string[] };
      if (t.herb_interaction && rule.severity === "hard" && (ap.medication_class?.includes(m) || (m === "anticoagulant" && ap.condition?.includes("on_anticoagulant")))) hard.add(t.herb_interaction);
    }
    for (const r of p.composition) {
      const h = herb(r.herb);
      if (subject.pregnancy === "yes") assert.notEqual(h.pregnancy, "avoid", `${pid}: ${h.id} in pregnancy`);
      assert.ok(!subject.allergies.includes(h.name["zh-Hant"]), `${pid}: allergy ${h.id}`);
      assert.ok(!h.interactions.some((i) => hard.has(i)), `${pid}: interaction ${h.id}`);
      if (r.amountG !== null && r.rangeG) assert.ok(r.amountG <= r.rangeG[1] + 1e-9, `${pid}: ${h.id} above its range`);
    }
    for (const c of p.changes.filter((x) => x.op === "add" && x.rule === "jiajian.residual")) {
      const h = herb(c.herb);
      assert.equal(h.props.toxicity, "無毒");
      assert.ok(subject.pregnancy !== "yes" || (h.pregnancy !== "avoid" && h.pregnancy !== "caution"));
    }
    assert.ok(p.changes.filter((c) => c.op === "add").length <= dev.params.formula.modification.max_add);
    const plain = (id: string): string => herb(id).name["zh-Hant"].replace(/^(蜜炙|炙|炒|製|酒|醋|鹽)/u, "");
    const residual = p.changes.filter((c) => c.op === "add" && c.rule === "jiajian.residual").map((c) => c.herb);
    for (const id of residual) assert.equal(p.composition.filter((r) => plain(r.herb) === plain(id)).length, 1, `${pid}: ${herb(id).name["zh-Hant"]} added beside its own processed or raw form`);
    for (const c of p.changes.filter((x) => x.op === "add" && x.rule === "jiajian.residual")) {
      // what it improves, it improves through its own benefit (treating the deviation, or offsetting another herb's burden — 佐制) or through a 七情
      // pairing it brings into play (相畏: restraining another herb), never through its own burden
      const throughBenefit = (c.improves ?? []).some((d) => (herb(c.herb).effects[d] ?? 0) !== 0) || (c.via ?? []).length > 0;
      assert.ok(throughBenefit, `${pid}: ${herb(c.herb).name["zh-Hant"]} improves ${c.improves?.join(", ")} only through its burden`);
    }
    assert.deepEqual(run(shaped, subject), p);
  });
});
