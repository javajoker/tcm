// Step 8: panel synthesis (SOP §10). The OBSERVED panel O comes from the pattern scores only (noisy-OR projection); the two offsets,
// the 八綱 scalars and the transmission are derived from it. The reference panel is context: it never changes O or the primary offset
// (tech spec §7.3 rule 1, SOP §6.3).
import { analyzeOffset, ELEMENTS, FU_OF, transmission, ZANG_OF, type Element, type ElementVector, type ReferencePanel, type TransmissionResult } from "@tcm/wuxing";
import type { KnowledgeBase } from "@tcm/kb";
import type { ScoredPattern } from "./patterns.ts";

export type Alignment = "aligned" | "opposed" | "neutral";
export type YinYang = "yin" | "yang" | "mixed" | "balanced";

export interface Projection { readonly patternId: string; readonly pct: number; readonly value: number }

export interface BagangScalars {
  /** −1 cold … +1 heat */
  readonly coldHeat: number;
  /** −1 deficiency … +1 excess */
  readonly deficiencyExcess: number;
  /** 0 … 1 */
  readonly exterior: number;
  readonly yinYang: YinYang;
}

export interface PanelResult {
  /** The observed panel: panel dimension → deviation from the average healthy person (zero). Only non-zero dimensions, sorted by key. */
  readonly observed: Readonly<Record<string, number>>;
  /** Where each observed value came from: the projections of the patterns that reached the floor (before noisy-OR saturation). */
  readonly projections: Readonly<Record<string, readonly Projection[]>>;
  /** Five-phase function W(e) = zang·mean(qi, yang of the 臟) + fu·mean(qi, yang of the 腑). */
  readonly wuxingFunction: Readonly<ElementVector>;
  readonly bagang: BagangScalars;
  /** PRIMARY offset: observed − 0. Always exactly W. Drives pattern differentiation, treatment direction and formula choice. */
  readonly offsetPopulation: Readonly<ElementVector>;
  /** SECONDARY offset: observed − reference (null without a reference). Context only. */
  readonly offsetPersonal: Readonly<ElementVector> | null;
  readonly alignment: Readonly<Record<Element, Alignment>> | null;
  /** Tendencies of the observed deviation to spread through 生克乘侮 / 母子 (explanation and which organ to protect; never added to O). */
  readonly transmission: TransmissionResult;
}

/** SOP §10.2: each pattern with Pct ≥ floor projects degree·unit onto the panel; per dimension and sign the projections saturate by noisy-OR. */
export function observedPanel(kb: KnowledgeBase, scored: readonly ScoredPattern[]): { observed: Record<string, number>; projections: Record<string, Projection[]> } {
  const cfg = kb.params.panel;
  const top = cfg.degree_max;
  const pct = new Map(scored.map((s) => [s.id, s.pct] as const));
  const pos = new Map<string, number[]>(), neg = new Map<string, number[]>();
  const projections: Record<string, Projection[]> = {};
  for (const p of kb.patterns) {                                   // data order: the same accumulation order as the oracle
    const v = pct.get(p.id) ?? 0;
    if (v < cfg.noisy_or_floor) continue;
    const degree = (top * v) / 100;
    for (const [dim, unit] of Object.entries(p.panel_projection_per_degree)) {
      const x = degree * unit;
      const bucket = x > 0 ? pos : neg;
      let list = bucket.get(dim);
      if (!list) bucket.set(dim, (list = []));
      list.push(Math.abs(x));
      (projections[dim] ??= []).push({ patternId: p.id, pct: v, value: x });
    }
  }
  const observed: Record<string, number> = {};
  const dims = [...new Set([...pos.keys(), ...neg.keys()])].sort();
  const saturate = (xs: number[] | undefined): number => {
    if (!xs || xs.length === 0) return 0;
    let prod = 1;
    for (const x of xs) prod *= 1 - Math.min(x, top) / top;
    return top * (1 - prod);
  };
  for (const dim of dims) observed[dim] = saturate(pos.get(dim)) - saturate(neg.get(dim));
  return { observed, projections };
}

export function wuxingFunction(kb: KnowledgeBase, panel: Readonly<Record<string, number>>): ElementVector {
  const c = kb.params.panel.wuxing_function;
  const w = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 } as ElementVector;
  for (const e of ELEMENTS) {
    const z = ZANG_OF[e], f = FU_OF[e];
    const zq = ((panel[`${z}.qi`] ?? 0) + (panel[`${z}.yang`] ?? 0)) / 2;
    const fq = ((panel[`${f}.qi`] ?? 0) + (panel[`${f}.yang`] ?? 0)) / 2;
    w[e] = c.zang * zq + c.fu * fq;
  }
  return w;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** SOP §10.4 — the three scalars follow the oracle exactly (including that product values count in the excess sum whatever their sign). The 營衛 block counts in
 * the deficiency–excess axis (PM-52): a weak 衛 or 營 and open pores as deficiency, closed pores and a strong 營 as excess — 表虛 and 表實. */
export function bagang(kb: KnowledgeBase, panel: Readonly<Record<string, number>>): BagangScalars {
  const c = kb.params.panel.bagang;
  const channels = new Set(["qi", "blood", "yin", "yang", "stasis"]);
  const fourChannels = new Set(["qi", "blood", "yin", "yang"]);
  let yangDef = 0, yinDef = 0, excess = 0, deficit = 0;
  for (const [k, v] of Object.entries(panel)) {
    if (k.endsWith(".yang") && v < 0) yangDef += -v;
    if (k.endsWith(".yin") && v < 0) yinDef += -v;
    const parts = k.split(".");
    if (((parts[1] !== undefined && channels.has(parts[1])) && v > 0) || k.startsWith("product.")) excess += v;
    if (fourChannels.has(parts[parts.length - 1]!) && v < 0) deficit += -v;
    if (parts[0] === "yingwei") { if (v > 0) excess += v; else deficit += -v; }
  }
  const heat = (panel["liuxie.火"] ?? 0) + (panel["liuxie.暑"] ?? 0) - (panel["liuxie.寒"] ?? 0) - c.yang_deficit_weight * yangDef + c.yin_deficit_weight * yinDef;
  const coldHeat = clamp(heat / c.heat_divisor, -1, 1);
  const deficiencyExcess = clamp((excess - deficit) / c.excess_divisor, -1, 1);
  const exterior = clamp((panel["bagang.exterior"] ?? 0) / c.exterior_divisor, 0, 1);
  return { coldHeat, deficiencyExcess, exterior, yinYang: yinYangOf(coldHeat, deficiencyExcess, c.yin_yang_axis_threshold) };
}

/** 陰陽 summary of the other axes: hot and not deficient → yang; cold and not excess, or hot with deficiency (陰虛內熱) → yin; cold with excess (寒實) → mixed. */
export function yinYangOf(coldHeat: number, deficiencyExcess: number, t: number): YinYang {
  const hot = coldHeat > t, cold = coldHeat < -t, excess = deficiencyExcess > t, deficient = deficiencyExcess < -t;
  if (!hot && !cold && !excess && !deficient) return "balanced";
  if (hot) return deficient ? "yin" : "yang";
  if (cold) return excess ? "mixed" : "yin";
  return excess ? "yang" : "yin";
}

export function synthesizePanel(kb: KnowledgeBase, scored: readonly ScoredPattern[], reference: Pick<ReferencePanel, "total"> | null): PanelResult {
  const { observed, projections } = observedPanel(kb, scored);
  const w = wuxingFunction(kb, observed);
  const off = reference ? analyzeOffset(w, reference) : null;
  return {
    observed, projections, wuxingFunction: w, bagang: bagang(kb, observed),
    offsetPopulation: { ...w },                               // PRIMARY: observed − 0, by construction independent of the reference
    offsetPersonal: off ? off.offsetPersonal : null,
    alignment: off ? off.alignment : null,
    transmission: transmission(w),
  };
}
