import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildChart, buildBase, evaluateAt, evaluateYear, annualPillarOf, layNatalCarriers, layExternalCarriers, luckStemShareAt,
  propagate, totalsOf, cloneCarriers, validateParams, paramsFingerprint, DEFAULT_PARAMS, ELEMENTS, shareDeltaOf,
  type BirthInput, type Carrier,
} from "../src/index.ts";

const births: BirthInput[] = [
  { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 },
  { year: 1985, month: 12, day: 7, hour: 7, minute: 15, sex: "female", timeZone: "Asia/Shanghai", longitude: 116.4 },
  { year: 2008, month: 12, day: 21, hour: 5, minute: 50, sex: "male", timeZone: "Asia/Hong_Kong", longitude: 114.17 },
  { year: 1983, month: 11, day: 9, hour: 10, minute: 0, sex: "female", timeZone: "Asia/Shanghai", longitude: 120 },
];

test("L1 natal total: 468 with four pillars (100 + 168 month + 100 + 100), 368 without the hour pillar", () => {
  for (const b of births) {
    const full = totalsOf(layNatalCarriers(buildChart(b))).grand;
    assert.ok(Math.abs(full - 468) < 1e-9, `${full}`);
    const noHour = totalsOf(layNatalCarriers(buildChart({ ...b, unknownHour: true }))).grand;
    assert.ok(Math.abs(noHour - 368) < 1e-9, `${noHour}`);   // no compensation for the missing pillar
  }
});

test("L1 per pillar: stem 40 + hidden 60 = 100; month branch re-normalised to exactly 120 after the 司令 boost", () => {
  for (const b of births) {
    const cs = layNatalCarriers(buildChart(b));
    const sum = (kind: string, layer: string): number => cs.filter((c) => c.pillar === kind && c.layer === layer).reduce((a, c) => a + c.weight, 0);
    for (const k of ["year", "day", "hour"]) {
      assert.ok(Math.abs(sum(k, "stem") - 40) < 1e-9);
      assert.ok(Math.abs(sum(k, "branch") - 60) < 1e-9);
    }
    assert.ok(Math.abs(sum("month", "stem") - 48) < 1e-9);
    assert.ok(Math.abs(sum("month", "branch") - 120) < 1e-9);
    assert.ok(cs.every((c) => c.weight >= 0));
    assert.equal(cs.filter((c) => c.isDayMaster).length, 1);
  }
});

test("司令 boost changes the inside of the month branch but not its total", () => {
  // Same month, early vs late: different commanding stem → different split, same 120.
  const early = layNatalCarriers(buildChart({ year: 2026, month: 5, day: 7, hour: 12, minute: 0, sex: "male", timeZone: "Asia/Shanghai", longitude: 120 }));
  const late = layNatalCarriers(buildChart({ year: 2026, month: 5, day: 28, hour: 12, minute: 0, sex: "male", timeZone: "Asia/Shanghai", longitude: 120 }));
  const monthHidden = (cs: Carrier[]): number[] => cs.filter((c) => c.pillar === "month" && c.layer === "branch").map((c) => c.weight);
  assert.notDeepEqual(monthHidden(early).map((x) => x.toFixed(3)), monthHidden(late).map((x) => x.toFixed(3)));
  assert.ok(Math.abs(monthHidden(early).reduce((a, b) => a + b, 0) - 120) < 1e-9);
  assert.ok(Math.abs(monthHidden(late).reduce((a, b) => a + b, 0) - 120) < 1e-9);
});

test("大運 carries 130 at any elapsed time; stem share slides 0.70 → 0.30 and crosses 0.50 at year 5; 流年 carries 110 as 40 + 70", () => {
  const luckPillar = { stem: "甲", branch: "子" } as const;
  for (const elapsed of [0, 1.7, 5, 8.3, 9.999]) {
    const { carriers } = layExternalCarriers({ pillar: luckPillar, elapsedYears: elapsed }, null);
    assert.ok(Math.abs(totalsOf(carriers).grand - 130) < 1e-9, `elapsed ${elapsed}`);
  }
  assert.ok(Math.abs(luckStemShareAt(0, DEFAULT_PARAMS) - 0.7) < 1e-12);
  assert.ok(Math.abs(luckStemShareAt(5, DEFAULT_PARAMS) - 0.5) < 1e-12);
  assert.ok(Math.abs(luckStemShareAt(10, DEFAULT_PARAMS) - 0.3) < 1e-12);
  const annual = layExternalCarriers(null, { stem: "丙", branch: "午" }).carriers;
  assert.ok(Math.abs(totalsOf(annual).grand - 110) < 1e-9);
  assert.ok(Math.abs((annual.find((c) => c.layer === "stem")?.weight ?? 0) - 40) < 1e-9);
});

test("L3: order independence — shuffling carriers changes nothing beyond 1e-9", () => {
  const base = buildBase(buildChart(births[0] as BirthInput));
  const carriers = cloneCarriers(base.natalL1);
  carriers.push(...layExternalCarriers({ pillar: { stem: "甲", branch: "申" }, elapsedYears: 5.5 }, { stem: "丙", branch: "午" }).carriers);
  const ref = propagate(carriers).byElement;
  let seed = 12345;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let k = 0; k < 40; k++) {
    const shuffled = [...carriers];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j] as Carrier, shuffled[i] as Carrier]; }
    const got = propagate(shuffled).byElement;
    for (const e of ELEMENTS) assert.ok(Math.abs(got[e] - ref[e]) < 1e-9, `${e}: ${got[e]} vs ${ref[e]}`);
  }
});

test("L3 invariants: non-negative, mass non-increasing, shape normalised back to the incoming total, vitality in (0,1]", () => {
  for (const b of births) {
    const base = buildBase(buildChart(b));
    for (const at of [{}, { annual: annualPillarOf(2026) }, { luck: { pillar: { stem: "壬", branch: "午" } as const, elapsedYears: 3 }, annual: annualPillarOf(2026) }]) {
      const cs = cloneCarriers(base.natalL1);
      cs.push(...layExternalCarriers(("luck" in at ? at.luck : null) ?? null, ("annual" in at ? at.annual : null) ?? null).carriers);
      const m0 = totalsOf(cs).grand;
      const r = propagate(cs);
      assert.ok(r.carriers.every((c) => c.weight >= 0));
      assert.ok(r.rawTotal <= m0 + 1e-9, "mass must not increase");
      assert.ok(Math.abs(totalsOf(r.carriers).grand - m0) < 1e-9, "normalised back to M0");
      assert.ok(r.vitality > 0 && r.vitality <= 1);
      assert.ok(r.flows.every((f) => f.totalAmount >= 0));
      assert.ok(r.convergence.rounds >= 1 && r.convergence.rounds <= DEFAULT_PARAMS.propagation.maxRounds);
    }
  }
});

test("propagation does not mutate its input", () => {
  const base = buildBase(buildChart(births[0] as BirthInput));
  const cs = cloneCarriers(base.natalL1);
  const before = JSON.stringify(cs);
  propagate(cs);
  assert.equal(JSON.stringify(cs), before);
});

test("element shares sum to 1; evenness in [0,1]; polarity shares sum to 1", () => {
  for (const b of births) {
    const s = buildBase(buildChart(b)).solved;
    assert.ok(Math.abs(ELEMENTS.reduce((a, e) => a + s.shares[e], 0) - 1) < 1e-12);
    assert.ok(s.evenness >= 0 && s.evenness <= 1);
    assert.ok(Math.abs(s.polarityShares.陽 + s.polarityShares.陰 - 1) < 1e-12);
  }
});

test("neutral-year delta sums to zero, and is zero when nothing external is added", () => {
  const base = buildBase(buildChart(births[1] as BirthInput));
  const ev = evaluateYear(base, 2026);
  assert.ok(Math.abs(ELEMENTS.reduce((a, e) => a + ev.delta[e], 0)) < 1e-9);
  const none = evaluateAt(base, {});
  const natalMass = totalsOf(base.solved.carriers).byElement;
  const d = shareDeltaOf(natalMass, totalsOf(none.carriers).byElement);
  for (const e of ELEMENTS) assert.ok(Math.abs(d[e]) < 1e-9);
});

test("year evaluation picks the active 大運 and elapsed time at the 4 Feb sampling instant", () => {
  const base = buildBase(buildChart(births[0] as BirthInput));
  const ev = evaluateYear(base, 2026);
  assert.ok(ev.luckStep !== null);
  assert.ok(ev.elapsedYears >= 0 && ev.elapsedYears < 10);
  assert.equal(ev.annualPillar.stem + ev.annualPillar.branch, "丙午");
  const early = evaluateYear(base, 1992);   // before the first 大運 starts (age 8.24)
  assert.equal(early.luckStep, null);
});

test("annual pillars follow the 60-cycle", () => {
  assert.equal(annualPillarOf(2024).stem + annualPillarOf(2024).branch, "甲辰");
  assert.equal(annualPillarOf(2026).stem + annualPillarOf(2026).branch, "丙午");
  assert.equal(annualPillarOf(1984).stem + annualPillarOf(1984).branch, "甲子");
});

test("parameter invariants are enforced and reported together", () => {
  assert.doesNotThrow(() => validateParams(DEFAULT_PARAMS));
  const bad = { ...DEFAULT_PARAMS, weights: { ...DEFAULT_PARAMS.weights, stemShare: 0.5, annual: { total: 110, stem: 40, branch: 60 } } };
  assert.throws(() => validateParams(bad), (e: Error) => e.message.includes("stemShare") && e.message.includes("annual"));
  assert.equal(paramsFingerprint(DEFAULT_PARAMS), paramsFingerprint(JSON.parse(JSON.stringify(DEFAULT_PARAMS))));
  assert.notEqual(paramsFingerprint(DEFAULT_PARAMS), paramsFingerprint(bad));
});
