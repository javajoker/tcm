// The pure part of the birth card (UX spec §4.2, S03): from the form values to a BirthInput, and the echo that lets the person check what will be used.
import { validateBirthInput, type BirthInput, type NatalChart, type Sex } from "@tcm/wuxing";
import type { HourChoice } from "../../storage/types.ts";

export interface BirthForm {
  /** `YYYY-MM-DD` as a date input gives it. */
  readonly date: string;
  /** `HH:MM`; ignored when the hour is unknown. */
  readonly time: string;
  readonly unknownHour: boolean;
  /** The absolute longitude in degrees as typed, and its hemisphere. */
  readonly longitude: string;
  readonly hemisphere: "east" | "west";
  readonly timeZone: string;
  readonly fold: "first" | "second";
  /** Near a change of hour: which the person says is nearer the truth — the computed hour (the default), the other, or neither (the hour is left out). Meaningful only while the time is near one. */
  readonly hourPick: "computed" | "other" | "unsure";
}

export const EMPTY_FORM: BirthForm = { date: "", time: "", unknownHour: false, longitude: "", hemisphere: "east", timeZone: "", fold: "first", hourPick: "computed" };

/** What the draft records of each answer to *which hour is nearer the truth*. */
export const HOUR_CHOICE_OF: Readonly<Record<BirthForm["hourPick"], HourChoice>> = { computed: "primary", other: "alternative", unsure: "unknown" };

/** The form values that decide where the birth time falls: changing any of them asks the question again. */
export const TIME_FIELDS = ["date", "time", "unknownHour", "longitude", "hemisphere", "timeZone", "fold"] as const;

export const isTimeZone = (zone: string): boolean => {
  if (zone.trim() === "") return false;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
};

export interface Parsed { readonly birth: BirthInput | null; /** What is still missing or wrong (field keys), in screen order. */ readonly missing: readonly ("date" | "time" | "longitude" | "timeZone" | "sex")[] }

/**
 * Build the BirthInput, or say what is missing. The birth hour defaults to noon when unknown (it is flagged `unknownHour`, so no hour pillar is built from it) — also when the person is not sure which of two
 * hours it was: the existing unknown-hour path, which leaves the hour pillar out and puts nothing in its place.
 */
export function parseBirth(f: BirthForm, sex: Sex | undefined): Parsed {
  const missing: Parsed["missing"][number][] = [];
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.date);
  const t = /^(\d{2}):(\d{2})$/.exec(f.time);
  const lon = /^\d{1,3}(\.\d+)?$/.test(f.longitude.trim()) ? Number(f.longitude) : NaN;
  if (!d) missing.push("date");
  if (!f.unknownHour && !t) missing.push("time");
  if (!Number.isFinite(lon) || lon > 180) missing.push("longitude");
  if (!isTimeZone(f.timeZone)) missing.push("timeZone");
  if (sex === undefined) missing.push("sex");
  if (missing.length > 0 || !d || !Number.isFinite(lon) || sex === undefined) return { birth: null, missing };
  const unknown = f.unknownHour || f.hourPick === "unsure";
  const birth: BirthInput = {
    year: Number(d[1]), month: Number(d[2]), day: Number(d[3]), hour: unknown || !t ? 12 : Number(t[1]), minute: unknown || !t ? 0 : Number(t[2]),
    sex, timeZone: f.timeZone.trim(), longitude: f.hemisphere === "west" ? -lon : lon,
    ...(unknown ? { unknownHour: true } : {}), ...(f.fold === "second" ? { fold: "second" as const } : {}), ...(f.hourPick === "other" && !unknown ? { hourPick: "alternative" as const } : {}),
  };
  if (validateBirthInput(birth).length > 0) return { birth: null, missing: ["date"] };      // a date that does not exist (31 April …)
  return { birth, missing: [] };
}

/** The form values of a stored BirthInput (for editing). */
export function formOf(b: BirthInput): BirthForm {
  const p2 = (n: number): string => String(n).padStart(2, "0");
  return { date: `${String(b.year).padStart(4, "0")}-${p2(b.month)}-${p2(b.day)}`, time: b.unknownHour ? "" : `${p2(b.hour)}:${p2(b.minute)}`, unknownHour: b.unknownHour === true, longitude: String(Math.abs(b.longitude)), hemisphere: b.longitude < 0 ? "west" : "east", timeZone: b.timeZone, fold: b.fold ?? "first", hourPick: b.hourPick === "alternative" ? "other" : "computed" };
}

/** What the echo says: the longitude as typed, the zone, and how far true solar time is from the clock time the person gave (daylight saving included). */
export function echoOf(chart: NatalChart, b: BirthInput): { readonly lon: string; readonly hemisphere: "east" | "west"; readonly zone: string; readonly deltaMinutes: number; readonly dst: boolean } {
  const clock = Date.UTC(b.year, b.month - 1, b.day, b.hour, b.minute, 0);
  const c = chart.trueSolarCalendar;
  const solar = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, Math.floor(c.second));
  return { lon: String(Math.abs(b.longitude)), hemisphere: b.longitude < 0 ? "west" : "east", zone: b.timeZone, deltaMinutes: Math.round((solar - clock) / 60000), dst: chart.corrections.isDaylightSaving };
}
