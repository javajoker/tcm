/**
 * Civil clock time → UTC → true solar time.
 *
 * Time zones use the platform's Intl + IANA tzdata (no dependency): tzdata carries the full history
 * (China's 1986–91 DST, 1940–41 and 1945–48 DST …) and any hand-written table would go stale.
 *
 * DST creates two pathological wall-clock times that are reported, never silently resolved:
 *   · overlap (autumn fall-back)  — one wall time maps to two UTC instants; the birth time is
 *     genuinely ambiguous (the earlier instant is returned, the other as an alternative)
 *   · gap (spring forward)        — that wall time does not exist
 *
 * True solar time takes three steps, in this order:
 *   1. wall clock → UTC                    (zone + historical DST)
 *   2. UTC → local mean solar time         (the birthplace's ACTUAL longitude, not the zone's meridian)
 *   3. local mean → apparent solar time    (equation of time)
 * Step 2 matters: Ürümqi (87°E) is 33° — 132 minutes — west of the 120°E meridian that China's single
 * zone uses; using the zone meridian would be wrong by more than a whole 時辰 for Xinjiang births.
 */

import { asTT, millisToJulianDay, type CalendarDateTime } from "./astro/julian.ts";
import { deltaTSeconds } from "./astro/deltaT.ts";
import { equationOfTimeMinutes } from "./astro/sun.ts";

export type OffsetResolution = "unique" | "ambiguous" | "nonexistent";

export interface WallTimeConversion {
  /** UTC milliseconds. For an overlap, the earlier instant (daylight-saving side). */
  readonly utcMillis: number;
  readonly offsetMinutes: number;
  readonly resolution: OffsetResolution;
  readonly alternativeUtcMillis: number | null;
  readonly alternativeOffsetMinutes: number | null;
  readonly isDaylightSaving: boolean;
}

/** Zone offset (minutes, east positive) at a UTC instant. */
export function offsetMinutesAt(utcMillis: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMillis));
  const pick = (type: string): number => {
    const p = parts.find((x) => x.type === type);
    if (p === undefined) throw new Error(`Time zone ${timeZone}: formatter returned no ${type} field`);
    return Number(p.value);
  };
  const localAsUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), pick("hour"), pick("minute"), pick("second"));
  return Math.round((localAsUtc - Math.floor(utcMillis / 1000) * 1000) / 60000);
}

const wallAsUtcMillis = (w: CalendarDateTime): number =>
  Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, Math.floor(w.second), Math.round((w.second % 1) * 1000));

/**
 * Wall clock → UTC.
 *
 * Fixed-point iteration is NOT used: probing with the wall time as UTC and re-reading the offset
 * converges to the same candidate in an overlap hour, so it would always say "unique" exactly where
 * ambiguity must be reported. Instead, take the offset from BOTH sides of any transition (±24 h),
 * form at most two candidates and round-trip each:
 *   both valid → overlap · one valid → unique · none valid → gap.
 */
export function wallTimeToUtc(wall: CalendarDateTime, timeZone: string): WallTimeConversion {
  const naive = wallAsUtcMillis(wall);
  const DAY = 86400000;
  const offBefore = offsetMinutesAt(naive - DAY, timeZone);
  const offAfter = offsetMinutesAt(naive + DAY, timeZone);

  const roundTrips = (utc: number): boolean => offsetMinutesAt(utc, timeZone) * 60000 + utc === naive;
  const valid: { utc: number; off: number }[] = [];
  for (const off of new Set([offBefore, offAfter])) {
    const c = naive - off * 60000;
    if (roundTrips(c) && !valid.some((v) => v.utc === c)) valid.push({ utc: c, off: offsetMinutesAt(c, timeZone) });
  }

  const standardOffset = Math.min(
    offsetMinutesAt(Date.UTC(wall.year, 0, 15), timeZone),
    offsetMinutesAt(Date.UTC(wall.year, 6, 15), timeZone),
  );

  if (valid.length === 1) {
    const v = valid[0] as { utc: number; off: number };
    return { utcMillis: v.utc, offsetMinutes: v.off, resolution: "unique", alternativeUtcMillis: null, alternativeOffsetMinutes: null, isDaylightSaving: v.off > standardOffset };
  }
  if (valid.length === 2) {
    const [first, second] = [...valid].sort((a, b) => a.utc - b.utc) as [{ utc: number; off: number }, { utc: number; off: number }];
    return { utcMillis: first.utc, offsetMinutes: first.off, resolution: "ambiguous", alternativeUtcMillis: second.utc, alternativeOffsetMinutes: second.off, isDaylightSaving: first.off > standardOffset };
  }
  const cand = naive - offBefore * 60000;
  return { utcMillis: cand, offsetMinutes: offBefore, resolution: "nonexistent", alternativeUtcMillis: null, alternativeOffsetMinutes: null, isDaylightSaving: offBefore > standardOffset };
}

export interface TrueSolarTimeInput {
  readonly wall: CalendarDateTime;
  readonly timeZone: string;
  /** Birthplace longitude, degrees, east positive. */
  readonly longitude: number;
  readonly applyEquationOfTime?: boolean;
  readonly applyLongitude?: boolean;
  /** Which instant to take when the wall time occurs twice (a daylight-saving overlap): the first (daylight-saving side, the default) or the second (standard time). Ignored otherwise. */
  readonly fold?: "first" | "second";
}

export interface TrueSolarTimeResult {
  /** Julian day (UT scale) carrying the true-solar clock — hour branch and day boundary use this. */
  readonly jdTrueSolar: number;
  /** Absolute instant (UT) — year/month pillars and solar-term comparisons use THIS, never the above. */
  readonly jdCivil: number;
  readonly corrections: {
    readonly tzOffsetMinutes: number;
    readonly isDaylightSaving: boolean;
    readonly longitudeMinutes: number;
    readonly equationOfTimeMinutes: number;
    readonly totalMinutes: number;
  };
  readonly resolution: OffsetResolution;
  readonly alternativeJd: number | null;
}

/** 4 minutes of time per degree of longitude. */
export const MINUTES_PER_DEGREE = 4;

export function toTrueSolarTime(input: TrueSolarTimeInput): TrueSolarTimeResult {
  const applyEot = input.applyEquationOfTime ?? true;
  const applyLon = input.applyLongitude ?? true;

  const first = wallTimeToUtc(input.wall, input.timeZone);
  const second = input.fold === "second" && first.resolution === "ambiguous" && first.alternativeUtcMillis !== null && first.alternativeOffsetMinutes !== null;
  const conv: WallTimeConversion = second
    ? { utcMillis: first.alternativeUtcMillis!, offsetMinutes: first.alternativeOffsetMinutes!, resolution: "ambiguous", alternativeUtcMillis: first.utcMillis, alternativeOffsetMinutes: first.offsetMinutes, isDaylightSaving: false }
    : first;
  const jdCivil = millisToJulianDay(conv.utcMillis);

  const longitudeMinutes = applyLon ? input.longitude * MINUTES_PER_DEGREE : 0;
  const dt = deltaTSeconds(input.wall.year, input.wall.month);
  const eot = applyEot ? equationOfTimeMinutes(asTT(jdCivil + dt.seconds / 86400)) : 0;
  const totalMinutes = longitudeMinutes + eot;

  return {
    jdTrueSolar: jdCivil + totalMinutes / 1440,
    jdCivil,
    corrections: { tzOffsetMinutes: conv.offsetMinutes, isDaylightSaving: conv.isDaylightSaving, longitudeMinutes, equationOfTimeMinutes: eot, totalMinutes },
    resolution: conv.resolution,
    alternativeJd: conv.alternativeUtcMillis === null ? null : millisToJulianDay(conv.alternativeUtcMillis) + totalMinutes / 1440,
  };
}
