// The pure part of S11 (UX spec §4.8): the order of the items, paging, and the answers in the draft.
import type { KnowledgeBase } from "@tcm/kb";
import type { Draft } from "../../storage/types.ts";

export const PAGE_SIZE = 5;

export interface QuizItem { readonly id: string; readonly text: { readonly "zh-Hant": string; readonly en: string }; readonly constitution: string }

/**
 * The items interleaved across the nine types (the first item of each type, then the second of each …), so a page never reads like one constitution and the
 * person is not led by the grouping. The order is fixed (not random): the same on every visit and in every test.
 */
export function quizItems(kb: KnowledgeBase): QuizItem[] {
  const types = kb.constitutionItems.types;
  const longest = Math.max(...types.map((t) => t.items.length));
  const out: QuizItem[] = [];
  for (let k = 0; k < longest; k++) for (const t of types) { const it = t.items[k]; if (it) out.push({ id: it.id, text: it.text, constitution: t.constitution }); }
  return out;
}

export const pages = (items: readonly QuizItem[]): QuizItem[][] => Array.from({ length: Math.ceil(items.length / PAGE_SIZE) }, (_, i) => items.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE));

export const answeredCount = (d: Draft): number => Object.keys(d.constitutionAnswers).length;

export const withAnswer = (d: Draft, id: string, value: number): Draft => ({ ...d, constitutionAnswers: { ...d.constitutionAnswers, [id]: value } });
export const cleared = (d: Draft): Draft => ({ ...d, constitutionAnswers: {} });
