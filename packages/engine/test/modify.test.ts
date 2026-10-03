import assert from "node:assert/strict";
import { test } from "node:test";
import { bestScale, classicalModifications, cost, fitFormulas, formulaVector, greedyModify, modificationPool, modifyFormula, normalize, scorePatterns, synthesizePanel } from "../src/index.ts";
import type { Findings } from "../src/index.ts";
import { dev, release } from "./kbs.ts";
import { EPS, PARITY } from "./parity.ts";

const prep = (findings: Findings) => {
  const n = normalize(dev, { findings, sex: "female", pregnancy: "no" });
  return { n, panel: synthesizePanel(dev, scorePatterns(dev, n), null) };
};
const pool = modificationPool(dev);

test("parity with the oracle: greedy 加減 steps (op, herb, gain) and residual cost of every case (1e-9)", () => {
  let compared = 0;
  for (const c of PARITY.cases) {
    const { n, panel } = prep(c.findings);
    const mvp = new Set([...dev.formulas.values()].filter((f) => f.mvp).map((f) => f.id));
    const top = fitFormulas(dev, panel.observed, n, mvp)[0]!;
    const expected = c.expect.modification;
    const base = cost(dev, panel.observed, {});
    if (base > 0 && top.explained > 0) {
      assert.ok(expected, `${c.id}: the oracle has a modification`);
      const r = greedyModify(dev, dev.formulas.get(top.id)!, panel.observed, top.k, pool);
      assert.equal(r.formula, expected.formula);
      assert.deepEqual(r.steps.map((s) => [s.op, s.herb]), expected.log.map(([op, herb]) => [op, herb]), `${c.id}: steps`);
      r.steps.forEach((s, i) => assert.ok(Math.abs(s.gain - expected.log[i]![2]) < EPS, `${c.id} gain ${i}`));
      assert.ok(Math.abs(r.costAfter - expected.cost) < EPS, `${c.id}: cost`);
      compared++;
    } else assert.equal(expected, undefined, `${c.id}: no modification expected`);
  }
  assert.ok(compared >= 40, `compared ${compared} cases`);
});

test("SOP §12.5 worked example: 參苓白朮散 + 大棗 (0.33) + 炙甘草 (0.09) − 薏苡仁 (0.04); residual 5.04 → 1.31", () => {
  const { n, panel } = prep(PARITY.cases.find((c) => c.id === "worked-example")!.findings);
  const top = fitFormulas(dev, panel.observed, n)[0]!;
  assert.equal(top.id, "F_SHENLING");
  const r = greedyModify(dev, dev.formulas.get(top.id)!, panel.observed, top.k, pool);
  assert.deepEqual(r.steps.map((s) => [s.op, dev.herbName(s.herb)!.name["zh-Hant"]]), [["add", "大棗"], ["add", "炙甘草"], ["remove", "薏苡仁"]]);
  assert.deepEqual(r.steps.map((s) => Math.round(s.gain * 100) / 100), [0.33, 0.09, 0.04]);
  assert.deepEqual([Math.round(r.costNone * 100) / 100, Math.round(r.costAfter * 100) / 100], [5.04, 1.31]);
  assert.ok(r.costFormula < r.costNone && r.costAfter < r.costFormula);
  assert.ok(r.steps[0]!.improves.includes("心.blood"), "大棗 nourishes the heart blood that the formula leaves uncorrected");
  assert.ok(r.steps.every((s) => s.improves.length > 0 && s.improves.length <= 3));
});

test("limits: at most 2 additions and 1 removal, never the sovereign herb; every step lowers the cost", () => {
  for (const c of PARITY.cases.slice(0, 60)) {
    const { n, panel } = prep(c.findings);
    const f = dev.formulas.get(fitFormulas(dev, panel.observed, n)[0]!.id)!;
    const r = modifyFormula(dev, f, panel.observed, pool);
    assert.ok(r.steps.filter((s) => s.op === "add").length <= 2);
    assert.ok(r.steps.filter((s) => s.op === "remove").length <= 1);
    const sovereign = new Set(f.composition.filter((x) => x.role === "君").map((x) => x.herb));
    assert.ok(r.steps.every((s) => s.op !== "remove" || !sovereign.has(s.herb)), `${c.id}: removed a sovereign herb`);
    assert.ok(r.steps.every((s) => s.gain > dev.params.formula.modification.min_gain));
    assert.ok(r.costAfter <= r.costFormula + 1e-12);
    assert.ok(Math.abs(Object.values(r.composition).reduce((a, w) => a + w, 0) - 1) < 2e-3, "the modified weights sum to 1 (the stored effective weights are rounded to 4 decimals)");
  }
});

test("the modification pool is curated, non-toxic and free of pregnancy flags, sorted", () => {
  assert.ok(pool.length > 40);
  assert.deepEqual(pool, [...pool].sort());
  for (const id of pool) {
    const h = dev.herbs!.get(id)!;
    assert.ok(h.status === "curated-draft" && !h.toxic && (h.pregnancy === "ok" || h.pregnancy === "ok-unreviewed"), id);
  }
  assert.deepEqual(modificationPool(release), [], "no herb records, no pool");
  assert.throws(() => greedyModify(release, [...release.formulas.values()][0]!, {}, 1, []), /herb records/);
});

test("classical modifications trigger on their symptoms: 四君子湯 → 異功散 / 六君子湯", () => {
  const f = dev.formulas.get("F_SIJUNZI")!;
  assert.deepEqual(classicalModifications(f, new Set()), []);
  const yigong = classicalModifications(f, new Set(["S_POSTPRANDIAL_BLOAT"]));
  assert.deepEqual(yigong.map((m) => m.resultName), ["異功散", "香砂六君子湯"], "bloating triggers both 異功散 and 香砂六君子湯");
  assert.deepEqual(yigong[0]!.matched, ["S_POSTPRANDIAL_BLOAT"]);
  assert.deepEqual(yigong[0]!.add.map((a) => dev.herbName(a.herb)!.name["zh-Hant"]), ["陳皮"]);
  const both = classicalModifications(f, new Set(["S_POSTPRANDIAL_BLOAT", "S_PHLEGM_COPIOUS"]));
  assert.deepEqual(both.map((m) => m.resultName), ["異功散", "六君子湯", "香砂六君子湯"]);
  assert.deepEqual(classicalModifications(f, new Set(["S_NAUSEA"])).map((m) => m.resultName), ["六君子湯"]);
});

test("a formula that already fits well is not modified without a gain", () => {
  const { panel } = prep({});
  const f = dev.formulas.get("F_SIJUNZI")!;
  const k = bestScale(dev, panel.observed, formulaVector(f));
  assert.deepEqual(greedyModify(dev, f, panel.observed, k, pool).steps, []);
});
