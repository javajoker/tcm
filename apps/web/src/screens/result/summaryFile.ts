// The structured practitioner file (docs/post-mvp/design/export-follow-up-trends.md §3.2): `tcm-summary` version 1, a JSON file with identifiers and labels in both languages, built from the same
// data as the printed page (summaryData.ts) and described by docs/schemas/tcm-summary-1.schema.json. Nothing in it is uploaded: it is a file the person holds.
import type { KnowledgeBase } from "@tcm/kb";
import type { Lang } from "@tcm/i18n";
import type { T } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import type { SavedAssessment } from "../../storage/types.ts";
import { NOTICE_SLUG } from "../screening/noticeText.ts";
import { ELEMENT_SLUG } from "./words.ts";
import type { SummaryData } from "./summaryData.ts";

export const SUMMARY_FORMAT = "tcm-summary";
export const SUMMARY_VERSION = 1;
/** A file that holds the personalised prescription (only a development build makes one) is version 2: version 1 readers are not handed a section they do not know. */
export const SUMMARY_VERSION_WITH_PRESCRIPTION = 2;

/** The sections the person can switch on and off in the preview, in the order of the file. */
export const FILE_SECTIONS = ["person", "safety", "findings", "observations", "constitution", "panel", "patterns", "recommendations"] as const;
/** `prescription` is offered only for a result that holds one. */
export type FileSection = (typeof FILE_SECTIONS)[number] | "prescription";

export interface FileOptions {
  readonly sections: ReadonlySet<FileSection>;
  /** The medicine names the person typed (free text): off unless asked for. */
  readonly otherNamed: boolean;
  /** The person's own note, or `null` to leave it out. */
  readonly note: string | null;
  readonly createdAt: number;
  /** The language the person was using when the file was made. */
  readonly language: Lang;
}

/** What the preview starts with: every section on, the typed medicine names and the note off (design §3.3). */
export const defaultOptions = (createdAt: number, language: Lang): FileOptions => ({ sections: new Set(FILE_SECTIONS), otherNamed: false, note: null, createdAt, language });

export interface Label { readonly "zh-Hant": string; readonly en: string | null }
interface Coded { readonly id: string; readonly label: Label }

export type SummaryFile = Record<string, unknown> & { readonly format: "tcm-summary"; readonly version: 1 | 2 };

export const summaryFileName = (createdAt: number): string => `tcm-summary-${new Date(createdAt).toISOString().slice(0, 10)}.json`;

/** `tOf` gives the formatter of each language, so a label can carry both. `prescription` is the file's prescription section (prescription/summary.ts), when the person kept it in. */
export function summaryFile(data: SummaryData, saved: SavedAssessment, kb: KnowledgeBase, options: FileOptions, tOf: (lang: "zh-Hant" | "en") => T, prescription: Record<string, unknown> | null = null): SummaryFile {
  const zh = tOf("zh-Hant"), en = tOf("en");
  const both = (key: string, params?: Record<string, string | number>): Label => ({ "zh-Hant": zh.t(key as MessageKey, params), en: en.t(key as MessageKey, params) });
  const bilingual = (v: { readonly "zh-Hant": string; readonly en: string | null } | undefined, fallback: string): Label => v ?? { "zh-Hant": fallback, en: null };
  const symptom = (id: string): Coded => { const s = kb.symptoms.get(id); return { id, label: s ? { "zh-Hant": s["zh-Hant"], en: s.en } : { "zh-Hant": id, en: null } }; };
  const pattern = (id: string): Coded => ({ id, label: bilingual(kb.patternById.get(id)?.name, id) });
  const on = (s: FileSection): boolean => options.sections.has(s);
  const out: Record<string, unknown> = {
    format: SUMMARY_FORMAT, version: prescription !== null && options.sections.has("prescription") ? SUMMARY_VERSION_WITH_PRESCRIPTION : SUMMARY_VERSION, createdAt: new Date(options.createdAt).toISOString(),
    exportedFrom: {
      appVersion: saved.appVersion, kbVersion: saved.kbVersion, engineVersion: saved.engineVersion, paramsFingerprint: saved.paramsFingerprint, profile: saved.profile,
      // how the season was counted: the school's model, when the result has a season at all, and the basis when it is not the northern calendar (five-phase design §7)
      ...(saved.result.reference !== null && saved.result.meta.seasons !== "off" ? { seasonModel: saved.result.meta.seasonModel } : {}),
      ...(saved.result.reference !== null && saved.result.meta.seasons !== undefined ? { seasons: saved.result.meta.seasons } : {}),
    },
    language: options.language,
    notice: { "zh-Hant": `${zh.t("report.pract.file.notice")} ${zh.t("common.footer.disclaimer")}`, en: `${en.t("report.pract.file.notice")} ${en.t("common.footer.disclaimer")}` },
  };
  if (on("person")) {
    const p = data.person;
    out["person"] = { ageYears: p.ageYears, sex: p.sex, ...(p.pregnancy !== undefined ? { pregnancy: p.pregnancy } : {}), ...(p.lactating !== undefined ? { lactating: p.lactating } : {}), conditions: p.conditions.map((id): Coded => ({ id, label: both(`intake.profile.conditions.${id}`) })) };
  }
  if (on("safety")) {
    const m = data.safety.medications;
    out["safety"] = {
      medications: { status: m.status, classes: m.classes.map((id): Coded => ({ id, label: both(`intake.profile.meds.${id}`) })), ...(options.otherNamed ? { otherNamed: [...m.otherNamed] } : {}) },
      allergies: { status: data.safety.allergies.status, items: [...data.safety.allergies.items] },
      notices: data.safety.notices.flatMap((id): Coded[] => { const slug = NOTICE_SLUG[id]; return slug !== undefined && zh.has(`safety.notice.${slug}.title`) ? [{ id, label: both(`safety.notice.${slug}.title`) }] : []; }),
    };
  }
  if (on("findings")) out["findings"] = data.findings.map((f) => ({ ...symptom(f.id), ...(f.severity ? { severity: f.severity } : {}), quality: f.quality }));
  if (on("observations")) out["observations"] = { items: data.observations.items.map((o) => ({ ...symptom(o.id), quality: o.quality })), pulse: data.observations.pulse };
  if (on("constitution")) {
    const c = (id: string): Coded => ({ id, label: bilingual(kb.constitutions.find((x) => x.id === id)?.name, id) });
    out["constitution"] = data.constitution === null ? null : { primary: c(data.constitution.primary), secondary: data.constitution.secondary === null ? null : c(data.constitution.secondary) };
  }
  if (on("panel")) out["panel"] = { elements: data.panel.elements.map((e) => ({ element: ELEMENT_SLUG[e.element], label: both(`report.element.${ELEMENT_SLUG[e.element]}`), band: e.band, value: e.value })), coldHeat: { band: data.panel.coldHeat.band, value: data.panel.coldHeat.value }, deficiencyExcess: { band: data.panel.deficiencyExcess.band, value: data.panel.deficiencyExcess.value } };
  if (on("patterns")) out["patterns"] = { status: data.patterns.status, items: data.patterns.items.map((x) => ({ ...pattern(x.id), band: x.band })), confidence: data.patterns.confidence, whatWouldChange: data.whatWouldChange.map((c) => ({ symptoms: c.symptoms.map(symptom), shiftsTo: pattern(c.shiftsTo), over: pattern(c.over) })) };
  if (on("recommendations")) {
    out["recommendations"] = {
      formulas: data.recommendations.formulas.map((f) => ({ id: f.id, label: bilingual(kb.formulas.get(f.id)?.name, f.id), tier: f.tier })),
      foods: data.recommendations.foods.map((name): Coded => ({ id: kb.treatment.foods[name]?.id ?? name, label: { "zh-Hant": name, en: kb.term(name)?.en ?? null } })),
      points: data.recommendations.points.map((x): Coded => ({ id: x.code, label: { "zh-Hant": x.name, en: kb.term(x.name)?.en ?? x.code } })),
    };
  }
  if (prescription !== null && on("prescription")) {
    out["prescription"] = prescription;
    // the quantities travel with the note that they are for study and as an aid to a practitioner only (safety policy N-AMOUNTS, PD-30)
    const note = out["notice"] as Label;
    out["notice"] = { "zh-Hant": `${note["zh-Hant"]} ${zh.t("safety.notice.amounts.text")}`, en: `${note.en ?? ""} ${en.t("safety.notice.amounts.text")}`.trim() };
  }
  if (options.note !== null && options.note.trim() !== "") out["note"] = options.note;
  return out as SummaryFile;
}
