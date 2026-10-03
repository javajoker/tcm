import assert from "node:assert/strict";
import { test } from "node:test";
import { applies, normalize } from "../src/index.ts";
import type { Findings, Sex, PregnancyStatus } from "../src/index.ts";
import { forAll, type Rng } from "./gen.ts";
import { dev } from "./kbs.ts";

const base = { sex: "female" as Sex, pregnancy: "no" as PregnancyStatus };
const run = (findings: Findings, over: Partial<typeof base> & { context?: { course?: "acute" | "subacute" | "chronic" } } = {}) => normalize(dev, { findings, ...base, ...over });

test("states are classified and unknown symptom ids are reported, not scored", () => {
  const n = run({ S_FATIGUE: { state: "present", severity: "moderate" }, S_EDEMA: { state: "absent" }, S_SIGHING: { state: "unsure" }, S_NOT_A_SYMPTOM: { state: "present" } });
  assert.deepEqual([...n.present], ["S_FATIGUE"]);
  assert.deepEqual([...n.absent], ["S_EDEMA"]);
  assert.deepEqual([...n.unsure], ["S_SIGHING"]);
  assert.deepEqual(n.unknown, ["S_NOT_A_SYMPTOM"]);
  assert.equal(n.findings.has("S_NOT_A_SYMPTOM"), false);
});

test("severity factor and quality coefficient follow the parameters", () => {
  const n = run({
    S_FATIGUE: { state: "present", severity: "light" }, S_LOOSE_STOOL: { state: "present", severity: "severe" }, S_NO_THIRST: { state: "present" },
    T_BODY_PALE: { state: "present" }, P_FLOAT: { state: "present" }, S_HEADACHE: { state: "present", severity: "moderate", source: "measured" }, S_EDEMA: { state: "absent" },
  });
  const f = (id: string) => n.findings.get(id)!;
  assert.deepEqual([f("S_FATIGUE").sev, f("S_FATIGUE").q, f("S_FATIGUE").source], [0.6, 1.0, "inquiry"]);
  assert.deepEqual([f("S_LOOSE_STOOL").sev, f("S_LOOSE_STOOL").severity], [1.0, "severe"]);
  assert.equal(f("S_NO_THIRST").sev, 1.0, "ungraded present finding counts as 1.0 (SOP §9.5)");
  assert.deepEqual([f("T_BODY_PALE").q, f("T_BODY_PALE").source], [0.7, "guided"]);
  assert.deepEqual([f("P_FLOAT").q, f("P_FLOAT").source], [0.5, "pulse"]);
  assert.deepEqual([f("S_HEADACHE").q, f("S_HEADACHE").source], [0.9, "measured"], "an explicit source overrides the prefix");
  assert.equal(f("S_EDEMA").sev, 0, "a finding that is not present adds no evidence");
});

test("contradictions are reported with their group and never resolved", () => {
  const n = run({ S_LOOSE_STOOL: { state: "present" }, S_CONSTIPATION: { state: "present" }, P_FLOAT: { state: "present" }, P_SINK: { state: "present" },
    S_COLD_LIMBS: { state: "present" }, S_HEAT_PALMS_SOLES: { state: "present" } });
  const byGroup = Object.fromEntries(n.conflicts.map((c) => [c.group, c]));
  assert.deepEqual(byGroup["X_STOOL_CONSISTENCY"]?.symptoms, ["S_LOOSE_STOOL", "S_CONSTIPATION"]);
  assert.equal(byGroup["X_STOOL_CONSISTENCY"]?.kind, "exclusive");
  assert.equal(byGroup["X_PULSE_DEPTH"]?.kind, "exclusive");
  assert.equal(byGroup["C_COLD_HEAT_LIMBS"]?.kind, "conflict");
  assert.ok(n.present.has("S_LOOSE_STOOL") && n.present.has("S_CONSTIPATION"), "both findings stay (P9: no silent choice)");
  assert.deepEqual(run({ S_LOOSE_STOOL: { state: "present" }, S_CONSTIPATION: { state: "absent" } }).conflicts, []);
});

test("coverage counts answered core questions: present or absent answers, not skips", () => {
  assert.equal(run({}).coverage, 0);
  const answeredOne = run({ S_AVERSION_COLD: { state: "present" }, S_FEAR_COLD: { state: "absent" } });
  assert.deepEqual(answeredOne.applicableCore.length - answeredOne.unansweredCore.length, 1);
  assert.equal(run({ S_AVERSION_COLD: { state: "unsure" }, S_FEAR_COLD: { state: "unsure" } }).coverage, 0, "skipping answers nothing");
  const all: Record<string, { state: "present" | "absent" }> = {};
  for (const q of dev.questions.filter((q) => q.core)) for (const o of q.options) for (const s of o.symptoms) all[s] = { state: "absent" };
  assert.equal(run(all, { context: { course: "chronic" } }).coverage, 1);
  assert.ok(run(all).coverage < 1, "the onset question needs the context");
});

test("question applicability: sex and pregnancy", () => {
  const menses = dev.questionById.get("Q_MENSES")!;
  assert.equal(applies(menses, "female", "no"), true);
  assert.equal(applies(menses, "female", "possible"), false);
  assert.equal(applies(menses, "female", "yes"), false);
  assert.equal(applies(menses, "male", "not-applicable"), false);
  const male = dev.questionById.get("Q_MALE")!;
  assert.equal(applies(male, "male", "not-applicable"), true);
  assert.equal(applies(male, "female", "no"), false);
  const n = run({}, { sex: "male", pregnancy: "not-applicable" });
  assert.ok(!n.applicableCore.includes("Q_MENSES"));
  assert.ok(n.applicableCore.includes("Q_COLD"));
  assert.equal(run({}, { pregnancy: "yes" }).applicableCore.includes("Q_MENSES"), false);
});

test("normalisation is deterministic and independent of key order", () => {
  const ids = [...dev.symptoms.keys()];
  forAll("normalize order", 100, (rng: Rng) => {
    const f: Record<string, { state: "present" | "absent" | "unsure"; severity?: "light" | "moderate" | "severe" }> = {};
    for (const id of rng.subset(ids, 0.1)) f[id] = { state: rng.pick(["present", "absent", "unsure"] as const) };
    return f;
  }, (f) => {
    const reversed = Object.fromEntries(Object.entries(f).reverse());
    const a = run(f), b = run(reversed);
    assert.deepEqual([...a.findings.keys()], [...b.findings.keys()]);
    assert.deepEqual(a.conflicts, b.conflicts);
    assert.equal(a.coverage, b.coverage);
  });
});
