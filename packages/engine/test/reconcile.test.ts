import assert from "node:assert/strict";
import { test } from "node:test";
import { kappaOf, mixedKinds, normalize, reconcile, scoreElements, scorePatterns, synthesizePanel } from "../src/index.ts";
import type { Findings, ReconcileInput, ScoredElement, ScoredPattern } from "../src/index.ts";
import { dev } from "./kbs.ts";
import { PARITY } from "./parity.ts";

const sp = (id: string, pct: number, q = 1, weight = 2): ScoredPattern => ({
  id, pct, band: pct >= 60 ? "high" : pct >= 40 ? "medium" : pct >= 20 ? "weak" : "none", positive: 0, negative: 0, maxScore: 10, requiredPresent: true,
  evidence: [{ symptomId: "S_X", weight, sev: 1, q, contribution: weight * q }], against: [],
});
const input = (patterns: ScoredPattern[], over: Partial<ReconcileInput> = {}): ReconcileInput =>
  ({ patterns, elements: [], coverage: 1, conflicts: [], alignment: null, present: new Set(), answered: new Set(), ...over });

test("confidence grid boundaries (SOP §11.3): high needs Pct1 ≥ 60, gap ≥ 15, coverage ≥ 0.8, κ ≥ 0.85", () => {
  const v = (pct1: number, pct2: number, coverage: number, q = 1) => reconcile(dev, input([sp("SP1", pct1, q), sp("SP2", pct2)], { coverage })).confidence;
  assert.equal(v(60, 45, 0.8), "high");
  assert.equal(v(59.9, 40, 0.8), "medium", "Pct1 just below 60");
  assert.equal(v(60, 45.1, 0.8), "medium", "gap just below 15");
  assert.equal(v(60, 45, 0.79), "medium", "coverage just below 0.8");
  assert.equal(v(60, 45, 0.8, 0.84), "medium", "κ just below 0.85");
  assert.equal(v(40, 32, 0.6), "medium");
  assert.equal(v(40, 32.1, 0.6), "low", "gap just below 8");
  assert.equal(v(40, 30, 0.59), "low", "coverage just below 0.6");
  assert.equal(v(39.9, 0, 1), "insufficient", "Pct1 < 40");
  assert.equal(reconcile(dev, input([sp("SP1", 39.9)])).status, "insufficient");
  assert.equal(reconcile(dev, input([sp("SP1", 55)])).status, "established");
});

test("states for the scope policy follow the confidence", () => {
  assert.deepEqual(reconcile(dev, input([sp("SP1", 45), sp("SP2", 44)])).states, { lowConfidence: true, insufficientInformation: false, conflictingData: false });
  assert.deepEqual(reconcile(dev, input([sp("SP1", 20)])).states, { lowConfidence: false, insufficientInformation: true, conflictingData: false });
  assert.equal(reconcile(dev, input([sp("SP1", 90), sp("SP2", 10)], { conflicts: [{ kind: "exclusive", group: "X_PULSE_DEPTH", symptoms: ["P_FLOAT", "P_SINK"] }] })).states.conflictingData, true);
  assert.equal(reconcile(dev, input([sp("SP1", 90), sp("SP2", 10)], { conflicts: [{ kind: "conflict", group: "C_SWEAT", symptoms: ["S_NO_SWEAT", "S_SPONTANEOUS_SWEAT"] }] })).states.conflictingData, false, "a soft conflict is reported, not a state");
});

test("conflicting data lowers the confidence one level; so does 錯雜", () => {
  const strong = [sp("SP1", 80), sp("SP2", 10)];
  assert.equal(reconcile(dev, input(strong)).confidence, "high");
  const c = reconcile(dev, input(strong, { conflicts: [{ kind: "exclusive", group: "X", symptoms: ["a", "b"] }] }));
  assert.deepEqual([c.confidence, c.lowered], ["medium", ["conflict"]]);
  const el = (id: string, pct: number): ScoredElement => ({ id, pct, band: "medium", evidence: [], against: [] });
  const cold = dev.elements.find((e) => e.nature === "寒")!.id, heat = dev.elements.find((e) => e.nature === "火")!.id;
  const m = reconcile(dev, input(strong, { elements: [el(cold, 45), el(heat, 50)] }));
  assert.deepEqual([m.confidence, m.mixed, m.lowered], ["medium", ["cold-heat"], ["mixed"]]);
  const both = reconcile(dev, input(strong, { elements: [el(cold, 45), el(heat, 50)], conflicts: [{ kind: "exclusive", group: "X", symptoms: ["a", "b"] }] }));
  assert.equal(both.confidence, "low");
  assert.equal(reconcile(dev, input([sp("SP1", 30)], { elements: [el(cold, 45), el(heat, 50)] })).lowered.length, 0, "no verdict, nothing to lower");
});

test("only patterns with Pct ≥ 40 are presented, at most three, best first", () => {
  const v = reconcile(dev, input([sp("SP1", 70), sp("SP2", 55), sp("LV1", 50), sp("LV2", 45), sp("KD1", 41), sp("KD2", 30)], { coverage: 0.9 }));
  assert.deepEqual(v.patterns.map((p) => p.id), ["SP1", "SP2", "LV1"]);
  assert.equal(reconcile(dev, input([sp("SP1", 39)])).patterns.length, 0);
});

test("external patterns are presented before internal ones when the course is acute (先外後內)", () => {
  const v = reconcile(dev, input([sp("SP1", 70), sp("EX2", 50)], { coverage: 0.9, course: "acute" }));
  assert.deepEqual(v.patterns.map((p) => p.id), ["EX2", "SP1"]);
  assert.equal(v.externalFirst, true);
  assert.equal(reconcile(dev, input([sp("EX2", 70), sp("EX4", 50)], { course: "acute" })).externalFirst, false, "two external patterns keep their order");
  for (const course of ["chronic", "subacute", undefined] as const) {
    const w = reconcile(dev, input([sp("SP1", 70), sp("EX2", 50)], { coverage: 0.9, ...(course ? { course } : {}) }));
    assert.deepEqual(w.patterns.map((p) => p.id), ["SP1", "EX2"], `course ${course}: order by score`);
    assert.equal(w.externalFirst, false);
  }
});

test("tie-break: within the margin the pattern aligned with the reference goes first; a draw keeps both", () => {
  const spleenEl = dev.patternById.get("SP1")!;
  void spleenEl;
  const alignment = { 木: "neutral", 火: "neutral", 土: "aligned", 金: "neutral", 水: "neutral" } as const;
  // LV1 (木) leads by 2 points, SP1 (土) is aligned with the reference → SP1 first
  const swapped = reconcile(dev, input([sp("LV1", 52), sp("SP1", 50)], { alignment }));
  assert.deepEqual(swapped.patterns.map((p) => p.id), ["SP1", "LV1"]);
  assert.deepEqual(swapped.tieBreak, { between: ["LV1", "SP1"], margin: 2, chosen: "SP1", by: "alignment" });
  const kept = reconcile(dev, input([sp("SP1", 52), sp("LV1", 50)], { alignment }));
  assert.deepEqual(kept.patterns.map((p) => p.id), ["SP1", "LV1"]);
  assert.equal(kept.tieBreak?.chosen, "SP1");
  const draw = reconcile(dev, input([sp("SP1", 52), sp("LV1", 50)], { alignment: { 木: "neutral", 火: "neutral", 土: "neutral", 金: "neutral", 水: "neutral" } }));
  assert.deepEqual([draw.tieBreak?.chosen, draw.tieBreak?.by], [null, "none"]);
  const far = reconcile(dev, input([sp("LV1", 60), sp("SP1", 50)], { alignment }));
  assert.equal(far.tieBreak, null, "a gap of 5 or more is no tie");
  assert.deepEqual(far.patterns.map((p) => p.id), ["LV1", "SP1"]);
  const noRef = reconcile(dev, input([sp("LV1", 52), sp("SP1", 50)]));
  assert.equal(noRef.tieBreak?.by, "none");
});

test("κ is the weight-averaged data quality of the evidence behind the leading pattern", () => {
  assert.equal(kappaOf(undefined), 0);
  assert.equal(kappaOf({ ...sp("SP1", 50), evidence: [] }), 0);
  const mixed: ScoredPattern = { ...sp("SP1", 50), evidence: [
    { symptomId: "a", weight: 3, sev: 1, q: 1, contribution: 3 }, { symptomId: "b", weight: 1, sev: 1, q: 0.5, contribution: 0.5 }] };
  assert.ok(Math.abs(kappaOf(mixed) - (3 * 1 + 1 * 0.5) / 4) < 1e-12);
});

test("differential: symptoms that separate the top two patterns, not yet answered", () => {
  const findings: Findings = Object.fromEntries(Object.entries(dev.patternById.get("EX2")!.weights).filter(([, w]) => w >= 2).map(([s]) => [s, { state: "present" as const, severity: "moderate" as const }]));
  const n = normalize(dev, { findings, sex: "female", pregnancy: "no" });
  const patterns = scorePatterns(dev, n);
  const v = reconcile(dev, input(patterns, { elements: scoreElements(dev, n), coverage: n.coverage, present: n.present, answered: new Set([...n.present, ...n.absent]) }));
  assert.ok(v.differential.length === 2);
  const [a, b] = v.differential as [typeof v.differential[number], typeof v.differential[number]];
  assert.deepEqual([a.lean, a.over], [b.over, b.lean]);
  for (const d of v.differential) {
    assert.ok(d.symptoms.length <= 5);
    for (const s of d.symptoms) {
      assert.ok(!n.present.has(s.symptomId) && !n.absent.has(s.symptomId), "already answered symptoms are not asked again");
      assert.ok(s.weight > 0 && (s.otherWeight === 0 || s.otherAgainst > 0));
    }
  }
});

test("real cases: each typical patient is established and led by its own pattern", () => {
  for (const c of PARITY.cases.filter((x) => x.id.startsWith("typical-"))) {
    const n = normalize(dev, { findings: c.findings, sex: "female", pregnancy: "no" });
    const patterns = scorePatterns(dev, n);
    const panel = synthesizePanel(dev, patterns, null);
    void panel;
    const v = reconcile(dev, input(patterns, { elements: scoreElements(dev, n), coverage: n.coverage, present: n.present, answered: new Set([...n.present, ...n.absent]) }));
    assert.equal(v.status, "established", c.id);
    assert.equal(v.patterns[0]?.id, c.id.replace("typical-", ""), c.id);
    const k = v.confidenceInputs.kappa;
    assert.ok(k > 0.5 && k <= 1, `κ ${k}: inquiry symptoms have q = 1, tongue and pulse lower it`);
  }
});

test("mixedKinds uses the nature groups of the parameters", () => {
  const el = (nature: string, pct: number): ScoredElement => ({ id: dev.elements.find((e) => e.nature === nature)!.id, pct, band: "medium", evidence: [], against: [] });
  assert.deepEqual(mixedKinds(dev, [el("氣虛", 45), el("痰", 45)]), ["deficiency-excess"]);
  assert.deepEqual(mixedKinds(dev, [el("氣虛", 45), el("痰", 39)]), []);
  assert.deepEqual(mixedKinds(dev, [el("陽虛", 50), el("火", 50)]), ["cold-heat", "deficiency-excess"], "陽虛 is both cold and deficient");
});
