/**
 * Julian-day arithmetic (Meeus, Astronomical Algorithms, ch. 7).
 *
 * JavaScript's Date is deliberately avoided: it welds a time zone into the type, while the engine
 * handles three time scales at once (UT, TT, true solar time) and mixing them is the classic bug.
 * The canonical representation is the floating-point Julian day, with the scale in the type.
 */

/** Julian day on the universal-time scale (UT1 ≈ UTC). */
export type JdUT = number & { readonly __scale: "UT" };
/** Julian day on the terrestrial-time scale. Astronomical series take TT. */
export type JdTT = number & { readonly __scale: "TT" };

export const asUT = (n: number): JdUT => n as JdUT;
export const asTT = (n: number): JdTT => n as JdTT;

export const J2000 = 2451545.0;
export const julianCentury = (jd: JdTT): number => (jd - J2000) / 36525;
export const julianMillennium = (jd: JdTT): number => (jd - J2000) / 365250;

export interface CalendarDateTime {
  readonly year: number;
  readonly month: number;   // 1–12
  readonly day: number;     // 1–31
  readonly hour: number;    // 0–23
  readonly minute: number;  // 0–59
  readonly second: number;  // 0–59.999…
}

/** Gregorian calendar → Julian day. Throws before the Gregorian reform (1582-10-15). */
export function toJulianDay(d: CalendarDateTime): number {
  let y = d.year;
  let m = d.month;
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  const dayFraction = d.day + (d.hour + (d.minute + d.second / 60) / 60) / 24;
  const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + dayFraction + b - 1524.5;
  if (jd < 2299160.5) {
    throw new RangeError(`${d.year}-${d.month}-${d.day} predates the Gregorian calendar (1582-10-15)`);
  }
  return jd;
}

/**
 * Julian day → Gregorian calendar.
 *
 * The time of day is rounded to milliseconds BEFORE being split into h/m/s. Otherwise 14:30 is
 * rebuilt as 14:29:59.9999: a double has only ~1e-10 day (≈10 µs) resolution near JD 2.45e6 and the
 * cascaded floor() turns that loss into a whole minute — enough to cross a month-branch boundary.
 */
export function fromJulianDay(jd: number): CalendarDateTime {
  const shifted = jd + 0.5;
  let z = Math.floor(shifted);
  const f = shifted - z;
  let secondsOfDay = Math.round(f * 86400 * 1000) / 1000;
  if (secondsOfDay >= 86400) { secondsOfDay -= 86400; z += 1; }

  const alpha = Math.floor((z - 1867216.25) / 36524.25);
  const a = z + 1 + alpha - Math.floor(alpha / 4);
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);

  const day = b - d - Math.floor(30.6001 * e);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;

  const hour = Math.floor(secondsOfDay / 3600);
  const minute = Math.floor((secondsOfDay - hour * 3600) / 60);
  const second = secondsOfDay - hour * 3600 - minute * 60;
  return { year, month, day, hour, minute, second };
}

/**
 * Julian day NUMBER of a civil date — the integer day count used for the day pillar.
 * JD starts at noon while the pillar day starts at the civil day boundary, hence the noon anchor.
 */
export function julianDayNumber(year: number, month: number, day: number): number {
  return Math.floor(toJulianDay({ year, month, day, hour: 12, minute: 0, second: 0 }));
}

/** UTC milliseconds ⇄ Julian day (UT scale). */
export const millisToJulianDay = (ms: number): number => ms / 86400000 + 2440587.5;
export const julianDayToMillis = (jd: number): number => (jd - 2440587.5) * 86400000;
