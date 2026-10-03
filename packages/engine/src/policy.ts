// Step 0 (and the state re-check after step 9): the scope policy (SOP §0.2, §2; safety policy §2; tech spec §6.2).
// Pure and total: a table-driven lookup in the active profile of the knowledge base. Level = the MOST RESTRICTIVE matched cell,
// notice = the MOST SEVERE, flow = "continue", always.
import type { KnowledgeBase, Level, Notice } from "@tcm/kb";
import type { MatchedCell, MedicationClass, NoticeId, NoticeRequest, Policy, PolicyFacts, PolicyFeatures } from "./types.ts";

const LEVEL_RANK: Readonly<Record<Level, number>> = { L0: 0, L1: 1, L2: 2, L3: 3 };
const NOTICE_RANK: Readonly<Record<Notice, number>> = { none: 0, inline: 1, blocking_ack: 2 };

/** Red-flag items of scope level C that mean "serious chronic disease" (the others of level C are populations). */
export const SERIOUS_RED_FLAGS: ReadonlySet<string> = new Set([
  "RF_C_CANCER_TREATMENT", "RF_C_KIDNEY", "RF_C_LIVER", "RF_C_TRANSPLANT", "RF_C_PSYCHIATRIC", "RF_C_CARDIOPULMONARY",
]);

const NOTICE_OF_CELL: Readonly<Record<string, NoticeId>> = {
  "condition.red_flag_A": "N-A", "condition.red_flag_B": "N-B", "condition.serious_chronic_disease": "N-SERIOUS",
  "condition.on_anticoagulant": "N-MED", "condition.on_other_interacting_medication": "N-MED", "condition.allergy_match": "N-ALLERGY",
  "condition.acute_external_symptoms": "N-ACUTE",
  "population.minor_under_18": "N-MINOR", "population.pregnant": "N-PREG", "population.lactating": "N-LACT", "population.elderly_65_plus": "N-ELDERLY",
  "state.low_confidence": "N-LOWCONF", "state.insufficient_information": "N-LOWCONF", "state.conflicting_data": "N-CONFLICT",
};

export interface RedFlagSummary {
  readonly A: readonly string[];
  readonly B: readonly string[];
  readonly C: readonly string[];
}

export function summariseRedFlags(kb: KnowledgeBase, flags: ReadonlySet<string>): RedFlagSummary {
  const out: { A: string[]; B: string[]; C: string[] } = { A: [], B: [], C: [] };
  for (const f of kb.redFlags) if (flags.has(f.id)) out[f.level].push(f.id);
  return out;
}

/** Which dimension cells match these facts, as `dimension.key` strings (in a fixed order). */
export function matchedKeys(kb: KnowledgeBase, facts: PolicyFacts): { dimension: "population" | "condition" | "state"; key: string }[] {
  const rf = summariseRedFlags(kb, facts.redFlags);
  const keys: { dimension: "population" | "condition" | "state"; key: string }[] = [];
  const add = (dimension: "population" | "condition" | "state", key: string, on: boolean): void => { if (on) keys.push({ dimension, key }); };

  add("population", "adult", facts.ageYears >= 18);
  add("population", "elderly_65_plus", facts.ageYears >= 65);
  add("population", "minor_under_18", facts.ageYears < 18 || facts.redFlags.has("RF_C_MINOR"));
  add("population", "pregnant", facts.pregnant || facts.redFlags.has("RF_C_PREGNANT"));
  add("population", "lactating", facts.lactating || facts.redFlags.has("RF_C_LACTATING"));

  add("condition", "red_flag_A", rf.A.length > 0);
  add("condition", "red_flag_B", rf.B.length > 0);
  add("condition", "serious_chronic_disease", facts.seriousChronic || rf.C.some((id) => SERIOUS_RED_FLAGS.has(id)));
  add("condition", "on_anticoagulant", facts.medications.includes("anticoagulant"));
  add("condition", "on_other_interacting_medication", facts.medications.some((m: MedicationClass) => m !== "anticoagulant"));
  add("condition", "allergy_match", facts.allergyMatch);
  add("condition", "acute_external_symptoms", facts.acuteExternal);

  add("state", "low_confidence", facts.states.lowConfidence);
  add("state", "insufficient_information", facts.states.insufficientInformation);
  add("state", "conflicting_data", facts.states.conflictingData);
  return keys;
}

function featuresFor(kb: KnowledgeBase, level: Level): PolicyFeatures {
  const f = kb.config.profile.features;
  const at = (l: Level): boolean => LEVEL_RANK[level] >= LEVEL_RANK[l];
  const tiers: ("A" | "B" | "C")[] = [];
  if (at("L1")) tiers.push("A");
  if (at("L2")) tiers.push("B");
  if (at("L3") && f.show_tier_c) tiers.push("C");
  return {
    formulas: at("L1"),
    tiers,
    dosage: at("L3") && f.show_dosage_reference,
    modification: at("L2") && f.show_formula_modification,
    herbWeights: at("L2") && f.show_herb_weights,
    acupoints: at("L1") && f.show_acupoints,
    diet: at("L1") && f.show_diet,
  };
}

function noticeRequests(kb: KnowledgeBase, cells: readonly MatchedCell[], facts: PolicyFacts): NoticeRequest[] {
  const rf = summariseRedFlags(kb, facts.redFlags);
  const out: NoticeRequest[] = [];
  for (const c of cells) {
    if (c.notice === "none") continue;
    const id = NOTICE_OF_CELL[`${c.dimension}.${c.key}`];
    if (!id) continue;
    const reasons =
      c.key === "red_flag_A" ? rf.A : c.key === "red_flag_B" ? rf.B : c.key === "serious_chronic_disease" ? rf.C.filter((r) => SERIOUS_RED_FLAGS.has(r))
      : id === "N-MED" ? facts.medications : [];
    out.push({ id, kind: c.notice, cell: { dimension: c.dimension, key: c.key }, reasons: [...reasons] });
  }
  // merge duplicates of one notice id (e.g. low confidence + insufficient information, anticoagulant + other medication)
  const merged = new Map<string, NoticeRequest>();
  for (const n of out) {
    const prev = merged.get(n.id);
    if (!prev) merged.set(n.id, n);
    else merged.set(n.id, { ...prev, kind: prev.kind === "blocking_ack" || n.kind === "blocking_ack" ? "blocking_ack" : "inline", reasons: [...new Set([...prev.reasons, ...n.reasons])] });
  }
  const order = (n: NoticeRequest): number => (n.kind === "blocking_ack" ? 0 : 1) * 100 + (n.id === "N-A" ? 0 : n.id === "N-B" ? 1 : 2);
  return [...merged.values()].sort((a, b) => order(a) - order(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function resolvePolicy(kb: KnowledgeBase, facts: PolicyFacts): Policy {
  const { profile } = kb.config;
  const cells: MatchedCell[] = matchedKeys(kb, facts).map(({ dimension, key }) => {
    const cell = (profile[dimension] as Record<string, { level: Level; notice: Notice }>)[key];
    if (!cell) throw new Error(`profile ${kb.config.profileName} has no ${dimension}.${key}`);   // the build guarantees every key
    return { dimension, key, level: cell.level, notice: cell.notice };
  });
  // a person who matches nothing (age < 0 …) cannot occur: age is validated upstream; fall back to the strictest cell to stay safe
  const level = cells.length ? cells.reduce<Level>((m, c) => (LEVEL_RANK[c.level] < LEVEL_RANK[m] ? c.level : m), "L3") : "L0";
  const notice = cells.reduce<Notice>((m, c) => (NOTICE_RANK[c.notice] > NOTICE_RANK[m] ? c.notice : m), "none");
  const rf = summariseRedFlags(kb, facts.redFlags);
  return {
    profile: kb.config.profileName,
    level,
    notice,
    matched: cells,
    features: featuresFor(kb, level),
    safetyEnforcement: profile.safety_enforcement,
    flow: "continue",
    emergencyResources: rf.A.length > 0 || rf.B.length > 0,
    notices: noticeRequests(kb, cells, facts),
  };
}

/** Facts for a person with no risk factors: a healthy adult. */
export function baselineFacts(ageYears = 35): PolicyFacts {
  return {
    ageYears, pregnant: false, lactating: false, redFlags: new Set(), seriousChronic: false, medications: [], allergyMatch: false, acuteExternal: false,
    states: { lowConfidence: false, insufficientInformation: false, conflictingData: false },
  };
}
