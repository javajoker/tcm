/**
 * Parity with the author's earlier engine (fate4 @ aba58ee), the numeric oracle this implementation
 * was extracted from. The fixture was produced by running that engine with structure rewriting (L2)
 * disabled for instant charts, which is the only deliberate difference from it (see
 * docs/wuxing-algorithm.md §2). The oracle rounds weights to 6 decimals, hence the tolerances.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildChart, buildBase, evaluateYear, termsInGregorianYear, equationOfTimeMinutes, deltaTSeconds,
  asTT, toJulianDay, ELEMENTS, type Pillar, type BirthInput,
} from "../src/index.ts";

interface OracleYear {
  year: number; annual: string; luckIndex: number | null; luckPillar: string | null; elapsedYears: number;
  l3: { byElement: Record<string, number>; vitality: number; rounds: number };
  delta: Record<string, number>;
}
interface OracleBirth {
  id: string;
  input: { year: number; month: number; day: number; hour: number; minute: number; gender: "male" | "female"; timeZone: string; longitude: number; unknownHour?: boolean };
  pillars: { year: string | null; month: string | null; day: string | null; hour: string | null };
  siling: { stem: string; segment: number; resolution: string };
  luck: { direction: string; startAgeYears: number; first: { pillar: string }[] };
  base: { l1: { grand: number }; l3: { byElement: Record<string, number>; vitality: number; rounds: number } };
  years: OracleYear[];
}
const oracle = JSON.parse(readFileSync(new URL("fixtures/fate4-oracle.json", import.meta.url), "utf8")) as {
  births: OracleBirth[];
  solarTerms: { year: number; term: string; jdUT: number }[];
  eot: { y: number; m: number; d: number; minutes: number }[];
  deltaT: { y: number; m: number; seconds: number }[];
};
const P = (p: Pillar | null): string | null => (p === null ? null : p.stem + p.branch);

for (const b of oracle.births) {
  test(`oracle ${b.id}: pillars, 司令, 大運, base weights, annual weights and deltas`, () => {
    const i = b.input;
    const input: BirthInput = { year: i.year, month: i.month, day: i.day, hour: i.hour, minute: i.minute, sex: i.gender, timeZone: i.timeZone, longitude: i.longitude, ...(i.unknownHour === true ? { unknownHour: true } : {}) };
    const chart = buildChart(input);
    assert.deepEqual({ year: P(chart.year), month: P(chart.month), day: P(chart.day), hour: P(chart.hour) }, b.pillars);
    assert.equal(chart.siling.stem, b.siling.stem);
    assert.equal(chart.siling.segment, b.siling.segment);
    assert.equal(chart.siling.resolution, b.siling.resolution);
    assert.equal(chart.luck.direction, b.luck.direction);
    assert.ok(Math.abs(chart.luck.startAgeYears - b.luck.startAgeYears) < 1e-4);
    assert.deepEqual(chart.luck.pillars.slice(0, b.luck.first.length).map((p) => P(p.pillar)), b.luck.first.map((f) => f.pillar));

    const base = buildBase(chart);
    for (const e of ELEMENTS) assert.ok(Math.abs(base.solved.propagation.byElement[e] - (b.base.l3.byElement[e] as number)) < 1e-4, `${b.id} base ${e}`);
    assert.ok(Math.abs(base.solved.propagation.vitality - b.base.l3.vitality) < 1e-6);
    assert.equal(base.solved.propagation.convergence.rounds, b.base.l3.rounds);

    for (const y of b.years) {
      const ev = evaluateYear(base, y.year);
      assert.equal(P(ev.annualPillar), y.annual);
      assert.equal(ev.luckStep?.index ?? null, y.luckIndex);
      assert.ok(Math.abs(ev.elapsedYears - y.elapsedYears) < 1e-4);
      for (const e of ELEMENTS) {
        assert.ok(Math.abs(ev.solved.propagation.byElement[e] - (y.l3.byElement[e] as number)) < 1e-4, `${b.id} ${y.year} ${e}`);
        assert.ok(Math.abs(ev.delta[e] - (y.delta[e] as number)) < 1e-6, `${b.id} ${y.year} Δ${e}`);
      }
      assert.ok(Math.abs(ev.solved.propagation.vitality - y.l3.vitality) < 1e-6);
    }
  });
}

test("oracle: 168 solar-term instants across 1900–2100 agree to < 0.01 s", () => {
  const years = [...new Set(oracle.solarTerms.map((t) => t.year))];
  let worst = 0;
  for (const y of years) {
    const mine = termsInGregorianYear(y);
    for (const t of oracle.solarTerms.filter((x) => x.year === y)) {
      const m = mine.find((r) => r.def.name === t.term);
      assert.ok(m, `${y} ${t.term}`);
      worst = Math.max(worst, Math.abs((m as { jdUT: number }).jdUT - t.jdUT) * 86400);
    }
  }
  assert.ok(worst < 0.01, `worst ${worst} s`);
});

test("oracle: equation of time and ΔT agree", () => {
  for (const e of oracle.eot) {
    const jd = toJulianDay({ year: e.y, month: e.m, day: e.d, hour: 12, minute: 0, second: 0 });
    assert.ok(Math.abs(equationOfTimeMinutes(asTT(jd)) - e.minutes) < 1e-4, `${e.y}-${e.m}-${e.d}`);
  }
  for (const d of oracle.deltaT) assert.ok(Math.abs(deltaTSeconds(d.y, d.m).seconds - d.seconds) < 1e-4);
});
