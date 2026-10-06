// The lists and pages of the Learn section, built from the records the session already holds (docs/post-mvp/design/knowledge-browser.md §3). Pure: a knowledge base and a formatter in, models out.
// Nothing is invented here — a page shows what the record says, with its source and its review state, and says "no source" where there is none.
import type { Citation, GlossaryTerm, KnowledgeBase } from "@tcm/kb";
import type { T } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";
import { hrefOf } from "./registry.ts";
import type { ListGroup, LearnType, PageModel, Review } from "./types.ts";

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
    type: "term", id, title: { "zh-Hant": term["zh-Hant"], en: term.en }, alias: term.pinyin, adviceLike: false, cautions: [], flags: [],
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

// ── by type ─────────────────────────────────────────────────────────────────

export function listOf(kb: KnowledgeBase, type: LearnType, t: T): ListGroup[] {
  switch (type) {
    case "term": return termsList(kb, t);
    case "quotation": return quotationsList(kb, t);
    default: return [];
  }
}

export function pageOf(kb: KnowledgeBase, type: LearnType, id: string, t: T): PageModel | null {
  switch (type) {
    case "term": return termPage(kb, id, t);
    case "quotation": return quotationPage(kb, id, t);
    default: return null;
  }
}
