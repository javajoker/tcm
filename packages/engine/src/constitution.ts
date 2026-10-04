// Step 5 of the SOP (§7): the constitution tendency from the own-written questionnaire, and the susceptibility to the pathogenic qi of the season.
// The constitution is the base tendency, not the present state: it never adds to a pattern score. It sets the output's emphasis (primary, secondary),
// feeds the safety rule for the allergic constitution, and — with the season and the climate of the reference — says which qi a person is more prone to.
//   converted score = (raw − n) ÷ (4n) × 100 over the answered items of a type (a reversed item scores 6 − answer)
//   balanced type: ≥ 60 and every biased type < 30 → "yes"; ≥ 60 and every biased type < 40 → "basically"; biased types: ≥ 40 "yes", 30–39 "tends", < 30 "no"
import type { Evil, ReferencePanel } from "@tcm/wuxing";
import type { KnowledgeBase } from "@tcm/kb";

export const BALANCED = "C_PINGHE";
/** A type is scored only when at least this share of its items was answered; fewer answers say too little about it. */
export const MIN_ANSWERED_SHARE = 0.5;

export type ConstitutionLevel = "yes" | "basically" | "tends" | "no" | "unscored";

export interface ConstitutionScore {
  readonly id: string;
  readonly answered: number;
  readonly total: number;
  readonly raw: number;
  /** 0 … 100, or `null` when too few items were answered. */
  readonly converted: number | null;
  readonly level: ConstitutionLevel;
}

export interface ConstitutionResult {
  /** One per constitution, in the order of the knowledge base. */
  readonly scores: readonly ConstitutionScore[];
  /** The leading tendency (a biased type, or the balanced type), or `null`: no clear tendency. */
  readonly primary: string | null;
  /** The next biased tendency (at least "tends"), or `null`. */
  readonly secondary: string | null;
  /** The verdict on the balanced type: yes / basically / no (null when it could not be scored). */
  readonly balanced: "yes" | "basically" | "no" | null;
  /** Every item of every type was answered. */
  readonly complete: boolean;
}

const isAnswer = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;

/** Score the questionnaire. `null` when nothing valid was answered (the person skipped the quiz). Unknown item ids and out-of-range answers are ignored. */
export function scoreConstitution(kb: KnowledgeBase, answers: Readonly<Record<string, number>>): ConstitutionResult | null {
  const types = kb.constitutionItems.types;
  const scores: ConstitutionScore[] = types.map((t) => {
    let raw = 0, n = 0;
    for (const item of t.items) {
      const a = answers[item.id];
      if (!isAnswer(a)) continue;
      raw += item.reverse ? 6 - a : a;
      n += 1;
    }
    const total = t.items.length;
    const converted = n / total >= MIN_ANSWERED_SHARE && n > 0 ? ((raw - n) / (4 * n)) * 100 : null;
    return { id: t.constitution, answered: n, total, raw, converted, level: "unscored" as ConstitutionLevel };
  });
  if (scores.every((s) => s.answered === 0)) return null;

  const biased = scores.filter((s) => s.id !== BALANCED && s.converted !== null);
  const maxBiased = Math.max(0, ...biased.map((s) => s.converted!));
  const withLevel = scores.map((s): ConstitutionScore => {
    if (s.converted === null) return s;
    if (s.id === BALANCED) return { ...s, level: s.converted >= 60 && maxBiased < 30 ? "yes" : s.converted >= 60 && maxBiased < 40 ? "basically" : "no" };
    return { ...s, level: s.converted >= 40 ? "yes" : s.converted >= 30 ? "tends" : "no" };
  });

  const order = (id: string): number => types.findIndex((t) => t.constitution === id);
  const leaning = withLevel.filter((s) => s.id !== BALANCED && (s.level === "yes" || s.level === "tends")).sort((a, b) => b.converted! - a.converted! || order(a.id) - order(b.id));
  const balancedLevel = withLevel.find((s) => s.id === BALANCED)!.level;
  const balanced = balancedLevel === "yes" || balancedLevel === "basically" || balancedLevel === "no" ? balancedLevel : null;
  const primary = leaning[0]?.id ?? (balanced === "yes" || balanced === "basically" ? BALANCED : null);
  return { scores: withLevel, primary, secondary: leaning[primary === leaning[0]?.id ? 1 : 0]?.id ?? null, balanced, complete: withLevel.every((s) => s.answered === s.total) };
}

export interface SusceptibilityItem { readonly evil: Evil; readonly risk: number; readonly exposure: number; readonly score: number }
export interface SeasonSusceptibility { readonly season: string; readonly items: readonly SusceptibilityItem[] }

/** susceptibility(c, t) = Σ over the pathogenic qi of risk[c][e] × exposure[e](t); exposure = 1.0 for the qi of the commanding season, plus the climate tendency of the reference. */
export function susceptibilityAt(kb: KnowledgeBase, constitutionId: string, panel: Pick<ReferencePanel, "season" | "climate">): SeasonSusceptibility {
  const table = kb.wuxing.susceptibility;
  const risk = (table.risk as Record<string, Record<string, number>>)[constitutionId] ?? {};
  const seasonal = new Set((table.season_evil as Record<string, string[]>)[panel.season.name] ?? []);
  const items: SusceptibilityItem[] = [];
  for (const [evil, r] of Object.entries(risk)) {
    const exposure = (seasonal.has(evil) ? 1 : 0) + (panel.climate[evil as Evil] ?? 0);
    const score = r * exposure;
    if (score > 1e-9) items.push({ evil: evil as Evil, risk: r, exposure, score });
  }
  items.sort((a, b) => b.score - a.score || (a.evil < b.evil ? -1 : 1));
  return { season: panel.season.name, items };
}

export interface ConstitutionBlock {
  readonly result: ConstitutionResult;
  /** For the primary constitution: now, then each coming season of the reference (empty without a reference). */
  readonly susceptibility: { readonly constitution: string; readonly now: SeasonSusceptibility | null; readonly upcoming: readonly SeasonSusceptibility[] } | null;
}
