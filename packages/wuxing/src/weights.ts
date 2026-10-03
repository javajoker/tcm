/**
 * L1 — carriers and their initial weights.
 *
 * Everything reduces to HEAVENLY STEMS. A stem is a carrier; a branch is not — it is a container
 * that distributes its points to the hidden stems it holds. The chart's state is therefore a vector
 * over ten stem carriers; elements and polarities are just projections of the same data, and the
 * generation/restraint propagation needs only one "stem × stem" interaction kernel.
 *
 * This layer makes NO generation/restraint judgement: it answers "who is present and how many
 * points each holds".
 *
 *   pillar base 100 → stem 40 : branch 60 → branch points shared among hidden stems (65/25/10 …)
 *   month pillar    → branch ×2.0 (120), stem ×1.2 (48): the season commands the whole chart
 *   司令 boost      → the commanding hidden stem ×1.5, then the month branch is re-normalised to 120,
 *                     so the total is unchanged and only the internal structure shifts (this is why
 *                     the start and the end of the same month give different charts)
 *   大運 130 (stem share slides 0.70 → 0.30 over the ten years), 流年 110 (fixed stem 40 : branch 70)
 */

import {
  HIDDEN_ROLES, HIDDEN_STEMS, elementOf, polarityOf,
} from "./ganzhi.ts";
import type { NatalChart } from "./chart.ts";
import type { WuxingParams } from "./params.ts";
import { DEFAULT_PARAMS } from "./params.ts";
import type { Branch, Element, HiddenRole, Pillar, Polarity, Stem } from "./types.ts";

export type PillarKind = "year" | "month" | "day" | "hour" | "luck" | "annual";
export type Layer = "stem" | "branch";

export interface Carrier {
  /** Stable id unique within a chart, e.g. "month.branch.0". */
  readonly id: string;
  readonly stem: Stem;
  readonly element: Element;
  readonly polarity: Polarity;
  readonly pillar: PillarKind;
  readonly layer: Layer;
  /** Index among hidden stems, 0 = principal; null for the pillar's own stem. */
  readonly hiddenIndex: number | null;
  readonly hostBranch: Branch | null;
  readonly role: HiddenRole | null;
  /** The day stem — target of the extra 流年 → 日主 factor. */
  readonly isDayMaster: boolean;
  weight: number;
  /** Capacity to act on others, independent of own weight (1 for everyone in this engine). */
  activity: number;
}

export interface LuckContext {
  readonly pillar: Pillar;
  /** Years elapsed since the 大運 started, ∈ [0, 10). Decides the stem/branch split. */
  readonly elapsedYears: number;
}

function carrierId(pillar: PillarKind, layer: Layer, hiddenIndex: number | null): string {
  return hiddenIndex === null ? `${pillar}.${layer}` : `${pillar}.${layer}.${hiddenIndex}`;
}

/** Share of a 大運's points held by its stem; slides linearly from `start` to `end` over ten years. */
export function luckStemShareAt(elapsedYears: number, p: WuxingParams): number {
  const t = Math.min(Math.max(elapsedYears, 0), 10) / 10;
  const { stemShareStart, stemShareEnd } = p.weights.luck;
  return stemShareStart + (stemShareEnd - stemShareStart) * t;
}

function layPillar(kind: PillarKind, pillar: Pillar, stemWeight: number, branchWeight: number, p: WuxingParams): Carrier[] {
  const made: Carrier[] = [{
    id: carrierId(kind, "stem", null), stem: pillar.stem, element: elementOf(pillar.stem), polarity: polarityOf(pillar.stem),
    pillar: kind, layer: "stem", hiddenIndex: null, hostBranch: null, role: null,
    isDayMaster: kind === "day", weight: stemWeight, activity: 1,
  }];
  const hidden = HIDDEN_STEMS[pillar.branch];
  const split = p.weights.hiddenSplit[hidden.length as 1 | 2 | 3];
  hidden.forEach((stem, i) => {
    made.push({
      id: carrierId(kind, "branch", i), stem, element: elementOf(stem), polarity: polarityOf(stem),
      pillar: kind, layer: "branch", hiddenIndex: i, hostBranch: pillar.branch, role: HIDDEN_ROLES[i] as HiddenRole,
      isDayMaster: false, weight: branchWeight * (split[i] as number), activity: 1,
    });
  });
  return made;
}

/** The four natal pillars. Independent of any moment in time, so a result can be computed once and frozen. */
export function layNatalCarriers(chart: NatalChart, params: WuxingParams = DEFAULT_PARAMS): Carrier[] {
  const w = params.weights;
  const stemW = w.pillarBase * w.stemShare;
  const branchW = w.pillarBase * w.branchShare;
  const carriers: Carrier[] = [];

  carriers.push(...layPillar("year", chart.year, stemW, branchW, params));

  // Month: season amplification, then 司令 boost with re-normalisation inside the month branch.
  const monthBranchW = branchW * w.monthCommand.branchMultiplier;
  const month = layPillar("month", chart.month, stemW * w.monthCommand.stemMultiplier, monthBranchW, params);
  const siling = chart.siling;
  if (siling.resolvedTo !== null) {
    const hidden = month.filter((c) => c.layer === "branch");
    const boosted = hidden.map((c) => (c.stem === siling.resolvedTo ? c.weight * w.monthCommand.silingBoost : c.weight));
    const sum = boosted.reduce((a, b) => a + b, 0);
    const norm = sum > 0 ? monthBranchW / sum : 1;
    hidden.forEach((c, i) => { c.weight = (boosted[i] as number) * norm; });
  }
  carriers.push(...month);

  carriers.push(...layPillar("day", chart.day, stemW, branchW, params));
  // Unknown hour: one pillar fewer, and NO compensation (a missing pillar is missing information).
  if (chart.hour !== null) carriers.push(...layPillar("hour", chart.hour, stemW, branchW, params));
  return carriers;
}

/** 大運 and 流年, laid separately from the natal pillars. */
export function layExternalCarriers(
  luck: LuckContext | null | undefined, annual: Pillar | null | undefined, params: WuxingParams = DEFAULT_PARAMS,
): { carriers: Carrier[]; luckStemShare: number | null } {
  const w = params.weights;
  const carriers: Carrier[] = [];
  let luckStemShare: number | null = null;
  if (luck != null) {
    luckStemShare = luckStemShareAt(luck.elapsedYears, params);
    carriers.push(...layPillar("luck", luck.pillar, w.luck.total * luckStemShare, w.luck.total * (1 - luckStemShare), params));
  }
  if (annual != null) carriers.push(...layPillar("annual", annual, w.annual.stem, w.annual.branch, params));
  return { carriers, luckStemShare };
}

export function cloneCarriers(cs: readonly Carrier[]): Carrier[] {
  return cs.map((c) => ({ ...c }));
}

export function totalsOf(cs: readonly Carrier[]): {
  byElement: Record<Element, number>; byPolarity: Record<Polarity, number>; byPillar: Partial<Record<PillarKind, number>>; grand: number;
} {
  const byElement: Record<Element, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const byPolarity: Record<Polarity, number> = { 陽: 0, 陰: 0 };
  const byPillar: Partial<Record<PillarKind, number>> = {};
  let grand = 0;
  for (const c of cs) {
    byElement[c.element] += c.weight;
    byPolarity[c.polarity] += c.weight;
    byPillar[c.pillar] = (byPillar[c.pillar] ?? 0) + c.weight;
    grand += c.weight;
  }
  return { byElement, byPolarity, byPillar, grand };
}
