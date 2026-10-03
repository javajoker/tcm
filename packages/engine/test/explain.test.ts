import assert from "node:assert/strict";
import { test } from "node:test";
import {
  baselineFacts, buildReference, checkConsistency, citationsOf, classicalModifications, evaluateSafety, explain, fitFormulas, greedyModify, modificationPool, normalize, orient,
  reconcile, resolvePolicy, scoreElements, scorePatterns, synthesizePanel,
} from "../src/index.ts";
import type { Findings, TraceItem } from "../src/index.ts";
import { dev } from "./kbs.ts";
import { PARITY } from "./parity.ts";

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const BIRTH = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;

function trace(findings: Findings, medications: ("anticoagulant")[] = []) {
  const n = normalize(dev, { findings, sex: "female", pregnancy: "no" });
  const patterns = scorePatterns(dev, n), elements = scoreElements(dev, n);
  const reference = buildReference(dev, { birth: BIRTH, birthModule: false, now: NOW })!;
  const panel = synthesizePanel(dev, patterns, reference.panel);
  const verdict = reconcile(dev, { patterns, elements, coverage: n.coverage, conflicts: n.conflicts, alignment: panel.alignment, present: n.present, answered: new Set([...n.present, ...n.absent]) });
  const fits = fitFormulas(dev, panel.observed, n).slice(0, 3);
  const top = dev.formulas.get(fits[0]!.id)!;
  const mod = greedyModify(dev, top, panel.observed, fits[0]!.k, modificationPool(dev));
  const policy = resolvePolicy(dev, { ...baselineFacts(), medications });
  const safety = evaluateSafety(dev, { subject: { ageYears: 35, pregnant: false, lactating: false, medications, allergies: [], constitution: null }, policy, bagang: panel.bagang,
    candidates: fits.map((f) => ({ kind: "formula" as const, formula: dev.formulas.get(f.id)! })) });
  const t = explain({ kb: dev, patterns, elements, verdict, panel, reference, conflicts: n.conflicts, consistency: checkConsistency(dev, orient(dev, n, undefined), panel.bagang), formulas: fits,
    modifications: [mod], classical: [{ formulaId: top.id, items: classicalModifications(top, n.present) }], safety });
  return { t, verdict, panel, reference };
}
const of = <K extends TraceItem["kind"]>(t: TraceItem[], kind: K) => t.filter((x): x is Extract<TraceItem, { kind: K }> => x.kind === kind);
const worked = PARITY.cases.find((c) => c.id === "worked-example")!.findings;

test("the trace of the worked example: evidence, theory, panel, priors, alignment, transmission, formulas, modifications", () => {
  const { t } = trace(worked);
  const ev = of(t, "evidence").filter((e) => e.patternId === "SP1");
  assert.equal(ev.length, 7, "the seven supporting symptoms of SOP §9.5");
  assert.equal(ev[0]!.symptomId, "S_LOOSE_STOOL");
  assert.ok(ev.every((e) => e.contribution > 0 && Math.abs(e.contribution - e.weight * e.severity * e.quality) < 1e-12));
  const th = of(t, "theory").find((x) => x.patternId === "SP1")!;
  assert.ok(th.citations.length > 0 && th.citations.every((c) => dev.citation(c)), "theory citations resolve to verified quotations");
  const panel = of(t, "panel");
  assert.ok(panel.some((p) => p.dim === "脾.qi" && p.from.includes("SP1")));
  assert.deepEqual([...new Set(of(t, "prior").map((p) => p.block))].sort(), ["annualBazi", "innate", "season", "yunqi"]);
  assert.ok(of(t, "prior").every((p) => Math.abs(p.degree) >= 0.05));
  assert.deepEqual(of(t, "alignment").map((a) => [a.element, a.alignment, a.effect]), [["土", "opposed", "context"]]);
  const tr = of(t, "transmission");
  assert.deepEqual(tr.map((x) => x.rule), ["母病及子", "乘侮自深"]);
  assert.ok(tr.every((x) => dev.citation(x.citation) !== undefined || x.citation.length > 0));
  const formulas = of(t, "formula");
  assert.equal(formulas[0]!.formulaId, "F_SHENLING");
  assert.ok(formulas[0]!.citations.every((c) => dev.citation(c)));
  assert.ok(formulas[0]!.matched.length > 0);
  const mods = of(t, "modification");
  assert.deepEqual(mods.map((m) => [m.op, m.herbId]).filter(([op]) => op !== "classical"), [["add", "herb-dazao"], ["add", "herb-zhigancao"], ["remove", "herb-yiyiren"]]);
});

test("evidence against, element decomposition and what-would-change items are present when they exist", () => {
  const { t, verdict } = trace(worked);
  assert.ok(of(t, "element").every((e) => e.pct >= dev.params.pattern.bands.weak && Object.keys(e.projection).length > 0));
  const w = of(t, "whatWouldChange");
  assert.ok(w.length >= 1 && w.every((x) => x.ifSymptoms.length > 0 && x.ifSymptoms.length <= 3));
  assert.ok(w.every((x) => verdict.patterns.map((p) => p.id).includes(x.shiftsTo) || dev.patternById.has(x.shiftsTo)));
  assert.equal(of(trace(worked).t, "against").length, 0, "nothing contradicts the worked example");
  const contradicted = of(trace({ ...worked, S_ABD_REFUSE_PRESS: { state: "present" } }).t, "against").find((a) => a.patternId === "SP1");
  assert.ok(contradicted && contradicted.symptomId === "S_ABD_REFUSE_PRESS" && contradicted.penalty > 0, "a symptom that refutes 脾氣虛 is shown as evidence against it");
});

test("suppressed items from the safety filter appear in the trace with their reason", () => {
  const { t } = trace(worked, ["anticoagulant"]);
  const s = of(t, "suppressed");
  for (const x of s) assert.ok(x.reason === "rule" ? x.ruleId !== null : x.ruleId === null);
});

test("without a reference there are no prior or alignment items", () => {
  const n = normalize(dev, { findings: worked, sex: "female", pregnancy: "no" });
  const patterns = scorePatterns(dev, n), panel = synthesizePanel(dev, patterns, null);
  const verdict = reconcile(dev, { patterns, elements: scoreElements(dev, n), coverage: n.coverage, conflicts: [], alignment: null, present: n.present, answered: n.present });
  const t = explain({ kb: dev, patterns, elements: scoreElements(dev, n), verdict, panel, reference: null, conflicts: [], consistency: [], formulas: [], modifications: [], classical: [], safety: null });
  assert.equal(of(t, "prior").length + of(t, "alignment").length, 0);
});

test("every recommendation is cited: the formulas shown carry citations that resolve; citationsOf lists them without duplicates", () => {
  const { t } = trace(worked);
  const cites = citationsOf(t);
  assert.ok(cites.length >= 3);
  assert.equal(new Set(cites).size, cites.length);
  assert.ok(of(t, "formula").every((f) => f.citations.length > 0));
  for (const id of cites) assert.ok(dev.citation(id) !== undefined, `citation ${id}`);
});

test("the trace is deterministic", () => {
  assert.deepEqual(trace(worked).t, trace(worked).t);
});

test("conflicts and consistency flags are traced", () => {
  const { t } = trace({ ...worked, P_FLOAT: { state: "present" }, P_SINK: { state: "present" } });
  assert.ok(of(t, "conflict").some((c) => c.group === "X_PULSE_DEPTH" && c.conflictKind === "exclusive"));
});
