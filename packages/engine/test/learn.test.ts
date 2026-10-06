import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMON_SHARE, DISTINGUISHES, KEY_SHARE, MAX_QUESTIONS, comparePatterns, featureBand, featuresOf } from "../src/index.ts";
import { dev } from "./kbs.ts";

test("a weight is key from two thirds of the largest, common from one third, supporting below — at the boundaries exactly", () => {
  assert.equal(KEY_SHARE, 2 / 3);
  assert.equal(COMMON_SHARE, 1 / 3);
  assert.equal(featureBand(3, 3), "key");
  assert.equal(featureBand(2, 3), "key", "2 of 3 is exactly two thirds");
  assert.equal(featureBand(1, 3), "common", "1 of 3 is exactly one third");
  assert.equal(featureBand(2, 4), "common");
  assert.equal(featureBand(1, 4), "supporting");
  assert.equal(featureBand(3, 4), "key");
  assert.equal(featureBand(2, 6), "common", "2 of 6 is exactly one third");
  assert.equal(featureBand(1, 6), "supporting");
  assert.equal(featureBand(4, 6), "key");
  assert.equal(featureBand(3, 6), "common");
});

test("an empty or non-positive pattern has nothing key", () => {
  assert.equal(featureBand(0, 0), "supporting");
  assert.equal(featureBand(1, 0), "supporting");
  assert.equal(featureBand(-1, 3), "supporting");
  assert.deepEqual(featuresOf({}, {}), []);
});

test("features: strongest first with ties by id, then what speaks against, strongest first; nothing twice", () => {
  const f = featuresOf({ B: 2, A: 2, C: 1, D: 3 }, { Z: 1, Y: 2, A: 5 });
  assert.deepEqual(f.map((x) => `${x.symptomId}:${x.band}`), ["D:key", "A:key", "B:key", "C:common", "Y:against", "Z:against"]);
});

test("every pattern of the knowledge base has a key feature, no feature twice, and the bands follow the weights", () => {
  for (const p of dev.patterns) {
    const f = featuresOf(p.weights, p.against);
    assert.ok(f.some((x) => x.band === "key"), `${p.id}: a key feature`);
    assert.equal(new Set(f.map((x) => x.symptomId)).size, f.length, `${p.id}: no symptom twice`);
    assert.equal(f.filter((x) => x.band !== "against").length, Object.keys(p.weights).length, p.id);
    assert.equal(f.filter((x) => x.band === "against").length, Object.keys(p.against).length, p.id);
    const max = Math.max(...Object.values(p.weights));
    for (const x of f) if (x.band !== "against") assert.equal(x.band, featureBand(x.weight, max), `${p.id} ${x.symptomId}`);
  }
});

// ── comparePatterns ─────────────────────────────────────────────────────────

const ids = dev.patterns.map((p) => p.id);
const pairs = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b] as const));
const signed = (id: string, s: string): number => { const p = dev.patternById.get(id)!; return (p.weights[s] ?? 0) - (p.against[s] ?? 0); };

test("the three confusable pairs of K-07 are told apart by three questions of the bank, each at least two points", () => {
  for (const [a, b] of [["EX2", "EX4"], ["LG1", "EX4"], ["HT2", "KD1"]] as const) {
    const c = comparePatterns(dev, [a, b]);
    assert.equal(c.questions.length, MAX_QUESTIONS, `${a} vs ${b}`);
    for (const q of c.questions) { assert.ok(q.score >= DISTINGUISHES, `${a} vs ${b} ${q.questionId}`); assert.ok(dev.questionById.has(q.questionId)); assert.ok(q.symptoms.length > 0); }
    const scores = c.questions.map((q) => q.score);
    assert.deepEqual(scores, [...scores].sort((x, y) => y - x), "best first");
    assert.ok(c.distinguishing.length > 0, `${a} vs ${b}: features that tell them apart`);
  }
});

test("every pair of the 23 patterns: lists are consistent, ordered and never overlap", () => {
  assert.equal(pairs.length, 253);
  for (const [a, b] of pairs) {
    const c = comparePatterns(dev, [a, b]);
    const tag = `${a} vs ${b}`;
    assert.deepEqual(c.ids, [a, b]);
    const shared = new Set(c.shared.map((r) => r.symptomId));
    for (const r of c.distinguishing) { assert.ok(!shared.has(r.symptomId), `${tag} ${r.symptomId} in both`); assert.ok(r.spread >= DISTINGUISHES, tag); assert.equal(r.bands.length, 2); assert.ok(r.bands.some((x) => x === null) || new Set(r.bands).size > 1, `${tag} ${r.symptomId} looks the same in both`); }
    for (const r of c.shared) { assert.ok(r.spread < DISTINGUISHES || new Set(r.bands).size === 1, `${tag} ${r.symptomId}`); assert.ok(r.bands.every((x) => x !== null && x !== "against"), `${tag} ${r.symptomId}: weight in both`); }
    const spreads = c.distinguishing.map((r) => r.spread);
    assert.deepEqual(spreads, [...spreads].sort((x, y) => y - x), `${tag} widest first`);
    assert.ok(c.questions.length <= MAX_QUESTIONS && c.questions.every((q) => q.score > 0), tag);
    // a spread is the real gap between the records
    for (const r of [...c.distinguishing, ...c.shared]) assert.equal(r.spread, Math.abs(signed(a, r.symptomId) - signed(b, r.symptomId)), `${tag} ${r.symptomId}`);
  }
});

test("symmetry: the order of the patterns reorders the columns and nothing else", () => {
  for (const [a, b] of pairs) {
    const ab = comparePatterns(dev, [a, b]), ba = comparePatterns(dev, [b, a]);
    assert.deepEqual(ab.distinguishing.map((r) => r.symptomId), ba.distinguishing.map((r) => r.symptomId), `${a} ${b}`);
    assert.deepEqual(ab.shared.map((r) => r.symptomId), ba.shared.map((r) => r.symptomId));
    assert.deepEqual(ab.questions, ba.questions);
    for (const [i, r] of ab.distinguishing.entries()) assert.deepEqual([...ba.distinguishing[i]!.bands].reverse(), r.bands);
  }
});

test("a pattern compared with itself has nothing that tells it apart, and no question does", () => {
  for (const id of ids) {
    const c = comparePatterns(dev, [id, id]);
    assert.deepEqual(c.distinguishing, [], id);
    assert.deepEqual(c.questions, [], id);
    const p = dev.patternById.get(id)!;
    assert.equal(c.shared.length, Object.keys(p.weights).length, `${id}: every weighted symptom is shared with itself`);
  }
});

test("three patterns: the spread is the widest gap among them, and a symptom against one pattern and for another tells them apart", () => {
  const c = comparePatterns(dev, ["EX1", "EX2", "SP1"]);
  for (const r of c.distinguishing) { const v = ["EX1", "EX2", "SP1"].map((id) => signed(id, r.symptomId)); assert.equal(r.spread, Math.max(...v) - Math.min(...v)); assert.equal(r.bands.length, 3); }
  const against = [...dev.symptoms.keys()].find((s) => ["EX1", "EX2"].some((id) => (dev.patternById.get(id)!.against[s] ?? 0) > 0) && ["EX1", "EX2"].some((id) => (dev.patternById.get(id)!.weights[s] ?? 0) > 0));
  assert.ok(against, "the data has a symptom for one of EX1 and EX2 and against the other");
  const two = comparePatterns(dev, ["EX1", "EX2"]);
  const row = two.distinguishing.find((r) => r.symptomId === against);
  assert.ok(row, `${against} tells EX1 and EX2 apart`);
  assert.ok(row.bands.includes("against"));
});

test("it needs two or three known patterns", () => {
  assert.throws(() => comparePatterns(dev, ["EX1"]), RangeError);
  assert.throws(() => comparePatterns(dev, ["EX1", "EX2", "SP1", "LV1"]), RangeError);
  assert.throws(() => comparePatterns(dev, ["EX1", "NOPE"]), /unknown pattern NOPE/);
});
