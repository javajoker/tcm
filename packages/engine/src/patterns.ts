// Step 7: pattern differentiation — Pct per pattern (SOP §9.2) and 證素 decomposition (§9.3).
//   Pct(p) = max(0, Σ w·sev·q [present] − Σ v·q [present, against]) ÷ Σ w × 100;  no `required_any` symptom present → Pct × factor.
// Only PRESENT findings add or subtract; absent and unsure add nothing (the denominator Σw is fixed). Priors never enter here (tech spec §7.3 rule 1).
import type { KnowledgeBase, Pattern, PatternElement } from "@tcm/kb";
import type { Normalized } from "./normalize.ts";

export type Band = "high" | "medium" | "weak" | "none";

export interface EvidenceFor { readonly symptomId: string; readonly weight: number; readonly sev: number; readonly q: number; readonly contribution: number }
export interface EvidenceAgainst { readonly symptomId: string; readonly weight: number; readonly q: number; readonly penalty: number }

export interface ScoredPattern {
  readonly id: string;
  readonly pct: number;
  readonly band: Band;
  /** Σ w·sev·q over the present supporting symptoms. */
  readonly positive: number;
  /** Σ v·q over the present contradicting symptoms. */
  readonly negative: number;
  readonly maxScore: number;
  readonly requiredPresent: boolean;
  /** Present supporting symptoms, strongest contribution first (ties by id). */
  readonly evidence: readonly EvidenceFor[];
  readonly against: readonly EvidenceAgainst[];
}

export interface ScoredElement {
  readonly id: string;
  readonly pct: number;
  readonly band: Band;
  readonly evidence: readonly EvidenceFor[];
  readonly against: readonly EvidenceAgainst[];
}

export function bandOf(kb: KnowledgeBase, pct: number): Band {
  const b = kb.params.pattern.bands;
  return pct >= b.high ? "high" : pct >= b.medium ? "medium" : pct >= b.weak ? "weak" : "none";
}

interface Score { pct: number; positive: number; negative: number; maxScore: number; evidence: EvidenceFor[]; against: EvidenceAgainst[] }

function score(weights: Readonly<Record<string, number>>, againstWeights: Readonly<Record<string, number>>, n: Normalized): Score {
  let positive = 0, negative = 0, maxScore = 0;
  const evidence: EvidenceFor[] = [], against: EvidenceAgainst[] = [];
  for (const [symptomId, weight] of Object.entries(weights)) {
    maxScore += weight;
    const f = n.findings.get(symptomId);
    if (f?.state === "present") {
      const contribution = weight * f.sev * f.q;
      positive += contribution;
      evidence.push({ symptomId, weight, sev: f.sev, q: f.q, contribution });
    }
  }
  for (const [symptomId, weight] of Object.entries(againstWeights)) {
    const f = n.findings.get(symptomId);
    if (f?.state === "present") {
      const penalty = weight * f.q;
      negative += penalty;
      against.push({ symptomId, weight, q: f.q, penalty });
    }
  }
  const byStrength = (a: { symptomId: string; contribution?: number; penalty?: number }, b: typeof a): number =>
    (b.contribution ?? b.penalty ?? 0) - (a.contribution ?? a.penalty ?? 0) || (a.symptomId < b.symptomId ? -1 : 1);
  evidence.sort(byStrength);
  against.sort(byStrength);
  return { pct: maxScore > 0 ? (Math.max(0, positive - negative) / maxScore) * 100 : 0, positive, negative, maxScore, evidence, against };
}

export function scorePattern(kb: KnowledgeBase, p: Pattern, n: Normalized): ScoredPattern {
  const s = score(p.weights, p.against, n);
  const requiredPresent = p.required_any.some((r) => n.present.has(r));
  const pct = requiredPresent ? s.pct : s.pct * kb.params.pattern.required_any_missing_factor;
  return { id: p.id, pct, band: bandOf(kb, pct), positive: s.positive, negative: s.negative, maxScore: s.maxScore, requiredPresent, evidence: s.evidence, against: s.against };
}

/** All patterns, best first (ties by id) — deterministic. */
export function scorePatterns(kb: KnowledgeBase, n: Normalized): ScoredPattern[] {
  return kb.patterns.map((p) => scorePattern(kb, p, n)).sort((a, b) => b.pct - a.pct || (a.id < b.id ? -1 : 1));
}

export function scoreElement(kb: KnowledgeBase, e: PatternElement, n: Normalized): ScoredElement {
  const s = score(e.weights, e.against, n);
  return { id: e.id, pct: s.pct, band: bandOf(kb, s.pct), evidence: s.evidence, against: s.against };
}

export function scoreElements(kb: KnowledgeBase, n: Normalized): ScoredElement[] {
  return kb.elements.map((e) => scoreElement(kb, e, n)).sort((a, b) => b.pct - a.pct || (a.id < b.id ? -1 : 1));
}
