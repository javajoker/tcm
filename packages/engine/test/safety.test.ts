import assert from "node:assert/strict";
import { test } from "node:test";
import { indexKnowledgeBase, type Formula, type KnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { allergyMatches, baselineFacts, evaluateSafety, formulaNature, incompatiblePairs, normalize, resolvePolicy, scorePatterns, synthesizePanel } from "../src/index.ts";
import type { Candidate, MedicationClass, PolicyFacts, SafetySubject } from "../src/index.ts";
import { forAll } from "./gen.ts";
import { dev, release } from "./kbs.ts";
import { PARITY } from "./parity.ts";

const subject = (over: Partial<SafetySubject> = {}): SafetySubject => ({ ageYears: 35, pregnant: false, lactating: false, medications: [], allergies: [], constitution: null, ...over });
const neutral = { coldHeat: 0, deficiencyExcess: 0 };
const formulas = (kb: KnowledgeBase): Candidate[] => [...kb.formulas.values()].map((formula) => ({ kind: "formula", formula }));
function run(kb: KnowledgeBase, s: SafetySubject, candidates: Candidate[], bagang = neutral, facts: Partial<PolicyFacts> = {}) {
  const policy = resolvePolicy(kb, { ...baselineFacts(s.ageYears), pregnant: s.pregnant, lactating: s.lactating, medications: s.medications, ...facts });
  return { policy, report: evaluateSafety(kb, { subject: s, policy, bagang, candidates }) };
}
const firedIds = (r: ReturnType<typeof run>["report"], id: string): string[] => r.items.find((i) => i.id === id)!.fired.map((f) => f.ruleId);

/** A copy of a knowledge base whose release profile lets a population reach L1, so the rules (not the level) must do the work. */
function releaseWith(cells: Record<string, "L1">): KnowledgeBase {
  const raw = rawChunksFromDisk("release");
  const profile = structuredClone(raw.core.config.profile) as typeof raw.core.config.profile;
  for (const [k, level] of Object.entries(cells)) (profile.population as Record<string, { level: string }>)[k]!.level = level;
  return indexKnowledgeBase({ ...raw, core: { ...raw.core, config: { ...raw.core.config, profile } } });
}

test("level gate: release L1 shows tier A only; B, C, modifications are listed as level-suppressed; dev allows all", () => {
  const r = run(release, subject(), [...formulas(dev), { kind: "herb", herbId: "herb-dazao", formula: dev.formulas.get("F_SHENLING")! }]);
  const levelOut = r.report.suppressed.filter((s) => s.reason === "level");
  assert.ok(levelOut.length >= 13 + 1, `suppressed ${levelOut.length}`);
  assert.ok(r.report.kept.every((i) => i.candidate.kind === "formula" && i.candidate.formula.tier === "A"));
  assert.ok(levelOut.every((s) => s.ruleId === null && s.message === null));
  const d = run(dev, subject(), formulas(dev));
  assert.equal(d.report.suppressed.length, 0);
  assert.equal(d.report.kept.length, 33);
});

test("pregnancy: herbs flagged avoid/caution are removed under suppress_hard and only annotated under annotate_only", () => {
  const kb = releaseWith({ pregnant: "L1" });
  const s = subject({ pregnant: true });
  const r = run(kb, s, formulas(kb));
  for (const i of r.report.items) {
    const f = (i.candidate as { formula: Formula }).formula;
    const risky = f.pregnancy === "avoid" || f.pregnancy === "caution";
    assert.equal(i.removed, risky, `${f.id} (${f.pregnancy})`);
    if (risky) assert.ok(i.fired.some((x) => x.ruleId === "R_PREG_HERB_AVOID" || x.ruleId === "R_PREG_HERB_CAUTION"));
  }
  assert.ok(r.report.suppressed.some((x) => x.reason === "rule" && x.ruleId?.startsWith("R_PREG")));
  const d = run(dev, s, formulas(dev));
  assert.equal(d.report.suppressed.length, 0, "dev removes nothing");
  assert.ok(d.report.items.some((i) => i.fired.some((f) => f.severity === "hard")), "…but shows the hard rules as warnings");
  assert.ok(d.report.items.every((i) => !i.removed));
});

test("pregnancy acupoints and foods", () => {
  const kb = releaseWith({ pregnant: "L1" });
  const pts: Candidate[] = ["合谷", "三陰交", "至陰", "關元", "足三里"].map((name) => ({ kind: "acupoint", name }));
  const r = run(kb, subject({ pregnant: true }), pts);
  assert.deepEqual(r.report.suppressed.map((x) => x.id), ["合谷", "三陰交", "至陰", "關元"]);
  assert.deepEqual(r.report.kept.map((x) => x.id), ["足三里"]);
  const food = run(dev, subject({ pregnant: true }), [{ kind: "food", name: "薏仁" }, { kind: "food", name: "小米" }]);
  assert.deepEqual(firedIds(food.report, "薏仁"), ["R_PREG_FOOD_CAUTION"]);
  assert.deepEqual(firedIds(food.report, "小米"), []);
  assert.ok(food.report.kept.length === 2, "a soft rule annotates and keeps");
  assert.deepEqual(run(dev, subject(), [{ kind: "food", name: "薏仁" }]).report.items[0]!.fired, []);
});

test("anticoagulant users do not receive formulas that carry the anticoagulant interaction (release)", () => {
  const r = run(release, subject({ medications: ["anticoagulant"] }), formulas(release));
  for (const i of r.report.items) {
    const f = (i.candidate as { formula: Formula }).formula;
    assert.equal(i.removed, f.interactions.includes("anticoagulant"), f.id);
  }
  assert.ok(r.policy.notices.some((n) => n.id === "N-MED"));
});

test("medication-class matrix: each interaction rule fires only for its classes", () => {
  const matrix: [string, string, MedicationClass[]][] = [
    ["R_HYPOGLYCEMIC", "hypoglycemic", ["antidiabetic"]], ["R_BP_RAISING", "bp-raising", ["antihypertensive"]],
    ["R_HYPOKALEMIA", "hypokalemia", ["diuretic", "cardiac-glycoside"]], ["R_IMMUNOSUPPRESSANT", "immune-modulating", ["immunosuppressant"]],
    ["R_SEDATIVE", "sedative-additive", ["sedative"]], ["R_SYMPATHOMIMETIC", "sympathomimetic", ["MAOI", "stimulant", "antihypertensive"]],
  ];
  const all: MedicationClass[] = ["antidiabetic", "antihypertensive", "diuretic", "cardiac-glycoside", "immunosuppressant", "sedative", "MAOI", "stimulant", "other"];
  for (const [rule, interaction, classes] of matrix) {
    const carriers = [...dev.formulas.values()].filter((f) => f.interactions.includes(interaction));
    assert.ok(carriers.length > 0, `no formula carries ${interaction}`);
    for (const cls of all) {
      const r = run(dev, subject({ medications: [cls] }), carriers.map((formula) => ({ kind: "formula" as const, formula })));
      for (const f of carriers) assert.equal(firedIds(r.report, f.id).includes(rule), classes.includes(cls), `${rule} ${f.id} with ${cls}`);
    }
    const none = run(dev, subject(), carriers.map((formula) => ({ kind: "formula" as const, formula })));
    for (const f of carriers) assert.ok(!firedIds(none.report, f.id).includes(rule), `${rule} must not fire without medication`);
  }
});

test("allergy: a listed herb removes the formulas that contain it; unknown allergens are reported as unconfirmed", () => {
  const withDanggui = [...dev.formulas.values()].filter((f) => f.composition.some((c) => c.name === "當歸"));
  assert.ok(withDanggui.length > 0);
  const r = run(release, subject({ allergies: ["當歸"] }), formulas(release));
  assert.equal(r.report.allergyMatch, true);
  for (const i of r.report.items) {
    const f = (i.candidate as { formula: Formula }).formula;
    assert.equal(i.removed, f.composition.some((c) => c.name === "當歸"), f.id);
  }
  assert.ok(r.report.suppressed.some((s) => s.ruleId === "R_ALLERGY"));
  const unknown = run(release, subject({ allergies: ["花生", "人參", "  "] }), formulas(release));
  assert.deepEqual(unknown.report.unmatchedAllergies, ["花生"], "人參 is known to the KB; 花生 is not; blanks are ignored");
  assert.equal(run(release, subject({ allergies: ["花生"] }), formulas(release)).report.allergyMatch, false);
  assert.ok(allergyMatches("ginseng", ["Ginseng", "人參"]) && allergyMatches("人參", ["紅人參"]) && !allergyMatches("參", ["人參"]) && !allergyMatches("", ["x"]));
});

test("tier C: level-suppressed in release; in dev kept with the strong-herb warning", () => {
  const c = [...dev.formulas.values()].filter((f) => f.tier === "C").map((formula) => ({ kind: "formula" as const, formula }));
  assert.equal(run(release, subject(), c).report.suppressed.length, c.length);
  const d = run(dev, subject(), c);
  assert.equal(d.report.kept.length, c.length);
  assert.ok(d.report.items.every((i) => i.fired.some((f) => f.ruleId === "R_STRONG_HERB")));
});

test("pattern-direction conflicts: 寒者熱之，熱者寒之；無盛盛，無虛虛 — thresholds on both the person and the formula", () => {
  const warming = dev.formulas.get("F_LIZHONG")!, cooling = dev.formulas.get("F_YINQIAO")!, tonic = dev.formulas.get("F_SIJUNZI")!, attacking = dev.formulas.get("F_ERCHEN")!;
  const nature = (f: Formula) => formulaNature(f);
  assert.ok(nature(warming).warming > 0.3 && nature(cooling).cooling > 0.3 && nature(tonic).tonic > 0.5 && nature(attacking).attacking > 0.8);
  const f = (formula: Formula): Candidate[] => [{ kind: "formula", formula }];
  const check = (formula: Formula, bagang: { coldHeat: number; deficiencyExcess: number }, rule: string) => run(dev, subject(), f(formula), bagang).report.items[0]!.fired.some((x) => x.ruleId === rule);
  assert.equal(check(warming, { coldHeat: 0.31, deficiencyExcess: 0 }, "R_PATTERN_HEAT_VS_WARM"), true);
  assert.equal(check(warming, { coldHeat: 0.3, deficiencyExcess: 0 }, "R_PATTERN_HEAT_VS_WARM"), false, "the person must be beyond the axis threshold");
  assert.equal(check(warming, { coldHeat: -0.5, deficiencyExcess: 0 }, "R_PATTERN_HEAT_VS_WARM"), false, "a cold person may be warmed");
  assert.equal(check(cooling, { coldHeat: -0.31, deficiencyExcess: 0 }, "R_PATTERN_COLD_VS_COLD"), true);
  assert.equal(check(cooling, { coldHeat: 0.5, deficiencyExcess: 0 }, "R_PATTERN_COLD_VS_COLD"), false);
  assert.equal(check(tonic, { coldHeat: 0, deficiencyExcess: 0.31 }, "R_EXCESS_VS_TONIC"), true);
  assert.equal(check(tonic, { coldHeat: 0, deficiencyExcess: -0.5 }, "R_EXCESS_VS_TONIC"), false);
  assert.equal(check(attacking, { coldHeat: 0, deficiencyExcess: -0.31 }, "R_DEFICIENCY_VS_ATTACK"), true);
  assert.equal(check(attacking, { coldHeat: 0, deficiencyExcess: 0.5 }, "R_DEFICIENCY_VS_ATTACK"), false);
  assert.equal(check(cooling, { coldHeat: 0.5, deficiencyExcess: 0 }, "R_PATTERN_HEAT_VS_WARM"), false, "a cooling formula is not warming");
  // enforcement
  const rel = run(release, subject(), f(release.formulas.get("F_GUIZHI")!), { coldHeat: 0.5, deficiencyExcess: 0 });
  assert.equal(rel.report.items[0]!.removed, true);
  assert.equal(rel.report.suppressed[0]!.ruleId, "R_PATTERN_HEAT_VS_WARM");
});

test("the standard formulas of each pattern are not blocked by the direction rules for that pattern's own typical patient", () => {
  for (const c of PARITY.cases.filter((x) => x.id.startsWith("typical-"))) {
    const pid = c.id.replace("typical-", "");
    const n = normalize(dev, { findings: c.findings, sex: "female", pregnancy: "no" });
    const panel = synthesizePanel(dev, scorePatterns(dev, n), null);
    const linked = dev.patternById.get(pid)!.formulas.map((id) => ({ kind: "formula" as const, formula: dev.formulas.get(id)! }));
    const r = run(dev, subject(), linked, panel.bagang);
    const blocked = r.report.items.filter((i) => i.fired.some((f) => /^R_(PATTERN|EXCESS|DEFICIENCY)/.test(f.ruleId)));
    assert.deepEqual(blocked.map((i) => [i.id, i.fired.map((f) => f.ruleId)]), [], `${pid}: the pattern's own formulas are blocked for its typical patient (${JSON.stringify(panel.bagang)})`);
  }
});

test("flavour excess is a soft annotation; 十八反/十九畏 pairs are detected by name", () => {
  const sour = [...dev.formulas.values()].find((f) => Math.max(...Object.values(f.flavor_profile)) > 0.55);
  if (sour) assert.ok(firedIds(run(dev, subject(), [{ kind: "formula", formula: sour }]).report, sour.id).includes("R_FLAVOR_EXCESS"));
  assert.deepEqual(incompatiblePairs(dev, ["炙甘草", "海藻", "人參"]), [["甘草", "海藻"]]);
  assert.deepEqual(incompatiblePairs(dev, ["附子", "半夏"]).length, 1, "烏頭類 includes 附子");
  assert.deepEqual(incompatiblePairs(dev, ["人參", "藜蘆"]), [["藜蘆", "人參"]]);
  assert.deepEqual(incompatiblePairs(dev, ["硫黃", "朴硝"]), [["硫黃", "朴硝"]]);
  assert.deepEqual(incompatiblePairs(dev, ["人參", "黃耆", "白朮"]), []);
  for (const f of dev.formulas.values()) assert.deepEqual(incompatiblePairs(dev, f.composition.map((c) => dev.herbName(c.herb)!.name["zh-Hant"])), [], `${f.id} contains an incompatible pair`);
  const bad: Formula = { ...dev.formulas.get("F_SIJUNZI")!, id: "F_TEST", tier: "A", composition: [
    { herb: "x1", name: "甘草", role: "君", role_weight: 1, proportion: 0.5, effective_weight: 0.5, note: null },
    { herb: "x2", name: "海藻", role: "臣", role_weight: 0.6, proportion: 0.5, effective_weight: 0.5, note: null }] };
  const r = run(release, subject(), [{ kind: "formula", formula: bad }]);
  assert.equal(r.report.items[0]!.removed, true);
  assert.equal(r.report.suppressed[0]!.ruleId, "R_SHIBAFAN");
  // a herb proposed by the residual 加減 that opposes a herb of the formula
  const licorice = dev.formulas.get("F_SIJUNZI")!;                                  // contains (炙)甘草
  const seaweed = { ...dev.herbs!.get("herb-gancao")!, id: "herb-haizao", name: { "zh-Hant": "海藻", en: "Sargassum" } };
  const kb2: KnowledgeBase = { ...dev, herbs: new Map([...dev.herbs!, ["herb-haizao", seaweed]]), herbName: (id) => (id === "herb-haizao" ? { name: seaweed.name, latin: null } : dev.herbName(id)) };
  const add = run(kb2, subject(), [{ kind: "herb", herbId: "herb-haizao", formula: licorice }, { kind: "herb", herbId: "herb-dazao", formula: licorice }]);
  assert.deepEqual(add.report.items.map((i) => [i.id, i.fired.some((f) => f.ruleId === "R_SHIBAFAN")]), [["herb-haizao", true], ["herb-dazao", false]]);
});

test("a tonic formula is annotated for the allergic constitution (特稟質)", () => {
  const r = run(dev, subject({ constitution: "C_TEBING" }), [{ kind: "formula", formula: dev.formulas.get("F_SIJUNZI")! }, { kind: "formula", formula: dev.formulas.get("F_ERCHEN")! }]);
  assert.ok(firedIds(r.report, "F_SIJUNZI").includes("R_TEBING_CONSTITUTION"));
  assert.ok(!firedIds(r.report, "F_ERCHEN").includes("R_TEBING_CONSTITUTION"));
  assert.ok(!firedIds(run(dev, subject({ constitution: "C_QIXU" }), [{ kind: "formula", formula: dev.formulas.get("F_SIJUNZI")! }]).report, "F_SIJUNZI").includes("R_TEBING_CONSTITUTION"));
});

test("properties P7 and P10 over random people: every candidate is kept or listed; no unsafe formula survives for pregnancy or anticoagulants", () => {
  const kb = releaseWith({ pregnant: "L1" });
  const meds: MedicationClass[] = ["anticoagulant", "antidiabetic", "antihypertensive", "diuretic", "sedative", "MAOI"];
  forAll("P7/P10", 200, (rng) => ({ pregnant: rng.chance(0.4), medications: rng.subset(meds, 0.3), allergies: rng.subset(["當歸", "人參", "甘草", "薑"], 0.2) }), (p) => {
    const r = run(kb, subject(p), formulas(kb), { coldHeat: 0, deficiencyExcess: 0 });
    const accounted = new Set([...r.report.kept.map((i) => i.id), ...r.report.suppressed.map((s) => s.id)]);
    for (const f of kb.formulas.values()) assert.ok(accounted.has(f.id), `${f.id} vanished silently`);
    for (const i of r.report.kept) {
      const f = (i.candidate as { formula: Formula }).formula;
      if (p.pregnant) assert.ok(f.pregnancy !== "avoid" && f.pregnancy !== "caution", `pregnant user got ${f.id}`);
      if (p.medications.includes("anticoagulant")) assert.ok(!f.interactions.includes("anticoagulant"), `anticoagulant user got ${f.id}`);
      for (const a of p.allergies) assert.ok(!f.composition.some((c) => allergyMatches(a, [c.name])), `${a} allergy: ${f.id}`);
    }
  });
});
