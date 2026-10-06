// The trend model (docs/post-mvp/design/export-follow-up-trends.md §5, §7): segments by parameter fingerprint and engine major version, bands per row, changes only between bands, profile marks, seasons —
// and the properties: a segment never spans two versions, the output does not depend on the order of the input, and a movement inside a band is never reported.
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { BANDS, engineMajor, MIN_POINTS, profileMarks, ROWS, trend, trendAvailable, type RowKey } from "../src/screens/history/trend.ts";
import { level5 } from "../src/screens/result/words.ts";
import type { SavedAssessment } from "../src/storage/types.ts";
import { interview } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 2, 1, 6);                          // 1 March 2026: spring
const draft = interview(kb, "SP1");
const base: SavedAssessment = toSaved(draft, engine.assess(kb, assessInputOf(draft, T0)!), { id: "base", lang: "en" });

type Panel = Partial<Record<RowKey, number>>;
function rec(id: string, at: number, panel: Panel = {}, over: Partial<SavedAssessment> = {}): SavedAssessment {
  const fromResult = over.result ?? base.result;
  const p = fromResult.panel;
  const offsetPopulation = { ...p.offsetPopulation, ...Object.fromEntries(Object.entries(panel).filter(([k]) => k !== "coldHeat" && k !== "deficiencyExcess")) };
  const bagang = { ...p.bagang, ...(panel.coldHeat !== undefined ? { coldHeat: panel.coldHeat } : {}), ...(panel.deficiencyExcess !== undefined ? { deficiencyExcess: panel.deficiencyExcess } : {}) };
  return { ...base, id, createdAt: at, ...over, result: { ...fromResult, panel: { ...p, offsetPopulation, bagang } } };
}
const flat: Panel = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0, coldHeat: 0, deficiencyExcess: 0 };

describe("segments", () => {
  it("one segment while the fingerprint and the engine's major version stay the same; the engine's minor version is not a break", () => {
    const t = trend([rec("a", T0, flat), rec("b", T0 + 20 * DAY, flat), rec("c", T0 + 40 * DAY, flat, { engineVersion: "0.9.3" })]);
    expect(t.segments).toHaveLength(1);
    expect(t.segments[0]!.points.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(t.segments[0]!.steps).toHaveLength(2);
    expect(t.longest).toBe(3);
    expect(engineMajor("0.1.0")).toBe("0");
    expect(engineMajor("2.14.1")).toBe("2");
  });
  it("another parameter fingerprint or another engine major version starts a new segment; the same version after another one is a third segment", () => {
    const t = trend([rec("a", T0), rec("b", T0 + DAY), rec("c", T0 + 2 * DAY, {}, { paramsFingerprint: "other" }), rec("d", T0 + 3 * DAY, {}, { engineVersion: "1.0.0" }), rec("e", T0 + 4 * DAY)]);
    expect(t.segments.map((s) => s.points.map((p) => p.id))).toEqual([["a", "b"], ["c"], ["d"], ["e"]]);
    expect(t.segments.map((s) => s.engineMajor)).toEqual(["0", "0", "1", "0"]);
    expect(t.segments[1]!.fingerprint).toBe("other");
    expect(t.longest).toBe(2);
    expect(t.segments[1]!.steps).toEqual([]);
  });
  it("is offered at three results of one version, not at three results of two", () => {
    expect(MIN_POINTS).toBe(3);
    expect(trendAvailable(trend([rec("a", T0), rec("b", T0 + DAY)]))).toBe(false);
    expect(trendAvailable(trend([rec("a", T0), rec("b", T0 + DAY), rec("c", T0 + 2 * DAY)]))).toBe(true);
    expect(trendAvailable(trend([rec("a", T0), rec("b", T0 + DAY), rec("c", T0 + 2 * DAY, {}, { paramsFingerprint: "x" })]))).toBe(false);
    expect(trendAvailable(trend([]))).toBe(false);
  });
});

describe("bands and changes", () => {
  it("puts each row in a band from the same thresholds as the result page, with the number the page prints", () => {
    const t = trend([rec("a", T0, { ...flat, 木: 2.04, 火: -0.4, coldHeat: 0.8, deficiencyExcess: -0.8 })]);
    const p = t.segments[0]!.points[0]!;
    expect(p.bands["木"]).toBe(level5(2.04));
    expect(p.bands["木"]).toBe("high");
    expect(p.bands["火"]).toBe("normal");
    expect(p.bands.coldHeat).toBe(level5(0.8, 1));
    expect(p.bands.deficiencyExcess).toBe(level5(-0.8, 1));
    expect(p.values["木"]).toBe(2);
    expect(p.values.coldHeat).toBe(0.8);
    expect(Object.keys(p.bands)).toEqual([...ROWS]);
    expect(BANDS).toEqual(["low", "somewhatLow", "normal", "somewhatHigh", "high"]);
  });
  it("reports a change only when the band is another one: a movement inside a band is silent, a step across a boundary is not", () => {
    const t = trend([rec("a", T0, { ...flat, 土: 0.6 }), rec("b", T0 + 10 * DAY, { ...flat, 土: 1.4 }), rec("c", T0 + 20 * DAY, { ...flat, 土: 1.6 }), rec("d", T0 + 30 * DAY, { ...flat, 土: 0.4 })]);
    const [ab, bc, cd] = t.segments[0]!.steps;
    expect(ab!.changes).toEqual([]);                                        // 0.6 → 1.4: both somewhat high
    expect(bc!.changes).toEqual([{ row: "土", from: "somewhatHigh", to: "high" }]);
    expect(cd!.changes).toEqual([{ row: "土", from: "high", to: "normal" }]);
  });
  it("the boundary itself: a hair either side is two bands, a hair inside is one", () => {
    const at = (v: number) => trend([rec("a", T0, { ...flat, 木: v })]).segments[0]!.points[0]!.bands["木"];
    expect(at(0.49)).toBe("normal");
    expect(at(0.5)).toBe("somewhatHigh");
    expect(at(-0.49)).toBe("normal");
    expect(at(-0.5)).toBe("somewhatLow");
    expect(at(1.49)).toBe("somewhatHigh");
    expect(at(1.5)).toBe("high");
    expect(at(-1.5)).toBe("low");
  });
  it("lists the symptoms that appeared and the ones no longer reported between consecutive results", () => {
    const f = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { state: "present" as const }]));
    const t = trend([rec("a", T0, flat, { input: { ...base.input, findings: f("S_FATIGUE", "S_HEADACHE") } }), rec("b", T0 + 9 * DAY, flat, { input: { ...base.input, findings: { ...f("S_FATIGUE", "S_INSOMNIA"), S_HEADACHE: { state: "absent" as const } } } })]);
    expect(t.segments[0]!.steps[0]).toMatchObject({ added: ["S_INSOMNIA"], removed: ["S_HEADACHE"] });
  });
  it("keeps the patterns at each result, leading first, at most three; none when there was no verdict", () => {
    const established = trend([rec("a", T0)]).segments[0]!.points[0]!;
    expect(established.patterns.length).toBeGreaterThan(0);
    expect(established.patterns.length).toBeLessThanOrEqual(3);
    expect(established.patterns[0]!.id).toBe("SP1");
    const none = trend([rec("a", T0, {}, { result: { ...base.result, verdict: { ...base.result.verdict, status: "insufficient" } as never } })]).segments[0]!.points[0]!;
    expect(none.patterns).toEqual([]);
  });
});

describe("profile marks", () => {
  it("name what differs among pregnancy, breastfeeding and a long-term condition — and nothing else about the person", () => {
    const withSubject = (over: object, flags: string[] = base.input.redFlags as string[]) => rec("x", T0, flat, { input: { ...base.input, subject: { ...base.input.subject, ...over }, redFlags: flags } });
    expect(profileMarks(base, withSubject({ pregnancy: "yes" }))).toEqual(["pregnancy"]);
    expect(profileMarks(base, withSubject({ lactating: true }))).toEqual(["lactating"]);
    expect(profileMarks(base, withSubject({}, ["RF_C_KIDNEY"]))).toEqual(["conditions"]);
    expect(profileMarks(base, withSubject({ pregnancy: "yes", lactating: true }, ["RF_C_LIVER"]))).toEqual(["pregnancy", "lactating", "conditions"]);
    expect(profileMarks(base, withSubject({ ageYears: 99, medications: ["sedative"], allergies: ["x"] }))).toEqual([]);
    expect(profileMarks(base, withSubject({}, ["RF_A_CHEST_PAIN"]))).toEqual([]);              // an acute red flag answered then is not a long-term condition
  });
  it("sit on the step between the two results", () => {
    const t = trend([rec("a", T0), rec("b", T0 + DAY, {}, { input: { ...base.input, subject: { ...base.input.subject, pregnancy: "yes" } } }), rec("c", T0 + 2 * DAY, {}, { input: { ...base.input, subject: { ...base.input.subject, pregnancy: "yes" } } })]);
    expect(t.segments[0]!.steps.map((s) => s.profile)).toEqual([["pregnancy"], []]);
  });
});

describe("seasons", () => {
  it("the commanding season at the date of each result, by the result's own season model", () => {
    const at = (y: number, m: number, d: number) => trend([rec("a", Date.UTC(y, m, d, 6))]).segments[0]!.points[0]!.season;
    expect(at(2026, 2, 1)).toBe("春");
    expect(at(2026, 5, 1)).toBe("夏");
    expect(at(2026, 6, 20)).toBe("長夏");
    expect(at(2026, 9, 1)).toBe("秋");
    expect(at(2026, 11, 1)).toBe("冬");
    expect(at(2026, 0, 10)).toBe("冬");
  });
});

// ── properties ──────────────────────────────────────────────────────────────

function lcg(seed: number): () => number { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; }
function history(seed: number): SavedAssessment[] {
  const r = lcg(seed);
  const n = 3 + Math.floor(r() * 9);
  let at = T0;
  return Array.from({ length: n }, (_, i) => {
    at += Math.floor(1 + r() * 40) * DAY;
    const panel = Object.fromEntries(ROWS.map((row) => [row, (r() - 0.5) * (row === "coldHeat" || row === "deficiencyExcess" ? 2.4 : 7)])) as Panel;
    return rec(`h${seed}-${i}`, at, panel, { paramsFingerprint: r() < 0.25 ? `p${Math.floor(r() * 3)}` : "p0", engineVersion: r() < 0.15 ? `${Math.floor(r() * 3)}.0.0` : "0.1.0" });
  });
}
const shuffle = <T,>(xs: readonly T[], r: () => number): T[] => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; };

describe("properties over generated histories", () => {
  const seeds = Array.from({ length: 60 }, (_, i) => i + 1);
  it("a segment never spans two fingerprints or two engine major versions, every result is in exactly one segment, in time order", () => {
    for (const seed of seeds) {
      const h = history(seed);
      const t = trend(h);
      expect(t.segments.reduce((n, s) => n + s.points.length, 0), `${seed}`).toBe(h.length);
      const byId = new Map(h.map((x) => [x.id, x]));
      for (const s of t.segments) for (const p of s.points) { const x = byId.get(p.id)!; expect(x.paramsFingerprint, `${seed} ${p.id}`).toBe(s.fingerprint); expect(engineMajor(x.engineVersion)).toBe(s.engineMajor); }
      const times = t.segments.flatMap((s) => s.points.map((p) => p.createdAt));
      expect(times).toEqual([...times].sort((a, b) => a - b));
      for (const [i, s] of t.segments.entries()) if (i > 0) expect(s.key, `${seed}: adjacent segments differ`).not.toBe(t.segments[i - 1]!.key);
      expect(t.longest).toBe(Math.max(...t.segments.map((s) => s.points.length)));
    }
  });
  it("the order of the input changes nothing", () => {
    for (const seed of seeds) {
      const h = history(seed);
      const expected = trend(h);
      const r = lcg(seed * 7 + 1);
      for (let k = 0; k < 3; k++) expect(trend(shuffle(h, r)), `${seed}`).toEqual(expected);
    }
  });
  it("a change is reported exactly when the band is another one, never for a movement inside a band, and it names the bands on both sides", () => {
    for (const seed of seeds) {
      const t = trend(history(seed));
      for (const s of t.segments) for (const [i, step] of s.steps.entries()) {
        const a = s.points[i]!, b = s.points[i + 1]!;
        expect(step.fromId).toBe(a.id);
        expect(step.toId).toBe(b.id);
        const expected = ROWS.filter((row) => a.bands[row] !== b.bands[row]);
        expect(step.changes.map((c) => c.row), `${seed}`).toEqual(expected);
        for (const c of step.changes) { expect(c.from).toBe(a.bands[c.row]); expect(c.to).toBe(b.bands[c.row]); expect(c.from).not.toBe(c.to); }
        for (const row of ROWS.filter((x) => !expected.includes(x))) expect(a.bands[row]).toBe(b.bands[row]);
      }
    }
  });
});
