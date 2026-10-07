import type { KnowledgeBase } from "@tcm/kb";
import type { LearnType, TypeInfo } from "./types.ts";

/**
 * The eight kinds of page of the Learn section, in the order the hub lists them. A kind is `available` when its pages exist: the hub, the search and the routes offer only those. PM-13 builds the
 * shell with the glossary terms and the quotations; the other kinds are switched on by the tasks that build them (patterns and constitutions PM-14; formulas, points and foods PM-15; herbs PM-25, whose data comes on demand: a build without a herb browser offers none).
 */
export const TYPES: readonly TypeInfo[] = [
  { type: "pattern", path: "patterns", adviceLike: false, available: true },
  { type: "constitution", path: "constitutions", adviceLike: false, available: true },
  { type: "formula", path: "formulas", adviceLike: true, available: true },
  { type: "point", path: "points", adviceLike: true, available: true },
  { type: "food", path: "foods", adviceLike: true, available: true },
  { type: "herb", path: "herbs", adviceLike: true, available: true },
  { type: "quotation", path: "quotations", adviceLike: false, available: true },
  { type: "term", path: "terms", adviceLike: false, available: true },
];

export const AVAILABLE: readonly TypeInfo[] = TYPES.filter((t) => t.available);
/** The kinds this build offers: the herbs only when the build has a herb browser (a public build has none until a sample review has covered herbs). */
export const availableIn = (kb: KnowledgeBase): readonly TypeInfo[] => AVAILABLE.filter((t) => t.type !== "herb" || kb.herbBrowser !== null);
export const infoOf = (type: LearnType): TypeInfo => TYPES.find((t) => t.type === type)!;
export const typeOfPath = (path: string): TypeInfo | undefined => AVAILABLE.find((t) => t.path === path);

/** The address of the learning book's contents, or of one of its chapters (PM-43); relative to the language. The book is not a kind of page: it is one work, read in order. */
export const bookHref = (chapter?: string): string => (chapter === undefined || chapter === "" ? "/learn/book" : `/learn/book/${chapter}`);

/** The address of a page or of a list (`/learn/terms/yin-yang`); relative to the language, like every route. */
export const hrefOf = (type: LearnType, id?: string): string => `/learn/${infoOf(type).path}${id === undefined ? "" : `/${id}`}`;
