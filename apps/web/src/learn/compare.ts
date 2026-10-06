// The comparison page's model (docs/post-mvp/design/knowledge-browser.md §6): what `comparePatterns` found, as tables of words. Bands, never weights; topics, never questions (the questions of
// the bank speak to the person, and a Learn page does not).
import { comparePatterns, MAX_COMPARED, type FeatureBand } from "@tcm/engine";
import type { KnowledgeBase } from "@tcm/kb";
import type { T } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";
import type { Cell, Name, NameGroup, Section } from "./types.ts";

const key = (k: string): MessageKey => k as MessageKey;

/** The address of a comparison (`/learn/compare?ids=SP1,SP4`), relative to the language. */
export const compareHref = (ids: readonly string[]): string => `/learn/compare${ids.length === 0 ? "" : `?ids=${ids.join(",")}`}`;

export interface Wanted { readonly ids: readonly string[]; /** An id of the address names no pattern of this build. */ readonly unknown: boolean }

/** The patterns an address asks for: known, different, in the order given, at most three. */
export function parseIds(kb: KnowledgeBase, search: string): Wanted {
  const raw = (new URLSearchParams(search).get("ids") ?? "").split(",").map((x) => x.trim()).filter((x) => x !== "");
  const known = [...new Set(raw)].filter((id) => kb.patternById.has(id));
  return { ids: known.slice(0, MAX_COMPARED), unknown: known.length < new Set(raw).size };
}

export interface ComparisonModel {
  readonly ids: readonly string[];
  readonly names: readonly Name[];
  readonly sections: readonly Section[];
}

const symptomName = (kb: KnowledgeBase, id: string): Name => { const s = kb.symptoms.get(id); return s ? { "zh-Hant": s["zh-Hant"], en: s.en } : { "zh-Hant": id, en: null }; };
const bandWord = (t: T, band: FeatureBand | null): string => t.t(key(`learn.compare.band.${band ?? "none"}`));

export function comparisonPage(kb: KnowledgeBase, ids: readonly string[], t: T): ComparisonModel {
  const c = comparePatterns(kb, ids);
  const patterns = ids.map((id) => kb.patternById.get(id)!);
  const names = patterns.map((p) => p.name);
  const head = [t.t("learn.compare.col.what"), ...names.map((n) => (t.lang === "en" && n.en !== null ? n.en : t.zh(n["zh-Hant"])))];
  const prose = (zh: string, en: string): string => (t.lang === "en" ? en : t.zh(zh));
  const featureRows = (rows: typeof c.shared): Cell[][] => rows.map((r) => [symptomName(kb, r.symptomId), ...r.bands.map((b) => bandWord(t, b))]);
  const featureHead = [t.t("learn.compare.col.feature"), ...head.slice(1)];
  const topics: NameGroup[] = c.questions.map((q) => ({
    label: t.has(key(`intake.inquiry.dimension.${q.dimension}`)) ? t.t(key(`intake.inquiry.dimension.${q.dimension}`)) : q.dimension,
    items: q.symptoms.map((s) => symptomName(kb, s)),
  }));
  const sections: Section[] = [
    { id: "overview", heading: t.t("learn.compare.overview"), blocks: [{ kind: "table", caption: t.t("learn.compare.overview.caption"), head, rows: [
      [t.t("learn.pattern.group"), ...patterns.map((p) => t.t(key(`learn.group.${p.group}`)))],
      [t.t("learn.pattern.principle"), ...patterns.map((p) => prose(p.principle, p.principle_en))],
      [t.t("learn.pattern.tonguePulse"), ...patterns.map((p) => prose(p.tongue_pulse_note, p.tongue_pulse_note_en))],
    ] }] },
    { id: "shared", heading: t.t("learn.compare.shared"), blocks: c.shared.length > 0
      ? [{ kind: "plain", text: t.t("learn.compare.shared.intro") }, { kind: "table", caption: t.t("learn.compare.shared.caption"), head: featureHead, rows: featureRows(c.shared) }]
      : [{ kind: "plain", text: t.t("learn.compare.shared.none") }] },
    { id: "differ", heading: t.t("learn.compare.differ"), blocks: c.distinguishing.length > 0
      ? [{ kind: "plain", text: t.t("learn.compare.differ.intro") }, { kind: "table", caption: t.t("learn.compare.differ.caption"), head: featureHead, rows: featureRows(c.distinguishing) }]
      : [{ kind: "plain", text: t.t("learn.compare.differ.none") }] },
    { id: "questions", heading: t.t("learn.compare.questions"), blocks: topics.length > 0
      ? [{ kind: "plain", text: t.t("learn.compare.questions.intro") }, { kind: "groups", groups: topics }]
      : [{ kind: "plain", text: t.t("learn.compare.questions.none") }] },
  ];
  return { ids, names, sections };
}

/** The links a pattern page offers: compare it with each other pattern of its group, the likeliest to be confused with it. */
export function compareLinks(kb: KnowledgeBase, id: string): { href: string; name: Name; kind: string }[] {
  const p = kb.patternById.get(id);
  if (p === undefined) return [];
  return kb.patterns.filter((x) => x.group === p.group && x.id !== id).map((x) => ({ href: compareHref([id, x.id]), name: x.name, kind: "comparison" }));
}

