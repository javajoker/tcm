// Step 12: the reasoning trace (SOP §14, tech spec §7.2). STRUCTURED items only — no sentences: the UI turns them into text with its message
// catalogs; classical quotations and KB rationale come from the knowledge base. The trace covers the presented patterns, the panel, the priors,
// the alignment, the transmission, the formulas and modifications that are shown, what the safety filter removed, and what would change the result.
import { DEFAULT_PROFILE_PARAMS, ELEMENTS, type Element } from "@tcm/wuxing";
import type { KnowledgeBase } from "@tcm/kb";
import type { FormulaFit } from "./formulas.ts";
import type { ClassicalModification, ResidualModification } from "./modify.ts";
import type { Conflict } from "./normalize.ts";
import type { ConsistencyFlag } from "./orient.ts";
import type { PanelResult } from "./panel.ts";
import type { ScoredElement, ScoredPattern } from "./patterns.ts";
import type { Verdict } from "./reconcile.ts";
import type { ReferenceBlock } from "./reference.ts";
import type { SafetyReport } from "./safety.ts";

export type PriorBlock = "innate" | "annualBazi" | "yunqi" | "season";

export type TraceItem =
  | { readonly kind: "evidence"; readonly patternId: string; readonly symptomId: string; readonly weight: number; readonly severity: number; readonly quality: number; readonly contribution: number }
  | { readonly kind: "against"; readonly patternId: string; readonly symptomId: string; readonly penalty: number }
  | { readonly kind: "theory"; readonly patternId: string; readonly citations: readonly string[] }
  | { readonly kind: "element"; readonly elementId: string; readonly pct: number; readonly degree: number; readonly projection: Readonly<Record<string, number>> }
  | { readonly kind: "panel"; readonly dim: string; readonly value: number; readonly from: readonly string[] }
  | { readonly kind: "prior"; readonly block: PriorBlock; readonly element: Element; readonly degree: number; readonly capped: boolean }
  | { readonly kind: "alignment"; readonly element: Element; readonly alignment: "aligned" | "opposed" | "neutral"; readonly effect: "context" | "tiebreak" }
  | { readonly kind: "transmission"; readonly rule: string; readonly from: Element; readonly to: Element; readonly strength: number; readonly citation: string }
  | { readonly kind: "consistency"; readonly axis: ConsistencyFlag["axis"]; readonly signs: string; readonly panel: string }
  | { readonly kind: "conflict"; readonly group: string; readonly conflictKind: Conflict["kind"]; readonly symptoms: readonly string[] }
  | { readonly kind: "formula"; readonly formulaId: string; readonly k: number; readonly explained: number; readonly coreFit: number; readonly matched: readonly string[]; readonly unmatched: readonly string[]; readonly citations: readonly string[] }
  | { readonly kind: "modification"; readonly op: "add" | "remove" | "classical"; readonly formulaId: string; readonly herbId: string | null; readonly modificationId: string | null; readonly gain: number; readonly improves: readonly string[]; readonly avoidsBurden: readonly string[] }
  | { readonly kind: "suppressed"; readonly itemKind: string; readonly itemId: string; readonly reason: "rule" | "level"; readonly ruleId: string | null }
  | { readonly kind: "whatWouldChange"; readonly ifSymptoms: readonly string[]; readonly shiftsTo: string; readonly over: string };

export interface ExplainInput {
  readonly kb: KnowledgeBase;
  readonly patterns: readonly ScoredPattern[];
  readonly elements: readonly ScoredElement[];
  readonly verdict: Verdict;
  readonly panel: PanelResult;
  readonly reference: ReferenceBlock | null;
  readonly conflicts: readonly Conflict[];
  readonly consistency: readonly ConsistencyFlag[];
  /** Fits of the formulas that are shown (recommended or study-only). */
  readonly formulas: readonly FormulaFit[];
  readonly modifications: readonly ResidualModification[];
  readonly classical: readonly { readonly formulaId: string; readonly items: readonly ClassicalModification[] }[];
  readonly safety: SafetyReport | null;
}

const MIN_PRIOR = 0.05;
const MIN_PANEL = 0.05;

export function explain(x: ExplainInput): TraceItem[] {
  const { kb } = x;
  const out: TraceItem[] = [];
  const presented = x.verdict.patterns.map((p) => p.id);
  const byId = new Map(x.patterns.map((p) => [p.id, p] as const));

  // patterns: evidence for, evidence against, theory
  for (const id of presented) {
    const p = byId.get(id);
    if (!p) continue;
    for (const e of p.evidence) out.push({ kind: "evidence", patternId: id, symptomId: e.symptomId, weight: e.weight, severity: e.sev, quality: e.q, contribution: e.contribution });
    for (const a of p.against) out.push({ kind: "against", patternId: id, symptomId: a.symptomId, penalty: a.penalty });
    out.push({ kind: "theory", patternId: id, citations: kb.patternById.get(id)?.citations ?? [] });
  }

  // 證素 of the presented patterns
  const elementIds = new Set(presented.flatMap((id) => kb.patternById.get(id)?.elements ?? []));
  for (const e of x.elements) {
    if (!elementIds.has(e.id) || e.pct < kb.params.pattern.bands.weak) continue;
    const rec = kb.elementById.get(e.id)!;
    const degree = (kb.params.panel.degree_max * e.pct) / 100;
    out.push({ kind: "element", elementId: e.id, pct: e.pct, degree, projection: Object.fromEntries(Object.entries(rec.projection_per_degree).map(([d, u]) => [d, degree * u])) });
  }

  // observed panel
  for (const [dim, value] of Object.entries(x.panel.observed)) {
    if (Math.abs(value) < MIN_PANEL) continue;
    out.push({ kind: "panel", dim, value, from: (x.panel.projections[dim] ?? []).map((p) => p.patternId) });
  }

  // priors, one item per block and element, each flagged when it reached its cap
  if (x.reference) {
    const c = x.reference.panel.components;
    const caps: Record<PriorBlock, number> = { innate: DEFAULT_PROFILE_PARAMS.innate.cap, annualBazi: DEFAULT_PROFILE_PARAMS.annualBazi.cap, yunqi: DEFAULT_PROFILE_PARAMS.yunqi.cap, season: Math.max(DEFAULT_PROFILE_PARAMS.season.dominant, -DEFAULT_PROFILE_PARAMS.season.controlled) };
    for (const block of ["innate", "annualBazi", "yunqi", "season"] as const) {
      const v = c[block];
      if (!v) continue;
      for (const e of ELEMENTS) if (Math.abs(v[e]) >= MIN_PRIOR) out.push({ kind: "prior", block, element: e, degree: v[e], capped: Math.abs(v[e]) >= caps[block] - 1e-9 });
    }
  }

  // alignment with the reference
  if (x.panel.alignment) {
    const tieElements = new Set<Element>();
    if (x.verdict.tieBreak?.by === "alignment") {
      for (const id of x.verdict.tieBreak.between) {
        const p = kb.patternById.get(id);
        for (const dim of Object.keys(p?.panel_projection_per_degree ?? {})) {
          const e = kb.panelSchema.organs.element_of[dim.split(".")[0]!];
          if (e) tieElements.add(e as Element);
        }
      }
    }
    for (const e of ELEMENTS) {
      const a = x.panel.alignment[e];
      if (a !== "neutral") out.push({ kind: "alignment", element: e, alignment: a, effect: tieElements.has(e) ? "tiebreak" : "context" });
    }
  }

  for (const r of x.panel.transmission.rules) out.push({ kind: "transmission", rule: r.rule, from: r.from, to: r.to, strength: r.amount, citation: r.citation });
  for (const f of x.consistency) out.push({ kind: "consistency", axis: f.axis, signs: f.signs, panel: f.panel });
  for (const c of x.conflicts) out.push({ kind: "conflict", group: c.group, conflictKind: c.kind, symptoms: c.symptoms });

  // formulas and modifications that are shown
  for (const f of x.formulas) {
    out.push({ kind: "formula", formulaId: f.id, k: f.k, explained: f.explained, coreFit: f.coreFit, matched: f.matched, unmatched: f.unmatched, citations: kb.formulas.get(f.id)?.rationale_citations ?? [] });
  }
  for (const c of x.classical) for (const m of c.items) out.push({ kind: "modification", op: "classical", formulaId: c.formulaId, herbId: null, modificationId: m.id, gain: 0, improves: [], avoidsBurden: [] });
  for (const m of x.modifications) for (const s of m.steps) out.push({ kind: "modification", op: s.op, formulaId: m.formula, herbId: s.herb, modificationId: null, gain: s.gain, improves: s.improves, avoidsBurden: s.avoidsBurden });

  for (const s of x.safety?.suppressed ?? []) out.push({ kind: "suppressed", itemKind: s.kind, itemId: s.id, reason: s.reason, ruleId: s.ruleId });
  for (const d of x.verdict.differential) {
    if (d.symptoms.length > 0) out.push({ kind: "whatWouldChange", ifSymptoms: d.symptoms.slice(0, 3).map((s) => s.symptomId), shiftsTo: d.lean, over: d.over });
  }
  return out;
}

/** Every citation id a trace points to (theory, formulas, transmission rules), without duplicates, in order of appearance. */
export function citationsOf(trace: readonly TraceItem[]): string[] {
  const seen = new Set<string>();
  for (const t of trace) {
    if (t.kind === "theory" || t.kind === "formula") for (const c of t.citations) seen.add(c);
    if (t.kind === "transmission") seen.add(t.citation);
  }
  return [...seen];
}
