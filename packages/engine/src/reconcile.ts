// Step 9: reconcile the pattern scores into a verdict, a confidence and a differential (SOP §11).
//   present: patterns with Pct ≥ merge_threshold, at most max_patterns; for an ACUTE course (≤ 14 days) external before internal when both are present (標本緩急: 先外後內)
//   錯雜: two opposed groups of 證素 (cold/heat, deficiency/excess) both ≥ mixed_threshold → confidence one level lower
//   tie (top-two gap < tie_margin): prefer the pattern whose elements are `aligned` with the reference; still tied → both, with a differential
//   confidence: high / medium / low / insufficient from Pct1, the gap m, the coverage c and the evidence quality κ
// The reference panel only ever breaks a tie and colours the explanation; it never changes a score or the confidence grade (SOP §6.3, D17).
import { ELEMENTS, type Element } from "@tcm/wuxing";
import type { KnowledgeBase, Pattern } from "@tcm/kb";
import type { Conflict } from "./normalize.ts";
import type { Alignment } from "./panel.ts";
import type { ScoredElement, ScoredPattern } from "./patterns.ts";

export type Confidence = "high" | "medium" | "low" | "insufficient";
export type MixedKind = "cold-heat" | "deficiency-excess";

export interface PresentedPattern { readonly id: string; readonly pct: number; readonly band: ScoredPattern["band"]; readonly group: Pattern["group"] }

export interface TieBreak {
  readonly between: readonly [string, string];
  readonly margin: number;
  /** The pattern that was put first, or null when the reference could not decide (both are presented). */
  readonly chosen: string | null;
  readonly by: "alignment" | "none";
}

export interface DifferentialSymptom { readonly symptomId: string; readonly weight: number; readonly otherWeight: number; readonly otherAgainst: number }
export interface Differential {
  /** "If you also have these, the result leans towards `lean` rather than `over`." */
  readonly lean: string;
  readonly over: string;
  readonly symptoms: readonly DifferentialSymptom[];
}

export interface Verdict {
  readonly status: "established" | "insufficient";
  readonly patterns: readonly PresentedPattern[];
  readonly mixed: readonly MixedKind[];
  readonly externalFirst: boolean;
  readonly tieBreak: TieBreak | null;
  readonly confidence: Confidence;
  readonly confidenceInputs: { readonly pct1: number; readonly pct2: number; readonly margin: number; readonly coverage: number; readonly kappa: number };
  /** Confidence was lowered by one level because of 錯雜 and/or conflicting data. */
  readonly lowered: readonly ("mixed" | "conflict")[];
  readonly differential: readonly Differential[];
  /** The states the scope policy needs (SOP §0.2 / safety policy §2.1). */
  readonly states: { readonly lowConfidence: boolean; readonly insufficientInformation: boolean; readonly conflictingData: boolean };
}

export interface ReconcileInput {
  readonly patterns: readonly ScoredPattern[];
  readonly elements: readonly ScoredElement[];
  readonly coverage: number;
  readonly conflicts: readonly Conflict[];
  readonly alignment: Readonly<Record<Element, Alignment>> | null;
  readonly present: ReadonlySet<string>;
  readonly answered: ReadonlySet<string>;
  /** Onset duration from the course question; the external-first ordering needs `acute` (SOP §9.1). */
  readonly course?: "acute" | "subacute" | "chronic";
}

const ORDER: readonly Confidence[] = ["insufficient", "low", "medium", "high"];
const lower = (c: Confidence): Confidence => ORDER[Math.max(0, ORDER.indexOf(c) - 1)]!;

/** κ = Σ w·q ÷ Σ w over the evidence supporting the leading pattern (SOP §11.3): how trustworthy the data behind the verdict are. */
export function kappaOf(top: ScoredPattern | undefined): number {
  if (!top || top.evidence.length === 0) return 0;
  let num = 0, den = 0;
  for (const e of top.evidence) { num += e.weight * e.q; den += e.weight; }
  return den > 0 ? num / den : 0;
}

/** Which of the five phases a pattern touches, by the organs of its panel projection. */
export function patternElements(kb: KnowledgeBase, p: Pattern): Element[] {
  const organ: Record<string, Element> = {};
  for (const [o, e] of Object.entries(kb.panelSchema.organs.element_of)) organ[o] = e;
  const out = new Set<Element>();
  for (const dim of Object.keys(p.panel_projection_per_degree)) {
    const e = organ[dim.split(".")[0]!];
    if (e) out.add(e);
  }
  return ELEMENTS.filter((e) => out.has(e));
}

function alignmentScore(kb: KnowledgeBase, id: string, alignment: Readonly<Record<Element, Alignment>>): number {
  const p = kb.patternById.get(id);
  if (!p) return 0;
  let s = 0;
  for (const e of patternElements(kb, p)) s += alignment[e] === "aligned" ? 1 : alignment[e] === "opposed" ? -1 : 0;
  return s;
}

export function mixedKinds(kb: KnowledgeBase, elements: readonly ScoredElement[]): MixedKind[] {
  const cfg = kb.params.reconcile;
  const hit = (group: readonly string[]): boolean => elements.some((e) => e.pct >= cfg.mixed_threshold && group.includes(kb.elementById.get(e.id)?.nature ?? ""));
  const g = cfg.nature_groups;
  const out: MixedKind[] = [];
  if (hit(g.cold) && hit(g.heat)) out.push("cold-heat");
  if (hit(g.deficiency) && hit(g.excess)) out.push("deficiency-excess");
  return out;
}

function differentialOf(kb: KnowledgeBase, a: string, b: string, answered: ReadonlySet<string>): Differential {
  const pa = kb.patternById.get(a)!, pb = kb.patternById.get(b)!;
  const rows: DifferentialSymptom[] = [];
  for (const [symptomId, weight] of Object.entries(pa.weights)) {
    if (answered.has(symptomId)) continue;
    const otherWeight = pb.weights[symptomId] ?? 0, otherAgainst = pb.against[symptomId] ?? 0;
    if (otherWeight === 0 || otherAgainst > 0) rows.push({ symptomId, weight, otherWeight, otherAgainst });
  }
  rows.sort((x, y) => y.weight + y.otherAgainst - (x.weight + x.otherAgainst) || (x.symptomId < y.symptomId ? -1 : 1));
  return { lean: a, over: b, symptoms: rows.slice(0, kb.params.reconcile.differential_symptoms) };
}

export function reconcile(kb: KnowledgeBase, input: ReconcileInput): Verdict {
  const cfg = kb.params.reconcile;
  const ranked = [...input.patterns].sort((x, y) => y.pct - x.pct || (x.id < y.id ? -1 : 1));
  const pct1 = ranked[0]?.pct ?? 0, pct2 = ranked[1]?.pct ?? 0;
  let presented = ranked.filter((p) => p.pct >= cfg.merge_threshold).slice(0, cfg.max_patterns);

  // tie-break between the top two when they are within the margin and both presented
  let tieBreak: TieBreak | null = null;
  if (presented.length >= 2 && presented[0]!.pct - presented[1]!.pct < cfg.tie_margin) {
    const [first, second] = [presented[0]!, presented[1]!];
    const margin = first.pct - second.pct;
    if (input.alignment) {
      const sa = alignmentScore(kb, first.id, input.alignment), sb = alignmentScore(kb, second.id, input.alignment);
      if (sb > sa) { presented = [second, first, ...presented.slice(2)]; tieBreak = { between: [first.id, second.id], margin, chosen: second.id, by: "alignment" }; }
      else if (sa > sb) tieBreak = { between: [first.id, second.id], margin, chosen: first.id, by: "alignment" };
      else tieBreak = { between: [first.id, second.id], margin, chosen: null, by: "none" };
    } else tieBreak = { between: [first.id, second.id], margin, chosen: null, by: "none" };
  }

  // 標本緩急: an external pattern is presented before internal ones
  let externalFirst = false;
  const group = (id: string): string => kb.patternById.get(id)?.group ?? "";
  if (input.course === "acute" && presented.some((p) => group(p.id) === "external") && presented.some((p) => group(p.id) !== "external")) {
    externalFirst = true;
    presented = [...presented.filter((p) => group(p.id) === "external"), ...presented.filter((p) => group(p.id) !== "external")];
  }

  const top = ranked[0];
  const kappa = kappaOf(top);
  const margin = pct1 - pct2;
  const c = cfg.confidence;
  let confidence: Confidence =
    pct1 >= c.high.pct1 && margin >= c.high.margin && input.coverage >= c.high.coverage && kappa >= c.high.kappa ? "high"
    : pct1 >= c.medium.pct1 && margin >= c.medium.margin && input.coverage >= c.medium.coverage ? "medium"
    : pct1 >= c.low.pct1 ? "low" : "insufficient";

  const mixed = pct1 >= cfg.merge_threshold ? mixedKinds(kb, input.elements) : [];
  const exclusiveConflict = input.conflicts.some((x) => x.kind === "exclusive");
  const lowered: ("mixed" | "conflict")[] = [];
  if (confidence !== "insufficient") {
    if (mixed.length > 0) { confidence = lower(confidence); lowered.push("mixed"); }
    if (exclusiveConflict) { confidence = lower(confidence); lowered.push("conflict"); }
  }

  const differential: Differential[] = [];
  const pair = presented.length >= 2 ? [presented[0]!.id, presented[1]!.id] : ranked.filter((p) => p.pct >= kb.params.pattern.bands.weak).slice(0, 2).map((p) => p.id);
  if (pair.length === 2) differential.push(differentialOf(kb, pair[0]!, pair[1]!, input.answered), differentialOf(kb, pair[1]!, pair[0]!, input.answered));

  return {
    status: confidence === "insufficient" ? "insufficient" : "established",
    patterns: presented.map((p) => ({ id: p.id, pct: p.pct, band: p.band, group: group(p.id) as Pattern["group"] })),
    mixed, externalFirst, tieBreak, confidence,
    confidenceInputs: { pct1, pct2, margin, coverage: input.coverage, kappa },
    lowered, differential,
    states: { lowConfidence: confidence === "low", insufficientInformation: confidence === "insufficient", conflictingData: exclusiveConflict },
  };
}
