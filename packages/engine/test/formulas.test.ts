import assert from "node:assert/strict";
import { test } from "node:test";
import { bestScale, candidateFormulaIds, compositionOf, cost, fitFormulas, formulaVector, normalize, passesSymptomFit, recomputeTier, scorePatterns, strengthOf, synthesizePanel } from "../src/index.ts";
import type { Findings } from "../src/index.ts";
import { forAll } from "./gen.ts";
import { dev, release } from "./kbs.ts";
import { EPS, PARITY } from "./parity.ts";

const prep = (findings: Findings) => {
  const n = normalize(dev, { findings, sex: "female", pregnancy: "no" });
  return { n, panel: synthesizePanel(dev, scorePatterns(dev, n), null) };
};

test("parity with the oracle: k*, explained fraction and core fit of every MVP formula in every case (1e-9), same ranking", () => {
  for (const c of PARITY.cases) {
    const { n, panel } = prep(c.findings);
    const mvp = new Set([...dev.formulas.values()].filter((f) => f.mvp).map((f) => f.id));
    const fits = fitFormulas(dev, panel.observed, n, mvp);
    assert.deepEqual(fits.map((f) => f.id), c.expect.formulas.map((f) => f.id), `${c.id}: ranking`);
    for (const [i, f] of fits.entries()) {
      const e = c.expect.formulas[i]!;
      assert.ok(Math.abs(f.k - e.k) < EPS && Math.abs(f.explained - e.explained) < EPS && Math.abs(f.coreFit - e.coreFit) < EPS, `${c.id} ${f.id}: ${f.k}/${f.explained} vs ${e.k}/${e.explained}`);
    }
  }
});

test("SOP §12.4 worked example: 參苓白朮散 k*=2.93 64.7 %, 四君子湯 1.94 62.6 %, 補中益氣湯 2.14 61.1 %, 玉屏風散 1.91 60.4 %, 歸脾湯 3.00 51.3 %, 理中丸 1.45 26.9 %", () => {
  const { n, panel } = prep(PARITY.cases.find((c) => c.id === "worked-example")!.findings);
  const fits = Object.fromEntries(fitFormulas(dev, panel.observed, n).map((f) => [f.id, f]));
  const r2 = (x: number): number => Math.round(x * 100) / 100, pc = (x: number): number => Math.round(x * 1000) / 10;
  assert.deepEqual([r2(fits["F_SHENLING"]!.k), pc(fits["F_SHENLING"]!.explained)], [2.93, 64.7]);
  assert.deepEqual([r2(fits["F_SIJUNZI"]!.k), pc(fits["F_SIJUNZI"]!.explained)], [1.94, 62.6]);
  assert.deepEqual([r2(fits["F_BUZHONG"]!.k), pc(fits["F_BUZHONG"]!.explained)], [2.14, 61.1]);
  assert.deepEqual([r2(fits["F_YUPINGFENG"]!.k), pc(fits["F_YUPINGFENG"]!.explained)], [1.91, 60.4]);
  assert.deepEqual([r2(fits["F_GUIPI"]!.k), pc(fits["F_GUIPI"]!.explained)], [3, 51.3]);
  assert.deepEqual([r2(fits["F_LIZHONG"]!.k), pc(fits["F_LIZHONG"]!.explained)], [1.45, 26.9]);
  assert.equal(fits["F_SHENLING"]!.tier, "A");
});

test("k* is the exact minimiser: brute force over [0, k_max] cannot beat the closed form", () => {
  const { panel } = prep(PARITY.cases.find((c) => c.id === "worked-example")!.findings);
  for (const f of dev.formulas.values()) {
    const t = formulaVector(f);
    const k = bestScale(dev, panel.observed, t);
    const at = (x: number): number => cost(dev, panel.observed, Object.fromEntries(Object.entries(t).map(([d, v]) => [d, v * x])));
    let best = Infinity;
    for (let x = 0; x <= dev.params.formula.k_max + 1e-9; x += 0.01) best = Math.min(best, at(x));
    assert.ok(at(k) <= best + 1e-9, `${f.id}: closed form ${at(k)} vs grid ${best}`);
    assert.ok(k >= 0 && k <= dev.params.formula.k_max);
  }
});

test("with no deviation nothing is explained and k* is 0", () => {
  const { n, panel } = prep({});
  for (const f of fitFormulas(dev, panel.observed, n)) assert.deepEqual([f.k, f.explained], [0, 0]);
});

test("property P6: k ∈ [0,3], explained ≤ 1 for every formula", () => {
  const ids = [...dev.symptoms.keys()];
  forAll("P6 formula fit bounds", 120, (rng) => Object.fromEntries(rng.subset(ids, 0.1).map((s) => [s, { state: "present" as const, severity: rng.pick(["light", "moderate", "severe"] as const) }])), (f) => {
    const { n, panel } = prep(f);
    for (const fit of fitFormulas(dev, panel.observed, n)) {
      assert.ok(fit.k >= 0 && fit.k <= 3 + 1e-12);
      assert.ok(fit.explained <= 1 + 1e-9, `${fit.id} explained ${fit.explained}`);
    }
  });
});

test("property P11: the stored tier equals the tier recomputed from the herbs for every formula", () => {
  for (const f of dev.formulas.values()) assert.equal(recomputeTier(dev, f), f.tier, f.id);
  assert.equal(recomputeTier(release, [...release.formulas.values()][0]!), null, "without herb records the tier comes from the knowledge base");
});

test("strength words follow the bands", () => {
  assert.equal(strengthOf(dev, 0.5), "light");
  assert.equal(strengthOf(dev, 1.0), "standard");
  assert.equal(strengthOf(dev, 1.5), "standard");
  assert.equal(strengthOf(dev, 2.5), "strong");
});

test("candidates are the formulas linked to the presented patterns; the symptom fit keeps those with ≥ 60 % of their core indications", () => {
  assert.deepEqual(candidateFormulaIds(dev, ["SP1"]), dev.patternById.get("SP1")!.formulas);
  assert.deepEqual(candidateFormulaIds(dev, ["EX2", "EX4"]).filter((x) => x === "F_GUIZHI").length, 1, "no duplicates");
  const { n, panel } = prep(PARITY.cases.find((c) => c.id === "typical-SP1")!.findings);
  const fits = fitFormulas(dev, panel.observed, n, new Set(candidateFormulaIds(dev, ["SP1"])));
  assert.ok(fits.some((f) => passesSymptomFit(dev, f)));
  assert.ok(!passesSymptomFit(dev, { coreFit: 0.59 }));
  assert.ok(passesSymptomFit(dev, { coreFit: 0.6 }));
});

test("composition view: roles and weights; amounts only when the policy allows them", () => {
  const f = dev.formulas.get("F_MAHUANG")!;
  const rows = compositionOf(dev, f, false);
  assert.deepEqual(rows.map((r) => r.role), ["君", "臣", "佐", "使"]);
  assert.ok(rows.every((r) => !("typicalG" in r) && !("classicalAmount" in r)));
  assert.equal(rows[0]!.name["zh-Hant"], "麻黃");
  assert.ok(Math.abs(rows.reduce((a, r) => a + r.effectiveWeight, 0) - 1) < 1e-3);
  const withDose = compositionOf(dev, f, true);
  assert.equal(withDose[0]!.typicalG, 9);
  assert.equal(withDose[0]!.classicalAmount?.value, 3);
  const rel = compositionOf(release, release.formulas.get("F_SIJUNZI")!, true);
  assert.ok(rel.every((r) => !("typicalG" in r)), "a release bundle carries no amounts even if asked");
  assert.ok(rel.every((r) => r.name["zh-Hant"].length > 0));
});
