/**
 * ΔT = TT − UT (seconds): the difference between terrestrial and universal time.
 *
 * Espenak & Meeus (2006) piecewise polynomials, as used on NASA's eclipse site.
 *
 * Why it cannot be dropped: over 1900–2100 ΔT ranges from about −3 s to +200 s while the engine's
 * solar-term tolerance is 60 s. Ignoring it shifts 20th-century terms by tens of seconds and late
 * 21st-century terms by minutes.
 *
 * Honest limit: after 2005 the polynomial is an extrapolation. The true ΔT depends on irregular
 * changes in Earth's rotation, so beyond 2050 the 60-second tolerance is NOT promised.
 */

import { fromJulianDay } from "./julian.ts";

export interface DeltaT {
  readonly seconds: number;
  readonly basis: "fitted" | "extrapolated";
}

export function decimalYear(year: number, month: number): number {
  return year + (month - 0.5) / 12;
}

const poly = (t: number, c: readonly number[]): number => c.reduce((acc, coef, i) => acc + coef * Math.pow(t, i), 0);

export function deltaTSeconds(year: number, month: number): DeltaT {
  const y = decimalYear(year, month);
  if (y >= 1900 && y < 1920) return { seconds: poly(y - 1900, [-2.79, 1.494119, -0.0598939, 0.0061966, -0.000197]), basis: "fitted" };
  if (y >= 1920 && y < 1941) return { seconds: poly(y - 1920, [21.2, 0.84493, -0.0761, 0.0020936]), basis: "fitted" };
  if (y >= 1941 && y < 1961) {
    const t = y - 1950;
    return { seconds: 29.07 + 0.407 * t - (t * t) / 233 + (t * t * t) / 2547, basis: "fitted" };
  }
  if (y >= 1961 && y < 1986) {
    const t = y - 1975;
    return { seconds: 45.45 + 1.067 * t - (t * t) / 260 - (t * t * t) / 718, basis: "fitted" };
  }
  if (y >= 1986 && y < 2005) return { seconds: poly(y - 2000, [63.86, 0.3345, -0.060374, 0.0017275, 0.000651814, 0.00002373599]), basis: "fitted" };
  if (y >= 2005 && y < 2050) return { seconds: poly(y - 2000, [62.92, 0.32217, 0.005589]), basis: "extrapolated" };
  if (y >= 2050 && y < 2150) {
    const u = (y - 1820) / 100;
    return { seconds: -20 + 32 * u * u - 0.5628 * (2150 - y), basis: "extrapolated" };
  }
  const u = (y - 1820) / 100;
  return { seconds: -20 + 32 * u * u, basis: "extrapolated" };
}

/** Last year for which the 60-second solar-term tolerance is promised. */
export const TOLERANCE_GUARANTEED_UNTIL_YEAR = 2050;

/** UT Julian day → TT Julian day (ΔT taken at the calendar month of that instant). */
export function utToTT(jdUT: number): number {
  const cal = fromJulianDay(jdUT);
  return jdUT + deltaTSeconds(cal.year, cal.month).seconds / 86400;
}
