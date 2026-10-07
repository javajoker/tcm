// The personalised prescription is made when a result is saved (docs/post-mvp/design/prescription-model.md §6.5) — but only by a build that can show it. Everywhere
// else `__APP_PROFILE__` makes this `return saved`, and the bundler leaves out the code that makes it, the tables' use and the `rx` messages.
import type { KnowledgeBase } from "@tcm/kb";
import type { SavedAssessment } from "../storage/types.ts";

/** The record with its prescription where this build can make one; never fails the save: a prescription that cannot be made is simply absent. */
export async function attachPrescription(kb: KnowledgeBase, saved: SavedAssessment): Promise<SavedAssessment> {
  if (__APP_PROFILE__ !== "dev" || kb.prescription === null) return saved;
  try {
    const { withPrescription } = await import("../prescription/compute.ts");
    return withPrescription(kb, saved);
  } catch {
    return saved;
  }
}
