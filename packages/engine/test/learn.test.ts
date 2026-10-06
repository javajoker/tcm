import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMON_SHARE, KEY_SHARE, featureBand, featuresOf } from "../src/index.ts";
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
