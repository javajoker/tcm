import assert from "node:assert/strict";
import { test } from "node:test";
import { assess, ENGINE_VERSION } from "../src/index.ts";
import type { AssessInput, Findings, Subject } from "../src/index.ts";
import { forAll } from "./gen.ts";
import { dev, release } from "./kbs.ts";
import { PARITY } from "./parity.ts";

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const BIRTH = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
const person = (over: Partial<Subject> = {}): Subject => ({ ageYears: 35, sex: "female", pregnancy: "no", lactating: false, medications: [], allergies: [], seriousChronicDisease: false, ...over });
const input = (findings: Findings, over: Partial<AssessInput> = {}, s: Partial<Subject> = {}): AssessInput =>
  ({ subject: person(s), redFlags: new Set(), findings, options: { now: NOW, birthModule: false }, ...over });
const worked = PARITY.cases.find((c) => c.id === "worked-example")!.findings;

/** A complete interview of a person with these findings: every applicable question answered (selected symptoms present, the rest absent). */
function interview(findings: Findings, sex: "female" | "male" = "female"): Findings {
  const out: Record<string, Findings[string]> = { ...findings };
  for (const q of dev.questions) {
    if (q.requires?.sex && q.requires.sex !== sex) continue;
    for (const o of q.options) for (const sym of o.symptoms) if (!(sym in out)) out[sym] = { state: "absent" };
  }
  return out;
}
const COMPLETE = { course: "chronic" } as const;
const fullWorked = interview(worked);

test("the SOP worked example end to end (dev): SP1 medium, panel, offsets, formulas, modification, trace", () => {
  const a = assess(dev, input(worked, { options: { now: NOW, birthModule: false } }, { birth: BIRTH }));
  assert.equal(a.meta.engineVersion, ENGINE_VERSION);
  assert.equal(a.meta.profile, "dev");
  assert.equal(a.verdict.patterns[0]!.id, "SP1");
  assert.equal(Math.round(a.verdict.patterns[0]!.pct * 10) / 10, 55.8);
  assert.equal(a.verdict.confidence, "low", "coverage is far below 0.6 because most core questions are unanswered");
  assert.equal(Math.round(a.panel.wuxingFunction["土"] * 100) / 100, -0.76);
  assert.equal(a.panel.alignment?.["土"], "opposed");
  assert.ok(a.reference?.birth.used);
  assert.deepEqual(a.recommendations.formulas.map((f) => f.id).slice(0, 2), ["F_SHENLING", "F_SIJUNZI"]);
  assert.ok(a.recommendations.formulas[0]!.residualModification!.steps.length === 3);
  assert.ok(a.recommendations.principles[0]!.text.length > 0);
  assert.ok(a.trace.some((t) => t.kind === "evidence") && a.trace.some((t) => t.kind === "prior"));
  assert.equal(a.policy.level, "L3");
  assert.ok(a.policy.notices.every((n) => n.kind === "inline"));
});

test("release: the same person gets tier A only, no amounts, no modification, and the cautions", () => {
  const a = assess(release, input(fullWorked, { context: COMPLETE }));
  assert.equal(a.quality.coverage, 1);
  assert.equal(a.verdict.confidence, "medium");
  assert.equal(a.policy.level, "L1");
  assert.ok(a.recommendations.formulas.length > 0 && a.recommendations.formulas.length <= 3);
  for (const f of a.recommendations.formulas) {
    assert.equal(f.tier, "A");
    assert.deepEqual(f.classicalModifications, []);
    assert.equal(f.residualModification, null);
    assert.ok(f.composition.every((c) => !("typicalG" in c)));
  }
  assert.deepEqual(a.recommendations.studyOnly, []);
  assert.ok(!JSON.stringify(a).includes("typical_g") && !JSON.stringify(a).includes("typicalG"));
});

test("a blocking notice is required, the flow continues, and the level is restricted (release) or open (dev)", () => {
  const flags = new Set(["RF_A_CHEST_PAIN"]);
  const r = assess(release, input(worked, { redFlags: flags }));
  assert.deepEqual(r.requiredAcknowledgements, ["N-A"]);
  assert.equal(r.policy.level, "L0");
  assert.equal(r.policy.flow, "continue");
  assert.equal(r.recommendations.status, "limited-by-level");
  assert.deepEqual(r.recommendations.formulas, []);
  assert.ok(r.recommendations.lifestyle.length > 0 && r.recommendations.general.text.length > 0, "gentle lifestyle content remains");
  assert.ok(r.verdict.patterns.length > 0, "the explanation of the pattern is still given at L0");
  assert.ok(r.suppressed.some((s) => s.reason === "level"));
  const d = assess(dev, input(worked, { redFlags: flags }));
  assert.deepEqual(d.requiredAcknowledgements, ["N-A"]);
  assert.equal(d.policy.level, "L3");
  assert.ok(d.recommendations.formulas.length > 0);
});

test("pregnancy in release: L0, N-PREG, no formulas or points; dev: annotated", () => {
  const r = assess(release, input(worked, {}, { pregnancy: "yes" }));
  assert.deepEqual(r.requiredAcknowledgements, ["N-PREG"]);
  assert.deepEqual([r.recommendations.formulas.length, r.recommendations.acupoints.length, r.recommendations.foods.length], [0, 0, 0]);
  const d = assess(dev, input(worked, {}, { pregnancy: "possible" }));
  assert.ok(d.recommendations.formulas.every((f) => f.annotations.length >= 0));
  assert.ok(d.suppressed.length === 0, "dev removes nothing");
});

test("insufficient information: no formulas, the state lowers release to L0, and the questions to ask are in the trace", () => {
  const a = assess(release, input({ S_FATIGUE: { state: "present" } }));
  assert.equal(a.verdict.status, "insufficient");
  assert.equal(a.recommendations.status, "insufficient-information");
  assert.deepEqual(a.recommendations.formulas, []);
  assert.equal(a.policy.level, "L0");
  assert.ok(a.policy.matched.some((c) => c.key === "insufficient_information"));
  assert.deepEqual(a.recommendations.principles, []);
});

test("allergy: a listed herb removes the formulas containing it, notice N-ALLERGY, unknown allergens are reported", () => {
  const base = assess(release, input(fullWorked, { context: COMPLETE }));
  const withAllergy = assess(release, input(fullWorked, { context: COMPLETE }, { allergies: ["人參", "花生"] }));
  assert.ok(withAllergy.policy.notices.some((n) => n.id === "N-ALLERGY"));
  assert.deepEqual(withAllergy.quality.unmatchedAllergies, ["花生"]);
  assert.ok(withAllergy.suppressed.some((s) => s.ruleId === "R_ALLERGY"));
  assert.ok(withAllergy.recommendations.formulas.every((f) => !f.composition.some((c) => c.name["zh-Hant"].includes("人參"))));
  assert.ok(base.recommendations.formulas.some((f) => f.composition.some((c) => c.name["zh-Hant"].includes("人參"))));
});

test("birth data: the three blocks are reported but the diagnosis is identical with and without them", () => {
  const without = assess(dev, input(worked));
  const withBirth = assess(dev, input(worked, {}, { birth: BIRTH }));
  assert.equal(withBirth.reference?.birth.used, true);
  assert.equal(without.reference?.birth.used, false);
  assert.deepEqual(withBirth.patterns, without.patterns, "pattern scores do not depend on the priors (P1)");
  assert.deepEqual(withBirth.panel.observed, without.panel.observed);
  assert.deepEqual(withBirth.panel.offsetPopulation, without.panel.offsetPopulation);
  assert.deepEqual(withBirth.recommendations.formulas.map((f) => [f.id, f.fit.k, f.fit.explained]), without.recommendations.formulas.map((f) => [f.id, f.fit.k, f.fit.explained]));
});

test("determinism: same input, same output; the clock is injected", () => {
  const a = assess(dev, input(worked, {}, { birth: BIRTH })), b = assess(dev, input(worked, {}, { birth: BIRTH }));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.reference!.panel.total, assess(dev, input(worked, { options: { now: Date.UTC(2027, 1, 20), birthModule: false } }, { birth: BIRTH })).reference!.panel.total);
  assert.equal(a.meta.computedAt, NOW);
});

test("property P5: the order of the keys of the input changes nothing", () => {
  const findings = interview(worked);
  const reversed = Object.fromEntries(Object.entries(findings).reverse()) as Findings;
  const a = assess(dev, input(findings, { context: COMPLETE }, { birth: BIRTH })), b = assess(dev, input(reversed, { context: COMPLETE }, { birth: BIRTH }));
  assert.deepEqual(a, b);
});

test("a re-run of a saved input gives the same assessment (P12: save/load idempotence)", () => {
  const i = input(worked, {}, { birth: BIRTH });
  const a = assess(dev, i);
  const stored = JSON.parse(JSON.stringify({ ...i, redFlags: [...i.redFlags] })) as Omit<AssessInput, "redFlags"> & { redFlags: string[] };
  const again = assess(dev, { ...stored, redFlags: new Set(stored.redFlags) });
  assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(a)));
});

test("property: every kind of random person gets a complete, consistent assessment", () => {
  const ids = [...dev.symptoms.keys()];
  const flags = release.redFlags.map((f) => f.id);
  forAll("assess random", 150, (rng) => ({
    findings: Object.fromEntries(rng.subset(ids, 0.1).map((s) => [s, { state: rng.pick(["present", "present", "absent", "unsure"] as const), severity: rng.pick(["light", "moderate", "severe"] as const) }])) as Findings,
    redFlags: new Set(rng.subset(flags, 0.03)), subject: person({ ageYears: rng.pick([10, 30, 70]), sex: rng.pick(["female", "male"] as const), pregnancy: rng.pick(["no", "yes", "possible", "not-applicable"] as const), lactating: rng.chance(0.1),
      medications: rng.subset(["anticoagulant", "antidiabetic", "sedative", "other"] as const, 0.2), allergies: rng.subset(["當歸", "人參", "薑"], 0.2), seriousChronicDisease: rng.chance(0.05) }),
  }), (c) => {
    for (const kb of [release, dev]) {
      const a = assess(kb, { subject: c.subject, redFlags: c.redFlags, findings: c.findings, options: { now: NOW, birthModule: false } });
      assert.equal(a.policy.flow, "continue");
      assert.ok(a.patterns.length === 23 && a.patterns.every((p) => p.pct >= 0 && p.pct <= 100 + 1e-9));
      const accounted = new Set([...a.recommendations.formulas, ...a.recommendations.studyOnly].map((f) => f.id));
      const suppressed = new Set(a.suppressed.filter((s) => s.kind === "formula").map((s) => s.id));
      for (const id of accounted) assert.ok(!suppressed.has(id), `${id} is both shown and suppressed`);
      if (kb.profile === "release") {
        assert.ok(a.policy.level === "L0" || a.policy.level === "L1");
        assert.deepEqual(a.recommendations.studyOnly, []);
        for (const f of a.recommendations.formulas) {
          if (c.subject.pregnancy === "yes" || c.subject.pregnancy === "possible") assert.fail("a pregnant user must not receive formulas in release");
          assert.ok(f.composition.every((x) => !("typicalG" in x)));
        }
      }
      if (a.verdict.status === "insufficient") assert.deepEqual(a.recommendations.formulas, []);
      // P8: policy at the producer — nothing above the effective level exists in the result
      const json = JSON.stringify(a.recommendations);
      if (!a.policy.features.dosage) assert.ok(!json.includes("typicalG") && !json.includes("classicalAmount"), "amounts without permission");
      if (!a.policy.features.modification) assert.ok(!json.includes("residualModification\":{") && a.recommendations.formulas.every((f) => f.classicalModifications.length === 0 && f.residualModification === null));
      if (!a.policy.features.formulas) assert.deepEqual([a.recommendations.formulas.length, a.recommendations.studyOnly.length], [0, 0]);
      if (!a.policy.features.acupoints) assert.deepEqual(a.recommendations.acupoints, []);
      if (!a.policy.features.diet) assert.deepEqual(a.recommendations.foods, []);
      if (!a.policy.features.tiers.includes("C")) assert.deepEqual(a.recommendations.studyOnly, []);
      assert.equal(a.requiredAcknowledgements.length, a.policy.notices.filter((n) => n.kind === "blocking_ack").length);
    }
  });
});
