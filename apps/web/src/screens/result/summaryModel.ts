// The practitioner summary (UX spec §12): one structured model feeds both the printable page and the plain-text copy, so they cannot disagree.
import type { KnowledgeBase } from "@tcm/kb";
import type { T } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import type { SavedAssessment } from "../../storage/types.ts";
import { NOTICE_SLUG } from "../screening/noticeText.ts";
import { DIMENSION_ORDER } from "../review/model.ts";
import { summaryData, type SummaryData } from "./summaryData.ts";
import { ELEMENT_SLUG, signed } from "./words.ts";

export interface SummarySection {
  readonly id: string;
  readonly title: string;
  /** Allergies and medicines are shown prominently (UX spec §12). */
  readonly prominent?: boolean;
  readonly facts?: readonly (readonly [string, string])[];
  readonly items?: readonly string[];
  readonly table?: { readonly caption: string; readonly head: readonly string[]; readonly rows: readonly (readonly string[])[] };
}

/**
 * How the season of the result was counted, for the foot of the summary (five-phase design §7): the season model the result was made with and the basis — or that seasons were left out. Empty where the result has
 * no five-phase reference. It is provenance, like the versions beside it: the summary shows nothing that depends on the season, and a practitioner who is told which school's reading stands behind the reference
 * can discount it as they see fit.
 */
export function seasonsSentence(saved: SavedAssessment, t: T): string {
  if (saved.result.reference === null) return "";
  const basis = saved.result.meta.seasons ?? "north";
  if (basis === "off") return t.t("report.footer.seasons.off");
  const model = saved.result.meta.seasonModel === "tuwang18" ? "tuwang18" : "changxia";
  return t.t(`report.footer.seasons.${basis}`, { model: t.t(`report.season.model.short.${model}`) });
}

/** The summary page's sections in the page language: one model of text for the printable page and the plain-text copy, made from the data layer (`summaryData`). */
export function renderSummary(data: SummaryData, kb: KnowledgeBase, t: T): SummarySection[] {
  const k = (key: string, p?: Record<string, string | number>): string => t.t(key as MessageKey, p);
  const out: SummarySection[] = [];
  const listSep = t.lang === "en" ? ", " : "、";
  const none = k("intake.review.value.none");

  // the person
  const person = data.person;
  const facts: [string, string][] = [[k("intake.review.about.age"), k("intake.review.value.years", { n: person.ageYears ?? "" })], [k("intake.review.about.sex"), person.sex ? k(`intake.review.value.${person.sex}`) : ""]];
  if (person.pregnancy !== undefined) {
    facts.push([k("intake.review.about.pregnancy"), k(`intake.review.value.${person.pregnancy}`)]);
    if (person.lactating !== undefined) facts.push([k("intake.review.about.lactating"), k(person.lactating ? "intake.review.value.yes" : "intake.review.value.no")]);
  }
  facts.push([k("intake.review.about.conditions"), person.conditions.length === 0 ? none : person.conditions.map((id) => k(`intake.profile.conditions.${id}`)).join(listSep)]);
  out.push({ id: "person", title: k("report.pract.person"), facts });

  const m = data.safety.medications;
  const meds = m.status === "unsure" ? k("intake.review.value.unsure") : m.status === "none" ? none
    : m.classes.map((c) => k(`intake.profile.meds.${c}`)).concat(m.otherNamed.length > 0 ? [k("intake.review.value.otherNamed", { names: m.otherNamed.join(listSep) })] : []).join(listSep);
  const allergies = data.safety.allergies.status === "some" ? data.safety.allergies.items.map((x) => t.zh(x)).join(listSep) : none;
  out.push({ id: "meds", title: k("report.pract.medsAllergies"), prominent: true, facts: [[k("intake.review.about.medications"), meds], [k("intake.review.about.allergies"), allergies]] });

  // reported symptoms (inquiry) and observations (tongue, pulse), with quality classes
  const rank = (d: string): number => { const x = (DIMENSION_ORDER as readonly string[]).indexOf(d); return x < 0 ? 99 : x; };
  const nameOf = (id: string): string => { const sym = kb.symptoms.get(id); return sym ? (t.lang === "en" ? sym.en : t.zh(sym["zh-Hant"])) : id; };
  const qualityTag = (q: string): string => (q === "inquiry" ? "" : ` [${k(`report.pract.quality.${q}`)}]`);
  const lines = new Map<string, string[]>();
  for (const f of data.findings) {
    const dim = kb.symptoms.get(f.id)?.dimension ?? "";
    const l = lines.get(dim) ?? [];
    l.push(`${nameOf(f.id)}${f.severity ? ` — ${k(`intake.severity.${f.severity}`)}` : ""}${qualityTag(f.quality)}`);
    lines.set(dim, l);
  }
  out.push({ id: "symptoms", title: k("report.pract.symptoms"), items: [...lines.entries()].sort(([x], [y]) => rank(x) - rank(y)).map(([dim, ls]) => `${k(`intake.inquiry.dimension.${dim}`)}: ${ls.sort().join(listSep)}`) });
  const pulse = data.observations.pulse;
  const pulseLine = pulse === null ? [] : [pulse.method ? k("report.pract.pulseRateMethod", { rate: pulse.rate, method: k(`observe.pulse.method.${pulse.method}`) }) : k("report.pract.pulseRate", { rate: pulse.rate })];
  const obs = data.observations.items.map((o) => `${nameOf(o.id)}${qualityTag(o.quality)}`);
  out.push({ id: "observations", title: k("report.pract.observations"), items: obs.length > 0 || pulseLine.length > 0 ? [...pulseLine, ...obs.sort()] : [k("report.pract.observations.none")] });

  // panel, hypotheses
  const num = (n: number): string => signed(n, (x) => t.number(x, { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const pn = data.panel;
  out.push({ id: "panel", title: k("report.pract.panel"), table: { caption: k("report.panel.caption.wuxing"), head: [k("report.panel.col.item"), k("report.panel.col.level"), k("report.panel.col.value")],
    rows: [...pn.elements.map((e) => [k(`report.element.${ELEMENT_SLUG[e.element]}`), k(`report.level.${e.band}`), num(e.value)]),
      [k("report.panel.axis.coldHeat"), k(`report.axis.coldHeat.${pn.coldHeat.band}`), num(pn.coldHeat.value)],
      [k("report.panel.axis.deficiencyExcess"), k(`report.axis.deficiencyExcess.${pn.deficiencyExcess.band}`), num(pn.deficiencyExcess.value)]] } });
  const pattern = (id: string): string => t.localized(kb.patternById.get(id)?.name ?? { "zh-Hant": id, en: null }).text;
  const hypotheses = data.patterns.status === "established"
    ? [...data.patterns.items.map((pp) => k("report.pract.pattern", { name: pattern(pp.id), band: k(`report.band.${pp.band}`) })), k("report.pract.confidence", { level: k(`report.confidence.${data.patterns.confidence}`) })]
    : [k("report.pract.hypotheses.none")];
  if (data.constitution !== null) {
    const nm = (id: string): string => t.localized(kb.constitutions.find((c) => c.id === id)?.name ?? { "zh-Hant": id, en: null }).text;
    hypotheses.push(k("report.pract.constitution", { names: [data.constitution.primary, data.constitution.secondary].filter((x): x is string => x !== null).map(nm).join(listSep) }));
  }
  out.push({ id: "hypotheses", title: k("report.pract.hypotheses"), items: hypotheses });
  if (data.whatWouldChange.length > 0) out.push({ id: "change", title: k("report.pract.change"), items: data.whatWouldChange.map((c) => k("report.change.item", { symptoms: c.symptoms.map(nameOf).join(listSep), lean: pattern(c.shiftsTo), over: pattern(c.over) })) });

  // what the result showed the person (as shown: the safety filter has already taken out what does not apply)
  const r = data.recommendations;
  const shown = [
    ...r.formulas.map((f) => k("report.pract.rec.formula", { name: t.localized(kb.formulas.get(f.id)?.name ?? { "zh-Hant": f.id, en: null }).text, tier: k(`formula.tier.${f.tier}`) })),
    ...r.foods.map((name) => k("report.pract.rec.food", { name: t.zh(name) })),
    ...r.points.map((x) => k("report.pract.rec.point", { name: t.zh(x.name), code: x.code })),
  ];
  out.push({ id: "recommendations", title: k("report.pract.rec"), items: shown.length > 0 ? [k("report.pract.rec.intro"), ...shown] : [k("report.pract.rec.none")] });

  // acknowledged notices (titles only)
  const titles = data.safety.notices.map((id) => NOTICE_SLUG[id]).filter((slug): slug is string => slug !== undefined && t.has(`safety.notice.${slug}.title`)).map((slug) => k(`safety.notice.${slug}.title`));
  if (titles.length > 0) out.push({ id: "notices", title: k("report.pract.notices"), items: titles });
  return out;
}

/** The sections of a saved result in the page language. */
export const buildSummary = (saved: SavedAssessment, kb: KnowledgeBase, t: T): SummarySection[] => renderSummary(summaryData(saved, kb), kb, t);

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
