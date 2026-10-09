// The verification of the formula library (PM-39; design: docs/post-mvp/design/prescription-model.md §5): each formula, computed from its herbs, is
// checked against what the knowledge base says of it — its stored effect, its own patterns, the direction its patterns ask for, its 君臣佐使, the
// balance of benefit and burden, and the incompatibilities. A failure is a FINDING for a reviewer: nothing here changes the data.
import type { Herb, KnowledgeBase, PatternMechanism } from "@tcm/kb";
import { bestScale, cost, dimensionWeight, formulaVector, type PanelVector, type Role } from "../formulas.ts";
import { incompatiblePairs } from "../safety.ts";
import { analyseFormula, type RoleReading } from "./formula.ts";
import type { AppliedPairing, PrescriptionTables } from "./herbs.ts";

export interface IndicationCheck {
  readonly pattern: string;
  /** Share of the pattern's typical deviation the formula, computed from its herbs, corrects. */
  readonly explained: number;
  /** Its place among the library's formulas for this pattern (1 = best), computed from the herbs and from the stored effect. */
  readonly rank: number;
  readonly rankStored: number;
  readonly pass: boolean;
}

export interface DirectionCheck {
  readonly pattern: string;
  readonly need: PatternMechanism["direction"];
  readonly formula: number;
  readonly pass: boolean;
}

export interface FormulaVerification {
  readonly formula: string;
  readonly patterns: readonly string[];
  /** Cosine between the benefit computed from the herbs and the stored `panel_effect`. */
  readonly effect: { readonly cosine: number; readonly pass: boolean };
  readonly indications: readonly IndicationCheck[];
  readonly direction: readonly DirectionCheck[];
  readonly roles: {
    readonly principal: string | null;
    readonly agree: number;
    readonly total: number;
    readonly disagreements: readonly { readonly herb: string; readonly labelled: Role; readonly readings: readonly RoleReading[] }[];
  };
  /** Weighted size of the burden over that of the benefit. */
  readonly balance: { readonly ratio: number; readonly pass: boolean };
  readonly safety: {
    /** 十八反 · 十九畏 pairs among the herbs (names). */
    readonly incompatible: readonly (readonly [string, string])[];
    /** Classical 相惡 inside the formula: the table says one herb takes from another's effect. */
    readonly opposed: readonly AppliedPairing[];
    readonly pass: boolean;
  };
  /** Short codes of what did not pass: `effect`, `indication:SP1`, `direction:LG1`, `role:herb-x`, `balance`, `safety`, `opposed:id`. */
  readonly findings: readonly string[];
}

export interface VerificationInput {
  readonly kb: KnowledgeBase;
  readonly herbs: ReadonlyMap<string, Herb>;
  readonly tables: PrescriptionTables;
  readonly mechanisms: readonly PatternMechanism[];
  /** Each pattern's typical deviation (its typical patient's observed panel). */
  readonly typical: ReadonlyMap<string, PanelVector>;
}

function cosine(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): number {
  let dot = 0, na = 0, nb = 0;
  for (const d of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[d] ?? 0, y = b[d] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function weightedNorm(kb: KnowledgeBase, v: Readonly<Record<string, number>>): number {
  return Math.sqrt(Object.entries(v).reduce((s, [d, x]) => s + dimensionWeight(kb, d) * x * x, 0));
}

function explainedBy(kb: KnowledgeBase, dev: PanelVector, t: PanelVector): number {
  const before = cost(kb, dev, {});
  if (!before) return 0;
  const k = bestScale(kb, dev, t);
  const scaled: Record<string, number> = {};
  for (const [d, x] of Object.entries(t)) scaled[d] = k * x;
  return 1 - cost(kb, dev, scaled) / before;
}

const rankOf = (scores: ReadonlyMap<string, number>, id: string): number =>
  1 + [...scores].filter(([other, s]) => s > scores.get(id)! || (s === scores.get(id)! && other < id)).length;

/** Verify every formula of the knowledge base (§5). Formulas the bundle carries no amounts for are skipped (there is nothing to compute). */
export function verifyLibrary(input: VerificationInput): FormulaVerification[] {
  const { kb, herbs, tables } = input;
  const v = tables.params.verification;
  const formulas = [...kb.formulas.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  const analysed = new Map(formulas.map((f) => [f.id, analyseFormula(kb, f, herbs, tables)] as const));
  const mech = new Map(input.mechanisms.map((m) => [m.pattern, m] as const));
  const scores = new Map<string, { v2: Map<string, number>; stored: Map<string, number> }>();
  const scoresFor = (pid: string) => {
    let s = scores.get(pid);
    if (!s) {
      const dev = input.typical.get(pid)!;
      s = { v2: new Map(), stored: new Map() };
      for (const f of formulas) {
        const a = analysed.get(f.id);
        if (a) s.v2.set(f.id, explainedBy(kb, dev, a.action.total));
        s.stored.set(f.id, explainedBy(kb, dev, formulaVector(f)));
      }
      scores.set(pid, s);
    }
    return s;
  };

  const out: FormulaVerification[] = [];
  for (const f of formulas) {
    const base = analysed.get(f.id);
    if (!base) continue;
    const own = f.patterns.find((p) => input.typical.has(p));
    const a = own ? analyseFormula(kb, f, herbs, tables, input.typical.get(own))! : base;
    const findings: string[] = [];

    const cos = cosine(a.action.benefit, f.panel_effect);
    const effect = { cosine: cos, pass: cos >= v.cosine_min };
    if (!effect.pass) findings.push("effect");

    const indications = f.patterns.filter((p) => input.typical.has(p)).map((p): IndicationCheck => {
      const s = scoresFor(p);
      const explained = s.v2.get(f.id)!;
      const rank = rankOf(s.v2, f.id);
      const check = { pattern: p, explained, rank, rankStored: rankOf(s.stored, f.id), pass: explained > 0 && rank <= v.rank_max };
      if (!check.pass) findings.push(`indication:${p}`);
      return check;
    });

    const direction = f.patterns.filter((p) => mech.has(p)).map((p): DirectionCheck => {
      const m = mech.get(p)!;
      const d = a.action.direction;
      const check = { pattern: p, need: m.direction, formula: d, pass: Math.abs(d) >= v.flat_below && Math.sign(d) === m.sign };
      if (!check.pass) findings.push(`direction:${p}`);
      return check;
    });

    const disagreements = a.roles.checks.filter((c) => !c.agrees).map((c) => ({ herb: c.herb, labelled: c.labelled, readings: c.readings }));
    for (const d of disagreements) findings.push(`role:${d.herb}`);

    const ratio = weightedNorm(kb, a.action.burden) / (weightedNorm(kb, a.action.benefit) || 1);
    const balance = { ratio, pass: ratio <= v.burden_ratio_max };
    if (!balance.pass) findings.push("balance");

    const named = (id: string): string => f.composition.find((c) => c.herb === id)?.name ?? id;          // as the formula writes the herb
    const incompatible = incompatiblePairs(kb, f.composition.map((c) => c.herb)).map((p) => [named(p.herbs[0]), named(p.herbs[1])] as const);
    const opposed = a.action.applied.filter((p) => p.type === "相惡");
    const safety = { incompatible, opposed, pass: incompatible.length === 0 && a.action.conflicts.length === 0 };
    if (!safety.pass) findings.push("safety");
    for (const p of opposed) findings.push(`opposed:${p.id}`);

    out.push({
      formula: f.id, patterns: f.patterns, effect, indications, direction,
      roles: { principal: a.roles.principal, agree: a.roles.checks.length - disagreements.length, total: a.roles.checks.length, disagreements },
      balance, safety, findings,
    });
  }
  return out;
}

/** The formulas whose verification found nothing. */
export const passing = (report: readonly FormulaVerification[]): string[] => report.filter((r) => r.findings.length === 0).map((r) => r.formula);

