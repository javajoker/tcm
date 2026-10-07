// The prescription model, part 3 (PM-40; design: docs/post-mvp/design/prescription-model.md §6): the personalised prescription by 三因制宜.
// A PURE function of a stored assessment, the person and the knowledge base — it never feeds back into the diagnosis, and the assessment is not changed.
//   1. the base: the first formula the assessment recommends (not a study-only one)
//   2. 因人, the herbs: a herb the person must not take (pregnancy, allergy, a medicine it interacts with) is removed — never the 君: the whole
//      prescription is then withheld; the classical 加減 of the formula whose trigger symptoms the person has; then at most `max_add` herbs in all,
//      from a pool narrowed by the person and the constitution, each added only when it brings the deviation back by more than `min_gain`
//   3. the amounts (where the knowledge base carries them): the 君 at the middle of its Pharmacopoeia range and the others in the formula's
//      proportions, × severity × age × constitution × season (× region, off), a toxic herb never raised, never above its range, rounded
//   4. the 方解 of what is prescribed, against the person's own deviation
import type { Formula, Herb, KnowledgeBase, Sanyin } from "@tcm/kb";
import type { Assessment } from "../assess.ts";
import { bestScale, cost, dimensionWeight, type PanelVector, type Role, type Strength } from "../formulas.ts";
import { allergyMatches, incompatiblePairs } from "../safety.ts";
import type { Subject } from "../types.ts";
import { contributions, formulaMechanism, type Mechanism } from "./formula.ts";
import { compositionAction, typicalDose, type CompositionRow, type PrescriptionTables } from "./herbs.ts";

export type Nature = Sanyin["constitution"][number]["avoid"];

/** Whether a herb is of a nature the 三因 rules name. */
export function isOfNature(h: Herb, n: Nature): boolean {
  switch (n) {
    case "寒涼": return h.temperature <= -1;
    case "溫熱": return h.temperature >= 1;
    case "溫": return h.temperature >= 0.5;
    case "溫燥": return h.temperature > 0 && h.props.run_zao === "燥";
    case "滋膩": return h.tags.includes("滋膩") || (h.props.run_zao === "潤" && h.props.bu_xie === "補");
    case "補": return h.props.bu_xie === "補";
  }
}

export interface PrescriptionChange {
  readonly op: "add" | "remove";
  readonly herb: string;
  readonly role: Role;
  /** The rule that made the change: `yinren.pregnancy`, `yinren.allergy`, `yinren.interaction:anticoagulant`, `jiajian.classical:M_…`, `jiajian.residual`. */
  readonly rule: string;
  /** For a residual addition: the components it brings back most. */
  readonly improves?: readonly string[];
  /** For a residual addition: the 七情 pairings its presence brings into play (it may be added to restrain another herb — 佐制 through 相畏). */
  readonly via?: readonly string[];
  /** For a classical modification: the book it comes from. */
  readonly source?: string;
}

export interface AmountFactor {
  /** `severity`, `age:幼兒`, `age:elderly`, `constitution:C_YANGXU`, `season:火`, `toxic-cap`, `range-top`, `range-bottom`. */
  readonly rule: string;
  readonly factor: number;
}

export interface PrescriptionRow {
  readonly herb: string;
  readonly role: Role;
  readonly source: "formula" | "classical" | "residual";
  /** Share of the composition (by amount where there are amounts, else by the formula's effective weights; additions at the modification share). */
  readonly proportion: number;
  /** Grams, only where the knowledge base carries the amounts (the development profile). */
  readonly amountG: number | null;
  /** The adult Pharmacopoeia range, when there is one. */
  readonly rangeG: readonly [number, number] | null;
  readonly factors: readonly AmountFactor[];
}

export interface Prescription {
  readonly base: { readonly formula: string; readonly strength: Strength; readonly explained: number; readonly patterns: readonly string[] };
  /** Set when a rule touches the 君: nothing is prescribed, and this says why (the reason is shown, as for every suppression). */
  readonly withheld: { readonly herb: string; readonly rule: string } | null;
  readonly changes: readonly PrescriptionChange[];
  readonly composition: readonly PrescriptionRow[];
  readonly amounts: boolean;
  /** Notes on herbs kept: a soft interaction, a pregnancy caution, an identity to confirm (木通). */
  readonly cautions: readonly { readonly herb: string; readonly rule: string }[];
  readonly mechanism: Mechanism | null;
  readonly version: { readonly engine: string; readonly kb: string; readonly params: string };
}

export interface PersonaliseInput {
  readonly kb: KnowledgeBase;
  readonly assessment: Assessment;
  readonly subject: Subject;
  readonly tables: PrescriptionTables;
  readonly sanyin: Sanyin;
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

const fraction = (f: string): number => {
  const [n, d] = f.split("/").map(Number);
  return n! / d!;
};

/** The interaction flags the person's medicines meet, by the safety rules: `hard` flags remove a herb, `soft` ones annotate it; `always` holds the flags every person meets. */
export function interactionFlags(kb: KnowledgeBase, medications: Subject["medications"]): { hard: Set<string>; soft: Set<string>; always: Set<string> } {
  const out = { hard: new Set<string>(), soft: new Set<string>(), always: new Set<string>() };
  for (const rule of kb.safety.rules) {
    const target = rule.target as { herb_interaction?: string };
    const flag = target.herb_interaction;
    if (!flag) continue;
    const applies = rule.applies_to as { always?: boolean; condition?: readonly string[]; medication_class?: readonly string[] };
    if (applies.always) { out.always.add(flag); continue; }
    const classes = applies.medication_class ?? (applies.condition?.includes("on_anticoagulant") ? ["anticoagulant"] : []);
    if (classes.some((c) => (medications as readonly string[]).includes(c))) (rule.severity === "hard" ? out.hard : out.soft).add(flag);
  }
  return out;
}

const namesOf = (h: Herb): string[] => [h.name["zh-Hant"], ...(h.aliases ?? []), ...(h.name.en ? [h.name.en] : [])];

interface WorkRow { herb: string; role: Role; source: PrescriptionRow["source"]; x: number; base: number | null; note: string | null; weight: number }

/** The personalised prescription (§6), or null where the knowledge base carries no herb records (a release bundle) or nothing is recommended. */
export function personalise(input: PersonaliseInput): Prescription | null {
  const { kb, assessment, subject, tables, sanyin } = input;
  const herbs = kb.herbs;
  if (!herbs) return null;
  const rec = assessment.recommendations.formulas.find((r) => !r.studyOnly);
  if (!rec) return null;
  const f: Formula = kb.formulas.get(rec.id)!;
  const D: PanelVector = assessment.panel.observed;
  const mod = kb.params.formula.modification;
  const herb = (id: string): Herb => herbs.get(id) ?? (() => { throw new Error(`unknown herb ${id}`); })();
  const version = { engine: assessment.meta.engineVersion, kb: assessment.meta.kbVersion, params: fnv1a(JSON.stringify({ params: tables.params, sanyin })) };
  const base = { formula: f.id, strength: rec.strength, explained: rec.fit.explained, patterns: rec.patterns };

  // ── 因人: what the person must not take ────────────────────────────────────
  const pregnant = subject.pregnancy === "yes" || subject.pregnancy === "possible";
  const flags = interactionFlags(kb, subject.medications);
  const blockedBy = (h: Herb): string | null => {
    if (pregnant && h.pregnancy === "avoid") return "yinren.pregnancy";
    if (subject.allergies.some((a) => allergyMatches(a, namesOf(h), kb.foldName))) return "yinren.allergy";
    const hit = h.interactions.find((i) => flags.hard.has(i));
    return hit ? `yinren.interaction:${hit}` : null;
  };
  const constitution = assessment.constitution?.result.primary ?? null;
  const cRule = sanyin.constitution.find((c) => c.constitution === constitution) ?? null;

  const changes: PrescriptionChange[] = [];
  const amounts = f.composition.every((c) => c.typical_g !== undefined);
  let rows: WorkRow[] = f.composition.map((c) => {
    const t = typicalDose(herb(c.herb));
    const note = [c.note, c.classical_amount?.processing].filter((x): x is string => typeof x === "string" && x.length > 0).join("；") || null;
    return { herb: c.herb, role: c.role, source: "formula" as const, x: c.typical_g !== undefined && t ? c.typical_g / t : 1, base: c.typical_g ?? null, note, weight: c.effective_weight };
  });
  for (const r of [...rows]) {
    const why = blockedBy(herb(r.herb));
    if (!why) continue;
    if (r.role === "君") return { base, withheld: { herb: r.herb, rule: why }, changes: [], composition: [], amounts, cautions: [], mechanism: null, version };
    rows = rows.filter((x) => x.herb !== r.herb);
    changes.push({ op: "remove", herb: r.herb, role: r.role, rule: why });
  }

  // ── 加減: the classical modifications, then the residual step ───────────────
  let added = 0;
  for (const m of rec.classicalModifications) {
    for (const rm of m.remove) {
      const r = rows.find((x) => x.herb === rm.herb);
      if (!r || r.role === "君") continue;
      rows = rows.filter((x) => x.herb !== rm.herb);
      changes.push({ op: "remove", herb: rm.herb, role: r.role, rule: `jiajian.classical:${m.id}`, source: m.source.book });
    }
    for (const ad of m.add) {
      if (added >= mod.max_add || rows.some((x) => x.herb === ad.herb) || blockedBy(herb(ad.herb))) continue;
      const data = f.modifications.find((x) => x.id === m.id)?.add.find((x) => x.herb === ad.herb);
      rows.push({ herb: ad.herb, role: ad.role as Role, source: "classical", x: 1, base: data?.typical_g ?? typicalDose(herb(ad.herb)), note: null, weight: mod.add_share });
      changes.push({ op: "add", herb: ad.herb, role: ad.role as Role, rule: `jiajian.classical:${m.id}`, source: m.source.book });
      added++;
    }
  }

  const actionOf = (rs: readonly WorkRow[]) => compositionAction(herbs, rs.map((r): CompositionRow => ({ herb: r.herb, x: r.x, note: r.note })), tables);
  // the scale is the base composition's best fit and stays fixed while herbs are tried (as in the classical 加減 step), so a herb is judged by
  // what it adds, not by a change of scale
  const k0 = bestScale(kb, D, actionOf(rows).total);
  const scaledBy = (t: Readonly<Record<string, number>>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [d, x] of Object.entries(t)) out[d] = k0 * x;
    return out;
  };
  const fitCost = (rs: readonly WorkRow[]): number => cost(kb, D, scaledBy(actionOf(rs).total));
  /** The fit with a trial herb counted by its benefit alone: a herb is added for what it treats, never for its burden offsetting another herb's excess. */
  const benefitCost = (rs: readonly WorkRow[], id: string): number => {
    const a = actionOf(rs);
    const t: Record<string, number> = { ...a.total };
    for (const [d, x] of Object.entries(a.herbs.find((h) => h.herb === id)?.burden ?? {})) t[d] = (t[d] ?? 0) - x;
    return cost(kb, D, scaledBy(t));
  };
  const avoids = (h: Herb): boolean => {
    if (!cRule || !isOfNature(h, cRule.avoid)) return false;
    // 寒涼 may still be added for a cold constitution when the heat that remains asks for it (and the change says so)
    return !(cRule.avoid === "寒涼" && (D["liuxie.火"] ?? 0) > sanyin.heat_demand);
  };
  // the same herb, processed or not (炙甘草 and 甘草): never both
  const plain = (name: string): string => name.replace(/^(蜜炙|炙|炒|製|酒|醋|鹽)/u, "");
  const conflictsWith = (h: Herb, rs: readonly WorkRow[]): boolean => {
    const ids = new Set(rs.map((r) => r.herb));
    if (rs.some((r) => plain(herb(r.herb).name["zh-Hant"]) === plain(h.name["zh-Hant"]))) return true;
    if (incompatiblePairs(kb, [...rs.map((r) => herb(r.herb).name["zh-Hant"]), h.name["zh-Hant"]]).some(([a, b]) => a === h.name["zh-Hant"] || b === h.name["zh-Hant"])) return true;
    return tables.pairings.some((p) => (p.type === "相反" || p.type === "相惡") && ((p.herb === h.id && ids.has(p.other)) || (p.other === h.id && ids.has(p.herb))));
  };
  // the pool: curated, not toxic, no pregnancy flag, with a Pharmacopoeia range (a herb that cannot be dosed is not added), and nothing the person or the constitution excludes
  const pool = [...herbs.values()].filter((h) => h.status === "curated-draft" && h.props.toxicity === "無毒" && (h.pregnancy === "ok" || h.pregnancy === "ok-unreviewed") && h.dose_g_reference !== null
    && !blockedBy(h) && !h.interactions.some((i) => flags.soft.has(i) || flags.always.has(i)) && !avoids(h)).map((h) => h.id).sort();
  let current = fitCost(rows);
  while (added < mod.max_add) {
    let best: { herb: string; c: number; full: number } | null = null;
    for (const id of pool) {
      if (rows.some((r) => r.herb === id) || conflictsWith(herb(id), rows)) continue;
      const trial: WorkRow[] = [...rows, { herb: id, role: "佐", source: "residual", x: 1, base: typicalDose(herb(id)), note: null, weight: mod.add_share }];
      const c = benefitCost(trial, id);
      if (best === null || c < best.c) best = { herb: id, c, full: fitCost(trial) };
    }
    // the benefit must bring the deviation back, and so must the herb with its burden
    if (!best || best.c >= current - mod.min_gain || best.full >= current - mod.min_gain) break;
    const before = actionOf(rows).total, trial: WorkRow[] = [...rows, { herb: best.herb, role: "佐", source: "residual", x: 1, base: typicalDose(herb(best.herb)), note: null, weight: mod.add_share }];
    const after = actionOf(trial).total;
    const improves = [...new Set([...Object.keys(D), ...Object.keys(after)])].map((d): [string, number] => {
      const b = (D[d] ?? 0) + k0 * (before[d] ?? 0), a = (D[d] ?? 0) + k0 * (after[d] ?? 0);
      return [d, dimensionWeight(kb, d) * (b * b - a * a)];
    }).filter(([, g]) => g > 1e-12).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 3).map(([d]) => d);
    const via = actionOf(trial).applied.filter((x) => x.herb === best.herb || x.other === best.herb).map((x) => x.id).sort();
    rows = trial;
    current = best.full;
    added++;
    changes.push({ op: "add", herb: best.herb, role: "佐", rule: "jiajian.residual", improves, ...(via.length ? { via } : {}) });
  }

  // ── the amounts: 因人 (severity, age, constitution), 因時 (season), 因地 (off) ─────
  const severity = sanyin.severity[rec.strength];
  const age = subject.ageYears;
  const minor = sanyin.age.minors.find((m) => age < m.below_years) ?? null;
  const ageFactor = minor ? { rule: `age:${minor.label}`, factor: fraction(minor.fraction) } : age >= sanyin.age.elderly_from_years ? { rule: "age:elderly", factor: fraction(sanyin.age.elderly_fraction) } : null;
  const season = assessment.reference?.enabled.season ? assessment.reference.panel.season.element : null;
  const sRule = season ? sanyin.season.find((s) => s.element === season) ?? null : null;
  const jun = rows.filter((r) => r.role === "君" && r.source === "formula" && r.base);
  const juns = jun.map((r) => { const t = typicalDose(herb(r.herb)); return t ? t / r.base! : null; }).filter((x): x is number => x !== null);
  const scale = juns.length ? juns.reduce((a, b) => a + b, 0) / juns.length : 1;
  // grams are rounded to `round_g`; a herb whose whole range is within a gram (麝香, 0.03–0.1 g) to a hundredth
  const round = (g: number, range: readonly [number, number] | null): number => {
    const step = range && range[1] <= 1 ? 0.01 : sanyin.round_g;
    return Math.max(step, Math.round(g / step) * step);
  };

  const cautions: { herb: string; rule: string }[] = [];
  const built = rows.map((r): PrescriptionRow & { x: number } => {
    const h = herb(r.herb);
    const range = h.dose_g_reference ? ([h.dose_g_reference[0], h.dose_g_reference[1]] as const) : null;
    for (const i of h.interactions) if (flags.soft.has(i) || flags.always.has(i)) cautions.push({ herb: r.herb, rule: `interaction:${i}` });
    if (pregnant && h.pregnancy === "caution") cautions.push({ herb: r.herb, rule: "pregnancy:caution" });
    if (!amounts || r.base === null) return { herb: r.herb, role: r.role, source: r.source, proportion: 0, amountG: null, rangeG: range, factors: [], x: r.x };
    const factors: AmountFactor[] = [{ rule: "severity", factor: severity }];
    if (ageFactor) factors.push(ageFactor);
    if (cRule && cRule.factor !== 1 && r.source === "formula" && isOfNature(h, cRule.avoid)) factors.push({ rule: `constitution:${cRule.constitution}`, factor: cRule.factor });
    const spared = sanyin.season_spares_jun && r.role === "君";
    if (sRule && !spared && ((sRule.temperature_at_least !== undefined && h.temperature >= sRule.temperature_at_least) || (sRule.temperature_at_most !== undefined && h.temperature <= sRule.temperature_at_most))) {
      factors.push({ rule: `season:${sRule.element}`, factor: sRule.factor });
    }
    let product = factors.reduce((p, x) => p * x.factor, 1);
    if (h.props.toxicity !== "無毒" && product > 1) { factors.push({ rule: "toxic-cap", factor: 1 / product }); product = 1; }
    let g = (r.source === "formula" ? r.base * scale : r.base) * product;
    if (range && g > range[1]) { factors.push({ rule: "range-top", factor: range[1] / g }); g = range[1]; }
    if (range && !ageFactor && g < range[0]) { factors.push({ rule: "range-bottom", factor: range[0] / g }); g = range[0]; }
    const amountG = Math.min(round(g, range), range ? range[1] : Infinity);
    const t = typicalDose(h);
    return { herb: r.herb, role: r.role, source: r.source, proportion: 0, amountG, rangeG: range, factors, x: t ? amountG / t : r.x };
  });
  const amountTotal = built.reduce((s, r) => s + (r.amountG ?? 0), 0);
  const weightTotal = rows.reduce((s, r) => s + r.weight, 0);
  const composition: PrescriptionRow[] = built.map(({ x: _x, ...r }, i) => ({ ...r, proportion: amounts && amountTotal > 0 ? (r.amountG ?? 0) / amountTotal : rows[i]!.weight / weightTotal }));
  for (const r of rows) if (herb(r.herb).interactions.includes("aristolochic-risk")) cautions.push({ herb: r.herb, rule: "identity:aristolochic" });

  // ── the 方解 of what is prescribed ──────────────────────────────────────────
  const finalRows = built.map((r): CompositionRow => ({ herb: r.herb, x: r.x, note: rows.find((w) => w.herb === r.herb)?.note ?? null }));
  const action = compositionAction(herbs, finalRows, tables);
  const mechanism = formulaMechanism(kb, D, f, action, contributions(action, new Map(rows.map((r) => [r.herb, r.role]))), tables.params);
  const seen = new Set<string>();
  const uniqueCautions = cautions.filter((c) => { const k = `${c.herb} ${c.rule}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { base, withheld: null, changes, composition, amounts, cautions: uniqueCautions, mechanism, version };
}
