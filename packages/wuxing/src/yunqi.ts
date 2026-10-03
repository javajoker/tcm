/**
 * 五運六氣 (yunqi) — the classical, person-independent model of how a year's stem and branch bias the
 * climate (《素問》運氣七篇: 天元紀·五運行·六微旨·氣交變·五常政·六元正紀·至真要).
 *
 *   歲運 (central/annual phase)  from the year STEM   : 甲己土 乙庚金 丙辛水 丁壬木 戊癸火;
 *                                陽 stem → 太過 (excess), 陰 stem → 不及 (deficient)
 *   司天 / 在泉 (above / below)  from the year BRANCH : 子午 少陰君火 · 丑未 太陰濕土 · 寅申 少陽相火 ·
 *                                卯酉 陽明燥金 · 辰戌 太陽寒水 · 巳亥 厥陰風木; 在泉 is the opposite qi
 *   主氣 (host qi)  six fixed steps of the year:  厥陰風木 → 少陰君火 → 少陽相火 → 太陰濕土 → 陽明燥金 → 太陽寒水
 *   客氣 (guest qi) six steps that rotate with the year:  厥陰 → 少陰 → 太陰 → 少陽 → 陽明 → 太陽,
 *                   placed so that 司天 is the 3rd step and 在泉 the 6th
 *
 * A yunqi year starts at 大寒 (the 初之氣 begins there), not at 立春 as the BaZi year does — the two
 * calendars are kept apart on purpose.
 *
 * Epistemic status: this is classical TCM doctrine but its predictive power is disputed. The engine
 * treats it as a bounded prior on susceptibility (caps in profile.ts), never as diagnostic evidence.
 */

import { actingRelation, branchAt, mod, stemAt, stemIndex } from "./ganzhi.ts";
import { apparentSolarLongitude } from "./astro/sun.ts";
import { solveSolarTerm } from "./astro/solarTerms.ts";
import { asTT, toJulianDay, fromJulianDay } from "./astro/julian.ts";
import { utToTT } from "./astro/deltaT.ts";
import { norm360 } from "./astro/math.ts";
import type { Branch, Element, Stem } from "./types.ts";

export type SixQi = "厥陰風木" | "少陰君火" | "太陰濕土" | "少陽相火" | "陽明燥金" | "太陽寒水";
export type Evil = "風" | "寒" | "暑" | "濕" | "燥" | "火";

/** Guest-qi rotation order (一陰二陰三陰一陽二陽三陽). Index arithmetic below relies on this order. */
export const SIX_QI_ORDER: readonly SixQi[] = Object.freeze([
  "厥陰風木", "少陰君火", "太陰濕土", "少陽相火", "陽明燥金", "太陽寒水",
]);

/** Host qi, steps 1–6. */
export const HOST_QI: readonly SixQi[] = Object.freeze([
  "厥陰風木", "少陰君火", "少陽相火", "太陰濕土", "陽明燥金", "太陽寒水",
]);

export const QI_ELEMENT: Readonly<Record<SixQi, Element>> = Object.freeze({
  厥陰風木: "木", 少陰君火: "火", 太陰濕土: "土", 少陽相火: "火", 陽明燥金: "金", 太陽寒水: "水",
});

/** Pathogenic-qi (六邪) counterpart: ministerial fire is 暑, sovereign fire is 火 (熱). */
export const QI_EVIL: Readonly<Record<SixQi, Evil>> = Object.freeze({
  厥陰風木: "風", 少陰君火: "火", 太陰濕土: "濕", 少陽相火: "暑", 陽明燥金: "燥", 太陽寒水: "寒",
});

/** 司天 by year branch (《素問·天元紀大論》: 子午之歲，上見少陰 …). */
export const SITIAN_OF_BRANCH: Readonly<Record<Branch, SixQi>> = Object.freeze({
  子: "少陰君火", 午: "少陰君火", 丑: "太陰濕土", 未: "太陰濕土", 寅: "少陽相火", 申: "少陽相火",
  卯: "陽明燥金", 酉: "陽明燥金", 辰: "太陽寒水", 戌: "太陽寒水", 巳: "厥陰風木", 亥: "厥陰風木",
});

export type SuiYunKind = "太過" | "不及";
export interface SuiYun { readonly element: Element; readonly kind: SuiYunKind }

/** 歲運 from the year stem (《素問·天元紀大論》: 甲己之歲，土運統之 …). */
export function suiYunOf(stem: Stem): SuiYun {
  const idx = stemIndex(stem);
  const element = (["土", "金", "水", "木", "火"] as const)[idx % 5] as Element;   // 甲己 土, 乙庚 金, 丙辛 水, 丁壬 木, 戊癸 火
  return { element, kind: idx % 2 === 0 ? "太過" : "不及" };
}

export function zaiQuanOf(siTian: SixQi): SixQi {
  return SIX_QI_ORDER[mod(SIX_QI_ORDER.indexOf(siTian) + 3, 6)] as SixQi;
}

/** Guest qi of step k (1–6): 司天 sits at step 3 and 在泉 at step 6. */
export function guestQiOf(siTian: SixQi, step: number): SixQi {
  return SIX_QI_ORDER[mod(SIX_QI_ORDER.indexOf(siTian) - 2 + (step - 1), 6)] as SixQi;
}

export interface YunqiYear {
  readonly year: number;
  readonly stem: Stem;
  readonly branch: Branch;
  readonly suiYun: SuiYun;
  readonly siTian: SixQi;
  readonly zaiQuan: SixQi;
  /** Guest qi of steps 1–6. */
  readonly guestQi: readonly SixQi[];
}

/** Yunqi of a (大寒-based) year number. */
export function yunqiOfYear(year: number): YunqiYear {
  const stem = stemAt(year - 4);
  const branch = branchAt(year - 4);
  const siTian = SITIAN_OF_BRANCH[branch];
  return {
    year, stem, branch, suiYun: suiYunOf(stem), siTian, zaiQuan: zaiQuanOf(siTian),
    guestQi: Object.freeze([1, 2, 3, 4, 5, 6].map((k) => guestQiOf(siTian, k))),
  };
}

/** UT instant of 大寒 (λ = 300°) in a Gregorian year — the start of that yunqi year. */
export function daHanOf(year: number): number {
  const guess = toJulianDay({ year, month: 1, day: 20, hour: 0, minute: 0, second: 0 });
  return solveSolarTerm(300, asTT(utToTT(guess))).jdUT;
}

/** The yunqi year containing an instant (changes at 大寒). */
export function yunqiYearNumberAt(jdUT: number): number {
  const y = fromJulianDay(jdUT).year;
  return jdUT >= daHanOf(y) ? y : y - 1;
}

/** Step of the year (1–6) from the apparent solar longitude: 初 300–0°, 二 0–60°, 三 60–120°, 四 120–180°, 五 180–240°, 終 240–300°. */
export function stepOfLongitude(lambda: number): number {
  return Math.floor(norm360(lambda - 300) / 60) + 1;
}

export interface YunqiMoment {
  readonly yunqi: YunqiYear;
  readonly step: number;
  readonly hostQi: SixQi;
  readonly guestQi: SixQi;
  /** How the guest qi sits on the host qi (客主加臨) by element relation. */
  readonly relation: "same" | "guestGeneratesHost" | "hostGeneratesGuest" | "guestControlsHost" | "hostControlsGuest";
}


export function yunqiAt(jdUT: number): YunqiMoment {
  const yunqi = yunqiOfYear(yunqiYearNumberAt(jdUT));
  const lambda = apparentSolarLongitude(asTT(utToTT(jdUT)));
  const step = stepOfLongitude(lambda);
  const hostQi = HOST_QI[step - 1] as SixQi;
  const guestQi = yunqi.guestQi[step - 1] as SixQi;
  const rel = actingRelation(QI_ELEMENT[guestQi], QI_ELEMENT[hostQi]);
  const back = actingRelation(QI_ELEMENT[hostQi], QI_ELEMENT[guestQi]);
  const relation: YunqiMoment["relation"] =
    rel === "同" ? "same" : rel === "生" ? "guestGeneratesHost" : rel === "克" ? "guestControlsHost"
      : back === "生" ? "hostGeneratesGuest" : "hostControlsGuest";
  return { yunqi, step, hostQi, guestQi, relation };
}
