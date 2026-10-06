import type { LearnType, TypeInfo } from "./types.ts";

/**
 * The seven kinds of page of the Learn section, in the order the hub lists them. A kind is `available` when its pages exist: the hub, the search and the routes offer only those. PM-13 builds the
 * shell with the glossary terms and the quotations; the other kinds are switched on by the tasks that build them (patterns and constitutions PM-14; formulas, points and foods PM-15).
 */
export const TYPES: readonly TypeInfo[] = [
  { type: "pattern", path: "patterns", adviceLike: false, available: true },
  { type: "constitution", path: "constitutions", adviceLike: false, available: true },
  { type: "formula", path: "formulas", adviceLike: true, available: false },
  { type: "point", path: "points", adviceLike: true, available: false },
  { type: "food", path: "foods", adviceLike: true, available: false },
  { type: "quotation", path: "quotations", adviceLike: false, available: true },
  { type: "term", path: "terms", adviceLike: false, available: true },
];

export const AVAILABLE: readonly TypeInfo[] = TYPES.filter((t) => t.available);
export const infoOf = (type: LearnType): TypeInfo => TYPES.find((t) => t.type === type)!;
export const typeOfPath = (path: string): TypeInfo | undefined => AVAILABLE.find((t) => t.path === path);

/** The address of a page or of a list (`/learn/terms/yin-yang`); relative to the language, like every route. */
export const hrefOf = (type: LearnType, id?: string): string => `/learn/${infoOf(type).path}${id === undefined ? "" : `/${id}`}`;
