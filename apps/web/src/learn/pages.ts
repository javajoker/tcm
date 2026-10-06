// The lists and pages of the Learn section, built from the records the session already holds (docs/post-mvp/design/knowledge-browser.md §3). Pure: a knowledge base and a formatter in, models out.
// Nothing is invented here — a page shows what the record says, with its source and its review state, and says "no source" where there is none.
import { featuresOf, type FeatureBand } from "@tcm/engine";
import type { Citation, Constitution, GlossaryTerm, KnowledgeBase, Pattern } from "@tcm/kb";
import type { T } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";
import { hrefOf } from "./registry.ts";
import type { Block, ListGroup, LearnType, Name, PageModel, Review, Section } from "./types.ts";

const key = (k: string): MessageKey => k as MessageKey;

/** The order of the glossary's domains on the list; one the data adds later goes last. */
export const DOMAIN_ORDER = ["theory", "zangfu", "substance", "bagang", "liuxie", "product", "nature", "diagnosis", "tongue", "pulse", "constitution", "treatment", "formula", "herb", "wuxing", "yunqi", "season", "calendar", "bazi"] as const;

const termReview = (s: GlossaryTerm["status"]): Review => (s === "reviewed" ? "reviewed" : "needs-review");

// ── terms ───────────────────────────────────────────────────────────────────

export function termsList(kb: KnowledgeBase, t: T): ListGroup[] {
  const by = new Map<string, GlossaryTerm[]>();
  for (const term of kb.glossary) by.set(term.domain, [...(by.get(term.domain) ?? []), term]);
  const domains = [...DOMAIN_ORDER.filter((d) => by.has(d)), ...[...by.keys()].filter((d) => !(DOMAIN_ORDER as readonly string[]).includes(d)).sort()];
  return domains.map((d) => ({ key: d, heading: t.t(key(`learn.domain.${d}`)), items: by.get(d)!.map((term) => ({ id: term.id, name: { "zh-Hant": term["zh-Hant"], en: term.en }, note: term.pinyin, noteLang: "pinyin" as const })) }));
}

export function termPage(kb: KnowledgeBase, id: string, t: T): PageModel | null {
  const term = kb.glossary.find((x) => x.id === id);
  if (term === undefined) return null;
  const same = kb.glossary.filter((x) => x.domain === term.domain && x.id !== term.id).slice(0, 8);
  return {
    type: "term", id, title: { "zh-Hant": term["zh-Hant"], en: term.en }, alias: term.pinyin, aliasLang: "pinyin", adviceLike: false, cautions: [], flags: [],
    sections: [{ id: "meaning", heading: t.t("learn.term.meaning"), blocks: [
      { kind: "facts", rows: [
        { label: t.t("learn.term.chinese"), value: t.zh(term["zh-Hant"]), lang: "zh" }, { label: t.t("learn.term.pinyin"), value: term.pinyin, lang: "pinyin" }, { label: t.t("learn.term.english"), value: term.en, lang: "en" },
        ...(term.alt.length > 0 ? [{ label: t.t("learn.term.alt"), value: term.alt.join("; "), lang: "en" as const }] : []),
        { label: t.t("learn.term.domain"), value: t.t(key(`learn.domain.${term.domain}`)) },
      ] },
      ...(term.note ? [{ kind: "plain" as const, text: term.note }] : []),
    ] }],
    citations: [], sourceLabel: t.t(key(`learn.source.${term.source === "who-istm-2007" ? "who" : term.source}`)), review: termReview(term.status),
    related: same.map((x) => ({ href: hrefOf("term", x.id), name: { "zh-Hant": x["zh-Hant"], en: x.en }, kind: "term" })),
  };
}

// ── quotations ──────────────────────────────────────────────────────────────

/** Book and chapter are two data strings: each is converted for display on its own and the title is joined after (a joined string is not in the display list). */
const quoteTitle = (t: T, c: Citation): string => `《${t.zh(c.book)}》${t.zh(c.chapter)}`;
/** The first words of a passage, for a list line (code points, so a character outside the basic plane is never cut in two). */
export const excerpt = (text: string, max = 28): string => { const chars = [...text]; return chars.length > max ? `${chars.slice(0, max).join("")}…` : text; };

export function quotationsList(kb: KnowledgeBase, t: T): ListGroup[] {
  const books: string[] = [];
  for (const c of kb.citations) if (!books.includes(c.book)) books.push(c.book);
  return books.map((book) => ({ key: book, heading: `《${t.zh(book)}》`, items: kb.citations.filter((c) => c.book === book).map((c) => ({ id: c.id, name: { "zh-Hant": c.chapter, en: null }, note: excerpt(t.zh(c.quote_zh_hant)), noteLang: "zh" as const })) }));
}

export function quotationPage(kb: KnowledgeBase, id: string, t: T): PageModel | null {
  const c = kb.citation(id);
  if (c === undefined) return null;
  const rows = [
    { label: t.t("learn.quotation.book"), value: `《${t.zh(c.book)}》`, lang: "zh" as const }, { label: t.t("learn.quotation.chapter"), value: t.zh(c.chapter), lang: "zh" as const },
    ...(c.clause_no !== undefined ? [{ label: t.t("learn.quotation.clause"), value: String(c.clause_no) }] : []),
  ];
  const sameBook = kb.citations.filter((x) => x.book === c.book && x.id !== c.id).slice(0, 8);
  return {
    type: "quotation", id, title: { "zh-Hant": quoteTitle(t, c), en: null }, adviceLike: false, cautions: [], flags: [],
    sections: [
      { id: "text", heading: t.t("learn.quotation.text"), blocks: [{ kind: "quote", zh: c.quote_zh_hant }] },
      { id: "about", heading: t.t("learn.quotation.about"), blocks: [{ kind: "facts", rows }, { kind: "plain", text: t.t("learn.quotation.noTranslation") }] },
    ],
    citations: [], sourceLabel: c.source_repo ?? t.t("learn.quotation.sourceUnknown"), review: c.verified ? "checked" : "unchecked",
    related: sameBook.map((x) => ({ href: hrefOf("quotation", x.id), name: { "zh-Hant": quoteTitle(t, x), en: null }, kind: "quotation" })),
  };
}

// ── patterns ────────────────────────────────────────────────────────────────

/** The groups of the pattern list in the data's own order of first appearance. */
const groupsOf = (patterns: readonly Pattern[]): string[] => [...new Set(patterns.map((p) => p.group))];

/** The principle of a pattern in the page language (the English is a machine draft until it is reviewed, and the page says so through the draft label). */
const principleNote = (t: T, p: Pattern): { note: string; noteLang?: "zh" } => (t.lang === "en" ? { note: p.principle_en } : { note: t.zh(p.principle), noteLang: "zh" });

export function patternsList(kb: KnowledgeBase, t: T): ListGroup[] {
  return groupsOf(kb.patterns).map((g) => ({ key: g, heading: t.t(key(`learn.group.${g}`)), items: kb.patterns.filter((p) => p.group === g).map((p) => ({ id: p.id, name: p.name, ...principleNote(t, p) })) }));
}

const symptomName = (kb: KnowledgeBase, id: string): Name => { const s = kb.symptoms.get(id); return s ? { "zh-Hant": s["zh-Hant"], en: s.en } : { "zh-Hant": id, en: null }; };
const BANDS: readonly FeatureBand[] = ["key", "common", "supporting", "against"];

export function patternPage(kb: KnowledgeBase, id: string, t: T): PageModel | null {
  const p = kb.patternById.get(id);
  if (p === undefined) return null;
  const features = featuresOf(p.weights, p.against);
  const bands = BANDS.map((b) => ({ label: t.t(key(`learn.band.${b}`)), items: features.filter((f) => f.band === b).map((f) => symptomName(kb, f.symptomId)) })).filter((g) => g.items.length > 0);
  const status = p.en_status === "machine-draft" ? ("machine-draft" as const) : ("reviewed" as const);
  const featureBlocks: Block[] = [{ kind: "plain", text: t.t("learn.pattern.features.intro") }, { kind: "groups", groups: bands }];
  if (p.required_any.length > 0) featureBlocks.push({ kind: "groups", groups: [{ label: t.t("learn.pattern.required"), items: p.required_any.map((s) => symptomName(kb, s)) }] });
  const elements = p.elements.flatMap((e) => { const el = kb.elementById.get(e); return el === undefined ? [] : [el.name]; });
  const sections: Section[] = [
    { id: "overview", heading: t.t("learn.pattern.overview"), blocks: [{ kind: "facts", rows: [{ label: t.t("learn.pattern.group"), value: t.t(key(`learn.group.${p.group}`)) }] }] },
    { id: "principle", heading: t.t("learn.pattern.principle"), blocks: [{ kind: "text", zh: p.principle, en: p.principle_en, status }] },
    { id: "tongue-pulse", heading: t.t("learn.pattern.tonguePulse"), blocks: [{ kind: "text", zh: p.tongue_pulse_note, en: p.tongue_pulse_note_en, status }] },
    { id: "features", heading: t.t("learn.pattern.features"), blocks: featureBlocks },
    ...(elements.length > 0 ? [{ id: "elements", heading: t.t("learn.pattern.elements"), blocks: [{ kind: "plain" as const, text: t.t("learn.pattern.elements.intro") }, { kind: "groups" as const, groups: [{ label: null, items: elements }] }] }] : []),
  ];
  const same = kb.patterns.filter((x) => x.group === p.group && x.id !== p.id);
  return {
    type: "pattern", id, title: p.name, alias: p.id, adviceLike: false, cautions: [], flags: [], sections,
    citations: p.citations, review: "draft",
    related: same.map((x) => ({ href: hrefOf("pattern", x.id), name: x.name, kind: "pattern" })),
  };
}

// ── constitutions ───────────────────────────────────────────────────────────

const LIUXIE: Readonly<Record<string, string>> = { 風: "wind", 寒: "cold", 暑: "summerheat", 濕: "damp", 燥: "dry", 火: "fire" };

export function constitutionsList(kb: KnowledgeBase, t: T): ListGroup[] {
  const desc = (c: Constitution): string | undefined => kb.constitutionItems.types.find((x) => x.constitution === c.id)?.description[t.lang === "en" ? "en" : "zh-Hant"];
  return [{ key: "all", heading: null, items: kb.constitutions.map((c) => { const d = desc(c); return { id: c.id, name: c.name, ...(d === undefined ? {} : t.lang === "en" ? { note: d } : { note: t.zh(d), noteLang: "zh" as const }) }; }) }];
}

export function constitutionPage(kb: KnowledgeBase, id: string, t: T): PageModel | null {
  const c = kb.constitutions.find((x) => x.id === id);
  if (c === undefined) return null;
  const description = kb.constitutionItems.types.find((x) => x.constitution === id)?.description;
  const list = new Intl.ListFormat(t.lang === "en" ? "en" : t.lang, { style: "long", type: "conjunction" });
  const prone = Object.entries(c.susceptibility).filter(([, risk]) => risk > 0).sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1)).map(([qi, risk]) => t.t("learn.constitution.prone.item", { name: LIUXIE[qi] === undefined ? t.zh(qi) : t.t(key(`report.liuxie.${LIUXIE[qi]}`)), level: t.t(risk >= 2 ? "learn.level.marked" : "learn.level.some") }));
  const sections: Section[] = [
    ...(description !== undefined ? [{ id: "overview", heading: t.t("learn.constitution.overview"), blocks: [{ kind: "text" as const, zh: description["zh-Hant"], en: description.en, status: "machine-draft" as const }, { kind: "plain" as const, text: t.t("learn.constitution.notLabel") }] }] : []),
    ...(c.features.length > 0 ? [{ id: "features", heading: t.t("learn.constitution.features"), blocks: [{ kind: "groups" as const, groups: [{ label: null, items: c.features.map((s) => symptomName(kb, s)) }] }] }] : []),
    ...(c.prior_nature.length > 0 ? [{ id: "nature", heading: t.t("learn.constitution.nature"), blocks: [{ kind: "groups" as const, groups: [{ label: null, items: c.prior_nature.map((w): Name => ({ "zh-Hant": w, en: kb.term(w)?.en ?? null })) }] }] }] : []),
    ...(prone.length > 0 ? [{ id: "prone", heading: t.t("learn.constitution.prone"), blocks: [{ kind: "plain" as const, text: list.format(prone) }] }] : []),
  ];
  return {
    type: "constitution", id, title: c.name, adviceLike: false, cautions: [], flags: [], sections, citations: [],
    sourceLabel: t.t("learn.source.constitution"), review: "draft",
    related: kb.constitutions.filter((x) => x.id !== c.id).map((x) => ({ href: hrefOf("constitution", x.id), name: x.name, kind: "constitution" })),
  };
}

// ── by type ─────────────────────────────────────────────────────────────────

export function listOf(kb: KnowledgeBase, type: LearnType, t: T): ListGroup[] {
  switch (type) {
    case "term": return termsList(kb, t);
    case "quotation": return quotationsList(kb, t);
    case "pattern": return patternsList(kb, t);
    case "constitution": return constitutionsList(kb, t);
    default: return [];
  }
}

export function pageOf(kb: KnowledgeBase, type: LearnType, id: string, t: T): PageModel | null {
  switch (type) {
    case "term": return termPage(kb, id, t);
    case "quotation": return quotationPage(kb, id, t);
    case "pattern": return patternPage(kb, id, t);
    case "constitution": return constitutionPage(kb, id, t);
    default: return null;
  }
}
