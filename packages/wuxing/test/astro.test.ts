import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  toJulianDay, fromJulianDay, julianDayNumber, deltaTSeconds, termsInGregorianYear, solveSolarTerm,
  apparentSolarLongitude, equationOfTimeMinutes, asTT, utToTT, SOLAR_TERMS, wallTimeToUtc, toTrueSolarTime,
  julianDayToMillis, millisToJulianDay,
} from "../src/index.ts";

const here = new URL(".", import.meta.url);
const hko = JSON.parse(readFileSync(new URL("fixtures/hko-solar-terms.json", here), "utf8")) as {
  terms: { year: number; term: string; hkt: { month: number; day: number; hour: number; minute: number } }[];
};

test("Julian day anchors: J2000.0, Unix epoch, calendar round trip", () => {
  assert.equal(toJulianDay({ year: 2000, month: 1, day: 1, hour: 12, minute: 0, second: 0 }), 2451545.0);
  assert.equal(millisToJulianDay(0), 2440587.5);
  assert.equal(julianDayToMillis(2440587.5), 0);
  const cal = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, second: 0 };
  assert.deepEqual(fromJulianDay(toJulianDay(cal)), cal);
  assert.throws(() => toJulianDay({ year: 1500, month: 1, day: 1, hour: 0, minute: 0, second: 0 }));
});

test("14:30 survives a Julian-day round trip without becoming 14:29:59.99", () => {
  for (let m = 0; m < 60; m++) {
    const c = { year: 2026, month: 10, day: 3, hour: 14, minute: m, second: 0 };
    assert.deepEqual(fromJulianDay(toJulianDay(c)), c, `minute ${m}`);
  }
});

test("day count anchors: 1949-10-01 and 2000-01-01 are 18354 days apart", () => {
  assert.equal(julianDayNumber(2000, 1, 1) - julianDayNumber(1949, 10, 1), 18354);
});

test("ΔT matches the Espenak–Meeus polynomial at sample points", () => {
  const near = (a: number, b: number, tol: number): void => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);
  near(deltaTSeconds(1900, 6).seconds, -2.11719, 1e-3);
  near(deltaTSeconds(1975, 6).seconds, 45.9381, 1e-3);
  near(deltaTSeconds(2020, 6).seconds, 71.8503, 1e-3);
  assert.equal(deltaTSeconds(1990, 1).basis, "fitted");
  assert.equal(deltaTSeconds(2030, 1).basis, "extrapolated");
});

test("solar terms: all 240 HKO values (2019–2028) within 60 s (HKO publishes whole minutes)", () => {
  const byYear = new Map<number, ReturnType<typeof termsInGregorianYear>>();
  let worst = 0;
  for (const t of hko.terms) {
    if (!byYear.has(t.year)) byYear.set(t.year, termsInGregorianYear(t.year));
    const mine = (byYear.get(t.year) as ReturnType<typeof termsInGregorianYear>).find((r) => r.def.name === t.term);
    assert.ok(mine, `${t.year} ${t.term}`);
    // HKT = UTC+8. Build the reference instant at the published minute.
    const ref = toJulianDay({ year: t.year, month: t.hkt.month, day: t.hkt.day, hour: t.hkt.hour, minute: t.hkt.minute, second: 0 }) - 8 / 24;
    const sec = Math.abs((mine as { jdUT: number }).jdUT - ref) * 86400;
    worst = Math.max(worst, sec);
    assert.ok(sec <= 60, `${t.year} ${t.term}: ${sec.toFixed(1)} s`);
  }
  assert.ok(worst <= 60);
  assert.equal(hko.terms.length, 240);
});

test("each solved term has apparent longitude equal to its target", () => {
  for (const def of SOLAR_TERMS) {
    const r = solveSolarTerm(def.longitude, asTT(utToTT(toJulianDay({ year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 0 }) + 120)));
    const lambda = apparentSolarLongitude(r.jdTT);
    const diff = Math.abs(((lambda - def.longitude + 540) % 360) - 180);
    assert.ok(diff < 1e-6, `${def.name}: ${diff}`);
  }
});

test("a Gregorian year contains exactly 24 terms in ascending order, 12 of them 節", () => {
  const terms = termsInGregorianYear(2026);
  assert.equal(terms.length, 24);
  for (let i = 1; i < 24; i++) assert.ok((terms[i] as { jdUT: number }).jdUT > (terms[i - 1] as { jdUT: number }).jdUT);
  assert.equal(terms.filter((t) => t.def.kind === "節").length, 12);
});

test("equation of time stays within its physical range and has the known extremes", () => {
  const at = (y: number, m: number, d: number): number => equationOfTimeMinutes(asTT(toJulianDay({ year: y, month: m, day: d, hour: 12, minute: 0, second: 0 })));
  assert.ok(Math.abs(at(2026, 2, 11) - -14.17) < 0.1);   // February minimum
  assert.ok(Math.abs(at(2026, 11, 3) - 16.45) < 0.1);    // November maximum
  for (let d = 0; d < 365; d += 5) {
    const e = equationOfTimeMinutes(asTT(toJulianDay({ year: 2026, month: 1, day: 1, hour: 12, minute: 0, second: 0 }) + d));
    assert.ok(e > -16.5 && e < 16.5);
  }
});

test("time zones: DST history, overlap and gap are reported, not hidden", () => {
  // China observed DST in 1990: Shanghai wall time 14:30 on 12 May is UTC+9.
  const sh = wallTimeToUtc({ year: 1990, month: 5, day: 12, hour: 14, minute: 30, second: 0 }, "Asia/Shanghai");
  assert.equal(sh.offsetMinutes, 540);
  assert.equal(sh.isDaylightSaving, true);
  assert.equal(sh.resolution, "unique");
  // New York fall-back 2025-11-02: 01:30 happens twice.
  const overlap = wallTimeToUtc({ year: 2025, month: 11, day: 2, hour: 1, minute: 30, second: 0 }, "America/New_York");
  assert.equal(overlap.resolution, "ambiguous");
  assert.equal(((overlap.alternativeUtcMillis ?? 0) - overlap.utcMillis) / 3600000, 1);
  // Spring-forward 2025-03-09: 02:30 does not exist.
  const gap = wallTimeToUtc({ year: 2025, month: 3, day: 9, hour: 2, minute: 30, second: 0 }, "America/New_York");
  assert.equal(gap.resolution, "nonexistent");
});

test("true solar time uses the birthplace longitude, not the zone meridian (Ürümqi example)", () => {
  const wall = { year: 1962, month: 8, day: 8, hour: 10, minute: 0, second: 0 };
  const urumqi = toTrueSolarTime({ wall, timeZone: "Asia/Shanghai", longitude: 87.6 });
  const shanghai = toTrueSolarTime({ wall, timeZone: "Asia/Shanghai", longitude: 121.47 });
  const diffMin = (shanghai.jdTrueSolar - urumqi.jdTrueSolar) * 1440;
  assert.ok(Math.abs(diffMin - (121.47 - 87.6) * 4) < 1e-6, `${diffMin}`);
  assert.ok(diffMin > 120, "more than one 時辰 apart");
});
