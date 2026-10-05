// The tap-tempo estimator (docs/post-mvp/design/tap-tempo-and-regions.md §1.2, §1.4): known sequences, then simulated taps.
import { describe, expect, it } from "vitest";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { estimateTap, TAP } from "../src/screens/observe/tapTempo.ts";

const bands = indexKnowledgeBase(rawChunksFromDisk("dev")).pulse._meta.guidance.rate_bands;
/** n taps `ms` apart starting at `from`. */
const steady = (n: number, ms: number, from = 1000): number[] => Array.from({ length: n }, (_, i) => from + i * ms);
const atIntervals = (intervals: readonly number[]): number[] => intervals.reduce<number[]>((t, d) => [...t, t[t.length - 1]! + d], [5000]);

describe("the bands it reads", () => {
  it("are the pulse data's (rapid above 90, slow below 60), so the near-edge rule follows the data", () => {
    expect(bands).toMatchObject({ rapid_gt: 90, slow_lt: 60 });
  });
});

describe("known sequences", () => {
  it("steady taps give the rate, whole", () => {
    expect(estimateTap(steady(15, 800), bands)).toMatchObject({ status: "ok", rate: 75, valid: 14, unevenHint: false });      // 75 bpm
    expect(estimateTap(steady(12, 667), bands).rate).toBe(90);                                                                 // 89.96 → 90
    expect(estimateTap(steady(30, 900), bands)).toMatchObject({ status: "ok", rate: 67, valid: 29 });                         // the longest run
    expect(estimateTap(steady(13, 300), bands)).toMatchObject({ status: "ok", rate: 200 });                                    // fast but plausible
  });

  it("a double tap and a missed beat are dropped, not averaged in", () => {
    const withDouble = atIntervals([800, 800, 800, 120, 680, 800, 800, 800, 800, 800, 800, 800, 800]);                  // one beat tapped twice (120 + 680 = 800 would be one interval; here it is two)
    const r = estimateTap(withDouble, bands);
    expect(r.status).toBe("ok");
    expect(r.rate).toBe(75);
    expect(r.valid).toBeLessThan(13);
    const withMissed = atIntervals([800, 800, 800, 1600, 800, 800, 800, 800, 800, 800, 800, 800, 800]);                 // one beat not tapped
    const m = estimateTap(withMissed, bands);
    expect(m).toMatchObject({ status: "ok", rate: 75, valid: 13 });                                                     // 12 beats and one interval that holds two
  });

  it("intervals outside 30 to 240 beats per minute are not beats", () => {
    const r = estimateTap(atIntervals([800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 5000, 100]), bands);
    expect(r).toMatchObject({ status: "ok", rate: 75, valid: 11 });
  });

  it("fewer than 12 taps, or fewer than 8 usable intervals, is too few — never a number", () => {
    expect(estimateTap(steady(11, 800), bands)).toEqual({ status: "too-few", rate: null, valid: 0, spread: null, unevenHint: false });
    expect(estimateTap([], bands).status).toBe("too-few");
    expect(estimateTap(steady(12, 5000), bands).status).toBe("too-few");                                                  // every interval is longer than two seconds
    // 12 taps, but the intervals alternate between two values far apart: most are neither a beat nor a missed beat, so there is no number (and the taps are called uneven)
    const alternating = estimateTap(atIntervals([300, 1500, 300, 1500, 300, 1500, 300, 1500, 300, 1500, 300]), bands);
    expect(alternating.rate).toBeNull();
    expect(alternating.status).toBe("too-uneven");
    // times that are not numbers are ignored; what is left decides
    expect(estimateTap([...steady(11, 800), Number.NaN], bands).status).toBe("too-few");
    expect(estimateTap([...steady(12, 800), Number.NaN], bands).status).toBe("ok");
  });

  it("taps that wander too much give no number, and say so", () => {
    const wander = atIntervals([500, 900, 600, 1100, 450, 1000, 700, 1200, 550, 950, 650, 1150]);
    const r = estimateTap(wander, bands);
    expect(r.status).toBe("too-uneven");
    expect(r.rate).toBeNull();
    expect(r.spread).toBeGreaterThan(TAP.maxSpread);
    expect(r.unevenHint).toBe(false);
  });

  it("a number close to a band edge is flagged: within 3 beats per minute of 90 (rapid) or 60 (slow)", () => {
    for (const bpm of [87, 88, 90, 93, 57, 58, 60, 63]) expect(estimateTap(steady(13, 60000 / bpm), bands), `${bpm}`).toMatchObject({ status: "near-edge", rate: bpm });
    for (const bpm of [75, 120, 50, 86, 94, 64, 56, 200]) expect(estimateTap(steady(13, 60000 / bpm), bands), `${bpm}`).toMatchObject({ status: "ok", rate: bpm });
  });

  it("uneven but usable taps give the number and a hint, never a decision", () => {
    const r = estimateTap(atIntervals([680, 920, 680, 920, 680, 920, 680, 920, 680, 920, 680, 920]), bands);
    expect(r.rate).toBe(75);
    expect(r.status).toBe("ok");
    expect(r.spread).toBeGreaterThan(TAP.hintSpread);
    expect(r.spread).toBeLessThanOrEqual(TAP.maxSpread);
    expect(r.unevenHint).toBe(true);
    expect(estimateTap(steady(13, 800), bands).unevenHint).toBe(false);
  });

  it("only the differences matter: the constant latency of a device cancels", () => {
    const a = estimateTap(steady(14, 800, 0), bands), b = estimateTap(steady(14, 800, 123456.789), bands);
    expect({ ...a, spread: 0 }).toEqual({ ...b, spread: 0 });
  });
});

// A small deterministic generator (mulberry32) and a normal variate (Box–Muller), so the simulations are the same on every run.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const normal = (r: () => number): number => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

describe("simulated taps", () => {
  const tapsAt = (bpm: number, n: number, jitter: (r: () => number) => number, r: () => number): number[] => Array.from({ length: n }, (_, i) => 1000 + (i * 60000) / bpm + jitter(r));

  it("95 % of runs at 40–140 beats per minute with 30 ms of jitter land within ±3 — normal jitter (σ = 30 ms) and uniform (±30 ms), at the shortest run and the longest", () => {
    for (const [name, jitter] of [["normal σ 30", (r: () => number) => 30 * normal(r)], ["uniform ±30", (r: () => number) => (r() * 2 - 1) * 30]] as const) {
      for (const n of [TAP.minTaps, TAP.maxTaps]) {
        const r = rng(n * 7919);
        let within = 0, given = 0;
        const runs = 1000;
        for (let i = 0; i < runs; i++) {
          const bpm = 40 + Math.floor(r() * 101);
          const res = estimateTap(tapsAt(bpm, n, jitter, r), bands);
          if (res.rate !== null) { given++; if (Math.abs(res.rate - bpm) <= 3) within++; }
        }
        expect(given, `${name}, ${n} taps: a number is given`).toBeGreaterThan(runs * 0.99);
        expect(within / runs, `${name}, ${n} taps`).toBeGreaterThanOrEqual(0.95);
      }
    }
  });

  it("random intervals never produce a number above the spread limit, and a number always comes with its spread", () => {
    const r = rng(2026);
    let numbers = 0, refusals = 0;
    for (let i = 0; i < 2000; i++) {
      const n = TAP.minTaps + Math.floor(r() * (TAP.maxTaps - TAP.minTaps + 1));
      const spreadOfRun = r() * 0.9;                                  // from steady to wild
      const base = 300 + r() * 1500;
      const res = estimateTap(atIntervals(Array.from({ length: n - 1 }, () => Math.max(1, base * (1 + (r() * 2 - 1) * spreadOfRun)))), bands);
      if (res.rate !== null) { numbers++; expect(res.spread).not.toBeNull(); expect(res.spread!).toBeLessThanOrEqual(TAP.maxSpread); expect(res.valid).toBeGreaterThanOrEqual(TAP.minIntervals); }
      else { refusals++; expect(["too-few", "too-uneven"]).toContain(res.status); }
    }
    expect(numbers).toBeGreaterThan(100);
    expect(refusals).toBeGreaterThan(100);
  });

  it("a double tap or a missed beat somewhere in a steady run does not move the rate by more than 3", () => {
    const r = rng(77);
    for (let i = 0; i < 300; i++) {
      const bpm = 45 + Math.floor(r() * 91);
      const ms = 60000 / bpm;
      const intervals = Array.from({ length: 18 }, () => ms + (r() * 2 - 1) * 20);
      const at = Math.floor(r() * intervals.length);
      const damaged = r() < 0.5 ? [...intervals.slice(0, at), 0.15 * ms, 0.85 * ms, ...intervals.slice(at + 1)] : [...intervals.slice(0, at), intervals[at]! + (intervals[at + 1] ?? ms), ...intervals.slice(at + 2)];
      const res = estimateTap(atIntervals(damaged), bands);
      expect(res.rate, `${bpm} bpm`).not.toBeNull();
      expect(Math.abs(res.rate! - bpm), `${bpm} bpm → ${res.rate}`).toBeLessThanOrEqual(3);
    }
  });
});
