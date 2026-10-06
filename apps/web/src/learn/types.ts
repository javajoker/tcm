// The Learn section (docs/post-mvp/design/knowledge-browser.md): pages that describe the knowledge the app holds, for a reader who is not taking an assessment. A page is a MODEL (data) that one
// template renders, so that the anonymous-context rules (§4) are enforced in one place and tested over every record.
import type { Bilingual } from "@tcm/kb";

export type LearnType = "pattern" | "constitution" | "formula" | "point" | "food" | "quotation" | "term";

/** A name in both languages, as the data carries it. Chinese text is shown through `t.zh` (data strings only: a name joined from several data strings is converted part by part and joined after, which `t.zh` leaves as it is). */
export type Name = Bilingual;

export interface ListItem {
  readonly id: string;
  readonly name: Name;
  /** One plain line under the name (a tier, a meridian, a book), already in the page's language. */
  readonly note?: string;
  /** The language of the note when it is not interface text: Chinese (already converted for display by the builder) or pinyin. */
  readonly noteLang?: "zh" | "pinyin";
}
export interface ListGroup {
  /** A stable key (also the order key) and the heading already in the page's language; `null` = no heading (one group). */
  readonly key: string;
  readonly heading: string | null;
  readonly items: readonly ListItem[];
}

/** A caution as the data carries it: a sentence in Chinese and in English. */
export interface Caution { readonly "zh-Hant": string; readonly en: string }

/** One block of a page's body. Text is data (Chinese and English), shown through the template's own language handling. */
export type Block =
  | { readonly kind: "text"; readonly zh: string; readonly en?: string | undefined; readonly status?: "machine-draft" | "reviewed" | undefined }
  | { readonly kind: "plain"; readonly text: string }
  | { readonly kind: "quote"; readonly zh: string }
  | { readonly kind: "facts"; readonly rows: readonly Fact[] }
  /** Labelled lists of names (the features of a pattern by band, the smaller patterns it is built from). A group without a label is a plain list. */
  | { readonly kind: "groups"; readonly groups: readonly NameGroup[] }
  /** A table with a caption; the first column is the row header. A `Name` cell is shown in both languages. */
  | { readonly kind: "table"; readonly caption: string; readonly head: readonly string[]; readonly rows: readonly (readonly Cell[])[] }
  /** Links to other pages, in labelled groups (what is traditionally associated with the subject of the page). */
  | { readonly kind: "links"; readonly groups: readonly LinkGroup[] };
export type Cell = string | Name;
export interface LinkGroup { readonly label: string | null; readonly items: readonly Related[] }
export interface NameGroup { readonly label: string | null; readonly items: readonly Name[] }
/** A string `value` is already in the page language (and, for Chinese, in the page script) and `lang` only marks it for assistive technology; a `Name` is shown in both languages like a title. */
export interface Fact { readonly label: string; readonly value: string | Name; readonly lang?: "zh" | "en" | "pinyin" }

export interface Section { readonly id: string; readonly heading: string; readonly blocks: readonly Block[] }

/** What a reader is told about how far the content has been checked. */
export type Review = "draft" | "derived" | "reviewed" | "needs-review" | "curated-draft" | "checked" | "unchecked";

export interface Related { readonly href: string; readonly name: Name; readonly kind: string }

export interface PageModel {
  readonly type: LearnType;
  readonly id: string;
  readonly title: Name;
  /** Pinyin or a code that sits beside the title (terms, points). */
  readonly alias?: string;
  /** `pinyin` when the alias is the pinyin of the title (a term); a code (a pattern's id) has none. */
  readonly aliasLang?: "pinyin";
  /** The page describes something a person might use (a formula, a food, a point): its cautions come first and the standing line is shown (R1, R3). */
  readonly adviceLike: boolean;
  readonly cautions: readonly Caution[];
  /** The flags stored on the record, as statements in the page language, that a reader must see beside the cautions (R7): pregnancy, interactions, allergy. A flag that is absent is stated as absent ("none recorded"), never left out. */
  readonly flags: readonly string[];
  readonly sections: readonly Section[];
  /** Quotation ids of the sources; `sourceLabel` says where the content comes from when it has no quotation (a standard, a textbook). */
  readonly citations: readonly string[];
  readonly sourceLabel?: string | undefined;
  readonly review: Review;
  readonly related: readonly Related[];
}

export interface TypeInfo {
  readonly type: LearnType;
  /** The route segment under `/learn`. */
  readonly path: string;
  readonly adviceLike: boolean;
  /** Pages of this type are built (a type is switched on by the task that builds its pages). */
  readonly available: boolean;
}
