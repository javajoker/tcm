// "Start with my previous profile" (follow-up design §4.2). A module of its own and free of the engine: the start page, which is part of the first load, uses it.
import { SERIOUS_CONDITIONS } from "../screens/profile/model.ts";
import { newDraft } from "../storage/draft.ts";
import type { Draft, SavedAssessment } from "../storage/types.ts";

/**
 * "Start with my previous profile" (follow-up design §4.2): a new draft holding the answers *about the person* of a saved result — age, sex, pregnancy, medicines, allergies, conditions — never the
 * findings, the screening answers or the constitution answers, so the person re-checks the profile instead of retyping it and answers the rest again. Birth data only if it was saved.
 */
export function draftFromProfile(saved: SavedAssessment, id: string, now: number): Draft {
  const i = saved.input;
  return {
    ...newDraft(id, now, "/start"),
    subject: i.subject, profile: i.profile,
    redFlags: i.redFlags.filter((flag) => (SERIOUS_CONDITIONS as readonly string[]).includes(flag)),
    ...(i.birth ? { birth: i.birth, rememberBirth: true } : {}),
  };
}
