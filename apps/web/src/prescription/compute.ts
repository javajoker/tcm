// Making the personalised prescription of a saved result (PM-40, PM-41). Loaded only by a build that can show one — see app/prescription.ts.
import { personalise, type Prescription } from "@tcm/engine/prescription";
import type { KnowledgeBase } from "@tcm/kb";
import { draftFromSaved } from "../app/assessment.ts";
import { subjectOf } from "../screens/profile/model.ts";
import type { SavedAssessment } from "../storage/types.ts";

/** The prescription of a saved result: null where the knowledge base carries no tables, the inputs make no complete person, or nothing is recommended. */
export function prescriptionOf(kb: KnowledgeBase, saved: SavedAssessment): Prescription | null {
  if (kb.prescription === null || kb.herbs === null) return null;
  const subject = subjectOf(draftFromSaved(kb, saved, saved.id, saved.createdAt));
  if (subject === null) return null;
  return personalise({ kb, assessment: saved.result, subject, tables: kb.prescription, sanyin: kb.prescription.sanyin });
}

/** The record with its prescription, or the record as it was when there is none. */
export function withPrescription(kb: KnowledgeBase, saved: SavedAssessment): SavedAssessment {
  const p = prescriptionOf(kb, saved);
  return p ? { ...saved, prescription: p } : saved;
}
