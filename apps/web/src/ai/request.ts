// What one turn of the conversation sends (docs/privacy.md §6 rule 7; impact assessment §3): the conversation, the app's own vocabulary in the session's language and the ids the
// person has confirmed. This module is the only one that builds a request, and it is given nothing else — never the profile, birth data, notes or the history (a test sends a
// draft full of marked values and finds none of them).
import { PROTOCOL } from "@tcm/ai";
import type { Lang, Message, TurnRequest, VocabItem } from "@tcm/ai";
import type { KnowledgeBase } from "@tcm/kb";
import type { Findings } from "@tcm/engine";

/**
 * The findings the app can name in a conversation: every inquiry symptom (tongue and pulse are observed, not told), labelled in the session's language, with the plain words of the
 * questions' options that record it alone, and its dimension as the topic. The whole list goes with every turn, whoever the person is: leaving out the menses would tell the
 * provider the person's sex (impact assessment §1: the profile is not processed).
 */
export function vocabularyOf(kb: KnowledgeBase, lang: Lang): VocabItem[] {
  const text = (t: { readonly "zh-Hant": string; readonly en: string | null }): string => (lang === "en" ? (t.en ?? t["zh-Hant"]) : kb.zh(t["zh-Hant"]));
  const plain = new Map<string, string[]>();
  for (const q of kb.questions) for (const o of q.options) if (o.symptoms.length === 1 && !o.none) plain.set(o.symptoms[0]!, [...(plain.get(o.symptoms[0]!) ?? []), text(o.label)]);
  const out: VocabItem[] = [];
  for (const s of kb.symptoms.values()) {
    if (s.kind !== "symptom") continue;
    const p = (plain.get(s.id) ?? []).slice(0, 4);
    out.push({ id: s.id, label: text(s), topic: s.dimension, ...(p.length > 0 ? { plain: p } : {}) });
  }
  return out;
}

/** The ids of the vocabulary the person has answered, in any way (present or absent): the conversation does not propose them again. */
export const confirmedIds = (findings: Findings, vocabulary: readonly VocabItem[]): string[] =>
  vocabulary.filter((v) => findings[v.id] !== undefined && findings[v.id]!.state !== "unsure").map((v) => v.id);

export function buildTurnRequest(input: { readonly lang: Lang; readonly messages: readonly Message[]; readonly vocabulary: readonly VocabItem[]; readonly confirmed: readonly string[] }): TurnRequest {
  return {
    v: PROTOCOL,
    lang: input.lang,
    messages: input.messages.map((m) => ({ role: m.role, text: m.text, ...(m.topic !== undefined ? { topic: m.topic } : {}) })),
    vocabulary: input.vocabulary,
    confirmed: [...input.confirmed],
  };
}
