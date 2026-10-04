// The practitioner summary (UX spec §12): one structured model feeds both the printable page and the plain-text copy, so they cannot disagree.
import { ELEMENTS } from "@tcm/wuxing";
import { sourceOf, type TraceItem } from "@tcm/engine";
import type { KnowledgeBase } from "@tcm/kb";
import type { T } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import type { SavedAssessment } from "../../storage/types.ts";
import { NOTICE_SLUG } from "../screening/noticeText.ts";
import { MED_CLASSES, medicationClasses, seriousIn } from "../profile/model.ts";
import { DIMENSION_ORDER } from "../review/model.ts";
import { ELEMENT_SLUG, level5, signed } from "./words.ts";

export interface SummarySection {
  readonly id: string;
  readonly title: string;
  /** Allergies and medicines are shown prominently (UX spec §12). */
  readonly prominent?: boolean;
  readonly facts?: readonly (readonly [string, string])[];
  readonly items?: readonly string[];
  readonly table?: { readonly caption: string; readonly head: readonly string[]; readonly rows: readonly (readonly string[])[] };
}

export function buildSummary(saved: SavedAssessment, kb: KnowledgeBase, t: T): SummarySection[] {
  const k = (key: string, p?: Record<string, string | number>): string => t.t(key as MessageKey, p);
  const a = saved.result;
  const i = saved.input;
  const s = i.subject;
  const out: SummarySection[] = [];
  const listSep = t.lang === "en" ? ", " : "、";
  const none = k("intake.review.value.none");

  // the person
  const facts: [string, string][] = [[k("intake.review.about.age"), k("intake.review.value.years", { n: s.ageYears ?? "" })], [k("intake.review.about.sex"), s.sex ? k(`intake.review.value.${s.sex}`) : ""]];
  if (s.pregnancy && s.pregnancy !== "not-applicable") {
    facts.push([k("intake.review.about.pregnancy"), k(`intake.review.value.${s.pregnancy === "no" ? "no" : s.pregnancy === "yes" ? "yes" : "possible"}`)]);
    if (s.lactating !== undefined) facts.push([k("intake.review.about.lactating"), k(s.lactating ? "intake.review.value.yes" : "intake.review.value.no")]);
  }
  const serious = seriousIn({ redFlags: i.redFlags } as never);
  facts.push([k("intake.review.about.conditions"), serious.length === 0 ? none : serious.map((id) => k(`intake.profile.conditions.${id}`)).join(listSep)]);
  out.push({ id: "person", title: k("report.pract.person"), facts });

  const classes = medicationClasses({ subject: s, profile: i.profile } as never);
  const meds = i.profile.medications === "unsure" ? k("intake.review.value.unsure") : classes.length === 0 ? none
    : [...new Set(classes)].map((c) => k(`intake.profile.meds.${c}`)).concat(i.profile.medicationText.length > 0 ? [k("intake.review.value.otherNamed", { names: i.profile.medicationText.join(listSep) })] : []).join(listSep);
  void MED_CLASSES;
  const allergies = i.profile.allergies === "some" && (s.allergies ?? []).length > 0 ? (s.allergies ?? []).join(listSep) : none;
  out.push({ id: "meds", title: k("report.pract.medsAllergies"), prominent: true, facts: [[k("intake.review.about.medications"), meds], [k("intake.review.about.allergies"), allergies]] });

  // reported symptoms (inquiry) and observations (tongue, pulse), with quality classes
  const rank = (d: string): number => { const x = (DIMENSION_ORDER as readonly string[]).indexOf(d); return x < 0 ? 99 : x; };
  const lines = new Map<string, string[]>();
  const obs: string[] = [];
  for (const [id, f] of Object.entries(i.findings)) {
    if (f.state !== "present") continue;
    const sym = kb.symptoms.get(id);
    if (!sym) continue;
    const name = t.lang === "en" ? sym.en : sym["zh-Hant"];
    const sev = f.severity ? ` — ${k(`intake.severity.${f.severity}`)}` : "";
    const src = sourceOf(kb, id, f.source);
    const line = `${name}${sev}${src === "inquiry" ? "" : ` [${k(`report.pract.quality.${src}`)}]`}`;
    if (sym.kind === "symptom") { const l = lines.get(sym.dimension) ?? []; l.push(line); lines.set(sym.dimension, l); } else obs.push(line);
  }
  out.push({ id: "symptoms", title: k("report.pract.symptoms"), items: [...lines.entries()].sort(([x], [y]) => rank(x) - rank(y)).map(([dim, ls]) => `${k(`intake.inquiry.dimension.${dim}`)}: ${ls.sort().join(listSep)}`) });
  out.push({ id: "observations", title: k("report.pract.observations"), items: obs.length > 0 ? obs.sort() : [k("report.pract.observations.none")] });

  // panel, hypotheses
  const p = a.panel;
  out.push({ id: "panel", title: k("report.pract.panel"), table: { caption: k("report.panel.caption.wuxing"), head: [k("report.panel.col.item"), k("report.panel.col.level"), k("report.panel.col.value")],
    rows: [...ELEMENTS.map((e) => [k(`report.element.${ELEMENT_SLUG[e]}`), k(`report.level.${level5(p.offsetPopulation[e])}`), signed(p.offsetPopulation[e], (n) => t.number(n, { maximumFractionDigits: 1, minimumFractionDigits: 1 }))]),
      [k("report.panel.axis.coldHeat"), k(`report.axis.coldHeat.${level5(p.bagang.coldHeat, 1)}`), signed(p.bagang.coldHeat, (n) => t.number(n, { maximumFractionDigits: 1, minimumFractionDigits: 1 }))],
      [k("report.panel.axis.deficiencyExcess"), k(`report.axis.deficiencyExcess.${level5(p.bagang.deficiencyExcess, 1)}`), signed(p.bagang.deficiencyExcess, (n) => t.number(n, { maximumFractionDigits: 1, minimumFractionDigits: 1 }))]] } });
  const v = a.verdict;
  const hypotheses = v.status === "established"
    ? [...v.patterns.map((pp) => k("report.pract.pattern", { name: t.localized(kb.patternById.get(pp.id)?.name ?? { "zh-Hant": pp.id, en: null }).text, band: k(`report.band.${pp.band}`) })), k("report.pract.confidence", { level: k(`report.confidence.${v.confidence}`) })]
    : [k("report.pract.hypotheses.none")];
  const cons = a.constitution?.result;
  if (cons?.primary) {
    const nm = (id: string): string => t.localized(kb.constitutions.find((c) => c.id === id)?.name ?? { "zh-Hant": id, en: null }).text;
    hypotheses.push(k("report.pract.constitution", { names: [cons.primary, cons.secondary].filter((x): x is string => x !== null).map(nm).join(listSep) }));
  }
  out.push({ id: "hypotheses", title: k("report.pract.hypotheses"), items: hypotheses });
  const change = a.trace.filter((x): x is Extract<TraceItem, { kind: "whatWouldChange" }> => x.kind === "whatWouldChange");
  const pname = (id: string): string => t.localized(kb.patternById.get(id)?.name ?? { "zh-Hant": id, en: null }).text;
  const sname = (id: string): string => { const x = kb.symptoms.get(id); return x ? (t.lang === "en" ? x.en : x["zh-Hant"]) : id; };
  if (change.length > 0) out.push({ id: "change", title: k("report.pract.change"), items: change.map((c) => k("report.change.item", { symptoms: c.ifSymptoms.map(sname).join(listSep), lean: pname(c.shiftsTo), over: pname(c.over) })) });

  // acknowledged notices (titles only)
  const titles = a.policy.notices.map((n) => NOTICE_SLUG[n.id]).filter((slug): slug is string => slug !== undefined && t.has(`safety.notice.${slug}.title`)).map((slug) => k(`safety.notice.${slug}.title`));
  if (titles.length > 0) out.push({ id: "notices", title: k("report.pract.notices"), items: titles });
  return out;
}

/** Plain text of the summary (for "Copy as text"): sections separated by blank lines, tables as tab-separated rows. */
export function summaryToText(title: string, intro: string, sections: readonly SummarySection[], footer: string): string {
  const parts: string[] = [title, intro];
  for (const s of sections) {
    const body: string[] = [];
    for (const [a, b] of s.facts ?? []) body.push(`${a}: ${b}`);
    for (const x of s.items ?? []) body.push(`- ${x}`);
    if (s.table) { body.push(s.table.head.join("\t")); for (const r of s.table.rows) body.push(r.join("\t")); }
    parts.push([s.prominent ? `** ${s.title} **` : s.title, ...body].join("\n"));
  }
  parts.push(footer);
  return parts.join("\n\n");
}
