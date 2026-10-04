// The golden-case suite: structure is always checked; the concordance targets bite only once `test/golden/config.json` says `blocking` (milestone M3, test plan §3.5).
import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCase, formatReport, goldenSkeleton, missedTargets, signOf, summarize, validateCase, assessGolden, topPatterns } from "../src/golden.ts";
import type { GoldenCase, GoldenInput } from "../src/golden.ts";
import { loadGoldenCases, loadGoldenConfig } from "./golden-files.ts";
import { dev, release } from "./kbs.ts";
import { interviewOf } from "./vignettes.ts";

const kbs = { dev, release };
const cases = loadGoldenCases();
const config = loadGoldenConfig();

const sp1 = interviewOf(dev, "SP1");
const input: GoldenInput = { subject: { ageYears: 35, sex: "male", pregnancy: "not-applicable", lactating: false, medications: [], allergies: [], seriousChronicDisease: false }, redFlags: [], findings: sp1.findings, context: { course: "chronic" } };
const mk = (over: Partial<GoldenCase> & Pick<GoldenCase, "expect">): GoldenCase => ({ id: "G-9999", title: "t", authoredBy: "synthetic", split: "tuning", input, ...over });

test("every case file is well-formed: ids unique and sequential, known patterns, formulas and symptoms, a split", () => {
  const ids = cases.map((c) => c.id);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  assert.deepEqual(cases.flatMap((c) => validateCase(dev, c)), []);
  assert.ok(cases.some((c) => c.split === "tuning") && cases.some((c) => c.split === "held-out"), "both halves exist");
});

test("the suite reports; the targets are enforced only when the config says blocking", () => {
  const results = cases.map((c) => evaluateCase(kbs, c));
  const summary = summarize(results);
  console.log(formatReport(results));
  assert.equal(summary.all.cases, cases.length);
  if (config.blocking) assert.deepEqual(missedTargets(summary, config), []);
  else assert.equal(config.blocking, false);
});

test("the seed set covers every pattern once, and says it is synthetic", () => {
  const typical = cases.filter((c) => c.title.startsWith("typical patient of"));
  assert.deepEqual(typical.map((c) => c.expect.patterns!.first).sort(), dev.patterns.map((p) => p.id).sort());
  assert.ok(cases.every((c) => c.authoredBy === "synthetic"), "no case is practitioner-agreed yet");
});

// ── the checker itself ──────────────────────────────────────────────────────

test("pattern concordance: the practitioner's pattern in the engine's top three counts; first is stricter; mustNotInclude is a separate failure", () => {
  const top = topPatterns(assessGolden(dev, input));
  assert.equal(top[0], "SP1");
  const ok = evaluateCase(kbs, mk({ expect: { patterns: { first: "SP1" } } }));
  assert.deepEqual([ok.patternFirst, ok.patternTop3, ok.forbidden], [true, true, false]);
  const wrongFirst = evaluateCase(kbs, mk({ expect: { patterns: { top3: ["SP3", "SP1"] } } }));
  assert.deepEqual([wrongFirst.patternFirst, wrongFirst.patternTop3], [null, true], "top3 alone: one of the acceptable patterns is enough");
  const miss = evaluateCase(kbs, mk({ expect: { patterns: { first: "EX1" } } }));
  assert.deepEqual([miss.patternFirst, miss.patternTop3], [false, false]);
  const forbidden = evaluateCase(kbs, mk({ expect: { patterns: { mustNotInclude: ["SP1"] } } }));
  assert.equal(forbidden.forbidden, true);
  assert.match(forbidden.checks[0]!.detail, /SP1 must not be among/);
});

test("formula concordance and mustNotInclude", () => {
  assert.equal(evaluateCase(kbs, mk({ expect: { formulas: { top3: ["F_SIJUNZI"] } } })).formulaTop3, true);
  assert.equal(evaluateCase(kbs, mk({ expect: { formulas: { top3: ["F_MAHUANG"] } } })).formulaTop3, false);
  assert.equal(evaluateCase(kbs, mk({ expect: { formulas: { mustNotInclude: ["F_SIJUNZI"] } } })).forbidden, true);
});

test("policy and suppressed expectations are judged per profile; every mismatch is described", () => {
  const withMed = { ...input, subject: { ...input.subject, medications: ["anticoagulant"] as const } };
  const good = evaluateCase(kbs, mk({ input: withMed as GoldenInput, expect: { policy: { release: { level: "L1", notices: ["N-MED"] }, dev: { level: "L3" } }, suppressed: { release: [{ kind: "formula", id: "F_SHENLING", reason: "rule", ruleId: "R_ANTICOAGULANT" }] } } }));
  assert.equal(good.policy, true);
  const bad = evaluateCase(kbs, mk({ expect: { policy: { release: { level: "L0", notices: ["N-MED"] } }, suppressed: { release: [{ kind: "formula", id: "F_SHENLING", reason: "rule", ruleId: "R_ANTICOAGULANT" }] } } }));
  assert.equal(bad.policy, false);
  assert.equal(bad.checks.filter((c) => !c.ok).length, 3);
});

test("panel signs use the ±0.5 threshold; confidence is compared as a word", () => {
  assert.deepEqual([signOf(1.3), signOf(-1.3), signOf(0.4), signOf(-0.5), signOf(0)], ["+", "-", "0", "-", "0"]);
  const r = evaluateCase(kbs, mk({ expect: { panelSigns: { "脾.qi": "-", "肝.qi": "0" }, confidence: "medium" } }));
  assert.deepEqual([r.panelSigns, r.confidence], [true, true]);
  const w = evaluateCase(kbs, mk({ expect: { panelSigns: { "脾.qi": "+" }, confidence: "high" } }));
  assert.deepEqual([w.panelSigns, w.confidence], [false, false]);
});

test("rates ignore expectations a case does not state; the split is kept apart; targets name what is missed", () => {
  const a = evaluateCase(kbs, mk({ id: "G-9001", split: "tuning", expect: { patterns: { first: "SP1" } } }));
  const b = evaluateCase(kbs, mk({ id: "G-9002", split: "held-out", expect: { patterns: { first: "EX1" }, formulas: { top3: ["F_MAHUANG"] } } }));
  const s = summarize([a, b]);
  assert.deepEqual([s.tuning.patternTop3.rate, s.heldOut.patternTop3.rate, s.heldOut.formulaTop3.rate, s.tuning.formulaTop3.rate], [1, 0, 0, null]);
  const missed = missedTargets(s, { blocking: true, targets: { patternTop3: 0.8, formulaTop3: 0.7, policy: 1, minCases: 100 } });
  assert.ok(missed.some((m) => /2 cases; the target is at least 100/.test(m)));
  assert.ok(missed.some((m) => /held-out pattern top-3 concordance 0 %/.test(m)));
  assert.ok(missed.some((m) => /held-out formula top-3/.test(m)));
  assert.ok(missed.some((m) => /no case is agreed by a practitioner/.test(m)));
});

test("the report shows tuning detail but only the numbers of the held-out half, unless asked", () => {
  const bad = evaluateCase(kbs, mk({ id: "G-9003", split: "held-out", expect: { patterns: { first: "EX1" } } }));
  const hidden = formatReport([bad]);
  assert.ok(!hidden.includes("G-9003"), "no per-case detail for the held-out half");
  assert.ok(formatReport([bad], { heldOutDetail: true }).includes("G-9003"));
  const tune = evaluateCase(kbs, mk({ id: "G-9004", split: "tuning", expect: { patterns: { first: "EX1" } } }));
  assert.ok(formatReport([tune]).includes("G-9004"));
});

test("validateCase names what is wrong", () => {
  const bad = { ...mk({ expect: { patterns: { first: "NOPE" }, formulas: { top3: ["F_NOPE"] }, panelSigns: { "脾.qi": "?" as never } } }), id: "X1", split: "train", input: { ...input, redFlags: ["RF_NOPE"], findings: { S_NOPE: { state: "present" } } } } as unknown as GoldenCase;
  const problems = validateCase(dev, bad).join("\n");
  for (const re of [/id must look like/, /split must be/, /unknown red flag RF_NOPE/, /unknown symptom S_NOPE/, /unknown pattern NOPE/, /unknown formula F_NOPE/, /panelSigns 脾\.qi/]) assert.match(problems, re);
  assert.match(validateCase(dev, mk({ expect: {} })).join(), /expect is empty/);
  assert.match(validateCase(dev, mk({ expect: { patterns: { first: "SP1", top3: ["SP3"] } } })).join(), /first must be one of/);
});

test("the skeleton for a new case round-trips: it validates and its own expectations pass", () => {
  const a = assessGolden(dev, input);
  const skeleton = goldenSkeleton(input, a, "dev");
  const filled = { ...skeleton, id: "G-9005", title: "x", authoredBy: "synthetic" };
  assert.deepEqual(validateCase(dev, filled), []);
  const r = evaluateCase(kbs, filled);
  assert.deepEqual(r.checks.filter((c) => !c.ok), []);
  assert.equal(skeleton.expect.patterns?.first, "SP1");
  assert.equal(skeleton.id, "G-XXXX");
});
