import assert from "node:assert/strict";
import { test } from "node:test";
import { forAll, RUNS, Rng } from "./gen.ts";

test("the generator is deterministic for a seed and differs between seeds", () => {
  const a = Array.from({ length: 8 }, ((r) => () => r.next())(new Rng(1)));
  const b = Array.from({ length: 8 }, ((r) => () => r.next())(new Rng(1)));
  const c = Array.from({ length: 8 }, ((r) => () => r.next())(new Rng(2)));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.every((x) => x >= 0 && x < 1));
});

test("int, pick, subset and shuffle respect their ranges", () => {
  const r = new Rng(7);
  for (let i = 0; i < 500; i++) assert.ok([3, 4, 5].includes(r.int(3, 5)));
  assert.ok(["a", "b"].includes(r.pick(["a", "b"])));
  assert.deepEqual([...r.shuffle([1, 2, 3, 4, 5])].sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual(r.subset([1, 2, 3], 0), []);
  assert.deepEqual(r.subset([1, 2, 3], 1.01), [1, 2, 3]);
  assert.throws(() => r.pick([]), /empty/);
});

test("forAll reports the failing case with its seed", () => {
  assert.throws(
    () => forAll("always fails at 3", 10, (_rng, i) => i, (v) => { if (v === 3) throw new Error("boom"); }, 100),
    /property "always fails at 3" failed at case 3 \(seed \d+\): boom/,
  );
});

test("PROPERTY_RUNS multiplies the number of cases (the nightly job runs ×10)", () => {
  let count = 0;
  forAll("count", 7, () => 0, () => { count++; });
  assert.equal(count, 7 * RUNS);
});
