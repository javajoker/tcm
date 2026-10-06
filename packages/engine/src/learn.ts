// What the Learn section needs from the engine's own vocabulary (docs/post-mvp/design/knowledge-browser.md §6): the features of a pattern in bands rather than weights. Pure, no prose;
// the comparison of patterns (PM-16) builds on the same bands.

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
