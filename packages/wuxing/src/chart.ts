/**
 * L0 — the natal chart: four pillars, the 人元司令 state and the 大運 sequence.
 *
 * Pure calendar-and-astronomy arithmetic with no interpretation; every field can be verified
 * against an independent almanac. Only what the wuxing weights need is built here (no 胎元, 命宮,
 * 神煞, lunar date).
 *
 * ## Which time scale decides what (the easiest place to go wrong)
 *
 *   year & month pillars → the ABSOLUTE instant (UT). Solar terms are astronomical events that occur
 *                           at one instant worldwide; comparing them with a longitude-shifted clock
 *                           double-counts the longitude and equation-of-time offsets.
 *   hour branch & day boundary → TRUE SOLAR TIME, a local construct that should move with longitude.
 */

import {
  branchAt, hourStemOf, mod, monthStemOf, polarityOf, stemAt, stepBranch, stepStem,
  HIDDEN_STEMS, SILING, elementOf,
} from "./ganzhi.ts";
import { enclosingTerms, lichunOf } from "./astro/solarTerms.ts";
import { fromJulianDay, julianDayNumber, type CalendarDateTime } from "./astro/julian.ts";
import { TOLERANCE_GUARANTEED_UNTIL_YEAR } from "./astro/deltaT.ts";
import { toTrueSolarTime, type OffsetResolution } from "./time.ts";
import { DEFAULT_PARAMS, type WuxingParams } from "./params.ts";
import type { Branch, Pillar, Sex, Stem, ZiHourRule } from "./types.ts";

export interface BirthInput {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second?: number;
  /** Sex at birth — only decides the direction of the 大運 sequence. */
  readonly sex: Sex;
  /** IANA zone of the birthplace, e.g. "Asia/Taipei". */
  readonly timeZone: string;
  /** Birthplace longitude, degrees, east positive. */
  readonly longitude: number;
  /** Set when the birth hour is unknown: the hour pillar is left out, never guessed. */
  readonly unknownHour?: boolean;
  /** For a wall time that occurs twice (daylight-saving overlap): `first` (daylight-saving side, the default) or `second` (standard time). */
  readonly fold?: "first" | "second";
}

export interface SilingInfo {
  readonly stem: Stem;
  readonly segment: 0 | 1 | 2;
  readonly daysIntoJie: number;
  /** Hidden stem of the month branch that receives the boost; null only for 亥 month days 0–7. */
  readonly resolvedTo: Stem | null;
  readonly resolution: "exact" | "sameElement" | "unresolvable";
}

export interface LuckPillar {
  readonly index: number;
  readonly pillar: Pillar;
  readonly startJd: number;
  readonly endJd: number;
  readonly startAgeYears: number;
}

export interface LuckInfo {
  readonly direction: "forward" | "reverse";
  readonly daysToTerm: number;
  readonly targetTermName: string;
  readonly startJd: number;
  readonly startAgeYears: number;
  readonly pillars: readonly LuckPillar[];
}

export interface NatalChart {
  readonly input: BirthInput;
  readonly birthJdUT: number;
  readonly trueSolarJd: number;
  readonly trueSolarCalendar: CalendarDateTime;
  readonly corrections: {
    readonly tzOffsetMinutes: number;
    readonly isDaylightSaving: boolean;
    readonly longitudeMinutes: number;
    readonly equationOfTimeMinutes: number;
    readonly resolution: OffsetResolution;
  };
  readonly year: Pillar;
  readonly month: Pillar;
  readonly day: Pillar;
  readonly hour: Pillar | null;
  readonly enclosingJie: { readonly prevName: string; readonly prevJd: number; readonly nextName: string; readonly nextJd: number };
  readonly siling: SilingInfo;
  readonly luck: LuckInfo;
  /** Mandatory: any chart must be able to say which rules produced it. */
  readonly rulesUsed: { readonly ziHourRule: ZiHourRule; readonly trueSolarTime: boolean; readonly equationOfTime: boolean };
  readonly warnings: readonly string[];
}

export const TROPICAL_YEAR_DAYS = 365.2421897;
/** The single conversion rate of 起運: 3 days = 1 year. Everything else is derived from it. */
export const DAYS_PER_LUCK_YEAR = 3;

// ── pillars ───────────────────────────────────────────────────────────────

/** Year pillar: bounded by 立春 (not lunar New Year, not 1 Jan). Year 4 CE is 甲子. */
export function yearPillarOf(birthJdUT: number): { pillar: Pillar; solarYear: number } {
  let solarYear = fromJulianDay(birthJdUT).year;
  if (birthJdUT < lichunOf(solarYear)) solarYear -= 1;
  return { pillar: { stem: stemAt(solarYear - 4), branch: branchAt(solarYear - 4) }, solarYear };
}

/** Hour branch from the true-solar hour: 23–01 子, 01–03 丑 … */
export function hourBranchOf(trueSolarHour: number): Branch {
  return branchAt(Math.floor(mod(trueSolarHour + 1, 24) / 2));
}

/**
 * Day and hour pillars. The day count is the Julian day number + 49 (mod 60), 0 = 甲子, anchored by
 * 1949-10-01 = 甲子 and 2000-01-01 = 戊午. Under `lateZiNextDay` the day advances at 23:00.
 */
export function dayAndHourPillarOf(
  trueSolar: CalendarDateTime, rule: ZiHourRule,
): { day: Pillar; hour: Pillar; dayAdvanced: boolean } {
  const lateZi = trueSolar.hour >= 23;
  const baseJdn = julianDayNumber(trueSolar.year, trueSolar.month, trueSolar.day);
  const dayAdvanced = lateZi && rule === "lateZiNextDay";
  const dayIndex = mod((dayAdvanced ? baseJdn + 1 : baseJdn) + 49, 60);
  const day: Pillar = { stem: stemAt(dayIndex), branch: branchAt(dayIndex) };

  const stemSourceJdn = lateZi && (rule === "lateZiNextDay" || rule === "split") ? baseJdn + 1 : baseJdn;
  const stemSource = stemAt(mod(stemSourceJdn + 49, 60));
  const hourBranch = hourBranchOf(trueSolar.hour);
  return { day, hour: { stem: hourStemOf(stemSource, hourBranch), branch: hourBranch }, dayAdvanced };
}

// ── 人元司令 ──────────────────────────────────────────────────────────────

export function silingOf(monthBranch: Branch, daysIntoJie: number): SilingInfo {
  const segments = SILING[monthBranch];
  let acc = 0;
  let segment = segments.length - 1;
  for (let i = 0; i < segments.length; i++) {
    acc += (segments[i] as { days: number }).days;
    if (daysIntoJie < acc) { segment = i; break; }
  }
  const stem = (segments[segment] as { stem: Stem }).stem;
  const hidden = HIDDEN_STEMS[monthBranch];
  if (hidden.includes(stem)) return { stem, segment: segment as 0 | 1 | 2, daysIntoJie, resolvedTo: stem, resolution: "exact" };
  const same = hidden.find((h) => elementOf(h) === elementOf(stem));
  if (same !== undefined) return { stem, segment: segment as 0 | 1 | 2, daysIntoJie, resolvedTo: same, resolution: "sameElement" };
  return { stem, segment: segment as 0 | 1 | 2, daysIntoJie, resolvedTo: null, resolution: "unresolvable" };
}

// ── 大運 ───────────────────────────────────────────────────────────────────

/** Forward for (陽 year, male) or (陰 year, female); reverse otherwise. Polarity of the year STEM. */
export function luckDirectionOf(yearStem: Stem, sex: Sex): "forward" | "reverse" {
  return (polarityOf(yearStem) === "陽") === (sex === "male") ? "forward" : "reverse";
}

export function computeLuck(args: {
  birthJdUT: number; monthPillar: Pillar; yearStem: Stem; sex: Sex;
  prevJie: { name: string; jdUT: number }; nextJie: { name: string; jdUT: number }; pillarCount: number;
}): LuckInfo {
  const direction = luckDirectionOf(args.yearStem, args.sex);
  const target = direction === "forward" ? args.nextJie : args.prevJie;
  const daysToTerm = Math.abs(target.jdUT - args.birthJdUT);
  // Continuous conversion: Δ days → Δ/3 years of age → real elapsed time in tropical years.
  const startAgeYears = daysToTerm / DAYS_PER_LUCK_YEAR;
  const startJd = args.birthJdUT + startAgeYears * TROPICAL_YEAR_DAYS;
  const step = direction === "forward" ? 1 : -1;
  const pillars: LuckPillar[] = [];
  for (let n = 1; n <= args.pillarCount; n++) {
    pillars.push({
      index: n,
      pillar: { stem: stepStem(args.monthPillar.stem, step * n), branch: stepBranch(args.monthPillar.branch, step * n) },
      startJd: startJd + (n - 1) * 10 * TROPICAL_YEAR_DAYS,
      endJd: startJd + n * 10 * TROPICAL_YEAR_DAYS,
      startAgeYears: startAgeYears + (n - 1) * 10,
    });
  }
  return { direction, daysToTerm, targetTermName: target.name, startJd, startAgeYears, pillars };
}

// ── assembly ──────────────────────────────────────────────────────────────

export interface ChartOptions {
  readonly params?: WuxingParams;
  readonly luckPillarCount?: number;
}

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
const daysInMonth = (y: number, m: number): number => (m === 2 ? (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);

/** Latest birth year accepted: the astronomical series and ΔT extrapolation are not meaningful beyond it. */
export const MAX_BIRTH_YEAR = 2200;

/**
 * Every problem with a birth input, as human-readable messages (empty = valid). The date and time are checked as a Gregorian civil date
 * (JavaScript's Date would silently roll month 13 or 30 February over into another day, which would give a wrong chart without any warning).
 * The time zone is validated by the platform when the chart is built.
 */
export function validateBirthInput(input: BirthInput): string[] {
  const problems: string[] = [];
  if (!isInt(input.year) || input.year < 1583 || input.year > MAX_BIRTH_YEAR) problems.push(`year must be an integer from 1583 to ${MAX_BIRTH_YEAR}`);
  if (!isInt(input.month) || input.month < 1 || input.month > 12) problems.push("month must be an integer from 1 to 12");
  else if (isInt(input.year) && (!isInt(input.day) || input.day < 1 || input.day > daysInMonth(input.year, input.month))) problems.push(`day must be an integer from 1 to ${daysInMonth(input.year, input.month)} for this month`);
  else if (!isInt(input.day)) problems.push("day must be an integer");
  if (!isInt(input.hour) || input.hour < 0 || input.hour > 23) problems.push("hour must be an integer from 0 to 23");
  if (!isInt(input.minute) || input.minute < 0 || input.minute > 59) problems.push("minute must be an integer from 0 to 59");
  if (input.second !== undefined && (!isInt(input.second) || input.second < 0 || input.second > 59)) problems.push("second must be an integer from 0 to 59");
  if (typeof input.longitude !== "number" || !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) problems.push("longitude must be a number from −180 to 180 (east positive)");
  if (input.sex !== "male" && input.sex !== "female") problems.push('sex must be "male" or "female"');
  if (typeof input.timeZone !== "string" || input.timeZone.length === 0) problems.push("timeZone must be an IANA zone name");
  if (input.fold !== undefined && input.fold !== "first" && input.fold !== "second") problems.push('fold must be "first" or "second"');
  return problems;
}

export function buildChart(input: BirthInput, options: ChartOptions = {}): NatalChart {
  const problems = validateBirthInput(input);
  if (problems.length > 0) throw new RangeError(`Invalid birth input: ${problems.join("; ")}`);
  const params = options.params ?? DEFAULT_PARAMS;
  const warnings: string[] = [];

  const tst = toTrueSolarTime({
    wall: { year: input.year, month: input.month, day: input.day, hour: input.hour, minute: input.minute, second: input.second ?? 0 },
    timeZone: input.timeZone,
    longitude: input.longitude,
    applyLongitude: params.chart.trueSolarTime,
    applyEquationOfTime: params.chart.trueSolarTime && params.chart.equationOfTime,
    ...(input.fold !== undefined ? { fold: input.fold } : {}),
  });
  const birthJdUT = tst.jdCivil;
  const trueSolarCalendar = fromJulianDay(tst.jdTrueSolar);

  if (tst.resolution === "ambiguous") warnings.push("The wall-clock time falls in a daylight-saving overlap hour: two real instants are possible, one hour apart, and the hour pillar may differ.");
  if (tst.resolution === "nonexistent") warnings.push("The wall-clock time falls in a daylight-saving gap: that time did not exist locally. Please check the birth record.");
  if (tst.corrections.isDaylightSaving) warnings.push("Daylight saving time was in force at birth and has been removed.");

  const jie = enclosingTerms(birthJdUT, "節");
  const monthBranch = jie.prev.def.opensMonthBranch;
  if (monthBranch === null) throw new Error(`Solar term ${jie.prev.def.name} opens no month`);
  const yearPillar = yearPillarOf(birthJdUT).pillar;
  const month: Pillar = { stem: monthStemOf(yearPillar.stem, monthBranch), branch: monthBranch };

  const dh = dayAndHourPillarOf(trueSolarCalendar, params.chart.ziHourRule);
  if (dh.dayAdvanced) warnings.push("Born in late 子 hour (after 23:00 true solar time): the day pillar advanced under the lateZiNextDay rule.");
  if (input.unknownHour === true) warnings.push("Birth hour unknown: the hour pillar is omitted and nothing that depends on it is inferred.");

  const siling = silingOf(monthBranch, birthJdUT - jie.prev.jdUT);
  if (siling.resolution === "unresolvable") {
    warnings.push(`In 亥 month the first 7 days are commanded by ${siling.stem}, but 亥 hides no stem of that element, so the 司令 boost has nowhere to land (inherent to 亥, not a defect).`);
  }
  if (input.year > TOLERANCE_GUARANTEED_UNTIL_YEAR) warnings.push(`After ${TOLERANCE_GUARANTEED_UNTIL_YEAR} ΔT is extrapolated; solar-term instants are indicative only.`);

  const luck = computeLuck({
    birthJdUT, monthPillar: month, yearStem: yearPillar.stem, sex: input.sex,
    prevJie: { name: jie.prev.def.name, jdUT: jie.prev.jdUT },
    nextJie: { name: jie.next.def.name, jdUT: jie.next.jdUT },
    pillarCount: options.luckPillarCount ?? 12,
  });

  return {
    input, birthJdUT, trueSolarJd: tst.jdTrueSolar, trueSolarCalendar,
    corrections: {
      tzOffsetMinutes: tst.corrections.tzOffsetMinutes, isDaylightSaving: tst.corrections.isDaylightSaving,
      longitudeMinutes: tst.corrections.longitudeMinutes, equationOfTimeMinutes: tst.corrections.equationOfTimeMinutes,
      resolution: tst.resolution,
    },
    year: yearPillar, month, day: dh.day, hour: input.unknownHour === true ? null : dh.hour,
    enclosingJie: { prevName: jie.prev.def.name, prevJd: jie.prev.jdUT, nextName: jie.next.def.name, nextJd: jie.next.jdUT },
    siling, luck,
    rulesUsed: { ziHourRule: params.chart.ziHourRule, trueSolarTime: params.chart.trueSolarTime, equationOfTime: params.chart.equationOfTime },
    warnings,
  };
}
