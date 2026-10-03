// Step 10 (modification, 加減; SOP §12.5): classical modifications first, then the residual greedy modification.
// Both need herb records (available when the profile reaches L2: `policy.features.modification`). They never produce doses: the proposals are
// herbs added/removed with a reason; the greedy step works on relative effective weights.
import type { Formula, Herb, KnowledgeBase } from "@tcm/kb";
import { bestScale, cost, formulaVector, dimensionWeight, type PanelVector, type Role } from "./formulas.ts";

// ── herb vectors ────────────────────────────────────────────────────────────

/** What one herb does to the panel of the person taking it: effects (benefit) + harms (burden). */
export function herbVector(h: Pick<Herb, "effects" | "harms">): Record<string, number> {
  const v: Record<string, number> = {};
  for (const [k, x] of Object.entries(h.effects)) v[k] = (v[k] ?? 0) + x;
  for (const [k, x] of Object.entries(h.harms)) v[k] = (v[k] ?? 0) + x;
  return v;
}

/** Σ weight × herb vector over a composition (herbs in id order, like the oracle). */
export function compositionVector(herbs: ReadonlyMap<string, Herb>, weights: Readonly<Record<string, number>>): Record<string, number> {
  const v: Record<string, number> = {};
  for (const id of Object.keys(weights).sort()) {
    const h = herbs.get(id);
    if (!h) throw new Error(`unknown herb ${id}`);
    for (const [d, x] of Object.entries(herbVector(h))) v[d] = (v[d] ?? 0) + weights[id]! * x;
  }
  return v;
}

/** Herbs that may be added by the residual step: curated, not toxic, no pregnancy flag (sorted for determinism). The caller narrows it further by the person. */
export function modificationPool(kb: KnowledgeBase): string[] {
  if (!kb.herbs) return [];
  return [...kb.herbs.values()].filter((h) => h.status === "curated-draft" && (h.pregnancy === "ok" || h.pregnancy === "ok-unreviewed") && !h.toxic).map((h) => h.id).sort();
}

// ── classical modifications ─────────────────────────────────────────────────

export interface ClassicalModification {
  readonly id: string;
  readonly resultName: string;
  /** The listed trigger symptoms the user has. */
  readonly matched: readonly string[];
  readonly add: readonly { herb: string; role: string }[];
  readonly remove: readonly { herb: string }[];
  readonly source: { readonly book: string; readonly verification: string };
  readonly status: string;
}

/** Classical modifications whose trigger symptoms (any of `when_symptoms`) are present (SOP §12.5). */
export function classicalModifications(f: Formula, present: ReadonlySet<string>): ClassicalModification[] {
  const out: ClassicalModification[] = [];
  for (const m of f.modifications) {
    const matched = m.when_symptoms.filter((s) => present.has(s));
    if (matched.length === 0) continue;
    out.push({ id: m.id, resultName: m.result_name, matched, add: m.add.map((a) => ({ herb: a.herb, role: a.role })), remove: m.remove.map((r) => ({ herb: r.herb })), source: m.source, status: m.status });
  }
  return out;
}

// ── residual greedy modification ────────────────────────────────────────────

export interface ResidualStep {
  readonly op: "add" | "remove";
  readonly herb: string;
  /** Reduction of the cost ‖D + k·T‖²_w this step achieves. */
  readonly gain: number;
  /** The panel dimensions where the step helps most (largest weighted reduction of the residual), at most three. */
  readonly improves: readonly string[];
  /** For a removal: the burden dimensions of the removed herb that account for the gain. */
  readonly avoidsBurden: readonly string[];
}

export interface ResidualModification {
  readonly formula: string;
  readonly k: number;
  /** ‖D‖²_w: the deviation with no treatment at all (the SOP's "未用藥"). */
  readonly costNone: number;
  /** ‖D + k·T‖²_w with the formula unmodified. */
  readonly costFormula: number;
  /** The same after the modification steps. */
  readonly costAfter: number;
  readonly steps: readonly ResidualStep[];
  /** Effective weights of the modified composition (sum to 1). */
  readonly composition: Readonly<Record<string, number>>;
}

function improvements(kb: KnowledgeBase, dev: PanelVector, before: PanelVector, after: PanelVector): [string, number][] {
  const dims = [...new Set([...Object.keys(dev), ...Object.keys(before), ...Object.keys(after)])].sort();
  return dims.map((d): [string, number] => {
    const b = (dev[d] ?? 0) + (before[d] ?? 0), a = (dev[d] ?? 0) + (after[d] ?? 0);
    return [d, dimensionWeight(kb, d) * (b * b - a * a)];
  }).filter(([, g]) => g > 1e-12).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
}

/**
 * Greedy 加減 of formula `f` against the primary offset `dev` at strength `k`: add up to `max_add` herbs from `pool` (as 佐 with `add_share`
 * of the effective weight) and remove up to `max_remove` herbs (never 君) whenever a step lowers the cost by more than `min_gain`.
 * The result is identical to the Python oracle's `greedy_modify` (parity-tested).
 */
export function greedyModify(kb: KnowledgeBase, f: Formula, dev: PanelVector, k: number, pool: readonly string[]): ResidualModification {
  const herbs = kb.herbs;
  if (!herbs) throw new Error("greedy modification needs herb records (policy.features.modification)");
  const cfg = kb.params.formula.modification;
  const roles = new Map<string, Role>(f.composition.map((c) => [c.herb, c.role]));
  let cur: Record<string, number> = Object.fromEntries(f.composition.map((c) => [c.herb, c.effective_weight]));
  const scaled = (comp: Readonly<Record<string, number>>): Record<string, number> => {
    const v = compositionVector(herbs, comp);
    for (const d of Object.keys(v)) v[d] = k * v[d]!;
    return v;
  };
  const costFormula = cost(kb, dev, scaled(cur));
  let curCost = costFormula;
  const steps: ResidualStep[] = [];

  for (let i = 0; i < cfg.max_add; i++) {
    let best: { c: number; herb: string; trial: Record<string, number> } | null = null;
    for (const h of pool) {
      if (h in cur) continue;
      const trial: Record<string, number> = {};
      for (const [a, w] of Object.entries(cur)) trial[a] = w * (1 - cfg.add_share);
      trial[h] = cfg.add_share;
      const c = cost(kb, dev, scaled(trial));
      if (best === null || c < best.c) best = { c, herb: h, trial };
    }
    if (best !== null && best.c < curCost - cfg.min_gain) {
      const imp = improvements(kb, dev, scaled(cur), scaled(best.trial));
      steps.push({ op: "add", herb: best.herb, gain: curCost - best.c, improves: imp.slice(0, 3).map(([d]) => d), avoidsBurden: [] });
      curCost = best.c;
      cur = best.trial;
    }
  }
  let removed = 0;
  while (removed < cfg.max_remove) {
    let best: { c: number; herb: string; trial: Record<string, number> } | null = null;
    for (const h of Object.keys(cur).sort()) {
      if (roles.get(h) === "君") continue;
      const rest = Object.entries(cur).filter(([a]) => a !== h);
      const s = rest.reduce((acc, [, w]) => acc + w, 0);
      const trial = Object.fromEntries(rest.map(([a, w]) => [a, w / s]));
      const c = cost(kb, dev, scaled(trial));
      if (best === null || c < best.c) best = { c, herb: h, trial };
    }
    if (best !== null && best.c < curCost - cfg.min_gain) {
      const imp = improvements(kb, dev, scaled(cur), scaled(best.trial));
      const harms = new Set(Object.keys(herbs.get(best.herb)?.harms ?? {}));
      steps.push({ op: "remove", herb: best.herb, gain: curCost - best.c, improves: imp.slice(0, 3).map(([d]) => d), avoidsBurden: imp.map(([d]) => d).filter((d) => harms.has(d)).slice(0, 3) });
      curCost = best.c;
      cur = best.trial;
      removed++;
    } else break;
  }
  return { formula: f.id, k, costNone: cost(kb, dev, {}), costFormula, costAfter: curCost, steps, composition: cur };
}

/** Convenience: fit, k* and the greedy modification of `f` in one call. */
export function modifyFormula(kb: KnowledgeBase, f: Formula, dev: PanelVector, pool: readonly string[]): ResidualModification {
  return greedyModify(kb, f, dev, bestScale(kb, dev, formulaVector(f)), pool);
}
