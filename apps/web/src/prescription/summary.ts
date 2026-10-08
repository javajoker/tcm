// The personalised prescription in the practitioner summary (PM-41; docs/post-mvp/design/export-follow-up-trends.md §3): a section of the page and of the
// plain-text copy (from the same view as the formula page's card), and a section of the file — data, with labels in both languages. Loaded only by a build
// that can show a prescription.
import type { Prescription } from "@tcm/engine/prescription";
import type { KnowledgeBase } from "@tcm/kb";
import type { T } from "../i18n/I18nProvider.tsx";
import type { SummarySection } from "../screens/result/summaryModel.ts";
import type { SavedAssessment } from "../storage/types.ts";
import { rxI18n } from "./catalog.ts";
import { rxView } from "./view.ts";

/** The section of the summary page and text, or null without a prescription. */
export function prescriptionSection(saved: SavedAssessment, kb: KnowledgeBase, t: T): SummarySection | null {
  const p = saved.prescription;
  if (p === undefined) return null;
  const rx = rxI18n(t.lang, (s) => t.zh(s));
  const v = rxView(p, kb, t, rx, saved.role !== undefined);
  const title = saved.role !== undefined ? rx.t("rx.title.study") : rx.t("rx.summary.title");
  if (v.withheld !== null) return { id: "rx", title, items: [v.withheld, v.draft, v.footer] };
  return {
    id: "rx", title,
    // N-AMOUNTS first: the quantities are for study and as an aid to a practitioner only (PD-30)
    items: [...(v.amounts ? [t.t("safety.notice.amounts.text")] : []), v.base, ...v.changes, ...v.cautions, ...v.why, v.draft, v.footer],
    ...(v.amounts ? { table: { caption: rx.t("rx.table.caption"), head: [rx.t("rx.col.role"), rx.t("rx.col.herb"), rx.t("rx.col.grams"), rx.t("rx.col.range"), rx.t("rx.col.why")],
      rows: v.rows.map((r) => [r.role, r.added ? `${r.herb} (${rx.t("rx.added")})` : r.herb, r.grams, r.range, r.why]) } } : {}),
  };
}

interface Label { readonly "zh-Hant": string; readonly en: string | null }
interface Coded { readonly id: string; readonly label: Label }

/** The `prescription` section of the file (schema `tcm-summary-2`): identifiers, labels in both languages, quantities and the rules behind them. */
export function prescriptionFile(p: Prescription, kb: KnowledgeBase): Record<string, unknown> {
  const herb = (id: string): Coded => {
    const n = kb.herbs?.get(id)?.name ?? kb.herbName(id)?.name;
    return { id, label: n ? { "zh-Hant": n["zh-Hant"], en: n.en } : { "zh-Hant": id, en: null } };
  };
  const formula = kb.formulas.get(p.base.formula);
  return {
    base: { formula: { id: p.base.formula, label: formula ? { "zh-Hant": formula.name["zh-Hant"], en: formula.name.en } : { "zh-Hant": p.base.formula, en: null } }, strength: p.base.strength },
    withheld: p.withheld === null ? null : { herb: herb(p.withheld.herb), rule: p.withheld.rule },
    changes: p.changes.map((c) => ({ op: c.op, herb: herb(c.herb), role: c.role, rule: c.rule, ...(c.improves ? { improves: [...c.improves] } : {}), ...(c.via ? { via: [...c.via] } : {}), ...(c.source ? { source: c.source } : {}) })),
    composition: p.composition.map((r) => ({ herb: herb(r.herb), role: r.role, source: r.source, grams: r.amountG, range: r.rangeG ? [r.rangeG[0], r.rangeG[1]] : null, factors: r.factors.map((f) => ({ rule: f.rule, factor: Math.round(f.factor * 1000) / 1000 })) })),
    cautions: p.cautions.map((c) => ({ herb: herb(c.herb), rule: c.rule })),
    version: { engine: p.version.engine, kb: p.version.kb, params: p.version.params },
  };
}
