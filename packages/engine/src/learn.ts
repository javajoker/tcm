// What the Learn section needs from the engine's own vocabulary (docs/post-mvp/design/knowledge-browser.md §6): the features of a pattern in bands rather than weights, and the comparison of
// patterns built on the same bands. Pure, no prose.
import type { KnowledgeBase } from "@tcm/kb";

/** How much a feature says for a pattern: its weight against the pattern's largest weight, or that it speaks against it. */
export type FeatureBand = "key" | "common" | "supporting" | "against";

/** A weight at least this share of the pattern's largest is *key*; at least `COMMON_SHARE` is *common*; anything below is *supporting*. */
export const KEY_SHARE = 2 / 3;
export const COMMON_SHARE = 1 / 3;

export interface Feature { readonly symptomId: string; readonly weight: number; readonly band: FeatureBand }

/** The band of a weight among the weights of one pattern (`max` is the largest of them). A comparison is made on integers scaled by 3 so that 2/3 and 1/3 are exact. */
export function featureBand(weight: number, max: number): Exclude<FeatureBand, "against"> {
  if (!(max > 0) || !(weight > 0)) return "supporting";
  return weight * 3 >= max * 2 ? "key" : weight * 3 >= max ? "common" : "supporting";
}

/**
 * The features of a pattern: those that count for it, strongest first (ties by id), then those that speak against it (strongest first). A symptom is never in both lists — the data
 * check guarantees it — but if one were, the positive entry wins and the symptom is not repeated.
 */
export function featuresOf(weights: Readonly<Record<string, number>>, against: Readonly<Record<string, number>> = {}): Feature[] {
  const byWeight = (a: readonly [string, number], b: readonly [string, number]): number => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const positive = Object.entries(weights).sort(byWeight);
  const max = positive.reduce((m, [, w]) => Math.max(m, w), 0);
  const out: Feature[] = positive.map(([symptomId, weight]) => ({ symptomId, weight, band: featureBand(weight, max) }));
  for (const [symptomId, weight] of Object.entries(against).sort(byWeight)) if (!(symptomId in weights)) out.push({ symptomId, weight, band: "against" });
  return out;
}

// ── comparing patterns (docs/post-mvp/design/knowledge-browser.md §6) ────────

/** Two features differ for the compared patterns when their signed weights (weight minus against) are at least this far apart — the same two points the question bank's K-07 check uses. */
export const DISTINGUISHES = 2;
export const MAX_COMPARED = 3;
export const MAX_QUESTIONS = 3;

/** One symptom across the compared patterns: its band in each pattern (`null`: not in that record) and how far apart the patterns' signed weights are. */
export interface ComparedFeature { readonly symptomId: string; readonly bands: readonly (FeatureBand | null)[]; readonly spread: number }
/** A question of the bank that tells the patterns apart: what it asks about (its dimension and the symptoms of its options that differ) and how much, summed over those symptoms. */
export interface ComparedQuestion { readonly questionId: string; readonly dimension: string; readonly score: number; readonly symptoms: readonly string[] }
export interface Comparison {
  /** The patterns, in the order they were given. */
  readonly ids: readonly string[];
  /** Symptoms with weight in every pattern that do not tell them apart (the same band in every column, or a gap of under two points), strongest first. */
  readonly shared: readonly ComparedFeature[];
  /** Symptoms whose signed weights differ by at least `DISTINGUISHES` and whose bands differ (including one that speaks against one pattern and for another), the widest gap first. */
  readonly distinguishing: readonly ComparedFeature[];
  /** The questions of the bank that tell them apart, best first, at most `MAX_QUESTIONS`. */
  readonly questions: readonly ComparedQuestion[];
}

/**
 * Compares two or three patterns from the records alone — no answers, no score. Every list is a deterministic function of the records (ties by id), the order of `ids` only orders the bands
 * of a row, and a pattern compared with itself has nothing that tells it apart.
 */
export function comparePatterns(kb: KnowledgeBase, ids: readonly string[]): Comparison {
  if (ids.length < 2 || ids.length > MAX_COMPARED) throw new RangeError(`compare two or three patterns, not ${ids.length}`);
  const patterns = ids.map((id) => { const p = kb.patternById.get(id); if (p === undefined) throw new RangeError(`unknown pattern ${id}`); return p; });
  const bandsOf = patterns.map((p) => new Map(featuresOf(p.weights, p.against).map((f) => [f.symptomId, f.band] as const)));
  const signed = (p: (typeof patterns)[number], s: string): number => (p.weights[s] ?? 0) - (p.against[s] ?? 0);
  const symptoms = [...new Set(patterns.flatMap((p) => [...Object.keys(p.weights), ...Object.keys(p.against)]))].sort();
  const rows = symptoms.map((symptomId): ComparedFeature => {
    const values = patterns.map((p) => signed(p, symptomId));
    return { symptomId, bands: bandsOf.map((m) => m.get(symptomId) ?? null), spread: Math.max(...values) - Math.min(...values) };
  });
  const smallest = (r: ComparedFeature): number => Math.min(...patterns.map((p) => signed(p, r.symptomId)));
  const byId = (a: ComparedFeature, b: ComparedFeature): number => (a.symptomId < b.symptomId ? -1 : a.symptomId > b.symptomId ? 1 : 0);
  // a gap of two points that the reader cannot see (the same band in every column, because the patterns' largest weights differ) is not offered as a difference
  const tellsApart = (r: ComparedFeature): boolean => r.spread >= DISTINGUISHES && new Set(r.bands).size > 1;
  const distinguishing = rows.filter(tellsApart).sort((a, b) => b.spread - a.spread || byId(a, b));
  const shared = rows.filter((r) => !tellsApart(r) && patterns.every((p) => (p.weights[r.symptomId] ?? 0) > 0)).sort((a, b) => smallest(b) - smallest(a) || byId(a, b));
  const spread = new Map(rows.map((r) => [r.symptomId, r.spread] as const));
  const questions = kb.questions.map((q): ComparedQuestion => {
    const own = [...new Set(q.options.flatMap((o) => o.symptoms))].filter((s) => (spread.get(s) ?? 0) > 0).sort((a, b) => spread.get(b)! - spread.get(a)! || (a < b ? -1 : 1));
    return { questionId: q.id, dimension: q.dimension, score: own.reduce((n, s) => n + spread.get(s)!, 0), symptoms: own };
  }).filter((q) => q.score > 0).sort((a, b) => b.score - a.score || (a.questionId < b.questionId ? -1 : 1)).slice(0, MAX_QUESTIONS);
  return { ids: [...ids], shared, distinguishing, questions };
}
