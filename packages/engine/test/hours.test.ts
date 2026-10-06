// The person's choice of hour when the birth time is near a change of hour (docs/post-mvp/design/five-phase-extensions.md §5; task PM-27), at the engine: the chart of the other side is used for the
// birth blocks and for nothing else, the choice leaves no trace where it was not made, and — like every prior — it never moves the diagnosis.
import assert from "node:assert/strict";
import { test } from "node:test";
import { hourAlternatives, type BirthInput } from "@tcm/wuxing";
import { assess } from "../src/index.ts";
import type { AssessInput, Findings, Subject } from "../src/index.ts";
import { dev, release } from "./kbs.ts";
import { PARITY } from "./parity.ts";

const person = (over: Partial<Subject> = {}): Subject => ({ ageYears: 35, sex: "female", pregnancy: "no", lactating: false, medications: [], allergies: [], seriousChronicDisease: false, ...over });
const worked: Findings = PARITY.cases.find((c) => c.id === "worked-example")!.findings;
const answers = Object.fromEntries(dev.constitutionItems.types.flatMap((t) => t.items).map((it, i) => [it.id, i % 3 === 0 ? 5 : 2]));
const NOW = Date.UTC(2026, 9, 3, 12);

const base = { sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
/** A clock time on 12 May 1990 whose true solar time is within the margin of an hour boundary, and one that is not. */
const clocks = Array.from({ length: 1440 }, (_, m) => m).map((m) => ({ m, input: { year: 1990, month: 5, day: 12, hour: Math.floor(m / 60), minute: m % 60, ...base } as BirthInput }));
const near = clocks.find((c) => hourAlternatives(c.input).ambiguous && hourAlternatives(c.input).boundaryHour === 23)!.input;
const far = clocks.find((c) => !hourAlternatives(c.input).ambiguous)!.input;

const run = (kb: typeof dev, birth: BirthInput, over: Partial<AssessInput["options"]> = {}) => assess(kb, {
  subject: person({ birth }), redFlags: new Set(), findings: worked, constitutionAnswers: answers, options: { now: NOW, birthModule: true, ...over },
});

test("the other side's hour and day pillars are those the birth blocks are made from; the rest of the chart is the same", () => {
  const plain = run(dev, near);
  const picked = run(dev, { ...near, hourPick: "alternative" });
  const a = hourAlternatives(near);
  const p = plain.reference!.birth.pillars!;
  const q = picked.reference!.birth.pillars!;
  assert.deepEqual([p.day, p.hour], [a.primary.day, a.primary.hour]);
  assert.deepEqual([q.day, q.hour], [a.alternative!.day, a.alternative!.hour]);
  assert.deepEqual([q.year, q.month], [p.year, p.month]);
  assert.equal(picked.reference!.birth.trueSolarTime, plain.reference!.birth.trueSolarTime);
  assert.notDeepEqual(picked.reference!.innate, plain.reference!.innate, "the innate profile follows the pillars");
  assert.ok(picked.reference!.birth.warnings.some((w) => w.includes("other side")));
  assert.equal(plain.reference!.birth.warnings.some((w) => w.includes("other side")), false);
});

test("a prior is context: the scores, the observed panel, the verdict and the advice do not depend on the hour chosen", () => {
  const plain = run(dev, near);
  const picked = run(dev, { ...near, hourPick: "alternative" });
  assert.deepEqual(picked.patterns.map((x) => [x.id, x.pct]), plain.patterns.map((x) => [x.id, x.pct]));
  assert.deepEqual(picked.panel.wuxingFunction, plain.panel.wuxingFunction);
  assert.deepEqual(picked.verdict.patterns.map((x) => x.id), plain.verdict.patterns.map((x) => x.id));
  assert.deepEqual(picked.recommendations.formulas.map((f) => f.id), plain.recommendations.formulas.map((f) => f.id));
  assert.deepEqual(picked.policy, plain.policy);
});

test("the choice leaves no trace where it was not made: not near a boundary, with no hour, or with no birth blocks", () => {
  const plain = run(dev, far);
  assert.deepEqual(run(dev, { ...far, hourPick: "alternative" }), plain, "not near a boundary: nothing to choose");
  const unknown = run(dev, { ...near, unknownHour: true });
  assert.deepEqual(run(dev, { ...near, unknownHour: true, hourPick: "alternative" }), unknown);
  assert.equal(unknown.reference!.birth.pillars!.hour, null);
  const off = run(release, near, { birthModule: false });          // the release profile asks the person first; the development profile reads birth data whenever it is given
  assert.deepEqual(run(release, { ...near, hourPick: "alternative" }, { birthModule: false }), off, "the birth module off: the birth data is not read");
});

test("the stamps of a result made with the choice are those of one made without it: the choice is an answer, not a parameter", () => {
  const plain = run(dev, near);
  const picked = run(dev, { ...near, hourPick: "alternative" });
  assert.deepEqual(picked.meta, plain.meta);
  assert.equal(picked.meta.paramsFingerprint, plain.meta.paramsFingerprint);
});

test("the release profile takes the other side's pillars too", () => {
  const a = run(release, { ...near, hourPick: "alternative" });
  const alt = hourAlternatives(near).alternative!;
  assert.deepEqual([a.reference!.birth.pillars!.day, a.reference!.birth.pillars!.hour], [alt.day, alt.hour]);
});
