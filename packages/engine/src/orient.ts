// Step 6: 八綱 / 六邪 first impression (SOP §8.2) — ROUTING, a CONSISTENCY check and an explanation only. The final 八綱 scalars come from the panel
// (§10.4) and never from this step. The sign lists are knowledge-base data (data/diagnosis/orientation.json).
import type { KnowledgeBase } from "@tcm/kb";
import type { BagangScalars } from "./panel.ts";
import type { Normalized } from "./normalize.ts";
import type { AssessContext } from "./types.ts";

export type Channel = "external" | "internal";
export type ExteriorKind = "exterior" | "half-exterior" | "interior";
export type Lean = "cold" | "heat" | "neutral";
export type DeficiencyLean = "deficiency" | "excess" | "neutral";

export interface Orientation {
  /** SOP §9.1: an acute course with a new chill, fever, sore throat, blocked nose or cough → the external channel; otherwise internal. */
  readonly channel: Channel;
  readonly exterior: ExteriorKind;
  readonly coldHeat: { readonly cold: readonly string[]; readonly heat: readonly string[]; readonly lean: Lean };
  readonly deficiencyExcess: { readonly deficiency: readonly string[]; readonly excess: readonly string[]; readonly lean: DeficiencyLean };
}

const hits = (signs: readonly string[], present: ReadonlySet<string>): string[] => signs.filter((s) => present.has(s));

export function orient(kb: KnowledgeBase, n: Pick<Normalized, "present">, context: AssessContext | undefined): Orientation {
  const o = kb.orientation;
  const acute = context?.course === "acute";
  const channel: Channel = acute && o.external_triggers.some((s) => n.present.has(s)) ? "external" : "internal";

  let exterior: ExteriorKind = "interior";
  if (acute && n.present.has(o.exterior.required) && o.exterior.supporting.some((s) => n.present.has(s))) exterior = "exterior";
  else if (o.exterior.half.some((group) => group.every((s) => n.present.has(s)))) exterior = "half-exterior";

  const cold = hits(o.cold_signs, n.present), heat = hits(o.heat_signs, n.present);
  const deficiency = hits(o.deficiency_signs, n.present), excess = hits(o.excess_signs, n.present);
  const m = o.lean_margin;
  return {
    channel, exterior,
    coldHeat: { cold, heat, lean: cold.length - heat.length >= m ? "cold" : heat.length - cold.length >= m ? "heat" : "neutral" },
    deficiencyExcess: { deficiency, excess, lean: deficiency.length - excess.length >= m ? "deficiency" : excess.length - deficiency.length >= m ? "excess" : "neutral" },
  };
}

export interface ConsistencyFlag {
  readonly axis: "cold-heat" | "deficiency-excess";
  /** What the signs suggested and what the panel says: the explanation points out 寒熱真假 / 虛實真假 for the practitioner. */
  readonly signs: Lean | DeficiencyLean;
  readonly panel: "cold" | "heat" | "deficiency" | "excess";
}

/** Compare the first impression with the 八綱 derived from the panel (threshold: the panel's axis threshold). Disagreement is reported, never resolved. */
export function checkConsistency(kb: KnowledgeBase, o: Orientation, b: BagangScalars): ConsistencyFlag[] {
  const t = kb.params.panel.bagang.yin_yang_axis_threshold;
  const flags: ConsistencyFlag[] = [];
  if (o.coldHeat.lean === "cold" && b.coldHeat > t) flags.push({ axis: "cold-heat", signs: "cold", panel: "heat" });
  if (o.coldHeat.lean === "heat" && b.coldHeat < -t) flags.push({ axis: "cold-heat", signs: "heat", panel: "cold" });
  if (o.deficiencyExcess.lean === "deficiency" && b.deficiencyExcess > t) flags.push({ axis: "deficiency-excess", signs: "deficiency", panel: "excess" });
  if (o.deficiencyExcess.lean === "excess" && b.deficiencyExcess < -t) flags.push({ axis: "deficiency-excess", signs: "excess", panel: "deficiency" });
  return flags;
}
