/**
 * The 24 solar terms (二十四節氣).
 *
 * A term is the instant the Sun's apparent longitude reaches a multiple of 15° — an astronomical
 * event, not a calendar convention. So there is no lookup table here, only a root-find of
 * λ(t) = target.
 *
 * 節 (jie) and 氣 (qi) alternate. The twelve 節 bound the month branches; the twelve 氣 do not.
 * Month pillars always use the 節 — the most common confusion between BaZi and the lunar calendar.
 */

import { apparentSolarLongitude, MEAN_SOLAR_MOTION_DEG_PER_DAY } from "./sun.ts";
import { normSigned, norm360 } from "./math.ts";
import { asTT, asUT, fromJulianDay, toJulianDay, type JdTT, type JdUT } from "./julian.ts";
import { deltaTSeconds, utToTT } from "./deltaT.ts";
import type { Branch } from "../types.ts";

export type TermKind = "節" | "氣";

export interface SolarTermDef {
  readonly name: string;
  /** Apparent solar longitude in degrees. */
  readonly longitude: number;
  readonly kind: TermKind;
  /** For a 節, the month branch it opens; null for a 氣. */
  readonly opensMonthBranch: Branch | null;
}

/** In longitude order starting at 立春 (315°). */
export const SOLAR_TERMS: readonly SolarTermDef[] = Object.freeze([
  { name: "立春", longitude: 315, kind: "節", opensMonthBranch: "寅" },
  { name: "雨水", longitude: 330, kind: "氣", opensMonthBranch: null },
  { name: "驚蟄", longitude: 345, kind: "節", opensMonthBranch: "卯" },
  { name: "春分", longitude: 0, kind: "氣", opensMonthBranch: null },
  { name: "清明", longitude: 15, kind: "節", opensMonthBranch: "辰" },
  { name: "穀雨", longitude: 30, kind: "氣", opensMonthBranch: null },
  { name: "立夏", longitude: 45, kind: "節", opensMonthBranch: "巳" },
  { name: "小滿", longitude: 60, kind: "氣", opensMonthBranch: null },
  { name: "芒種", longitude: 75, kind: "節", opensMonthBranch: "午" },
  { name: "夏至", longitude: 90, kind: "氣", opensMonthBranch: null },
  { name: "小暑", longitude: 105, kind: "節", opensMonthBranch: "未" },
  { name: "大暑", longitude: 120, kind: "氣", opensMonthBranch: null },
  { name: "立秋", longitude: 135, kind: "節", opensMonthBranch: "申" },
  { name: "處暑", longitude: 150, kind: "氣", opensMonthBranch: null },
  { name: "白露", longitude: 165, kind: "節", opensMonthBranch: "酉" },
  { name: "秋分", longitude: 180, kind: "氣", opensMonthBranch: null },
  { name: "寒露", longitude: 195, kind: "節", opensMonthBranch: "戌" },
  { name: "霜降", longitude: 210, kind: "氣", opensMonthBranch: null },
  { name: "立冬", longitude: 225, kind: "節", opensMonthBranch: "亥" },
  { name: "小雪", longitude: 240, kind: "氣", opensMonthBranch: null },
  { name: "大雪", longitude: 255, kind: "節", opensMonthBranch: "子" },
  { name: "冬至", longitude: 270, kind: "氣", opensMonthBranch: null },
  { name: "小寒", longitude: 285, kind: "節", opensMonthBranch: "丑" },
  { name: "大寒", longitude: 300, kind: "氣", opensMonthBranch: null },
]);

export function termByLongitude(longitude: number): SolarTermDef {
  const def = SOLAR_TERMS.find((t) => t.longitude === norm360(longitude));
  if (def === undefined) throw new RangeError(`${longitude}° is not a solar-term longitude`);
  return def;
}

export interface SolveResult {
  readonly jdTT: JdTT;
  readonly jdUT: JdUT;
  readonly iterations: number;
  readonly residualDeg: number;
}

const TOLERANCE_DEG = 1e-8;   // ≈ 0.036″, far tighter than the series itself
const MAX_ITERATIONS = 30;

/**
 * Newton iteration on λ(t) = target. The slope is taken as the mean solar motion; the true rate
 * varies ±1.7 % over the year but Newton tolerates a crude derivative — 3–4 rounds suffice.
 */
export function solveSolarTerm(targetLongitudeDeg: number, approxJdTT: JdTT): SolveResult {
  let t = approxJdTT as number;
  let delta = Number.NaN;
  let i = 0;
  for (; i < MAX_ITERATIONS; i++) {
    delta = normSigned(targetLongitudeDeg - apparentSolarLongitude(asTT(t)));
    if (Math.abs(delta) < TOLERANCE_DEG) break;
    t += delta / MEAN_SOLAR_MOTION_DEG_PER_DAY;
  }
  if (!(Math.abs(delta) < TOLERANCE_DEG)) {
    throw new Error(`Solar-term solve did not converge: target ${targetLongitudeDeg}°, residual ${delta}° after ${MAX_ITERATIONS} rounds`);
  }
  const cal = fromJulianDay(t);
  const jdUT = t - deltaTSeconds(cal.year, cal.month).seconds / 86400;
  return { jdTT: asTT(t), jdUT: asUT(jdUT), iterations: i, residualDeg: delta };
}

/** Mean spacing of the 24 terms, days. */
export const MEAN_TERM_INTERVAL_DAYS = 365.2421897 / 24;

/**
 * Terms bracketing a UT instant, of one kind. Not by enumerating the year: the instant's own
 * longitude locates its 30° bin, and only the two bounding terms are solved.
 */
export function enclosingTerms(jdUT: number, kind: TermKind): {
  prev: { def: SolarTermDef; jdUT: number };
  next: { def: SolarTermDef; jdUT: number };
} {
  const base = kind === "節" ? 315 : 330;
  const jdTT = utToTT(jdUT);
  const lambda = apparentSolarLongitude(asTT(jdTT));
  const k = Math.floor(norm360(lambda - base) / 30);
  const prevLon = norm360(base + 30 * k);
  const nextLon = norm360(prevLon + 30);

  const guessPrev = jdTT - norm360(lambda - prevLon) / MEAN_SOLAR_MOTION_DEG_PER_DAY;
  const guessNext = jdTT + norm360(nextLon - lambda) / MEAN_SOLAR_MOTION_DEG_PER_DAY;
  const prev = solveSolarTerm(prevLon, asTT(guessPrev));
  const next = solveSolarTerm(nextLon, asTT(guessNext));
  return {
    prev: { def: termByLongitude(prevLon), jdUT: prev.jdUT },
    next: { def: termByLongitude(nextLon), jdUT: next.jdUT },
  };
}

/** UT instant of 立春 in a Gregorian year. */
export function lichunOf(year: number): number {
  const guess = toJulianDay({ year, month: 2, day: 4, hour: 0, minute: 0, second: 0 });
  return solveSolarTerm(315, asTT(utToTT(guess))).jdUT;
}

/** All 24 terms of a Gregorian year, ascending (小寒 early January … 冬至 late December). */
export function termsInGregorianYear(year: number): (SolveResult & { def: SolarTermDef })[] {
  const jan1 = toJulianDay({ year, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
  const startIndex = SOLAR_TERMS.findIndex((t) => t.name === "小寒");
  const out: (SolveResult & { def: SolarTermDef })[] = [];
  for (let k = 0; k < 24; k++) {
    const def = SOLAR_TERMS[(startIndex + k) % 24] as SolarTermDef;
    const guess = jan1 + 5 + k * MEAN_TERM_INTERVAL_DAYS;
    out.push({ ...solveSolarTerm(def.longitude, asTT(guess)), def });
  }
  return out;
}
