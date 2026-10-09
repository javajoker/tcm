// The herb handbook (task PM-62): a quick dictionary of the knowledge base's herbs for the readers of the app, printable — one A4 PDF in each language of the app. Each entry is what the
// herb's page in Learn shows (the herb browser's record: its stored flags and the source's caution first, R1 and R7 of the knowledge-browser design; then its category, nature, flavours,
// channels, functions, formulas and source), with the reading of the herb property model (PM-36) added — in words and on a scale, never as a quantity — and its 七情, 引經 and 量效 where the
// knowledge base records them. The appendices: indexes (pinyin; stroke count in the Traditional edition; Latin and English names), the herbs by nature, flavour and channel, the safety
// lists (toxicity, pregnancy, interactions, 十八反 and 十九畏), the 七情 table, 引經報使, 炮製, 量效, the model's rules, the glossary, and the works it draws on.
//   node scripts/print-herbs.ts            write print/herbs-{zh-Hant,zh-Hans,en}.{html,pdf}   (pnpm print:herbs)
//   node scripts/print-herbs.ts --study    the study edition instead: print/herbs-study-*.{html,pdf}   (pnpm print:herbs:study; PM-64)
//   node scripts/print-herbs.ts --html     the HTML only (no browser needed)
//   env: APP_OVERRIDES, APP_DOSE_DISPLAY — the build's restrictions, applied as the bundle applies them (scripts/bundle-data.ts)
// The herbs are those of the closed beta (the release profile with the draft label: every herb, each with its status, and the formulas a release build has). A herb entry gives no amount: a herb
// page never carries a dose or a weight (check-release rule 15). A formula gives what its page gives every reader — each herb's share, and the original text's amounts in its own units — and
// only the study edition adds the reference grams and the herbs' ranges, never for a toxic herb (PD-30's study reference, in print). Its words are the app's (the `learn` and `formula` catalogs) and its own (`handbook`, checked by
// check-i18n, converted to Simplified by build_hans and reviewed with the interface text); the data's Chinese is shown in the edition's script through the Simplified dictionary, as the app
// shows it. Like the editions of the book and the course, the PDFs are derived and git-ignored, and a draft says so on its cover and on every page.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { incompatiblePairs } from "../packages/engine/src/safety.ts";
import { createI18n, type I18n, type Message } from "../packages/i18n/src/index.ts";
import { buildChunks, type DataFiles } from "../packages/kb/src/bundle.ts";
import { hasChinese } from "../packages/kb/src/hans.ts";
import { indexKnowledgeBase, withReference } from "../packages/kb/src/indexer.ts";
import type { Sources } from "../packages/kb/src/generated/sources.ts";
import type { Bilingual, Citation, DoseBand, Formula, Herb, HerbDetail, KnowledgeBase, Pairing, ProcessingMethod } from "../packages/kb/src/types.ts";
import type { ReviewedUnit } from "../packages/kb/node/book.ts";
import { readDataFiles } from "../packages/kb/node/fromDisk.ts";
import { overridesOf } from "./bundle-data.ts";
import { esc, OUT, printHtml } from "./print-editions.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_DIR = join(root, "apps", "web", "src", "i18n");
/** The review target of the interface text (scripts/kb/review.py `CATALOGS`), and the namespaces the handbook's words come from. */
export const CATALOGS = "apps/web/src/i18n";
export const NAMESPACES = ["handbook", "learn", "formula", "report", "safety"] as const;

export type HandbookLang = "zh-Hant" | "zh-Hans" | "en";
export const HANDBOOK_LANGS: readonly HandbookLang[] = ["zh-Hant", "zh-Hans", "en"];

// ── the vocabulary of the herb pages (the same tables as apps/web/src/learn/herbs.ts; a test of the web app keeps them equal) ──────────────────────────────────────

/** The categories of the materia medica in the order a textbook lists them, each with the slug its English words are filed under. */
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
export const CHANNELS: readonly (readonly [string, string])[] = [["三焦", "sanjiao"], ["心包", "pericardium"]];
/** The twelve channels in the order qi flows through them, 肺 to 肝: the order of the lookup by channel. */
export const CHANNEL_ORDER: readonly string[] = ["肺", "大腸", "胃", "脾", "心", "小腸", "膀胱", "腎", "心包", "三焦", "膽", "肝"];
/** The five phases in the order of the model's `five_phase` shares. */
const PHASES = ["木", "火", "土", "金", "水"] as const;
/** The 七情 the table holds, in the order the classics name them (相反 is never computed: the safety rules exclude the pair). */
const PAIRING_TYPES = [["相須", "xu"], ["相使", "shi"], ["相畏", "wei"], ["相惡", "wu"]] as const;
/** The toxicity grades from the strongest, as the property model stores them. */
const GRADES = [["大毒", "strong"], ["有毒", "toxic"], ["小毒", "mild"]] as const;
/** The two schools of the formula list, in its order, with the slug of their words (the app's SCHOOL_SLUG). */
const SCHOOLS = [["經方", "jingfang"], ["時方", "shifang"]] as const;
/** 君臣佐使, with the slug of their words (the app's ROLE_SLUG). */
export const ROLES = [["君", "sovereign"], ["臣", "minister"], ["佐", "assistant"], ["使", "envoy"]] as const;
/** How far a classical 加減's name was found in the book it is credited to. */
const MODIFY_CHECKED: Readonly<Record<string, string>> = { "variant-name-found-in-source-book": "found", "variant-name-not-found-in-source-book": "notFound", "source-book-not-in-reference": "notInSources" };
/** The two lists of herbs not to combine, with the slug of their words. */
const LISTS = [["十八反", "shibafan"], ["十九畏", "shijiuwei"]] as const;
const BU_XIE: Readonly<Record<string, string>> = { 補: "bu", 瀉: "xie", 平: "even" };
const RUN_ZAO: Readonly<Record<string, string>> = { 潤: "run", 燥: "zao", 平: "even" };
const QI_XUE: Readonly<Record<string, string>> = { 氣: "qi", 血: "xue", 兼: "both" };

/** The property model's conventions as herbs.json writes them (`_meta.conventions.props`, which the schema leaves open): the reading of the direction and the rules with their citations. */
interface PropsConventions {
  readonly params: { readonly direction_label: { readonly up: number; readonly down: number } };
  readonly rules: Readonly<Record<string, { readonly says: string; readonly citation: string | null }>>;
}
const conventionsOf = (files: DataFiles): PropsConventions => files.herbs._meta.conventions["props"] as PropsConventions;

const slugIn = (table: readonly (readonly [string, string])[], zh: string): string | undefined => table.find(([z]) => z === zh)?.[1];

// ── the handbook, in no language yet ────────────────────────────────────────

export interface HandbookHerb {
  /** The entry's number, from 1 in the handbook's order. */
  readonly no: number;
  /** What the herb's page shows: the herb browser's record. */
  readonly detail: HerbDetail;
  /** The knowledge base's record, for the property model's reading (`props`). */
  readonly record: Herb;
  /** The 七情 pairs the herb is in, on either side, as the table holds them. */
  readonly pairings: readonly Pairing[];
  /** The channels the classical table names it a guide to (引經報使). */
  readonly yinjing: readonly string[];
  /** Its 量效 passage, if the knowledge base has one. */
  readonly band: DoseBand | undefined;
  /** The herbs 十八反 and 十九畏 say not to combine it with, by id: the pairs the safety rules stop (the engine's own match over the table). */
  readonly incompatible: readonly { readonly list: "十八反" | "十九畏"; readonly other: string }[];
}
export interface Handbook {
  /** The standard edition gives no modern quantity; the study edition adds the formulas' reference grams and the herbs' ranges (PD-30's study reference, in print). */
  readonly edition: "standard" | "study";
  /** In the handbook's order: by category as a textbook lists them, then in the data's order (the herb list's order). */
  readonly herbs: readonly HandbookHerb[];
  /** The formulas of the part on formulas, in the formula list's order: 經方 then 時方, each by tier. */
  readonly formulas: readonly Formula[];
  /** Whether the reader sees the classical 加減 (the profile's `show_formula_modification`). */
  readonly modifications: boolean;
  readonly files: DataFiles;
  /** The knowledge base the closed beta's default reader reads (PD-30): a learner's where the build serves the study reference to every reader, else a general reader's. */
  readonly kb: KnowledgeBase;
  /** A learner's knowledge base — the formulas with their reference quantities — where the build serves the study reference at all; the study edition is printed from it. */
  readonly studyKb: KnowledgeBase | null;
  readonly citations: ReadonlyMap<string, Citation>;
  readonly status: "draft" | "reviewed";
  /** The hash of what the handbook prints from the data: which data an edition is of. */
  readonly version: string;
}

const sha16 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
/** JSON with sorted keys and no whitespace, as Python's `json.dumps(…, ensure_ascii=False, sort_keys=True, separators=(",", ":"))` writes it. */
export function canonicalJson(node: unknown): string {
  if (Array.isArray(node)) return `[${node.map(canonicalJson).join(",")}]`;
  if (node !== null && typeof node === "object") return `{${Object.keys(node).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((node as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(node);
}
/** The hash a review record names for a namespace of the interface text (scripts/kb/review.py `unit_hash` of its Traditional Chinese and English messages). */
export const namespaceHash = (messages: { readonly "zh-Hant": unknown; readonly en: unknown }): string => sha16(canonicalJson({ "zh-Hant": messages["zh-Hant"], en: messages.en }));

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/** Whether the words the handbook prints are reviewed: the whole interface text, or each namespace it uses, by a valid record of its current text. */
export function wordsReviewed(reviewed: readonly ReviewedUnit[]): boolean {
  const hashes = new Map(reviewed.filter((u) => u.file === CATALOGS).map((u) => [u.unit, u.hash]));
  const namespaces = readdirSync(join(CATALOG_DIR, "zh-Hant")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  const units = Object.fromEntries(namespaces.map((ns) => [ns, namespaceHash({ "zh-Hant": readJson(join(CATALOG_DIR, "zh-Hant", `${ns}.json`)), en: readJson(join(CATALOG_DIR, "en", `${ns}.json`)) })]));
  const whole = sha16(Object.entries(units).sort(([a], [b]) => (a < b ? -1 : 1)).map(([u, h]) => `${u}:${h}`).join("\n"));
  return hashes.get("*") === whole || NAMESPACES.every((ns) => hashes.get(ns) === units[ns]);
}

/** The handbook is reviewed only when everything it prints is: every herb and formula, every row of its tables, the safety rules, the glossary — and its words. */
export function statusOf(files: DataFiles, textReviewed: boolean): Handbook["status"] {
  const records = [...files.herbs.items, ...files.formulas.items, ...files.pairings.items, ...files.processing.methods, ...files.doseBands.items, ...files.glossary.items];
  return textReviewed && records.every((r) => r.status === "reviewed") && files.safety._meta.status === "reviewed" ? "reviewed" : "draft";
}

/** The handbook from the data as the repository holds it. */
export function handbook(files: DataFiles = readDataFiles(), reviewed: readonly ReviewedUnit[] = readJson<{ reviewed: ReviewedUnit[] }>(join(root, "data", "review", "records.json")).reviewed, overrides?: unknown): Handbook {
  // the closed beta: the release profile with its draft label carries every herb in the browser, each with its status (`overrides` narrow it, as at build time)
  const built = buildChunks(files, { profile: "release", version: "handbook", draftLabel: true, overrides });
  if (built.herbFiles === null) throw new Error("the closed beta carries no herb browser");
  const details = new Map(Object.values(built.herbFiles.shards).flatMap((s) => Object.entries(s.items)));
  const order = new Map(CATEGORIES.map(([zh], i) => [zh, i] as const));
  const inOrder = files.herbs.items.map((h, i) => ({ h, i })).sort((a, b) => (order.get(a.h.category) ?? CATEGORIES.length) - (order.get(b.h.category) ?? CATEGORIES.length) || a.i - b.i);
  // the reader: the closed beta's default — a learner, who reads with the study reference, where the build serves it to every reader (dose_display all, PD-30; the app's
  // defaultRoleOf), else a general reader. A learner sees every formula and the classical 加減; the handbook still prints no amount of anything.
  const general = indexKnowledgeBase(built.chunks);
  const studyKb = built.referenceFile !== null ? indexKnowledgeBase(withReference(built.chunks, built.referenceFile, "learner"), undefined, "learner", general) : null;
  const kb = general.config.profile.dose_display === "all" && studyKb !== null ? studyKb : general;
  const pairs = incompatiblePairs(kb, files.herbs.items.map((h) => h.id));
  const herbs = inOrder.map(({ h }, k): HandbookHerb => {
    const detail = details.get(h.slug);
    if (detail === undefined) throw new Error(`the herb browser has no page for ${h.slug}`);
    return {
      no: k + 1, detail, record: h,
      pairings: files.pairings.items.filter((p) => p.herb === h.id || p.other === h.id),
      yinjing: files.yinjing.channels.filter((c) => c.herbs.includes(h.id)).map((c) => c.channel),
      band: files.doseBands.items.find((b) => b.herb === h.id),
      incompatible: [...new Map(pairs.filter((p) => p.herbs.includes(h.id)).map((p) => {
        const other = p.herbs[0] === h.id ? p.herbs[1] : p.herbs[0];
        return [`${p.list} ${other}`, { list: p.list, other }] as const;
      })).values()],
    };
  });
  const formulas = formulasIn(kb);
  // everything the handbook prints from the data: the herbs, the formulas, the tables, the passages it quotes and the works it names
  const version = sha16(canonicalJson([herbs.map((h) => [h.detail, h.record.props, h.pairings.map((p) => p.id), h.yinjing, h.band?.citation ?? null]), files.formulas.items,
    files.pairings.items, files.processing, files.doseBands.items, files.yinjing.channels, files.safety.incompatibilities, files.glossary.items, conventionsOf(files),
    files.citations.items, readJson<Sources>(join(root, "data", "sources.json")).items]));
  return {
    edition: "standard", herbs, formulas, modifications: kb.config.profile.features.show_formula_modification, files, kb, studyKb, citations: new Map(files.citations.items.map((c) => [c.id, c])),
    status: statusOf(files, wordsReviewed(reviewed)), version,
  };
}

/** The formulas of a knowledge base in the formula list's order: 經方 then 時方, each by tier. */
function formulasIn(kb: KnowledgeBase): readonly Formula[] {
  const all = [...kb.formulas.values()];
  const formulas = SCHOOLS.flatMap(([school]) => all.filter((f) => f.school === school).sort((a, b) => a.tier.localeCompare(b.tier)));
  if (formulas.length !== all.length) throw new Error(`a formula of a school the handbook does not know: ${all.filter((f) => !formulas.includes(f)).map((f) => f.id).join(", ")}`);
  return formulas;
}

/** The study edition: a learner's formulas with their reference grams and the herbs' ranges — printed only where the build serves the study reference (dose_display is not off, PD-30). */
export function studyEdition(hb: Handbook): Handbook {
  if (hb.studyKb === null) throw new Error("the build serves no study reference (dose_display is off, or an override takes it away): there is no study edition");
  return { ...hb, edition: "study", kb: hb.studyKb, formulas: formulasIn(hb.studyKb), modifications: hb.studyKb.config.profile.features.show_formula_modification };
}

// ── words ───────────────────────────────────────────────────────────────────

export interface Words {
  readonly lang: HandbookLang;
  readonly t: I18n<string>;
  /** A Chinese string of the data in the edition's script: itself, or its Simplified form from the committed dictionary — each string on its own, as the app converts it. */
  zh(text: string): string;
  /** The script of the data's Chinese in this edition. */
  readonly zhLang: "zh-Hant" | "zh-Hans";
}

/** The words of an edition: the app's catalogs and the handbook's, strict — a key missing in the edition's language is an error, never a fallback. */
export function wordsFor(lang: HandbookLang): Words {
  const catalog = (l: HandbookLang): Record<string, Message> => Object.assign({}, ...NAMESPACES.map((ns) => readJson<Record<string, Message>>(join(CATALOG_DIR, l, `${ns}.json`))));
  const dictionary = readJson<{ entries: Record<string, string> }>(join(root, "scripts", "i18n", "zh-Hans.dictionary.json")).entries;
  const zh = (text: string): string => {
    if (lang !== "zh-Hans" || !hasChinese(text)) return text;
    const s = dictionary[text];
    if (s === undefined) throw new Error(`no Simplified form in the dictionary for ${JSON.stringify(text)}`);
    return s;
  };
  const t = createI18n<string>({ "zh-Hant": catalog("zh-Hant"), en: catalog("en"), "zh-Hans": catalog("zh-Hans") }, lang, {
    zh,
    onMissing: (key) => { throw new Error(`the handbook uses the message ${key}, which no catalog has`); },
    onFallback: (key) => { throw new Error(`the ${lang} catalog has no message ${key}`); },
  });
  return { lang, t, zh: t.zh, zhLang: lang === "zh-Hans" ? "zh-Hans" : "zh-Hant" };
}

const en = (w: Words): boolean => w.lang === "en";
/** A message as HTML: its text escaped, its parameters HTML already (data the caller escaped, or numbers). */
function msg(w: Words, key: string, params: Readonly<Record<string, string | number>> = {}, n?: number): string {
  const marks = Object.fromEntries(Object.keys(params).map((k, i) => [k, `\u0000${i}\u0000`]));
  const text = esc(n === undefined ? w.t.t(key, marks) : w.t.plural(key, n, marks));
  return text.replace(/\u0000(\d+)\u0000/g, (_, i: string) => String(Object.values(params)[Number(i)]));
}
/** Chinese of the data, in the edition's script; in the English edition marked as Chinese. */
const cn = (w: Words, text: string): string => (en(w) ? `<span lang="zh-Hant">${esc(text)}</span>` : esc(w.zh(text)));
const list = (w: Words, items: readonly string[]): string => items.join(en(w) ? ", " : "、");
/** Chinese items of the data, joined as Chinese is in every edition. */
const cnList = (w: Words, items: readonly string[]): string => items.map((x) => cn(w, x)).join("、");
const word = (w: Words, table: readonly (readonly [string, string])[], area: string, zh: string): string => {
  const slug = slugIn(table, zh);
  return en(w) && slug !== undefined ? esc(w.t.t(`learn.herb.${area}.${slug}`)) : cn(w, zh);
};
export const categoryWord = (w: Words, zh: string): string => word(w, CATEGORIES, "category", zh);
export const natureWord = (w: Words, zh: string): string => word(w, NATURES, "nature", zh);
export const flavorWord = (w: Words, zh: string): string => word(w, FLAVORS, "flavor", zh);
/** A channel: in English the catalog's word for the two the glossary lacks, otherwise the glossary's (as the herb page words it). */
export function channelWord(w: Words, kb: KnowledgeBase, zh: string): string {
  if (!en(w)) return cn(w, zh);
  const slug = slugIn(CHANNELS, zh);
  return slug !== undefined ? esc(w.t.t(`learn.herb.channel.${slug}`)) : kb.term(zh)?.en !== undefined ? esc(kb.term(zh)!.en) : cn(w, zh);
}
const phaseWord = (w: Words, hb: Handbook, zh: string): string => {
  const term = hb.files.glossary.items.find((g) => g["zh-Hant"] === zh && g.domain === "wuxing");
  return en(w) && term !== undefined ? esc(term.en) : cn(w, zh);
};
/** 十 for 10, 十二 for 12: the appendices' numbers in Chinese. */
const NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五"];
/** The herb's pinyin, from its address (the app's slug, the toneless pinyin of its name). */
export const pinyinOf = (h: HandbookHerb): string => h.detail.slug.replace(/_/g, "");
const numberOf = (hb: Handbook, no: number): string => String(no).padStart(String(hb.herbs.length).length, "0");
export const anchorOf = (slug: string): string => `herb-${slug}`;
export const formulaAnchor = (id: string): string => `formula-${id}`;
const herbsById = (hb: Handbook): ReadonlyMap<string, HandbookHerb> => new Map(hb.herbs.map((h) => [h.record.id, h] as const));
/** A herb named where another part of the handbook lists it: its name (and pinyin in English), with a link to its entry by number. */
function herbRef(w: Words, hb: Handbook, h: HandbookHerb): string {
  return `<a href="#${anchorOf(h.detail.slug)}">${cn(w, h.detail.name["zh-Hant"])}${en(w) ? ` <span class="py">${esc(pinyinOf(h))}</span>` : ""}<span class="no">${numberOf(hb, h.no)}</span></a>`;
}
const quote = (w: Words, c: Citation): string =>
  `<figure class="quote"><blockquote>「${cn(w, c.quote_zh_hant)}」</blockquote><figcaption>——《${cn(w, c.book)}·${cn(w, c.chapter)}》</figcaption></figure>`;
const sourceOf = (w: Words, c: Citation): string => `《${cn(w, c.book)}·${cn(w, c.chapter)}》`;
/** A number in the edition's language (a quantity: up to three decimals, as the source writes 0.015). */
const num = (w: Words, x: number): string => esc(w.t.number(x, { maximumFractionDigits: 3 }));
/** The classical units of the original texts and the key of each one's English name (the app's UNIT_ID); a Chinese edition writes the unit as the text does (枚 is not 個). */
const UNITS: Readonly<Record<string, string>> = { 兩: "liang", 斤: "jin", 升: "sheng", 合: "ge", 個: "piece", 枚: "piece" };
/** A label of an entry's line: 【類別】 in Chinese, "Category:" in English. */
const label = (w: Words, key: string): string => (en(w) ? `<b class="l">${msg(w, key)}:</b> ` : `<b class="l">【${msg(w, key)}】</b>`);

// ── an entry ────────────────────────────────────────────────────────────────

/** The stored flags in words, before anything else about the herb (R1, R7): the toxicity with its grade, the pregnancy level, the interactions — or a line saying none is recorded. */
export function marksOf(w: Words, h: HandbookHerb): string[] {
  const d = h.detail;
  const grade = GRADES.find(([g]) => g === h.record.props.toxicity);
  return [
    ...(d.toxic ? [grade !== undefined ? msg(w, "handbook.mark.toxicity", { grade: msg(w, `handbook.grade.${grade[1]}`) }) : msg(w, "learn.herb.mark.toxic")] : []),
    ...(d.pregnancy === "avoid" ? [msg(w, "learn.herb.mark.avoid")] : d.pregnancy === "caution" ? [msg(w, "learn.herb.mark.caution")] : []),
    ...(d.interactions.length > 0 ? [`${msg(w, "formula.cautions.interactions")}${en(w) ? " " : ""}${list(w, d.interactions.map((i) => msg(w, `formula.interaction.${i}`)))}`] : []),
  ];
}

/** A value on the model's scale from −1 to +1: a line, its middle, the band read as even (for the direction) and the herb's mark. */
function scale(v: number, band: boolean, described: string): string {
  const x = (50 + 46 * Math.max(-1, Math.min(1, v))).toFixed(1);
  return `<svg class="scale" viewBox="0 0 100 16" role="img" aria-label="${described}"><title>${described}</title>`
    + (band ? `<rect x="40.8" y="2" width="18.4" height="12" fill="#cfcfcf"/>` : "")
    + `<line x1="2" y1="8" x2="98" y2="8" stroke="#555" stroke-width="1.4"/><line x1="50" y1="2" x2="50" y2="14" stroke="#555" stroke-width="1.4"/>`
    + `<circle cx="${x}" cy="8" r="4.6" fill="#111"/></svg>`;
}
const signed = (v: number): string => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(2)}`;
/** The direction as the model's scale reads it: 升浮 at or above `up`, 沉降 at or below `down`, otherwise even (`_meta.conventions.props.scales.direction`). */
export function directionOf(hb: Handbook, v: number): "up" | "down" | "even" {
  const { up, down } = conventionsOf(hb.files).params.direction_label;
  return v >= up ? "up" : v <= down ? "down" : "even";
}

/** The study edition's reference quantity of a herb: the range its source entry gives, with the note — and none for a toxic herb, whose quantity a practitioner decides. */
export function rangeLine(w: Words, h: HandbookHerb): string {
  const r = h.record.dose_g_reference;
  if (r === null) return "";
  if (h.detail.toxic) return `<p class="caution">${label(w, "handbook.study.field.range")}${msg(w, "handbook.study.toxic")}</p>`;
  const book = h.detail.source.book === "—" ? "" : `${en(w) ? " (" : "（"}${cn(w, h.detail.source.book)}${en(w) ? ")" : "）"}`;
  return `<p class="qty">${label(w, "handbook.study.field.range")}${msg(w, "handbook.study.range", { from: num(w, r[0]), to: num(w, r[1]) })}${book} <span class="note">${msg(w, "handbook.study.rangeNote")}</span></p>`;
}

/** The property model's reading of a herb (PM-36): 陰陽 and 升降浮沉 on their scales, the five phases in per cent, 補瀉, 潤燥 and 氣血 in words. */
function modelLine(w: Words, hb: Handbook, h: HandbookHerb): string {
  const p = h.record.props;
  const phases = PHASES.map((ph, i) => [ph, Math.round((p.five_phase?.[i] ?? 0) * 100)] as const).filter(([, pct]) => pct > 0).sort((a, b) => b[1] - a[1]);
  const reading = (key: string, value: string): string => `${msg(w, key)}${en(w) ? ": " : "："}${value}`;
  /** A reading drawn on a scale: its name, the scale and the scale's ends kept on one line. */
  const scaled = (key: string, drawn: string, after = ""): string => `<span class="sc">${msg(w, key)}${en(w) ? ": " : "："}${drawn}</span>${after}`;
  const parts = [
    scaled("handbook.model.yinyang", `${msg(w, "handbook.model.yin")}${scale(p.yinyang, false, msg(w, "handbook.model.yinyang.value", { value: signed(p.yinyang) }))}${msg(w, "handbook.model.yang")}`),
    // the direction's scale runs from sinking (↓) to rising (↑); the reading in words follows it
    scaled("handbook.model.direction", `↓${scale(p.direction, true, msg(w, "handbook.model.direction.value", { value: signed(p.direction), band: String(conventionsOf(hb.files).params.direction_label.up) }))}↑`,
      ` ${msg(w, `handbook.model.direction.${directionOf(hb, p.direction)}`)}`),
    ...(phases.length > 0 ? [reading("handbook.model.phases", list(w, phases.map(([ph, pct]) => `${phaseWord(w, hb, ph)} ${pct}%`)))] : []),
    reading("handbook.model.buXie", msg(w, `handbook.model.buXie.${BU_XIE[p.bu_xie]!}`)),
    reading("handbook.model.runZao", msg(w, `handbook.model.runZao.${RUN_ZAO[p.run_zao]!}`)),
    ...(p.qi_xue !== null ? [reading("handbook.model.qiXue", msg(w, `handbook.model.qiXue.${QI_XUE[p.qi_xue]!}`))] : []),
  ];
  return `<p class="model">${label(w, "handbook.field.model")}${parts.join(" · ")}</p>`;
}

/** The formulas of the build that use the herb or whose name the source lists it in, and the other classical formulas it lists, by name (the herb page's own sections). */
export function formulasOf(kb: KnowledgeBase, d: HerbDetail): { readonly here: readonly { readonly id: string; readonly name: Bilingual }[]; readonly elsewhere: readonly string[] } {
  const id = `herb-${d.slug}`;
  const byName = new Map([...kb.formulas.values()].map((f) => [f.name["zh-Hant"], f] as const));
  const here = new Map<string, Bilingual>();
  for (const f of kb.formulas.values()) if (f.composition.some((c) => c.herb === id)) here.set(f.id, f.name);
  const elsewhere: string[] = [];
  for (const name of d.classicalFormulas) {
    const f = byName.get(name);
    if (f !== undefined) here.set(f.id, f.name);
    else elsewhere.push(name);
  }
  return { here: [...here].map(([fid, name]) => ({ id: fid, name })), elsewhere };
}

/** The source library's own note left in a statement written for its developers ("(textbook statement, unverified)"): the handbook says it in its own words. */
const DEV_NOTE = /\s*\([ -~]*\)$/;

export function entryHtml(w: Words, hb: Handbook, h: HandbookHerb): string {
  const d = h.detail, kb = hb.kb;
  const marks = marksOf(w, h);
  const lines: string[] = [];
  lines.push(marks.length > 0 ? `<p class="marks">${marks.join(" · ")}</p>` : `<p class="marks none">${msg(w, "handbook.mark.none")}</p>`);
  if (d.caution !== null) lines.push(`<p class="caution">${label(w, "handbook.field.caution")}${cn(w, d.caution)}${en(w) ? ` <span class="note">${msg(w, "learn.herb.caution.zhOnly")}</span>` : ""}</p>`);
  if (h.incompatible.length > 0) {
    const byId = herbsById(hb);
    const lists = LISTS.map(([list, key]) => [key, h.incompatible.filter((x) => x.list === list).map((x) => byId.get(x.other)!).sort((a, b) => a.no - b.no)] as const).filter(([, hs]) => hs.length > 0);
    lines.push(`<p class="caution">${label(w, "handbook.field.incompatible")}${lists.map(([key, hs]) => msg(w, `handbook.incompatible.${key}`, { list: list(w, hs.map((x) => herbRef(w, hb, x))) })).join(en(w) ? "; " : "；")}</p>`);
  }
  const none = msg(w, "learn.herb.none");
  lines.push(`<p>${label(w, "learn.herb.category")}${categoryWord(w, d.category)} ${label(w, "learn.herb.nature")}${d.nature.length > 0 ? list(w, d.nature.map((n) => natureWord(w, n))) : none} `
    + `${label(w, "learn.herb.flavors")}${d.flavors.length > 0 ? list(w, d.flavors.map((f) => flavorWord(w, f))) : none} ${label(w, "learn.herb.channels")}${d.channels.length > 0 ? list(w, d.channels.map((c) => channelWord(w, kb, c))) : none}</p>`);
  lines.push(`<p>${label(w, "learn.herb.functions")}${d.functions.length > 0 ? cnList(w, d.functions) : none}</p>`);
  const part = h.record.props.part;
  if (part !== null || d.aliases !== undefined) {
    lines.push(`<p>${part !== null ? `${label(w, "handbook.field.part")}${cn(w, part)}` : ""}${part !== null && d.aliases !== undefined ? " " : ""}${d.aliases !== undefined ? `${label(w, "learn.herb.aliases")}${cnList(w, d.aliases)}` : ""}</p>`);
  }
  if (hb.edition === "study") { const range = rangeLine(w, h); if (range !== "") lines.push(range); }
  lines.push(modelLine(w, hb, h));
  if (h.pairings.length > 0) {
    // each relation as the source's sentence, which names both herbs; the side that restrains in a 相畏 is its 相殺, as the table's own words have it
    const keyOf = (p: Pairing): string => (p.type === "相畏" && p.other === h.record.id ? "sha" : PAIRING_TYPES.find(([t]) => t === p.type)![1]);
    const groups = ["xu", "shi", "wei", "sha", "wu"].map((key) => [key, [...new Set(h.pairings.filter((p) => keyOf(p) === key).map((p) => p.says))]] as const).filter(([, says]) => says.length > 0);
    lines.push(`<p>${label(w, "handbook.field.pairings")}${groups.map(([key, says]) => `${msg(w, `handbook.pairing.${key}`)}${says.map((s) => `「${cn(w, s)}」`).join("")}`).join(en(w) ? "; " : "；")}</p>`);
  }
  if (h.yinjing.length > 0) lines.push(`<p>${label(w, "handbook.field.yinjing")}${cnList(w, h.yinjing)}</p>`);
  if (h.band !== undefined) {
    const c = hb.citations.get(h.band.citation);
    if (c === undefined) throw new Error(`the 量效 of ${d.slug} cites ${h.band.citation}, which is not a citation`);
    lines.push(`<p>${label(w, "handbook.field.band")}「${cn(w, c.quote_zh_hant)}」——${sourceOf(w, c)}</p>`);
  }
  const used = formulasOf(kb, d);
  if (used.here.length > 0 || used.elsewhere.length > 0) {
    // a formula of the handbook links to its entry in the part on formulas
    const name = (f: { readonly id: string; readonly name: Bilingual }): string => `<a href="#${formulaAnchor(f.id)}">${en(w) && f.name.en !== null ? esc(f.name.en) : cn(w, f.name["zh-Hant"])}</a>`;
    lines.push(`<p>${label(w, "learn.herb.formulas")}${[
      ...(used.here.length > 0 ? [msg(w, "handbook.formulas.here", { list: list(w, used.here.map(name)) })] : []),
      ...(used.elsewhere.length > 0 ? [msg(w, "handbook.formulas.classical", { list: cnList(w, used.elsewhere) })] : []),
    ].join(en(w) ? "; " : "；")}</p>`);
  }
  const source = d.source.book === "—" ? msg(w, "learn.herb.source.byHand") : msg(w, "learn.herb.source", { book: cn(w, d.source.book), entry: esc(d.source.entry) });
  lines.push(`<p class="source">${label(w, "handbook.field.source")}${source} · ${msg(w, `handbook.record.${d.status === "reviewed" ? "reviewed" : d.status === "derived" ? "derived" : "curated"}`)}</p>`);
  const head = `<h3><span class="no">${numberOf(hb, h.no)}</span><span class="name">${cn(w, d.name["zh-Hant"])}</span><span class="py">${esc(pinyinOf(h))}</span>`
    + `${d.name.en !== null ? `<span class="en">${esc(d.name.en)}</span>` : ""}${d.latin !== null ? `<i class="la" lang="la">${esc(d.latin)}</i>` : ""}</h3>`;
  return `<article class="entry" id="${anchorOf(d.slug)}">${head}\n${lines.join("\n")}</article>`;
}

// ── the parts of the book ───────────────────────────────────────────────────

/** The appendices of an edition, in order: the stroke-count index only in the Traditional edition (the counts are the Traditional forms'). */
export function appendicesOf(lang: HandbookLang): readonly string[] {
  return ["pinyin", ...(lang === "zh-Hant" ? ["strokes"] : []), "names", "lookup", "safety", "pairings", "yinjing", "processing", "bands", "model", "glossary", "sources"];
}
const appendixNo = (w: Words, id: string): string => {
  const i = appendicesOf(w.lang).indexOf(id);
  if (i < 0) throw new Error(`no appendix ${id}`);
  return msg(w, "handbook.appendixNo", { n: en(w) ? String(i + 1) : NUMERALS[i]! });
};
const appendixHead = (w: Words, id: string): string => `<h1>${appendixNo(w, id)}${en(w) ? " " : "　"}${msg(w, `handbook.appendix.${id}`)}</h1>`;
const appendix = (w: Words, id: string, body: string): string => `<section class="part" id="app-${id}">${appendixHead(w, id)}\n${body}\n</section>`;
const intro = (w: Words, key: string, params: Readonly<Record<string, string | number>> = {}): string => `<p class="intro">${msg(w, key, params)}</p>`;
/** Herbs as a run of references, in the order of their entries. */
const refs = (w: Words, hb: Handbook, herbs: readonly HandbookHerb[]): string => `<p class="refs">${[...herbs].sort((a, b) => a.no - b.no).map((h) => herbRef(w, hb, h)).join(en(w) ? ", " : "、")}</p>`;
const group = (w: Words, hb: Handbook, heading: string, herbs: readonly HandbookHerb[]): string =>
  herbs.length === 0 ? "" : `<h3>${heading} <span class="count">${msg(w, "handbook.count", {}, herbs.length)}</span></h3>\n${refs(w, hb, herbs)}`;

const study = (hb: Handbook): boolean => hb.edition === "study";
/** The edition's title: the study edition says what it is wherever the title stands (the document, the footer). */
const titleOf = (w: Words, hb: Handbook): string => msg(w, study(hb) ? "handbook.study.title" : "handbook.title");

function cover(w: Words, hb: Handbook): string {
  return `<section class="cover"><p class="kind">${msg(w, study(hb) ? "handbook.study.kind" : "handbook.kind")}</p><h1>${msg(w, "handbook.title")}</h1><p class="subtitle">${msg(w, "handbook.subtitle", {}, hb.herbs.length)}</p>`
    + `<p class="status${hb.status === "reviewed" ? " reviewed" : ""}">${msg(w, study(hb) ? `handbook.study.cover.${hb.status}` : `handbook.cover.${hb.status}`)}</p>`
    + `<p class="version">${msg(w, "handbook.version", { version: hb.version })}</p></section>`;
}

function about(w: Words, hb: Handbook): string {
  const herbs = hb.herbs;
  const books = [...new Set(herbs.map((h) => h.detail.source.book))].sort((a, b) => (a === "—" ? 1 : b === "—" ? -1 : herbs.filter((h) => h.detail.source.book === b).length - herbs.filter((h) => h.detail.source.book === a).length));
  const sources = books.map((b) => {
    const n = herbs.filter((h) => h.detail.source.book === b).length;
    return b === "—" ? msg(w, "handbook.about.source.byHand", {}, n) : msg(w, "handbook.about.source", { book: cn(w, b) }, n);
  });
  const count = (status: string): number => herbs.filter((h) => h.detail.status === status).length;
  const items = ["head", "cautions", "facts", "model", "relations", "formulas", "source"].map((k) => `<li>${msg(w, `handbook.about.read.${k}`, { model: appendixNo(w, "model") })}</li>`).join("");
  return [
    `<section class="part" id="about"><h1>${msg(w, "handbook.about.title")}</h1>`,
    ...(study(hb) ? [`<p class="notice">${msg(w, "handbook.study.about")}</p>`, `<p class="notice">${msg(w, "safety.notice.amounts.text")}</p>`] : []),
    `<p>${msg(w, "handbook.about.what", {}, herbs.length)}</p>`,
    `<p>${msg(w, "handbook.about.sources", { list: sources.join(en(w) ? "; " : "；") })}</p>`,
    `<p>${msg(w, "handbook.about.review", { derived: count("derived"), curated: count("curated-draft"), reviewed: count("reviewed") })}${hb.status === "draft" ? `${en(w) ? " " : ""}${msg(w, "handbook.about.draft")}` : ""}</p>`,
    ...(en(w) ? [`<p>${msg(w, "learn.herb.functions.note")}</p>`] : []),
    ...(w.lang === "zh-Hans" ? [`<p>${msg(w, "handbook.about.hans")}</p>`] : []),
    `<h2>${msg(w, "handbook.about.safety.title")}</h2>`,
    `<ul class="safety"><li>${msg(w, "handbook.about.safety.recorded")}</li><li>${msg(w, "handbook.about.safety.notRecorded")}</li><li>${msg(w, "handbook.about.safety.allergy")}</li>`,
    `<li>${msg(w, study(hb) ? "handbook.study.practitioner" : "handbook.about.safety.practitioner")}</li><li>${msg(w, "handbook.about.safety.incompatible", { safety: appendixNo(w, "safety") })}</li></ul>`,
    `<h2>${msg(w, "handbook.about.read.title")}</h2>`, `<p>${msg(w, "handbook.about.read.intro")}</p>`, `<ol class="read">${items}</ol>`,
    `<h2>${msg(w, "handbook.about.model.title")}</h2>`, `<p>${msg(w, "handbook.about.model.text", { model: appendixNo(w, "model") })}</p>`, `<p>${msg(w, "handbook.about.model.scale")}</p>`,
    "</section>",
  ].join("\n");
}

function contents(w: Words, hb: Handbook): string {
  const cats = CATEGORIES.map(([zh]) => [zh, hb.herbs.filter((h) => h.detail.category === zh)] as const).filter(([, hs]) => hs.length > 0);
  const extra = [...new Set(hb.herbs.map((h) => h.detail.category))].filter((c) => slugIn(CATEGORIES, c) === undefined);
  if (extra.length > 0) throw new Error(`categories outside the textbook's list: ${extra.join("、")}`);
  return [
    `<section class="part" id="contents"><h1>${msg(w, "handbook.contents.title")}</h1><ol class="toc">`,
    `<li><a href="#about">${msg(w, "handbook.about.title")}</a></li>`,
    ...cats.map(([zh, hs]) => `<li><a href="#cat-${slugIn(CATEGORIES, zh)!}">${categoryWord(w, zh)}</a><span class="range">${msg(w, "handbook.contents.range", { from: numberOf(hb, hs[0]!.no), to: numberOf(hb, hs[hs.length - 1]!.no) })}</span></li>`),
    `<li><a href="#formulas">${msg(w, "handbook.formulas.part.title")}</a><span class="range">${msg(w, "handbook.formulas.count", {}, hb.formulas.length)}</span></li>`,
    ...appendicesOf(w.lang).map((id) => `<li><a href="#app-${id}">${appendixNo(w, id)}${en(w) ? " " : "　"}${msg(w, `handbook.appendix.${id}`)}</a></li>`),
    "</ol></section>",
  ].join("\n");
}

function body(w: Words, hb: Handbook): string {
  return CATEGORIES.map(([zh, slug]) => {
    const hs = hb.herbs.filter((h) => h.detail.category === zh);
    if (hs.length === 0) return "";
    return `<section class="category" id="cat-${slug}"><h2>${categoryWord(w, zh)} <span class="count">${msg(w, "handbook.count", {}, hs.length)}</span></h2>\n<div class="cols">\n${hs.map((h) => entryHtml(w, hb, h)).join("\n")}\n</div></section>`;
  }).join("\n");
}

// ── the part on formulas ────────────────────────────────────────────────────

/** A role of 君臣佐使 in the edition's words: the character in Chinese, the glossary's English with it in English. */
const roleWord = (w: Words, role: string): string => {
  const slug = ROLES.find(([r]) => r === role)?.[1];
  return en(w) && slug !== undefined ? `${msg(w, `report.role.${slug}`)} <span lang="zh-Hant">${esc(role)}</span>` : cn(w, role);
};

/** A formula's tier reason, stated in English by the knowledge base, in the edition's words (the app's tierReason). */
export function tierReasonOf(w: Words, reason: string): string {
  let m = /^contains a strong herb: (.+)$/.exec(reason);
  if (m) return msg(w, "formula.tier.reason.strong", { herbs: list(w, m[1]!.split(/,\s*|、/).map((h) => cn(w, h))) });
  m = /^blood-activating herbs carry (\d+)% of the effective weight$/.exec(reason);
  if (m) return msg(w, "formula.tier.reason.blood", { pct: `${m[1]}%` });
  m = /^bitter-cold herbs carry (\d+)% of the effective weight$/.exec(reason);
  if (m) return msg(w, "formula.tier.reason.bitter", { pct: `${m[1]}%` });
  if (reason === "contains an aristolochic-acid risk herb") return msg(w, "formula.tier.reason.aristolochic");
  if (reason === "outside the MVP: learning only") return msg(w, "formula.tier.reason.outside");
  return esc(reason);
}

/** What a formula's record flags, first (R1, R7): the pregnancy level, the interactions, and for tiers B and C the tier with its reasons. */
export function formulaMarksOf(w: Words, f: Formula): string[] {
  return [
    ...(f.pregnancy === "avoid" ? [msg(w, "learn.herb.mark.avoid")] : f.pregnancy === "caution" ? [msg(w, "learn.herb.mark.caution")] : []),
    ...(f.interactions.length > 0 ? [`${msg(w, "formula.cautions.interactions")}${en(w) ? " " : ""}${list(w, f.interactions.map((i) => msg(w, `formula.interaction.${i}`)))}`] : []),
    ...(f.tier !== "A" ? [`${msg(w, `formula.tier.${f.tier}`)}${en(w) ? ": " : "："}${list(w, f.tier_reasons.map((r) => tierReasonOf(w, r)))}`] : []),
  ];
}

/** A herb of a composition or a 加減: its entry in the handbook, under the name the formula writes when that differs from the record's (芍藥 for 白芍), and its toxicity marked. */
function compositionHerb(w: Words, hb: Handbook, id: string, written: string): string {
  const h = herbsById(hb).get(id);
  if (h === undefined) return cn(w, written);
  const grade = GRADES.find(([g]) => g === h.record.props.toxicity);
  const tox = h.detail.toxic ? ` <span class="tox">${grade !== undefined ? msg(w, `handbook.grade.${grade[1]}`) : msg(w, "learn.herb.mark.toxic")}</span>` : "";
  return `${written === h.detail.name["zh-Hant"] ? herbRef(w, hb, h) : `${cn(w, written)}${en(w) ? " (" : "（"}${herbRef(w, hb, h)}${en(w) ? ")" : "）"}`}${tox}`;
}

/** One classical 加減: the signs it is for, the herbs it adds and removes with their roles, the formula it makes, its book and how far it was checked. */
function modificationHtml(w: Words, hb: Handbook, m: Formula["modifications"][number]): string {
  const signs = m.when_symptoms.map((id) => { const x = hb.kb.symptoms.get(id); return x === undefined ? esc(id) : en(w) ? esc(x.en) : cn(w, x["zh-Hant"]); });
  const herb = (x: { readonly herb: string; readonly name: string; readonly role?: string; readonly typical_g?: number }): string => {
    // the study edition's grams, never for a toxic herb (its quantity, processing and preparation are a practitioner's to decide)
    const grams = hb.edition === "study" && x.typical_g !== undefined && herbsById(hb).get(x.herb)?.detail.toxic !== true ? [msg(w, "formula.composition.amount.g", { g: num(w, x.typical_g) })] : [];
    const notes = [...(x.role !== undefined ? [roleWord(w, x.role)] : []), ...grams];
    return `${compositionHerb(w, hb, x.herb, x.name)}${notes.length > 0 ? `${en(w) ? " (" : "（"}${notes.join(en(w) ? ", " : "，")}${en(w) ? ")" : "）"}` : ""}`;
  };
  const removed = m.remove.map((r) => (typeof r === "string" ? { herb: r, name: hb.kb.herbName(r)?.name["zh-Hant"] ?? r } : r));
  const changes = [
    ...(m.add.length > 0 ? [msg(w, "handbook.modify.add", { herbs: list(w, m.add.map(herb)) })] : []),
    ...(removed.length > 0 ? [msg(w, "handbook.modify.remove", { herbs: list(w, removed.map(herb)) })] : []),
  ];
  const checked = MODIFY_CHECKED[m.source.verification];
  const notes = [`《${cn(w, m.source.book)}》`, ...(checked !== undefined ? [msg(w, `handbook.modify.checked.${checked}`)] : []), ...(m.status !== "reviewed" ? [msg(w, "handbook.modify.unreviewed")] : [])];
  return `${msg(w, "handbook.modify.when", { signs: list(w, signs) })}${en(w) ? ": " : "："}${changes.join(en(w) ? ", " : "，")}`
    + `${m.result_name ? `${en(w) ? "; " : "，"}${msg(w, "handbook.modify.becomes", { name: cn(w, m.result_name) })}` : ""} <span class="note">${notes.join(en(w) ? "; " : "；")}</span>`;
}

/** A formula as the formula list's page has it, laid out as a formula textbook does: its cautions first, then 功用, 主治, 組成 by role with what each herb does, 方解, the
 * classic's words, the classical 加減 (where the reader sees them) and the source. Never a quantity: no amount, no proportion. */
export function formulaHtml(w: Words, hb: Handbook, f: Formula): string {
  const marks = formulaMarksOf(w, f);
  const school = SCHOOLS.find(([z]) => z === f.school)?.[1];
  const lines = [
    `<h3>${cn(w, f.name["zh-Hant"])}${f.name.en !== null ? `<span class="en">${esc(f.name.en)}</span>` : ""}</h3>`,
    `<p class="meta">${school !== undefined ? msg(w, `formula.school.${school}`) : cn(w, f.school)} · ${msg(w, `formula.tier.${f.tier}`)}</p>`,
    marks.length > 0 ? `<p class="marks">${marks.join(" · ")}</p>` : `<p class="marks none">${msg(w, "handbook.formula.none")}</p>`,
  ];
  const cautions = en(w) ? f.cautions_en.map(esc) : f.cautions.map((c) => cn(w, c));
  if (cautions.length > 0) lines.push(`<p class="caution">${label(w, "handbook.field.caution")}${cautions.join(en(w) ? "; " : "；")}</p>`);
  lines.push(`<p>${label(w, "handbook.formula.action")}${en(w) ? esc(f.principle_en) : cn(w, f.principle)}</p>`);
  const patterns = f.patterns.flatMap((id) => { const p = hb.kb.patternById.get(id); return p === undefined ? [] : [en(w) && p.name.en !== null ? esc(p.name.en) : cn(w, p.name["zh-Hant"])]; });
  if (patterns.length > 0) lines.push(`<p>${label(w, "handbook.formula.indication")}${list(w, patterns)}</p>`);
  // each herb's share (what the app's formula page shows every reader); the original text's amounts in its own units where the knowledge base has them (the 經方); in the study
  // edition the reference grams — and beside any table of quantities, the note N-AMOUNTS
  const classical = f.composition.some((r) => r.classical_amount != null);
  const grams = hb.edition === "study" && f.composition.some((r) => r.typical_g !== undefined);
  const head = [msg(w, "handbook.formula.col.role"), msg(w, "handbook.formula.col.herb"), msg(w, "formula.composition.col.share"), ...(classical ? [msg(w, "handbook.formula.col.classical")] : []),
    ...(grams ? [msg(w, "formula.composition.col.amount")] : []), msg(w, "handbook.formula.col.functions")];
  const cols = ["role", "herb", "share", ...(classical ? ["classical"] : []), ...(grams ? ["grams"] : []), "functions"];
  if (classical || grams) lines.push(`<p class="note amounts">${msg(w, "safety.notice.amounts.text")}</p>`);
  lines.push(`<table class="roles"><colgroup>${cols.map((c) => `<col class="${c}">`).join("")}</colgroup><thead><tr>${head.map((x) => `<th scope="col">${x}</th>`).join("")}</tr></thead><tbody>`
    + f.composition.map((r) => {
      const h = herbsById(hb).get(r.herb);
      const unit = (u: string): string => (en(w) && UNITS[u] !== undefined ? msg(w, `formula.composition.unit.${UNITS[u]!}`) : cn(w, u));
      const amount = r.classical_amount != null ? msg(w, "formula.composition.amount.classical", { value: num(w, r.classical_amount.value), unit: unit(r.classical_amount.unit) }) : "—";
      return `<tr><th scope="row">${roleWord(w, r.role)}</th><td>${compositionHerb(w, hb, r.herb, r.name)}</td><td>${esc(w.t.number(r.proportion, { style: "percent", maximumFractionDigits: 0 }))}</td>`
        + `${classical ? `<td>${amount}</td>` : ""}${grams ? `<td>${h?.detail.toxic === true ? `<span class="tox">${msg(w, "handbook.study.decides")}</span>` : r.typical_g !== undefined ? msg(w, "formula.composition.amount.g", { g: num(w, r.typical_g) }) : "—"}</td>` : ""}`
        + `<td>${h !== undefined ? cnList(w, h.detail.functions.slice(0, 3)) : ""}</td></tr>`;
    }).join("") + `</tbody></table><p class="note">${msg(w, "formula.verification.proportion")}</p>`);
  lines.push(`<p>${label(w, "handbook.formula.reasoning")}${en(w) ? esc(f.rationale_en) : cn(w, f.rationale_zh)}</p>`);
  const clause = hb.citations.get(f.source.ref);
  if (clause !== undefined) lines.push(`<p>${label(w, "handbook.formula.text")}「${cn(w, clause.quote_zh_hant)}」——${sourceOf(w, clause)}</p>`);
  if (hb.modifications && f.modifications.length > 0) lines.push(`<div class="modify"><p>${label(w, "handbook.formula.modify")}</p><ul>${f.modifications.map((m) => `<li>${modificationHtml(w, hb, m)}</li>`).join("")}</ul></div>`);
  const status = COMPOSITION_CHECKED[f.verification.composition_status] ?? "partial";
  lines.push(`<p class="source">${label(w, "handbook.field.source")}《${cn(w, f.source.book)}》${clause === undefined ? cn(w, f.source.ref) : ""} · ${msg(w, `formula.verification.${status}`)}</p>`);
  return `<article class="formula" id="${formulaAnchor(f.id)}">${lines.join("\n")}</article>`;
}
/** How far a formula's composition was checked (the app's COMPOSITION_STATUS). */
const COMPOSITION_CHECKED: Readonly<Record<string, string>> = { "verified-against-classical-text": "classical", "verified-against-source-book": "sourceBook", "verified-against-second-source": "secondSource", "partially-verified": "partial" };

/** The part on formulas: how a formula is built and read — 君臣佐使, its reasoning, its 加減 — then every formula the reader sees, by school. */
function formulasPart(w: Words, hb: Handbook): string {
  const cite = (id: string): string => { const c = hb.citations.get(id); if (c === undefined) throw new Error(`the part on formulas quotes ${id}, which is not a citation`); return quote(w, c); };
  const roles = ROLES.map(([role, slug]) => `<tr><th scope="row">${roleWord(w, role)}</th><td>${msg(w, `handbook.formulas.role.${slug}`)}</td></tr>`).join("");
  const groups = SCHOOLS.map(([school, slug]) => [slug, hb.formulas.filter((f) => f.school === school)] as const).filter(([, fs]) => fs.length > 0);
  return [
    `<section class="part" id="formulas"><h1>${msg(w, "handbook.formulas.part.title")}</h1>`,
    `<p>${msg(w, study(hb) ? "handbook.study.formulas.intro" : "handbook.formulas.part.intro", {}, hb.formulas.length)}</p>`,
    `<p class="notice">${msg(w, "handbook.formulas.part.cautions")}</p>`, ...(en(w) ? [`<p class="note">${msg(w, "handbook.formulas.part.machine")}</p>`] : []),
    `<h2>${msg(w, "handbook.formulas.what.title")}</h2>`, `<p>${msg(w, "handbook.formulas.what.text")}</p>`,
    `<h2>${msg(w, "handbook.formulas.roles.title")}</h2>`, cite("suwen-074-10"), cite("suwen-074-11"), `<p>${msg(w, "handbook.formulas.roles.intro")}</p>`,
    `<table class="rolesIntro"><tbody>${roles}</tbody></table>`,
    `<h2>${msg(w, "handbook.formulas.why.title")}</h2>`, `<p>${msg(w, "handbook.formulas.why.text")}</p>`, `<p>${msg(w, "handbook.formulas.why.model")}</p>`,
    `<h2>${msg(w, "handbook.formulas.modify.title")}</h2>`, cite("shanghan-016"), `<p>${msg(w, "handbook.formulas.modify.text")}</p>`, `<p>${msg(w, "handbook.formulas.modify.kinds")}</p>`,
    `<p>${msg(w, "handbook.formulas.modify.sanyin")}</p>`,
    ...([["general", "suwen-012-2"], ["person", "suwen-070-5"], ["time", "suwen-071-3"], ["place", "suwen-070-6"]] as const).map(([k, id]) => `<p class="qlabel">${msg(w, `handbook.formulas.sanyin.${k}`)}</p>${cite(id)}`),
    `<p>${msg(w, "handbook.formulas.modify.model")}</p>`, `<p class="notice">${msg(w, study(hb) ? "handbook.study.modify.note" : "handbook.formulas.modify.note")}</p>`,
    "</section>",
    ...groups.map(([slug, fs]) => `<section class="formulas" id="formulas-${slug}"><h2>${msg(w, `formula.school.${slug}`)} <span class="count">${msg(w, "handbook.formulas.count", {}, fs.length)}</span></h2>\n${fs.map((f) => formulaHtml(w, hb, f)).join("\n")}</section>`),
  ].join("\n");
}

/** Index lines grouped under a heading each, in columns. */
const index = (groups: readonly (readonly [string, readonly string[]])[]): string =>
  `<div class="idx">${groups.map(([heading, lines]) => `<h3>${heading}</h3><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`).join("\n")}</div>`;
const line = (w: Words, hb: Handbook, h: HandbookHerb, lead: string): string => `${lead} <a href="#${anchorOf(h.detail.slug)}">${cn(w, h.detail.name["zh-Hant"])}<span class="no">${numberOf(hb, h.no)}</span></a>`;

function pinyinIndex(w: Words, hb: Handbook): string {
  const sorted = [...hb.herbs].sort((a, b) => pinyinOf(a).localeCompare(pinyinOf(b), "en") || a.no - b.no);
  const letters = [...new Set(sorted.map((h) => pinyinOf(h)[0]!.toUpperCase()))];
  return appendix(w, "pinyin", intro(w, "handbook.pinyin.intro") + index(letters.map((l) => [l, sorted.filter((h) => pinyinOf(h)[0]!.toUpperCase() === l).map((h) => line(w, hb, h, `<span class="py">${esc(pinyinOf(h))}</span>`))] as const)));
}

const strokeCollator = new Intl.Collator("zh-Hant-u-co-stroke");
/** The stroke count of a character as the stroke collation of ICU orders it: the collation puts a boundary before the first character of each count (U+FDD0 and U+2800 + n). */
export function strokesOf(ch: string): number {
  let n = 0;
  for (let k = 1; k <= 80; k++) if (strokeCollator.compare(`﷐${String.fromCharCode(0x2800 + k)}`, ch) <= 0) n = k;
  return n;
}

function strokeIndex(w: Words, hb: Handbook): string {
  if (strokesOf("一") !== 1 || strokesOf("矮") !== 13) throw new Error("the ICU data of this Node.js has no stroke boundaries: the stroke index cannot be made");
  const first = (h: HandbookHerb): string => [...h.detail.name["zh-Hant"]][0]!;
  const sorted = [...hb.herbs].sort((a, b) => strokesOf(first(a)) - strokesOf(first(b)) || strokeCollator.compare(a.detail.name["zh-Hant"], b.detail.name["zh-Hant"]) || a.no - b.no);
  const counts = [...new Set(sorted.map((h) => strokesOf(first(h))))];
  return appendix(w, "strokes", intro(w, "handbook.strokes.intro") + index(counts.map((n) => [msg(w, "handbook.strokes.group", {}, n), sorted.filter((h) => strokesOf(first(h)) === n).map((h) => line(w, hb, h, ""))] as const)));
}

function namesIndex(w: Words, hb: Handbook): string {
  const names = hb.herbs.flatMap((h) => [
    ...(h.detail.latin !== null ? [{ key: h.detail.latin, lead: `<i lang="la">${esc(h.detail.latin)}</i>`, h }] : []),
    ...(h.detail.name.en !== null ? [{ key: h.detail.name.en, lead: esc(h.detail.name.en), h }] : []),
  ]);
  const collator = new Intl.Collator("en", { sensitivity: "base" });
  names.sort((a, b) => collator.compare(a.key, b.key) || a.h.no - b.h.no);
  const letters = [...new Set(names.map((n) => n.key[0]!.toUpperCase()))];
  return appendix(w, "names", intro(w, "handbook.names.intro") + index(letters.map((l) => [l, names.filter((n) => n.key[0]!.toUpperCase() === l).map((n) => line(w, hb, n.h, n.lead))] as const)));
}

function lookup(w: Words, hb: Handbook): string {
  const natures = [...NATURES.map(([zh]) => zh), ...new Set(hb.herbs.flatMap((h) => h.detail.nature).filter((n) => slugIn(NATURES, n) === undefined))];
  const flavors = [...FLAVORS.map(([zh]) => zh), ...new Set(hb.herbs.flatMap((h) => h.detail.flavors).filter((f) => slugIn(FLAVORS, f) === undefined))];
  const channels = [...CHANNEL_ORDER, ...new Set(hb.herbs.flatMap((h) => h.detail.channels).filter((c) => !CHANNEL_ORDER.includes(c)))];
  return appendix(w, "lookup", [
    intro(w, "handbook.lookup.intro"),
    `<h2>${msg(w, "learn.herb.nature")}</h2>`, ...natures.map((n) => group(w, hb, natureWord(w, n), hb.herbs.filter((h) => h.detail.nature.includes(n)))),
    `<h2>${msg(w, "learn.herb.flavors")}</h2>`, ...flavors.map((f) => group(w, hb, flavorWord(w, f), hb.herbs.filter((h) => h.detail.flavors.includes(f)))),
    `<h2>${msg(w, "learn.herb.channels")}</h2>`, ...channels.map((c) => group(w, hb, channelWord(w, hb.kb, c), hb.herbs.filter((h) => h.detail.channels.includes(c)))),
  ].join("\n"));
}

const PAIR_COLS = `<colgroup><col class="name"><col><col class="name"><col></colgroup>`;

function safety(w: Words, hb: Handbook): string {
  const inc = hb.files.safety.incompatibilities;
  const cite = hb.citations.get(inc.citation);
  if (cite === undefined) throw new Error(`the incompatibilities cite ${inc.citation}, which is not a citation`);
  const interactions = [...new Set(hb.herbs.flatMap((h) => h.detail.interactions))].sort();
  const byId = herbsById(hb);
  /** What a name of a row stands for in that row: the herbs of the handbook, by entry. */
  const covered = (cover: Readonly<Record<string, readonly string[]>>, name: string): string => {
    const hs = (cover[name] ?? []).map((id) => { const h = byId.get(id); if (h === undefined) throw new Error(`${name} covers ${id}, which is not a herb of the handbook`); return h; });
    return hs.length > 0 ? list(w, hs.sort((a, b) => a.no - b.no).map((h) => herbRef(w, hb, h))) : `<span class="note">${msg(w, "handbook.safety.none")}</span>`;
  };
  return appendix(w, "safety", [
    intro(w, "handbook.safety.intro"),
    `<h2>${msg(w, "handbook.safety.toxic")}</h2>`, ...GRADES.map(([g, key]) => group(w, hb, msg(w, `handbook.grade.${key}`), hb.herbs.filter((h) => h.detail.toxic && h.record.props.toxicity === g))),
    group(w, hb, msg(w, "learn.herb.mark.toxic"), hb.herbs.filter((h) => h.detail.toxic && !GRADES.some(([g]) => g === h.record.props.toxicity))),
    `<h2>${msg(w, "handbook.safety.pregnancy")}</h2>`, group(w, hb, msg(w, "learn.herb.mark.avoid"), hb.herbs.filter((h) => h.detail.pregnancy === "avoid")),
    group(w, hb, msg(w, "learn.herb.mark.caution"), hb.herbs.filter((h) => h.detail.pregnancy === "caution")),
    `<h2>${msg(w, "handbook.safety.interactions")}</h2>`, ...interactions.map((i) => group(w, hb, msg(w, `formula.interaction.${i}`), hb.herbs.filter((h) => h.detail.interactions.includes(i)))),
    `<h2>${msg(w, "handbook.safety.incompatible")}</h2>`, intro(w, "handbook.safety.incompatible.intro"),
    `<h3>${msg(w, "handbook.safety.shibafan")}</h3>`, quote(w, cite),
    `<table class="pairs">${PAIR_COLS}<thead><tr><th scope="col">${msg(w, "handbook.safety.col.herb")}</th><th scope="col">${msg(w, "handbook.safety.col.covers")}</th><th scope="col">${msg(w, "handbook.safety.col.opposes")}</th><th scope="col">${msg(w, "handbook.safety.col.covers")}</th></tr></thead><tbody>`,
    ...inc.shibafan.flatMap((r) => r.opposes.map((o) => `<tr><th scope="row">${cn(w, r.herb)}</th><td>${covered(r.herbs, r.herb)}</td><th scope="row">${cn(w, o)}</th><td>${covered(r.herbs, o)}</td></tr>`)), "</tbody></table>",
    `<h3>${msg(w, "handbook.safety.shijiuwei")}</h3>`,
    `<table class="pairs">${PAIR_COLS}<thead><tr><th scope="col">${msg(w, "handbook.safety.col.herb")}</th><th scope="col">${msg(w, "handbook.safety.col.covers")}</th><th scope="col">${msg(w, "handbook.safety.col.antagonist")}</th><th scope="col">${msg(w, "handbook.safety.col.covers")}</th></tr></thead><tbody>`,
    ...inc.shijiuwei.map((r) => `<tr><th scope="row">${cn(w, r.a)}</th><td>${covered(r.herbs, r.a)}</td><th scope="row">${cn(w, r.b)}</th><td>${covered(r.herbs, r.b)}</td></tr>`), "</tbody></table>",
    `<p class="note">${msg(w, "handbook.safety.shijiuwei.note")}</p>`,
  ].join("\n"));
}

function pairings(w: Words, hb: Handbook): string {
  const byId = new Map(hb.herbs.map((h) => [h.record.id, h] as const));
  const herb = (id: string): HandbookHerb => { const h = byId.get(id); if (h === undefined) throw new Error(`a pairing names ${id}, which is not a herb`); return h; };
  const cites = hb.files.pairings._meta.citations.map((id) => { const c = hb.citations.get(id); if (c === undefined) throw new Error(`the 七情 cite ${id}, which is not a citation`); return c; });
  const meanings = ["xu", "shi", "wei", "sha", "wu", "fan"].map((k) => `<tr><th scope="row">${msg(w, `handbook.pairing.${k}`)}</th><td>${msg(w, `handbook.pairing.${k}.meaning`, { safety: appendixNo(w, "safety") })}</td></tr>`);
  return appendix(w, "pairings", [
    ...cites.map((c) => quote(w, c)), intro(w, "handbook.pairings.intro"),
    `<table><tbody>${meanings.join("")}</tbody></table>`,
    ...PAIRING_TYPES.map(([type, key]) => {
      const rows = hb.files.pairings.items.filter((p) => p.type === type).sort((a, b) => herb(a.herb).no - herb(b.herb).no || herb(a.other).no - herb(b.other).no);
      if (rows.length === 0) return "";
      return `<h2>${msg(w, `handbook.pairing.${key}`)} <span class="count">${msg(w, "handbook.pairs", {}, rows.length)}</span></h2>\n`
        + `<table><thead><tr><th scope="col">${msg(w, "handbook.pairings.col.herb")}</th><th scope="col">${msg(w, "handbook.pairings.col.other")}</th><th scope="col">${msg(w, "handbook.pairings.col.says")}</th></tr></thead><tbody>`
        + rows.map((p) => `<tr><td>${herbRef(w, hb, herb(p.herb))}</td><td>${herbRef(w, hb, herb(p.other))}</td><td>「${cn(w, p.says)}」</td></tr>`).join("") + "</tbody></table>";
    }),
  ].join("\n"));
}

function yinjing(w: Words, hb: Handbook): string {
  const byId = new Map(hb.herbs.map((h) => [h.record.id, h] as const));
  const meta = hb.files.yinjing._meta;
  return appendix(w, "yinjing", [
    intro(w, "handbook.yinjing.intro", { source: `《${cn(w, meta.book)}·${cn(w, meta.chapter)}》` }),
    `<table><thead><tr><th scope="col">${msg(w, "handbook.yinjing.col.channel")}</th><th scope="col">${msg(w, "handbook.yinjing.col.herbs")}</th></tr></thead><tbody>`,
    ...hb.files.yinjing.channels.map((c) => `<tr><th scope="row">${cn(w, c.channel)}</th><td>${list(w, c.herbs.map((id) => { const h = byId.get(id); if (h === undefined) throw new Error(`引經 names ${id}, which is not a herb`); return herbRef(w, hb, h); }))}</td></tr>`),
    "</tbody></table>",
  ].join("\n"));
}

/** What a processing method changes in the model, in words (the method's `modifiers`). */
export function changesOf(w: Words, hb: Handbook, m: ProcessingMethod): string[] {
  const md = m.modifiers;
  return [
    ...(md.direction !== undefined ? [msg(w, md.direction > 0 ? "handbook.change.up" : "handbook.change.down")] : []),
    ...(md.temperature !== undefined ? [msg(w, md.temperature > 0 ? "handbook.change.warmer" : "handbook.change.cooler")] : []),
    ...Object.keys(md.tropism ?? {}).map((c) => msg(w, "handbook.change.channel", { channel: channelWord(w, hb.kb, c) })),
    ...(md.run_zao !== undefined ? [msg(w, `handbook.change.runZao.${RUN_ZAO[md.run_zao]!}`)] : []),
    ...(md.bu_xie !== undefined ? [msg(w, `handbook.change.buXie.${BU_XIE[md.bu_xie]!}`)] : []),
    ...(md.harms_scale !== undefined && md.harms_scale < 1 ? [msg(w, "handbook.change.milder")] : []),
  ];
}

function processing(w: Words, hb: Handbook): string {
  const methods = hb.files.processing.methods;
  const cites = [...new Set(methods.map((m) => m.citation).filter((c): c is string => c !== null))].map((id) => { const c = hb.citations.get(id); if (c === undefined) throw new Error(`炮製 cites ${id}, which is not a citation`); return c; });
  return appendix(w, "processing", [
    ...cites.map((c) => quote(w, c)), intro(w, "handbook.processing.intro"),
    `<table><thead><tr><th scope="col">${msg(w, "handbook.processing.col.method")}</th><th scope="col">${msg(w, "handbook.processing.col.says")}</th><th scope="col">${msg(w, "handbook.processing.col.model")}</th><th scope="col">${msg(w, "handbook.processing.col.words")}</th></tr></thead><tbody>`,
    ...methods.map((m) => {
      const says = en(w) ? `<span lang="zh-Hant">${esc(m.says.replace(DEV_NOTE, ""))}</span>` : esc(w.zh(m.says).replace(DEV_NOTE, ""));
      return `<tr><th scope="row">${cn(w, m.name)}</th><td>「${says}」${m.citation === null ? ` <span class="note">${msg(w, "handbook.unverified")}</span>` : ""}</td><td>${list(w, changesOf(w, hb, m))}</td><td>${cnList(w, m.words)}</td></tr>`;
    }),
    "</tbody></table>", `<p>${msg(w, "handbook.processing.cleaning", { list: cnList(w, hb.files.processing.cleaning) })}</p>`,
  ].join("\n"));
}

function bands(w: Words, hb: Handbook): string {
  const byId = new Map(hb.herbs.map((h) => [h.record.id, h] as const));
  return appendix(w, "bands", [
    intro(w, "handbook.bands.intro"),
    `<table><thead><tr><th scope="col">${msg(w, "handbook.bands.col.herb")}</th><th scope="col">${msg(w, "handbook.bands.col.says")}</th></tr></thead><tbody>`,
    ...hb.files.doseBands.items.map((b) => {
      const h = byId.get(b.herb), c = hb.citations.get(b.citation);
      if (h === undefined || c === undefined) throw new Error(`the 量效 of ${b.herb} names an unknown herb or citation`);
      return `<tr><td>${herbRef(w, hb, h)}</td><td>「${cn(w, c.quote_zh_hant)}」——${sourceOf(w, c)}</td></tr>`;
    }),
    "</tbody></table>",
  ].join("\n"));
}

/** The model's properties in the order the rules appendix explains them, each with the prefix of its rules' ids. */
const PROPERTIES = [["yinyang", "yy"], ["direction", "dir"], ["phases", "wx"], ["tropism", "gj"], ["buXie", "bx"], ["runZao", "rz"], ["qiXue", "qx"], ["toxicity", "tox"], ["part", "part"]] as const;

function modelRules(w: Words, hb: Handbook): string {
  const conv = conventionsOf(hb.files);
  const props = hb.herbs.map((h) => h.record.props);
  const counted = (pairs: readonly (readonly [string, number])[]): string => `<p class="counts">${pairs.map(([word, n]) => msg(w, "handbook.model.count", { word }, n)).join(en(w) ? "; " : "；")}</p>`;
  const counts: Readonly<Record<string, string>> = {
    direction: counted((["up", "even", "down"] as const).map((k) => [msg(w, `handbook.model.direction.${k}`), props.filter((p) => directionOf(hb, p.direction) === k).length])),
    buXie: counted(Object.entries(BU_XIE).map(([zh, k]) => [msg(w, `handbook.model.buXie.${k}`), props.filter((p) => p.bu_xie === zh).length])),
    runZao: counted(Object.entries(RUN_ZAO).map(([zh, k]) => [msg(w, `handbook.model.runZao.${k}`), props.filter((p) => p.run_zao === zh).length])),
    qiXue: counted([...Object.entries(QI_XUE).map(([zh, k]) => [msg(w, `handbook.model.qiXue.${k}`), props.filter((p) => p.qi_xue === zh).length] as const), [msg(w, "handbook.model.qiXue.none"), props.filter((p) => p.qi_xue === null).length]]),
    toxicity: counted([...GRADES.map(([g, k]) => [msg(w, `handbook.grade.${k}`), props.filter((p) => p.toxicity === g).length] as const), [msg(w, "handbook.grade.none"), props.filter((p) => !GRADES.some(([g]) => g === p.toxicity)).length]]),
  };
  return appendix(w, "model", [
    intro(w, "handbook.model.intro"),
    ...PROPERTIES.map(([key, prefix]) => {
      const ids = [...new Set(Object.entries(conv.rules).filter(([id, r]) => id.startsWith(`${prefix}.`) && r.citation !== null).map(([, r]) => r.citation!))];
      const cites = ids.map((id) => { const c = hb.citations.get(id); if (c === undefined) throw new Error(`the model's rules cite ${id}, which is not a citation`); return c; });
      return `<h2>${msg(w, `handbook.model.rule.${key}.title`)}</h2>\n<p>${msg(w, `handbook.model.rule.${key}`, { band: String(conv.params.direction_label.up) })}</p>\n${counts[key] ?? ""}\n${cites.map((c) => quote(w, c)).join("\n")}`;
    }),
  ].join("\n"));
}

function glossary(w: Words, hb: Handbook): string {
  const plain = (s: string): string => s.normalize("NFD").replace(/\p{M}+/gu, "");
  const terms = [...hb.files.glossary.items].sort((a, b) => plain(a.pinyin).localeCompare(plain(b.pinyin), "en") || a["zh-Hant"].localeCompare(b["zh-Hant"], "zh-Hant"));
  return appendix(w, "glossary", [
    intro(w, "handbook.glossary.intro"),
    `<table class="glossary"><thead><tr><th scope="col">${msg(w, "handbook.glossary.col.zh")}</th><th scope="col">${msg(w, "handbook.glossary.col.pinyin")}</th><th scope="col">${msg(w, "handbook.glossary.col.en")}</th></tr></thead><tbody>`,
    ...terms.map((g) => `<tr><th scope="row">${cn(w, g["zh-Hant"])}</th><td>${esc(g.pinyin)}</td><td lang="en">${esc(g.en)}</td></tr>`),
    "</tbody></table>",
  ].join("\n"));
}

type Work = Sources["items"][number];

/** The works the handbook draws on: its herbs' sources, the books of every passage it quotes and of its tables, as the sources registry names them. */
export function worksOf(hb: Handbook): { readonly works: readonly Work[]; readonly passages: ReadonlyMap<string, number> } {
  const registry = readJson<Sources>(join(root, "data", "sources.json")).items;
  const conv = conventionsOf(hb.files);
  const cited = [...new Set([
    ...Object.values(conv.rules).map((r) => r.citation), ...hb.files.pairings._meta.citations, ...hb.files.processing.methods.map((m) => m.citation),
    ...hb.files.doseBands.items.map((b) => b.citation), hb.files.safety.incompatibilities.citation,
  ].filter((c): c is string => c !== null))].map((id) => hb.citations.get(id)!);
  const books = [...new Set([...hb.herbs.map((h) => h.detail.source.book).filter((b) => b !== "—"), ...hb.files.pairings.items.map((p) => p.source.book), hb.files.yinjing._meta.book, ...cited.map((c) => c.book)])];
  const workOf = (book: string): Work => {
    const w = registry.find((x) => x.title === book || x.names.includes(book));
    if (w === undefined) throw new Error(`the sources registry has no work ${book}`);
    return w;
  };
  const works = [...new Map(books.map((b) => { const x = workOf(b); return [x.id, x] as const; })).values()];
  const passages = new Map<string, number>();
  for (const c of cited) { const x = workOf(c.book); passages.set(x.id, (passages.get(x.id) ?? 0) + 1); }
  return { works, passages };
}

function sources(w: Words, hb: Handbook): string {
  const { works, passages } = worksOf(hb);
  // the registry's edition details; a Chinese edition shows only those written in Chinese (the registry says "current editions" of the textbooks in English)
  const editionOf = (x: Work): string => cnList(w, [x.edition?.dynasty ?? null, x.edition?.author ?? x.author, x.edition?.year ?? x.era].filter((s): s is string => s !== null && s !== "" && (en(w) || hasChinese(s))));
  return appendix(w, "sources", [
    intro(w, "handbook.sources.intro"),
    `<table class="works"><colgroup><col class="work"><col class="edition"><col class="passages"></colgroup><thead><tr><th scope="col">${msg(w, "handbook.sources.col.work")}</th><th scope="col">${msg(w, "handbook.sources.col.edition")}</th><th scope="col">${msg(w, "handbook.sources.col.passages")}</th></tr></thead><tbody>`,
    ...works.map((x) => `<tr><th scope="row">${cn(w, x.title)}</th><td>${editionOf(x)}</td><td>${passages.get(x.id) ?? "—"}</td></tr>`),
    "</tbody></table>",
  ].join("\n"));
}

// ── the edition ─────────────────────────────────────────────────────────────

const FONTS: Readonly<Record<HandbookLang, { readonly serif: string; readonly sans: string }>> = {
  "zh-Hant": {
    serif: `"Songti TC", "Noto Serif TC", "Source Han Serif TC", "Noto Serif CJK TC", "PMingLiU", "PingFang TC", "Heiti TC", serif`,
    sans: `"PingFang TC", "Noto Sans TC", "Source Han Sans TC", "Noto Sans CJK TC", "Microsoft JhengHei", "Heiti TC", sans-serif`,
  },
  "zh-Hans": {
    serif: `"Songti SC", "Noto Serif SC", "Source Han Serif SC", "Noto Serif CJK SC", "SimSun", "PingFang SC", "Heiti SC", serif`,
    sans: `"PingFang SC", "Noto Sans SC", "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "Heiti SC", sans-serif`,
  },
  en: {
    serif: `"Charter", "Iowan Old Style", "Palatino", "Georgia", "Songti TC", "Noto Serif TC", "PingFang TC", serif`,
    sans: `"Helvetica Neue", "Helvetica", "Arial", "PingFang TC", "Noto Sans TC", "Heiti TC", sans-serif`,
  },
};

function style(lang: HandbookLang): string {
  const f = FONTS[lang];
  return `
@page { size: A4; margin: 15mm 14mm 17mm; }
html { font-family: ${f.serif}; font-size: 9pt; line-height: 1.55; color: #111; }
body { margin: 0; }
:lang(zh-Hant) { font-family: ${FONTS["zh-Hant"].serif}; }
h1, h2, h3, th, .cover, .marks, .l, .no, .count, .range, .qlabel, figcaption { font-family: ${f.sans}; }
.part, .category { break-before: page; }
h1 { font-size: 16pt; line-height: 1.35; margin: 0 0 5mm; }
h2 { font-size: 12pt; margin: 5mm 0 2mm; break-after: avoid; }
h3 { font-size: 10pt; margin: 3mm 0 1mm; break-after: avoid; }
p { margin: 0 0 1.8mm; orphans: 2; widows: 2; }
a { color: inherit; text-decoration: none; }
.cover { min-height: 240mm; display: flex; flex-direction: column; justify-content: center; text-align: center; break-before: auto; }
.cover .kind { font-size: 11pt; letter-spacing: 0.2em; color: #555; margin: 0 0 6mm; }
.cover h1 { font-size: 28pt; margin: 0 0 5mm; }
.cover .subtitle { font-size: 12pt; margin: 0 auto; max-width: 150mm; text-wrap: balance; }
.cover .status { margin: 18mm auto 0; max-width: 130mm; padding: 4mm 5mm; border: 1pt solid #a40000; color: #a40000; text-align: left; font-size: 10pt; }
.cover .reviewed { border-color: #226622; color: #226622; }
.cover .version { margin-top: 10mm; font-size: 8.5pt; color: #666; }
#about p, #about li { font-size: 10pt; line-height: 1.7; }
#about ul.safety li { margin-bottom: 1mm; }
ol.toc { list-style: none; padding: 0; font-size: 10.5pt; line-height: 1.9; }
ol.toc .range { color: #555; font-size: 9pt; margin-inline-start: 3mm; }
.category > h2 { font-size: 14pt; margin: 0 0 3mm; padding-bottom: 1.5mm; border-bottom: 1pt solid #333; }
.count { font-weight: normal; font-size: 0.75em; color: #555; margin-inline-start: 1.5mm; }
.cols { columns: 2; column-gap: 7mm; column-rule: 0.4pt solid #cfcfcf; }
.entry { break-inside: avoid; margin: 0 0 2.6mm; padding-top: 1.6mm; border-top: 0.4pt solid #b5b5b5; }
.entry h3 { font-size: 10.5pt; margin: 0 0 0.8mm; line-height: 1.4; }
.entry h3 .no { font-size: 8pt; font-weight: normal; color: #555; margin-inline-end: 1.6mm; }
.entry h3 .py, .entry h3 .en, .entry h3 .la { font-size: 8.3pt; font-weight: normal; margin-inline-start: 1.6mm; color: #333; }
.entry h3 .la { font-family: ${f.serif}; }
.entry p { margin: 0 0 0.5mm; line-height: 1.5; }
.marks { color: #8b0000; font-weight: 600; }
.marks.none { color: #555; font-weight: normal; }
.l { font-weight: 600; }
.note { color: #555; font-size: 0.92em; }
.source { color: #444; font-size: 8.3pt; }
.sc { white-space: nowrap; }
svg.scale { width: 16mm; height: 2.56mm; vertical-align: -0.3mm; margin: 0 0.6mm; }
.formulas { break-before: page; }
.formulas > h2 { font-size: 14pt; margin: 0 0 3mm; padding-bottom: 1.5mm; border-bottom: 1pt solid #333; }
.formula { margin: 0 0 5mm; padding-top: 2mm; border-top: 0.4pt solid #b5b5b5; break-inside: avoid; }
.notice { border: 0.8pt solid #a40000; color: #8b0000; padding: 2mm 3mm; margin: 3mm 0; }
.qlabel { font-weight: 600; margin: 3mm 0 0; break-after: avoid; }
.formula h3 { font-size: 12pt; margin: 0 0 0.8mm; break-after: avoid; }
.formula h3 .en { font-size: 9pt; font-weight: normal; color: #333; margin-inline-start: 2mm; }
.formula .meta { color: #555; font-size: 8.5pt; margin: 0 0 1mm; }
.formula p { margin: 0 0 1mm; line-height: 1.55; }
table.roles { table-layout: fixed; margin: 1.5mm 0 2mm; }
table.roles col.role { width: 12%; } table.roles col.herb { width: 26%; } table.roles col.share { width: 8%; } table.roles col.classical { width: 11%; } table.roles col.grams { width: 11%; }
.tox { color: #8b0000; font-size: 0.85em; margin-inline-start: 0.8mm; font-weight: 600; }
p.amounts { margin: 1.5mm 0 0; }
table.roles tbody th { white-space: normal; }
table.rolesIntro tbody th { width: 14%; }
.modify ul { margin: 0 0 1.5mm; padding-inline-start: 5mm; }
.modify li { margin: 0.6mm 0; }
.idx { columns: 3; column-gap: 6mm; font-size: 8.5pt; }
.idx h3 { font-size: 9.5pt; margin: 2mm 0 0.8mm; }
.idx ul { list-style: none; padding: 0; margin: 0; }
.idx li { break-inside: avoid; line-height: 1.5; }
.py { color: #333; }
.no { font-size: 0.85em; color: #555; margin-inline-start: 0.8mm; }
.refs { line-height: 1.75; text-align: justify; }
.intro { color: #222; }
table { border-collapse: collapse; width: 100%; margin: 2.5mm 0; font-size: 8.5pt; line-height: 1.55; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td { border: 0.5pt solid #9a9a9a; padding: 1mm 1.6mm; vertical-align: top; text-align: left; }
thead th { background: #eeeeee; }
tbody th { font-weight: 600; white-space: nowrap; }
table.glossary tbody th { white-space: normal; }
table.pairs { table-layout: fixed; }
table.pairs col.name { width: 19%; }
table.pairs tbody th { white-space: normal; }
table.works { table-layout: fixed; }
table.works col.work { width: 48%; } table.works col.edition { width: 40%; } table.works col.passages { width: 12%; }
table.works tbody th { white-space: normal; } table.works td:last-child { text-align: center; }
figure.quote { margin: 2.5mm 0 2.5mm 3mm; padding: 0 0 0 3.5mm; border-left: 1.5pt solid #8a8a8a; break-inside: avoid; }
figure.quote blockquote { margin: 0; font-size: 9.5pt; }
figure.quote figcaption { text-align: right; color: #444; font-size: 8.5pt; }
`;
}

/** The whole edition as one HTML document. */
export function handbookHtml(hb: Handbook, w: Words): string {
  return [
    "<!doctype html>", `<html lang="${w.lang}"><head><meta charset="utf-8"><title>${titleOf(w, hb)}</title><style>${style(w.lang)}</style></head><body>`,
    cover(w, hb), about(w, hb), contents(w, hb), body(w, hb), formulasPart(w, hb),
    pinyinIndex(w, hb), ...(w.lang === "zh-Hant" ? [strokeIndex(w, hb)] : []), namesIndex(w, hb), lookup(w, hb), safety(w, hb), pairings(w, hb), yinjing(w, hb), processing(w, hb),
    bands(w, hb), modelRules(w, hb), glossary(w, hb), sources(w, hb),
    "</body></html>", "",
  ].join("\n");
}

/** The footer Chrome prints on every page: the handbook, its review status and the page number (its template sets its own size and font: the page's styles do not reach it). */
export function footerOf(hb: Handbook, w: Words): string {
  const status = msg(w, study(hb) ? `handbook.study.footer.${hb.status}` : `handbook.footer.${hb.status}`);
  return `<div style="width:100%;margin:0 14mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#555;font-family:${FONTS[w.lang].sans.replace(/"/g, "'")}">`
    + `<span>${titleOf(w, hb)} · ${status}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
}

export const fileOf = (lang: HandbookLang, edition: Handbook["edition"] = "standard"): string => (edition === "study" ? `herbs-study-${lang}` : `herbs-${lang}`);

if (import.meta.main) {
  const htmlOnly = process.argv.includes("--html");
  // the build's own restrictions narrow the handbook as they narrow a build; `--study` prints the study edition instead — a deliberate act, refused where the build serves no study reference
  const general = handbook(undefined, undefined, overridesOf(process.env.APP_OVERRIDES, process.env.APP_DOSE_DISPLAY));
  const hb = process.argv.includes("--study") ? studyEdition(general) : general;
  mkdirSync(OUT, { recursive: true });
  for (const lang of HANDBOOK_LANGS) {
    const w = wordsFor(lang);
    const html = handbookHtml(hb, w);
    const file = fileOf(lang, hb.edition);
    writeFileSync(join(OUT, `${file}.html`), html);
    if (!htmlOnly) writeFileSync(join(OUT, `${file}.pdf`), await printHtml(html, footerOf(hb, w)));
    console.log(`print: ${file} — ${hb.herbs.length} herbs, ${hb.formulas.length} formulas, ${appendicesOf(lang).length} appendices, ${hb.edition} edition, ${hb.status}, data ${hb.version}${htmlOnly ? " (HTML only)" : ""}`);
  }
}
