// The vocabulary a turn carries (design §3): every inquiry symptom of the knowledge base — tongue and pulse are observed, not told — labelled in the session's language, with the
// plain words of the questions' options that record it alone, and its dimension as the topic. The app builds it from its loaded knowledge base, the evaluation from the data
// files; both through this function, so they send the same thing. The whole list goes with every turn, whoever the person is: leaving out the menses would tell the provider the
// person's sex (impact assessment §1: the profile is not processed).
import type { VocabItem } from "./protocol.ts";

export interface Bilingual { readonly "zh-Hant": string; readonly en: string | null }
export interface VocabSource {
  readonly symptoms: Iterable<{ readonly id: string; readonly kind: string; readonly dimension: string; readonly "zh-Hant": string; readonly en: string | null }>;
  readonly questions: Iterable<{ readonly options: readonly { readonly label: Bilingual; readonly symptoms: readonly string[]; readonly none: boolean }[] }>;
}

/** `text` renders a record of the data in the session's language (Simplified through the display dictionary). At most four plain phrasings per finding. */
export function vocabularyFrom(source: VocabSource, text: (t: Bilingual) => string): VocabItem[] {
  const plain = new Map<string, string[]>();
  for (const q of source.questions) for (const o of q.options) if (o.symptoms.length === 1 && !o.none) plain.set(o.symptoms[0]!, [...(plain.get(o.symptoms[0]!) ?? []), text(o.label)]);
  const out: VocabItem[] = [];
  for (const s of source.symptoms) {
    if (s.kind !== "symptom") continue;
    const p = (plain.get(s.id) ?? []).slice(0, 4);
    out.push({ id: s.id, label: text(s), topic: s.dimension, ...(p.length > 0 ? { plain: p } : {}) });
  }
  return out;
}
