// What one turn of the conversation sends (docs/privacy.md §6 rule 7; impact assessment §3): the conversation, the app's own vocabulary in the session's language and the ids the
// person has confirmed. This module is the only one that builds a request, and it is given nothing else — never the profile, birth data, notes or the history (a test sends a
// draft full of marked values and finds none of them).
import { PROTOCOL, vocabularyFrom } from "@tcm/ai";
import type { Lang, Message, TurnRequest, VocabItem } from "@tcm/ai";
import type { KnowledgeBase } from "@tcm/kb";
import type { Findings } from "@tcm/engine";

/** The vocabulary of a turn (`vocabularyFrom` of @tcm/ai), from the loaded knowledge base, in the session's language and script. */
export const vocabularyOf = (kb: KnowledgeBase, lang: Lang): VocabItem[] =>
  vocabularyFrom({ symptoms: kb.symptoms.values(), questions: kb.questions }, (t) => (lang === "en" ? (t.en ?? t["zh-Hant"]) : kb.zh(t["zh-Hant"])));

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
