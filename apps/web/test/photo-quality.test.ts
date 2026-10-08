// The quality gate of a photo (PM-50; src/ai/photo/quality.ts): size, light, contrast, focus and colour, measured on the middle of the picture's pixels. Synthetic pictures stand for the
// cases; the numbers are first values (the spike's capture-side protocol tunes them), so these tests say what the gate refuses and accepts, not that the thresholds are right.
import { describe, expect, it } from "vitest";
import { assess, GATE, measure, type Pixels } from "../src/ai/photo/quality.ts";

/** A deterministic noise in [-1, 1) (a small LCG), so the "photos" are the same on every run. */
function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 31 - 1; };
}

function picture(w: number, h: number, colour: (x: number, y: number, n: number) => readonly [number, number, number], seed = 1): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  const rnd = noise(seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = colour(x, y, rnd());
    data.set([r, g, b, 255], (y * w + x) * 4);
  }
  return { width: w, height: h, data };
}

const W = 384, H = 288;
const CAMERA = { width: 1200, height: 900 };
// a tongue: pink-red with a grain (papillae) and a soft shade across
const tongue = picture(W, H, (_x, y, n) => [205 + n * 45 - y * 0.05, 110 + n * 45, 120 + n * 45]);
// a face under a window: skin tones with a grain
const face = picture(W, H, (x, _y, n) => [215 + n * 40, 165 + n * 40 - x * 0.02, 140 + n * 40]);

describe("the quality gate", () => {
  it("accepts a sharp, well-lit tongue and a sharp, well-lit face", () => {
    expect(assess(tongue, CAMERA, "tongue")).toMatchObject({ ok: true, issues: [] });
    expect(assess(face, CAMERA, "face")).toMatchObject({ ok: true, issues: [] });
  });

  it("measures the middle of the picture: a dark border does not make a good picture dark", () => {
    const framed = picture(W, H, (x, y, n) => (x < 40 || x > W - 40 || y < 30 || y > H - 30 ? [5, 5, 5] : [205 + n * 45, 110 + n * 45, 120 + n * 45]));
    expect(assess(framed, CAMERA, "tongue").issues).toEqual([]);
    expect(measure(framed).mean).toBeGreaterThan(GATE.meanMin);
  });

  it("refuses a picture that is too small, however good", () => {
    expect(assess(tongue, { width: 400, height: 300 }, "tongue").issues).toEqual(["small"]);
    expect(assess(tongue, { width: 3000, height: 479 }, "tongue").issues).toEqual(["small"]);
    expect(assess(tongue, { width: 480, height: 640 }, "tongue").ok).toBe(true);
  });

  it("refuses a picture that is too dark or too bright", () => {
    const dim = picture(W, H, (_x, _y, n) => [50 + n * 40, 25 + n * 40, 28 + n * 40]);
    const glare = picture(W, H, (_x, _y, n) => [250 + n * 5, 230 + n * 20, 235 + n * 20]);
    expect(assess(dim, CAMERA, "tongue").issues).toContain("dark");
    expect(assess(glare, CAMERA, "tongue").issues).toContain("bright");
    expect(assess(dim, CAMERA, "tongue").issues).not.toContain("bright");
    const burnt = picture(W, H, (x, _y, n) => (x % 4 < 1 ? [255, 255, 255] : [200 + n * 40, 100 + n * 40, 110 + n * 40]));
    expect(assess(burnt, CAMERA, "tongue").issues, "a quarter of the pixels blown out").toContain("bright");
  });

  it("refuses a picture without contrast, and does not also call it out of focus", () => {
    const wall = picture(W, H, () => [200, 120, 130]);
    expect(assess(wall, CAMERA, "tongue").issues).toEqual(["flat"]);
    const covered = picture(W, H, () => [0, 0, 0]);
    expect(assess(covered, CAMERA, "tongue").issues).toEqual(["dark", "flat"]);
  });

  it("refuses a picture that is out of focus: contrast, but no edges", () => {
    const blurred = picture(W, H, (x, y) => [205 + 70 * Math.sin(x / 31) * Math.cos(y / 27), 110 + 70 * Math.sin(x / 31) * Math.cos(y / 27), 120 + 70 * Math.sin(x / 31) * Math.cos(y / 27)]);
    const q = assess(blurred, CAMERA, "tongue");
    expect(q.issues).toEqual(["blurry"]);
    expect(q.measures.sd).toBeGreaterThan(GATE.contrastMin);
    expect(q.measures.sharp).toBeLessThan(GATE.sharpMin);
  });

  it("refuses a strong colour cast, by the range of the module: blue light on a face; a tongue is allowed to be redder than a face", () => {
    const blue = picture(W, H, (_x, _y, n) => [90 + n * 45, 120 + n * 45, 200 + n * 45]);
    expect(assess(blue, CAMERA, "face").issues).toEqual(["cast"]);
    expect(assess(blue, CAMERA, "tongue").issues).toEqual(["cast"]);
    const crimson = picture(W, H, (_x, _y, n) => [190 + n * 45, 55 + n * 40, 65 + n * 40]);          // a red tongue: red to green about 3.4
    expect(assess(crimson, CAMERA, "tongue").issues).toEqual([]);
    expect(assess(crimson, CAMERA, "face").issues, "…but not a face").toEqual(["cast"]);
  });

  it("lists every reason, in a fixed order, and says ok only for none", () => {
    const bad = picture(W, H, (_x, _y, n) => [40 + n * 30, 90 + n * 30, 190 + n * 30]);
    const q = assess(bad, { width: 300, height: 300 }, "face");
    expect(q.ok).toBe(false);
    expect(q.issues[0]).toBe("small");
    expect([...q.issues]).toEqual([...q.issues].sort((a, b) => ["small", "dark", "bright", "flat", "blurry", "cast"].indexOf(a) - ["small", "dark", "bright", "flat", "blurry", "cast"].indexOf(b)));
  });

  it("an empty picture is not a good one", () => {
    expect(assess({ width: 0, height: 0, data: [] }, CAMERA, "tongue").ok).toBe(false);
    expect(measure({ width: 2, height: 2, data: new Uint8ClampedArray(16) }).sharp).toBe(0);
  });
});
