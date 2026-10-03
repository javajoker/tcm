/**
 * L3 — generation/restraint propagation (生克傳導): what remains of each carrier after the forces
 * interact. Multi-round SYNCHRONOUS iteration: every round computes all increments from the previous
 * round's complete state and applies them at once, so the result does not depend on carrier order.
 *
 * ## Three modelling decisions
 *
 * 1. 生 is a FLOW, not an addition. 木 gives part of its weight to 火 (W木 −= F; W火 += η·F, η = 0.85);
 *    the (1−η) is transfer loss. Generation is therefore (nearly) mass-conserving and cannot explode.
 * 2. 克 is DESTRUCTION, not transfer. 金 克 木 removes weight from 木 and costs 金 (keCost = 0.30).
 *    Both sides shrink, so total mass is strictly non-increasing.
 * 3. Same-element support is RESISTANCE, not addition. Adding points between same-element carriers
 *    is positive feedback (≈ ×4.7 after 20 rounds) and lets "how many of one kind" dominate. Support
 *    is instead a damper on incoming 克:   resistance_j = 1 / (1 + β · S_j / M),
 *    S_j = Σ_{a≠j, same element} W_a · Dist(a, j).   A stem's root is simply a same-element carrier at
 *    distance 1.00 in the same pillar, so rooting is covered with no extra mechanism.
 *
 * ## Rounds are an interaction depth, not a convergence control
 *
 * Every increment is proportional to W, so one round is the linear map W ← (I + λA)W. Iterating to
 * convergence is power iteration: it forgets the initial weights and leaves only the matrix's
 * dominant eigenvector — washing out the month-command amplification that L1 worked to build. The
 * round count (default 3) is therefore a calibration parameter like the kernel coefficients.
 *
 * ## Normalisation by target set (essential)
 *
 * A carrier's outflow RATE is a property of the giver; several receivers share it, they do not
 * multiply it. Rate = kernel · max_j(coupling_j); flow to j = total · coupling_j / Σ coupling.
 * Summing per target instead makes outflow proportional to the NUMBER of targets, which is an
 * artefact of hidden-stem bookkeeping (火 has four 土 carriers to feed, 木 has one) — measured median
 * outflow 63 %, max 102 %, every carrier hitting the cap and the whole chart collapsing.
 */

import { actingRelation } from "./ganzhi.ts";
import type { Element, Polarity } from "./types.ts";
import { cloneCarriers, type Carrier, type PillarKind } from "./weights.ts";
import { DEFAULT_PARAMS, type WuxingParams } from "./params.ts";

type PropagationParams = WuxingParams["propagation"];

export interface FlowRecord {
  readonly from: string;
  readonly to: string;
  readonly kind: "sheng" | "ke";
  /** Cumulative over all rounds (for 克, the destroyed amount, positive). */
  totalAmount: number;
}

export interface PropagationResult {
  /** Final weights, re-normalised to the incoming total (the shape is kept; scale loss is `vitality`). */
  readonly carriers: readonly Carrier[];
  readonly rawTotal: number;
  /** Per-round retention (geometric mean). High → flowing/generating, low → mutual restraint consuming force. */
  readonly vitality: number;
  readonly cumulativeRetention: number;
  readonly convergence: {
    readonly converged: boolean;
    readonly rounds: number;
    readonly finalResidual: number;
  };
  readonly byElement: Readonly<Record<Element, number>>;
  readonly byPolarity: Readonly<Record<Polarity, number>>;
  readonly flows: readonly FlowRecord[];
}

// ── distance ─────────────────────────────────────────────────────────────

const NATAL_ORDER: Partial<Record<PillarKind, number>> = { year: 0, month: 1, day: 2, hour: 3 };

/**
 * Attenuation of a force from one carrier to another. External layers are deliberately ASYMMETRIC:
 * the environment acts on the person more strongly than the person acts on the environment
 * (大運 → natal 0.80, natal → 大運 0.60; 流年 → natal 0.70, natal → 流年 0.50). A strong person
 * suffers less in a bad year but does not turn a bad year into a good one.
 */
export function propagationDistance(from: Carrier, to: Carrier, p: PropagationParams): number {
  const pa = from.pillar;
  const pb = to.pillar;
  const ia = NATAL_ORDER[pa];
  const ib = NATAL_ORDER[pb];

  if (ia === undefined || ib === undefined) {
    const e = p.external;
    let base: number;
    if (pa === "luck" && pb === "annual") base = e.luckToAnnual;
    else if (pa === "annual" && pb === "luck") base = e.luckToAnnual;
    else if (pa === "luck") base = e.luckToNatal;
    else if (pa === "annual") base = e.annualToNatal;
    else if (pb === "luck") base = e.natalToLuck;
    else if (pb === "annual") base = e.natalToAnnual;
    else base = p.distance.adjacent;
    if (pa === "annual" && to.isDayMaster) base *= e.annualToDayMasterBonus;
    return base;
  }

  if (pa === pb) {
    if (from.layer !== to.layer) return p.distance.samePillar;           // stem ↔ own hidden stems (rooting)
    if (from.layer === "branch") return p.distance.sameBranchHidden;     // hidden stems of one branch
    return p.distance.samePillar;
  }
  const gap = Math.abs(ia - ib);
  const base = gap === 1 ? p.distance.adjacent : gap === 2 ? p.distance.gap1 : p.distance.gap2;
  return from.layer === to.layer ? base : base * p.distance.crossLayerFactor;   // cross-layer needs rooting
}

// ── interaction coefficients ──────────────────────────────────────────────

function polarityCoef(from: Carrier, to: Carrier, rel: "生" | "克", p: PropagationParams): number {
  const same = from.polarity === to.polarity;
  // Asymmetry: 生 is stronger between OPPOSITE polarities, 克 between the SAME polarity.
  if (rel === "生") return same ? p.polarity.shengSame : p.polarity.shengCross;
  return same ? p.polarity.keSame : p.polarity.keCross;
}

function resistanceMap(carriers: readonly Carrier[], totalMass: number, p: PropagationParams): Map<string, number> {
  const out = new Map<string, number>();
  const M = Math.max(totalMass, 1e-12);
  for (const j of carriers) {
    let S = 0;
    for (const a of carriers) {
      if (a.id === j.id || a.element !== j.element) continue;
      S += a.weight * propagationDistance(a, j, p);
    }
    out.set(j.id, 1 / (1 + p.tongdangBeta * (S / M)));
  }
  return out;
}

interface Effect {
  readonly toIndex: number;
  cost: number;      // paid by the giver (positive)
  gainToJ: number;   // received by the target (+ for 生, − for 克)
  readonly kind: "sheng" | "ke";
}

export function propagate(input: readonly Carrier[], params: PropagationParams = DEFAULT_PARAMS.propagation): PropagationResult {
  const p = params;
  const carriers = cloneCarriers(input);
  const n = carriers.length;
  const M0 = carriers.reduce((a, c) => a + c.weight, 0);
  const flowMap = new Map<string, FlowRecord>();

  let converged = false;
  let residual = Number.NaN;
  let round = 0;

  for (; round < p.maxRounds; round++) {
    const M = carriers.reduce((a, c) => a + c.weight, 0);
    if (M <= 0) { converged = true; residual = 0; break; }

    const resistance = resistanceMap(carriers, M, p);
    const outgoing: Effect[][] = Array.from({ length: n }, () => []);

    for (let i = 0; i < n; i++) {
      const ci = carriers[i] as Carrier;
      if (ci.weight <= 0) continue;

      // Group targets by relation. Same-element carriers do not act here (they only contribute resistance).
      const buckets: Record<"生" | "克", { j: number; w: number }[]> = { 生: [], 克: [] };
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const cj = carriers[j] as Carrier;
        const rel = actingRelation(ci.element, cj.element);
        if (rel === "無" || rel === "同") continue;   // 無: the (j,i) visit accounts for it
        buckets[rel].push({ j, w: polarityCoef(ci, cj, rel, p) * propagationDistance(ci, cj, p) });
      }

      for (const rel of ["生", "克"] as const) {
        const ts = buckets[rel];
        if (ts.length === 0) continue;
        const sumW = ts.reduce((a, t) => a + t.w, 0);
        const maxW = ts.reduce((a, t) => Math.max(a, t.w), 0);
        if (sumW <= 0 || maxW <= 0) continue;

        const kernel = rel === "生" ? p.kernel.sheng : p.kernel.ke;
        const totalOut = ci.weight * ci.activity * kernel * maxW;          // rate set by the strongest coupling
        for (const t of ts) {
          const B = totalOut * (t.w / sumW);                                // shared by coupling strength
          if (B <= 0) continue;
          if (rel === "生") {
            outgoing[i]?.push({ toIndex: t.j, cost: B, gainToJ: p.shengEfficiency * B, kind: "sheng" });
          } else {
            const damage = B * (resistance.get((carriers[t.j] as Carrier).id) ?? 1);
            outgoing[i]?.push({ toIndex: t.j, cost: damage * p.keCost, gainToJ: -damage, kind: "ke" });
          }
        }
      }
    }

    // Outflow cap. Scaling must hit cost AND gain together, or mass is created/destroyed from nothing.
    for (let i = 0; i < n; i++) {
      const eff = outgoing[i] as Effect[];
      const O = eff.reduce((a, e) => a + e.cost, 0);
      const cap = p.outflowCap * (carriers[i] as Carrier).weight;
      if (O > cap && O > 0) {
        const s = cap / O;
        for (const e of eff) { e.cost *= s; e.gainToJ *= s; }
      }
    }

    // Inflow-damage cap, the mirror image: without it one big carrier's whole restraint can land on
    // a single tiny target and evaporate it in one round. Restraint should weaken, not vaporise.
    const incomingDamage = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (const e of outgoing[i] as Effect[]) if (e.kind === "ke") incomingDamage[e.toIndex] = (incomingDamage[e.toIndex] as number) - e.gainToJ;
    }
    for (let j = 0; j < n; j++) {
      const dmg = incomingDamage[j] as number;
      const cap = p.inflowDamageCap * (carriers[j] as Carrier).weight;
      if (dmg > cap && dmg > 0) {
        const s2 = cap / dmg;
        for (let i = 0; i < n; i++) {
          for (const e of outgoing[i] as Effect[]) {
            if (e.kind === "ke" && e.toIndex === j) { e.cost *= s2; e.gainToJ *= s2; }
          }
        }
      }
    }

    const delta = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (const e of outgoing[i] as Effect[]) {
        delta[i] = (delta[i] as number) - e.cost;
        delta[e.toIndex] = (delta[e.toIndex] as number) + e.gainToJ;
        const key = `${(carriers[i] as Carrier).id}>${(carriers[e.toIndex] as Carrier).id}:${e.kind}`;
        const amount = (e.kind === "sheng" ? e.gainToJ : -e.gainToJ) * p.damping;
        const rec = flowMap.get(key);
        if (rec === undefined) {
          flowMap.set(key, { from: (carriers[i] as Carrier).id, to: (carriers[e.toIndex] as Carrier).id, kind: e.kind, totalAmount: amount });
        } else rec.totalAmount += amount;
      }
    }

    const before = carriers.map((c) => c.weight);
    for (let i = 0; i < n; i++) {
      const c = carriers[i] as Carrier;
      c.weight = Math.max(p.floor, (before[i] as number) + p.damping * (delta[i] as number));
    }
    const afterTotal = carriers.reduce((a, c) => a + c.weight, 0);

    // Residual on the NORMALISED distribution: the shape of the force structure matters, not the scale.
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      const pOld = M > 0 ? (before[i] as number) / M : 0;
      const pNew = afterTotal > 0 ? (carriers[i] as Carrier).weight / afterTotal : 0;
      maxDelta = Math.max(maxDelta, Math.abs(pNew - pOld));
    }
    residual = maxDelta;
    if (maxDelta < p.epsilon) { converged = true; round += 1; break; }
  }

  const rawTotal = carriers.reduce((a, c) => a + c.weight, 0);
  // vitality is the per-round retention (geometric mean), NOT the cumulative one: cumulative ≈ ρ^rounds
  // changes arbitrarily with the round count and is not a property of the chart.
  const vitality = M0 > 0 && round > 0 ? Math.pow(rawTotal / M0, 1 / round) : M0 > 0 ? rawTotal / M0 : 0;
  const cumulativeRetention = M0 > 0 ? rawTotal / M0 : 0;

  // Shape back to the incoming total; the scale change is carried by `vitality`.
  if (rawTotal > 0 && M0 > 0) {
    const k = M0 / rawTotal;
    for (const c of carriers) c.weight *= k;
  }

  const byElement: Record<Element, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const byPolarity: Record<Polarity, number> = { 陽: 0, 陰: 0 };
  for (const c of carriers) { byElement[c.element] += c.weight; byPolarity[c.polarity] += c.weight; }

  return {
    carriers, rawTotal, vitality, cumulativeRetention,
    convergence: { converged, rounds: round, finalResidual: residual },
    byElement, byPolarity,
    flows: [...flowMap.values()].sort((a, b) => b.totalAmount - a.totalAmount),
  };
}
