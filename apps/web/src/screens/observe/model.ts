// The pure part of the observation screens (UX spec §4.5–4.7): how tongue and pulse choices become findings of the "guided" / "pulse" / "measured" quality
// classes, and what is stored. Choosing a colour, shape or coating answers its whole category (the other features of it become "absent"); a zone sign is
// only ever present or not recorded; skipping a step records nothing.
import type { Finding, FindingSource } from "@tcm/engine";
import type { KnowledgeBase } from "@tcm/kb";
import type { Draft } from "../../storage/types.ts";
import { withAnswer } from "../screening/model.ts";

export type TongueCategory = "body" | "shape" | "coat";
export type Answered = "chosen" | "normal" | "unsure" | null;

const featuresOf = (kb: KnowledgeBase, category: string): string[] => kb.tongue.features.filter((f) => f.category === category).map((f) => f.id);

/** The tongue findings by id (everything with a T_ prefix). */
export const tongueIds = (d: Draft): string[] => Object.keys(d.findings).filter((id) => id.startsWith("T_"));
export const pulseIds = (d: Draft): string[] => Object.keys(d.findings).filter((id) => id.startsWith("P_"));
const present = (d: Draft, id: string): boolean => d.findings[id]?.state === "present";

function withFindings(d: Draft, set: Record<string, Finding | null>): Draft {
  const findings: Record<string, Finding> = { ...d.findings };
  for (const [id, f] of Object.entries(set)) { if (f === null) delete findings[id]; else findings[id] = f; }
  return { ...d, findings };
}
const guided = (state: Finding["state"]): Finding => ({ state, source: "guided" satisfies FindingSource });

/** Record the answer of one tongue category: the chosen features are present, the others of the category are absent ("normal"), or all unsure. */
export function answerCategory(d: Draft, kb: KnowledgeBase, category: TongueCategory, answer: { kind: "chosen"; ids: readonly string[] } | { kind: "normal" } | { kind: "unsure" } | { kind: "clear" }): Draft {
  const all = featuresOf(kb, category);
  const set: Record<string, Finding | null> = {};
  for (const id of all) {
    set[id] = answer.kind === "clear" ? null : answer.kind === "unsure" ? guided("unsure") : answer.kind === "chosen" && answer.ids.includes(id) ? guided("present") : guided("absent");
  }
  return withFindings(d, set);
}

/** What the person answered for a category, read back from the findings. */
export function categoryState(d: Draft, kb: KnowledgeBase, category: TongueCategory): { answered: Answered; chosen: string[] } {
  const all = featuresOf(kb, category);
  const states = all.map((id) => d.findings[id]?.state);
  const chosen = all.filter((id) => present(d, id));
  if (chosen.length > 0) return { answered: "chosen", chosen };
  if (states.length > 0 && states.every((s) => s === "unsure")) return { answered: "unsure", chosen };
  if (states.some((s) => s === "absent")) return { answered: "normal", chosen };
  return { answered: null, chosen };
}

/** Tick or untick a zone feature or special sign: ticked = present (guided); unticked = not recorded. */
export function setSign(d: Draft, id: string, on: boolean): Draft {
  return withFindings(d, { [id]: on ? guided("present") : null });
}

/** Zone features and special signs (everything outside the three whole-tongue categories), grouped by zone. */
export function signFeatures(kb: KnowledgeBase, zoneId: string): { id: string; name: { "zh-Hant": string; en: string } }[] {
  return kb.tongue.features.filter((f) => !["body", "shape", "coat"].includes(f.category) && f.zone === zoneId).map((f) => ({ id: f.id, name: f.name }));
}
export const SIGN_ZONES = ["tip", "center", "root", "edge", "border", "all"] as const;

// ── pulse ───────────────────────────────────────────────────────────────────────────────────────────────

export type Rhythm = "regular" | "skips" | "irregular";
export interface PulseInput { readonly rate: number | null; readonly rhythm: Rhythm | null; readonly qualities: readonly string[]; readonly position: string | null }
/** Rate-group pulses are derived from the measured rate, never chosen by hand. */
export const RATE_GROUP = "rate";
export const IRREGULAR_FLAG = "RF_B_IRREGULAR_PULSE";

export function parseRate(text: string): number | null {
  const t = text.trim();
  if (!/^\d{2,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= 20 && n <= 250 ? n : null;
}

/**
 * Replace the pulse findings by these inputs. The rate gives P_RAPID / P_SLOW (measured quality) or marks both absent; chosen qualities are present with the
 * "pulse" quality class (the lowest) and the optional position. "Clearly irregular" raises the B-level red flag RF_B_IRREGULAR_PULSE (a blocking notice).
 */
export function applyPulse(d: Draft, kb: KnowledgeBase, input: PulseInput): Draft {
  const bands = kb.pulse._meta.guidance.rate_bands;
  const findings: Record<string, Finding> = Object.fromEntries(Object.entries(d.findings).filter(([id]) => !id.startsWith("P_")));
  if (input.rate !== null) {
    const rapid = input.rate > bands.rapid_gt, slow = input.rate < bands.slow_lt;
    findings["P_RAPID"] = { state: rapid ? "present" : "absent", source: "measured" };
    findings["P_SLOW"] = { state: slow ? "present" : "absent", source: "measured" };
  }
  for (const id of input.qualities) findings[id] = { state: "present", source: "pulse", ...(input.position ? { position: input.position as never } : {}) };
  let next: Draft = { ...d, findings, observe: { ...d.observe, pulse: { rate: input.rate, rhythm: input.rhythm } } };
  if (input.rhythm === "irregular") next = withAnswer(next, IRREGULAR_FLAG, "yes");
  return next;
}

export function clearPulse(d: Draft): Draft {
  const { pulse: _pulse, ...observe } = d.observe;
  return { ...d, findings: Object.fromEntries(Object.entries(d.findings).filter(([id]) => !id.startsWith("P_"))), observe };
}
