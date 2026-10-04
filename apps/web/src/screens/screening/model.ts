// The pure part of S04/S05: which items are asked, how an answer changes the draft, which blocking notices apply and which are still unacknowledged.
import { resolvePolicy, type NoticeId, type NoticeRequest, type PolicyFacts } from "@tcm/engine";
import type { KnowledgeBase, RedFlag } from "@tcm/kb";
import type { Draft, RedFlagAnswer } from "../../storage/types.ts";
import { subjectOf } from "../profile/model.ts";

/** The notices that stop the screen until acknowledged (the flow then continues): the rest are inline banners. */
export const isBlocking = (n: NoticeRequest): boolean => n.kind === "blocking_ack";

export interface Items { readonly A: readonly RedFlag[]; readonly B: readonly RedFlag[] }

/** The items asked on S04 (levels A and B, in the knowledge base's order). Level C comes from the profile. */
export function askedItems(kb: KnowledgeBase): Items {
  return { A: kb.redFlags.filter((f) => f.level === "A"), B: kb.redFlags.filter((f) => f.level === "B") };
}

export const answerOf = (d: Draft, id: string): RedFlagAnswer | null => d.screening.answers[id] ?? null;

export function unanswered(kb: KnowledgeBase, d: Draft): string[] {
  const { A, B } = askedItems(kb);
  return [...A, ...B].map((f) => f.id).filter((id) => answerOf(d, id) === null);
}

/** Record an answer. `redFlags` (the engine's input) holds the yes-or-unsure items, so "unsure counts as yes" is decided here once. */
export function withAnswer(d: Draft, id: string, answer: RedFlagAnswer, opts: { corrected?: boolean } = {}): Draft {
  const redFlags = d.redFlags.filter((x) => x !== id);
  if (answer !== "no") redFlags.push(id);
  const corrected = opts.corrected && !d.screening.corrected.includes(id) ? [...d.screening.corrected, id] : d.screening.corrected;
  return { ...d, redFlags, screening: { ...d.screening, answers: { ...d.screening.answers, [id]: answer }, corrected } };
}

/** An answer of yes/unsure may only become "no" through the explicit "I made a mistake" action. */
export const needsCorrectionConfirm = (d: Draft, id: string, next: RedFlagAnswer): boolean => next === "no" && answerOf(d, id) !== null && answerOf(d, id) !== "no";

/** The policy facts of a complete profile (before any symptom is known). `null` while the profile is incomplete. */
export function factsOf(d: Draft): PolicyFacts | null {
  const s = subjectOf(d);
  if (s === null) return null;
  return {
    ageYears: s.ageYears, pregnant: s.pregnancy === "yes" || s.pregnancy === "possible", lactating: s.lactating, redFlags: new Set(d.redFlags),
    seriousChronic: s.seriousChronicDisease, medications: s.medications, allergyMatch: false, acuteExternal: false,
    states: { lowConfidence: false, insufficientInformation: false, conflictingData: false },
  };
}

/** The blocking notices of the draft, most severe first. */
export function blockingNotices(kb: KnowledgeBase, d: Draft): NoticeRequest[] {
  const facts = factsOf(d);
  return facts === null ? [] : resolvePolicy(kb, facts).notices.filter(isBlocking);
}

/** Acknowledgement key: the notice and the exact reasons it was shown for (new reasons → a new acknowledgement). */
export const noticeKey = (n: Pick<NoticeRequest, "id" | "reasons">): string => `${n.id}|${[...n.reasons].sort().join(",")}`;

export const pendingNotices = (kb: KnowledgeBase, d: Draft): NoticeRequest[] => blockingNotices(kb, d).filter((n) => d.screening.acknowledgedAt[noticeKey(n)] === undefined);

/** Record the acknowledgement of these notices at time `at`. `acknowledgements` (notice ids) is what the result checks. */
export function withAcknowledged(d: Draft, notices: readonly NoticeRequest[], at: number): Draft {
  const acknowledgedAt = { ...d.screening.acknowledgedAt };
  for (const n of notices) acknowledgedAt[noticeKey(n)] = at;
  const ids = new Set<string>(d.acknowledgements);
  for (const n of notices) ids.add(n.id);
  return { ...d, acknowledgements: [...ids], screening: { ...d.screening, acknowledgedAt } };
}

export const NOTICE_STYLE: Readonly<Partial<Record<NoticeId, "emergency" | "caution" | "info">>> = {
  "N-A": "emergency", "N-B": "caution", "N-MINOR": "info", "N-PREG": "info", "N-LACT": "info", "N-SERIOUS": "info",
};

/** What S04 shows read-only under "From your profile": the level-C situations the profile implies. */
export function profileSituations(d: Draft): string[] {
  const out: string[] = [];
  const s = d.subject;
  if (s.ageYears !== undefined && s.ageYears < 18) out.push("RF_C_MINOR");
  if (s.pregnancy === "yes" || s.pregnancy === "possible") out.push("RF_C_PREGNANT");
  if (s.lactating === true) out.push("RF_C_LACTATING");
  for (const id of d.redFlags) if (id.startsWith("RF_C_") && !out.includes(id)) out.push(id);
  return out;
}
