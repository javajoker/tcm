// The practitioner reference (PM-65): a case through the app's own pipeline — checked, made a draft, assessed by the engine with the constitution the practitioner
// states, saved as a practitioner's result with its medication plan — and the inquiry's next questions, for when more would raise the confidence. Pure: the
// knowledge base (the practitioner's: the release profile with its draft label, read in the practitioner role) and the moment are arguments.
import { assess, nextQuestions, type NextQuestions } from "@tcm/engine";
import type { KnowledgeBase } from "@tcm/kb";
import { assessInputOf, toSaved } from "../app/assessment.ts";
import { withPrescription } from "../prescription/compute.ts";
import { subjectOf, type MissingItem } from "../screens/profile/model.ts";
import type { SavedAssessment } from "../storage/types.ts";
import { draftOf, missingOf, momentOf, readCase, type CaseError, type CaseLang, type PractitionerCase } from "./case.ts";

/** `invalid`: the case does not read (errors, for the one who wrote it); `incomplete`: the person lacks a safety fact; `ok`: computed. */
export type RunStatus = "invalid" | "incomplete" | "ok";

export interface PractitionerRun {
  readonly status: RunStatus;
  readonly errors: readonly CaseError[];
  readonly missing: readonly MissingItem[];
  readonly case: PractitionerCase | null;
  readonly lang: CaseLang;
  /** The moment the case was computed for (its date at noon UTC, or now). */
  readonly at: number;
  /** The practitioner's result as the app saves it, with its medication plan where the policy and the data give one. */
  readonly saved: SavedAssessment | null;
  /** What the inquiry would ask next, and whether it would stop. */
  readonly next: NextQuestions | null;
}

const langOf = (input: unknown): CaseLang => (typeof input === "object" && input !== null && (input as { lang?: unknown }).lang === "en" ? "en" : "zh-Hant");

/** Run a case (the JSON as given) on the practitioner's knowledge base. */
export function runCase(kb: KnowledgeBase, input: unknown, now: number): PractitionerRun {
  if (kb.role !== "practitioner") throw new Error("the practitioner reference runs on the practitioner's knowledge base (forRole(\"practitioner\"))");
  const lang = langOf(input);
  const { value, errors } = readCase(kb, input);
  if (value === null) return { status: "invalid", errors, missing: [], case: null, lang, at: now, saved: null, next: null };
  const at = momentOf(value, now);
  const draft = draftOf(kb, value, at);
  const missing = missingOf(draft);
  if (missing.length > 0) return { status: "incomplete", errors: [], missing, case: value, lang, at, saved: null, next: null };
  const engineInput = assessInputOf(draft, at, value.hemisphere === "south" ? "south" : undefined)!;
  const result = assess(kb, { ...engineInput, ...(value.constitution ? { statedConstitution: value.constitution } : {}) });
  const saved = withPrescription(kb, toSaved(draft, result, { id: "practitioner-case", lang, role: "practitioner" }));
  const subject = subjectOf(draft)!;
  const next = nextQuestions(kb, { sex: subject.sex, pregnancy: subject.pregnancy, findings: draft.findings, context: draft.context, modules: [] }, 8);
  return { status: "ok", errors: [], missing: [], case: value, lang, at, saved, next };
}
