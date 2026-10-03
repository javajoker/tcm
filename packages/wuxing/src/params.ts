/**
 * Engine parameters — the single source of every tunable number.
 *
 * Provenance: values for `weights` and `propagation` are those of the author's earlier engine
 * (fate4 @ aba58ee, `params/defaults.ts`). Parameters tagged [calibrate] are fitted/chosen; those
 * tagged [school] are explicit school-of-practice decisions that must be declared with every result.
 *
 * Two kinds of validation (loadParams): ranges, and *structural invariants* — relations between
 * values that, when broken, silently produce wrong charts (shares sum to 1, hidden-stem splits sum
 * to 1 and decrease, annual stem+branch = annual total). The latter are the dangerous kind.
 */

import type { ZiHourRule } from "./types.ts";

export interface WuxingParams {
  readonly chart: {
    readonly ziHourRule: ZiHourRule;          // [school]
    readonly trueSolarTime: boolean;
    readonly equationOfTime: boolean;
  };
  readonly weights: {
    readonly pillarBase: number;
    readonly stemShare: number;
    readonly branchShare: number;
    readonly hiddenSplit: {
      readonly 1: readonly number[];
      readonly 2: readonly number[];
      readonly 3: readonly number[];
    };
    readonly monthCommand: {
      readonly branchMultiplier: number;      // [calibrate]
      readonly stemMultiplier: number;        // [calibrate]
      readonly silingBoost: number;           // [calibrate]
    };
    readonly luck: {
      readonly total: number;                 // [calibrate]
      readonly stemShareStart: number;
      readonly stemShareEnd: number;
    };
    readonly annual: {
      readonly total: number;                 // [calibrate]
      readonly stem: number;
      readonly branch: number;
    };
  };
  readonly propagation: {
    readonly damping: number;                 // [calibrate]
    readonly maxRounds: number;               // [calibrate] interaction depth, NOT a convergence control
    readonly epsilon: number;
    readonly outflowCap: number;
    readonly inflowDamageCap: number;
    readonly floor: number;
    readonly kernel: { readonly sheng: number; readonly ke: number };
    readonly shengEfficiency: number;
    readonly keCost: number;
    readonly polarity: {
      readonly shengCross: number;
      readonly shengSame: number;
      readonly keSame: number;
      readonly keCross: number;
    };
    readonly tongdangBeta: number;
    readonly distance: {
      readonly samePillar: number;
      readonly sameBranchHidden: number;
      readonly adjacent: number;
      readonly gap1: number;
      readonly gap2: number;
      readonly crossLayerFactor: number;
    };
    readonly external: {
      readonly luckToNatal: number;
      readonly annualToNatal: number;
      readonly luckToAnnual: number;
      readonly natalToLuck: number;
      readonly natalToAnnual: number;
      readonly annualToDayMasterBonus: number;
    };
  };
}

export const DEFAULT_PARAMS: WuxingParams = Object.freeze({
  chart: Object.freeze({
    ziHourRule: "lateZiNextDay",
    trueSolarTime: true,
    equationOfTime: true,
  }),
  weights: Object.freeze({
    pillarBase: 100,
    stemShare: 0.4,
    branchShare: 0.6,
    hiddenSplit: Object.freeze({
      1: Object.freeze([1.0]),
      2: Object.freeze([0.7, 0.3]),
      3: Object.freeze([0.65, 0.25, 0.1]),
    }),
    monthCommand: Object.freeze({ branchMultiplier: 2.0, stemMultiplier: 1.2, silingBoost: 1.5 }),
    luck: Object.freeze({ total: 130, stemShareStart: 0.7, stemShareEnd: 0.3 }),
    annual: Object.freeze({ total: 110, stem: 40, branch: 70 }),
  }),
  propagation: Object.freeze({
    damping: 0.5,
    maxRounds: 3,
    epsilon: 0.002,
    outflowCap: 0.35,
    inflowDamageCap: 0.4,
    floor: 0,
    kernel: Object.freeze({ sheng: 0.3, ke: 0.4 }),
    shengEfficiency: 0.85,
    keCost: 0.3,
    polarity: Object.freeze({ shengCross: 1.0, shengSame: 0.7, keSame: 1.0, keCross: 0.7 }),
    tongdangBeta: 0.6,
    distance: Object.freeze({
      samePillar: 1.0, sameBranchHidden: 0.6, adjacent: 0.8, gap1: 0.4, gap2: 0.2, crossLayerFactor: 0.7,
    }),
    external: Object.freeze({
      luckToNatal: 0.8, annualToNatal: 0.7, luckToAnnual: 1.0,
      natalToLuck: 0.6, natalToAnnual: 0.5, annualToDayMasterBonus: 1.15,
    }),
  }),
});

const EPS = 1e-9;

/** Throws one error listing every violated invariant. Returns the same object for chaining. */
export function validateParams(p: WuxingParams): WuxingParams {
  const errors: string[] = [];
  const w = p.weights;
  if (Math.abs(w.stemShare + w.branchShare - 1) > EPS) errors.push("weights.stemShare + branchShare must equal 1");
  for (const k of [1, 2, 3] as const) {
    const s = w.hiddenSplit[k];
    if (s.length !== k) errors.push(`weights.hiddenSplit[${k}] must have ${k} entries`);
    if (Math.abs(s.reduce((a, b) => a + b, 0) - 1) > EPS) errors.push(`weights.hiddenSplit[${k}] must sum to 1`);
    for (let i = 1; i < s.length; i++) {
      if ((s[i] as number) > (s[i - 1] as number)) errors.push(`weights.hiddenSplit[${k}] must be non-increasing`);
    }
  }
  if (Math.abs(w.annual.stem + w.annual.branch - w.annual.total) > EPS) {
    errors.push("weights.annual.stem + branch must equal annual.total");
  }
  if (w.luck.stemShareStart < 0 || w.luck.stemShareStart > 1 || w.luck.stemShareEnd < 0 || w.luck.stemShareEnd > 1) {
    errors.push("weights.luck stem shares must lie in [0, 1]");
  }
  const pr = p.propagation;
  if (!(pr.damping > 0 && pr.damping <= 1)) errors.push("propagation.damping must be in (0, 1]");
  if (!Number.isInteger(pr.maxRounds) || pr.maxRounds < 1) errors.push("propagation.maxRounds must be an integer ≥ 1");
  if (!(pr.outflowCap > 0 && pr.outflowCap <= 1)) errors.push("propagation.outflowCap must be in (0, 1]");
  if (!(pr.inflowDamageCap > 0 && pr.inflowDamageCap <= 1)) errors.push("propagation.inflowDamageCap must be in (0, 1]");
  if (!(pr.shengEfficiency > 0 && pr.shengEfficiency <= 1)) errors.push("propagation.shengEfficiency must be in (0, 1]");
  if (pr.keCost < 0) errors.push("propagation.keCost must be ≥ 0");
  if (pr.tongdangBeta < 0) errors.push("propagation.tongdangBeta must be ≥ 0");
  if (errors.length > 0) throw new RangeError(`Invalid wuxing params:\n- ${errors.join("\n- ")}`);
  return p;
}

/** Small stable fingerprint (FNV-1a over canonical JSON) so a saved result can say which params made it. */
export function paramsFingerprint(p: WuxingParams): string {
  const canon = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
    if (v !== null && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
    }
    return JSON.stringify(v);
  };
  let h = 0x811c9dc5;
  for (const ch of canon(p)) {
    h ^= ch.codePointAt(0) as number;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
