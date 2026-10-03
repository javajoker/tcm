/**
 * L5 (reduced) — solving the chart at a moment: natal base, 大運 and 流年.
 *
 * ## Base chart vs instant chart
 *
 *   base    : natal L1 weights → L3 propagation. Computed once and frozen.
 *   instant : copy of the natal L1 + 大運/流年 carriers → L3 propagation, from scratch each time.
 *
 * The natal L1 weights are reused, never recomputed, so "the four pillars do not change with the
 * moment" is a structural fact rather than a coincidence. Propagation is re-run in full for every
 * instant because relative weights change within a 大運 (its stem share slides 0.70 → 0.30).
 *
 * 流月/流日 are deliberately NOT part of this engine: a month or a day is a trigger, not a source of
 * force. Adding a 30-day factor to the weight iteration would make it compete numerically with a
 * lifelong month command and drown the yearly signal in high-frequency noise. Seasonal modulation
 * inside a year is handled by the seasonal module (profile.ts) from the solar terms instead.
 *
 * Structure rewriting (合化刑沖害破) is intentionally omitted: the source engine's latest design
 * reads the element balance directly ("直接五行平衡即可"); see docs/wuxing-algorithm.md §2.
 */

import { branchAt, stemAt } from "./ganzhi.ts";
import { toJulianDay } from "./astro/julian.ts";
import { TROPICAL_YEAR_DAYS, type LuckPillar, type NatalChart } from "./chart.ts";
import { DEFAULT_PARAMS, paramsFingerprint, validateParams, type WuxingParams } from "./params.ts";
import { propagate, type PropagationResult } from "./propagate.ts";
import {
  cloneCarriers, layExternalCarriers, layNatalCarriers, totalsOf,
  type Carrier, type LuckContext,
} from "./weights.ts";
import { ELEMENTS, type Element, type ElementVector, type Pillar, type Polarity } from "./types.ts";

export interface SolvedChart {
  readonly carriers: readonly Carrier[];
  readonly propagation: PropagationResult;
  /** Element shares after propagation, summing to 1. */
  readonly shares: Readonly<ElementVector>;
  readonly polarityShares: Readonly<Record<Polarity, number>>;
  /** Normalised entropy of the element shares, H / ln 5 ∈ [0,1]; 1 = perfectly even. */
  readonly evenness: number;
}

export interface BaseChart {
  readonly chart: NatalChart;
  readonly params: WuxingParams;
  readonly paramsId: string;
  /** Natal L1 carriers (before propagation). Instants copy these. */
  readonly natalL1: readonly Carrier[];
  readonly solved: SolvedChart;
}

export interface Instant {
  readonly luck?: LuckContext | null;
  readonly annual?: Pillar | null;
}

function solve(carriers: Carrier[], params: WuxingParams): SolvedChart {
  const propagation = propagate(carriers, params.propagation);
  const total = ELEMENTS.reduce((a, e) => a + propagation.byElement[e], 0);
  const shares = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 } as ElementVector;
  for (const e of ELEMENTS) shares[e] = total > 0 ? propagation.byElement[e] / total : 0;
  const polTotal = propagation.byPolarity.陽 + propagation.byPolarity.陰;
  const polarityShares = polTotal > 0
    ? { 陽: propagation.byPolarity.陽 / polTotal, 陰: propagation.byPolarity.陰 / polTotal }
    : { 陽: 0.5, 陰: 0.5 };
  const entropy = -ELEMENTS.reduce((a, e) => a + (shares[e] > 0 ? shares[e] * Math.log(shares[e]) : 0), 0);
  return { carriers: propagation.carriers, propagation, shares, polarityShares, evenness: entropy / Math.log(5) };
}

/** Solve the natal base chart (L1 + L3). */
export function buildBase(chart: NatalChart, params: WuxingParams = DEFAULT_PARAMS): BaseChart {
  validateParams(params);
  const natalL1 = layNatalCarriers(chart, params);
  return {
    chart, params, paramsId: paramsFingerprint(params),
    natalL1: Object.freeze(natalL1.map((c) => Object.freeze({ ...c }))) as readonly Carrier[],
    solved: solve(cloneCarriers(natalL1), params),
  };
}

/** Solve the chart at an instant by adding 大運/流年 carriers to a copy of the natal L1. */
export function evaluateAt(base: BaseChart, at: Instant = {}): SolvedChart {
  const carriers = cloneCarriers(base.natalL1);
  carriers.push(...layExternalCarriers(at.luck, at.annual, base.params).carriers);
  return solve(carriers, base.params);
}

/** Annual pillar of a 立春-year. */
export function annualPillarOf(year: number): Pillar {
  return { stem: stemAt(year - 4), branch: branchAt(year - 4) };
}

/**
 * Element-share change attributable to the year, measured against a NEUTRAL year, not against the
 * natal chart.
 *
 * Plain subtraction measures dilution: shares always sum to 1, so adding carriers pulls every share
 * toward even — a chart's weakest element "rises" and its strongest "falls" merely because pillars
 * were added, whatever those pillars are. The null hypothesis is therefore that the added force is
 * spread evenly over the five elements:
 *
 *     expected(e) = (W_natal(e) + added / 5) / mass_now
 *     delta(e)    = W_now(e) / mass_now − expected(e)
 *
 * which sums to exactly 0 and is 0 when no 大運/流年 is added.
 */
export function shareDeltaOf(natal: Readonly<ElementVector>, now: Readonly<ElementVector>): ElementVector {
  const massN = ELEMENTS.reduce((t, e) => t + natal[e], 0);
  const massNow = ELEMENTS.reduce((t, e) => t + now[e], 0);
  const out = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 } as ElementVector;
  if (massNow <= 0) return out;
  const added = (massNow - massN) / ELEMENTS.length;
  for (const e of ELEMENTS) out[e] = (now[e] - natal[e] - added) / massNow;
  return out;
}

export interface YearEvaluation {
  readonly year: number;
  readonly annualPillar: Pillar;
  readonly luckStep: LuckPillar | null;
  readonly elapsedYears: number;
  readonly solved: SolvedChart;
  /** Neutral-year-corrected change of each element's share; sums to 0. */
  readonly delta: Readonly<ElementVector>;
}

/**
 * Evaluate a 立春-year. The sampling instant is 4 Feb 00:00 of that year (a convention): it selects
 * the active 大運 and how far into it we are. A year in which the 大運 changes is NOT time-averaged —
 * the atmosphere of two consecutive 大運 cannot be mixed linearly; report the sampled step.
 */
export function evaluateYear(base: BaseChart, year: number): YearEvaluation {
  const annualPillar = annualPillarOf(year);
  const sampleJd = toJulianDay({ year, month: 2, day: 4, hour: 0, minute: 0, second: 0 });
  const luckStep = base.chart.luck.pillars.find((p) => sampleJd >= p.startJd && sampleJd < p.endJd) ?? null;
  const elapsedYears = luckStep === null ? 0 : (sampleJd - luckStep.startJd) / TROPICAL_YEAR_DAYS;
  const solved = evaluateAt(base, {
    luck: luckStep === null ? null : { pillar: luckStep.pillar, elapsedYears },
    annual: annualPillar,
  });
  const natalMass = totalsOf(base.solved.carriers).byElement;
  const nowMass = totalsOf(solved.carriers).byElement;
  return { year, annualPillar, luckStep, elapsedYears, solved, delta: shareDeltaOf(natalMass as Record<Element, number>, nowMass) };
}
