// Proving a record of a backup genuine (docs/post-mvp/design/backup-and-data-lock.md §3.4 stage 7): the engine is deterministic, so a record made by THIS version from its answers must come out of the
// engine again exactly as it is written. The importer asks for this only for records stamped with the current engine, knowledge base and profile. Outside `storage/` because it needs the engine and
// the way a draft becomes an engine input.
import type { Assessment } from "@tcm/engine";
import type { KnowledgeBase } from "@tcm/kb";
import { canonicalJson } from "../storage/backup/canonical.ts";
import type { Current, ReplayOutcome } from "../storage/backup/plan.ts";
import type { SavedAssessment } from "../storage/types.ts";
import { assessInputOf, draftFromSaved } from "./assessment.ts";

export interface Engine { assess(kb: KnowledgeBase, input: NonNullable<ReturnType<typeof assessInputOf>>): Assessment }

/** What this build is, for deciding which records can be replayed. */
export const currentOf = (kb: KnowledgeBase, engineVersion: string): Current => ({ engineVersion, kbVersion: kb.version, profile: kb.profile });

export function makeReplay(kb: KnowledgeBase, engine: Engine): (saved: SavedAssessment) => ReplayOutcome {
  return (saved) => {
    // a result that used a birth moment the person did not choose to keep has had the moment removed (privacy §3): the answers no longer suffice to make it again
    if (saved.result.reference?.birth.requested === true && saved.input.birth === undefined) return "cannot";
    try {
      const input = assessInputOf(draftFromSaved(kb, saved, "replay", saved.createdAt), saved.createdAt);
      if (input === null) return "cannot";
      const again = engine.assess(kb, input);
      if (canonicalJson(again) === canonicalJson(saved.result)) return "same";
      // the same answers, engine and knowledge base, yet another result: either it was altered, or the parameters (or the season model) are not the ones it was made with
      return again.meta.paramsFingerprint !== saved.paramsFingerprint || again.meta.seasonModel !== saved.seasonModel ? "other-version" : "different";
    } catch {
      return "cannot";
    }
  };
}
