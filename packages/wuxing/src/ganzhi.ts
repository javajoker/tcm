/**
 * Stem–branch (干支) tables and algebra. Pure functions, no state, no I/O.
 *
 * Every modulo goes through mod(): JavaScript's % returns negatives for negative operands, and
 * stem–branch arithmetic constantly produces negatives (reverse stepping, years before epoch).
 *
 * Derivable facts are derived (stem element/polarity from index), not hard-coded, and the tests
 * assert them against independent literal tables.
 */

import {
  BRANCHES, ELEMENTS, STEMS,
  type Branch, type Element, type HiddenRole, type Pillar, type Polarity, type Stem,
} from "./types.ts";

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

// ── indices ────────────────────────────────────────────────────────────────

export function stemIndex(s: Stem): number {
  return STEMS.indexOf(s);
}
export function branchIndex(b: Branch): number {
  return BRANCHES.indexOf(b);
}
export function stemAt(i: number): Stem {
  return STEMS[mod(i, 10)] as Stem;
}
export function branchAt(i: number): Branch {
  return BRANCHES[mod(i, 12)] as Branch;
}
export function stepStem(s: Stem, n: number): Stem {
  return stemAt(stemIndex(s) + n);
}
export function stepBranch(b: Branch, n: number): Branch {
  return branchAt(branchIndex(b) + n);
}

// ── stems: element = ⌊index/2⌋, polarity = even index is 陽 ────────────────────

export function elementOf(s: Stem): Element {
  return ELEMENTS[Math.floor(stemIndex(s) / 2)] as Element;
}
export function polarityOf(s: Stem): Polarity {
  return stemIndex(s) % 2 === 0 ? "陽" : "陰";
}

// ── branches ───────────────────────────────────────────────────────────────

/**
 * Hidden stems (藏干), principal → middle → residual. The tuple length is 1 for 子卯酉, 2 for 午亥
 * and 3 for the other seven branches. This is the "standard" variant; some texts give 申 only 庚壬
 * and 亥 壬甲戊 (see docs/wuxing-algorithm.md §3.2).
 */
export const HIDDEN_STEMS: Readonly<Record<Branch, readonly Stem[]>> = Object.freeze({
  子: ["癸"],
  丑: ["己", "癸", "辛"],
  寅: ["甲", "丙", "戊"],
  卯: ["乙"],
  辰: ["戊", "乙", "癸"],
  巳: ["丙", "庚", "戊"],
  午: ["丁", "己"],
  未: ["己", "丁", "乙"],
  申: ["庚", "壬", "戊"],
  酉: ["辛"],
  戌: ["戊", "辛", "丁"],
  亥: ["壬", "甲"],
});

export const HIDDEN_ROLES: readonly HiddenRole[] = ["本氣", "中氣", "餘氣"];

/** Principal element of a branch (= element of its first hidden stem). */
export function branchElement(b: Branch): Element {
  return elementOf((HIDDEN_STEMS[b] as readonly Stem[])[0] as Stem);
}

/**
 * Branch polarity by *qi* (polarity of the principal hidden stem), not by position.
 * 子午巳亥 differ between the two ("體陰用陽"); every interaction in the engine uses the qi polarity
 * because carriers are hidden stems, not branches.
 */
export function branchQiPolarity(b: Branch): Polarity {
  return polarityOf((HIDDEN_STEMS[b] as readonly Stem[])[0] as Stem);
}

// ── five-phase relations ─────────────────────────────────────────────────

/** 生: 木→火→土→金→水→木 */
export const GENERATES: Readonly<Record<Element, Element>> = Object.freeze({
  木: "火", 火: "土", 土: "金", 金: "水", 水: "木",
});
/** 克: 木→土→水→火→金→木 */
export const CONTROLS: Readonly<Record<Element, Element>> = Object.freeze({
  木: "土", 土: "水", 水: "火", 火: "金", 金: "木",
});

/** Element that generates x (reverse lookup; GENERATES[x] is the opposite question). */
export function generatedBy(x: Element): Element {
  return ELEMENTS.find((e) => GENERATES[e] === x) as Element;
}
/** Element that controls x. */
export function controlledBy(x: Element): Element {
  return ELEMENTS.find((e) => CONTROLS[e] === x) as Element;
}

/**
 * Directed acting relation of i on j.
 *  生/克: i acts on j.  同: same element.  無: i does NOT act in this direction (j generates or
 *  controls i) — that effect is accounted for when the pair is visited as (j, i). Counting both
 *  directions in one visit is the classic double-counting bug.
 */
export type ActingRelation = "生" | "克" | "同" | "無";
export function actingRelation(i: Element, j: Element): ActingRelation {
  if (i === j) return "同";
  if (GENERATES[i] === j) return "生";
  if (CONTROLS[i] === j) return "克";
  return "無";
}

// ── sexagenary cycle ────────────────────────────────────────────────────

export function sexagenaryAt(n: number): Pillar {
  const i = mod(n, 60);
  return { stem: stemAt(i), branch: branchAt(i) };
}

/** Stem and branch must share polarity of position (both even or both odd). */
export function isValidPair(stem: Stem, branch: Branch): boolean {
  return mod(stemIndex(stem) - branchIndex(branch), 2) === 0;
}

/** Index in the 60-cycle (0 = 甲子). Chinese-remainder inverse: n = (6·s − 5·b) mod 60. */
export function sexagenaryIndexOf(p: Pillar): number {
  if (!isValidPair(p.stem, p.branch)) {
    throw new RangeError(`${p.stem}${p.branch} is not a valid sexagenary pair`);
  }
  return mod(6 * stemIndex(p.stem) - 5 * branchIndex(p.branch), 60);
}

// ── 五虎遁 / 五鼠遁 ──────────────────────────────────────────────────────

/**
 * 五虎遁: the stem of 寅 month from the year stem (甲己→丙, 乙庚→戊, 丙辛→庚, 丁壬→壬, 戊癸→甲).
 */
export function yinMonthStemOf(yearStem: Stem): Stem {
  return stemAt((stemIndex(yearStem) % 5) * 2 + 2);
}
/** Month stem from the year stem and the (solar-term) month branch. */
export function monthStemOf(yearStem: Stem, monthBranch: Branch): Stem {
  return stepStem(yinMonthStemOf(yearStem), mod(branchIndex(monthBranch) - branchIndex("寅"), 12));
}
/** 五鼠遁: the stem of 子 hour from the day stem (甲己→甲, 乙庚→丙, 丙辛→戊, 丁壬→庚, 戊癸→壬). */
export function ziHourStemOf(dayStem: Stem): Stem {
  return stemAt((stemIndex(dayStem) % 5) * 2);
}
export function hourStemOf(dayStem: Stem, hourBranch: Branch): Stem {
  return stepStem(ziHourStemOf(dayStem), branchIndex(hourBranch));
}

// ── month branches by solar term, 人元司令 ──────────────────────────────

/** Branch of the month opened by each 節, in order of the year (寅 month starts at 立春). */
export const MONTH_BRANCH_ORDER: readonly Branch[] = Object.freeze([
  "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥", "子", "丑",
]);

export interface SilingSegment {
  readonly stem: Stem;
  readonly days: number;
}

/**
 * 人元司令分野 — which hidden stem "commands" at each number of days after the 節. The first segment
 * is often the tail of the previous month's principal qi and may not be hidden in the branch itself
 * (子 卯 午 酉 resolve to the same-element hidden stem; 亥's first 7 days (戊) have no resolution).
 */
export const SILING: Readonly<Record<Branch, readonly SilingSegment[]>> = Object.freeze({
  寅: [{ stem: "戊", days: 7 }, { stem: "丙", days: 7 }, { stem: "甲", days: 16 }],
  卯: [{ stem: "甲", days: 10 }, { stem: "乙", days: 20 }],
  辰: [{ stem: "乙", days: 9 }, { stem: "癸", days: 3 }, { stem: "戊", days: 18 }],
  巳: [{ stem: "戊", days: 5 }, { stem: "庚", days: 9 }, { stem: "丙", days: 16 }],
  午: [{ stem: "丙", days: 10 }, { stem: "己", days: 9 }, { stem: "丁", days: 11 }],
  未: [{ stem: "丁", days: 9 }, { stem: "乙", days: 3 }, { stem: "己", days: 18 }],
  申: [{ stem: "戊", days: 7 }, { stem: "壬", days: 3 }, { stem: "庚", days: 20 }],
  酉: [{ stem: "庚", days: 10 }, { stem: "辛", days: 20 }],
  戌: [{ stem: "辛", days: 9 }, { stem: "丁", days: 3 }, { stem: "戊", days: 18 }],
  亥: [{ stem: "戊", days: 7 }, { stem: "甲", days: 5 }, { stem: "壬", days: 18 }],
  子: [{ stem: "壬", days: 10 }, { stem: "癸", days: 20 }],
  丑: [{ stem: "癸", days: 9 }, { stem: "辛", days: 3 }, { stem: "己", days: 18 }],
});
