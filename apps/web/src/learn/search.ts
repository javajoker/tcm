// Search over what the Learn section holds (docs/post-mvp/design/knowledge-browser.md §5). The index is built from the knowledge base the session already loaded, so it adds no data and no request.
// Case, full- and half-width forms, spaces and tone marks are ignored; a result is exact, then prefix, then substring; a Simplified query on a Simplified page is also tried in its Traditional readings.
import type { KnowledgeBase } from "@tcm/kb";
import { excerpt } from "./pages.ts";
import { AVAILABLE } from "./registry.ts";
import type { LearnType, Name } from "./types.ts";

/** What a query and a name are compared as: NFKC (full-width → half-width), lower case, tone marks and spaces/punctuation removed. */
export function normalise(text: string): string {
  return text.normalize("NFKC").toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC").replace(/[\s\p{P}\p{S}]+/gu, "");
}

export interface Entry {
  readonly type: LearnType;
  readonly id: string;
  readonly name: Name;
  /** The note shown under the name in a result (pinyin of a term, the book of a quotation). */
  readonly note?: string | undefined;
  readonly noteLang?: "zh" | "pinyin" | undefined;
  /** Every form the entry can be found by, already normalised. */
  readonly forms: readonly string[];
}

export interface Index { readonly entries: readonly Entry[] }

export const forms = (...texts: readonly (string | null | undefined)[]): string[] => [...new Set(texts.filter((x): x is string => x !== null && x !== undefined && x !== "").map(normalise).filter((x) => x !== ""))];

/** The entries of every available type. A Simplified form is added when the page shows Simplified (`kb.zh`), so what the reader sees is what they can type. */
export function buildIndex(kb: KnowledgeBase): Index {
  const entries: Entry[] = [];
  const types = new Set(AVAILABLE.map((a) => a.type));
  if (types.has("pattern")) for (const p of kb.patterns) entries.push({ type: "pattern", id: p.id, name: p.name, forms: forms(p.name["zh-Hant"], kb.zh(p.name["zh-Hant"]), p.name.en, p.id) });
  if (types.has("constitution")) for (const c of kb.constitutions) entries.push({ type: "constitution", id: c.id, name: c.name, forms: forms(c.name["zh-Hant"], kb.zh(c.name["zh-Hant"]), c.name.en, c.id.replace(/^C_/, ""), c.id) });
  if (types.has("formula")) for (const f of kb.formulas.values()) entries.push({ type: "formula", id: f.id, name: f.name, forms: forms(f.name["zh-Hant"], kb.zh(f.name["zh-Hant"]), f.name.en, f.id, f.id.replace(/^F_/, "")) });
  if (types.has("point")) for (const [name, a] of Object.entries(kb.treatment.acupoints)) entries.push({ type: "point", id: a.code, name: { "zh-Hant": name, en: kb.term(name)?.en ?? a.code }, note: a.code, forms: forms(name, kb.zh(name), a.code, kb.term(name)?.en) });
  if (types.has("food")) for (const [name, f] of Object.entries(kb.treatment.foods)) entries.push({ type: "food", id: f.id, name: { "zh-Hant": name, en: kb.term(name)?.en ?? null }, forms: forms(name, kb.zh(name), f.id, kb.term(name)?.en) });
  if (types.has("term")) for (const g of kb.glossary) entries.push({ type: "term", id: g.id, name: { "zh-Hant": g["zh-Hant"], en: g.en }, note: g.pinyin, noteLang: "pinyin", forms: forms(g["zh-Hant"], kb.zh(g["zh-Hant"]), g.en, g.pinyin, ...g.alt, g.id.replace(/-/g, " ")) });
  if (types.has("quotation")) for (const c of kb.citations) entries.push({ type: "quotation", id: c.id, name: { "zh-Hant": `《${kb.zh(c.book)}》${kb.zh(c.chapter)}`, en: null }, note: excerpt(kb.zh(c.quote_zh_hant)), noteLang: "zh", forms: forms(c.book, kb.zh(c.book), c.chapter, kb.zh(c.chapter), `${c.book}${c.chapter}`, kb.zh(`${c.book}${c.chapter}`)) });
  return { entries };
}

/** How well an entry answers a query: 0 exact, 1 prefix, 2 substring, `null` no match. */
function rankOf(entry: Entry, qs: readonly string[]): 0 | 1 | 2 | null {
  let rank: 0 | 1 | 2 | null = null;
  for (const q of qs) for (const f of entry.forms) {
    const r = f === q ? 0 : f.startsWith(q) ? 1 : f.includes(q) ? 2 : null;
    if (r !== null && (rank === null || r < rank)) rank = r;
  }
  return rank;
}

/** The ids of every entry of one type that answers the query (no cap): what a list page keeps when it is filtered. */
export function matching(index: Index, type: LearnType, query: string, readings: readonly string[] = []): ReadonlySet<string> {
  const qs = forms(query, ...readings);
  return new Set(index.entries.filter((e) => e.type === type && (qs.length === 0 || rankOf(e, qs) !== null)).map((e) => e.id));
}

export interface Hit { readonly entry: Entry; /** 0 exact, 1 prefix, 2 substring */ readonly rank: 0 | 1 | 2 }
export interface Results { readonly byType: ReadonlyMap<LearnType, { readonly hits: readonly Hit[]; readonly total: number }>; readonly total: number }

export const PER_TYPE = 8;

/**
 * Results for a query, grouped by type (the type with the best match first, then the hub's order), at most `PER_TYPE` per group (`total` counts all of them, for "Show all"). `readings` are the other forms the query can stand for
 * (a Simplified query's Traditional readings); a form matching any reading counts.
 */
export function search(index: Index, query: string, readings: readonly string[] = []): Results {
  const qs = forms(query, ...readings);
  const byType = new Map<LearnType, { hits: Hit[]; total: number }>();
  if (qs.length === 0) return { byType, total: 0 };
  for (const entry of index.entries) {
    const rank = rankOf(entry, qs);
    if (rank === null) continue;
    const group = byType.get(entry.type) ?? { hits: [], total: 0 };
    group.total += 1;
    group.hits.push({ entry, rank });
    byType.set(entry.type, group);
  }
  // the kind with the best match first (an exact term before a chapter that merely starts with it), ties in the hub's order
  const kinds = AVAILABLE.map((a) => a.type).filter((type) => byType.has(type));
  const best = (type: LearnType): number => Math.min(...byType.get(type)!.hits.map((h) => h.rank));
  kinds.sort((a, b) => best(a) - best(b));                      // stable
  const ordered = new Map<LearnType, { hits: readonly Hit[]; total: number }>();
  let total = 0;
  for (const type of kinds) {
    const g = byType.get(type)!;
    g.hits.sort((a, b) => a.rank - b.rank);                    // stable: the data's order within a rank
    ordered.set(type, { hits: g.hits.slice(0, PER_TYPE), total: g.total });
    total += g.total;
  }
  return { byType: ordered, total };
}
