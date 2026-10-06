// From the draft to an engine run, and from a saved result back to a draft (tech spec §8.3).
import { isAsked, type AssessInput, type Assessment, type SeasonBasis } from "@tcm/engine";
import type { KnowledgeBase } from "@tcm/kb";
import type { Lang } from "@tcm/i18n";
import { subjectOf } from "../screens/profile/model.ts";
import { newDraft } from "../storage/draft.ts";
import type { Draft, SavedAssessment } from "../storage/types.ts";
import { APP_BUILD } from "./profile.ts";

/**
 * The engine's input for a complete draft, or `null` while the profile is incomplete. Birth data given at all means the user opted in to the birth module. `seasons` is how the season is counted; the
 * northern calendar is the default and is not put in the input at all, so that a result made so is exactly what it was before the choice existed.
 */
export function assessInputOf(d: Draft, now: number, seasons?: SeasonBasis): AssessInput | null {
  const subject = subjectOf(d);
  if (subject === null) return null;
  return {
    subject: d.birth === undefined ? subject : { ...subject, birth: d.birth },
    redFlags: new Set(d.redFlags), findings: d.findings, context: d.context,
    ...(Object.keys(d.constitutionAnswers).length > 0 ? { constitutionAnswers: d.constitutionAnswers } : {}),
    options: { now, birthModule: d.birth !== undefined, ...(seasons !== undefined && seasons !== "north" ? { seasons } : {}) },
  };
}

/**
 * Privacy §3: unless the person chose to remember their birth data, a saved result keeps the derived panel and the fact that birth data was used — not the birth
 * moment. The four pillars and the true solar time of birth would give it away, so they are removed before the result is stored.
 */
export function withoutBirthMoment(result: Assessment): Assessment {
  if (result.reference === null) return result;
  return { ...result, reference: { ...result.reference, birth: { ...result.reference.birth, pillars: null, trueSolarTime: null } } };
}

/** The record stored for a result. Birth data is kept only when the user chose to remember it (privacy §3). */
export function toSaved(d: Draft, result: Assessment, ctx: { id: string; lang: Lang }): SavedAssessment {
  return {
    id: ctx.id, createdAt: result.meta.computedAt, appVersion: APP_BUILD, kbVersion: result.meta.kbVersion, engineVersion: result.meta.engineVersion,
    paramsFingerprint: result.meta.paramsFingerprint, profile: result.meta.profile, lang: ctx.lang, seasonModel: result.meta.seasonModel,
    input: { subject: d.subject, profile: d.profile, screening: d.screening, redFlags: d.redFlags, findings: d.findings, context: d.context, ...(Object.keys(d.constitutionAnswers).length > 0 ? { constitutionAnswers: d.constitutionAnswers } : {}), ...(d.rememberBirth && d.birth !== undefined ? { birth: d.birth } : {}), ...(d.observe.pulse ? { observe: d.observe } : {}) },
    result: d.rememberBirth && d.birth !== undefined ? result : withoutBirthMoment(result),
    // which hour the birth blocks were made from, when the birth time was near a change of hour: the choice, not the time (five-phase design §5)
    ...(d.birth !== undefined && d.hourChoice !== undefined ? { hour: d.hourChoice } : {}),
  };
}

/** "Edit and re-run": a new draft holding the saved inputs, positioned at the review. The birth moment is present only if it was saved. */
export function draftFromSaved(kb: KnowledgeBase, saved: SavedAssessment, id: string, now: number): Draft {
  const i = saved.input;
  const history = kb.questions.filter((q) => isAsked(q, { findings: i.findings, context: i.context })).map((q) => q.id);
  return {
    ...newDraft(id, now, "/review"),
    subject: i.subject, profile: i.profile, screening: i.screening, redFlags: [...i.redFlags], findings: i.findings, context: i.context,
    inquiry: { modules: [], history, resolved: [] },
    constitutionAnswers: { ...(i.constitutionAnswers ?? {}) },
    observe: i.observe ?? {},
    acknowledgements: [...new Set(Object.keys(i.screening.acknowledgedAt).map((k) => k.split("|")[0]!))],
    ...(i.birth ? { birth: i.birth, rememberBirth: true, ...(saved.hour !== undefined ? { hourChoice: saved.hour } : {}) } : {}),
  };
}
