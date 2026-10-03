import assert from "node:assert/strict";
import { test } from "node:test";
import { normalize, scoreElements, scorePatterns } from "../src/index.ts";
import type { Findings } from "../src/index.ts";
import { forAll } from "./gen.ts";
import { dev } from "./kbs.ts";
import { EPS, PARITY } from "./parity.ts";

const norm = (findings: Findings) => normalize(dev, { findings, sex: "female", pregnancy: "no" });
const pctOf = (findings: Findings) => Object.fromEntries(scorePatterns(dev, norm(findings)).map((p) => [p.id, p.pct]));

test("parity with the Python oracle: pattern and element scores of every case (1e-9)", () => {
  for (const c of PARITY.cases) {
    const n = norm(c.findings);
    const patterns = Object.fromEntries(scorePatterns(dev, n).map((p) => [p.id, p.pct]));
    const elements = Object.fromEntries(scoreElements(dev, n).map((e) => [e.id, e.pct]));
    for (const [id, expected] of Object.entries(c.expect.scores)) assert.ok(Math.abs(patterns[id]! - expected) < EPS, `${c.id} ${id}: ${patterns[id]} vs ${expected}`);
    for (const [id, expected] of Object.entries(c.expect.elements)) assert.ok(Math.abs(elements[id]! - expected) < EPS, `${c.id} ${id}: ${elements[id]} vs ${expected}`);
  }
});

test("the SOP worked example: SP1 = 55.8 % (medium), with the contributions of SOP §9.5", () => {
  const w = PARITY.cases.find((c) => c.id === "worked-example")!;
  const sp1 = scorePatterns(dev, norm(w.findings)).find((p) => p.id === "SP1")!;
  assert.equal(Math.round(sp1.pct * 10) / 10, 55.8);
  assert.equal(sp1.band, "medium");
  assert.equal(sp1.maxScore, 24);
  assert.ok(Math.abs(sp1.positive - 13.4) < 1e-9);
  const c = Object.fromEntries(sp1.evidence.map((e) => [e.symptomId, e.contribution]));
  assert.ok(Math.abs(c["S_POSTPRANDIAL_BLOAT"]! - 2.4) < 1e-9 && Math.abs(c["S_LOOSE_STOOL"]! - 3.0) < 1e-9 && Math.abs(c["T_TOOTHMARK_EDGE"]! - 1.4) < 1e-9);
  assert.equal(sp1.evidence[0]?.symptomId, "S_LOOSE_STOOL", "strongest contribution first");
  const sp3 = scorePatterns(dev, norm(w.findings)).find((p) => p.id === "SP3")!;
  assert.equal(sp3.requiredPresent, false, "中氣下陷 lacks its required 下墜感 → ×0.5");
});

test("each of the 23 patterns ranks first for its own typical patient", () => {
  for (const p of dev.patterns) {
    const findings: Record<string, { state: "present"; severity: "moderate" }> = {};
    for (const [s, w] of Object.entries(p.weights)) if (w >= 2) findings[s] = { state: "present", severity: "moderate" };
    const ranked = scorePatterns(dev, norm(findings));
    assert.ok(ranked.slice(0, 3).some((r) => r.id === p.id), `${p.id} not in the top 3`);
    assert.equal(ranked[0]!.id, p.id, `${p.id} ranks ${ranked.findIndex((r) => r.id === p.id) + 1}`);
  }
});

test("required_any: without any required symptom the score is halved", () => {
  const sp3 = dev.patternById.get("SP3")!;
  const all: Record<string, { state: "present" }> = {};
  for (const s of Object.keys(sp3.weights)) if (!sp3.required_any.includes(s)) all[s] = { state: "present" };
  const without = scorePatterns(dev, norm(all)).find((p) => p.id === "SP3")!;
  const withReq = scorePatterns(dev, norm({ ...all, [sp3.required_any[0]!]: { state: "present" } })).find((p) => p.id === "SP3")!;
  assert.equal(without.requiredPresent, false);
  assert.ok(withReq.pct > without.pct * 1.5);
});

test("evidence against subtracts and the score never goes below zero", () => {
  const ex1 = dev.patternById.get("EX1")!;
  const against = Object.keys(ex1.against);
  const just = scorePatterns(dev, norm(Object.fromEntries(against.map((s) => [s, { state: "present" as const }])))).find((p) => p.id === "EX1")!;
  assert.equal(just.pct, 0);
  const supported = pctOf({ S_AVERSION_COLD: { state: "present" }, S_NO_SWEAT: { state: "present" } })["EX1"]!;
  const contradicted = pctOf({ S_AVERSION_COLD: { state: "present" }, S_NO_SWEAT: { state: "present" }, S_SPONTANEOUS_SWEAT: { state: "present" } })["EX1"]!;
  assert.ok(contradicted < supported);
});

test("property P2: absent, unsure and missing are the same for every pattern; adding supporting evidence never lowers a score", () => {
  const ids = [...dev.symptoms.keys()];
  forAll("P2", 300, (rng) => {
    const present = Object.fromEntries(rng.subset(ids, 0.05).map((s) => [s, { state: "present" as const, severity: rng.pick(["light", "moderate", "severe"] as const) }]));
    const others = rng.subset(ids.filter((s) => !(s in present)), 0.2);
    const extra = rng.pick(ids.filter((s) => !(s in present)));
    return { present, others, extra };
  }, ({ present, others, extra }) => {
    const base = pctOf(present);
    const withAbsent = pctOf({ ...present, ...Object.fromEntries(others.map((s) => [s, { state: "absent" as const }])) });
    const withUnsure = pctOf({ ...present, ...Object.fromEntries(others.map((s) => [s, { state: "unsure" as const }])) });
    assert.deepEqual(withAbsent, base);
    assert.deepEqual(withUnsure, base);
    const more = pctOf({ ...present, [extra]: { state: "present" as const, severity: "moderate" as const } });
    for (const p of dev.patterns) {
      if (extra in p.weights && !(extra in p.against)) assert.ok(more[p.id]! >= base[p.id]! - 1e-12, `${p.id} lowered by supporting evidence ${extra}`);
      if (!(extra in p.weights) && !(extra in p.against)) assert.equal(more[p.id], base[p.id]);
    }
    for (const p of dev.patterns) assert.ok(base[p.id]! >= 0 && base[p.id]! <= 100 + 1e-9);
  });
});

test("bands follow the parameter thresholds", () => {
  const w = PARITY.cases.find((c) => c.id === "typical-SP1")!;
  const top = scorePatterns(dev, norm(w.findings))[0]!;
  assert.equal(top.band, top.pct >= 60 ? "high" : top.pct >= 40 ? "medium" : top.pct >= 20 ? "weak" : "none");
  assert.equal(scorePatterns(dev, norm({}))[0]!.band, "none");
});

test("ranking is deterministic: ties are broken by id", () => {
  const ranked = scorePatterns(dev, norm({}));
  assert.deepEqual(ranked.map((p) => p.id), [...dev.patterns.map((p) => p.id)].sort());
});
