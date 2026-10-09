// Step 11: the safety filter (SOP §13; safety policy §6). Table-driven by data/safety/rules.json: a rule FIRES for a candidate item when its
// `applies_to` matches the person/policy AND its `target` matches the item. `hard` rules remove the item under `suppress_hard` (release) and
// annotate under `annotate_only` (dev); `soft` rules always annotate. Nothing is ever dropped silently: a removed item is listed with its reason.
import type { Formula, KnowledgeBase, SafetyRule } from "@tcm/kb";
import type { BagangScalars } from "./panel.ts";
import type { MedicationClass, Policy } from "./types.ts";

export interface SafetySubject {
  readonly ageYears: number;
  readonly pregnant: boolean;
  readonly lactating: boolean;
  readonly medications: readonly MedicationClass[];
  /** Free names the user listed (herbs or foods); matched against the names of the candidates. */
  readonly allergies: readonly string[];
  /** Primary constitution id, if the quiz was done. */
  readonly constitution: string | null;
}

export type Candidate =
  | { readonly kind: "formula"; readonly formula: Formula }
  /** A herb proposed by the residual 加減 for `formula`. */
  | { readonly kind: "herb"; readonly herbId: string; readonly formula: Formula }
  | { readonly kind: "food"; readonly name: string }
  | { readonly kind: "acupoint"; readonly name: string };

export interface FiredRule { readonly ruleId: string; readonly severity: "hard" | "soft"; readonly message: { readonly "zh-Hant": string; readonly en: string }; readonly citation?: string }

export interface SafetyItem {
  readonly candidate: Candidate;
  readonly id: string;
  readonly fired: readonly FiredRule[];
  /** True when the item was removed (suppress_hard and a hard rule fired). */
  readonly removed: boolean;
}

export interface SuppressedItem {
  readonly kind: Candidate["kind"];
  readonly id: string;
  /** "rule": removed by a safety rule; "level": not allowed at the effective output level (tier or feature). */
  readonly reason: "rule" | "level";
  readonly ruleId: string | null;
  readonly message: { readonly "zh-Hant": string; readonly en: string } | null;
}

export interface SafetyReport {
  readonly items: readonly SafetyItem[];
  /** Candidates that remain (annotated ones included), in input order. */
  readonly kept: readonly SafetyItem[];
  readonly suppressed: readonly SuppressedItem[];
  /** An allergy match was found on at least one candidate → the `allergy_match` condition applies. */
  readonly allergyMatch: boolean;
  /** Allergy entries that match nothing the knowledge base can name: the app says "we cannot confirm this" (N-ALLERGY-UNKNOWN). */
  readonly unmatchedAllergies: readonly string[];
}

export interface SafetyInput {
  readonly subject: SafetySubject;
  readonly policy: Policy;
  /** The panel-derived 八綱 (for the pattern-direction conflicts). */
  readonly bagang: Pick<BagangScalars, "coldHeat" | "deficiencyExcess">;
  readonly candidates: readonly Candidate[];
}

// ── descriptors ─────────────────────────────────────────────────────────────

interface Descriptor {
  readonly id: string;
  readonly formula: Formula | null;
  readonly pregnancy: string | null;
  readonly interactions: readonly string[];
  /** Names an allergy can match (zh-Hant, English, Latin; lower-case for the Latin scripts). */
  readonly names: readonly string[];
  /** The herbs it is or holds, by id: what the rows of 十八反 and 十九畏 are matched against. */
  readonly herbIds: readonly string[];
}

function herbNameSet(kb: KnowledgeBase, herbId: string): string[] {
  const n = kb.herbName(herbId);
  const h = kb.herbs?.get(herbId);
  return [n?.name["zh-Hant"], n?.name.en?.toLowerCase(), n?.latin?.toLowerCase(), ...(h?.aliases ?? [])].filter((x): x is string => !!x);
}

function describe(kb: KnowledgeBase, c: Candidate): Descriptor {
  switch (c.kind) {
    case "formula": {
      const herbs = c.formula.composition.map((x) => x.herb);
      // the herb records' names and the names the formula itself uses (芍藥 where the record says 白芍): both are names the person can see and type
      const hn = [...herbs.flatMap((id) => herbNameSet(kb, id)), ...c.formula.composition.map((x) => x.name)];
      return { id: c.formula.id, formula: c.formula, pregnancy: c.formula.pregnancy, interactions: c.formula.interactions, names: hn, herbIds: herbs };
    }
    case "herb": {
      const h = kb.herbs?.get(c.herbId);
      return { id: c.herbId, formula: c.formula, pregnancy: h?.pregnancy ?? null, interactions: h?.interactions ?? [], names: herbNameSet(kb, c.herbId), herbIds: [c.herbId] };
    }
    case "food": return { id: c.name, formula: null, pregnancy: null, interactions: [], names: [c.name], herbIds: [] };
    case "acupoint": return { id: c.name, formula: null, pregnancy: null, interactions: [], names: [], herbIds: [] };
  }
}

// ── formula nature (SOP §13.2 pattern-direction conflicts) ──────────────────

export interface FormulaNature { readonly warming: number; readonly cooling: number; readonly tonic: number; readonly attacking: number }

/** warming = −effect[liuxie.寒] + Σ yang gains · cooling = −effect[liuxie.火] · tonic = Σ qi/blood/yin/yang gains · attacking = −Σ negative effects on product.* and liuxie.* */
export function formulaNature(f: Pick<Formula, "panel_effect">): FormulaNature {
  const E = f.panel_effect;
  let yang = 0, tonic = 0, attacking = 0;
  for (const [k, v] of Object.entries(E)) {
    if (/\.(qi|blood|yin|yang)$/.test(k) && v > 0) tonic += v;
    if (k.endsWith(".yang") && v > 0) yang += v;
    if ((k.startsWith("product.") || k.startsWith("liuxie.")) && v < 0) attacking += -v;
  }
  return { warming: Math.max(0, -(E["liuxie.寒"] ?? 0)) + yang, cooling: Math.max(0, -(E["liuxie.火"] ?? 0)), tonic, attacking };
}

// ── incompatible pairs (十八反 / 十九畏) ────────────────────────────────────

/** Two herbs that one of the classical lists says not to combine: the list, its own names for them, and the two herbs (by id) in the list's order. */
export interface IncompatiblePair {
  readonly list: "十八反" | "十九畏";
  readonly names: readonly [string, string];
  readonly herbs: readonly [string, string];
}

/**
 * The pairs of 十八反 and 十九畏 among a composition's herbs. A name of a row stands for the herbs the knowledge base lists under it in that row (`herbs`: the herb,
 * its processed forms and parts, the synonyms of standard teaching, and the herbs whose own Pharmacopoeia caution names the other side), so the match is by id —
 * 芍藥 finds 白芍 and 赤芍, 細辛 does not find 燈盞細辛 — and a herb the table does not list is in no pair.
 */
export function incompatiblePairs(kb: KnowledgeBase, herbIds: readonly string[]): IncompatiblePair[] {
  const present = new Set(herbIds);
  const out: IncompatiblePair[] = [];
  const pair = (list: IncompatiblePair["list"], cover: Readonly<Record<string, readonly string[]>>, a: string, b: string): void => {
    for (const x of cover[a] ?? []) if (present.has(x)) for (const y of cover[b] ?? []) if (y !== x && present.has(y)) out.push({ list, names: [a, b], herbs: [x, y] });
  };
  const inc = kb.safety.incompatibilities;
  for (const row of inc.shibafan) for (const other of row.opposes) pair("十八反", row.herbs, row.herb, other);
  for (const p of inc.shijiuwei) pair("十九畏", p.herbs, p.a, p.b);
  return out;
}

// ── allergy ─────────────────────────────────────────────────────────────────

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * An allergy entry matches a name when it is equal to it or (for Chinese names of two or more characters) contained in it. `fold` (the knowledge base's
 * `foldName`) is applied to both sides first, so 人参 and 人參 are the same name whichever script the allergy was typed in; without it the comparison is
 * by the characters as they are.
 */
export function allergyMatches(allergy: string, names: readonly string[], fold: (text: string) => string = (t) => t): boolean {
  const a = norm(fold(allergy));
  if (a.length === 0) return false;
  return names.some((n) => {
    const m = norm(fold(n));
    return m === a || (/[一-鿿]/.test(a) && a.length >= 2 && m.includes(a));
  });
}

// ── evaluation ──────────────────────────────────────────────────────────────

function matchedKeys(policy: Policy, dimension: "population" | "condition" | "state"): Set<string> {
  return new Set(policy.matched.filter((c) => c.dimension === dimension).map((c) => c.key));
}

export function evaluateSafety(kb: KnowledgeBase, input: SafetyInput): SafetyReport {
  const { subject, policy, bagang } = input;
  const conf = kb.params.safety.conflict;
  const pop = matchedKeys(policy, "population"), cond = matchedKeys(policy, "condition"), state = matchedKeys(policy, "state");
  const suppress = policy.safetyEnforcement === "suppress_hard";
  const items: SafetyItem[] = [];
  const suppressed: SuppressedItem[] = [];
  let allergyMatch = false;

  // 1. the output level gates tiers and features before any rule runs; what it removes is listed too
  const gated: Candidate[] = [];
  for (const c of input.candidates) {
    const d = describe(kb, c);
    const blocked =
      (c.kind === "formula" && (!policy.features.formulas || !policy.features.tiers.includes(c.formula.tier))) ||
      (c.kind === "herb" && !policy.features.modification) ||
      (c.kind === "food" && !policy.features.diet) ||
      (c.kind === "acupoint" && !policy.features.acupoints);
    if (blocked) suppressed.push({ kind: c.kind, id: d.id, reason: "level", ruleId: null, message: null });
    else gated.push(c);
  }

  for (const c of gated) {
    const d = describe(kb, c);
    const allergyHit = subject.allergies.some((a) => allergyMatches(a, d.names, kb.foldName));
    if (allergyHit) allergyMatch = true;
    const nature = d.formula ? formulaNature(d.formula) : null;
    const fired: FiredRule[] = [];

    for (const rule of kb.safety.rules) {
      if ("output_level_max" in rule.target) continue;                          // a state rule: the policy already did it
      if (!appliesTo(rule, { pop, cond, state, subject, allergyHit })) continue;
      if (!targetHits(kb, rule, c, d, nature, bagang, conf, allergyHit)) continue;
      fired.push({ ruleId: rule.id, severity: rule.severity, message: rule.message, ...(rule.citation ? { citation: rule.citation } : {}) });
    }
    const removed = suppress && fired.some((f) => f.severity === "hard");
    items.push({ candidate: c, id: d.id, fired, removed });
    if (removed) {
      const rule = fired.find((f) => f.severity === "hard")!;
      suppressed.push({ kind: c.kind, id: d.id, reason: "rule", ruleId: rule.ruleId, message: rule.message });
    }
  }

  const known = knownNames(kb);
  const unmatched = subject.allergies.filter((a) => a.trim().length > 0 && !known.some((n) => allergyMatches(a, [n], kb.foldName)));
  return { items, kept: items.filter((i) => !i.removed), suppressed, allergyMatch, unmatchedAllergies: unmatched };
}

interface Ctx { pop: Set<string>; cond: Set<string>; state: Set<string>; subject: SafetySubject; allergyHit: boolean }

function appliesTo(rule: SafetyRule, x: Ctx): boolean {
  const a = rule.applies_to;
  if (a.always) return true;
  if (a.population) return a.population.some((k) => x.pop.has(k));
  if (a.condition) {
    const on = a.condition.some((k) => x.cond.has(k) || (k === "allergy_match" && x.allergyHit));
    if (!on) return false;
    return !a.medication_class || a.medication_class.some((m) => (x.subject.medications as readonly string[]).includes(m));
  }
  if (a.state) return a.state.some((k) => x.state.has(k));
  if (a.constitution) return x.subject.constitution !== null && a.constitution.includes(x.subject.constitution);
  return false;
}

function targetHits(kb: KnowledgeBase, rule: SafetyRule, c: Candidate, d: Descriptor, nature: FormulaNature | null, b: SafetyInput["bagang"], conf: KnowledgeBase["params"]["safety"]["conflict"], allergyHit: boolean): boolean {
  const t = rule.target as Record<string, unknown>;
  if ("herb_pregnancy" in t) return d.pregnancy !== null && (t.herb_pregnancy === "avoid" ? d.pregnancy === "avoid" : d.pregnancy === "caution" || d.pregnancy === "avoid");
  if ("herb_interaction" in t) return d.interactions.includes(t.herb_interaction as string);
  if ("formula_tier" in t) return c.kind === "formula" && (t.formula_tier as string[]).includes(c.formula.tier);
  if ("acupoints" in t) return c.kind === "acupoint" && (t.acupoints as string[]).includes(c.name);
  if ("herb_in_user_allergy_list" in t) return allergyHit;
  if ("flavor_share_over" in t) return c.kind === "formula" && Math.max(0, ...Object.values(c.formula.flavor_profile)) > (t.flavor_share_over as number);
  if ("herb_pairs" in t) {
    if (c.kind === "formula") return incompatiblePairs(kb, d.herbIds).length > 0;
    if (c.kind === "herb") return incompatiblePairs(kb, [...c.formula.composition.map((x) => x.herb), c.herbId]).some((p) => p.herbs.includes(c.herbId));
    return false;
  }
  if ("effect" in t) return t.effect === "tonic" && nature !== null && nature.tonic >= conf.tonic_min;
  if ("food_pregnancy_caution" in t) return c.kind === "food" && kb.treatment.food_pregnancy_caution.some((f) => f === c.name || f.startsWith(`${c.name}（`));
  if ("conflict" in t) {
    if (!nature) return false;
    switch (t.conflict) {
      case "heat_pattern_with_warming_formula": return b.coldHeat > conf.axis && nature.warming > conf.warming_min;
      case "cold_pattern_with_cooling_formula": return b.coldHeat < -conf.axis && nature.cooling > conf.cooling_min;
      case "excess_pattern_with_tonic_formula": return b.deficiencyExcess > conf.axis && nature.tonic > conf.tonic_min;
      case "deficiency_pattern_with_attacking_formula": return b.deficiencyExcess < -conf.axis && nature.attacking > conf.attacking_min;
    }
  }
  return false;
}

/** Every name the knowledge base can say something about (formula herbs, curated herbs, pattern foods). */
function knownNames(kb: KnowledgeBase): string[] {
  const names = new Set<string>();
  for (const id of new Set([...kb.formulas.values()].flatMap((f) => f.composition.map((c) => c.herb)))) for (const n of herbNameSet(kb, id)) names.add(n);
  for (const f of kb.formulas.values()) for (const c of f.composition) names.add(c.name);
  for (const h of kb.herbs?.values() ?? []) for (const n of herbNameSet(kb, h.id)) names.add(n);
  for (const p of kb.patterns) for (const f of p.treatment.foods) names.add(f.replace(/（.*?）/g, ""));
  return [...names];
}
