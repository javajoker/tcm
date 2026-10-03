// Step 10 (orchestration of the recommendations): candidates → symptom fit → panel fit → safety → modification, diet, points, lifestyle.
// Everything is produced at the producer: what the policy does not allow is never in the result (it appears in `suppressed`).
import type { Formula, KnowledgeBase } from "@tcm/kb";
import { candidateFormulaIds, compositionOf, fitFormulas, passesSymptomFit, strengthOf, type CompositionRow, type FormulaFit, type Strength } from "./formulas.ts";
import { classicalModifications, greedyModify, modificationPool, type ClassicalModification, type ResidualModification } from "./modify.ts";
import type { Normalized } from "./normalize.ts";
import type { PanelResult } from "./panel.ts";
import type { Verdict } from "./reconcile.ts";
import { evaluateSafety, type Candidate, type FiredRule, type SafetyReport, type SafetySubject, type SuppressedItem } from "./safety.ts";
import type { Policy } from "./types.ts";

/** At most this many formulas are recommended (SOP §12.4: 2–3 per pattern; the best fits overall). */
export const MAX_RECOMMENDED_FORMULAS = 3;

export interface FormulaRecommendation {
  readonly id: string;
  readonly tier: "A" | "B" | "C";
  readonly fit: FormulaFit;
  readonly strength: Strength;
  /** The leading patterns this formula is linked to. */
  readonly patterns: readonly string[];
  readonly composition: readonly CompositionRow[];
  readonly classicalModifications: readonly ClassicalModification[];
  readonly residualModification: ResidualModification | null;
  /** Warnings on the herbs the residual modification adds (what the safety rules say about each added herb for this person). */
  readonly modificationNotes: readonly { readonly herbId: string; readonly annotations: readonly FiredRule[] }[];
  /** Warnings of the safety rules that fired but did not remove the formula (everything in dev; soft rules in release). */
  readonly annotations: readonly FiredRule[];
  /** Tier C: shown for learning only, never as a recommendation (SOP §0.2). */
  readonly studyOnly: boolean;
  readonly citations: readonly string[];
}

export interface FoodRecommendation { readonly name: string; readonly patterns: readonly string[]; readonly annotations: readonly FiredRule[] }
export interface AcupointRecommendation { readonly name: string; readonly code: string; readonly meridian: string; readonly patterns: readonly string[]; readonly annotations: readonly FiredRule[] }

export interface Recommendations {
  /** Why nothing (or less) is recommended: the policy level, insufficient information, or the safety filter. */
  readonly status: "full" | "limited-by-level" | "insufficient-information";
  /** 治則 of each presented pattern (Chinese, from the knowledge base). */
  readonly principles: readonly { readonly patternId: string; readonly text: string }[];
  readonly formulas: readonly FormulaRecommendation[];
  readonly studyOnly: readonly FormulaRecommendation[];
  readonly foods: readonly FoodRecommendation[];
  readonly acupoints: readonly AcupointRecommendation[];
  readonly lifestyle: readonly { readonly patternId: string; readonly text: string }[];
  /** General regimen text (《素問》) with its citations; always present. */
  readonly general: { readonly text: string; readonly citations: readonly string[] };
}

export interface RecommendInput {
  readonly subject: SafetySubject;
  readonly policy: Policy;
  readonly normalized: Normalized;
  readonly panel: PanelResult;
  readonly verdict: Verdict;
}

export interface RecommendResult { readonly recommendations: Recommendations; readonly safety: SafetyReport | null; readonly fits: readonly FormulaFit[]; readonly modifications: readonly ResidualModification[]; readonly classical: readonly { formulaId: string; items: readonly ClassicalModification[] }[] }

const unique = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

export function recommend(kb: KnowledgeBase, input: RecommendInput): RecommendResult {
  const { policy, verdict, panel, normalized: n } = input;
  const patternIds = verdict.patterns.map((p) => p.id);
  const general = { text: kb.treatment.general.text, citations: [...kb.treatment.general.source] };
  const lifestyle = policy.features.formulas || verdict.status === "established"
    ? patternIds.map((id) => ({ patternId: id, text: kb.patternById.get(id)!.treatment.lifestyle })) : [];
  const principles = patternIds.map((id) => ({ patternId: id, text: kb.patternById.get(id)!.principle }));
  const empty = (status: Recommendations["status"], safety: SafetyReport | null = null): RecommendResult => ({
    recommendations: { status, principles: verdict.status === "established" ? principles : [], formulas: [], studyOnly: [], foods: [], acupoints: [], lifestyle: verdict.status === "established" ? lifestyle : [], general },
    safety, fits: [], modifications: [], classical: [],
  });
  if (verdict.status !== "established") return empty("insufficient-information");

  // 1. candidates → panel fit → symptom fit
  const candidateIds = new Set(candidateFormulaIds(kb, patternIds));
  const fits = fitFormulas(kb, panel.observed, n, candidateIds).filter((f) => passesSymptomFit(kb, f));

  // 2. safety on every candidate item (formulas, diet, acupoints); the level gate runs first and is listed
  const foods = unique(patternIds.flatMap((id) => kb.patternById.get(id)!.treatment.foods)).map((name) => ({ name, patterns: patternIds.filter((id) => kb.patternById.get(id)!.treatment.foods.includes(name)) }));
  const points = unique(patternIds.flatMap((id) => kb.patternById.get(id)!.treatment.acupoints)).map((name) => ({ name, patterns: patternIds.filter((id) => kb.patternById.get(id)!.treatment.acupoints.includes(name)) }));
  const candidates: Candidate[] = [
    ...fits.map((f) => ({ kind: "formula" as const, formula: kb.formulas.get(f.id)! })),
    ...foods.map((f) => ({ kind: "food" as const, name: f.name })),
    ...points.map((p) => ({ kind: "acupoint" as const, name: p.name })),
  ];
  const safety = evaluateSafety(kb, { subject: input.subject, policy, bagang: panel.bagang, candidates });
  const keptIds = new Set(safety.kept.map((i) => `${i.candidate.kind}:${i.id}`));
  const annotations = new Map(safety.items.map((i) => [`${i.candidate.kind}:${i.id}`, i.fired] as const));

  // 3. formulas that remain: recommended (allowed tiers) and study-only (tier C), best fit first
  const modifications: ResidualModification[] = [];
  const classical: { formulaId: string; items: readonly ClassicalModification[] }[] = [];
  const built: FormulaRecommendation[] = [];
  for (const fit of fits) {
    if (!keptIds.has(`formula:${fit.id}`)) continue;
    const f: Formula = kb.formulas.get(fit.id)!;
    const items = policy.features.modification ? classicalModifications(f, n.present) : [];
    const residual = policy.features.modification && kb.herbs ? greedyModify(kb, f, panel.observed, fit.k, safeModificationPool(kb, input, f)) : null;
    if (items.length) classical.push({ formulaId: f.id, items });
    if (residual && residual.steps.length) modifications.push(residual);
    const notes = residual
      ? residual.steps.filter((st) => st.op === "add").map((st) => ({
        herbId: st.herb,
        annotations: evaluateSafety(kb, { subject: input.subject, policy, bagang: panel.bagang, candidates: [{ kind: "herb", herbId: st.herb, formula: f }] }).items[0]?.fired ?? [],
      }))
      : [];
    built.push({
      id: f.id, tier: f.tier, fit, strength: strengthOf(kb, fit.k), patterns: patternIds.filter((p) => kb.patternById.get(p)!.formulas.includes(f.id)),
      composition: compositionOf(kb, f, policy.features.dosage), classicalModifications: items, residualModification: residual && residual.steps.length ? residual : null, modificationNotes: notes,
      annotations: annotations.get(`formula:${f.id}`) ?? [], studyOnly: f.tier === "C", citations: [...f.rationale_citations],
    });
  }
  const recommended = built.filter((b) => !b.studyOnly).slice(0, MAX_RECOMMENDED_FORMULAS);
  const study = built.filter((b) => b.studyOnly);

  const keptFoods = foods.filter((f) => keptIds.has(`food:${f.name}`)).map((f) => ({ ...f, annotations: annotations.get(`food:${f.name}`) ?? [] }));
  const keptPoints = points.filter((p) => keptIds.has(`acupoint:${p.name}`)).map((p) => ({
    ...p, code: kb.treatment.acupoints[p.name]?.code ?? "", meridian: kb.treatment.acupoints[p.name]?.meridian ?? "", annotations: annotations.get(`acupoint:${p.name}`) ?? [],
  }));
  const limited = policy.level === "L0" || (!policy.features.formulas);
  return {
    recommendations: { status: limited ? "limited-by-level" : "full", principles, formulas: recommended, studyOnly: study, foods: keptFoods, acupoints: keptPoints, lifestyle, general },
    safety, fits, modifications, classical,
  };
}

/** Herbs the residual step may add to `f` for THIS person: the curated pool minus what the safety rules remove (pregnancy, interactions, allergy, 十八反/十九畏 with the formula's own herbs). */
function safeModificationPool(kb: KnowledgeBase, input: RecommendInput, f: Formula): string[] {
  const base = modificationPool(kb);
  const report = evaluateSafety(kb, { subject: input.subject, policy: input.policy, bagang: input.panel.bagang, candidates: base.map((herbId) => ({ kind: "herb" as const, herbId, formula: f })) });
  const removed = new Set(report.suppressed.map((s) => s.id));
  return base.filter((h) => !removed.has(h));
}

export type { SuppressedItem };
