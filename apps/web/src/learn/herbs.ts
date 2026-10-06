// The herb pages (PM-25; docs/post-mvp/design/knowledge-browser.md): the list and the page of a herb, built from the browser's rows and one shard's detail. Pure, like the other kinds: a knowledge base, a record and a formatter in, a model out.
// A page shows what the record says — its stored flags first, in the page's own words — and where the record comes from; nothing else is invented here.
import type { HerbDetail, HerbPregnancy, HerbRow, KnowledgeBase } from "@tcm/kb";
import type { T } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";
import { hrefOf } from "./registry.ts";
import { forms } from "./search.ts";
import type { Block, Caution, ListGroup, ListItem, Name, PageModel, Related, Review, Section } from "./types.ts";

const key = (k: string): MessageKey => k as MessageKey;

/** The categories of the materia medica in the order a textbook lists them, each with the stable slug its English words are filed under. A category this table does not know goes last, in Chinese. */
export const CATEGORIES: readonly (readonly [string, string])[] = [
  ["解表藥", "exterior"], ["清熱藥", "heat"], ["瀉下藥", "purgative"], ["祛風濕藥", "windDamp"], ["化濕藥", "damp"], ["利水滲濕藥", "water"], ["溫裡藥", "interior"], ["理氣藥", "qi"],
  ["消食藥", "digestant"], ["驅蟲藥", "anthelmintic"], ["止血藥", "hemostatic"], ["活血化瘀藥", "blood"], ["化痰止咳平喘藥", "phlegm"], ["安神藥", "spirit"], ["平肝息風藥", "liver"],
  ["開竅藥", "orifice"], ["補虛藥", "tonify"], ["收澀藥", "astringent"], ["湧吐藥", "emetic"], ["攻毒殺蟲止癢藥", "toxin"], ["拔毒化腐生肌藥", "drawing"], ["藥食同源（人工補充）", "food"],
];
/** 四氣, coldest to hottest. */
export const NATURES: readonly (readonly [string, string])[] = [["大寒", "veryCold"], ["寒", "cold"], ["微寒", "slightlyCold"], ["涼", "cool"], ["平", "neutral"], ["微溫", "slightlyWarm"], ["溫", "warm"], ["熱", "hot"], ["大熱", "veryHot"]];
/** 五味 and the bland. */
export const FLAVORS: readonly (readonly [string, string])[] = [["辛", "pungent"], ["苦", "bitter"], ["甘", "sweet"], ["酸", "sour"], ["澀", "astringent"], ["鹹", "salty"], ["淡", "bland"]];
/** The two channels the glossary has no English for. */
const CHANNELS: readonly (readonly [string, string])[] = [["三焦", "sanjiao"], ["心包", "pericardium"]];

const slugIn = (table: readonly (readonly [string, string])[], zh: string): string | undefined => table.find(([z]) => z === zh)?.[1];

/** A word of the data in the page's language: Chinese in the page's script, English from the catalogue (or, for a channel, the glossary) — and the Chinese again when there is no English. */
function word(t: T, table: readonly (readonly [string, string])[], area: string, zh: string): string {
  if (t.lang !== "en") return t.zh(zh);
  const slug = slugIn(table, zh);
  return slug === undefined ? t.zh(zh) : t.t(key(`learn.herb.${area}.${slug}`));
}
export const categoryLabel = (t: T, zh: string): string => word(t, CATEGORIES, "category", zh);
export const natureLabel = (t: T, zh: string): string => word(t, NATURES, "nature", zh);
export const flavorLabel = (t: T, zh: string): string => word(t, FLAVORS, "flavor", zh);
export function channelLabel(kb: KnowledgeBase, t: T, zh: string): string {
  if (t.lang !== "en") return t.zh(zh);
  const slug = slugIn(CHANNELS, zh);
  return slug !== undefined ? t.t(key(`learn.herb.channel.${slug}`)) : kb.term(zh)?.en ?? t.zh(zh);
}
const list = (t: T, items: readonly string[]): string => new Intl.ListFormat(t.lang === "en" ? "en" : t.lang, { style: "long", type: "conjunction" }).format(items);

const reviewOf = (status: string): Review => (status === "reviewed" ? "reviewed" : status === "derived" ? "derived" : status === "curated-draft" ? "curated-draft" : "draft");

// ── the list ────────────────────────────────────────────────────────────────

/** The marks a list shows under a herb: the stored flags that matter before anything else about it. */
export function marksOf(t: T, row: Pick<HerbRow, "toxic" | "pregnancy">): string[] {
  return [
    ...(row.toxic ? [t.t("learn.herb.mark.toxic")] : []),
    ...(row.pregnancy === "avoid" ? [t.t("learn.herb.mark.avoid")] : row.pregnancy === "caution" ? [t.t("learn.herb.mark.caution")] : []),
  ];
}

export interface HerbFilter {
  /** What was typed, and the other forms it can stand for (a Simplified query's Traditional readings). */
  readonly query: string;
  readonly readings: readonly string[];
  /** A nature of the data (`溫`), or "" for every herb. */
  readonly nature: string;
}

/** Every form a herb can be found by, normalised: the Chinese name (and what the page shows), the English and Latin names, the slug and the functions. */
export function formsOf(kb: KnowledgeBase, row: HerbRow): readonly string[] {
  return forms(row.name["zh-Hant"], kb.zh(row.name["zh-Hant"]), row.name.en, row.latin, row.slug, ...row.functions, ...row.functions.map((f) => kb.zh(f)));
}

/** The slugs of the herbs that answer the filter: the nature, and the text as a form that is (or begins) any of the herb's forms, or occurs in one. */
export function matchingHerbs(kb: KnowledgeBase, rows: readonly HerbRow[], filter: HerbFilter, cache: ReadonlyMap<string, readonly string[]> = new Map()): ReadonlySet<string> {
  const qs = forms(filter.query, ...filter.readings);
  const out = new Set<string>();
  for (const r of rows) {
    if (filter.nature !== "" && !r.nature.includes(filter.nature)) continue;
    if (qs.length > 0 && !(cache.get(r.slug) ?? formsOf(kb, r)).some((f) => qs.some((q) => f.includes(q)))) continue;
    out.add(r.slug);
  }
  return out;
}

/** The herbs by category, in the textbook's order and the data's own order within a category. */
export function herbGroups(t: T, rows: readonly HerbRow[]): ListGroup[] {
  const order = new Map(CATEGORIES.map(([zh], i) => [zh, i] as const));
  const categories = [...new Set(rows.map((r) => r.category))].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  return categories.map((c) => ({
    key: slugIn(CATEGORIES, c) ?? c, heading: categoryLabel(t, c),
    items: rows.filter((r) => r.category === c).map((r): ListItem => ({
      id: r.slug, name: r.name, note: r.functions.map((f) => t.zh(f)).join("、"), noteLang: "zh", marks: marksOf(t, r),
    })),
  }));
}

/** The natures a list can be filtered by: those the herbs have, coldest first. */
export const naturesOf = (rows: readonly HerbRow[]): string[] => {
  const present = new Set(rows.flatMap((r) => r.nature));
  return [...NATURES.map(([zh]) => zh).filter((zh) => present.has(zh)), ...[...present].filter((n) => slugIn(NATURES, n) === undefined).sort()];
};

// ── the page ────────────────────────────────────────────────────────────────

/** What the data's `source.book` says of a herb added by hand: there is no book. */
const NO_BOOK = "—";
const pregnancyKey = (level: HerbPregnancy): MessageKey => key(`learn.herb.pregnancy.${level}`);

/** The formulas of this build that use the herb, or whose classical name the source lists it in: only those that exist here (a public build has the tier-A formulas only). */
function formulasOf(kb: KnowledgeBase, d: HerbDetail): { readonly here: Related[]; readonly elsewhere: Name[] } {
  const id = `herb-${d.slug}`;
  const byName = new Map([...kb.formulas.values()].map((f) => [f.name["zh-Hant"], f] as const));
  const here = new Map<string, Related>();
  for (const f of kb.formulas.values()) if (f.composition.some((c) => c.herb === id)) here.set(f.id, { href: hrefOf("formula", f.id), name: f.name, kind: "formula" });
  const elsewhere: Name[] = [];
  for (const name of d.classicalFormulas) {
    const f = byName.get(name);
    if (f !== undefined) here.set(f.id, { href: hrefOf("formula", f.id), name: f.name, kind: "formula" });
    else elsewhere.push({ "zh-Hant": name, en: null });
  }
  return { here: [...here.values()], elsewhere };
}

export function herbPage(kb: KnowledgeBase, d: HerbDetail, t: T): PageModel {
  const flags = [
    t.t(d.toxic ? "learn.herb.toxic" : "learn.herb.notToxic"),
    t.t(pregnancyKey(d.pregnancy)),
    d.interactions.length > 0 ? `${t.t("formula.cautions.interactions")} ${list(t, d.interactions.map((i) => t.t(key(`formula.interaction.${i}`))))}` : t.t("learn.herb.noInteraction"),
    t.t("learn.herb.allergy"),
    t.t("learn.herb.practitioner"),
  ];
  const cautions: Caution[] = d.caution !== null ? [{ "zh-Hant": d.caution }] : [];
  const used = formulasOf(kb, d);
  const overview: Block[] = [{ kind: "facts", rows: [
    { label: t.t("learn.herb.category"), value: categoryLabel(t, d.category) },
    { label: t.t("learn.herb.nature"), value: list(t, d.nature.map((n) => natureLabel(t, n))) },
    { label: t.t("learn.herb.flavors"), value: d.flavors.length > 0 ? list(t, d.flavors.map((f) => flavorLabel(t, f))) : t.t("learn.herb.none") },
    { label: t.t("learn.herb.channels"), value: d.channels.length > 0 ? list(t, d.channels.map((c) => channelLabel(kb, t, c))) : t.t("learn.herb.none") },
    ...(d.latin !== null ? [{ label: t.t("learn.herb.latin"), value: d.latin, lang: "la" as const }] : []),
    ...(d.aliases !== undefined ? [{ label: t.t("learn.herb.aliases"), value: d.aliases.map((a) => t.zh(a)).join("、"), lang: "zh" as const }] : []),
  ] }];
  const sections: Section[] = [
    { id: "overview", heading: t.t("learn.herb.overview"), blocks: overview },
    { id: "functions", heading: t.t("learn.herb.functions"), blocks: [
      { kind: "groups", groups: [{ label: null, items: d.functions.map((f): Name => ({ "zh-Hant": f, en: null })) }] },
      ...(t.lang === "en" ? [{ kind: "plain" as const, text: t.t("learn.herb.functions.note") }] : []),
    ] },
  ];
  if (used.here.length > 0 || used.elsewhere.length > 0) {
    sections.push({ id: "formulas", heading: t.t("learn.herb.formulas"), blocks: [
      ...(used.here.length > 0 ? [{ kind: "links" as const, groups: [{ label: t.t("learn.herb.formulas.here"), items: used.here }] }] : []),
      ...(used.elsewhere.length > 0 ? [{ kind: "groups" as const, groups: [{ label: t.t("learn.herb.formulas.classical"), items: used.elsewhere }] }] : []),
    ] });
  }
  return {
    type: "herb", id: d.slug, title: d.name, adviceLike: true, cautions, flags, sections, citations: [],
    sourceLabel: d.source.book === NO_BOOK ? t.t("learn.herb.source.byHand") : t.t("learn.herb.source", { book: t.zh(d.source.book), entry: d.source.entry }), review: reviewOf(d.status),
    draftNote: d.status === "reviewed" ? undefined : t.t(d.status === "derived" ? "learn.herb.draft.derived" : "learn.herb.draft.curated"), related: [],
  };
}

