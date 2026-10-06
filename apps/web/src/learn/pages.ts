// The lists and pages of the Learn section, built from the records the session already holds (docs/post-mvp/design/knowledge-browser.md §3). Pure: a knowledge base and a formatter in, models out.
// Nothing is invented here — a page shows what the record says, with its source and its review state, and says "no source" where there is none.
import { featuresOf, type FeatureBand } from "@tcm/engine";
import type { Citation, Constitution, Formula, GlossaryTerm, KnowledgeBase, Pattern } from "@tcm/kb";
import type { T } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";
import { COMPOSITION_STATUS, ROLE_SLUG, SCHOOL_SLUG, tierReason, UNIT_ID } from "../screens/result/words.ts";
import { hrefOf } from "./registry.ts";
import type { Block, Caution, LinkGroup, ListGroup, LearnType, Name, PageModel, Related, Review, Section } from "./types.ts";

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
  const assoc = associatedWith(kb, t, p);
  if (assoc.length > 0) sections.push({ id: "assoc", heading: t.t("learn.page.assoc"), blocks: [{ kind: "plain", text: t.t("learn.page.assoc.intro") }, { kind: "links", groups: assoc }] });
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

// ── what the records of one kind say about another ─────────────────────────

const reviewOf = (status: string): Review => (status === "reviewed" ? "reviewed" : status === "derived" ? "derived" : status === "curated-draft" ? "curated-draft" : "draft");
/** A word of the data named in both languages: the glossary's English where it has one. */
const wordName = (kb: KnowledgeBase, zh: string, fallback: string | null = null): Name => ({ "zh-Hant": zh, en: kb.term(zh)?.en ?? fallback });
const bilingual = (zh: readonly string[], en: readonly string[]): Caution[] => zh.map((c, i) => ({ "zh-Hant": c, en: en[i] ?? c }));

const pointEntry = (kb: KnowledgeBase, code: string): readonly [string, KnowledgeBase["treatment"]["acupoints"][string]] | undefined => Object.entries(kb.treatment.acupoints).find(([, a]) => a.code === code);
const pointName = (kb: KnowledgeBase, name: string, code: string): Name => wordName(kb, name, code);
const foodName = (kb: KnowledgeBase, name: string): Name => wordName(kb, name);
const formulaLink = (f: Formula): Related => ({ href: hrefOf("formula", f.id), name: f.name, kind: "formula" });

/** Links from a pattern to the pages of what it lists: only to pages that exist in this build (a release bundle holds the tier-A formulas only). */
function associatedWith(kb: KnowledgeBase, t: T, p: Pattern): LinkGroup[] {
  const formulas = p.formulas.flatMap((id) => { const f = kb.formulas.get(id); return f === undefined ? [] : [formulaLink(f)]; });
  const points = p.treatment.acupoints.flatMap((name): Related[] => { const a = kb.treatment.acupoints[name]; return a === undefined ? [] : [{ href: hrefOf("point", a.code), name: pointName(kb, name, a.code), kind: "point" }]; });
  const foods = p.treatment.foods.flatMap((name): Related[] => { const f = kb.treatment.foods[name]; return f === undefined ? [] : [{ href: hrefOf("food", f.id), name: foodName(kb, name), kind: "food" }]; });
  return [
    { label: t.t("learn.page.assoc.formulas"), items: formulas }, { label: t.t("learn.page.assoc.points"), items: points }, { label: t.t("learn.page.assoc.foods"), items: foods },
  ].filter((g) => g.items.length > 0);
}

/** The patterns that list a point or a food (the other direction of the same association). */
const patternsListing = (kb: KnowledgeBase, field: "acupoints" | "foods", name: string): Related[] => kb.patterns.filter((p) => p.treatment[field].includes(name)).map((p) => ({ href: hrefOf("pattern", p.id), name: p.name, kind: "pattern" }));

// ── formulas ────────────────────────────────────────────────────────────────

export function formulasList(kb: KnowledgeBase, t: T): ListGroup[] {
  const all = [...kb.formulas.values()];
  return (["經方", "時方"] as const).map((school) => ({
    key: SCHOOL_SLUG[school], heading: t.t(key(`formula.school.${SCHOOL_SLUG[school]}`)),
    items: all.filter((f) => f.school === school).sort((a, b) => a.tier.localeCompare(b.tier)).map((f) => ({ id: f.id, name: f.name, note: t.t(key(`formula.tier.${f.tier}`)) })),
  })).filter((g) => g.items.length > 0);
}

export function formulaPage(kb: KnowledgeBase, id: string, t: T): PageModel | null {
  const f = kb.formulas.get(id);
  if (f === undefined) return null;
  const herb = (herbId: string, fallback: string): Name => kb.herbName(herbId)?.name ?? { "zh-Hant": fallback, en: null };
  const hasAmounts = f.composition.some((r) => r.typical_g !== undefined || r.classical_amount !== undefined);
  const amount = (r: Formula["composition"][number]): string => (r.typical_g !== undefined ? t.t("formula.composition.amount.g", { g: r.typical_g }) : r.classical_amount ? t.t("formula.composition.amount.classical", { value: r.classical_amount.value, unit: t.t(key(`formula.composition.unit.${UNIT_ID[r.classical_amount.unit]}`)) }) : "—");
  const list = new Intl.ListFormat(t.lang === "en" ? "en" : t.lang, { style: "long", type: "conjunction" });
  const flags = [
    t.t(f.pregnancy === "avoid" ? "formula.cautions.pregnancy.avoid" : f.pregnancy === "caution" ? "formula.cautions.pregnancy.caution" : "formula.cautions.pregnancy.ok"),
    f.interactions.length > 0 ? `${t.t("formula.cautions.interactions")} ${list.format(f.interactions.map((i) => t.t(key(`formula.interaction.${i}`))))}` : t.t("learn.formula.noInteraction"),
    t.t("learn.formula.allergy"),
    ...(f.tier !== "A" ? [[t.t(key(`formula.tier.${f.tier}`)), ...f.tier_reasons.map((r) => tierReason(t, r))].join("; ")] : []),
    t.t("learn.formula.practitioner"),
  ];
  const verification = COMPOSITION_STATUS[f.verification.composition_status as keyof typeof COMPOSITION_STATUS] ?? "partial";
  const sections: Section[] = [
    { id: "overview", heading: t.t("learn.formula.overview"), blocks: [
      { kind: "facts", rows: [{ label: t.t("learn.formula.school"), value: t.t(key(`formula.school.${SCHOOL_SLUG[f.school]}`)) }, { label: t.t("learn.formula.tier"), value: t.t(key(`formula.tier.${f.tier}`)) }] },
      { kind: "plain", text: t.t("formula.source", { book: t.zh(f.source.book), school: t.t(key(`formula.school.${SCHOOL_SLUG[f.school]}`)) }) },
    ] },
    { id: "principle", heading: t.t("learn.formula.principle"), blocks: [{ kind: "text", zh: f.principle, en: f.principle_en, status: f.en_status }] },
    { id: "composition", heading: t.t("learn.formula.composition"), blocks: [
      { kind: "table", caption: t.t("formula.composition.caption"), head: [t.t("formula.composition.col.role"), t.t("formula.composition.col.herb"), t.t("formula.composition.col.share"), ...(hasAmounts ? [t.t("formula.composition.col.amount")] : [])],
        rows: f.composition.map((r) => [`${t.zh(r.role)} ${t.t(key(`report.role.${ROLE_SLUG[r.role]}`))}`, herb(r.herb, r.name), t.number(r.proportion, { style: "percent", maximumFractionDigits: 0 }), ...(hasAmounts ? [amount(r)] : [])]) },
      { kind: "plain", text: t.t("formula.composition.roleNote") },
    ] },
    { id: "rationale", heading: t.t("learn.formula.rationale"), blocks: [{ kind: "text", zh: f.rationale_zh, en: f.rationale_en, status: f.en_status }] },
    { id: "verification", heading: t.t("learn.formula.verification"), blocks: [{ kind: "plain", text: t.t(key(`formula.verification.${verification}`)) }, { kind: "plain", text: t.t("formula.verification.proportion") }] },
  ];
  return {
    type: "formula", id, title: f.name, adviceLike: true, cautions: bilingual(f.cautions, f.cautions_en), flags, sections,
    citations: [...new Set([f.source.ref, ...f.rationale_citations])], review: reviewOf(f.status),
    related: f.patterns.flatMap((pid) => { const p = kb.patternById.get(pid); return p === undefined ? [] : [{ href: hrefOf("pattern", pid), name: p.name, kind: "pattern" }]; }),
  };
}

// ── acupoints ───────────────────────────────────────────────────────────────

const meridianLabel = (kb: KnowledgeBase, t: T, meridian: string): string => (t.lang === "en" ? kb.term(meridian)?.en ?? t.zh(meridian) : t.zh(meridian));

export function pointsList(kb: KnowledgeBase, t: T): ListGroup[] {
  const entries = Object.entries(kb.treatment.acupoints);
  const meridians = [...new Set(entries.map(([, a]) => a.meridian))];
  return meridians.map((m) => ({ key: m, heading: meridianLabel(kb, t, m), items: entries.filter(([, a]) => a.meridian === m).map(([name, a]) => ({ id: a.code, name: pointName(kb, name, a.code), note: a.code })) }));
}

export function pointPage(kb: KnowledgeBase, code: string, t: T): PageModel | null {
  const found = pointEntry(kb, code);
  if (found === undefined) return null;
  const [name, a] = found;
  const acupressure = kb.treatment.acupressure;
  const sections: Section[] = [
    { id: "overview", heading: t.t("learn.point.overview"), blocks: [{ kind: "facts", rows: [{ label: t.t("learn.point.code"), value: a.code }, { label: t.t("learn.point.meridian"), value: wordName(kb, a.meridian) }] }] },
    { id: "where", heading: t.t("learn.point.where"), blocks: [{ kind: "text", zh: a.location["zh-Hant"], en: a.location.en, status: "machine-draft" }] },
    { id: "method", heading: t.t("learn.point.method"), blocks: [{ kind: "text", zh: acupressure.how["zh-Hant"], en: acupressure.how.en, status: "machine-draft" }] },
  ];
  const assoc = patternsListing(kb, "acupoints", name);
  if (assoc.length > 0) sections.push({ id: "assoc", heading: t.t("learn.page.assoc"), blocks: [{ kind: "links", groups: [{ label: t.t("learn.page.assoc.patterns"), items: assoc }] }] });
  return {
    type: "point", id: a.code, title: pointName(kb, name, a.code), alias: a.code, adviceLike: true,
    cautions: [...a.cautions, ...acupressure.cautions], flags: [t.t(a.pregnancy_avoid ? "learn.point.pregnancy" : "learn.point.noPregnancy")], sections,
    citations: [], sourceLabel: a.basis, review: reviewOf(a.status),
    related: Object.entries(kb.treatment.acupoints).filter(([n, x]) => x.meridian === a.meridian && n !== name).map(([n, x]) => ({ href: hrefOf("point", x.code), name: pointName(kb, n, x.code), kind: "point" })),
  };
}

// ── foods ───────────────────────────────────────────────────────────────────

const NATURE_ORDER = ["寒", "涼", "平", "溫", "熱"];

export function foodsList(kb: KnowledgeBase, t: T): ListGroup[] {
  const entries = Object.entries(kb.treatment.foods);
  const natures = [...new Set(entries.map(([, f]) => f.nature))].sort((a, b) => { const [x, y] = [NATURE_ORDER.indexOf(a), NATURE_ORDER.indexOf(b)]; return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); });
  return natures.map((n) => ({
    key: n, heading: meridianLabel(kb, t, n),
    items: entries.filter(([, f]) => f.nature === n).map(([name, f]) => ({ id: f.id, name: foodName(kb, name), ...(f.flavors.length > 0 ? { note: f.flavors.map((x) => t.zh(x)).join(""), noteLang: "zh" as const } : {}) })),
  }));
}

export function foodPage(kb: KnowledgeBase, id: string, t: T): PageModel | null {
  const found = Object.entries(kb.treatment.foods).find(([, f]) => f.id === id);
  if (found === undefined) return null;
  const [name, f] = found;
  const sections: Section[] = [
    { id: "overview", heading: t.t("learn.food.overview"), blocks: [{ kind: "facts", rows: [{ label: t.t("learn.food.nature"), value: wordName(kb, f.nature) }] },
      ...(f.flavors.length > 0 ? [{ kind: "groups" as const, groups: [{ label: t.t("learn.food.flavors"), items: f.flavors.map((x) => wordName(kb, x)) }] }] : []),
      ...(f.functions.length > 0 ? [{ kind: "groups" as const, groups: [{ label: t.t("learn.food.functions"), items: f.functions.map((x) => wordName(kb, x)) }] }] : [])] },
    { id: "rationale", heading: t.t("learn.food.rationale"), blocks: [{ kind: "text", zh: f.rationale["zh-Hant"], en: f.rationale.en, status: "machine-draft" }] },
  ];
  const assoc = patternsListing(kb, "foods", name);
  if (assoc.length > 0) sections.push({ id: "assoc", heading: t.t("learn.page.assoc"), blocks: [{ kind: "links", groups: [{ label: t.t("learn.page.assoc.patterns"), items: assoc }] }] });
  return {
    type: "food", id, title: foodName(kb, name), alias: f.id, adviceLike: true,
    cautions: f.cautions, flags: [t.t(f.pregnancy_caution ? "report.diet.pregnancy" : "learn.food.noPregnancy"), t.t("learn.food.allergy")], sections,
    citations: f.citations, sourceLabel: t.t(key(`report.diet.basis.${f.basis}`)), review: reviewOf(f.status),
    related: [],
  };
}

// ── by type ─────────────────────────────────────────────────────────────────

export function listOf(kb: KnowledgeBase, type: LearnType, t: T): ListGroup[] {
  switch (type) {
    case "term": return termsList(kb, t);
    case "quotation": return quotationsList(kb, t);
    case "pattern": return patternsList(kb, t);
    case "constitution": return constitutionsList(kb, t);
    case "formula": return formulasList(kb, t);
    case "point": return pointsList(kb, t);
    case "food": return foodsList(kb, t);
    default: return [];
  }
}

export function pageOf(kb: KnowledgeBase, type: LearnType, id: string, t: T): PageModel | null {
  switch (type) {
    case "term": return termPage(kb, id, t);
    case "quotation": return quotationPage(kb, id, t);
    case "pattern": return patternPage(kb, id, t);
    case "constitution": return constitutionPage(kb, id, t);
    case "formula": return formulaPage(kb, id, t);
    case "point": return pointPage(kb, id, t);
    case "food": return foodPage(kb, id, t);
    default: return null;
  }
}
