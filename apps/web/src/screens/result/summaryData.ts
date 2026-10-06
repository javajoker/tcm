// The practitioner summary as DATA (docs/post-mvp/design/export-follow-up-trends.md §3.1): identifiers, enumerations and numbers — no prose. The printable page, the plain-text copy
// (`renderSummary`) and the structured file (`summaryFile`) are all made from this one value, so none of them can hold a fact another does not.
import { ELEMENTS, type Element } from "@tcm/wuxing";
import { sourceOf, type TraceItem } from "@tcm/engine";
import type { KnowledgeBase } from "@tcm/kb";
import type { SavedAssessment } from "../../storage/types.ts";
import { medicationClasses, seriousIn } from "../profile/model.ts";
import { DIMENSION_ORDER } from "../review/model.ts";
import { NOTICE_SLUG } from "../screening/noticeText.ts";
import { level5, type Level5 } from "./words.ts";

export type Quality = "inquiry" | "guided" | "pulse" | string;
export interface Finding { readonly id: string; readonly severity?: string; readonly quality: Quality }
export interface Observation { readonly id: string; readonly quality: Quality }
export interface PanelRow { readonly key: string; readonly band: Level5; readonly value: number }

export interface SummaryData {
  readonly person: { readonly ageYears: number | null; readonly sex: "female" | "male" | null; readonly pregnancy?: "no" | "possible" | "yes"; readonly lactating?: boolean; readonly conditions: readonly string[] };
  readonly safety: {
    readonly medications: { readonly status: "none" | "some" | "unsure"; readonly classes: readonly string[]; readonly otherNamed: readonly string[] };
    readonly allergies: { readonly status: "none" | "some"; readonly items: readonly string[] };
    /** The blocking and caution notices the person acknowledged, by id (the page lists their titles). */
    readonly notices: readonly string[];
  };
  /** The symptoms the person reported, grouped by dimension in the order of the page. */
  readonly findings: readonly Finding[];
  readonly observations: { readonly items: readonly Observation[]; readonly pulse: { readonly rate: number; readonly method?: string } | null };
  readonly constitution: { readonly primary: string; readonly secondary: string | null } | null;
  readonly panel: { readonly elements: readonly (PanelRow & { readonly element: Element })[]; readonly coldHeat: PanelRow; readonly deficiencyExcess: PanelRow };
  readonly patterns: { readonly status: "established" | "insufficient"; readonly items: readonly { readonly id: string; readonly band: string }[]; readonly confidence: string | null };
  readonly whatWouldChange: readonly { readonly symptoms: readonly string[]; readonly shiftsTo: string; readonly over: string }[];
  /** What the result showed the person: the formulas it recommended (never those for study only), the foods and the points. */
  readonly recommendations: { readonly formulas: readonly { readonly id: string; readonly tier: string }[]; readonly foods: readonly string[]; readonly points: readonly { readonly name: string; readonly code: string }[] };
}

/** One decimal, as the page prints it: the value in the file is the value on the page. */
export const oneDecimal = (n: number): number => Math.round(n * 10) / 10;
const row = (key: string, v: number, range: number): PanelRow => ({ key, band: level5(v, range), value: oneDecimal(v) });

export function summaryData(saved: SavedAssessment, kb: KnowledgeBase): SummaryData {
  const a = saved.result;
  const i = saved.input;
  const s = i.subject;
  const rank = (d: string): number => { const x = (DIMENSION_ORDER as readonly string[]).indexOf(d); return x < 0 ? 99 : x; };

  const classes = medicationClasses({ subject: s, profile: i.profile } as never);
  const medStatus = i.profile.medications === "unsure" ? "unsure" : classes.length === 0 ? "none" : "some";
  const findings: { dimension: string; f: Finding }[] = [];
  const observations: Observation[] = [];
  for (const [id, f] of Object.entries(i.findings)) {
    if (f.state !== "present") continue;
    const sym = kb.symptoms.get(id);
    if (!sym) continue;
    const quality = sourceOf(kb, id, f.source);
    if (sym.kind === "symptom") findings.push({ dimension: sym.dimension, f: { id, ...(f.severity ? { severity: f.severity } : {}), quality } });
    else observations.push({ id, quality });
  }
  const pulse = i.observe?.pulse;
  const p = a.panel;
  const v = a.verdict;
  const cons = a.constitution?.result;
  const change = a.trace.filter((x): x is Extract<TraceItem, { kind: "whatWouldChange" }> => x.kind === "whatWouldChange");
  const rec = a.recommendations;
  return {
    person: {
      ageYears: s.ageYears ?? null, sex: s.sex ?? null,
      ...(s.pregnancy && s.pregnancy !== "not-applicable" ? { pregnancy: s.pregnancy === "no" ? "no" as const : s.pregnancy === "yes" ? "yes" as const : "possible" as const, ...(s.lactating !== undefined ? { lactating: s.lactating } : {}) } : {}),
      conditions: seriousIn({ redFlags: i.redFlags } as never),
    },
    safety: {
      medications: { status: medStatus, classes: medStatus === "some" ? [...new Set(classes)] : [], otherNamed: [...i.profile.medicationText] },
      allergies: i.profile.allergies === "some" && (s.allergies ?? []).length > 0 ? { status: "some", items: [...(s.allergies ?? [])] } : { status: "none", items: [] },
      notices: a.policy.notices.map((n) => n.id).filter((id) => NOTICE_SLUG[id] !== undefined),
    },
    findings: findings.sort((x, y) => rank(x.dimension) - rank(y.dimension) || (x.f.id < y.f.id ? -1 : 1)).map((x) => x.f),
    observations: { items: observations.sort((x, y) => (x.id < y.id ? -1 : 1)), pulse: pulse?.rate == null ? null : { rate: pulse.rate, ...(pulse.method ? { method: pulse.method } : {}) } },
    constitution: cons?.primary ? { primary: cons.primary, secondary: cons.secondary } : null,
    panel: {
      elements: ELEMENTS.map((e) => ({ ...row(e, p.offsetPopulation[e], 3), element: e })),
      coldHeat: row("coldHeat", p.bagang.coldHeat, 1), deficiencyExcess: row("deficiencyExcess", p.bagang.deficiencyExcess, 1),
    },
    patterns: v.status === "established" ? { status: "established", items: v.patterns.map((x) => ({ id: x.id, band: x.band })), confidence: v.confidence } : { status: "insufficient", items: [], confidence: null },
    whatWouldChange: change.map((c) => ({ symptoms: [...c.ifSymptoms], shiftsTo: c.shiftsTo, over: c.over })),
    recommendations: { formulas: rec.formulas.map((f) => ({ id: f.id, tier: f.tier })), foods: rec.foods.map((f) => f.name), points: rec.acupoints.map((x) => ({ name: x.name, code: x.code })) },
  };
}
