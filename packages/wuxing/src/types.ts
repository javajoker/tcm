/**
 * Core vocabulary of the wuxing engine.
 *
 * Characters are used directly as literal types (no English alias layer): every concept in this
 * domain has one exact Chinese name and a translation layer would only add ambiguity.
 * All names are Traditional script, matching the app's default locale.
 */

export const ELEMENTS = ["木", "火", "土", "金", "水"] as const;
export type Element = (typeof ELEMENTS)[number];

export const POLARITIES = ["陽", "陰"] as const;
export type Polarity = (typeof POLARITIES)[number];

export const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;
export type Stem = (typeof STEMS)[number];

export const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;
export type Branch = (typeof BRANCHES)[number];

/** Position of a hidden stem inside its host branch. */
export type HiddenRole = "本氣" | "中氣" | "餘氣";

export interface Pillar {
  readonly stem: Stem;
  readonly branch: Branch;
}

export type ElementVector = Record<Element, number>;

/** Sex at birth. Only used to decide the direction of the 大運 sequence. */
export type Sex = "male" | "female";

/**
 * How births between 23:00 and 24:00 (true solar time) are assigned.
 *  - lateZiNextDay (default): the day pillar advances at 23:00.
 *  - earlyZiSameDay: the day pillar advances at 00:00; the hour stem is derived from the same day.
 *  - split: day pillar stays, but the hour stem is derived from the next day's stem.
 */
export type ZiHourRule = "lateZiNextDay" | "earlyZiSameDay" | "split";

export function zeroVector(): ElementVector {
  return { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
}

export function sumVector(v: Readonly<ElementVector>): number {
  return ELEMENTS.reduce((acc, e) => acc + v[e], 0);
}
