// The pure part of S12 (UX spec §4.9): what the review shows and how good the data is.
import { sourceOf, type Severity } from "@tcm/engine";
import type { KnowledgeBase, Question } from "@tcm/kb";
import type { Draft } from "../../storage/types.ts";

/** Order of the twelve inquiry dimensions (SOP §4.2), then the observation ones. */
export const DIMENSION_ORDER = ["cold-heat", "sweat", "head-body", "stool-urine", "diet-taste", "chest-abdomen", "ear-eye-throat", "thirst", "sleep", "emotion", "menses", "face-skin", "voice-breath", "qi-spirit-form", "tongue", "pulse"] as const;

export interface ReviewItem { readonly symptomId: string; readonly text: string; readonly severity?: Severity; readonly selfObserved: boolean; readonly questionId: string | null }
export interface ReviewGroup { readonly dimension: string; readonly items: readonly ReviewItem[] }

/** The question that records a symptom (the one the Edit link returns to), if any. */
export const questionOf = (kb: KnowledgeBase, symptomId: string): Question | undefined => kb.questions.find((q) => q.options.some((o) => o.symptoms.includes(symptomId)));

/** Present findings grouped by dimension; findings of unknown symptoms are ignored (the engine does the same). */
export function reviewGroups(kb: KnowledgeBase, d: Draft): ReviewGroup[] {
  const by = new Map<string, ReviewItem[]>();
  for (const [id, f] of Object.entries(d.findings)) {
    if (f.state !== "present") continue;
    const sym = kb.symptoms.get(id);
    if (!sym) continue;
    const src = sourceOf(kb, id, f.source);
    const list = by.get(sym.dimension) ?? [];
    list.push({ symptomId: id, text: sym["zh-Hant"], ...(f.severity ? { severity: f.severity } : {}), selfObserved: src === "guided" || src === "pulse", questionId: questionOf(kb, id)?.id ?? null });
    by.set(sym.dimension, list);
  }
  const rank = (dim: string): number => { const i = (DIMENSION_ORDER as readonly string[]).indexOf(dim); return i < 0 ? 99 : i; };
  return [...by.entries()].sort(([a], [b]) => rank(a) - rank(b)).map(([dimension, items]) => ({ dimension, items: items.sort((a, b) => (a.symptomId < b.symptomId ? -1 : 1)) }));
}

/** Questions the person skipped ("not sure"): every symptom of the question is `unsure`. */
export function unsureQuestions(kb: KnowledgeBase, d: Draft): Question[] {
  return d.inquiry.history.map((id) => kb.questionById.get(id)).filter((q): q is Question => q !== undefined).filter((q) => {
    const syms = q.options.flatMap((o) => o.symptoms);
    return syms.length > 0 ? syms.every((s) => d.findings[s]?.state === "unsure") : d.context.course === undefined;
  });
}

export const absentCount = (d: Draft): number => Object.values(d.findings).filter((f) => f.state === "absent").length;
export const selfObservedCount = (groups: readonly ReviewGroup[]): number => groups.reduce((n, g) => n + g.items.filter((i) => i.selfObserved).length, 0);
