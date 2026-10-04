import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildChart, dayAndHourPillarOf, yearPillarOf, lichunOf, fromJulianDay, toJulianDay, julianDayNumber,
  sexagenaryIndexOf, mod, stepStem, stepBranch, ziHourStemOf, luckDirectionOf, DEFAULT_PARAMS,
  validateBirthInput, MAX_BIRTH_YEAR, type BirthInput, type Pillar,
} from "../src/index.ts";

const P = (p: Pillar | null): string | null => (p === null ? null : p.stem + p.branch);

const shanghai1990: BirthInput = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 };

test("worked example 1990-05-12 14:30 Shanghai: 庚午 辛巳 丁丑 丁未", () => {
  const c = buildChart(shanghai1990);
  assert.deepEqual([P(c.year), P(c.month), P(c.day), P(c.hour)], ["庚午", "辛巳", "丁丑", "丁未"]);
});

test("worked example: DST removed, true solar 13:39, 立夏 month, 庚 commands (2nd segment, exact)", () => {
  const c = buildChart(shanghai1990);
  assert.equal(c.corrections.isDaylightSaving, true);
  assert.equal(c.corrections.tzOffsetMinutes, 540);
  assert.equal(c.trueSolarCalendar.hour, 13);
  assert.equal(c.enclosingJie.prevName, "立夏");
  assert.equal(c.enclosingJie.nextName, "芒種");
  assert.ok(Math.abs(c.birthJdUT - c.enclosingJie.prevJd - 6.454) < 0.01);
  assert.equal(c.siling.stem, "庚");
  assert.equal(c.siling.segment, 1);
  assert.equal(c.siling.resolution, "exact");
  assert.ok(c.warnings.some((w) => w.includes("Daylight saving")));
});

test("worked example: 陽 year male runs forward, starts at 8.24, first 大運 壬午", () => {
  const c = buildChart(shanghai1990);
  assert.equal(c.luck.direction, "forward");
  assert.ok(Math.abs(c.luck.startAgeYears - 8.24) < 0.01);
  assert.equal(P(c.luck.pillars[0]?.pillar ?? null), "壬午");
  assert.equal(P(c.luck.pillars[1]?.pillar ?? null), "癸未");
});

test("大運 direction: 陽 year male / 陰 year female forward, the others reverse (year STEM decides)", () => {
  assert.equal(luckDirectionOf("庚", "male"), "forward");
  assert.equal(luckDirectionOf("庚", "female"), "reverse");
  assert.equal(luckDirectionOf("辛", "male"), "reverse");
  assert.equal(luckDirectionOf("辛", "female"), "forward");
});

test("year pillar boundary is 立春, not 1 January and not lunar New Year", () => {
  const li = lichunOf(2024);
  assert.equal(P(yearPillarOf(li - 1 / 1440).pillar), "癸卯");   // one minute before 立春 2024
  assert.equal(P(yearPillarOf(li + 1 / 1440).pillar), "甲辰");
  assert.equal(P(yearPillarOf(toJulianDay({ year: 2024, month: 1, day: 1, hour: 12, minute: 0, second: 0 })).pillar), "癸卯");
  assert.equal(P(yearPillarOf(toJulianDay({ year: 2000, month: 2, day: 1, hour: 12, minute: 0, second: 0 })).pillar), "己卯");
});

test("year 4 CE is 甲子 by the stem/branch formula", () => {
  assert.equal(P({ stem: stepStem("甲", 4 - 4), branch: stepBranch("子", 4 - 4) }), "甲子");
  assert.equal(P({ stem: stepStem("甲", 2024 - 4), branch: stepBranch("子", 2024 - 4) }), "甲辰");
});

test("day pillar anchors: 1949-10-01 = 甲子, 2000-01-01 = 戊午", () => {
  const day = (y: number, m: number, d: number): string | null =>
    P(dayAndHourPillarOf({ year: y, month: m, day: d, hour: 12, minute: 0, second: 0 }, "lateZiNextDay").day);
  assert.equal(day(1949, 10, 1), "甲子");
  assert.equal(day(2000, 1, 1), "戊午");
});

test("day pillar advances exactly one step per day over 1900–2099 (~73,000 days)", () => {
  let prev = -1;
  const start = julianDayNumber(1900, 1, 1);
  const end = julianDayNumber(2099, 12, 31);
  for (let jdn = start; jdn <= end; jdn++) {
    const cal = fromJulianDay(jdn);
    const idx = sexagenaryIndexOf(dayAndHourPillarOf({ year: cal.year, month: cal.month, day: cal.day, hour: 12, minute: 0, second: 0 }, "lateZiNextDay").day);
    if (prev >= 0) assert.equal(idx, mod(prev + 1, 60), `${cal.year}-${cal.month}-${cal.day}`);
    prev = idx;
  }
});

test("late 子 hour: the three rules differ only as documented", () => {
  const t = { year: 2026, month: 3, day: 14, hour: 23, minute: 30, second: 0 };
  const late = dayAndHourPillarOf(t, "lateZiNextDay");
  const early = dayAndHourPillarOf(t, "earlyZiSameDay");
  const split = dayAndHourPillarOf(t, "split");
  assert.equal(late.hour.branch, "子");
  assert.equal(late.dayAdvanced, true);
  assert.equal(sexagenaryIndexOf(late.day), mod(sexagenaryIndexOf(early.day) + 1, 60));
  assert.deepEqual(split.day, early.day);                         // split keeps the same-day day pillar …
  assert.equal(split.hour.stem, late.hour.stem);                  // … but takes the next day's stem for the hour
  assert.equal(early.hour.stem, ziHourStemOf(early.day.stem));    // early 子 uses the same day's stem
});

test("unknown hour: no hour pillar and a warning, never a guess", () => {
  const c = buildChart({ ...shanghai1990, unknownHour: true });
  assert.equal(c.hour, null);
  assert.ok(c.warnings.some((w) => w.includes("hour unknown")));
});

test("rules used are always recorded", () => {
  const c = buildChart(shanghai1990);
  assert.deepEqual(c.rulesUsed, { ziHourRule: DEFAULT_PARAMS.chart.ziHourRule, trueSolarTime: true, equationOfTime: true });
});

test("month branch follows the 節 and the 12 months cycle 寅→丑 across a year", () => {
  const branches = new Set<string>();
  for (let m = 1; m <= 12; m++) {
    branches.add(buildChart({ year: 2026, month: m, day: 20, hour: 12, minute: 0, sex: "male", timeZone: "Asia/Shanghai", longitude: 120 }).month.branch);
  }
  assert.equal(branches.size, 12);
});

// ── input validation (found while building @tcm/engine: JS Date rolls invalid dates over silently) ──

test("validateBirthInput accepts a valid birth and reports every problem of an invalid one", () => {
  const ok = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
  assert.deepEqual(validateBirthInput(ok), []);
  assert.deepEqual(validateBirthInput({ ...ok, year: 2000, month: 2, day: 29 }), [], "2000 is a leap year");
  const bad = validateBirthInput({ ...ok, year: 1900, month: 2, day: 29, hour: 25, minute: 60, longitude: 500, sex: "x" as never });
  assert.ok(bad.some((m) => /day must be an integer from 1 to 28/.test(m)), "1900 is not a leap year");
  assert.ok(bad.some((m) => /hour/.test(m)) && bad.some((m) => /minute/.test(m)) && bad.some((m) => /longitude/.test(m)) && bad.some((m) => /sex/.test(m)));
  assert.ok(validateBirthInput({ ...ok, month: 13 }).some((m) => /month/.test(m)));
  assert.ok(validateBirthInput({ ...ok, month: 4, day: 31 }).some((m) => /1 to 30/.test(m)));
  assert.ok(validateBirthInput({ ...ok, year: 1500 }).some((m) => /year/.test(m)));
  assert.ok(validateBirthInput({ ...ok, year: MAX_BIRTH_YEAR + 1 }).some((m) => /year/.test(m)));
  assert.ok(validateBirthInput({ ...ok, hour: 1.5 }).some((m) => /hour/.test(m)));
  assert.ok(validateBirthInput({ ...ok, longitude: Number.NaN }).some((m) => /longitude/.test(m)));
});

test("buildChart refuses an invalid birth instead of silently building a wrong chart", () => {
  const ok = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
  assert.throws(() => buildChart({ ...ok, month: 13 }), /Invalid birth input: month/);
  assert.throws(() => buildChart({ ...ok, month: 2, day: 30 }), RangeError);
  assert.throws(() => buildChart({ ...ok, longitude: 500 }), /longitude/);
  assert.throws(() => buildChart({ ...ok, timeZone: "Mars/Base" }), /time zone/i);
});

// ── a wall time that occurs twice (daylight-saving overlap): the person picks which ──────────────────────

const overlap: BirthInput = { year: 2026, month: 11, day: 1, hour: 1, minute: 30, sex: "female", timeZone: "America/New_York", longitude: -74 };

test("fold: the first and the second occurrence of an overlap hour are an hour apart; the default is the first", () => {
  const first = buildChart(overlap);
  const explicitFirst = buildChart({ ...overlap, fold: "first" });
  const second = buildChart({ ...overlap, fold: "second" });
  assert.equal(first.corrections.resolution, "ambiguous");
  assert.equal(second.corrections.resolution, "ambiguous");
  assert.deepEqual({ ...explicitFirst, input: first.input }, first, "'first' is the default");
  assert.equal(first.corrections.isDaylightSaving, true);
  assert.equal(second.corrections.isDaylightSaving, false);
  assert.equal(first.corrections.tzOffsetMinutes, -240);
  assert.equal(second.corrections.tzOffsetMinutes, -300);
  assert.ok(Math.abs(second.birthJdUT - first.birthJdUT - 1 / 24) < 1e-7, "the instants are one hour apart");
  assert.ok(Math.abs(second.trueSolarJd - first.trueSolarJd - 1 / 24) < 1e-5, "the true-solar clocks differ by the hour plus the hour's change of the equation of time (< 1 s)");
});

test("fold has no effect on a time that occurs once, nor on a time in a gap, and an invalid value is refused", () => {
  assert.deepEqual(buildChart({ ...overlap, hour: 14, fold: "second" }).corrections, buildChart({ ...overlap, hour: 14 }).corrections);
  const gap: BirthInput = { ...overlap, month: 3, day: 8, hour: 2, minute: 30 };
  assert.equal(buildChart(gap).corrections.resolution, "nonexistent");
  assert.deepEqual(buildChart({ ...gap, fold: "second" }).corrections, buildChart(gap).corrections);
  assert.throws(() => buildChart({ ...overlap, fold: "third" as never }), /fold must be/);
});
