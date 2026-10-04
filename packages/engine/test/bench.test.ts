import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS, measureOf, median, percentile, violations, type Report } from "../bench/stats.ts";

const report = (assessP95: number, assessRatio: number, nqRatio = 0.001): Report => ({
  referenceMs: 100, assess: { p50: 1, p95: assessP95, max: 10, runs: 10, ratio: assessRatio }, nextQuestions: { p50: 0.1, p95: 0.1, max: 0.2, runs: 10, ratio: nqRatio },
});

test("percentiles are nearest-rank on the sorted samples", () => {
  const s = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.deepEqual([percentile(s, 50), percentile(s, 95), percentile(s, 100), percentile(s, 1)], [50, 95, 100, 1]);
  assert.equal(percentile([7], 95), 7);
  assert.ok(Number.isNaN(percentile([], 50)));
  assert.equal(median([3, 1, 2]), 2);
  assert.deepEqual(measureOf([5, 1, 3, 2, 4]), { p50: 3, p95: 5, max: 5, runs: 5 });
});

test("the guard passes within the budget and the baseline, and says why it fails otherwise", () => {
  assert.deepEqual(violations(report(5, 0.05), report(5, 0.05)), []);
  assert.deepEqual(violations(report(5, 0.059), report(5, 0.05)), [], "19.9 % slower is tolerated");
  assert.match(violations(report(5, 0.061), report(5, 0.05))[0]!, /assess is 22 % slower than the baseline/);
  assert.match(violations(report(51, 0.05), null)[0]!, /assess p95 is 51\.0 ms, over the 50 ms budget/);
  assert.match(violations(report(5, 0.05, 0.002), report(5, 0.05, 0.001))[0]!, /nextQuestions is 100 % slower/);
  assert.deepEqual(violations(report(5, 0.04), report(5, 0.05)), [], "faster is fine");
  assert.equal(violations(report(60, 0.5), report(5, 0.05)).length, 2, "both reasons are reported");
  assert.deepEqual([LIMITS.assessP95Ms, LIMITS.regression], [50, 0.2]);
});
