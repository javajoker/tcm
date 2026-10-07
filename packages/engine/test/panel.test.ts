import assert from "node:assert/strict";
import { test } from "node:test";
import { ELEMENTS } from "@tcm/wuxing";
import { buildReference, normalize, scorePatterns, synthesizePanel, yinYangOf } from "../src/index.ts";
import type { Findings } from "../src/index.ts";
import { forAll } from "./gen.ts";
import { dev } from "./kbs.ts";
import { EPS, PARITY } from "./parity.ts";

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const BIRTH = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
const scored = (findings: Findings) => scorePatterns(dev, normalize(dev, { findings, sex: "female", pregnancy: "no" }));
const closeMap = (a: Record<string, number>, b: Record<string, number>, what: string): void => {
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${what}: keys`);
  for (const k of Object.keys(b)) assert.ok(Math.abs(a[k]! - b[k]!) < EPS, `${what} ${k}: ${a[k]} vs ${b[k]}`);
};

test("parity with the Python oracle: observed panel, W and 八綱 of every case (1e-9)", () => {
  for (const c of PARITY.cases) {
    const panel = synthesizePanel(dev, scored(c.findings), null);
    closeMap(panel.observed as Record<string, number>, Object.fromEntries(Object.entries(c.expect.panel)), `${c.id} panel`);
    closeMap(panel.wuxingFunction as Record<string, number>, c.expect.wuxingFunction, `${c.id} W`);
    assert.ok(Math.abs(panel.bagang.coldHeat - c.expect.bagang.cold_heat) < EPS, `${c.id} cold_heat`);
    assert.ok(Math.abs(panel.bagang.deficiencyExcess - c.expect.bagang.deficiency_excess) < EPS, `${c.id} deficiency_excess`);
    assert.ok(Math.abs(panel.bagang.exterior - c.expect.bagang.exterior) < EPS, `${c.id} exterior`);
  }
});

test("SOP §10.6 worked example: 脾.氣 −2.16, 心.血 −0.61, 營 −0.56, 衛 −0.13, 土 −0.76, 虛實 −0.58; 土 opposed to the reference; 乘侮自深 土 −0.15, 母病及子 金 −0.19", () => {
  const c = PARITY.cases.find((x) => x.id === "worked-example")!;
  const ref = buildReference(dev, { birth: BIRTH, birthModule: false, now: NOW })!;
  const p = synthesizePanel(dev, scored(c.findings), ref.panel);
  const r = (x: number): number => Math.round(x * 100) / 100;
  assert.deepEqual([r(p.observed["脾.qi"]!), r(p.observed["心.blood"]!)], [-2.16, -0.61]);
  // PM-52: the 營 and 衛 made from the deficient 脾 and 心 (營 ← 0.6·脾.qi + 0.4·心.blood, 衛 ← 0.15·脾.qi, both × 0.3), saturated like every dimension
  assert.deepEqual([r(p.observed["yingwei.營"]!), r(p.observed["yingwei.衛"]!)], [-0.56, -0.13]);
  assert.equal(r(p.wuxingFunction["土"]), -0.76);
  assert.deepEqual(ELEMENTS.filter((e) => e !== "土").map((e) => p.wuxingFunction[e]), [0, 0, 0, 0]);
  assert.equal(r(p.bagang.deficiencyExcess), -0.58);
  assert.equal(p.bagang.coldHeat, 0);
  assert.equal(p.bagang.exterior, 0);
  assert.equal(p.bagang.yinYang, "yin");
  assert.deepEqual(p.alignment, { 木: "neutral", 火: "neutral", 土: "opposed", 金: "neutral", 水: "neutral" });
  assert.equal(r(p.offsetPersonal!["土"]), -1.2, "W − N for 土: −0.756 − 0.447");
  const t = p.transmission;
  assert.equal(r(t.pressure["土"]), -0.15);
  assert.equal(r(t.pressure["金"]), -0.19);
  assert.deepEqual(t.rules.map((x) => x.rule), ["母病及子", "乘侮自深"]);
});

test("property P1: the primary offset equals the observation exactly, whatever the reference says", () => {
  const ids = [...dev.symptoms.keys()];
  const refs = [
    null,
    buildReference(dev, { birth: BIRTH, birthModule: false, now: NOW })!.panel,
    buildReference(dev, { birth: null, birthModule: false, now: Date.UTC(2027, 1, 20) })!.panel,
    buildReference(dev, { birth: { ...BIRTH, year: 1975, month: 11, day: 3 }, birthModule: false, now: Date.UTC(2025, 6, 1) })!.panel,
  ];
  forAll("P1 offsetPopulation = observed", 150, (rng) => {
    const f: Record<string, { state: "present"; severity: "light" | "moderate" | "severe" }> = {};
    for (const s of rng.subset(ids, 0.08)) f[s] = { state: "present", severity: rng.pick(["light", "moderate", "severe"] as const) };
    return f;
  }, (f) => {
    const s = scored(f);
    const baseline = synthesizePanel(dev, s, null);
    for (const ref of refs) {
      const p = synthesizePanel(dev, s, ref);
      assert.deepEqual(p.offsetPopulation, baseline.offsetPopulation);
      assert.deepEqual(p.offsetPopulation, p.wuxingFunction);
      assert.deepEqual(p.observed, baseline.observed, "the observed panel does not depend on the reference");
      assert.deepEqual(p.transmission, baseline.transmission, "nor does the transmission");
      for (const e of ELEMENTS) {
        if (ref) assert.ok(Math.abs(p.offsetPersonal![e] - (p.wuxingFunction[e] - ref.total[e])) < 1e-12);
      }
    }
  });
});

test("property P6: panel values stay within their bounds", () => {
  const ids = [...dev.symptoms.keys()];
  forAll("P6 bounded panel", 200, (rng) => Object.fromEntries(rng.subset(ids, 0.3).map((s) => [s, { state: "present" as const, severity: "severe" as const }])), (f) => {
    const p = synthesizePanel(dev, scored(f), null);
    for (const [k, v] of Object.entries(p.observed)) assert.ok(Math.abs(v) <= 3 + 1e-9, `${k} = ${v}`);
    assert.ok(Math.abs(p.bagang.coldHeat) <= 1 && Math.abs(p.bagang.deficiencyExcess) <= 1 && p.bagang.exterior >= 0 && p.bagang.exterior <= 1);
  });
});

test("a pattern below the floor does not project; projections record where each value came from", () => {
  const c = PARITY.cases.find((x) => x.id === "worked-example")!;
  const p = synthesizePanel(dev, scored(c.findings), null);
  const from = p.projections["脾.qi"]!.map((x) => x.patternId).sort();
  assert.ok(from.includes("SP1"));
  assert.ok(p.projections["脾.qi"]!.every((x) => x.pct >= dev.params.panel.noisy_or_floor));
  const empty = synthesizePanel(dev, scored({}), null);
  assert.deepEqual(empty.observed, {});
  assert.deepEqual(empty.projections, {});
});

test("transmission follows 生克乘侮: excess 木 restrains 土, deficient 土 weakens 金", () => {
  const liver = synthesizePanel(dev, scored(Object.fromEntries(Object.keys(dev.patternById.get("LV1")!.weights).map((s) => [s, { state: "present" as const }]))), null);
  assert.ok(liver.transmission.pressure["土"] < 0, "肝氣鬱結 → 土 at risk (見肝之病，知肝傳脾)");
});

test("yin-yang summary of the other axes", () => {
  const t = 0.15;
  assert.equal(yinYangOf(0, 0, t), "balanced");
  assert.equal(yinYangOf(0.5, 0.5, t), "yang");
  assert.equal(yinYangOf(0.5, 0, t), "yang");
  assert.equal(yinYangOf(-0.5, -0.5, t), "yin");
  assert.equal(yinYangOf(0.5, -0.5, t), "yin", "heat with deficiency is yin deficiency");
  assert.equal(yinYangOf(-0.5, 0.5, t), "mixed", "cold with excess");
  assert.equal(yinYangOf(0, 0.5, t), "yang");
  assert.equal(yinYangOf(0, -0.5, t), "yin");
});
