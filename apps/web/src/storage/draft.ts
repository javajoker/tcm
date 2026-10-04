import type { Draft } from "./types.ts";

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isStringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");

export function newDraft(id: string, now: number, route = "/start"): Draft {
  return { id, startedAt: now, updatedAt: now, subject: {}, redFlags: [], findings: {}, context: {}, constitutionAnswers: {}, rememberBirth: false, acknowledgements: [], position: { route } };
}

/**
 * The only function that decides what of a draft reaches storage. Birth data is dropped unless the user ticked "remember on this device"
 * (docs/privacy.md §3, default off): without it the birth moment lives in memory for the session only.
 */
export function toStored(d: Draft): Draft {
  if (d.rememberBirth || d.birth === undefined) return d;
  const { birth: _birth, ...rest } = d;
  return rest;
}

/** Validates a migrated stored draft; anything structurally wrong is "no draft" rather than a crash later in the flow. */
export function parseDraft(x: unknown): Draft | null {
  if (!isRecord(x)) return null;
  const { id, startedAt, updatedAt, subject, redFlags, findings, context, constitutionAnswers, rememberBirth, acknowledgements, position, birth } = x;
  if (typeof id !== "string" || id === "" || typeof startedAt !== "number" || typeof updatedAt !== "number") return null;
  if (!isRecord(subject) || !isStringArray(redFlags) || !isRecord(findings) || !isRecord(context) || !isRecord(constitutionAnswers)) return null;
  if (typeof rememberBirth !== "boolean" || !isStringArray(acknowledgements) || !isRecord(position) || typeof position["route"] !== "string") return null;
  const draft = { id, startedAt, updatedAt, subject, redFlags, findings, context, constitutionAnswers, rememberBirth, acknowledgements, position } as unknown as Draft;
  return isRecord(birth) && rememberBirth ? ({ ...draft, birth } as unknown as Draft) : draft;
}
