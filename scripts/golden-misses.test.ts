// Where the golden cases miss (task PM-59): the committed report is what the cases and the knowledge base give; it details the tuning half and never names a held-out case;
// each kind of miss is recognised at its step; the what-ifs change copies, never a case.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { evaluateCase, type GoldenCase } from "../packages/engine/src/golden.ts";
import { loadGoldenCases } from "../packages/engine/test/golden-files.ts";
import { classify, heldOutDetail, likelyCause, loadKbs, report, REPORT, weightBySource, whatIfs } from "./golden-misses.ts";

const kbs = loadKbs();
const cases = loadGoldenCases();
const text = report(kbs, cases);
const tuning = cases.filter((c) => c.split === "tuning"), held = cases.filter((c) => c.split === "held-out");
const missOf = (c: GoldenCase) => classify(kbs.dev, c, evaluateCase(kbs, c));
/** A tuning case that passes and presents a pattern: the base of the constructed misses below. */
const passing = tuning.find((c) => missOf(c) === null && c.expect.patterns?.first !== undefined && c.expect.formulas?.top3 !== undefined)!;
const withExpect = (c: GoldenCase, expect: GoldenCase["expect"]): GoldenCase => ({ ...c, id: "G-9999", expect });

test("the committed report is what the cases and the knowledge base give", () => {
  assert.equal(readFileSync(REPORT, "utf8"), text, "run `node scripts/golden-misses.ts --write`");
});

test("the report details every tuning miss and names no held-out case", () => {
  for (const c of tuning) assert.equal(text.includes(`### ${c.id} `), missOf(c) !== null, c.id);
  for (const c of held) assert.ok(!text.includes(c.id), `${c.id} is held out: numbers only (test plan §3.5)`);
  const section3 = text.slice(text.indexOf("## 3."), text.indexOf("## 4."));
  assert.doesNotMatch(section3, /G-\d{4}|### /);
  assert.match(text, /Nothing was tuned to write it/);
});

test("G-0003 misses because its answers alone stay under the threshold of presentation, and its formula miss follows", () => {
  const c = cases.find((x) => x.id === "G-0003")!;
  const m = missOf(c)!;
  assert.equal(m.pattern?.kind, "no-verdict");
  assert.equal(m.formula?.kind, "no-verdict");
  const w = weightBySource(kbs.dev, "EX3");
  assert.equal(w.total, w.inquiry + w.tongue + w.pulse);
  assert.ok(m.pattern!.scores[0]!.pct < kbs.dev.params.reconcile.merge_threshold);
  assert.match(likelyCause(kbs.dev, c, m), /no tongue and no pulse.*under the 40 % of presentation.*the formula miss follows/);
});

test("the what-ifs change copies of a case, never the case", () => {
  const c = cases.find((x) => x.id === "G-0003")!;
  const before = JSON.stringify(c);
  const v = whatIfs(kbs.dev, c, "EX3");
  assert.equal(v.length, 4);
  assert.equal(JSON.stringify(c), before);
  assert.ok(v.every((x) => x.pct >= missOf(c)!.pattern!.scores[0]!.pct), "adding evidence never lowers the pattern");
});

test("each kind of miss is recognised at its step", () => {
  assert.ok(passing, "a passing tuning case with a pattern and a formula expectation");
  assert.equal(missOf(passing), null);
  const presented = kbs.dev.patternById.get(passing.expect.patterns!.first!)!;
  // another pattern expected: it is not presented
  const other = kbs.dev.patterns.find((p) => p.id !== presented.id && !p.formulas.some((f) => presented.formulas.includes(f)))!;
  assert.equal(missOf(withExpect(passing, { patterns: { first: other.id, top3: [other.id] } }))?.pattern?.kind, "not-presented");
  // a formula of a pattern that is not presented
  const foreign = other.formulas.find((f) => !presented.formulas.includes(f))!;
  assert.equal(missOf(withExpect(passing, { formulas: { top3: [foreign] } }))?.formula?.kind, "pattern-missed");
  // nothing present at all: no verdict, for the pattern and for the formula
  const empty = { ...withExpect(passing, passing.expect), input: { ...passing.input, findings: {} } };
  const m = missOf(empty)!;
  assert.deepEqual([m.pattern?.kind, m.formula?.kind], ["no-verdict", "no-verdict"]);
});

test("the held-out detail is for the terminal, and holds the held-out misses only", () => {
  const detail = heldOutDetail(kbs, cases);
  for (const c of tuning) assert.ok(!detail.includes(`### ${c.id} `), c.id);
  assert.match(detail, /after a calibration session only/);
});
