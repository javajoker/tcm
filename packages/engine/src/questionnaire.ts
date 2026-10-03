// The adaptive inquiry (SOP §4.8, tech spec §7.5): which question next, why, and when to stop.
//   1. before enough is known, ask the core questions in order, those of the chosen complaint modules first;
//   2. afterwards rank the unasked, applicable questions by how well their symptoms SEPARATE the leading patterns
//      (information gain = Σ over pairs of leading patterns of the difference of their signed weights), normalised to 0…1,
//      plus a bonus for core questions until the core coverage target is reached and a boost for the chosen modules;
//   3. stop when the confidence is at least medium and the core coverage ≥ 80 %, at the question limit, or when nothing is left.
// Deterministic: ties are broken by the question's `order`, then its id.
import type { KnowledgeBase, Question } from "@tcm/kb";
import { applies, normalize, type Normalized } from "./normalize.ts";
import { scoreElements, scorePatterns, type ScoredPattern } from "./patterns.ts";
import { reconcile, type Confidence } from "./reconcile.ts";
import type { AssessContext, Findings, PregnancyStatus, Sex } from "./types.ts";

export interface InquiryState {
  readonly sex: Sex;
  readonly pregnancy: PregnancyStatus;
  readonly findings: Findings;
  readonly context?: AssessContext;
  /** Complaint modules the user chose (ids of `kb.modules`). */
  readonly modules: readonly string[];
}

export type QuestionReason =
  | { readonly kind: "core" }
  | { readonly kind: "module"; readonly module: string }
  | { readonly kind: "separates"; readonly between: readonly [string, string]; readonly symptoms: readonly string[] };

export interface QuestionSuggestion { readonly questionId: string; readonly score: number; readonly gain: number; readonly reason: QuestionReason }

export type StopReason = "enough" | "limit" | "exhausted";

export interface NextQuestions {
  /** Non-null when the inquiry can stop: the app offers "see your result" (and optionally "answer a few more"). */
  readonly done: StopReason | null;
  readonly suggestions: readonly QuestionSuggestion[];
  readonly coverage: number;
  readonly asked: number;
  /** Applicable core questions not yet asked (for "about N left"). */
  readonly remainingCore: number;
  readonly confidence: Confidence;
}

/** A question counts as asked once any of its symptoms (or its context) has been recorded, whatever the state (a skip records `unsure`). */
export function isAsked(q: Question, state: Pick<InquiryState, "findings" | "context">): boolean {
  return q.options.some((o) => (o.context ? state.context?.course !== undefined : o.symptoms.some((s) => s in state.findings)));
}

function eligible(kb: KnowledgeBase, state: InquiryState, n: Normalized): Question[] {
  return kb.questions.filter((q) =>
    !isAsked(q, state) && applies(q, state.sex, state.pregnancy) &&
    (!q.follows || q.follows.some((s) => n.present.has(s))) &&
    (q.core || q.follows !== undefined || q.requires !== undefined));
}

const signed = (p: { weights: Readonly<Record<string, number>>; against: Readonly<Record<string, number>> }, s: string): number => (p.weights[s] ?? 0) - (p.against[s] ?? 0);

function leading(kb: KnowledgeBase, scored: readonly ScoredPattern[]): ScoredPattern[] {
  const cfg = kb.params.questionnaire;
  const above = scored.filter((p) => p.pct >= cfg.candidate_pct_floor);
  return (above.length >= 2 ? above : scored.slice(0, 3)).slice(0, cfg.gain_candidates);
}

export function nextQuestions(kb: KnowledgeBase, state: InquiryState, k = 3): NextQuestions {
  const cfg = kb.params.questionnaire;
  const n = normalize(kb, { findings: state.findings, sex: state.sex, pregnancy: state.pregnancy, ...(state.context ? { context: state.context } : {}) });
  const patterns = scorePatterns(kb, n), elements = scoreElements(kb, n);
  const verdict = reconcile(kb, { patterns, elements, coverage: n.coverage, conflicts: n.conflicts, alignment: null, present: n.present, answered: new Set([...n.present, ...n.absent]), ...(state.context?.course ? { course: state.context.course } : {}) });
  const asked = kb.questions.filter((q) => isAsked(q, state)).length;
  const pool = eligible(kb, state, n);
  const remainingCore = n.applicableCore.filter((id) => !isAsked(kb.questionById.get(id)!, state)).length;
  const base = { coverage: n.coverage, asked, remainingCore, confidence: verdict.confidence };

  const enough = (verdict.confidence === "high" || verdict.confidence === "medium") && n.coverage >= cfg.core_coverage_stop;
  const done: StopReason | null = asked >= cfg.max_questions ? "limit" : pool.length === 0 ? "exhausted" : enough ? "enough" : null;
  if (pool.length === 0 || asked >= cfg.max_questions) return { ...base, done, suggestions: [] };

  const useGain = asked >= cfg.min_answers_for_gain;
  const cand = useGain ? leading(kb, patterns) : [];
  const raw = pool.map((q) => {
    let gain = 0;
    let best: { pair: [string, string]; symptoms: string[]; value: number } | null = null;
    if (cand.length >= 2) {
      for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) {
        const A = kb.patternById.get(cand[i]!.id)!, B = kb.patternById.get(cand[j]!.id)!;
        const per: [string, number][] = [];
        for (const o of q.options) for (const s of o.symptoms) { const d = Math.abs(signed(A, s) - signed(B, s)); if (d > 0) per.push([s, d]); }
        const value = per.reduce((acc, [, d]) => acc + d, 0);
        gain += value;
        if (!best || value > best.value) best = { pair: [A.id, B.id], symptoms: per.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3).map(([s]) => s), value };
      }
    }
    return { q, gain, best };
  });
  const maxGain = Math.max(0, ...raw.map((r) => r.gain));
  const suggestions: QuestionSuggestion[] = raw.map(({ q, gain, best }) => {
    const norm = maxGain > 0 ? gain / maxGain : 0;
    const inModule = q.modules.find((m) => state.modules.includes(m));
    const score = norm + (q.core && n.coverage < cfg.core_coverage_stop ? cfg.core_bonus : 0) + (inModule ? cfg.module_boost : 0);
    const reason: QuestionReason = useGain && best && best.value > 0 && norm >= 0.5 ? { kind: "separates", between: best.pair, symptoms: best.symptoms }
      : inModule ? { kind: "module", module: inModule } : { kind: "core" };
    return { questionId: q.id, score, gain: norm, reason };
  }).sort((a, b) => b.score - a.score || (kb.questionById.get(a.questionId)!.order - kb.questionById.get(b.questionId)!.order) || (a.questionId < b.questionId ? -1 : 1));
  return { ...base, done, suggestions: suggestions.slice(0, k) };
}
