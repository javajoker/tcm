/**
 * TCM-facing layer: turns the engine's element distributions into a PERSONAL REFERENCE PANEL — the
 * "normal body chart" for this person at this moment — from three independent blocks:
 *
 *   先天 (innate)        element shares of the natal chart (BaZi weights → propagation)
 *   流年 (annual)        the year's element-share shift (BaZi 流年, neutral-year corrected)
 *                        + 五運六氣 (歲運 太過/不及, 司天/在泉)         — classical, person-independent
 *   時令 (seasonal)      the commanding element of the current season (四氣調神)
 *
 * Each block is a vector of "degrees" on the same ±3 scale as the diagnostic panel (1 = mild, 2 =
 * moderate, 3 = marked) and each has its own CAP. The sum is capped again. Priors therefore shift
 * what counts as normal; they are never evidence of disease (the diagnostic panel is built from
 * symptoms and signs only). Epistemic status: the BaZi block is a cultural-tradition prior with no
 * clinical validation, the yunqi block is classical doctrine with disputed predictive power; both are
 * bounded, switchable, and reported separately so a user (or reviewer) can see each contribution.
 *
 * The diagnostic engine later computes two offsets (analyzeOffset, SOP §8): observed − 0, the primary
 * deviation from the average healthy person, and observed − reference, the deviation from this person's
 * own expected state. Only the first drives diagnosis, so a prior can never explain symptoms away.
 */

import { CONTROLS, GENERATES, controlledBy, generatedBy } from "./ganzhi.ts";
import { apparentSolarLongitude } from "./astro/sun.ts";
import { solveSolarTerm } from "./astro/solarTerms.ts";
import { asTT } from "./astro/julian.ts";
import { utToTT } from "./astro/deltaT.ts";
import { norm360 } from "./astro/math.ts";
import { yearPillarOf } from "./chart.ts";
import { evaluateYear, type BaseChart } from "./temporal.ts";
import { QI_ELEMENT, QI_EVIL, yunqiAt, type Evil, type YunqiMoment } from "./yunqi.ts";
import { ELEMENTS, zeroVector, type Element, type ElementVector } from "./types.ts";

// ── five-phase correspondences used by the engine (full table lives in data/wuxing) ──────────

export const ZANG_OF: Readonly<Record<Element, string>> = Object.freeze({ 木: "肝", 火: "心", 土: "脾", 金: "肺", 水: "腎" });
export const FU_OF: Readonly<Record<Element, string>> = Object.freeze({ 木: "膽", 火: "小腸", 土: "胃", 金: "大腸", 水: "膀胱" });
export const SEASON_NAME_OF: Readonly<Record<Element, string>> = Object.freeze({ 木: "春", 火: "夏", 土: "長夏", 金: "秋", 水: "冬" });
export const EVILS: readonly Evil[] = Object.freeze(["風", "寒", "暑", "濕", "燥", "火"]);

// ── parameters ───────────────────────────────────────────────────────────────

export type SeasonModel = "changxia" | "tuwang18";

export interface ProfileParams {
  /** Even distribution: each element holds 20 % of the total. */
  readonly baseline: number;
  /** Relative-deviation bands, r = (share − baseline) / baseline. */
  readonly bands: { readonly missingShare: number; readonly weak: number; readonly strong: number; readonly excess: number };
  readonly innate: { readonly gain: number; readonly cap: number };
  readonly annualBazi: { readonly gain: number; readonly cap: number };
  readonly yunqi: { readonly suiYunPrimary: number; readonly suiYunSecondary: number; readonly siTian: number; readonly zaiQuan: number; readonly cap: number };
  readonly season: { readonly dominant: number; readonly controlled: number };
  /** Cap on the summed reference shift of any element. */
  readonly totalCap: number;
  readonly seasonModel: SeasonModel;
  /** Weights of each qi source in the environmental pathogenic-qi (六邪) vector, 0–1 total. */
  readonly climate: { readonly siTian: number; readonly zaiQuan: number; readonly guest: number; readonly host: number };
  readonly enable: { readonly innate: boolean; readonly annualBazi: boolean; readonly yunqi: boolean; readonly season: boolean };
}

/** [calibrate] — every number here is a placeholder awaiting practitioner calibration. */
export const DEFAULT_PROFILE_PARAMS: ProfileParams = Object.freeze({
  baseline: 0.2,
  bands: Object.freeze({ missingShare: 0.05, weak: -0.35, strong: 0.35, excess: 0.75 }),
  innate: Object.freeze({ gain: 1.0, cap: 1.0 }),
  annualBazi: Object.freeze({ gain: 1.0, cap: 0.75 }),
  yunqi: Object.freeze({ suiYunPrimary: 0.5, suiYunSecondary: 0.25, siTian: 0.3, zaiQuan: 0.2, cap: 0.5 }),
  season: Object.freeze({ dominant: 0.5, controlled: -0.125 }),
  totalCap: 1.5,
  seasonModel: "changxia",
  climate: Object.freeze({ siTian: 0.4, zaiQuan: 0.2, guest: 0.3, host: 0.1 }),
  enable: Object.freeze({ innate: true, annualBazi: true, yunqi: true, season: true }),
});

const clamp = (x: number, cap: number): number => Math.max(-cap, Math.min(cap, x));
const cloneVec = (v: Readonly<ElementVector>): ElementVector => ({ ...v });

// ── innate ────────────────────────────────────────────────────────────────

export type ElementBand = "缺" | "偏弱" | "平" | "偏旺" | "過旺";

export interface InnateProfile {
  readonly shares: Readonly<ElementVector>;
  /** r = (share − 0.2) / 0.2: 0 = even, −1 = absent, +1 = double the even share. */
  readonly relative: Readonly<ElementVector>;
  readonly band: Readonly<Record<Element, ElementBand>>;
  /** Capped degree contribution to the reference panel. */
  readonly degree: Readonly<ElementVector>;
  readonly polarityShares: Readonly<Record<"陽" | "陰", number>>;
  readonly evenness: number;
  readonly missing: readonly Element[];
}

export function bandOf(share: number, p: ProfileParams): ElementBand {
  const r = (share - p.baseline) / p.baseline;
  if (share < p.bands.missingShare) return "缺";
  if (r < p.bands.weak) return "偏弱";
  if (r > p.bands.excess) return "過旺";
  if (r > p.bands.strong) return "偏旺";
  return "平";
}

export function innateProfile(base: BaseChart, p: ProfileParams = DEFAULT_PROFILE_PARAMS): InnateProfile {
  const shares = base.solved.shares;
  const relative = zeroVector();
  const degree = zeroVector();
  const band = {} as Record<Element, ElementBand>;
  for (const e of ELEMENTS) {
    relative[e] = (shares[e] - p.baseline) / p.baseline;
    degree[e] = clamp(relative[e] * p.innate.gain, p.innate.cap);
    band[e] = bandOf(shares[e], p);
  }
  return {
    shares, relative, band, degree,
    polarityShares: base.solved.polarityShares, evenness: base.solved.evenness,
    missing: ELEMENTS.filter((e) => band[e] === "缺"),
  };
}

// ── season ────────────────────────────────────────────────────────────────

export interface SeasonInfo {
  readonly element: Element;
  readonly name: string;
  readonly model: SeasonModel;
  readonly longitude: number;
}

const FOUR_LI_LONGITUDES = [315, 45, 135, 225] as const;   // 立春 立夏 立秋 立冬

/**
 * The commanding season (四氣調神: 春肝 夏心 長夏脾 秋肺 冬腎).
 *   changxia : 春 [立春,立夏) · 夏 [立夏,小暑) · 長夏 [小暑,立秋) · 秋 [立秋,立冬) · 冬 [立冬,立春)
 *   tuwang18 : four seasons, with 土 commanding the last 18 days before each of 立春 立夏 立秋 立冬
 * Which is right is a school decision (長夏's extent is disputed), hence a parameter.
 */
export function seasonAt(jdUT: number, model: SeasonModel = "changxia"): SeasonInfo {
  const lambda = apparentSolarLongitude(asTT(utToTT(jdUT)));
  const inRange = (from: number, to: number): boolean => norm360(lambda - from) < norm360(to - from);

  if (model === "tuwang18") {
    for (const li of FOUR_LI_LONGITUDES) {
      const guess = utToTT(jdUT) + norm360(li - lambda) / (360 / 365.2421897);
      const next = solveSolarTerm(li, asTT(guess)).jdUT;
      if (next - jdUT <= 18 && next - jdUT >= 0) return { element: "土", name: "土旺", model, longitude: lambda };
    }
    const element: Element = inRange(315, 45) ? "木" : inRange(45, 135) ? "火" : inRange(135, 225) ? "金" : "水";
    return { element, name: SEASON_NAME_OF[element], model, longitude: lambda };
  }
  const element: Element = inRange(315, 45) ? "木" : inRange(45, 105) ? "火" : inRange(105, 135) ? "土" : inRange(135, 225) ? "金" : "水";
  return { element, name: SEASON_NAME_OF[element], model, longitude: lambda };
}

function seasonDegrees(season: SeasonInfo, p: ProfileParams): ElementVector {
  const v = zeroVector();
  v[season.element] = p.season.dominant;
  v[CONTROLS[season.element]] += p.season.controlled;   // the dominant element restrains what it controls
  return v;
}

// ── yunqi → element degrees and climate ───────────────────────────────────

function yunqiDegrees(m: YunqiMoment, p: ProfileParams): ElementVector {
  const v = zeroVector();
  const { element, kind } = m.yunqi.suiYun;
  const controlled = CONTROLS[element];
  const controller = controlledBy(element);
  // 《素問·五運行大論》: 氣有餘則制己所勝而侮所不勝；其不及則己所不勝侮而乘之，己所勝輕而侮之。
  if (kind === "太過") {
    v[element] += p.yunqi.suiYunPrimary;
    v[controlled] -= p.yunqi.suiYunSecondary;   // over-restrains what it controls
    v[controller] -= p.yunqi.suiYunSecondary;   // and insults what controls it
  } else {
    v[element] -= p.yunqi.suiYunPrimary;
    v[controller] += p.yunqi.suiYunSecondary;   // its controller over-restrains (乘)
    v[controlled] += p.yunqi.suiYunSecondary;   // what it controls slights it (侮)
  }
  v[QI_ELEMENT[m.yunqi.siTian]] += p.yunqi.siTian;
  v[QI_ELEMENT[m.yunqi.zaiQuan]] += p.yunqi.zaiQuan;
  for (const e of ELEMENTS) v[e] = clamp(v[e], p.yunqi.cap);
  return v;
}

/** Environmental pathogenic-qi tendency (0–1) from the year's 司天/在泉 and the current host/guest qi. */
function climateVector(m: YunqiMoment, p: ProfileParams): Record<Evil, number> {
  const c: Record<Evil, number> = { 風: 0, 寒: 0, 暑: 0, 濕: 0, 燥: 0, 火: 0 };
  c[QI_EVIL[m.yunqi.siTian]] += p.climate.siTian;
  c[QI_EVIL[m.yunqi.zaiQuan]] += p.climate.zaiQuan;
  c[QI_EVIL[m.guestQi]] += p.climate.guest;
  c[QI_EVIL[m.hostQi]] += p.climate.host;
  return c;
}

// ── reference panel ────────────────────────────────────────────────────────

export interface ZangReference {
  readonly zang: string;
  readonly fu: string;
  readonly qi: number;
  readonly yang: number;
  readonly blood: number;
  readonly yin: number;
}

export interface ReferencePanel {
  readonly jdUT: number;
  readonly baziYear: number;
  readonly yunqiYear: number;
  readonly season: SeasonInfo;
  readonly yunqi: YunqiMoment;
  readonly components: {
    readonly innate: Readonly<ElementVector> | null;
    readonly annualBazi: Readonly<ElementVector> | null;
    readonly yunqi: Readonly<ElementVector> | null;
    readonly season: Readonly<ElementVector> | null;
  };
  /** Σ of enabled components, each element capped at ±totalCap. */
  readonly total: Readonly<ElementVector>;
  /** The reference mapped onto the five zang: the norm shifts 氣 and 陽 (function), not 血 and 陰 (substance). */
  readonly zangfu: Readonly<Record<Element, ZangReference>>;
  readonly climate: Readonly<Record<Evil, number>>;
  /** One line per contribution, for the explanation view. */
  readonly trace: readonly string[];
  /** Which blocks were unavailable and why (e.g. no birth data). */
  readonly notes: readonly string[];
}

const fmt = (n: number): string => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2);

/**
 * Reference ("normal for this person, now") panel.
 * `base` may be null when the user gave no birth data: the innate and BaZi-annual blocks are then
 * simply absent and the panel is built from season and yunqi alone.
 */
export function buildReferencePanel(
  base: BaseChart | null, jdUT: number, params: ProfileParams = DEFAULT_PROFILE_PARAMS,
): ReferencePanel {
  const notes: string[] = [];
  const trace: string[] = [];
  const baziYear = yearPillarOf(jdUT).solarYear;
  const season = seasonAt(jdUT, params.seasonModel);
  const yq = yunqiAt(jdUT);

  let innate: ElementVector | null = null;
  let annualBazi: ElementVector | null = null;
  if (params.enable.innate || params.enable.annualBazi) {
    if (base === null) {
      notes.push("No birth data: innate and BaZi-annual blocks omitted.");
    } else {
      if (params.enable.innate) {
        const ip = innateProfile(base, params);
        innate = cloneVec(ip.degree);
        trace.push(`Innate (natal element shares ${ELEMENTS.map((e) => `${e}${(ip.shares[e] * 100).toFixed(0)}%`).join(" ")}): ${ELEMENTS.map((e) => `${e}${fmt(innate![e])}`).join(" ")}`);
      }
      if (params.enable.annualBazi) {
        const ev = evaluateYear(base, baziYear);
        annualBazi = zeroVector();
        for (const e of ELEMENTS) annualBazi[e] = clamp((ev.delta[e] / params.baseline) * params.annualBazi.gain, params.annualBazi.cap);
        trace.push(`Annual BaZi ${ev.annualPillar.stem}${ev.annualPillar.branch} (${baziYear}): ${ELEMENTS.map((e) => `${e}${fmt(annualBazi![e])}`).join(" ")}`);
      }
    }
  }

  const yunqiBlock = params.enable.yunqi ? yunqiDegrees(yq, params) : null;
  if (yunqiBlock !== null) {
    trace.push(`Yunqi ${yq.yunqi.year} ${yq.yunqi.stem}${yq.yunqi.branch}: 歲運 ${yq.yunqi.suiYun.element}${yq.yunqi.suiYun.kind}, 司天 ${yq.yunqi.siTian}, 在泉 ${yq.yunqi.zaiQuan}: ${ELEMENTS.map((e) => `${e}${fmt(yunqiBlock[e])}`).join(" ")}`);
  }
  const seasonBlock = params.enable.season ? seasonDegrees(season, params) : null;
  if (seasonBlock !== null) {
    trace.push(`Season ${season.name} (${season.model}, λ=${season.longitude.toFixed(1)}°): ${ELEMENTS.map((e) => `${e}${fmt(seasonBlock[e])}`).join(" ")}`);
  }

  const total = zeroVector();
  for (const e of ELEMENTS) {
    const sum = (innate?.[e] ?? 0) + (annualBazi?.[e] ?? 0) + (yunqiBlock?.[e] ?? 0) + (seasonBlock?.[e] ?? 0);
    total[e] = clamp(sum, params.totalCap);
  }
  trace.push(`Reference total (cap ±${params.totalCap}): ${ELEMENTS.map((e) => `${e}${fmt(total[e])}`).join(" ")}`);

  const zangfu = {} as Record<Element, ZangReference>;
  for (const e of ELEMENTS) zangfu[e] = { zang: ZANG_OF[e], fu: FU_OF[e], qi: total[e], yang: total[e], blood: 0, yin: 0 };

  return {
    jdUT, baziYear, yunqiYear: yq.yunqi.year, season, yunqi: yq,
    components: { innate, annualBazi, yunqi: yunqiBlock, season: seasonBlock },
    total, zangfu, climate: climateVector(yq, params), trace, notes,
  };
}

// ── offset analysis ──────────────────────────────────────────────────────────

export type Alignment = "aligned" | "opposed" | "neutral";

export interface OffsetAnalysis {
  /** Observed panel on the element axis (degrees), from symptoms and signs only. */
  readonly observed: Readonly<ElementVector>;
  /**
   * PRIMARY: observed − 0, i.e. the deviation from the average healthy person. This is what drives
   * pattern differentiation and treatment direction. It is never reduced by a prior: a constitution
   * or a birth chart that "predicts" weak 木 must not be able to explain real 肝 symptoms away.
   */
  readonly offsetPopulation: Readonly<ElementVector>;
  /** SECONDARY: observed − reference, i.e. how far the person is from THEIR OWN expected state now. */
  readonly offsetPersonal: Readonly<ElementVector>;
  /**
   * Whether the observed deviation points the same way as the reference tendency:
   *   aligned — same sign and |reference| ≥ threshold → likely constitutional/seasonal, favour gentle long-term regulation
   *   opposed — opposite sign                       → against the tendency, worth a second look
   *   neutral — reference is negligible here
   */
  readonly alignment: Readonly<Record<Element, Alignment>>;
}

export function analyzeOffset(
  observed: Readonly<ElementVector>, reference: Pick<ReferencePanel, "total">, threshold = 0.25,
): OffsetAnalysis {
  const offsetPopulation = cloneVec(observed);
  const offsetPersonal = zeroVector();
  const alignment = {} as Record<Element, Alignment>;
  for (const e of ELEMENTS) {
    offsetPersonal[e] = observed[e] - reference.total[e];
    const r = reference.total[e];
    alignment[e] = Math.abs(r) < threshold || Math.abs(observed[e]) < 1e-9 ? "neutral" : Math.sign(r) === Math.sign(observed[e]) ? "aligned" : "opposed";
  }
  return { observed: cloneVec(observed), offsetPopulation, offsetPersonal, alignment };
}

/** Reference panels at "now" and at the start of each of the next `count` seasons (changxia boundaries). */
export function forecastReferencePanels(
  base: BaseChart | null, fromJdUT: number, count: number, params: ProfileParams = DEFAULT_PROFILE_PARAMS,
): ReferencePanel[] {
  const out: ReferencePanel[] = [buildReferencePanel(base, fromJdUT, params)];
  const boundaries = [315, 45, 105, 135, 225] as const;   // 立春 立夏 小暑 立秋 立冬
  let jd = fromJdUT;
  for (let k = 0; k < count; k++) {
    const lambda = apparentSolarLongitude(asTT(utToTT(jd)));
    // nearest boundary strictly ahead of the current longitude
    const ahead = boundaries.map((b) => ({ b, d: norm360(b - lambda) })).filter((x) => x.d > 0.01).sort((a, b) => a.d - b.d)[0];
    if (ahead === undefined) break;
    const guess = utToTT(jd) + ahead.d / (360 / 365.2421897);
    jd = solveSolarTerm(ahead.b, asTT(guess)).jdUT + 0.5;   // half a day in, to be safely inside the season
    out.push(buildReferencePanel(base, jd, params));
  }
  return out;
}

// ── generation/restraint transmission of an offset (傳變) ───────────────────────

export interface TransmissionParams {
  /** Excess element restrains what it controls (制己所勝). */
  readonly excessRestrains: number;
  /** Excess element insults what controls it (侮所不勝) — weaker than 乘. */
  readonly excessInsults: number;
  /** Excess child draws on its mother (子盜母氣). */
  readonly childDrainsMother: number;
  /** Deficient element invites over-restraint by its controller and slighting by what it controls (乘侮) — deepens itself. */
  readonly deficientDeepens: number;
  /** Deficient mother fails to nourish her child (母病及子). */
  readonly motherToChild: number;
}

/** [calibrate] */
export const DEFAULT_TRANSMISSION_PARAMS: TransmissionParams = Object.freeze({
  excessRestrains: 0.3, excessInsults: 0.15, childDrainsMother: 0.15, deficientDeepens: 0.2, motherToChild: 0.25,
});

export interface TransmissionRule {
  readonly rule: "制己所勝" | "侮所不勝" | "子盜母氣" | "乘侮自深" | "母病及子";
  readonly from: Element;
  readonly to: Element;
  readonly amount: number;
  /** Classical anchor, resolved against data/citations. */
  readonly citation: string;
}

export interface TransmissionResult {
  /** Negative = tends to weaken, positive = tends to be relatively over-active. */
  readonly pressure: Readonly<ElementVector>;
  readonly rules: readonly TransmissionRule[];
}

/**
 * Forecast where an offset (e.g. an excess of 木) tends to spread through 生克乘侮 — the logic behind
 * 「見肝之病，知肝傳脾，當先實脾」(《金匱要略》; 《難經·七十七難》). A tendency list for explanation and
 * for choosing which organ to protect; it is not a diagnosis and is not added to the observed panel.
 */
export function transmission(
  deviation: Readonly<ElementVector>, p: TransmissionParams = DEFAULT_TRANSMISSION_PARAMS,
): TransmissionResult {
  const pressure = zeroVector();
  const rules: TransmissionRule[] = [];
  const add = (rule: TransmissionRule["rule"], from: Element, to: Element, amount: number, citation: string): void => {
    pressure[to] += amount;
    rules.push({ rule, from, to, amount, citation });
  };

  for (const e of ELEMENTS) {
    const w = deviation[e];
    if (Math.abs(w) < 1e-9) continue;
    const controlled = CONTROLS[e];
    const controller = controlledBy(e);
    const child = GENERATES[e];
    const mother = generatedBy(e);
    if (w > 0) {
      add("制己所勝", e, controlled, -p.excessRestrains * w, "suwen-067");
      add("侮所不勝", e, controller, -p.excessInsults * w, "suwen-067");
      add("子盜母氣", e, mother, -p.childDrainsMother * w, "nanjing-069");
    } else {
      const m = Math.abs(w);
      add("乘侮自深", e, e, -p.deficientDeepens * m, "suwen-067");
      add("母病及子", e, child, -p.motherToChild * m, "nanjing-069");
    }
  }
  return { pressure, rules: rules.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)) };
}
