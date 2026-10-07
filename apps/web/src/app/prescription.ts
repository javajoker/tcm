// The personalised prescription is made when a result is saved (docs/post-mvp/design/prescription-model.md §6.5) — but only where it can be shown: in the development profile,
// and for a learner or a practitioner in a build that serves the roles (PM-53; §7.4), whose knowledge base holds the herb records and the tables. A general reader's never
// makes one: the code, the tables' use and the `rx` messages are a lazy chunk that such a session never loads.
import type { KnowledgeBase } from "@tcm/kb";
import type { SavedAssessment } from "../storage/types.ts";

/** The record with its prescription where this build can make one; never fails the save: a prescription that cannot be made is simply absent. */
export async function attachPrescription(kb: KnowledgeBase, saved: SavedAssessment): Promise<SavedAssessment> {
  if ((__APP_PROFILE__ !== "dev" && kb.role === null) || kb.prescription === null) return saved;
  try {
    const { withPrescription } = await import("../prescription/compute.ts");
    return withPrescription(kb, saved);
  } catch {
    return saved;
  }
}
