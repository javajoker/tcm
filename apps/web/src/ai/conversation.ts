// The conversation of AI help (PM-47; docs/post-mvp/design/ai-assisted-intake.md §1, §4). It is held in memory only (privacy §2: never in storage, a backup or a result): for one
// unfinished assessment, as long as the page is open; withdrawing the consent or starting another assessment drops it. What the person confirms becomes findings of the draft,
// exactly like an answer to a question — nothing else of the conversation is kept.
import { create } from "zustand";
import type { Message, Proposal, Severity } from "@tcm/ai";
import type { Finding } from "@tcm/engine";
import type { Draft } from "../storage/types.ts";

export interface Conversation {
  /** The unfinished assessment this conversation belongs to. */
  readonly draftId: string | null;
  readonly token: { readonly value: string; readonly expiresAt: number } | null;
  /** The opening question first, then the person's words and the assistant's questions. */
  readonly messages: readonly Message[];
  /** Proposed findings waiting for the person. */
  readonly pending: readonly Proposal[];
  /** Findings confirmed in this conversation (they can be removed here). */
  readonly confirmed: readonly string[];
  /** Red flags this conversation has sent the person back to — each once. */
  readonly reopened: readonly string[];
  /** What the person typed and has not sent: kept while the screening is answered again. */
  readonly unsent: string;
  readonly done: boolean;
  /** Something the person wrote concerns the profile (level C). */
  readonly profileNotice: boolean;
}

export const EMPTY_CONVERSATION: Conversation = { draftId: null, token: null, messages: [], pending: [], confirmed: [], reopened: [], unsent: "", done: false, profileNotice: false };

interface Store extends Conversation {
  update(patch: Partial<Conversation>): void;
  /** Start afresh, for this assessment (null: none). */
  reset(draftId: string | null): void;
}

export const useConversation = create<Store>()((set) => ({
  ...EMPTY_CONVERSATION,
  update: (patch) => set(patch),
  reset: (draftId) => set({ ...EMPTY_CONVERSATION, draftId }),
}));

/**
 * Send the person back to the screening for these red flags: an item they answered "no" is asked again (its answer is cleared, so the flow stops at the screening until it is
 * answered). An item answered yes or "not sure" already raised its notice and stays as it is. The ids actually re-opened.
 */
export function reopenScreening(d: Draft, ids: readonly string[]): { readonly draft: Draft; readonly reopened: readonly string[] } {
  const reopened = ids.filter((id) => d.screening.answers[id] === "no");
  if (reopened.length === 0) return { draft: d, reopened };
  const answers = Object.fromEntries(Object.entries(d.screening.answers).filter(([id]) => !reopened.includes(id)));
  return { draft: { ...d, screening: { ...d.screening, answers } }, reopened };
}

/** A confirmed proposal, recorded as an answered question would record it; a severity only for a present finding of a graded symptom. */
export function withConfirmed(d: Draft, p: Proposal, severity: Severity | undefined): Draft {
  const f: Finding = p.state === "absent" ? { state: "absent" } : severity !== undefined ? { state: "present", severity } : { state: "present" };
  return { ...d, findings: { ...d.findings, [p.id]: f } };
}

export const withoutFinding = (d: Draft, id: string): Draft => ({ ...d, findings: Object.fromEntries(Object.entries(d.findings).filter(([k]) => k !== id)) });

/** The menses are asked about only for a woman, as in the questions (the whole vocabulary is sent; the app drops what does not apply). */
export const topicApplies = (topic: string | undefined, sex: "male" | "female" | undefined): boolean => topic !== "menses" || sex === "female";
