// A birth time near the change of hour (docs/post-mvp/design/five-phase-extensions.md §5; task PM-27): when it is within 15 minutes of an hour boundary in true solar time the chart can say which hour it
// computed and what the other side's pillars would be — the day pillar's too, where the school rule moves the day at 23:00 — and the person's choice of the other side changes the hour (and day) pillar and
// nothing else. A chart made without the choice is exactly what it was before it existed.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  branchAt, buildChart, dayAndHourPillarOf, DEFAULT_PARAMS, fromJulianDay, HOUR_MARGIN_MINUTES, hourAlternatives, hourAlternativesAt, paramsFingerprint, toJulianDay, validateBirthInput,
  type BirthInput, type Pillar, type WuxingParams, type ZiHourRule,
} from "../src/index.ts";

const P = (p: Pillar | null): string | null => (p === null ? null : p.stem + p.branch);
const RULES: readonly ZiHourRule[] = ["lateZiNextDay", "earlyZiSameDay", "split"];
const withRule = (rule: ZiHourRule): WuxingParams => ({ ...DEFAULT_PARAMS, chart: { ...DEFAULT_PARAMS.chart, ziHourRule: rule } });
const ODD_HOURS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23] as const;

/** The Julian day of a true-solar clock time on a date: `offsetMinutes` after (negative: before) the start of hour `hour`. */
const solar = (y: number, m: number, d: number, hour: number, offsetMinutes: number): number => toJulianDay({ year: y, month: m, day: d, hour, minute: 0, second: offsetMinutes * 60 });

test("the margin is fifteen minutes and is not a stamped parameter: the parameters, and so their fingerprint, are what they were", () => {
  assert.equal(HOUR_MARGIN_MINUTES, 15);
  assert.equal(JSON.stringify(DEFAULT_PARAMS).includes("argin"), false);
  assert.equal(paramsFingerprint(DEFAULT_PARAMS), "4c3e3303");
});

test("every odd hour, every rule: ambiguous inside the margin and not at or beyond it; the side, the distance and the boundary are reported", () => {
  for (const rule of RULES) for (const b of ODD_HOURS) {
    for (const offset of [-16, -15, -14.9, -14, -1, -0.5, 0, 0.5, 1, 14, 14.9, 15, 16]) {
      const a = hourAlternativesAt(solar(2026, 3, 14, b, offset), rule);
      const label = `${rule} ${b}:00 ${offset >= 0 ? "+" : ""}${offset}`;
      assert.equal(a.ambiguous, Math.abs(offset) < 15, label);
      assert.equal(a.marginMinutes, 15);
      assert.equal(a.ziHourRule, rule);
      if (!a.ambiguous) {
        assert.deepEqual([a.minutesFromBoundary, a.side, a.boundaryHour, a.alternative], [null, null, null, null], label);
        continue;
      }
      assert.ok(Math.abs(a.minutesFromBoundary! - Math.abs(offset)) < 1e-6, `${label}: ${a.minutesFromBoundary}`);
      assert.equal(a.side, offset < 0 ? "before" : "after", label);
      assert.equal(a.boundaryHour, b, label);
    }
  }
});

test("the other side is the neighbouring hour: before a boundary the next 時辰, after it the one before; its stem follows the day it belongs to", () => {
  for (const rule of RULES) for (const b of ODD_HOURS) for (const offset of [-10, -1, 1, 10]) {
    const a = hourAlternativesAt(solar(2026, 3, 14, b, offset), rule);
    const startsHere = (b + 1) / 2 % 12;                    // the branch that begins at this boundary: 23 → 子 (0), 1 → 丑 (1) …
    const [primary, other] = offset < 0 ? [startsHere - 1, startsHere] : [startsHere, startsHere - 1];
    assert.equal(a.primary.hour!.branch, branchAt(primary), `${rule} ${b}:00 ${offset}`);
    assert.equal(a.alternative!.hour.branch, branchAt(other), `${rule} ${b}:00 ${offset}`);
    // the pillars on each side are the ones the chart itself makes at that clock time
    const own = dayAndHourPillarOf(fromJulianDay(solar(2026, 3, 14, b, offset)), rule);
    assert.deepEqual([P(a.primary.day), P(a.primary.hour)], [P(own.day), P(own.hour)]);
    const across = dayAndHourPillarOf(fromJulianDay(solar(2026, 3, 14, b, offset < 0 ? 1 : -1)), rule);
    assert.deepEqual([P(a.alternative!.day), P(a.alternative!.hour)], [P(across.day), P(across.hour)]);
  }
});

test("the day pillar is another side's only where the rule moves the day: at 23:00 under lateZiNextDay, never at another boundary or under the other two rules", () => {
  for (const rule of RULES) for (const b of ODD_HOURS) for (const offset of [-10, 10]) {
    const a = hourAlternativesAt(solar(2026, 3, 14, b, offset), rule);
    const moves = rule === "lateZiNextDay" && b === 23;
    assert.equal(P(a.alternative!.day) !== P(a.primary.day), moves, `${rule} ${b}:00 ${offset}`);
  }
});

test("23:00 under each rule, on a day of known pillars (2000-01-01 is 戊午): the day and hour pillars of each side", () => {
  const after = (rule: ZiHourRule) => hourAlternativesAt(solar(2000, 1, 1, 23, 5), rule);
  const before = (rule: ZiHourRule) => hourAlternativesAt(solar(2000, 1, 1, 23, -5), rule);
  const pair = (h: { day: Pillar; hour: Pillar | null } | null): (string | null)[] | null => (h === null ? null : [P(h.day), P(h.hour)]);
  // 5 minutes after 23:00 — the late 子 hour
  assert.deepEqual([pair(after("lateZiNextDay").primary), pair(after("lateZiNextDay").alternative)], [["己未", "甲子"], ["戊午", "癸亥"]], "the day advances, and the 子 hour takes the next day's stem");
  assert.deepEqual([pair(after("earlyZiSameDay").primary), pair(after("earlyZiSameDay").alternative)], [["戊午", "壬子"], ["戊午", "癸亥"]], "the day stays, and 子 takes this day's stem");
  assert.deepEqual([pair(after("split").primary), pair(after("split").alternative)], [["戊午", "甲子"], ["戊午", "癸亥"]], "the day stays, and 子 takes the next day's stem");
  // 5 minutes before it — the other way round
  assert.deepEqual([pair(before("lateZiNextDay").primary), pair(before("lateZiNextDay").alternative)], [["戊午", "癸亥"], ["己未", "甲子"]]);
  assert.deepEqual([pair(before("earlyZiSameDay").primary), pair(before("earlyZiSameDay").alternative)], [["戊午", "癸亥"], ["戊午", "壬子"]]);
  assert.deepEqual([pair(before("split").primary), pair(before("split").alternative)], [["戊午", "癸亥"], ["戊午", "甲子"]]);
});

test("midnight is not an hour boundary: the middle of the 子 hour is not near a change, under any rule", () => {
  for (const rule of RULES) for (const offset of [-14, -5, 0, 5, 14]) {
    const a = hourAlternativesAt(solar(2026, 3, 15, 0, offset), rule);
    assert.equal(a.ambiguous, false, `${rule} 00:00 ${offset}`);
    assert.equal(a.primary.hour!.branch, "子");
  }
});

test("an hour the person does not know is never ambiguous: there is nothing to choose", () => {
  const near = { year: 2026, month: 3, day: 14, hour: 12, minute: 0, sex: "female", timeZone: "Asia/Shanghai", longitude: 120, unknownHour: true } as const satisfies BirthInput;
  const a = hourAlternatives(near);
  assert.equal(a.ambiguous, false);
  assert.equal(a.primary.hour, null);
  assert.equal(a.alternative, null);
  assert.equal(P(a.primary.day), P(buildChart(near).day));
});

// ── from the clock to the true solar time ────────────────────────────────

const URUMQI = { sex: "female", timeZone: "Asia/Shanghai", longitude: 87.6 } as const;       // 32° — 130 minutes — west of the meridian of its zone
const birthAt = (minuteOfDay: number, base: Pick<BirthInput, "sex" | "timeZone" | "longitude"> = URUMQI): BirthInput => ({ year: 2026, month: 3, day: 14, hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60, ...base });
/** Minutes from a time of the true solar day to the nearest odd hour — worked out here from the odd hours themselves, not from the function's modular form. */
const nearestBoundary = (minutes: number): number => Math.min(...Array.from({ length: 14 }, (_, k) => Math.abs(minutes - (-60 + 120 * k))));

test("the distance is measured in true solar time: a clock time far from a boundary can be near one, and the other way round", () => {
  let ambiguous = 0;
  let farOnTheClock = 0;
  let nearOnTheClockOnly = 0;
  for (let m = 0; m < 1440; m += 3) {
    const input = birthAt(m);
    const chart = buildChart(input);
    const c = chart.trueSolarCalendar;
    const want = nearestBoundary(c.hour * 60 + c.minute + c.second / 60);
    const a = hourAlternatives(input);
    assert.equal(a.ambiguous, want < 15, `clock ${m}: solar ${c.hour}:${c.minute}:${c.second} is ${want.toFixed(2)} from a boundary`);
    if (a.ambiguous) {
      ambiguous += 1;
      assert.ok(Math.abs(a.minutesFromBoundary! - want) < 1e-3);
      if (nearestBoundary(m) >= 30) farOnTheClock += 1;
    } else if (nearestBoundary(m) < 15) nearOnTheClockOnly += 1;
    // what it computes is what the chart computes
    assert.deepEqual([P(a.primary.day), P(a.primary.hour)], [P(chart.day), P(chart.hour)]);
  }
  assert.ok(ambiguous > 100 && ambiguous < 140, `about a quarter of the day: ${ambiguous} of 480`);
  assert.ok(farOnTheClock > 20, "a clock time 30 or more minutes from a boundary is ambiguous in true solar time");
  assert.ok(nearOnTheClockOnly > 20, "a clock time within 15 minutes of a boundary is not, in true solar time");
});

test("the margin can be changed: wider asks more often, none asks never", () => {
  const input = birthAt(14 * 60 + 40);
  const d = nearestBoundary((buildChart(input).trueSolarCalendar.hour * 60) + buildChart(input).trueSolarCalendar.minute);
  assert.equal(hourAlternatives(input, { marginMinutes: d + 1 }).ambiguous, true);
  assert.equal(hourAlternatives(input, { marginMinutes: d - 1 }).ambiguous, false);
  assert.equal(hourAlternatives(input, { marginMinutes: 0 }).ambiguous, false);
});

test("the question follows the rule of the parameters it is asked with", () => {
  // a clock time whose true solar time is 23:05, found by looking
  const clock = Array.from({ length: 1440 }, (_, m) => m).find((m) => { const c = buildChart(birthAt(m)).trueSolarCalendar; return c.hour === 23 && c.minute >= 3 && c.minute <= 7; })!;
  const input = birthAt(clock);
  const late = hourAlternatives(input, { params: withRule("lateZiNextDay") });
  const early = hourAlternatives(input, { params: withRule("earlyZiSameDay") });
  assert.equal(late.ziHourRule, "lateZiNextDay");
  assert.notEqual(P(late.alternative!.day), P(late.primary.day));
  assert.equal(P(early.alternative!.day), P(early.primary.day));
});

// ── the person's choice ──────────────────────────────────────────────────

/** Clock times (minute of the day) whose true solar time is ambiguous, with the boundary and the side. */
const ambiguousClocks = (base: Pick<BirthInput, "sex" | "timeZone" | "longitude"> = URUMQI): { m: number; boundary: number; side: "before" | "after" }[] =>
  Array.from({ length: 1440 }, (_, m) => m).flatMap((m) => { const a = hourAlternatives(birthAt(m, base)); return a.ambiguous ? [{ m, boundary: a.boundaryHour!, side: a.side! }] : []; });

test("choosing the other side changes the hour pillar and, where the rule moves it, the day pillar — and nothing else of the chart", () => {
  const found = ambiguousClocks();
  assert.ok(found.length > 300);
  let dayMoved = 0;
  for (const { m } of found) {
    const input = birthAt(m);
    const plain = buildChart(input);
    const picked = buildChart({ ...input, hourPick: "alternative" });
    const a = hourAlternatives(input);
    assert.deepEqual([P(plain.day), P(plain.hour)], [P(a.primary.day), P(a.primary.hour)]);
    assert.deepEqual([P(picked.day), P(picked.hour)], [P(a.alternative!.day), P(a.alternative!.hour)], `clock ${m}`);
    assert.equal(picked.hourChoice, "alternative");
    assert.notEqual(P(picked.hour), P(plain.hour));
    if (P(picked.day) !== P(plain.day)) dayMoved += 1;
    // the year, the month, the 司令, the 大運, the instant and the corrections come from the moment, not from the hour
    for (const k of ["year", "month", "siling", "luck", "enclosingJie", "corrections", "birthJdUT", "trueSolarJd", "trueSolarCalendar", "rulesUsed"] as const) assert.deepEqual(picked[k], plain[k], `${k}, clock ${m}`);
    // and the answer to the question does not depend on the answer given
    assert.deepEqual(hourAlternatives({ ...input, hourPick: "alternative" }), a);
  }
  assert.ok(dayMoved > 0 && dayMoved < found.length, "the day moves at 23:00 only");
});

test("the day advances for the late 子 hour only on the side that is late: the note about it follows the pillars used", () => {
  const late = ambiguousClocks().find((x) => x.boundary === 23 && x.side === "after")!;
  const early = ambiguousClocks().find((x) => x.boundary === 23 && x.side === "before")!;
  const lateWarn = (input: BirthInput): boolean => buildChart(input).warnings.some((w) => w.includes("late 子"));
  assert.equal(lateWarn(birthAt(late.m)), true, "computed: after 23:00");
  assert.equal(lateWarn({ ...birthAt(late.m), hourPick: "alternative" }), false, "the other side is before 23:00");
  assert.equal(lateWarn(birthAt(early.m)), false);
  assert.equal(lateWarn({ ...birthAt(early.m), hourPick: "alternative" }), true, "the other side is after 23:00");
  assert.ok(buildChart({ ...birthAt(late.m), hourPick: "alternative" }).warnings.some((w) => w.includes("other side")));
});

test("the choice is ignored where it has nothing to choose: not near a boundary, or no hour at all", () => {
  const far = Array.from({ length: 1440 }, (_, m) => m).find((m) => !hourAlternatives(birthAt(m)).ambiguous)!;
  const plain = buildChart(birthAt(far));
  const picked = buildChart({ ...birthAt(far), hourPick: "alternative" });
  assert.deepEqual({ ...picked, input: plain.input }, plain);
  assert.equal("hourChoice" in picked, false);
  const near = ambiguousClocks()[0]!;
  const unknown = buildChart({ ...birthAt(near.m), unknownHour: true, hourPick: "alternative" });
  assert.equal(unknown.hour, null);
  assert.equal("hourChoice" in unknown, false);
});

test("a chart made without the choice carries no trace of it: the chart of every ambiguous time has no choice key, and a default input validates", () => {
  for (const { m } of ambiguousClocks().slice(0, 40)) {
    const c = buildChart(birthAt(m));
    assert.equal("hourChoice" in c, false);
    assert.equal("hourPick" in c.input, false);
  }
  assert.deepEqual(validateBirthInput(birthAt(600) as BirthInput & { year: number }), []);
  assert.deepEqual(validateBirthInput({ ...birthAt(600), hourPick: "alternative" }), []);
  assert.equal(validateBirthInput({ ...birthAt(600), hourPick: "other" } as unknown as BirthInput).length, 1);
});

test("a southern or eastern birthplace changes the clock, not the rule: the same true solar time gives the same answer", () => {
  for (const base of [{ sex: "male", timeZone: "Asia/Taipei", longitude: 121.5 }, { sex: "male", timeZone: "Australia/Sydney", longitude: 151.2 }, { sex: "female", timeZone: "America/New_York", longitude: -74 }] as const) {
    const found = ambiguousClocks(base);
    assert.ok(found.length > 300, base.timeZone);
    for (const { m } of found.slice(0, 60)) {
      const a = hourAlternatives(birthAt(m, base));
      const c = buildChart(birthAt(m, base)).trueSolarCalendar;
      assert.ok(nearestBoundary(c.hour * 60 + c.minute + c.second / 60) < 15, `${base.timeZone} clock ${m}`);
      assert.equal(a.ambiguous, true);
    }
  }
});
