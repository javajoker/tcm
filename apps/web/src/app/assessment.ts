// From the draft to an engine run, and from a saved result back to a draft (tech spec §8.3).
import { isAsked, type AssessInput, type Assessment } from "@tcm/engine";
import type { KnowledgeBase } from "@tcm/kb";
import type { Lang } from "@tcm/i18n";
import { subjectOf } from "../screens/profile/model.ts";
import { newDraft } from "../storage/draft.ts";
import type { Draft, SavedAssessment } from "../storage/types.ts";
import { APP_BUILD } from "./profile.ts";

/** The engine's input for a complete draft, or `null` while the profile is incomplete. Birth data given at all means the user opted in to the birth module. */
export function assessInputOf(d: Draft, now: number): AssessInput | null {
  const subject = subjectOf(d);
  if (subject === null) return null;
  return {
    subject: d.birth === undefined ? subject : { ...subject, birth: d.birth },
    redFlags: new Set(d.redFlags), findings: d.findings, context: d.context,
    ...(Object.keys(d.constitutionAnswers).length > 0 ? { constitutionAnswers: d.constitutionAnswers } : {}),
    options: { now, birthModule: d.birth !== undefined },
  };
}

/** The record stored for a result. Birth data is kept only when the user chose to remember it (privacy §3). */
export function toSaved(d: Draft, result: Assessment, ctx: { id: string; lang: Lang }): SavedAssessment {
  return {
    id: ctx.id, createdAt: result.meta.computedAt, appVersion: APP_BUILD, kbVersion: result.meta.kbVersion, engineVersion: result.meta.engineVersion,
    paramsFingerprint: result.meta.paramsFingerprint, profile: result.meta.profile, lang: ctx.lang, seasonModel: result.meta.seasonModel,
    input: { subject: d.subject, profile: d.profile, screening: d.screening, redFlags: d.redFlags, findings: d.findings, context: d.context, ...(Object.keys(d.constitutionAnswers).length > 0 ? { constitutionAnswers: d.constitutionAnswers } : {}), ...(d.rememberBirth && d.birth !== undefined ? { birth: d.birth } : {}) },
    result,
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
    acknowledgements: [...new Set(Object.keys(i.screening.acknowledgedAt).map((k) => k.split("|")[0]!))],
    ...(i.birth ? { birth: i.birth, rememberBirth: true } : {}),
  };
}
