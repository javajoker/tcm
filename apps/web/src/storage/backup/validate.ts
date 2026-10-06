// The allow-list validators of the importer (docs/post-mvp/design/backup-and-data-lock.md §3.4, stage 5). Each builds a FRESH value from the keys it knows, with every type, enumeration and size
// checked: an unknown key is dropped, a known key with a wrong value makes the whole record invalid (with a reason), and nothing of the original object is passed on. The records of a backup
// made by this app pass unchanged, so a round trip gives deep-equal data (tested).
import type { AssessContext, Finding, Subject } from "@tcm/engine";
import type { BirthInput } from "@tcm/wuxing";
import type { Draft, Prefs, SavedAssessment } from "../types.ts";
import { LIMITS } from "./limits.ts";
import { isPlainRecord, plainCopy, Unsafe } from "./plain.ts";

export type Valid<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };
class Bad extends Error {}
const bad = (what: string): never => { throw new Bad(what); };

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const SYMPTOM_ID = /^[A-Za-z0-9_]{1,64}$/;
const SAFE_NAME = /^[^\u0000-\u001f\u007f]{1,200}$/;

const SEX = ["female", "male"] as const satisfies readonly Subject["sex"][];
const PREGNANCY = ["no", "possible", "yes", "not-applicable"] as const satisfies readonly Subject["pregnancy"][];
const MEDICATIONS = ["anticoagulant", "antidiabetic", "antihypertensive", "diuretic", "cardiac-glycoside", "immunosuppressant", "sedative", "MAOI", "stimulant", "other"] as const satisfies readonly Subject["medications"][number][];
const STATES = ["present", "absent", "unsure"] as const satisfies readonly Finding["state"][];
const SEVERITIES = ["light", "moderate", "severe"] as const;
const SOURCES = ["inquiry", "measured", "guided", "pulse"] as const;
const POSITIONS = ["L-cun", "L-guan", "L-chi", "R-cun", "R-guan", "R-chi"] as const;
const COURSES = ["acute", "subacute", "chronic"] as const satisfies readonly NonNullable<AssessContext["course"]>[];
const LANGS = ["zh-Hant", "zh-Hans", "en"] as const;

// ── small checks ────────────────────────────────────────────────────────────

const record = (x: unknown, what: string): Record<string, unknown> => (isPlainRecord(x) ? x : bad(`${what} is not an object`));
const list = (x: unknown, what: string, max: number): unknown[] => (Array.isArray(x) && x.length <= max ? x : bad(`${what} is not a list of at most ${max}`));
const oneOf = <T extends string>(x: unknown, allowed: readonly T[], what: string): T => ((allowed as readonly unknown[]).includes(x) ? (x as T) : bad(`${what} is not one of ${allowed.join(", ")}`));
const text = (x: unknown, what: string, max: number = LIMITS.name): string => (typeof x === "string" && x.length <= max ? x : bad(`${what} is not text of at most ${max} characters`));
const bool = (x: unknown, what: string): boolean => (typeof x === "boolean" ? x : bad(`${what} is not true or false`));
const num = (x: unknown, what: string, min: number, max: number): number => (typeof x === "number" && Number.isFinite(x) && x >= min && x <= max ? x : bad(`${what} is not a number from ${min} to ${max}`));
const int = (x: unknown, what: string, min: number, max: number): number => { const n = num(x, what, min, max); return Number.isInteger(n) ? n : bad(`${what} is not a whole number`); };
const strings = (x: unknown, what: string, maxItems: number, maxLength: number, pattern?: RegExp): string[] =>
  list(x, what, maxItems).map((s, i) => { const t = text(s, `${what}[${i}]`, maxLength); if (pattern && !pattern.test(t)) bad(`${what}[${i}] is not an id`); return t; });
const has = (r: Record<string, unknown>, key: string): boolean => Object.prototype.hasOwnProperty.call(r, key) && r[key] !== undefined;

// ── the inputs ──────────────────────────────────────────────────────────────

function subjectOf(x: unknown): Draft["subject"] {
  const r = record(x, "subject");
  const out: { -readonly [K in keyof Draft["subject"]]: Draft["subject"][K] } = {};
  if (has(r, "ageYears")) out.ageYears = num(r["ageYears"], "age", 0, 130);
  if (has(r, "sex")) out.sex = oneOf(r["sex"], SEX, "sex");
  if (has(r, "pregnancy")) out.pregnancy = oneOf(r["pregnancy"], PREGNANCY, "pregnancy");
  if (has(r, "lactating")) out.lactating = bool(r["lactating"], "lactating");
  if (has(r, "seriousChronicDisease")) out.seriousChronicDisease = bool(r["seriousChronicDisease"], "seriousChronicDisease");
  if (has(r, "medications")) out.medications = [...new Set(list(r["medications"], "medications", MEDICATIONS.length).map((m) => oneOf(m, MEDICATIONS, "a medication class")))];
  if (has(r, "allergies")) out.allergies = strings(r["allergies"], "allergies", LIMITS.names, LIMITS.name);
  return out;
}

function profileOf(x: unknown): Draft["profile"] {
  const r = record(x, "profile");
  const out: { -readonly [K in keyof Draft["profile"]]: Draft["profile"][K] } = { medicationText: [] };
  out.medicationText = has(r, "medicationText") ? strings(r["medicationText"], "medicationText", LIMITS.names, LIMITS.name) : [];
  if (has(r, "medications")) out.medications = oneOf(r["medications"], ["none", "some", "unsure"] as const, "medications answer");
  if (has(r, "allergies")) out.allergies = oneOf(r["allergies"], ["none", "some"] as const, "allergies answer");
  if (has(r, "conditions")) out.conditions = oneOf(r["conditions"], ["none", "some"] as const, "conditions answer");
  return out;
}

function screeningOf(x: unknown): Draft["screening"] {
  const r = record(x, "screening");
  const answers: Record<string, "yes" | "no" | "unsure"> = {};
  for (const [k, v] of Object.entries(record(r["answers"], "screening answers"))) { if (!SYMPTOM_ID.test(k)) bad("a red-flag id is not valid"); answers[k] = oneOf(v, ["yes", "no", "unsure"] as const, "a red-flag answer"); }
  const acknowledgedAt: Record<string, number> = {};
  for (const [k, v] of Object.entries(record(r["acknowledgedAt"], "acknowledgements"))) { if (!SAFE_NAME.test(k)) bad("an acknowledgement key is not valid"); acknowledgedAt[k] = num(v, "an acknowledgement time", 0, 4_102_444_800_000); }
  if (Object.keys(answers).length > 500 || Object.keys(acknowledgedAt).length > 500) bad("screening is too large");
  return { answers, corrected: strings(r["corrected"], "corrected", 500, 80, SYMPTOM_ID), acknowledgedAt };
}

function findingsOf(x: unknown): Draft["findings"] {
  const r = record(x, "findings");
  const keys = Object.keys(r);
  if (keys.length > 1_000) bad("too many findings");
  const out: Record<string, Finding> = {};
  for (const k of keys) {
    if (!SYMPTOM_ID.test(k)) bad("a finding id is not valid");
    const f = record(r[k], "a finding");
    out[k] = {
      state: oneOf(f["state"], STATES, "a finding's state"),
      ...(has(f, "severity") ? { severity: oneOf(f["severity"], SEVERITIES, "a severity") } : {}),
      ...(has(f, "source") ? { source: oneOf(f["source"], SOURCES, "a finding's source") } : {}),
      ...(has(f, "position") ? { position: oneOf(f["position"], POSITIONS, "a pulse position") } : {}),
    };
  }
  return out;
}

function contextOf(x: unknown): AssessContext {
  const r = record(x, "context");
  return has(r, "course") ? { course: oneOf(r["course"], COURSES, "the course") } : {};
}

function constitutionOf(x: unknown): Record<string, number> {
  const r = record(x, "constitution answers");
  if (Object.keys(r).length > 500) bad("too many constitution answers");
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(r)) { if (!SYMPTOM_ID.test(k)) bad("a questionnaire id is not valid"); out[k] = int(v, "a constitution answer", 0, 10); }
  return out;
}

function birthOf(x: unknown): BirthInput {
  const r = record(x, "birth data");
  return {
    year: int(r["year"], "birth year", 1800, 2200), month: int(r["month"], "birth month", 1, 12), day: int(r["day"], "birth day", 1, 31), hour: int(r["hour"], "birth hour", 0, 23), minute: int(r["minute"], "birth minute", 0, 59),
    ...(has(r, "second") ? { second: int(r["second"], "birth second", 0, 59) } : {}),
    sex: oneOf(r["sex"], SEX, "birth sex"),
    timeZone: ((z) => (/^[A-Za-z0-9_+\-/]{1,64}$/.test(z) ? z : bad("the birth time zone is not valid")))(text(r["timeZone"], "the birth time zone", 64)),
    longitude: num(r["longitude"], "birth longitude", -180, 180),
    ...(has(r, "unknownHour") ? { unknownHour: bool(r["unknownHour"], "unknownHour") } : {}),
  };
}

function observeOf(x: unknown): Draft["observe"] {
  const r = record(x, "observations");
  if (!has(r, "pulse")) return {};
  const p = record(r["pulse"], "the pulse");
  const rate = p["rate"] === null ? null : num(p["rate"], "the pulse rate", 20, 250);
  const rhythm = p["rhythm"] === null ? null : oneOf(p["rhythm"], ["regular", "skips", "irregular"] as const, "the rhythm");
  return { pulse: { rate, rhythm, ...(has(p, "method") && rate !== null ? { method: oneOf(p["method"], ["typed", "timer", "tap"] as const, "the pulse method") } : {}) } };
}

/** The inputs of a saved result. */
function inputOf(x: unknown): SavedAssessment["input"] {
  const r = record(x, "the inputs");
  return {
    subject: subjectOf(r["subject"]), profile: profileOf(r["profile"]), screening: screeningOf(r["screening"]), redFlags: strings(r["redFlags"], "redFlags", 500, 80, SYMPTOM_ID),
    findings: findingsOf(r["findings"]), context: contextOf(r["context"]),
    ...(has(r, "constitutionAnswers") ? { constitutionAnswers: constitutionOf(r["constitutionAnswers"]) } : {}),
    ...(has(r, "birth") ? { birth: birthOf(r["birth"]) } : {}),
    ...(has(r, "observe") ? { observe: observeOf(r["observe"]) } : {}),
  };
}

// ── a saved result ──────────────────────────────────────────────────────────

const stamp = (x: unknown, what: string): string => text(x, what, 200).length > 0 ? (x as string) : bad(`${what} is empty`);

/** What the result screens read at the top of a result. A result that lacks any of it is not one this app made. */
function assessmentLike(x: unknown): SavedAssessment["result"] {
  const r = record(x, "the result");
  const meta = record(r["meta"], "the result's stamps");
  for (const k of ["engineVersion", "kbVersion", "profile", "seasonModel", "paramsFingerprint"]) text(meta[k], `the result's ${k}`, 200);
  num(meta["computedAt"], "the result's time", 0, 4_102_444_800_000);
  for (const k of ["policy", "quality", "orientation", "panel", "verdict", "recommendations"]) record(r[k], `the result's ${k}`);
  for (const k of ["patterns", "elements", "suppressed", "trace", "consistency", "requiredAcknowledgements"]) list(r[k], `the result's ${k}`, LIMITS.list);
  return r as unknown as SavedAssessment["result"];
}

/**
 * One saved result of a backup. Returns a fresh, validated record or the reason it was refused. A record whose result and stamps disagree (a result that says another engine, knowledge base or time
 * than the record) is refused: this app never writes one.
 */
export function validateAssessment(raw: unknown): Valid<SavedAssessment> {
  try {
    const r = record(plainCopy(raw), "the record");
    const id = ((s) => (ID.test(s) ? s : bad("the id is not valid")))(text(r["id"], "the id", 80));
    const base = {
      id, createdAt: int(r["createdAt"], "the time", 0, 4_102_444_800_000), appVersion: stamp(r["appVersion"], "the app version"), kbVersion: stamp(r["kbVersion"], "the knowledge-base version"),
      engineVersion: stamp(r["engineVersion"], "the engine version"), paramsFingerprint: stamp(r["paramsFingerprint"], "the parameter stamp"), profile: stamp(r["profile"], "the profile"),
      lang: oneOf(r["lang"], LANGS, "the language"), seasonModel: stamp(r["seasonModel"], "the season model"),
    };
    const result = assessmentLike(r["result"]);
    const meta = result.meta as unknown as Record<string, unknown>;
    if (meta["computedAt"] !== base.createdAt || meta["kbVersion"] !== base.kbVersion || meta["engineVersion"] !== base.engineVersion || meta["profile"] !== base.profile || meta["paramsFingerprint"] !== base.paramsFingerprint || meta["seasonModel"] !== base.seasonModel) bad("the result does not carry the stamps of its record");
    const feedback: Record<string, "match" | "partial" | "no"> = {};
    if (has(r, "feedback")) {
      const f = record(r["feedback"], "the feedback");
      if (Object.keys(f).length > 500) bad("too much feedback");
      for (const [k, v] of Object.entries(f)) feedback[text(k, "a feedback key", 120)] = oneOf(v, ["match", "partial", "no"] as const, "a feedback mark");
    }
    let imported: SavedAssessment["imported"];
    if (has(r, "imported")) {
      const i = record(r["imported"], "the import mark");
      const from = record(i["from"], "the import mark's origin");
      imported = { at: int(i["at"], "the import time", 0, 4_102_444_800_000), from: { appVersion: stamp(from["appVersion"], "origin app version"), kbVersion: stamp(from["kbVersion"], "origin knowledge-base version"), engineVersion: stamp(from["engineVersion"], "origin engine version"), profile: stamp(from["profile"], "origin profile") } };
    }
    return { ok: true, value: {
      ...base, input: inputOf(r["input"]), result,
      ...(has(r, "userNote") ? { userNote: text(r["userNote"], "the note", LIMITS.note) } : {}),
      ...(has(r, "followUp") ? { followUp: ((f) => ({ dueAt: int(f["dueAt"], "the follow-up date", 0, 4_102_444_800_000), ...(has(f, "dismissedAt") ? { dismissedAt: int(f["dismissedAt"], "the dismissal time", 0, 4_102_444_800_000) } : {}) }))(record(r["followUp"], "the follow-up")) } : {}),
      ...(Object.keys(feedback).length > 0 ? { feedback } : {}),
      ...(imported ? { imported } : {}),
    } };
  } catch (e) {
    if (e instanceof Bad || e instanceof Unsafe) return { ok: false, reason: e.message };
    throw e;
  }
}

// ── the draft and the preferences ───────────────────────────────────────────

/** The unfinished assessment of a backup (a stored draft, birth data only if it was remembered). */
export function validateDraft(raw: unknown): Valid<Draft> {
  try {
    const r = record(plainCopy(raw), "the draft");
    const rememberBirth = bool(r["rememberBirth"], "rememberBirth");
    const position = record(r["position"], "the position");
    const route = text(position["route"], "the route", 200);
    if (!route.startsWith("/") || route.startsWith("//")) bad("the route is not inside the app");
    const input = inputOf({ ...r, constitutionAnswers: r["constitutionAnswers"], birth: rememberBirth ? r["birth"] : undefined });
    const inquiry = record(r["inquiry"], "the inquiry progress");
    return { ok: true, value: {
      id: ((s) => (ID.test(s) ? s : bad("the id is not valid")))(text(r["id"], "the id", 80)), startedAt: num(r["startedAt"], "the start time", 0, 4_102_444_800_000), updatedAt: num(r["updatedAt"], "the update time", 0, 4_102_444_800_000),
      subject: input.subject, profile: input.profile, screening: input.screening,
      inquiry: { modules: inquiry["modules"] === null ? null : strings(inquiry["modules"], "modules", 100, 80), history: strings(inquiry["history"], "history", 2_000, 80), resolved: strings(inquiry["resolved"], "resolved", 2_000, 400) },
      observe: input.observe ?? {}, redFlags: input.redFlags, findings: input.findings, context: input.context, constitutionAnswers: input.constitutionAnswers ?? {},
      ...(input.birth ? { birth: input.birth } : {}), rememberBirth, acknowledgements: strings(r["acknowledgements"], "acknowledgements", 500, 80),
      position: { route, ...(has(position, "questionId") ? { questionId: text(position["questionId"], "the question id", 80) } : {}) },
    } };
  } catch (e) {
    if (e instanceof Bad || e instanceof Unsafe) return { ok: false, reason: e.message };
    throw e;
  }
}

/** The preferences a backup carries: language, theme, text size, emergency-number region and the auto-advance switch — never the disclaimer acknowledgement or the one-time offer flags. */
export type BackupPrefs = Pick<Prefs, "lang" | "theme" | "textScale" | "region" | "autoAdvance">;
export function validatePrefs(raw: unknown): Valid<BackupPrefs> {
  try {
    const r = record(plainCopy(raw), "the preferences");
    return { ok: true, value: {
      ...(has(r, "lang") ? { lang: oneOf(r["lang"], LANGS, "the language") } : {}),
      theme: oneOf(r["theme"], ["system", "light", "dark"] as const, "the theme"),
      textScale: ((n) => ([0.9, 1, 1.15, 1.3] as const).find((s) => s === n) ?? bad("the text size is not one of the presets"))(num(r["textScale"], "the text size", 0.5, 3)),
      ...(has(r, "region") ? { region: ((s) => (/^[A-Z]{2,5}$/.test(s) ? s : bad("the region is not valid")))(text(r["region"], "the region", 5)) } : {}),
      autoAdvance: bool(r["autoAdvance"], "autoAdvance"),
    } };
  } catch (e) {
    if (e instanceof Bad || e instanceof Unsafe) return { ok: false, reason: e.message };
    throw e;
  }
}
