// Step 10 (matching): which formulas fit the deviation, and how strongly (SOP §12.4).
//   symptom level: share of the formula's core indications present ≥ symptom_fit_min
//   panel level:   T = effect + burden (what taking the formula does to the panel), D = the primary offset (observed panel);
//                  k* = argmin_{0≤k≤k_max} ‖D + k·T‖²_w = clip(−⟨D,T⟩_w / ⟨T,T⟩_w, 0, k_max);  explained = 1 − J(k*) / ‖D‖²_w
//   tiers are COMPUTED from the herbs (SOP §12.3); the stored tier is checked against the recomputation in the tests.
import type { Formula, FormulaComposition, KnowledgeBase } from "@tcm/kb";
import type { Normalized } from "./normalize.ts";

export type Tier = "A" | "B" | "C";
export type Strength = "light" | "standard" | "strong";
export type Role = FormulaComposition["role"];

export type PanelVector = Readonly<Record<string, number>>;

/** Panel-dimension weights of the fit cost: organs 1.0, six qi and products 0.7, 八綱 scalars 0. */
export function dimensionWeight(kb: KnowledgeBase, dim: string): number {
  const w = kb.params.panel.dimension_weights;
  const kind = dim.split(".")[0] as string;
  return kind in w ? w[kind as keyof typeof w] : w.organ;
}

function add(into: Record<string, number>, from: PanelVector, scale = 1): void {
  for (const [k, x] of Object.entries(from)) into[k] = (into[k] ?? 0) + scale * x;
}

/** What the formula does to the panel of the person taking it: effect + burden (both are changes). */
export function formulaVector(f: Pick<Formula, "panel_effect" | "panel_burden">): Record<string, number> {
  const v: Record<string, number> = {};
  add(v, f.panel_effect);
  add(v, f.panel_burden);
  return v;
}

const unionSorted = (...vs: PanelVector[]): string[] => [...new Set(vs.flatMap((v) => Object.keys(v)))].sort();

/** ‖D + T‖²_w */
export function cost(kb: KnowledgeBase, dev: PanelVector, t: PanelVector): number {
  let sum = 0;
  for (const d of unionSorted(dev, t)) {
    const x = (dev[d] ?? 0) + (t[d] ?? 0);
    sum += dimensionWeight(kb, d) * x * x;
  }
  return sum;
}

/** k* = clip(−⟨D,E⟩_w / ⟨E,E⟩_w, 0, k_max) */
export function bestScale(kb: KnowledgeBase, dev: PanelVector, e: PanelVector): number {
  let num = 0, den = 0;
  for (const d of unionSorted(dev, e)) {
    const w = dimensionWeight(kb, d);
    num -= w * (dev[d] ?? 0) * (e[d] ?? 0);
    den += w * (e[d] ?? 0) * (e[d] ?? 0);
  }
  return den === 0 ? 0 : Math.max(0, Math.min(kb.params.formula.k_max, num / den));
}

export function strengthOf(kb: KnowledgeBase, k: number): Strength {
  const b = kb.params.formula.strength_bands;
  return k < b.light_below ? "light" : k > b.strong_above ? "strong" : "standard";
}

export interface FormulaFit {
  readonly id: string;
  readonly tier: Tier;
  /** Relative strength k* — NOT a number of grams. */
  readonly k: number;
  /** Fraction of the deviation the formula corrects, burdens included (0 … 1). */
  readonly explained: number;
  readonly costBefore: number;
  readonly costAfter: number;
  /** Share of the core indications the user has. */
  readonly coreFit: number;
  readonly matched: readonly string[];
  readonly unmatched: readonly string[];
}

export function coreFitOf(f: Pick<Formula, "core_indications">, present: ReadonlySet<string>): { coreFit: number; matched: string[]; unmatched: string[] } {
  const matched = f.core_indications.filter((s) => present.has(s));
  const unmatched = f.core_indications.filter((s) => !present.has(s));
  return { coreFit: f.core_indications.length ? matched.length / f.core_indications.length : 0, matched, unmatched };
}

export function fitFormula(kb: KnowledgeBase, f: Formula, dev: PanelVector, present: ReadonlySet<string>): FormulaFit {
  const t = formulaVector(f);
  const k = bestScale(kb, dev, t);
  const before = cost(kb, dev, {});
  const scaled: Record<string, number> = {};
  add(scaled, t, k);
  const after = cost(kb, dev, scaled);
  return { id: f.id, tier: f.tier, k, explained: before ? 1 - after / before : 0, costBefore: before, costAfter: after, ...coreFitOf(f, present) };
}

/** Fit of every formula of the bundle, best first (ties by id). The caller filters by candidate set, symptom fit, tier and safety. */
export function fitFormulas(kb: KnowledgeBase, dev: PanelVector, n: Pick<Normalized, "present">, only?: ReadonlySet<string>): FormulaFit[] {
  const out: FormulaFit[] = [];
  for (const f of kb.formulas.values()) if (!only || only.has(f.id)) out.push(fitFormula(kb, f, dev, n.present));
  return out.sort((a, b) => b.explained - a.explained || (a.id < b.id ? -1 : 1));
}

/** SOP §12.4 step 1: the formulas linked to the leading patterns (those the verdict presents), in data order, without duplicates. */
export function candidateFormulaIds(kb: KnowledgeBase, patternIds: readonly string[]): string[] {
  const ids: string[] = [];
  for (const pid of patternIds) for (const fid of kb.patternById.get(pid)?.formulas ?? []) if (kb.formulas.has(fid) && !ids.includes(fid)) ids.push(fid);
  return ids;
}

/** Symptom-level filter (SOP §12.4 step 2). */
export const passesSymptomFit = (kb: KnowledgeBase, fit: Pick<FormulaFit, "coreFit">): boolean => fit.coreFit >= kb.params.formula.symptom_fit_min;

// ── tiers ───────────────────────────────────────────────────────────────────

/**
 * Recompute the safety tier from the herbs (SOP §12.3). Returns null when the bundle has no herb records (release): the tier then comes
 * from the knowledge base, which the build validated against the same rule.
 */
export function recomputeTier(kb: KnowledgeBase, f: Formula): Tier | null {
  if (!kb.herbs) return null;
  const t = kb.params.tier;
  let bitter = 0, activating = 0, flagged = false, strong = false;
  for (const c of f.composition) {
    const h = kb.herbs.get(c.herb);
    if (!h) return null;
    if (h.tags.includes(t.bitter_cold_tag)) bitter += c.effective_weight;
    if (h.tags.includes(t.activating_tag)) activating += c.effective_weight;
    if (h.interactions.includes(t.aristolochic_flag)) flagged = true;
    if (t.strong_herbs.includes(c.herb)) strong = true;
  }
  if (strong || bitter >= t.c_bitter_cold_share || f.mvp === false) return "C";
  return activating >= t.b_activating_share || flagged ? "B" : "A";
}

// ── 君臣佐使 composition view ────────────────────────────────────────────────

export interface CompositionRow {
  readonly herb: string;
  readonly name: { readonly "zh-Hant": string; readonly en: string | null };
  readonly latin: string | null;
  readonly role: Role;
  readonly proportion: number;
  readonly effectiveWeight: number;
  /** Only when the policy allows dose references (dev / L3). */
  readonly typicalG?: number;
  readonly classicalAmount?: NonNullable<FormulaComposition["classical_amount"]>;
}

export function compositionOf(kb: KnowledgeBase, f: Formula, dosage: boolean): CompositionRow[] {
  return f.composition.map((c) => {
    const n = kb.herbName(c.herb);
    const row: CompositionRow = {
      herb: c.herb, name: n?.name ?? { "zh-Hant": c.name, en: null }, latin: n?.latin ?? null, role: c.role, proportion: c.proportion, effectiveWeight: c.effective_weight,
    };
    if (!dosage) return row;
    return { ...row, ...(c.typical_g !== undefined ? { typicalG: c.typical_g } : {}), ...(c.classical_amount ? { classicalAmount: c.classical_amount } : {}) };
  });
}
