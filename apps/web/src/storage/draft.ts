import { HOUR_CHOICES, type Draft } from "./types.ts";

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isStringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");

export function newDraft(id: string, now: number, route = "/start"): Draft {
  return { id, startedAt: now, updatedAt: now, subject: {}, profile: { medicationText: [] }, screening: { answers: {}, corrected: [], acknowledgedAt: {} }, inquiry: { modules: null, history: [], resolved: [] }, observe: {}, redFlags: [], findings: {}, context: {}, constitutionAnswers: {}, rememberBirth: false, acknowledgements: [], position: { route } };
}

/**
 * The only function that decides what of a draft reaches storage. Birth data is dropped unless the user ticked "remember on this device"
 * (docs/privacy.md §3, default off): without it the birth moment lives in memory for the session only.
 */
export function toStored(d: Draft): Draft {
  if (d.rememberBirth || d.birth === undefined) return d;
  const { birth: _birth, hourChoice: _hourChoice, ...rest } = d;          // the choice about the hour goes with the birth data it is about
  return rest;
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => (allowed as readonly unknown[]).includes(v) ? (v as T) : undefined;

/** Tolerant: a draft written before the profile existed, or with a damaged profile, simply has no profile answers. */
function parseProfile(x: unknown): Draft["profile"] {
  if (!isRecord(x)) return { medicationText: [] };
  const medications = oneOf(x["medications"], ["none", "some", "unsure"] as const);
  const allergies = oneOf(x["allergies"], ["none", "some"] as const);
  const conditions = oneOf(x["conditions"], ["none", "some"] as const);
  return {
    medicationText: isStringArray(x["medicationText"]) ? x["medicationText"] : [],
    ...(medications ? { medications } : {}), ...(allergies ? { allergies } : {}), ...(conditions ? { conditions } : {}),
  };
}

function parseObserve(x: unknown): Draft["observe"] {
  if (!isRecord(x) || !isRecord(x["pulse"])) return {};
  const p = x["pulse"];
  const rate = typeof p["rate"] === "number" && Number.isFinite(p["rate"]) ? p["rate"] : null;
  const rhythm = p["rhythm"] === "regular" || p["rhythm"] === "skips" || p["rhythm"] === "irregular" ? p["rhythm"] : null;
  const method = p["method"] === "typed" || p["method"] === "timer" || p["method"] === "tap" ? p["method"] : undefined;
  return { pulse: { rate, rhythm, ...(method !== undefined && rate !== null ? { method } : {}) } };
}

function parseInquiry(x: unknown): Draft["inquiry"] {
  if (!isRecord(x)) return { modules: null, history: [], resolved: [] };
  return { modules: isStringArray(x["modules"]) ? x["modules"] : null, history: isStringArray(x["history"]) ? x["history"] : [], resolved: isStringArray(x["resolved"]) ? x["resolved"] : [] };
}

function parseScreening(x: unknown): Draft["screening"] {
  const empty = { answers: {}, corrected: [], acknowledgedAt: {} };
  if (!isRecord(x)) return empty;
  const answers: Record<string, "yes" | "no" | "unsure"> = {};
  if (isRecord(x["answers"])) for (const [k, v] of Object.entries(x["answers"])) if (v === "yes" || v === "no" || v === "unsure") answers[k] = v;
  const acknowledgedAt: Record<string, number> = {};
  if (isRecord(x["acknowledgedAt"])) for (const [k, v] of Object.entries(x["acknowledgedAt"])) if (typeof v === "number") acknowledgedAt[k] = v;
  return { answers, corrected: isStringArray(x["corrected"]) ? x["corrected"] : [], acknowledgedAt };
}

/** Validates a migrated stored draft; anything structurally wrong is "no draft" rather than a crash later in the flow. */
export function parseDraft(x: unknown): Draft | null {
  if (!isRecord(x)) return null;
  const { id, startedAt, updatedAt, subject, redFlags, findings, context, constitutionAnswers, rememberBirth, acknowledgements, position, birth } = x;
  if (typeof id !== "string" || id === "" || typeof startedAt !== "number" || typeof updatedAt !== "number") return null;
  if (!isRecord(subject) || !isStringArray(redFlags) || !isRecord(findings) || !isRecord(context) || !isRecord(constitutionAnswers)) return null;
  if (typeof rememberBirth !== "boolean" || !isStringArray(acknowledgements) || !isRecord(position) || typeof position["route"] !== "string") return null;
  const profile = parseProfile(x["profile"]);
  const draft = { id, startedAt, updatedAt, subject, profile, screening: parseScreening(x["screening"]), inquiry: parseInquiry(x["inquiry"]), observe: parseObserve(x["observe"]), redFlags, findings, context, constitutionAnswers, rememberBirth, acknowledgements, position } as unknown as Draft;
  if (!isRecord(birth) || !rememberBirth) return draft;
  const hourChoice = oneOf(x["hourChoice"], HOUR_CHOICES);
  return { ...draft, birth, ...(hourChoice !== undefined ? { hourChoice } : {}) } as unknown as Draft;
}
