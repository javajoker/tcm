// The quality gate of a photo (PM-50; docs/post-mvp/spikes/tongue-photo.md §2 "Capture side"): before a photo goes anywhere, the device looks at its pixels — size, light, focus, colour —
// and refuses one that cannot be read, with the reason in plain words and a way to do better. Pure: it works on the RGBA pixels of a small copy of the picture, so it is tested without a
// camera. The thresholds are first values, not measurements: the spike's protocol asks what share of casual phone photos pass a gate, and the gate is tuned against that — never against
// what the model says.
import type { ObserveModule } from "@tcm/ai";

export interface Pixels {
  readonly width: number;
  readonly height: number;
  /** RGBA, row by row (the data of a canvas's ImageData). */
  readonly data: ArrayLike<number>;
}

/** Why a photo will not do: too small a picture, too dark, too bright, no contrast at all, out of focus, a strong colour cast. */
export type Issue = "small" | "dark" | "bright" | "flat" | "blurry" | "cast";

export const GATE = {
  /** The shorter side of the picture as it came from the camera, in pixels. */
  minSide: 480,
  /** The long side of the copy the gate looks at. */
  analysis: 384,
  /** The share of each side, in the middle, that is looked at: the tongue or the face is in the middle of the frame. */
  centre: 0.6,
  /** Mean brightness (0–255) outside which the picture is too dark or too bright; and the shares of near-black (< 25) and near-white (> 245) pixels that are too many. */
  meanMin: 60,
  meanMax: 200,
  darkShare: 0.5,
  brightShare: 0.15,
  /** The standard deviation of brightness below which the picture is flat (a covered lens, a wall). */
  contrastMin: 14,
  /** The variance of the Laplacian of brightness at the analysis size below which the picture is out of focus. */
  sharpMin: 30,
  /** The ranges of red to green and of blue to green in the middle of the picture. A tongue is redder than a face; outside them the light has coloured the picture. */
  cast: {
    tongue: { redGreen: [0.9, 4.0], blueGreen: [0.45, 1.5] },
    face: { redGreen: [0.95, 2.4], blueGreen: [0.45, 1.15] },
  },
} as const;

export interface Measures {
  readonly mean: number;
  readonly sd: number;
  readonly dark: number;
  readonly bright: number;
  readonly sharp: number;
  readonly redGreen: number;
  readonly blueGreen: number;
}

export interface Quality {
  readonly ok: boolean;
  readonly issues: readonly Issue[];
  readonly measures: Measures;
}

/** What the middle of a picture measures. */
export function measure(p: Pixels): Measures {
  const { width: w, height: h, data } = p;
  const x0 = Math.floor((w * (1 - GATE.centre)) / 2), y0 = Math.floor((h * (1 - GATE.centre)) / 2);
  const cw = Math.max(0, w - 2 * x0), ch = Math.max(0, h - 2 * y0);
  const n = cw * ch;
  if (n === 0) return { mean: 0, sd: 0, dark: 1, bright: 0, sharp: 0, redGreen: 0, blueGreen: 0 };
  const luma = new Float32Array(n);
  let sum = 0, dark = 0, bright = 0, r = 0, g = 0, b = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const at = ((y0 + y) * w + (x0 + x)) * 4;
      const red = data[at]!, green = data[at + 1]!, blue = data[at + 2]!;
      const l = 0.299 * red + 0.587 * green + 0.114 * blue;
      luma[y * cw + x] = l;
      sum += l; r += red; g += green; b += blue;
      if (l < 25) dark++;
      if (l > 245) bright++;
    }
  }
  const mean = sum / n;
  let squares = 0;
  for (let i = 0; i < n; i++) squares += (luma[i]! - mean) ** 2;
  // the variance of the Laplacian over the interior: the classic measure of focus
  let lapSum = 0, lapSquares = 0, lapN = 0;
  for (let y = 1; y < ch - 1; y++) {
    for (let x = 1; x < cw - 1; x++) {
      const i = y * cw + x;
      const lap = luma[i - 1]! + luma[i + 1]! + luma[i - cw]! + luma[i + cw]! - 4 * luma[i]!;
      lapSum += lap; lapSquares += lap * lap; lapN++;
    }
  }
  const sharp = lapN === 0 ? 0 : lapSquares / lapN - (lapSum / lapN) ** 2;
  return { mean, sd: Math.sqrt(squares / n), dark: dark / n, bright: bright / n, sharp, redGreen: g === 0 ? 0 : r / g, blueGreen: g === 0 ? 0 : b / g };
}

const outside = (v: number, [lo, hi]: readonly [number, number]): boolean => v < lo || v > hi;

/**
 * Whether a photo will do. `original` is the picture as it came from the camera; `pixels` a copy of it at about `GATE.analysis` pixels on its long side. The issues come in the order
 * size, light, contrast, focus, colour; a picture without contrast is not also called out of focus.
 */
export function assess(pixels: Pixels, original: { readonly width: number; readonly height: number }, module: ObserveModule): Quality {
  const m = measure(pixels);
  const issues: Issue[] = [];
  if (Math.min(original.width, original.height) < GATE.minSide) issues.push("small");
  if (m.mean < GATE.meanMin || m.dark > GATE.darkShare) issues.push("dark");
  else if (m.mean > GATE.meanMax || m.bright > GATE.brightShare) issues.push("bright");
  const flat = m.sd < GATE.contrastMin;
  if (flat) issues.push("flat");
  else if (m.sharp < GATE.sharpMin) issues.push("blurry");
  const range = GATE.cast[module];
  if (!flat && (outside(m.redGreen, range.redGreen) || outside(m.blueGreen, range.blueGreen))) issues.push("cast");
  return { ok: issues.length === 0, issues, measures: m };
}
